const router = require('express').Router();
const axios = require('axios');
const User = require('../models/User');

const FB_BASE = 'https://graph.facebook.com/v18.0';

const getToken = async (userId) => {
  const user = await User.findById(userId);
  const token = user?.instagramToken || process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = user?.instagramAccountId || process.env.INSTAGRAM_ACCOUNT_ID;
  if (!token || !accountId) throw new Error('Instagram not connected');
  return { token, accountId, user };
};

// Connect via token
router.post('/connect', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    // Try to get account ID from the token
    let accountId = process.env.INSTAGRAM_ACCOUNT_ID;
    try {
      const igInfo = await axios.get(`${FB_BASE}/me`, {
        params: { access_token: accessToken, fields: 'id,username' }
      });
      if (igInfo.data.id) accountId = igInfo.data.id;
    } catch (e) {
      // use env fallback
    }

    await User.findByIdAndUpdate(userId, {
      $set: {
        'connectedPlatforms.instagram': true,
        'instagramToken': accessToken,
        'instagramAccountId': accountId,
      }
    });

    res.json({ message: 'Instagram connected! ✅', accountId });
  } catch (err) {
    console.error('IG connect error:', err.message);
    res.status(500).json({ message: 'Connection failed: ' + err.message });
  }
});

// Disconnect
router.post('/disconnect', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.body.userId, {
      $set: { 'connectedPlatforms.instagram': false, 'instagramToken': null, 'instagramAccountId': null }
    });
    res.json({ message: 'Disconnected' });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

// Post Image
router.post('/post/image', async (req, res) => {
  try {
    const { userId, caption, imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ message: 'imageUrl is required (must be public URL)' });

    const { token, accountId } = await getToken(userId);

    // Step 1: Create container
    const containerRes = await axios.post(`${FB_BASE}/${accountId}/media`, null, {
      params: { image_url: imageUrl, caption: caption || '', access_token: token }
    });
    const containerId = containerRes.data.id;

    // Wait for processing
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Publish
    const publishRes = await axios.post(`${FB_BASE}/${accountId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: token }
    });

    res.json({ message: 'Posted to Instagram! 🎉', mediaId: publishRes.data.id });
  } catch (err) {
    console.error('IG post error:', err.response?.data || err.message);
    res.status(500).json({ message: err.response?.data?.error?.message || 'Post failed' });
  }
});

// Post Video/Reel
router.post('/post/video', async (req, res) => {
  try {
    const { userId, caption, videoUrl } = req.body;
    if (!videoUrl) return res.status(400).json({ message: 'videoUrl is required' });

    const { token, accountId } = await getToken(userId);

    const containerRes = await axios.post(`${FB_BASE}/${accountId}/media`, null, {
      params: { media_type: 'REELS', video_url: videoUrl, caption: caption || '', access_token: token }
    });
    const containerId = containerRes.data.id;

    // Poll for processing
    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 20) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await axios.get(`${FB_BASE}/${containerId}`, {
        params: { fields: 'status_code', access_token: token }
      });
      status = statusRes.data.status_code;
      attempts++;
    }

    if (status !== 'FINISHED') return res.status(500).json({ message: `Processing failed: ${status}` });

    const publishRes = await axios.post(`${FB_BASE}/${accountId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: token }
    });

    res.json({ message: 'Reel posted! 🎉', mediaId: publishRes.data.id });
  } catch (err) {
    console.error('IG video error:', err.response?.data || err.message);
    res.status(500).json({ message: err.response?.data?.error?.message || 'Video post failed' });
  }
});

// Get comments from recent posts
router.get('/comments/:userId', async (req, res) => {
  try {
    const { token, accountId } = await getToken(req.params.userId);

    const mediaRes = await axios.get(`${FB_BASE}/${accountId}/media`, {
      params: { fields: 'id,caption,timestamp', limit: 5, access_token: token }
    });

    const posts = mediaRes.data.data || [];
    const allComments = [];

    for (const post of posts.slice(0, 3)) {
      try {
        const commentsRes = await axios.get(`${FB_BASE}/${post.id}/comments`, {
          params: { fields: 'id,text,username,timestamp', access_token: token }
        });
        for (const c of (commentsRes.data.data || [])) {
          allComments.push({
            id: c.id,
            text: c.text,
            author: c.username || 'user',
            timestamp: c.timestamp,
            postId: post.id,
            mediaCaption: post.caption?.slice(0, 100) || ''
          });
        }
      } catch (e) { /* skip */ }
    }

    res.json({ comments: allComments });
  } catch (err) {
    console.error('IG comments error:', err.response?.data || err.message);
    res.status(500).json({ message: err.response?.data?.error?.message || 'Failed to fetch comments' });
  }
});

// Reply to comment
router.post('/comment/reply', async (req, res) => {
  try {
    const { userId, commentId, reply } = req.body;
    const { token } = await getToken(userId);
    await axios.post(`${FB_BASE}/${commentId}/replies`, null, {
      params: { message: reply, access_token: token }
    });
    res.json({ message: 'Reply posted!' });
  } catch (err) {
    console.error('IG reply error:', err.response?.data || err.message);
    res.status(500).json({ message: err.response?.data?.error?.message || 'Reply failed' });
  }
});

// AI reply for comment
router.post('/comment/ai-reply', async (req, res) => {
  try {
    const { comment, mediaCaption } = req.body;
    const aiRes = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemini-2.5-flash-lite-preview-09-2025',
        max_tokens: 80,
        messages: [{ role: 'user', content: `Write a short friendly Instagram reply to this comment.\nPost: "${mediaCaption || ''}"\nComment: "${comment}"\nRules: Max 1-2 sentences. Friendly, natural. Add 1 emoji. No hashtags.` }]
      },
      { headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    res.json({ reply: aiRes.data.choices[0].message.content.trim() });
  } catch (err) { res.status(500).json({ message: 'AI error' }); }
});

module.exports = router;