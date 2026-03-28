// server/jobs/autoReplyJob.js
// Runs every 5 mins — auto-replies YouTube comments + Gmail
// Works 24/7 even when users are logged out / sleeping

const cron = require('node-cron');
const { google } = require('googleapis');
const axios = require('axios');
const User = require('../models/User');

// ── OAuth clients ─────────────────────────────────────────────────────
const getYTOAuth = (user) => {
  const client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_CALLBACK_URL
  );
  client.setCredentials({
    access_token: user.youtubeToken,
    refresh_token: user.youtubeRefreshToken,
  });
  // Auto-save refreshed token
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await User.findByIdAndUpdate(user._id, { $set: { youtubeToken: tokens.access_token } });
      console.log(`🔄 [YT] Refreshed token for ${user.email}`);
    }
  });
  return client;
};

const getGmailOAuth = (user) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_CALLBACK_URL
  );
  client.setCredentials({
    access_token: user.gmailToken,
    refresh_token: user.gmailRefreshToken,
  });
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await User.findByIdAndUpdate(user._id, { $set: { gmailToken: tokens.access_token } });
      console.log(`🔄 [Gmail] Refreshed token for ${user.email}`);
    }
  });
  return client;
};

// ── AI reply generator ────────────────────────────────────────────────
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

// ── YouTube Auto-Reply ────────────────────────────────────────────────
const runYouTubeAutoReply = async () => {
  // Find users who have: youtube connected + token + at least 1 automated video + permission ON
  const users = await User.find({
    'connectedPlatforms.youtube': true,
    youtubeToken: { $exists: true, $ne: null },
    youtubeRefreshToken: { $exists: true, $ne: null },
    'permissions.youtubeReplyComments': true,
    youtubeAutomatedVideos: { $exists: true, $not: { $size: 0 } },
  });

  console.log(`[YT Auto-Reply] Found ${users.length} users with automation ON`);

  for (const user of users) {
    try {
      const oauthClient = getYTOAuth(user);
      const youtube = google.youtube({ version: 'v3', auth: oauthClient });

      for (const videoId of user.youtubeAutomatedVideos) {
        try {
          console.log(`[YT] Checking video ${videoId} for user ${user.email}`);

          const commentsRes = await youtube.commentThreads.list({
            part: 'snippet',
            videoId,
            maxResults: 20,
            order: 'time',
          });

          const items = commentsRes.data.items || [];
          // Only check comments from last 10 minutes
          const tenMinsAgo = Date.now() - 10 * 60 * 1000;

          for (const item of items) {
            const comment = item.snippet.topLevelComment.snippet;
            const commentTime = new Date(comment.publishedAt).getTime();

            // Skip old comments
            if (commentTime < tenMinsAgo) continue;

            // Skip if already has replies
            if (item.snippet.totalReplyCount > 0) continue;

            // Skip if we already replied (stored in DB)
            const alreadyReplied = (user.repliedYtCommentIds || []).includes(item.id);
            if (alreadyReplied) continue;

            console.log(`[YT] New comment found: "${comment.textDisplay.slice(0, 50)}"`);

            // Generate AI reply
            const reply = await generateAIReply(
              `Write a short friendly YouTube comment reply (1-2 sentences, 1 emoji at end, no hashtags) to this comment: "${comment.textDisplay}". Just the reply text only.`
            );

            // Post the reply
            await youtube.comments.insert({
              part: 'snippet',
              requestBody: {
                snippet: {
                  parentId: item.id,
                  textOriginal: reply,
                },
              },
            });

            // Mark as replied in DB so we never double-reply
            await User.findByIdAndUpdate(user._id, {
              $addToSet: { repliedYtCommentIds: item.id },
            });

            console.log(`✅ [YT Auto-Reply] Replied to comment on video ${videoId}: "${reply}"`);
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch (err) {
          console.error(`❌ [YT] Video ${videoId} error: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`❌ [YT Auto-Reply] User ${user.email}: ${err.message}`);
    }
  }
};

// ── Gmail Auto-Reply ──────────────────────────────────────────────────
const runGmailAutoReply = async () => {
  // Find users who have: gmail connected + token + at least 1 contact + permission ON
  const users = await User.find({
    'connectedPlatforms.gmail': true,
    gmailToken: { $exists: true, $ne: null },
    gmailRefreshToken: { $exists: true, $ne: null },
    'permissions.gmailAutoReply': true,
    gmailAutoReplyContacts: { $exists: true, $not: { $size: 0 } },
  });

  console.log(`[Gmail Auto-Reply] Found ${users.length} users with automation ON`);

  for (const user of users) {
    try {
      const oauthClient = getGmailOAuth(user);
      const gmail = google.gmail({ version: 'v1', auth: oauthClient });

      // Get unread inbox emails
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 10,
        q: 'in:inbox is:unread',
      });

      const messages = listRes.data.messages || [];
      console.log(`[Gmail] User ${user.email}: ${messages.length} unread emails`);

      for (const msg of messages) {
        try {
          // Get sender info
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject'],
          });

          const fromHeader = detail.data.payload.headers.find((h) => h.name === 'From')?.value || '';
          const fromEmail = fromHeader.match(/<(.+)>/)?.[1] || fromHeader.trim();
          const subject = detail.data.payload.headers.find((h) => h.name === 'Subject')?.value || '';

          // Check if sender is in auto-reply contacts list
          const isAutoContact = user.gmailAutoReplyContacts.some(
            (c) =>
              fromEmail.toLowerCase().includes(c.toLowerCase()) ||
              c.toLowerCase().includes(fromEmail.toLowerCase())
          );

          if (!isAutoContact) {
            console.log(`[Gmail] Skipping ${fromEmail} — not in auto-reply contacts`);
            continue;
          }

          console.log(`[Gmail] Auto-replying to ${fromEmail} — Subject: ${subject}`);

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
            `Write a short natural email reply.
From: ${fromHeader}
Subject: ${subject}
Email body: ${body?.slice(0, 500)}

Rules: Write ONLY the reply body text. No greeting like "Dear...", no sign-off. Keep it concise and professional.`
          );

          // Build raw email
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

          // Send reply
          await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw, threadId: full.data.threadId },
          });

          // Mark as read so we don't reply again
          await gmail.users.messages.modify({
            userId: 'me',
            id: msg.id,
            requestBody: { removeLabelIds: ['UNREAD'] },
          });

          console.log(`✅ [Gmail Auto-Reply] Sent reply to ${fromEmail}`);
          await new Promise((r) => setTimeout(r, 2000));

        } catch (err) {
          console.error(`❌ [Gmail] Message error: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`❌ [Gmail Auto-Reply] User ${user.email}: ${err.message}`);
    }
  }
};

// ── Start cron ────────────────────────────────────────────────────────
const startAutoReplyJobs = () => {
  // Run immediately once on startup to verify it works
  console.log('🤖 Running auto-reply jobs on startup...');
  runYouTubeAutoReply().catch(console.error);
  runGmailAutoReply().catch(console.error);

  // Then run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log(`🤖 [${new Date().toISOString()}] Running auto-reply cron...`);
    await runYouTubeAutoReply().catch(console.error);
    await runGmailAutoReply().catch(console.error);
    console.log('✅ Cron done');
  });

  console.log('✅ Auto-reply cron started — runs every 5 mins');
};

module.exports = { startAutoReplyJobs };