const router = require('express').Router();
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const User = require('../models/User');

const videoUpload = multer({ dest: 'uploads/videos/', limits: { fileSize: 100 * 1024 * 1024 } });



const upload = multer({
  dest: 'uploads/temp/',
  limits: { fileSize: 50 * 1024 * 1024 }
});

const GEMINI_MODEL = 'google/gemini-2.5-flash-lite-preview-09-2025';
const TEXT_MODEL = 'google/gemini-2.5-flash-lite-preview-09-2025';

const extractFileContent = async (file) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.pdf') {
    try {
      const buffer = fs.readFileSync(file.path);
      const data = await pdfParse(buffer);
      return { type: 'text', content: data.text.slice(0, 3000) };
    } catch (e) {
      return { type: 'text', content: `PDF: ${file.originalname}` };
    }
  }

  if (['.doc', '.docx'].includes(ext)) {
    const buffer = fs.readFileSync(file.path);
    const result = await mammoth.extractRawText({ buffer });
    return { type: 'text', content: result.value.slice(0, 3000) };
  }

  if (ext === '.txt') {
    const content = fs.readFileSync(file.path, 'utf8');
    return { type: 'text', content: content.slice(0, 3000) };
  }

  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    const imageData = fs.readFileSync(file.path);
    const base64 = imageData.toString('base64');
    const mimeType = ext === '.png' ? 'image/png' :
                     ext === '.gif' ? 'image/gif' :
                     ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { type: 'image', base64, mimeType };
  }

  if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
    const stats = fs.statSync(file.path);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    // Only send if under 10MB — base64 video to Gemini
    if (stats.size < 10 * 1024 * 1024) {
      const videoData = fs.readFileSync(file.path);
      const base64 = videoData.toString('base64');
      const mimeType = ext === '.mp4' ? 'video/mp4' :
                       ext === '.mov' ? 'video/quicktime' :
                       ext === '.webm' ? 'video/webm' : 'video/mp4';
      return { type: 'video', base64, mimeType, sizeMB };
    }
    return { type: 'video_large', content: `Video: ${file.originalname} (${sizeMB}MB)` };
  }

  return { type: 'unknown', content: `File: ${file.originalname}` };
};

