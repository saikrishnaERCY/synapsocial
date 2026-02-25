const cron = require('node-cron');
const { google } = require('googleapis');
const axios = require('axios');
const User = require('../models/User');

const getOAuthClient = () => new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'http://localhost:5000/api/platforms/youtube/callback'
);

// Cheap: 2 units instead of 100
const getMyVideos = async (youtube) => {
  const channelRes = await youtube.channels.list({
    part: 'contentDetails', mine: true
  });
  const uploadsId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) return [];

  const playlistRes = await youtube.playlistItems.list({
    part: 'snippet', playlistId: uploadsId, maxResults: 5
  });

  return (playlistRes.data.items || []).map(item => ({
    id: { videoId: item.snippet.resourceId.videoId },
    snippet: { title: item.snippet.title }
  }));
};

const autoReplyForUser = async (user) => {
  try {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token: user.youtubeToken,
      refresh_token: user.youtubeRefreshToken
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const now = Date.now();

    const videos = await getMyVideos(youtube);
    if (!videos.length) return;

    for (const video of videos) {
      let commentsRes;
      try {
        commentsRes = await youtube.commentThreads.list({
          part: 'snippet', videoId: video.id.videoId, maxResults: 20
        });
      } catch (e) {
        console.log(`Comments disabled for ${video.id.videoId}`);
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

          await youtube.comments.insert({
            part: 'snippet',
            requestBody: {
              snippet: { parentId: thread.id, textOriginal: reply }
            }
          });

          console.log(`✅ Auto-replied to ${comment.authorDisplayName}: "${reply}"`);
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
  cron.schedule('*/30 * * * *', async () => {
    console.log('🤖 Running YouTube auto-reply job...');
    try {
      const users = await User.find({
        'connectedPlatforms.youtube': true,
        'permissions.youtubeReplyComments': true,
        'youtubeToken': { $exists: true, $ne: null }
      });

      if (!users.length) return;
      console.log(`Found ${users.length} user(s) with auto-reply enabled`);

      for (const user of users) {
        await autoReplyForUser(user);
      }
    } catch (err) {
      console.error('Cron job error:', err.message);
    }
  });

  console.log('✅ YouTube auto-reply cron job started (every 30 min, quota-safe)');
};

module.exports = { startYoutubeAutoReplyJob };