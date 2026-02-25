const router = require('express').Router();
const axios = require('axios');
const User = require('../models/User');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');

const upload = multer({ dest: 'uploads/instagram/', limits: { fileSize: 100 * 1024 * 1024 } });

const IG_API = 'https://graph.instagram.com/v19.0';

// Save Instagram token
router.post('/connect', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;
    await User.findByIdAndUpdate(userId, {
      $set: {
        'connectedPlatforms.instagram': true,
        'instagramToken': accessToken,
        'instagramAccountId': process.env.INSTAGRAM_ACCOUNT_ID
      }
    });
    res.json({ message: 'Instagram connected!' });
  } catch (err) {
    res.status(500).json({ message: 'Connection failed', error: err.message });
  }
});

// Disconnect
router.post('/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;
    await User.findByIdAndUpdate(userId, {
      $set: { 'connectedPlatforms.instagram': false, 'instagramToken': null }
    });
    res.json({ message: 'Instagram disconnected' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
});

// Post image to Instagram
router.post('/post/image', async (req, res) => {
  try {
    const { userId, caption, imageUrl } = req.body;
    const user = await User.findById(userId);

    const token = user?.instagramToken || process.env.INSTAGRAM_ACCESS_TOKEN;
    const accountId = user?.instagramAccountId || process.env.INSTAGRAM_ACCOUNT_ID;

    if (!token) return res.status(400).json({ message: 'Instagram not connected' });

    // Step 1 — Create container
    const containerRes = await axios.post(`${IG_API}/${accountId}/media`, null, {
      params: {
        image_url: imageUrl,
        caption: caption || '',
        access_token: token
      }
    });

    const containerId = containerRes.data.id;

    // Step 2 — Publish
    const publishRes = await axios.post(`${IG_API}/${accountId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: token }
    });

    res.json({ message: 'Posted to Instagram! 🎉', mediaId: publishRes.data.id });
  } catch (err) {
    console.error('Instagram image post error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Post failed', error: err.response?.data?.error?.message || err.message });
  }
});

// Post video/reel to Instagram
router.post('/post/video', async (req, res) => {
  try {
    const { userId, caption, videoUrl } = req.body;
    const user = await User.findById(userId);

    const token = user?.instagramToken || process.env.INSTAGRAM_ACCESS_TOKEN;
    const accountId = user?.instagramAccountId || process.env.INSTAGRAM_ACCOUNT_ID;

    if (!token) return res.status(400).json({ message: 'Instagram not connected' });

    // Step 1 — Create reel container
    const containerRes = await axios.post(`${IG_API}/${accountId}/media`, null, {
      params: {
        media_type: 'REELS',
        video_url: videoUrl,
        caption: caption || '',
        access_token: token
      }
    });

    const containerId = containerRes.data.id;

    // Step 2 — Wait for processing
    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 10) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await axios.get(`${IG_API}/${containerId}`, {
        params: { fields: 'status_code', access_token: token }
      });
      status = statusRes.data.status_code;
      attempts++;
    }

    if (status !== 'FINISHED') {
      return res.status(500).json({ message: 'Video processing timeout. Try again.' });
    }

    // Step 3 — Publish
    const publishRes = await axios.post(`${IG_API}/${accountId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: token }
    });

    res.json({ message: 'Reel posted to Instagram! 🎉', mediaId: publishRes.data.id });
  } catch (err) {
    console.error('Instagram video post error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Post failed', error: err.response?.data?.error?.message || err.message });
  }
});

// Get recent comments
router.get('/comments/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    const token = user?.instagramToken || process.env.INSTAGRAM_ACCESS_TOKEN;
    const accountId = user?.instagramAccountId || process.env.INSTAGRAM_ACCOUNT_ID;

    if (!token) return res.status(400).json({ message: 'Instagram not connected' });

    // Get recent media
    const mediaRes = await axios.get(`${IG_API}/${accountId}/media`, {
      params: { fields: 'id,caption,timestamp', limit: 5, access_token: token }
    });

    const media = mediaRes.data.data || [];
    let allComments = [];

    for (const post of media.slice(0, 3)) {
      try {
        const commentsRes = await axios.get(`${IG_API}/${post.id}/comments`, {
          params: { fields: 'id,text,username,timestamp,replies', access_token: token }
        });
        const comments = (commentsRes.data.data || []).map(c => ({
          id: c.id,
          mediaId: post.id,
          mediaCaption: post.caption?.slice(0, 50) || 'Post',
          author: c.username,
          text: c.text,
          timestamp: c.timestamp,
          replied: (c.replies?.data?.length || 0) > 0
        }));
        allComments = [...allComments, ...comments];
      } catch (e) {
        console.log(`Comments error for ${post.id}:`, e.message);
      }
    }

    res.json({ comments: allComments });
  } catch (err) {
    console.error('Instagram comments error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Error fetching comments', error: err.message });
  }
});

// Reply to comment
router.post('/comment/reply', async (req, res) => {
  try {
    const { userId, commentId, reply } = req.body;
    const user = await User.findById(userId);
    const token = user?.instagramToken || process.env.INSTAGRAM_ACCESS_TOKEN;

    await axios.post(`${IG_API}/${commentId}/replies`, null, {
      params: { message: reply, access_token: token }
    });

    res.json({ message: 'Reply posted!' });
  } catch (err) {
    console.error('Instagram reply error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Reply failed', error: err.response?.data?.error?.message || err.message });
  }
});

// AI reply suggestion
router.post('/comment/ai-reply', async (req, res) => {
  try {
    const { comment, mediaCaption } = req.body;
    const aiRes = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemini-2.5-flash-lite-preview-09-2025',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Write a short friendly Instagram comment reply (max 1 sentence, casual tone with 1 emoji) to this comment on post "${mediaCaption}": "${comment}". Just the reply text, nothing else.`
        }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://synapsocial.vercel.app',
          'X-Title': 'SynapSocial'
        }
      }
    );
    res.json({ reply: aiRes.data.choices[0].message.content.trim() });
  } catch (err) {
    res.status(500).json({ message: 'AI error', error: err.message });
  }
});

module.exports = router;