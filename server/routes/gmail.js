const router = require('express').Router();
const { google } = require('googleapis');
const User = require('../models/User');
const axios = require('axios');

const getOAuthClient = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GMAIL_CALLBACK_URL || 'http://localhost:5000/api/gmail/callback'
);

// Connect Gmail
router.get('/connect', (req, res) => {
  const { userId } = req.query;
  req.session.userId = userId;
  req.session.save();

  const url = getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
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
        'connectedPlatforms.gmail': true,
        'gmailToken': tokens.access_token,
        'gmailRefreshToken': tokens.refresh_token,
      }
    });

    res.redirect(`${process.env.CLIENT_URL}/dashboard?connected=gmail`);
  } catch (err) {
    console.error('Gmail callback error:', err.message);
    res.redirect(`${process.env.CLIENT_URL}/dashboard?error=gmail_failed`);
  }
});

// Get inbox emails
router.get('/inbox/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user?.gmailToken) return res.status(400).json({ message: 'Gmail not connected' });

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token: user.gmailToken,
      refresh_token: user.gmailRefreshToken
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 15,
      q: 'in:inbox -category:promotions -category:social'
    });

    const messages = listRes.data.messages || [];
    const emails = [];

    for (const msg of messages.slice(0, 10)) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });

      const headers = detail.data.payload.headers;
      const from = headers.find(h => h.name === 'From')?.value || '';
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const snippet = detail.data.snippet || '';
      const isUnread = detail.data.labelIds?.includes('UNREAD');

      emails.push({
        id: msg.id,
        from,
        subject,
        date,
        snippet,
        isUnread
      });
    }

    res.json({ emails });
  } catch (err) {
    console.error('Gmail inbox error:', err.message);
    res.status(500).json({ message: 'Failed to fetch emails', error: err.message });
  }
});

// Get full email body
router.get('/email/:userId/:emailId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ access_token: user.gmailToken, refresh_token: user.gmailRefreshToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const detail = await gmail.users.messages.get({
      userId: 'me', id: req.params.emailId, format: 'full'
    });

    const headers = detail.data.payload.headers;
    const from = headers.find(h => h.name === 'From')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    // Extract body
    let body = '';
    const extractBody = (part) => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.parts) {
        part.parts.forEach(extractBody);
      }
    };
    extractBody(detail.data.payload);

    // Mark as read
    await gmail.users.messages.modify({
      userId: 'me', id: req.params.emailId,
      requestBody: { removeLabelIds: ['UNREAD'] }
    });

    res.json({ from, subject, date, body: body.slice(0, 2000) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get email', error: err.message });
  }
});

// AI reply suggestion
router.post('/ai-reply', async (req, res) => {
  try {
    const { subject, body, from } = req.body;
    const aiRes = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemini-2.5-flash-lite-preview-09-2025',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Write a professional email reply to this email.
From: ${from}
Subject: ${subject}
Email content: ${body?.slice(0, 500)}

Write ONLY the reply body text, no subject line, no "Dear..." formality unless needed. Keep it concise and natural.`
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

// Send email
router.post('/send', async (req, res) => {
  try {
    const { userId, to, subject, body, replyToMessageId } = req.body;
    const user = await User.findById(userId);

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ access_token: user.gmailToken, refresh_token: user.gmailRefreshToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ];

    const email = emailLines.join('\r\n');
    const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const sendBody = { raw: encodedEmail };
    if (replyToMessageId) sendBody.threadId = replyToMessageId;

    await gmail.users.messages.send({ userId: 'me', requestBody: sendBody });

    res.json({ message: 'Email sent! ✅' });
  } catch (err) {
    console.error('Gmail send error:', err.message);
    res.status(500).json({ message: 'Send failed', error: err.message });
  }
});

// Get contacts (friends/family from sent emails)
router.get('/contacts/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ access_token: user.gmailToken, refresh_token: user.gmailRefreshToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const sentRes = await gmail.users.messages.list({
      userId: 'me', maxResults: 20, q: 'in:sent'
    });

    const contacts = new Set();
    for (const msg of (sentRes.data.messages || []).slice(0, 10)) {
      const detail = await gmail.users.messages.get({
        userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['To']
      });
      const to = detail.data.payload.headers.find(h => h.name === 'To')?.value;
      if (to) contacts.add(to);
    }

    res.json({ contacts: Array.from(contacts) });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
});

// Save auto-reply contacts
router.post('/auto-reply-contacts', async (req, res) => {
  try {
    const { userId, contacts } = req.body;
    await User.findByIdAndUpdate(userId, {
      $set: { 'gmailAutoReplyContacts': contacts }
    });
    res.json({ message: 'Saved!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
});

module.exports = router;