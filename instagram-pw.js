// instagram-pw.js
// Playwright-based Instagram DM handler for Ayusomam Herbals bot.
// Polls Instagram DMs every 3 minutes via headless Chromium browser.
// No Meta API token needed — uses real browser session.
//
// Requires env vars: INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD, TOTP_SECRET
// TOTP_SECRET: base32 key from Instagram's authenticator app setup (e.g. "JBSWY3DPEHPK3PXP")

let igBrowser = null;
let igContext  = null;
let igPage     = null;
let igReady    = false;

const igSeenMessages = new Set();
const igThreadUrls   = new Map();

let _db, _handleMessage, _sleep;
let _igUsername, _igPassword;

// ── TOTP generator (no external deps — uses Node built-in crypto) ─────────────
function generateTOTP(secret) {
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
  const time = Math.floor(Date.now() / 1000 / 30);
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigUInt64BE(BigInt(time));
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuf);
  const digest = hmac.digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (
    ((digest[offset]     & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) <<  8) |
     (digest[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

// ── Cookie persistence (Firestore) ──────────────────────────────────────────
async function loadIgCookies() {
  if (!_db) return null;
  try {
    const doc = await _db.collection('config').doc('ig_cookies').get();
    if (doc.exists) return doc.data().cookies;
  } catch (e) {}
  return null;
}
function saveIgCookies(cookies) {
  if (!_db) return;
  _db.collection('config').doc('ig_cookies')
    .set({ cookies, savedAt: Date.now() })
    .catch(e => console.error('[IG-PW] Cookie save error:', e.message));
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function initPlaywrightIG(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD) {
  _igUsername = INSTAGRAM_USERNAME;
  _igPassword  = INSTAGRAM_PASSWORD;
  try {
    const { chromium } = require('playwright');
    igBrowser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process',
        '--disable-blink-features=AutomationControlled',
        '--lang=en-US,en',
      ]
    });
    igContext = await igBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport:  { width: 1280, height: 800 },
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    await igContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
    });
    igPage = await igContext.newPage();

    const saved = await loadIgCookies();
    if (saved && saved.length > 0) {
      await igContext.addCookies(saved);
      console.log('[IG-PW] Loaded saved cookies:', saved.length);
    }

    await igPage.goto('https://www.instagram.com/direct/inbox/', { timeout: 30000 });
    await _sleep(3000);
    console.log('[IG-PW] Init inbox URL:', igPage.url());

    if (igPage.url().includes('login')) {
      console.log('[IG-PW] Session expired — logging in...');
      await loginInstagramPW(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD);
    } else {
      console.log('[IG-PW] Session restored from cookies');
    }

    igReady = true;
    console.log('Instagram Playwright: ready, polling every 3 min');
    console.log('[IG-PW] Module loaded and ready');
    setInterval(pollInstagramDMs, 3 * 60 * 1000);
  } catch (e) {
    console.error('[IG-PW] Init error:', e.message);
    setTimeout(() => initPlaywrightIG(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD), 5 * 60 * 1000);
  }
}

