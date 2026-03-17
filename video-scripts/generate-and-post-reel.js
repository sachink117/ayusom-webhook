/**
 * Ayusomam Herbals — Generate Meme+Educational Hindi Sinus Video & Post to Instagram Reel
 *
 * Pipeline:
 *   1. Generate video via Google Veo 3.1 API (meme + educational Hindi content)
 *   2. Upload as Instagram Reel via Playwright (real browser, no API needed)
 *
 * Usage:
 *   GOOGLE_AI_API_KEY=... INSTAGRAM_USERNAME=... INSTAGRAM_PASSWORD=... TOTP_SECRET=... \
 *     node video-scripts/generate-and-post-reel.js [prompt-key]
 *
 * Default prompt: meme-sinus-spray (best performing meme format)
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const OUTPUT_DIR = path.join(__dirname, 'generated');

// ─── MEME + EDUCATIONAL HINDI VIDEO PROMPTS ────────────────────────────────

const MEME_PROMPTS = {

  'meme-sinus-spray': {
    title: 'Nasal Spray Wala Meme — Sach Bata Raha Hoon',
    prompt: `A split-screen comedic Indian meme-style video. LEFT side labeled "EXPECTATION" in bold yellow Hindi text: an Indian man confidently sprays nasal spray, sparkle effects, dramatic Bollywood-style relief pose, slow motion hair flip, golden lighting. RIGHT side labeled "REALITY" in red Hindi text: same man 2 hours later, congested again, tissues everywhere, dramatically falling on sofa, exaggerated sad Indian soap opera zoom. Then a green screen appears with clean text: "Spray sirf 2 ghante kaam karta hai. Root cause theek karo." with a WhatsApp icon. Comedic Bollywood background music transitioning to calm Ayurvedic sitar. 9:16 vertical format, 10 seconds. Indian household setting, warm lighting, relatable middle-class aesthetic.`,
    aspect_ratio: '9:16',
    duration_seconds: 10,
    caption_hi: `😂 Nasal spray ka bharosa = Ex ka bharosa

Expectation: Spray kiya, zindagi set ✨
Reality: 2 ghante baad wahi congestion wapas 😭

Sach toh yeh hai — spray sirf symptoms dabata hai, root cause theek nahi karta.

6 type ke sinus hote hain. Har ek ka treatment ALAG hai.
Pehle type pata karo, phir sahi ilaaj lo.

✅ FREE Sinus Type Test — AI powered
📱 WhatsApp pe SINUS bhejo: 8595160713
🔗 Link in bio

#sinusmeme #nasalspray #sinusrelief #ayurveda #sinustreatment #healthmemes #hindimemes #sinuskailaj #nasalspraychhodo #indianmemes #healthtips #ayurvedicmedicine #sinustype #congestion #naturalhealing #memeindia #desimemes #sinusproblems #relatablememes #ayusomam`,
    hashtags: ''
  },

  'meme-steam-lelo': {
    title: 'Steam Le Lo Beta — Mummy Ka Nuskha',
    prompt: `Comedic Indian kitchen scene. An Indian mother (50s, wearing salwar kameez) dramatically presents a steel bowl of steaming water with a towel, Bollywood dramatic music plays. Her adult son/daughter rolls eyes. Text overlay: "Mummy ka solution for EVERYTHING" in bold yellow Devanagari. Quick montage: headache? steam. cold? steam. sinus? steam. breakup? steam. Each with exaggerated dramatic zoom. Then a calm green card: "Steam helps temporarily. But do you know your sinus TYPE?" with a gentle Ayurvedic visual. Transition from comedy to educational. 9:16 vertical, 10 seconds. Warm Indian household kitchen, fluorescent lighting, steel utensils visible.`,
    aspect_ratio: '9:16',
    duration_seconds: 10,
    caption_hi: `🤣 Mummy ka universal solution: STEAM LE LO BETA

Sir dard? → Steam le lo
Naak band? → Steam le lo
Breakup? → Steam le lo 😅

Steam temporary relief deta hai, lekin sinus ka ROOT CAUSE theek nahi karta.

Kya aapko pata hai aapka sinus type kya hai?
6 types hote hain — har ek ka treatment alag hai.

✅ FREE AI Sinus Type Assessment
📱 WhatsApp: 8595160713 pe SINUS bhejo
🔗 Link in bio

#mummykenuskhe #steaminhale #sinusmeme #indianmom #desimom #ayurveda #sinusrelief #healthmemes #hindimemes #sinuskailaj #relatablememes #indianmemes #healthtips #sinustreatment #congestion #memeindia #desihumor #mumbaidiaries #punjabivibes #ayusomam`,
    hashtags: ''
  },

  'meme-google-sinus': {
    title: 'Google Pe Search Kiya Sinus — Ab Mujhe Cancer Hai',
    prompt: `An Indian person (late 20s) sitting in bed at night, phone screen glowing on face (blue light). They type "sinus treatment" — montage of scary Google results flashing: "SURGERY NEEDED", "LIFETIME CONDITION", "BRAIN INFECTION RISK". Their expression goes from casual to horrified. Dramatic Indian serial zoom effect on shocked face. Heartbeat sound. Then the person discovers a calm green WhatsApp chat: "Relax. 6 types hain. Pehle type pata karo." Relief wash. Comedic to educational transition. 9:16 vertical, 10 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 10,
    caption_hi: `😱 Raat 2 baje Google search: "sinus treatment"

Google: Surgery lagegi 🔪
Google: Lifelong problem hai 😰
Google: Brain tak ja sakta hai 🧠💀

Bhai RELAX. 🙏

Sinus ke 6 types hote hain.
Har ek ka apna treatment hai.
Pehle type pata karo — phir darr khatam.

✅ AI se 2 min mein sinus type jaano — FREE
📱 WhatsApp pe SINUS bhejo: 8595160713

#googlesearch #sinusmeme #raat2baje #healthanxiety #sinusrelief #ayurveda #indianmemes #relatablememes #hindimemes #healthmemes #sinustreatment #sinuskailaj #nightthoughts #overthinking #desimemes #healthtips #ayurvedicmedicine #sinusproblems #congestion #ayusomam`,
    hashtags: ''
  },

  'edu-6types-reveal': {
    title: '6 Types of Sinus — Kaunsa Aapko Hai?',
    prompt: `Clean, modern educational animation. A human nose/sinus cross-section diagram appears with gentle 3D rotation. Six colored zones light up one by one with Hindi labels appearing: "Allergic Type" (yellow), "Chronic Congestion" (orange), "Deep Inflammation" (red), "Spray Dependency" (purple), "Polyp Blockage" (dark blue), "DNS Type" (teal). Each zone pulses gently. A magnifying glass icon scans across them. Final frame: "Aapka kaunsa hai? AI se pata karo — FREE" in bold green text on white background. Soft ambient educational music. Medical illustration aesthetic with Ayurvedic green (#2E7D32) color scheme. 9:16 vertical, 12 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 12,
    caption_hi: `🧠 Kya aap jaante hain — sinus 6 type ke hote hain?

1️⃣ Allergic Type — dust/cold se trigger
2️⃣ Chronic Congestion — naak hamesha band
3️⃣ Deep Inflammation — andar swelling
4️⃣ Spray Dependency — bina spray naak nahi khulti
5️⃣ Polyp Blockage — naak mein growth
6️⃣ DNS Type — naak ki haddi tedhi

Har type ka treatment ALAG hai.
Generic dawai se kuch nahi hoga. Pehle type pata karo!

✅ AI Sinus Type Test — 2 min, FREE
📱 WhatsApp: 8595160713 pe SINUS bhejo
🔗 Link in bio

#sinustypes #sinuseducation #ayurveda #sinustreatment #healthtips #nasalcongestion #ayurvedicmedicine #sinusrelief #indianhealth #healthawareness #sinuskailaj #nasalspray #allergyrelief #congestion #sinusproblems #ayusomam #naturalhealing #noseproblem #healthindia #desihealthtips`,
    hashtags: ''
  }
};

// ─── GOOGLE VEO 3.1 VIDEO GENERATION ─────────────────────────────────────────

async function generateVideo(promptKey) {
  const template = MEME_PROMPTS[promptKey];
  if (!template) {
    console.error('Unknown prompt key:', promptKey);
    console.log('Available:', Object.keys(MEME_PROMPTS).join(', '));
    process.exit(1);
  }

  if (!GOOGLE_AI_API_KEY) {
    console.error('GOOGLE_AI_API_KEY not set');
    process.exit(1);
  }

  console.log(`\n🎬 Generating: ${template.title}`);
  console.log(`⏱️  ${template.duration_seconds}s | ${template.aspect_ratio}\n`);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Try Gemini Veo 3.1 generateVideos endpoint first
  const endpoints = [
    {
      name: 'Veo 3.1',
      url: `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:generateVideos?key=${GOOGLE_AI_API_KEY}`,
      body: {
        model: 'models/veo-3.1-generate-preview',
        generateVideoConfig: {
          prompt: { text: template.prompt },
          config: {
            aspectRatio: template.aspect_ratio,
            numberOfVideos: 1,
            durationSeconds: template.duration_seconds,
            includeAudio: true
          }
        }
      }
    },
    {
      name: 'Veo 3.1 (predictLongRunning)',
      url: `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${GOOGLE_AI_API_KEY}`,
      body: {
        instances: [{ prompt: template.prompt }],
        parameters: {
          aspectRatio: template.aspect_ratio,
          durationSeconds: template.duration_seconds,
          sampleCount: 1,
          includeAudio: true
        }
      }
    },
    {
      name: 'Veo 2.0',
      url: `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:generateVideos?key=${GOOGLE_AI_API_KEY}`,
      body: {
        generateVideoConfig: {
          model: 'veo-2.0-generate-001',
          prompt: { text: template.prompt },
          config: {
            aspectRatio: template.aspect_ratio,
            numberOfVideos: 1
          }
        }
      }
    }
  ];

  for (const ep of endpoints) {
    console.log(`Trying ${ep.name}...`);
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.log(`  ${ep.name} failed (${res.status}): ${errText.slice(0, 200)}`);
        continue;
      }

      const result = await res.json();
      console.log(`  ${ep.name} submitted!`);

      // If we got an operation name, poll for completion
      if (result.name) {
        const videoPath = await pollForCompletion(result.name, promptKey);
        if (videoPath) return videoPath;
        continue;
      }

      // If we got videos directly
      if (result.generatedVideos || (result.response && result.response.generatedVideos)) {
        const videos = result.generatedVideos || result.response.generatedVideos;
        return await saveVideo(videos[0], promptKey, template);
      }

      console.log(`  Unexpected response:`, JSON.stringify(result).slice(0, 300));
    } catch (err) {
      console.log(`  ${ep.name} error: ${err.message}`);
    }
  }

  console.error('\nAll API endpoints failed. Video generation unsuccessful.');
  return null;
}

async function pollForCompletion(operationName, promptKey) {
  console.log('⏳ Polling for video completion...');
  const maxAttempts = 120; // 10 minutes max

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GOOGLE_AI_API_KEY}`
      );
      const op = await res.json();

      if (op.done) {
        if (op.response && op.response.generatedVideos && op.response.generatedVideos.length > 0) {
          const template = Object.values(MEME_PROMPTS).find((_, idx) =>
            Object.keys(MEME_PROMPTS)[idx] === promptKey
          ) || { title: promptKey };
          return await saveVideo(op.response.generatedVideos[0], promptKey, template);
        }
        if (op.error) {
          console.error('Generation failed:', op.error.message || JSON.stringify(op.error));
        }
        return null;
      }

      const elapsed = (i + 1) * 5;
      if (elapsed % 30 === 0) console.log(`  Still generating... ${elapsed}s`);
    } catch (err) {
      // network hiccup, keep trying
    }
  }

  console.error('Timeout after 10 minutes');
  return null;
}

async function saveVideo(video, promptKey, template) {
  const filename = `${promptKey}_${Date.now()}.mp4`;
  const filepath = path.join(OUTPUT_DIR, filename);

  if (video.video && video.video.uri) {
    console.log('Downloading video...');
    const videoRes = await fetch(video.video.uri);
    const buffer = await videoRes.buffer();
    fs.writeFileSync(filepath, buffer);
  } else if (video.video && video.video.bytesBase64Encoded) {
    const buffer = Buffer.from(video.video.bytesBase64Encoded, 'base64');
    fs.writeFileSync(filepath, buffer);
  } else {
    console.error('No video data in response');
    return null;
  }

  const size = fs.statSync(filepath).size;
  console.log(`✅ Video saved: ${filepath} (${(size / 1024 / 1024).toFixed(1)} MB)`);

  // Save caption
  const captionPath = path.join(OUTPUT_DIR, `${promptKey}_caption.txt`);
  fs.writeFileSync(captionPath, template.caption_hi || '');

  return filepath;
}

// ─── INSTAGRAM REEL UPLOAD VIA PLAYWRIGHT ────────────────────────────────────

function generateTOTP(secret, timeOffset = 0) {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/[\s=]/g, '')) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const key = Buffer.from(bytes);
  const time = Math.floor(Date.now() / 1000 / 30) + timeOffset;
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigUInt64BE(BigInt(time));
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuf);
  const digest = hmac.digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function uploadReelToInstagram(videoPath, caption) {
  const INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME;
  const INSTAGRAM_PASSWORD = process.env.INSTAGRAM_PASSWORD;
  const TOTP_SECRET = process.env.TOTP_SECRET;

  if (!INSTAGRAM_USERNAME || !INSTAGRAM_PASSWORD) {
    console.error('INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD env vars required');
    process.exit(1);
  }

  const { chromium } = require('playwright');
  let browser, context, page;

  try {
    console.log('\n📱 Starting Instagram Reel upload...');

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
        '--disable-blink-features=AutomationControlled', '--lang=en-US,en'
      ]
    });

    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US'
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
    });

    page = await context.newPage();

    // ─── Step 1: Login ─────────────────────────────────────────────────────────
    console.log('  Logging in...');
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // Dismiss cookie banner
    const cookieBtn = page.locator('button:has-text("Allow all cookies"), button:has-text("Accept all"), button:has-text("Allow essential and optional cookies")').first();
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.click();
      await sleep(1500);
    }

    // Fill credentials
    const unameInput = await page.$('input[name="username"]');
    if (unameInput) await unameInput.fill(INSTAGRAM_USERNAME);
    else throw new Error('Username input not found');

    const pwInput = await page.$('input[name="password"]');
    if (pwInput) await pwInput.fill(INSTAGRAM_PASSWORD);
    else throw new Error('Password input not found');

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    else await page.keyboard.press('Enter');
    await sleep(6000);

    // ─── Handle 2FA ──────────────────────────────────────────────────────────
    if (page.url().includes('two_factor') || page.url().includes('challenge')) {
      console.log('  Handling 2FA...');
      if (!TOTP_SECRET) throw new Error('2FA required but TOTP_SECRET not set');

      // Try switching to authenticator app
      const allEls = await page.$$('a, button, span[role="button"]');
      for (const el of allEls) {
        const txt = (await el.textContent().catch(() => '')).trim();
        if (/authentication app|authenticator app|use.*app/i.test(txt)) {
          await el.click();
          await sleep(2000);
          break;
        }
      }

      const codeInput = await page.$(
        'input[name="verificationCode"], input[aria-label*="code" i], input[inputmode="numeric"], input[type="number"], input[autocomplete="one-time-code"]'
      );
      if (!codeInput) throw new Error('2FA input not found');

      let done2FA = false;
      for (const offset of [-1, 0, 1]) {
        const code = generateTOTP(TOTP_SECRET, offset);
        console.log(`  Trying TOTP (offset ${offset})...`);
        await codeInput.fill('');
        await codeInput.fill(code);
        await sleep(300);
        const btn = await page.$('button[type="submit"]');
        if (btn) await btn.click();
        else await page.keyboard.press('Enter');
        await sleep(5000);

        if (!page.url().includes('two_factor') && !page.url().includes('challenge')) {
          console.log('  2FA success!');
          done2FA = true;
          break;
        }
      }
      if (!done2FA) throw new Error('2FA failed — check TOTP_SECRET');
    }

    // Dismiss post-login prompts
    for (let i = 0; i < 3; i++) {
      const notNow = page.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
      if (await notNow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await notNow.click();
        await sleep(1500);
      }
    }

    console.log('  Logged in! Current URL:', page.url());

    // ─── Step 2: Navigate to Create (new post) ─────────────────────────────
    console.log('  Navigating to create post...');

    // Click the create/new post button (+ icon in sidebar or nav)
    // Instagram uses SVG icons, so we look for the create link/button
    const createSelectors = [
      'a[href="/create/"]',
      'a[href="/create/style/"]',
      'svg[aria-label="New post"]',
      'span:has-text("Create")',
      '[aria-label="New post"]',
      '[aria-label="New Post"]'
    ];

    let createClicked = false;
    for (const sel of createSelectors) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        console.log(`  Clicked create: ${sel}`);
        createClicked = true;
        break;
      }
    }

    if (!createClicked) {
      // Try clicking the sidebar "Create" text
      const sidebarItems = await page.$$('span');
      for (const item of sidebarItems) {
        const txt = (await item.textContent().catch(() => '')).trim();
        if (txt === 'Create') {
          await item.click();
          console.log('  Clicked sidebar Create');
          createClicked = true;
          break;
        }
      }
    }

    if (!createClicked) {
      // Direct navigation fallback
      await page.goto('https://www.instagram.com/create/style/', { timeout: 15000 });
      console.log('  Navigated directly to create page');
    }
    await sleep(3000);

    // ─── Step 3: Upload the video file ──────────────────────────────────────
    console.log('  Uploading video file...');

    // Instagram shows a file input (hidden) — we need to set it
    const fileInput = await page.$('input[type="file"][accept*="video"]')
      || await page.$('input[type="file"]');

    if (!fileInput) {
      // Sometimes need to click "Select from computer" first
      const selectBtn = page.locator('button:has-text("Select from computer"), button:has-text("Select From Computer"), button:has-text("Select from")').first();
      if (await selectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Set file via input before clicking
        const input = await page.$('input[type="file"]');
        if (input) {
          await input.setInputFiles(videoPath);
          console.log('  File set via input');
        } else {
          throw new Error('File input not found');
        }
      } else {
        throw new Error('Upload UI not found — Instagram may have changed layout');
      }
    } else {
      await fileInput.setInputFiles(videoPath);
      console.log('  File uploaded via input');
    }

    await sleep(5000);

    // ─── Step 4: Handle crop/aspect ratio screen ────────────────────────────
    // Look for aspect ratio / crop options and the Next button
    // Select 9:16 if option is available
    const aspectBtn = await page.$('svg[aria-label="Select crop"], button[aria-label="Select crop"]');
    if (aspectBtn) {
      await aspectBtn.click();
      await sleep(1000);
      // Click 9:16 option
      const nineByBtn = page.locator('svg[aria-label="Photo outline icon"], button:has-text("9:16")').first();
      if (await nineByBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nineByBtn.click();
        await sleep(500);
      }
    }

    // Click Next (multiple times — crop screen → filter screen → caption screen)
    for (let step = 0; step < 3; step++) {
      await sleep(2000);
      const nextBtn = page.locator('button:has-text("Next"), div[role="button"]:has-text("Next")').first();
      if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nextBtn.click();
        console.log(`  Clicked Next (step ${step + 1})`);
        await sleep(2000);
      }
    }

    // ─── Step 5: Add caption ────────────────────────────────────────────────
    console.log('  Adding caption...');
    await sleep(2000);

    // Find the caption textarea/contenteditable
    const captionInput = await page.$(
      'textarea[aria-label*="caption" i], textarea[aria-label*="Write a caption" i], div[contenteditable="true"][role="textbox"], textarea[placeholder*="caption" i]'
    );

    if (captionInput) {
      await captionInput.click();
      await sleep(300);
      // Type caption (truncate to Instagram's 2200 char limit)
      const trimmedCaption = caption.slice(0, 2200);
      await captionInput.fill(trimmedCaption);
      console.log(`  Caption added (${trimmedCaption.length} chars)`);
    } else {
      console.log('  Caption input not found — posting without caption');
    }

    await sleep(1000);

    // ─── Step 6: Share / Publish ────────────────────────────────────────────
    console.log('  Publishing Reel...');
    const shareBtn = page.locator('button:has-text("Share"), div[role="button"]:has-text("Share")').first();
    if (await shareBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shareBtn.click();
      console.log('  Clicked Share!');
    } else {
      throw new Error('Share button not found');
    }

    // Wait for upload to complete
    await sleep(10000);

    // Check for success indicator
    const successText = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (successText.includes('Your reel has been shared') || successText.includes('shared') || successText.includes('Reel')) {
      console.log('\n✅ REEL POSTED SUCCESSFULLY!');
    } else {
      console.log('\n📤 Upload initiated — check Instagram to confirm');
    }

    // Take a screenshot for verification
    const ssPath = path.join(OUTPUT_DIR, 'upload-result.png');
    await page.screenshot({ path: ssPath });
    console.log(`📸 Screenshot saved: ${ssPath}`);

  } catch (err) {
    console.error('\n❌ Upload error:', err.message);
    // Save screenshot on error for debugging
    if (page) {
      const errSs = path.join(OUTPUT_DIR, 'upload-error.png');
      await page.screenshot({ path: errSs }).catch(() => {});
      console.log(`📸 Error screenshot: ${errSs}`);
    }
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

// ─── MAIN PIPELINE ──────────────────────────────────────────────────────────

async function main() {
  const promptKey = process.argv[2] || 'meme-sinus-spray';

  if (promptKey === 'list') {
    console.log('\n🎬 Available Meme + Educational Prompts:\n');
    Object.entries(MEME_PROMPTS).forEach(([key, val]) => {
      console.log(`  ${key.padEnd(25)} ${val.title} (${val.duration_seconds}s)`);
    });
    console.log('\nUsage: node video-scripts/generate-and-post-reel.js <key>');
    console.log('Default: meme-sinus-spray\n');
    return;
  }

  if (!MEME_PROMPTS[promptKey]) {
    console.error(`Unknown prompt: ${promptKey}`);
    console.log('Run with "list" to see options');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════');
  console.log('  AYUSOMAM HERBALS — Video Reel Pipeline');
  console.log('═══════════════════════════════════════════════\n');

  // Step 1: Generate video
  console.log('📹 STEP 1: Generate Video via Google Veo 3.1\n');
  const videoPath = await generateVideo(promptKey);

  if (!videoPath) {
    console.error('\nVideo generation failed — cannot proceed to upload');
    process.exit(1);
  }

  // Step 2: Upload to Instagram as Reel
  console.log('\n📱 STEP 2: Upload to Instagram as Reel\n');
  const template = MEME_PROMPTS[promptKey];
  await uploadReelToInstagram(videoPath, template.caption_hi);

  console.log('\n═══════════════════════════════════════════════');
  console.log('  PIPELINE COMPLETE');
  console.log('  Video: ' + videoPath);
  console.log('═══════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Pipeline failed:', err.message);
  process.exit(1);
});
