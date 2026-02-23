const cron = require('node-cron');
const { google } = require('googleapis');
const axios = require('axios');
const User = require('../models/User');

const getOAuthClient = () => new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'http://localhost:5000/api/platforms/youtube/callback'
);

const autoReplyForUser = async (user) => {
  try {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token: user.youtubeToken,
      refresh_token: user.youtubeRefreshToken
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // Get recent videos
    const videosRes = await youtube.search.list({
      part: 'snippet', forMine: true, type: 'video', maxResults: 5
    });

    const now = Date.now();

    for (const video of videosRes.data.items || []) {
      let commentsRes;
      try {
        commentsRes = await youtube.commentThreads.list({
          part: 'snippet', videoId: video.id.videoId, maxResults: 20
        });
      } catch (e) {
        console.log(`Skipping video ${video.id.videoId} - comments may be disabled`);
        continue;
      }

      for (const thread of commentsRes.data.items || []) {
        const comment = thread.snippet.topLevelComment.snippet;

        // Skip if already replied
        if (thread.snippet.totalReplyCount > 0) continue;

        // Skip if older than 24 hours
        const commentTime = new Date(comment.publishedAt).getTime();
        if (now - commentTime > 24 * 60 * 60 * 1000) continue;

        try {
          // Generate AI reply
          const aiRes = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              model: 'mistralai/mistral-7b-instruct:free',
              max_tokens: 80,
              messages: [{
                role: 'user',
                content: `Write a short friendly YouTube reply (1 sentence only) to: "${comment.textDisplay}" on video "${video.snippet.title}". Just the reply text, nothing else.`
              }]
            },
            {
              headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:5000',
                'X-Title': 'SynapSocial'
              }
            }
          );

          const reply = aiRes.data.choices[0].message.content.trim();

          // Post reply
          await youtube.comments.insert({
            part: 'snippet',
            requestBody: {
              snippet: {
                parentId: thread.id,
                textOriginal: reply
              }
            }
          });

          console.log(`✅ Auto-replied to ${comment.authorDisplayName}: "${reply}"`);

          // Delay to avoid rate limits
          await new Promise(r => setTimeout(r, 1500));

        } catch (replyErr) {
          console.error(`Failed to reply to comment ${thread.id}:`, replyErr.message);
        }
      }
    }
  } catch (err) {
    console.error(`Auto-reply error for ${user.email}:`, err.message);
  }
};

const startYoutubeAutoReplyJob = () => {
  // Runs every 1 minute
  cron.schedule('* * * * *', async () => {
    console.log('🤖 Running YouTube auto-reply job...');
    try {
      const users = await User.find({
        'connectedPlatforms.youtube': true,
        'permissions.youtubeReplyComments': true,
        'youtubeToken': { $exists: true, $ne: null }
      });

      console.log(`Found ${users.length} user(s) with auto-reply enabled`);

      for (const user of users) {
        await autoReplyForUser(user);
      }
    } catch (err) {
      console.error('Cron job error:', err.message);
    }
  });

  console.log('✅ YouTube auto-reply cron job started (runs every 1 min)');
};

module.exports = { startYoutubeAutoReplyJob };