// ── Login ────────────────────────────────────────────────────────────────────
async function loginInstagramPW(username = _igUsername, password = _igPassword) {
  try {
    await igPage.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await _sleep(3000);
    console.log('[IG-PW] Login page URL:', igPage.url());

    const cookieBtn = igPage.locator('button:has-text("Allow all cookies"), button:has-text("Accept all"), button:has-text("Allow essential and optional cookies")').first();
    if (await cookieBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cookieBtn.click();
      await _sleep(2000);
    }

    const tryFill = async (selectors, value) => {
      for (const sel of selectors) {
        const found = await igPage.$(sel).catch(() => null);
        if (found) { console.log('[IG-PW] Using selector:', sel); await found.fill(value); return true; }
      }
      return false;
    };
    const unameSelectors = ['input[name="username"]','input[aria-label*="username" i]','input[autocomplete="username"]','input[type="text"]'];
    const pwSelectors    = ['input[name="password"]','input[aria-label*="password" i]','input[autocomplete="current-password"]','input[type="password"]'];

    const gotUname = await tryFill(unameSelectors, username);
    if (!gotUname) throw new Error('Username input not found');
    const gotPw = await tryFill(pwSelectors, password);
    if (!gotPw) throw new Error('Password input not found');

    const submitBtn = await igPage.$('button[type="submit"], button:has-text("Log in"), button:has-text("Log In")').catch(() => null);
    if (submitBtn) { await submitBtn.click(); }
    else { await igPage.keyboard.press('Enter'); }
    await _sleep(6000);
    console.log('[IG-PW] Post-submit URL:', igPage.url());

    // ── Handle Two-Factor Authentication ──────────────────────────────────────
    if (igPage.url().includes('two_factor') || igPage.url().includes('challenge')) {
      console.log('[IG-PW] 2FA page detected:', igPage.url());
      const totpSecret = process.env.TOTP_SECRET;
      if (!totpSecret) {
        throw new Error('2FA required but TOTP_SECRET env var is not set');
      }
      // Log 2FA page to diagnose which method Instagram is showing
      const pageText2fa = await igPage.evaluate(() => document.body.innerText).catch(() => '');
      console.log('[IG-PW] 2FA page text:', pageText2fa.slice(0, 400).replace(/\n/g, ' | '));

      // Instagram defaults to SMS 2FA — try to switch to authenticator app first
      try {
        const allEls = await igPage.$$('a, button, span[role="button"]');
        for (const el of allEls) {
          const txt = (await el.textContent().catch(() => '')).trim();
          if (/authentication app|authenticator app|use an app|use app|totp/i.test(txt)) {
            console.log('[IG-PW] Switching to authenticator app, clicked:', txt);
            await el.click();
            await _sleep(2000);
            break;
          }
        }
      } catch(e) { console.log('[IG-PW] Auth-app switch error (non-fatal):', e.message); }

      const totpCode = generateTOTP(totpSecret);
      console.log('[IG-PW] Generated TOTP code:', totpCode);
      const codeInput = await igPage.$(
        'input[name="verificationCode"], input[aria-label*="code" i], input[inputmode="numeric"], input[type="number"], input[autocomplete="one-time-code"]'
      ).catch(() => null);
      if (codeInput) {
        await codeInput.click();
        await _sleep(300);
        await codeInput.fill('');
        await _sleep(200);
        await codeInput.fill(totpCode);
        await _sleep(500);
        const twoFaSubmit = await igPage.$('button[type="submit"]').catch(() => null);
        if (twoFaSubmit) { await twoFaSubmit.click(); }
        else { await igPage.keyboard.press('Enter'); }
        await _sleep(6000);
        console.log('[IG-PW] Post-2FA URL:', igPage.url());
      } else {
        throw new Error('2FA input not found on two_factor page');
      }
    }

    // Dismiss "Save your login info?" and "Turn on notifications?" prompts
    const notNow1 = igPage.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
    if (await notNow1.isVisible({ timeout: 4000 }).catch(() => false)) await notNow1.click();
    await _sleep(1000);
    const notNow2 = igPage.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
    if (await notNow2.isVisible({ timeout: 4000 }).catch(() => false)) await notNow2.click();
    await _sleep(1000);

    const cookies = await igContext.cookies();
    const sessionCookie = cookies.find(c => c.name === 'sessionid');
    console.log('[IG-PW] Cookies:', cookies.length, '| sessionid:', sessionCookie ? 'PRESENT' : 'MISSING');
    saveIgCookies(cookies);
    console.log('[IG-PW] Logged in, cookies saved');

    await igPage.goto('https://www.instagram.com/direct/inbox/', { timeout: 30000 });
    await _sleep(3000);
    console.log('[IG-PW] Post-login inbox URL:', igPage.url());
  } catch (e) {
    console.error('[IG-PW] Login error:', e.message);
  }
}

