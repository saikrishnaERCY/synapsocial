// server/jobs/autoReplyJob.js
// ✅ Runs every 5 minutes — auto-replies to YouTube comments + Gmail
// Works even when user is logged out / sleeping

const cron = require('node-cron');
const { google } = require('googleapis');
const axios = require('axios');
const User = require('../models/User');

const getYouTubeClient = (user) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_CALLBACK_URL
  );
  oauth2Client.setCredentials({
    access_token: user.youtubeToken,
    refresh_token: user.youtubeRefreshToken,
  });
  return google.youtube({ version: 'v3', auth: oauth2Client });
};

const getGmailClient = (user) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_CALLBACK_URL
  );
  oauth2Client.setCredentials({
    access_token: user.gmailToken,
    refresh_token: user.gmailRefreshToken,
  });
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await User.findByIdAndUpdate(user._id, { $set: { gmailToken: tokens.access_token } });
    }
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

const generateAIReply = async (prompt) => {
  const res = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  return res.data.choices[0].message.content.trim();
};

// ─── YouTube Auto-Reply ───────────────────────────────────────────────
const runYouTubeAutoReply = async () => {
  try {
    // Find users with auto-reply ON and at least one automated video
    const users = await User.find({
      'connectedPlatforms.youtube': true,
      youtubeToken: { $exists: true, $ne: null },
      youtubeAutomatedVideos: { $exists: true, $not: { $size: 0 } },
    });

    for (const user of users) {
      // Check youtubeReplyComments permission
      if (!user.permissions?.youtubeReplyComments) continue;

      const youtube = getYouTubeClient(user);

      for (const videoId of user.youtubeAutomatedVideos) {
        try {
          // Get comments from last 10 minutes
          const commentsRes = await youtube.commentThreads.list({
            part: 'snippet',
            videoId,
            maxResults: 20,
            order: 'time',
          });

          const items = commentsRes.data.items || [];
          const tenMinsAgo = Date.now() - 10 * 60 * 1000;

          for (const item of items) {
            const comment = item.snippet.topLevelComment.snippet;
            const commentTime = new Date(comment.publishedAt).getTime();

            // Only new comments in last 10 mins
            if (commentTime < tenMinsAgo) continue;

            // Skip if already has replies
            if (item.snippet.totalReplyCount > 0) continue;

            // Skip if already replied (stored in DB)
            const alreadyReplied = user.repliedYtCommentIds?.includes(item.id);
            if (alreadyReplied) continue;

            // Generate AI reply
            const reply = await generateAIReply(
              `Write a short friendly YouTube comment reply (1-2 sentences max, no hashtags, 1 emoji) to this comment on a video: "${comment.textDisplay}". Just the reply text.`
            );

            // Post reply
            await youtube.comments.insert({
              part: 'snippet',
              requestBody: {
                snippet: {
                  parentId: item.id,
                  textOriginal: reply,
                },
              },
            });

            // Save replied comment ID to avoid duplicates
            await User.findByIdAndUpdate(user._id, {
              $addToSet: { repliedYtCommentIds: item.id },
            });

            console.log(`✅ [YT Auto-Reply] User ${user.email} replied to comment on video ${videoId}`);

            // Small delay to avoid rate limits
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch (err) {
          console.error(`❌ [YT Auto-Reply] Video ${videoId}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ [YT Auto-Reply Job]', err.message);
  }
};

// ─── Gmail Auto-Reply ─────────────────────────────────────────────────
const runGmailAutoReply = async () => {
  try {
    // Find users with Gmail auto-reply ON and at least one contact
    const users = await User.find({
      'connectedPlatforms.gmail': true,
      gmailToken: { $exists: true, $ne: null },
      gmailAutoReplyContacts: { $exists: true, $not: { $size: 0 } },
    });

    for (const user of users) {
      // Check gmailAutoReply permission
      if (!user.permissions?.gmailAutoReply) continue;

      const gmail = getGmailClient(user);

      try {
        // Get unread inbox emails
        const listRes = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 10,
          q: 'in:inbox is:unread',
        });

        const messages = listRes.data.messages || [];

        for (const msg of messages) {
          // Get email metadata
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject'],
          });

          const fromHeader =
            detail.data.payload.headers.find((h) => h.name === 'From')?.value || '';
          const fromEmail = fromHeader.match(/<(.+)>/)?.[1] || fromHeader;
          const subject =
            detail.data.payload.headers.find((h) => h.name === 'Subject')?.value || '';

          // Check if this sender is in auto-reply contacts
          const isAutoContact = user.gmailAutoReplyContacts.some(
            (c) => fromEmail.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(fromEmail.toLowerCase())
          );
          if (!isAutoContact) continue;

          // Get full email body
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });

          let body = '';
          const extractBody = (part) => {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = Buffer.from(part.body.data, 'base64').toString('utf8');
            } else if (part.parts) {
              part.parts.forEach(extractBody);
            }
          };
          extractBody(full.data.payload);

          // Generate AI reply
          const reply = await generateAIReply(
            `Write a short natural email reply. From: ${fromHeader}, Subject: ${subject}, Email: ${body?.slice(0, 500)}. Write ONLY the reply body. No greeting, no sign-off. Keep it brief and professional.`
          );

          // Send reply
          const emailLines = [
            `To: ${fromEmail}`,
            `Subject: Re: ${subject}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            reply,
          ];
          const raw = Buffer.from(emailLines.join('\r\n'))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw, threadId: full.data.threadId },
          });

          // Mark as read
          await gmail.users.messages.modify({
            userId: 'me',
            id: msg.id,
            requestBody: { removeLabelIds: ['UNREAD'] },
          });

          console.log(`✅ [Gmail Auto-Reply] User ${user.email} replied to ${fromEmail}`);

          // Small delay
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err) {
        console.error(`❌ [Gmail Auto-Reply] User ${user.email}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('❌ [Gmail Auto-Reply Job]', err.message);
  }
};

// ─── Start Cron Jobs ──────────────────────────────────────────────────
const startAutoReplyJobs = () => {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('🤖 Running auto-reply jobs...');
    await runYouTubeAutoReply();
    await runGmailAutoReply();
    console.log('✅ Auto-reply jobs done');
  });

  console.log('✅ Auto-reply cron jobs started (every 5 mins)');
};

module.exports = { startAutoReplyJobs };