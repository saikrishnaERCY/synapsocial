// server/routes/linkedin-bot.js
// LinkedIn automation using Puppeteer (TinyFish style)
// Auto-apply jobs + auto-reply comments

const router = require('express').Router();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const User = require('../models/User');
const axios = require('axios');
const crypto = require('crypto');

puppeteer.use(StealthPlugin());

// ── Encrypt / Decrypt credentials ────────────────────────────────────
// ✅ FIX: pad or truncate to exactly 32 bytes
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
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

// ── Launch browser ────────────────────────────────────────────────────
const launchBrowser = async () => {
  return puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
    executablePath: process.env.PUPPETEER_EXEC_PATH || undefined,
  });
};

// ── LinkedIn Login ────────────────────────────────────────────────────
const loginToLinkedIn = async (page, email, password) => {
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 10000 });

  // Type slowly like a human
  await page.type('#username', email, { delay: 80 });
  await page.type('#password', password, { delay: 80 });

  await page.click('[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

  // Check if login successful
  const url = page.url();
  if (url.includes('checkpoint') || url.includes('challenge')) {
    throw new Error('LinkedIn security check triggered. Please login manually once.');
  }
  if (url.includes('login')) {
    throw new Error('Login failed. Check your email and password.');
  }

  console.log('✅ LinkedIn login successful');
};