// ── Poll DMs ─────────────────────────────────────────────────────────────────
async function pollInstagramDMs() {
  if (!igReady || !igPage) return;
  try {
    await igPage.goto('https://www.instagram.com/direct/inbox/', { timeout: 30000 });
    await _sleep(3000);
    console.log('[IG-PW] Poll URL:', igPage.url());

    if (igPage.url().includes('login')) {
      console.log('[IG-PW] Session expired — re-logging in...');
      await loginInstagramPW();
      console.log('[IG-PW] Post-relogin URL:', igPage.url());
      if (igPage.url().includes('login')) {
        console.log('[IG-PW] Still on login after re-login — aborting poll');
        return;
      }
    }

    const allLinks = await igPage.$$('a[href*="/direct/t/"]');
    const seenHrefs = new Set();
    const threads = [];
    for (const link of allLinks) {
      const href = await link.getAttribute('href').catch(() => null);
      if (href && !seenHrefs.has(href)) { seenHrefs.add(href); threads.push({ link, href }); }
    }
    console.log('[IG-PW] Found ' + threads.length + ' DM threads');

    for (const { link, href } of threads.slice(0, 8)) {
      try {
        await link.click();
        await _sleep(2500);

        const threadUrl = igPage.url();
        const threadId  = href.replace(/\//g, '').replace('directt', '');
        const senderId  = 'ig_pw_' + threadId;

        const msgEls = await igPage.$$(
          'div[class*="_aa6j"], div[dir="auto"]:not(header *), [class*="messageText"]'
        );
        if (msgEls.length === 0) continue;

        const lastEl  = msgEls[msgEls.length - 1];
        const msgText = (await lastEl.textContent().catch(() => '')).trim();
        if (!msgText || msgText.length < 2) continue;

        const msgId = threadId + '::' + msgText.substring(0, 60);
        if (igSeenMessages.has(msgId)) continue;
        igSeenMessages.add(msgId);
        igThreadUrls.set(senderId, threadUrl);

        console.log('[IG-PW] DM (' + threadId + '): "' + msgText.substring(0, 80) + '"');

        _handleMessage(senderId, msgText, 'instagram_playwright')
          .catch(e => console.error('[IG-PW] handleMessage error:', e.message));

        await _sleep(2000);
      } catch (e) {
        console.error('[IG-PW] Thread error:', e.message);
      }
    }

    saveIgCookies(await igContext.cookies());
  } catch (e) {
    console.error('[IG-PW] Poll error:', e.message);
    igReady = false;
    setTimeout(pollInstagramDMs, 5 * 60 * 1000);
  }
}

// ── Send reply ────────────────────────────────────────────────────────────────
async function sendInstagramMessagePW(senderId, text) {
  if (!igPage) { console.error('[IG-PW] No browser page'); return; }
  try {
    const threadUrl = igThreadUrls.get(senderId);
    if (threadUrl && !igPage.url().includes(threadUrl.split('/').pop())) {
      await igPage.goto(threadUrl, { timeout: 15000 });
      await _sleep(2000);
    }

    const inputEl = await igPage.waitForSelector(
      '[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-testid], textarea[placeholder*="essage"]',
      { timeout: 8000 }
    ).catch(() => null);

    if (!inputEl) { console.error('[IG-PW] Message input not found'); return; }

    await inputEl.click();
    await _sleep(300);
    await inputEl.fill(text);
    await _sleep(300);
    await igPage.keyboard.press('Enter');
    await _sleep(500);

    console.log('[IG-PW] Reply sent to', senderId);
  } catch (e) {
    console.error('[IG-PW] Send error:', e.message);
  }
}

// ── Module export ─────────────────────────────────────────────────────────────
module.exports = {
  async init({ db, handleMessage, sleep, INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD }) {
    _db            = db;
    _handleMessage = handleMessage;
    _sleep         = sleep;
    await initPlaywrightIG(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD);
    return sendInstagramMessagePW;
  }
};