router.post('/chat', upload.single('file'), async (req, res) => {
  try {
    const { message, platform } = req.body;

    const systemPrompt = `You are SynapSocial AI, expert social media assistant.
Platform: ${platform || 'general'}.
LinkedIn: professional. Instagram: casual + emojis. YouTube: SEO-focused. General: cover all platforms.
Analyze any uploaded content deeply and generate optimized ready-to-post social media content.`;

    let messages;
    let useModel = TEXT_MODEL;

    if (req.file) {
      const fileData = await extractFileContent(req.file);
      try { fs.unlinkSync(req.file.path); } catch (e) {}

      if (fileData.type === 'image') {
        useModel = GEMINI_MODEL;
        messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${fileData.mimeType};base64,${fileData.base64}` } },
              { type: 'text', text: message || `Analyze this image and generate optimized ${platform || 'social media'} content. Include caption, hashtags, and posting tips.` }
            ]
          }
        ];

      } else if (fileData.type === 'video') {
        // Gemini can handle short videos via base64
        useModel = GEMINI_MODEL;
        messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${fileData.mimeType};base64,${fileData.base64}` } },
              { type: 'text', text: message || `Analyze this video and generate:
1. 5 catchy YouTube/Instagram title options
2. SEO description (150 words)
3. 10 relevant hashtags
4. Best platform to post this on
5. Thumbnail text suggestion` }
            ]
          }
        ];

      } else if (fileData.type === 'video_large') {
        // Too large — use text model with context
        messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${fileData.content}\n${message || `Generate YouTube title, description, hashtags for this video.`}` }
        ];

      } else if (fileData.type === 'text') {
        useModel = GEMINI_MODEL;
        messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `File content (${req.file.originalname}):\n\n${fileData.content}\n\n${message || `Generate optimized ${platform || 'social media'} post from this content.`}` }
        ];
      }

    } else {
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ];
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      { model: useModel, max_tokens: 600, messages },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'SynapSocial'
        }
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ message: 'AI error', error: err.message });
  }
});

// Post to LinkedIn
// Post to LinkedIn (text + optional media)
const linkedinUpload = multer({ dest: 'uploads/linkedin/' });
router.post('/post/linkedin', async (req, res) => {
  try {
    const { userId, content, mediaBase64, mediaMimeType, mediaName } = req.body;
    console.log('LinkedIn post - has media:', !!mediaBase64, 'type:', mediaMimeType);

    const user = await User.findById(userId);
    if (!user?.linkedinToken)
      return res.status(400).json({ message: 'LinkedIn not connected' });
    if (!user?.permissions?.autoPost)
      return res.status(403).json({ message: 'Auto-post permission is OFF.' });

    const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${user.linkedinToken}` }
    });
    const authorUrn = `urn:li:person:${profileRes.data.sub}`;

    // Text only
    if (!mediaBase64) {
      await axios.post('https://api.linkedin.com/v2/ugcPosts', {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: content },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
      }, {
        headers: {
          Authorization: `Bearer ${user.linkedinToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      return res.json({ message: 'Posted to LinkedIn! 🎉' });
    }

    // Convert base64 to buffer
    const base64Data = mediaBase64.split(';base64,').pop();
    const fileBuffer = Buffer.from(base64Data, 'base64');
    const isVideo = mediaMimeType?.includes('video');

    // Step 1 — Register upload
    const registerRes = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: [isVideo
            ? 'urn:li:digitalmediaRecipe:feedshare-video'
            : 'urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent'
          }]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${user.linkedinToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const uploadUrl = registerRes.data.value.uploadMechanism[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ].uploadUrl;
    const assetUrn = registerRes.data.value.asset;
    console.log('LinkedIn upload URL obtained, uploading media...');

    // Step 2 — Upload binary
    await axios.put(uploadUrl, fileBuffer, {
      headers: {
        Authorization: `Bearer ${user.linkedinToken}`,
        'Content-Type': mediaMimeType || 'image/jpeg'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });
    console.log('Media uploaded to LinkedIn');

    // Step 3 — Create post
    await axios.post('https://api.linkedin.com/v2/ugcPosts', {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: isVideo ? 'VIDEO' : 'IMAGE',
          media: [{
            status: 'READY',
            description: { text: content.slice(0, 200) },
            media: assetUrn,
            title: { text: mediaName || 'Posted via SynapSocial' }
          }]
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    }, {
      headers: {
        Authorization: `Bearer ${user.linkedinToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    res.json({ message: `${isVideo ? 'Video' : 'Image'} posted to LinkedIn! 🎉` });
  } catch (err) {
    console.error('LinkedIn post error:', err.response?.data || err.message);
    res.status(500).json({ message: 'LinkedIn post failed', error: err.message });
  }
});




router.post('/post/linkedin/video', videoUpload.single('media'), async (req, res) => {
  try {
    const { userId, content } = req.body;
    const user = await User.findById(userId);

    if (!user?.linkedinToken)
      return res.status(400).json({ message: 'LinkedIn not connected' });
    if (!user?.permissions?.autoPost)
      return res.status(403).json({ message: 'Auto-post permission is OFF.' });

    const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${user.linkedinToken}` }
    });
    const authorUrn = `urn:li:person:${profileRes.data.sub}`;

    // Step 1 — Register upload
    const registerRes = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
          owner: authorUrn,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent'
          }]
        }
      },
      { headers: { Authorization: `Bearer ${user.linkedinToken}`, 'Content-Type': 'application/json' } }
    );

    const uploadUrl = registerRes.data.value.uploadMechanism[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ].uploadUrl;
    const assetUrn = registerRes.data.value.asset;

    // Step 2 — Upload video binary
    const fileBuffer = fs.readFileSync(req.file.path);
    await axios.put(uploadUrl, fileBuffer, {
      headers: {
        Authorization: `Bearer ${user.linkedinToken}`,
        'Content-Type': 'video/mp4'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    // Step 3 — Create post
    await axios.post('https://api.linkedin.com/v2/ugcPosts', {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'VIDEO',
          media: [{
            status: 'READY',
            description: { text: content.slice(0, 200) },
            media: assetUrn,
            title: { text: 'Posted via SynapSocial' }
          }]
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    }, {
      headers: {
        Authorization: `Bearer ${user.linkedinToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    res.json({ message: 'Video posted to LinkedIn! 🎉' });
  } catch (err) {
    console.error('Video post error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Video post failed', error: err.message });
  }
});
module.exports = router;