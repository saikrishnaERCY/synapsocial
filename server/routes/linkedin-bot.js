// server/routes/linkedin-bot.js
// LinkedIn automation via Browserless.io (cloud Chrome — works on Render)

const router = require('express').Router();
const puppeteer = require('puppeteer-core');
const User = require('../models/User');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');

// ── Encryption ────────────────────────────────────────────────────────
const rawKey = process.env.ENCRYPT_SECRET || 'synapsocial-secret-key-for-aes256';
const ENCRYPT_KEY = rawKey.padEnd(32, '0').slice(0, 32);
const IV_LENGTH = 16;

const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    throw new Error('Failed to decrypt credentials. Please re-save them.');
  }
};

// ── Browserless.io Cloud Chrome ───────────────────────────────────────
const getBrowser = async () => {
  const key = process.env.BROWSERLESS_API_KEY;
  if (!key) throw new Error('BROWSERLESS_API_KEY not set in Render environment variables');
  const browser = await puppeteer.connect({
    browserWSEndpoint: `wss://chrome.browserless.io?token=${key}`,
  });
  return browser;
};

// ── LinkedIn Login ────────────────────────────────────────────────────
const loginToLinkedIn = async (page, email, password) => {
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.type('#username', email, { delay: 60 });
  await page.type('#password', password, { delay: 60 });
  await Promise.all([
    page.click('[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
  ]);
  const url = page.url();
  if (url.includes('checkpoint') || url.includes('challenge'))
    throw new Error('LinkedIn security check triggered. Log in manually once to clear it.');
  if (url.includes('/login'))
    throw new Error('Login failed. Check your email and password.');
  console.log(`✅ LinkedIn login OK: ${email}`);
};

// ── AI Reply ──────────────────────────────────────────────────────────
const generateAIReply = async (prompt) => {
  try {
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'google/gemini-2.5-flash-lite-preview-09-2025',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://synapsocial.vercel.app' },
      timeout: 15000,
    });
    return res.data.choices[0].message.content.trim();
  } catch {
    return 'Thank you for your comment! Really appreciate the engagement. 🙏';
  }
};

