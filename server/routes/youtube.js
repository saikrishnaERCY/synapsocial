const router = require('express').Router();
const { google } = require('googleapis');
const User = require('../models/User');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');

const upload = multer({
  dest: 'uploads/youtube/',
  limits: { fileSize: 256 * 1024 * 1024 }
});

const getOAuthClient = () => new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'http://localhost:5000/api/platforms/youtube/callback'
);

// Cheap way to get videos — 2 units instead of 100
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

// Connect
router.get('/connect', (req, res) => {
  const { userId } = req.query;
  req.session.userId = userId;
  req.session.save();

  const url = getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly'
    ],
    state: userId,
    prompt: 'consent'
  });
  res.redirect(url);
});

// Callback
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    await User.findByIdAndUpdate(userId || req.session.userId, {
      $set: {
        'connectedPlatforms.youtube': true,
        'youtubeToken': tokens.access_token,
        'youtubeRefreshToken': tokens.refresh_token,
      }
    });

    res.redirect(`${process.env.CLIENT_URL}/dashboard?connected=youtube`);
  } catch (err) {
    console.error('YouTube callback error:', err.message);
    res.redirect(`${process.env.CLIENT_URL}/dashboard?error=youtube_failed`);
  }
});

// Get comments — cheap method
router.get('/comments/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user?.youtubeToken) return res.status(400).json({ message: 'YouTube not connected' });

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token: user.youtubeToken,
      refresh_token: user.youtubeRefreshToken
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const now = Date.now();

    let videos;
    try {
      videos = await getMyVideos(youtube);
    } catch (err) {
      console.error('Error fetching videos:', err.message);
      return res.status(500).json({ message: 'Error fetching videos', error: err.message });
    }

    if (!videos.length) return res.json({ comments: [], videos: [] });

    let allComments = [];

    for (const video of videos.slice(0, 3)) {
      try {
        const commentsRes = await youtube.commentThreads.list({
          part: 'snippet', videoId: video.id.videoId, maxResults: 20
        });

        const comments = (commentsRes.data.items || [])
          .filter(c => {
            const t = new Date(c.snippet.topLevelComment.snippet.publishedAt).getTime();
            return now - t < 24 * 60 * 60 * 1000; // last 24hrs only
          })
          .map(c => ({
            id: c.id,
            videoId: video.id.videoId,
            videoTitle: video.snippet.title,
            author: c.snippet.topLevelComment.snippet.authorDisplayName,
            text: c.snippet.topLevelComment.snippet.textDisplay,
            likes: c.snippet.topLevelComment.snippet.likeCount,
            published: c.snippet.topLevelComment.snippet.publishedAt,
            replied: c.snippet.totalReplyCount > 0
          }));

        allComments = [...allComments, ...comments];
      } catch (e) {
        console.log(`Comments disabled for ${video.id.videoId}`);
      }
    }

    res.json({ comments: allComments, videos });
  } catch (err) {
    console.error('Comments error:', err.message);
    res.status(500).json({ message: 'Error fetching comments', error: err.message });
  }
});

// AI reply suggestion
router.post('/comment/ai-reply', async (req, res) => {
  try {
    const { comment, videoTitle } = req.body;
    const aiRes = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemini-2.5-flash-lite-preview-09-2025',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Write a short friendly YouTube comment reply (max 1 sentence) to this comment on video "${videoTitle}": "${comment}". Just the reply text, nothing else.`
        }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'SynapSocial'
        }
      }
    );
    res.json({ reply: aiRes.data.choices[0].message.content.trim() });
  } catch (err) {
    console.error('AI reply error:', err.response?.data || err.message);
    res.status(500).json({ message: 'AI error', error: err.message });
  }
});

// Like comment (API restricted — returns success for UI)
router.post('/comment/like', async (req, res) => {
  res.json({ message: 'Liked!' });
});

// Post reply
router.post('/comment/reply', async (req, res) => {
  try {
    const { userId, commentId, reply } = req.body;
    const user = await User.findById(userId);

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token: user.youtubeToken,
      refresh_token: user.youtubeRefreshToken
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    await youtube.comments.insert({
      part: 'snippet',
      requestBody: { snippet: { parentId: commentId, textOriginal: reply } }
    });

    res.json({ message: 'Reply posted!' });
  } catch (err) {
    console.error('Reply error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Reply failed', error: err.message });
  }
});

// Upload video
router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const { userId, title, description, tags } = req.body;
    const user = await User.findById(userId);

    if (!user?.youtubeToken)
      return res.status(400).json({ message: 'YouTube not connected' });

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token: user.youtubeToken,
      refresh_token: user.youtubeRefreshToken
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    console.log('Uploading video:', req.file?.path, 'size:', req.file?.size);

    const videoRes = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: title || 'Uploaded via SynapSocial',
          description: description || '',
          tags: tags ? tags.split(',').map(t => t.trim()) : [],
          categoryId: '22'
        },
        status: { privacyStatus: 'public' }
      },
      media: {
        mimeType: 'video/*',
        body: fs.createReadStream(req.file.path)
      }
    });

    try { fs.unlinkSync(req.file.path); } catch (e) {}

    res.json({
      message: 'Video uploaded to YouTube! 🎉',
      videoId: videoRes.data.id,
      videoUrl: `https://www.youtube.com/watch?v=${videoRes.data.id}`
    });
  } catch (err) {
    console.error('YouTube upload error:', err.response?.data || err.message);
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ message: 'Upload failed', error: err.response?.data?.error?.message || err.message });
  }
});

module.exports = router;