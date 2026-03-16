// instagram-pw.js
// Playwright-based Instagram DM handler for Ayusomam Herbals bot.
// Polls Instagram DMs every 3 minutes via headless Chromium browser.
// No Meta API token needed — uses real browser session.
//
// Usage (called from index.js):
//   const igMod = require('./instagram-pw');
//   sendInstagramMessagePW = await igMod.init({ db, handleMessage, sleep, INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD });

let igBrowser = null;
let igContext  = null;
let igPage     = null;
let igReady    = false;

const igSeenMessages = new Set();   // dedup: "threadId::msgSnippet"
const igThreadUrls   = new Map();   // senderId -> thread URL (for replies)

let _db, _handleMessage, _sleep;

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
    // Mask navigator.webdriver to bypass Instagram bot detection
    await igContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    igPage = await igContext.newPage();

    const saved = await loadIgCookies();
    if (saved && saved.length > 0) {
      await igContext.addCookies(saved);
      console.log('[IG-PW] Loaded saved cookies');
    }

    await igPage.goto('https://www.instagram.com/direct/inbox/', { timeout: 30000 });
    await _sleep(3000);

    if (igPage.url().includes('login')) {
      console.log('[IG-PW] Session expired — logging in...');
      await loginInstagramPW(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD);
    } else {
      console.log('[IG-PW] Session restored from cookies');
    }

    igReady = true;
    console.log('Instagram Playwright: ready, polling every 3 min');
    pollInstagramDMs();
    setInterval(pollInstagramDMs, 3 * 60 * 1000);
  } catch (e) {
    console.error('[IG-PW] Init error:', e.message);
    setTimeout(() => initPlaywrightIG(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD), 5 * 60 * 1000);
  }
}

// ── Login ────────────────────────────────────────────────────────────────────
async function loginInstagramPW(username, password) {
  try {
    await igPage.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await _sleep(3000);
    console.log('[IG-PW] Login page URL:', igPage.url());
    console.log('[IG-PW] Login page title:', await igPage.title());

    // Dismiss cookie consent if present (EU/region popup)
    const cookieBtn = igPage.locator('button:has-text("Allow all cookies"), button:has-text("Accept all"), button:has-text("Allow essential and optional cookies")').first();
    if (await cookieBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cookieBtn.click();
      console.log('[IG-PW] Dismissed cookie consent');
      await _sleep(2000);
    }

    // Log page content to diagnose what Instagram is actually showing
    const pgText = await igPage.evaluate(() => (document.body || document.documentElement).innerText.substring(0, 300).replace(/\n/g,' '));
    console.log('[IG-PW] Page text:', pgText);

    // Try multiple selectors — Instagram sometimes changes input attributes
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
    if (!gotUname) throw new Error('Username input not found — see page text above');
    const gotPw = await tryFill(pwSelectors, password);
    if (!gotPw) throw new Error('Password input not found');
    // Click submit or press Enter (button selector can vary)
    const submitBtn = await igPage.$('button[type="submit"], button:has-text("Log in"), button:has-text("Log In")').catch(() => null);
    if (submitBtn) { await submitBtn.click(); }
    else { await igPage.keyboard.press('Enter'); }
    await _sleep(6000);

    const notNow1 = igPage.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
    if (await notNow1.isVisible({ timeout: 4000 }).catch(() => false)) await notNow1.click();
    await _sleep(1000);

    const notNow2 = igPage.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
    if (await notNow2.isVisible({ timeout: 4000 }).catch(() => false)) await notNow2.click();
    await _sleep(1000);

    saveIgCookies(await igContext.cookies());
    console.log('[IG-PW] Logged in, cookies saved');

    await igPage.goto('https://www.instagram.com/direct/inbox/', { timeout: 30000 });
    await _sleep(3000);
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

    if (igPage.url().includes('login')) {
      console.log('[IG-PW] Session expired — re-logging in...');
      await loginInstagramPW();
      return;
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