// ── Save Credentials ──────────────────────────────────────────────────
router.post('/save-credentials', async (req, res) => {
  try {
    const { userId, email, password } = req.body;
    if (!userId || !email || !password) return res.status(400).json({ message: 'All fields required' });
    const encryptedPassword = encrypt(password);
    await User.findByIdAndUpdate(userId, { $set: { linkedinBotEmail: email, linkedinBotPassword: encryptedPassword } });
    res.json({ message: '✅ Credentials saved securely' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Test Login ────────────────────────────────────────────────────────
router.post('/test-login', async (req, res) => {
  let browser;
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user?.linkedinBotEmail || !user?.linkedinBotPassword)
      return res.status(400).json({ message: 'No credentials saved.' });

    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    await loginToLinkedIn(page, user.linkedinBotEmail, decrypt(user.linkedinBotPassword));
    res.json({ message: '✅ Login successful! LinkedIn connected.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  } finally { if (browser) await browser.close(); }
});

// ── Auto-Apply Jobs ───────────────────────────────────────────────────
router.post('/auto-apply-jobs', async (req, res) => {
  let browser;
  try {
    const { userId, keywords, location = 'India', maxJobs = 5 } = req.body;
    const user = await User.findById(userId);
    if (!user?.linkedinBotEmail || !user?.linkedinBotPassword)
      return res.status(400).json({ message: 'No LinkedIn credentials. Save in Bot Settings → Setup.' });
    if (!user.resumePath)
      return res.status(400).json({ message: 'No resume uploaded. Upload in Bot Settings → Auto-Apply.' });

    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await loginToLinkedIn(page, user.linkedinBotEmail, decrypt(user.linkedinBotPassword));

    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&f_AL=true`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const appliedJobs = [];
    const jobCards = await page.$$('.jobs-search-results__list-item, .job-card-container');
    console.log(`[LinkedIn Bot] Found ${jobCards.length} jobs for "${keywords}"`);

    for (let i = 0; i < Math.min(jobCards.length, Number(maxJobs)); i++) {
      try {
        await jobCards[i].click();
        await new Promise(r => setTimeout(r, 2500));

        const jobTitle = await page.$eval('.jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title', el => el.textContent.trim()).catch(() => 'Unknown Position');
        const company = await page.$eval('.jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name', el => el.textContent.trim()).catch(() => 'Unknown Company');

        const easyApplyBtn = await page.$('button.jobs-apply-button, [aria-label*="Easy Apply"]');
        if (!easyApplyBtn) { console.log(`No Easy Apply: ${jobTitle}`); continue; }

        await easyApplyBtn.click();
        await new Promise(r => setTimeout(r, 2000));

        let submitted = false;
        for (let step = 0; step < 6; step++) {
          await new Promise(r => setTimeout(r, 1500));
          const phoneInput = await page.$('input[id*="phoneNumber"], input[name*="phone"]');
          if (phoneInput) {
            const val = await page.evaluate(el => el.value, phoneInput);
            if (!val) await phoneInput.type('9999999999', { delay: 50 });
          }
          const submitBtn = await page.$('[aria-label="Submit application"]');
          if (submitBtn) { await submitBtn.click(); submitted = true; console.log(`✅ Applied: ${jobTitle} @ ${company}`); break; }
          const reviewBtn = await page.$('[aria-label="Review your application"]');
          if (reviewBtn) { await reviewBtn.click(); continue; }
          const nextBtn = await page.$('[aria-label="Continue to next step"]');
          if (nextBtn) { await nextBtn.click(); continue; }
          break;
        }

        if (submitted) {
          appliedJobs.push({ title: jobTitle, company });
          await User.findByIdAndUpdate(userId, { $push: { appliedJobs: { title: jobTitle, company, appliedAt: new Date() } } });
        }

        const closeBtn = await page.$('[aria-label="Dismiss"]');
        if (closeBtn) await closeBtn.click();
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
      } catch (err) { console.log(`Skipped job ${i}: ${err.message}`); }
    }

    res.json({ message: `✅ Applied to ${appliedJobs.length} job${appliedJobs.length !== 1 ? 's' : ''}!`, applied: appliedJobs });
  } catch (err) {
    console.error('Auto-apply error:', err.message);
    res.status(500).json({ message: err.message });
  } finally { if (browser) await browser.close(); }
});

// ── Get My Posts ──────────────────────────────────────────────────────
router.get('/my-posts/:userId', async (req, res) => {
  let browser;
  try {
    const user = await User.findById(req.params.userId);
    if (!user?.linkedinBotEmail || !user?.linkedinBotPassword)
      return res.status(400).json({ message: 'No credentials saved.' });

    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await loginToLinkedIn(page, user.linkedinBotEmail, decrypt(user.linkedinBotPassword));

    await page.goto('https://www.linkedin.com/in/me/recent-activity/shares/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 1500));

    const posts = await page.evaluate(() => {
      const els = document.querySelectorAll('.profile-creator-shared-feed-update__container, .feed-shared-update-v2');
      return Array.from(els).slice(0, 10).map((el, i) => {
        const text = el.querySelector('.feed-shared-text, .feed-shared-update-v2__description')?.textContent?.trim()?.slice(0, 200) || '';
        const time = el.querySelector('time, .feed-shared-actor__sub-description')?.textContent?.trim() || '';
        const commentsCount = el.querySelector('[aria-label*="comment"]')?.textContent?.trim() || '0';
        const postUrl = el.querySelector('a[href*="/feed/update/"]')?.href || '';
        return { id: `post_${i}`, text, time, commentsCount, postUrl };
      }).filter(p => p.text);
    });

    res.json({ posts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  } finally { if (browser) await browser.close(); }
});

// ── Get Comments on Post ──────────────────────────────────────────────
router.post('/post-comments', async (req, res) => {
  let browser;
  try {
    const { userId, postUrl } = req.body;
    const user = await User.findById(userId);
    if (!user?.linkedinBotEmail || !user?.linkedinBotPassword)
      return res.status(400).json({ message: 'No credentials saved.' });

    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await loginToLinkedIn(page, user.linkedinBotEmail, decrypt(user.linkedinBotPassword));

    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    const comments = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.comments-comment-item')).slice(0, 20).map((el, i) => ({
        id: `comment_${i}`,
        index: i,
        author: el.querySelector('.comments-post-meta__name-text, .hoverable-link-text')?.textContent?.trim() || 'Unknown',
        text: el.querySelector('.comments-comment-item__main-content')?.textContent?.trim() || '',
        time: el.querySelector('time')?.textContent?.trim() || '',
      })).filter(c => c.text);
    });

    res.json({ comments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  } finally { if (browser) await browser.close(); }
});

// ── AI Reply Suggestion ───────────────────────────────────────────────
router.post('/ai-reply', async (req, res) => {
  try {
    const { comment } = req.body;
    const reply = await generateAIReply(`Write a short professional LinkedIn reply (1-2 sentences, no hashtags, 1 emoji max) to: "${comment}". Reply text only.`);
    res.json({ reply });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Post Reply to Comment ─────────────────────────────────────────────
router.post('/reply-comment', async (req, res) => {
  let browser;
  try {
    const { userId, postUrl, commentIndex, reply } = req.body;
    const user = await User.findById(userId);
    if (!user?.linkedinBotEmail || !user?.linkedinBotPassword)
      return res.status(400).json({ message: 'No credentials saved.' });

    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await loginToLinkedIn(page, user.linkedinBotEmail, decrypt(user.linkedinBotPassword));

    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    const commentEls = await page.$$('.comments-comment-item');
    if (!commentEls[commentIndex]) return res.status(400).json({ message: 'Comment not found' });

    const replyBtn = await commentEls[commentIndex].$('button[aria-label*="Reply"], .comments-comment-social-bar__reply-action-button');
    if (!replyBtn) return res.status(400).json({ message: 'Reply button not found' });

    await replyBtn.click();
    await new Promise(r => setTimeout(r, 1500));

    const replyBox = await page.$('.comments-comment-box--reply .ql-editor, .comments-comment-texteditor .ql-editor');
    if (!replyBox) return res.status(400).json({ message: 'Reply box not found' });

    await replyBox.click();
    await replyBox.type(reply, { delay: 30 });
    await new Promise(r => setTimeout(r, 800));

    const postBtn = await page.$('.comments-comment-box--reply button[type="submit"], .comments-comment-box__submit-button');
    if (postBtn) await postBtn.click();

    await new Promise(r => setTimeout(r, 1500));
    res.json({ message: '✅ Reply posted!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  } finally { if (browser) await browser.close(); }
});

// ── Upload Resume ─────────────────────────────────────────────────────
const resumeUpload = multer({ dest: 'uploads/resumes/', limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload-resume', resumeUpload.single('resume'), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    await User.findByIdAndUpdate(userId, { $set: { resumePath: req.file.path, resumeName: req.file.originalname } });
    res.json({ message: '✅ Resume uploaded!', filename: req.file.originalname });
  } catch (err) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch { }
    res.status(500).json({ message: err.message });
  }
});

// ── Credentials Status ────────────────────────────────────────────────
router.get('/credentials-status/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    res.json({
      hasCredentials: !!(user?.linkedinBotEmail && user?.linkedinBotPassword),
      resumeName: user?.resumeName || null,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Applied Jobs History ──────────────────────────────────────────────
router.get('/applied-jobs/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    res.json({ jobs: user?.appliedJobs || [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;