// ── Save LinkedIn Credentials ─────────────────────────────────────────
router.post('/save-credentials', async (req, res) => {
  try {
    const { userId, email, password } = req.body;
    if (!userId || !email || !password) return res.status(400).json({ message: 'All fields required' });

    // Encrypt password before storing
    const encryptedPassword = encrypt(password);

    await User.findByIdAndUpdate(userId, {
      $set: {
        linkedinBotEmail: email,
        linkedinBotPassword: encryptedPassword,
      },
    });

    res.json({ message: '✅ LinkedIn credentials saved securely' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Test Login ────────────────────────────────────────────────────────
router.post('/test-login', async (req, res) => {
  let browser;
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);

    if (!user?.linkedinBotEmail || !user?.linkedinBotPassword) {
      return res.status(400).json({ message: 'No LinkedIn credentials saved. Add them first.' });
    }

    const email = user.linkedinBotEmail;
    const password = decrypt(user.linkedinBotPassword);

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    await loginToLinkedIn(page, email, password);

    res.json({ message: '✅ LinkedIn login works! Automation ready.' });
  } catch (err) {
    console.error('Test login error:', err.message);
    res.status(500).json({ message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ── Auto-Apply Jobs ───────────────────────────────────────────────────
router.post('/auto-apply-jobs', async (req, res) => {
  let browser;
  try {
    const { userId, keywords, location = 'India', maxJobs = 5 } = req.body;

    const user = await User.findById(userId);
    if (!user?.linkedinBotEmail || !user?.linkedinBotPassword) {
      return res.status(400).json({ message: 'No LinkedIn credentials. Save them first in Platforms → LinkedIn → Bot Settings.' });
    }

    // Check permission
    if (!user.permissions?.autoApplyJobs) {
      return res.status(403).json({ message: 'Auto-Apply Jobs permission is OFF. Enable it in Platforms → LinkedIn Permissions.' });
    }

    const email = user.linkedinBotEmail;
    const password = decrypt(user.linkedinBotPassword);

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    await loginToLinkedIn(page, email, password);

    // Search for Easy Apply jobs
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&f_AL=true&f_WT=2`; // Easy Apply + Remote
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForSelector('.jobs-search-results-list', { timeout: 15000 });

    // Get job listings
    const jobCards = await page.$$('.jobs-search-results__list-item');
    const appliedJobs = [];

    for (let i = 0; i < Math.min(jobCards.length, maxJobs); i++) {
      try {
        await jobCards[i].click();
        await new Promise((r) => setTimeout(r, 2000));

        // Get job title and company
        const jobTitle = await page.$eval('.jobs-unified-top-card__job-title', (el) => el.textContent.trim()).catch(() => 'Unknown');
        const company = await page.$eval('.jobs-unified-top-card__company-name', (el) => el.textContent.trim()).catch(() => 'Unknown');

        // Find Easy Apply button
        const easyApplyBtn = await page.$('.jobs-apply-button--top-card button, [aria-label="Easy Apply"]');
        if (!easyApplyBtn) continue;

        await easyApplyBtn.click();
        await new Promise((r) => setTimeout(r, 2000));

        // Handle application modal
        const modal = await page.$('.jobs-easy-apply-modal');
        if (!modal) continue;

        // Fill phone if needed
        const phoneInput = await page.$('[id*="phoneNumber"]');
        if (phoneInput) {
          const currentVal = await page.$eval('[id*="phoneNumber"]', (el) => el.value);
          if (!currentVal) await phoneInput.type(user.phone || '9999999999', { delay: 50 });
        }

        // Click through steps (Next → Next → Submit)
        let submitted = false;
        for (let step = 0; step < 5; step++) {
          await new Promise((r) => setTimeout(r, 1500));

          // Look for Submit button
          const submitBtn = await page.$('[aria-label="Submit application"]');
          if (submitBtn) {
            await submitBtn.click();
            submitted = true;
            break;
          }

          // Look for Next button
          const nextBtn = await page.$('[aria-label="Continue to next step"], [aria-label="Review your application"]');
          if (nextBtn) {
            await nextBtn.click();
          } else {
            break;
          }
        }

        if (submitted) {
          appliedJobs.push({ title: jobTitle, company });
          console.log(`✅ Applied: ${jobTitle} at ${company}`);

          // Save to user's applied jobs
          await User.findByIdAndUpdate(userId, {
            $push: {
              appliedJobs: {
                title: jobTitle,
                company,
                appliedAt: new Date(),
              },
            },
          });
        }

        // Close modal
        const closeBtn = await page.$('[aria-label="Dismiss"]');
        if (closeBtn) await closeBtn.click();

        // Human-like delay between applications
        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
      } catch (err) {
        console.log(`Skipped job ${i}: ${err.message}`);
      }
    }

    res.json({
      message: `✅ Applied to ${appliedJobs.length} jobs!`,
      applied: appliedJobs,
    });
  } catch (err) {
    console.error('Auto-apply error:', err.message);
    res.status(500).json({ message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ── Auto-Reply LinkedIn Comments ──────────────────────────────────────
router.post('/auto-reply-comments', async (req, res) => {
  let browser;
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);

    if (!user?.linkedinBotEmail || !user?.linkedinBotPassword) {
      return res.status(400).json({ message: 'No LinkedIn credentials saved.' });
    }
    if (!user.permissions?.linkedinReplyComments) {
      return res.status(403).json({ message: 'Reply Comments permission is OFF.' });
    }

    const email = user.linkedinBotEmail;
    const password = decrypt(user.linkedinBotPassword);

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    await loginToLinkedIn(page, email, password);

    // Go to notifications to find new comments
    await page.goto('https://www.linkedin.com/notifications/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Get comment notifications
    const notifItems = await page.$$('.nt-card-list__item');
    let replied = 0;

    for (const item of notifItems.slice(0, 10)) {
      try {
        const text = await item.$eval('.nt-card__text', (el) => el.textContent).catch(() => '');
        if (!text.toLowerCase().includes('comment')) continue;

        // Get the post link
        const link = await item.$eval('a', (el) => el.href).catch(() => null);
        if (!link) continue;

        await page.goto(link, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise((r) => setTimeout(r, 2000));

        // Find unanswered comments on our posts
        const comments = await page.$$('.comments-comment-item');

        for (const comment of comments.slice(0, 3)) {
          try {
            const commentText = await comment.$eval('.comments-comment-item__main-content', (el) => el.textContent.trim());

            // Generate AI reply
            const aiReply = await generateLinkedInReply(commentText);

            // Click reply button
            const replyBtn = await comment.$('[aria-label*="Reply"], button.reply-button');
            if (!replyBtn) continue;
            await replyBtn.click();
            await new Promise((r) => setTimeout(r, 1000));

            // Type reply
            const replyBox = await page.$('.comments-comment-box__form-container .ql-editor');
            if (!replyBox) continue;
            await replyBox.click();
            await replyBox.type(aiReply, { delay: 30 });
            await new Promise((r) => setTimeout(r, 500));

            // Submit
            const submitBtn = await page.$('[data-control-name="reply.post"], button[type="submit"]');
            if (submitBtn) {
              await submitBtn.click();
              replied++;
              console.log(`✅ [LinkedIn] Replied to comment: "${commentText.slice(0, 50)}..."`);
              await new Promise((r) => setTimeout(r, 2000));
            }
          } catch (e) {
            console.log('Comment reply error:', e.message);
          }
        }

        await new Promise((r) => setTimeout(r, 3000));
      } catch (e) {
        console.log('Notification error:', e.message);
      }
    }

    res.json({ message: `✅ Replied to ${replied} LinkedIn comments` });
  } catch (err) {
    console.error('LinkedIn auto-reply error:', err.message);
    res.status(500).json({ message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

const generateLinkedInReply = async (comment) => {
  try {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemini-2.5-flash-lite-preview-09-2025',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Write a short professional LinkedIn reply (1-2 sentences) to this comment: "${comment}". No hashtags. Just the reply text.`,
        }],
      },
      { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    return res.data.choices[0].message.content.trim();
  } catch {
    return 'Thank you for your comment! Really appreciate the engagement. 🙏';
  }
};

// ── Get Applied Jobs History ──────────────────────────────────────────
router.get('/applied-jobs/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    res.json({ jobs: user?.appliedJobs || [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Upload Resume for auto-apply ─────────────────────────────────────
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const uploadResume = multer({ dest: 'uploads/resumes/', limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload-resume', uploadResume.single('resume'), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    await User.findByIdAndUpdate(userId, {
      $set: {
        resumePath: req.file.path,
        resumeName: req.file.originalname,
      }
    });

    res.json({ message: '✅ Resume uploaded!', filename: req.file.originalname });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Check if credentials exist ────────────────────────────────────────
router.get('/credentials-status/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    res.json({ hasCredentials: !!(user?.linkedinBotEmail && user?.linkedinBotPassword) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;