'use strict';
/* =============================================================================
   AYUSOMAM HERBALS BOT — v2.0
   Multi-channel sinus treatment sales & support bot
   Channels : WhatsApp (Twilio) | Facebook Messenger | Meta WA Cloud | Website
   AI       : Claude Haiku (Anthropic)
   Database : Firebase Firestore  (leads + messages subcollection)
   Logging  : Google Sheets via Apps Script
   Alerts   : Email via Apps Script when lead needs human attention
   Follow-up: Auto follow-up scheduler (Day 3 / 5 / 7 after silence)
   Host     : Render — auto-deploys on every push to main
============================================================================= */

// ─── IMPORTS ─────────────────────────────────────────────────────────────────
const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const admin     = require('firebase-admin');
const twilio    = require('twilio');
const fetch     = require('node-fetch');

// ─── ENVIRONMENT VARIABLES ───────────────────────────────────────────────────
const PORT           = process.env.PORT           || 3000;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const TWILIO_SID     = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA_FROM = process.env.TWILIO_WHATSAPP_NUMBER || '+15559069156';
const PAGE_TOKEN     = process.env.PAGE_ACCESS_TOKEN;
const WA_TOKEN       = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID    = process.env.WHATSAPP_PHONE_NUMBER_ID || '1096062696916207';
const VERIFY_TOKEN   = process.env.VERIFY_TOKEN   || 'ayusomam_admin_2024';
const PAYMENT_499    = process.env.PAYMENT_499_LINK  || '';
const PAYMENT_1299   = process.env.PAYMENT_1299_LINK || '';
const SHEET_URL      = process.env.GOOGLE_SHEET_URL;
const IG_USERNAME    = process.env.INSTAGRAM_USERNAME;
const IG_PASSWORD    = process.env.INSTAGRAM_PASSWORD;
const ADMIN_SECRET   = process.env.ADMIN_SECRET   || 'ayusomam_admin_2024';
const ALERT_EMAIL    = 'deamonslayer117@gmail.com';

// ─── FIREBASE INIT ────────────────────────────────────────────────────────────
let db;
let fbError = null;
try {
  // Supports FIREBASE_SERVICE_ACCOUNT (single JSON string) or individual vars
  const fbCred = process.env.FIREBASE_SERVICE_ACCOUNT
    ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : admin.credential.cert({
        type:           'service_account',
        project_id:     process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key:    (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        client_email:   process.env.FIREBASE_CLIENT_EMAIL,
        client_id:      process.env.FIREBASE_CLIENT_ID,
      });
  admin.initializeApp({ credential: fbCred });
  db = admin.firestore();
  console.log('[Firebase] Connected');
} catch (e) {
  fbError = e.message;
  console.warn('[Firebase] Init failed:', e.message);
}

// ─── ANTHROPIC ────────────────────────────────────────────────────────────────
const ai = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ─── TWILIO ───────────────────────────────────────────────────────────────────
let twilioClient;
try { twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN); } catch (e) {}

// ─── EXPRESS ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── UTILITIES ────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc   = v  => String(v || '-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function fmtTime(ts) {
  if (!ts) return '-';
  const ms = ts && ts._seconds ? ts._seconds * 1000 : Number(ts);
  return new Date(ms).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── FIRESTORE HELPERS ────────────────────────────────────────────────────────
const LEAD_DEFAULTS = () => ({
  name: null, username: null, phone: null,
  platform: 'unknown', state: 'new',
  lang: null, sinusType: null, duration: null,
  symptoms: null, usedAllopathy: null,
  selectedPlan: null, enrolledAt: null,
  createdAt: Date.now(), lastMessageAt: Date.now(),
  ghostAttempts: 0, needsAttention: false,
});

async function getLead(userId) {
  if (!db) return LEAD_DEFAULTS();
  try {
    const doc = await db.collection('leads').doc(String(userId)).get();
    return doc.exists ? { ...LEAD_DEFAULTS(), ...doc.data() } : LEAD_DEFAULTS();
  } catch (e) { return LEAD_DEFAULTS(); }
}

async function saveLead(userId, updates) {
  if (!db) return;
  try {
    await db.collection('leads').doc(String(userId)).set(
      { ...updates, lastMessageAt: Date.now() },
      { merge: true }
    );
  } catch (e) { console.warn('[DB] saveLead:', e.message); }
}

async function addMsg(userId, role, content) {
  if (!db || !content) return;
  try {
    await db.collection('leads').doc(String(userId))
      .collection('messages').add({
        role,
        content: String(content),
        ts: Date.now(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch (e) {}
}

async function getHistory(userId, limit = 20) {
  if (!db) return [];
  try {
    const snap = await db.collection('leads').doc(String(userId))
      .collection('messages')
      .orderBy('ts', 'desc')
      .limit(limit)
      .get();
    const msgs = [];
    snap.forEach(d => msgs.push(d.data()));
    return msgs.reverse();
  } catch (e) { return []; }
}

// ─── AI ENGINE ────────────────────────────────────────────────────────────────

function stateGuide(state) {
  const p499  = PAYMENT_499  || '[Payment link: set PAYMENT_499_LINK env var]';
  const p1299 = PAYMENT_1299 || '[Payment link: set PAYMENT_1299_LINK env var]';
  const guides = {
    new: `First contact with this person.
- Greet them warmly in 1-2 short lines.
- Ask what sinus issue they are facing.
- Set nextState to "qualifying".`,

    qualifying: `You are gathering information to recommend the right program. Collect ONE at a time:
1. Main symptoms (blocked nose, headache, runny nose, etc.)
2. How long they have had the sinus problem
3. Whether they have tried allopathy medicines
Ask only ONE question per message. Once you have all three pieces of information, present the Ayusomam program and set nextState to "pitched".
If you still need info, keep nextState as "qualifying".`,

    pitched: `The program has been presented. Handle objections warmly and confidently.
Program options:
- Chronic or long-term cases (>6 months): recommend 14-day Core Rs.1299 with link: ${p1299}
- Mild or short-term cases (<6 months): recommend 7-day Starter Rs.499 with link: ${p499}
If they want to buy or ask for the link, share the appropriate payment link and set nextState to "awaiting_payment".
If they ask a complex medical question beyond your knowledge, set nextState to "needs_human".`,

    awaiting_payment: `The payment link has been sent. They have not confirmed payment yet.
- If they say they paid or ask what happens next, set nextState to "enrolled".
- If they have cold feet, reassure them with a brief testimonial or reminder of what they get.
- Keep nextState as "awaiting_payment" unless they confirm.`,

    enrolled: `The customer has paid and enrolled. Welcome them warmly.
- Tell them Sachin will personally guide them through the program.
- They will receive all details on WhatsApp shortly.
- Keep nextState as "enrolled".`,

    needs_human: `This customer needs Sachin to personally step in.
- Tell them warmly that Sachin himself will reach out within a few hours.
- Keep nextState as "needs_human".`,

    ghosted: `This customer has not responded in several days. Re-engage them gently.
- Start with an observation about their sinus condition (not a question).
- Remind them you are still here to help.
- End with one simple yes/no question.
- Set nextState to "qualifying".`,
  };
  return guides[state] || guides.new;
}

function buildSystemPrompt(user) {
  const parts = [
    user.name        ? `Name: ${user.name}`              : null,
    user.sinusType   ? `Sinus type: ${user.sinusType}`   : null,
    user.duration    ? `Problem duration: ${user.duration}` : null,
    user.symptoms    ? `Symptoms: ${user.symptoms}`      : null,
    user.usedAllopathy != null ? `Tried allopathy: ${user.usedAllopathy}` : null,
    user.selectedPlan ? `Interested plan: ${user.selectedPlan}` : null,
  ].filter(Boolean);
  const profile = parts.length ? parts.join(' | ') : 'No information collected yet';

  return `You are the automated sales and support assistant for Ayusomam Herbals, an Ayurvedic sinus treatment business run by Sachin.

ABOUT AYUSOMAM:
Treats the root cause of chronic sinus through herbal remedies, Ayurvedic protocol, and diet and lifestyle guidance. Two programs: 7-day Starter (Rs.499) for first-timers, and 14-day Core (Rs.1299) for chronic sufferers. No surgery. No heavy medication. Personalized guidance from Sachin.

LANGUAGE RULE:
Match the customer's language exactly. If they write in Hindi, reply in Hindi. English to English. Hinglish to Hinglish. Tamil, Telugu, Bengali, Marathi, Gujarati - match that language. Never switch unless they do first.

TONE AND STYLE:
- Professional, warm, expert authority
- Lead with clinical insight, not emotional sympathy. Example: "5 saal ke baad nasal lining permanently inflamed ho jaati hai - isliye regular medicines kaam nahi karti."
- Maximum 4-5 lines per message. One idea per message.
- Never use em dashes. Use full stops or new lines instead.
- No bullet points in messages. Use numbered lists only if listing multiple things.
- Never say "bhai" or "didi". Always use "aap".
- Prefer yes/no questions to reduce typing effort.

CUSTOMER PROFILE:
${profile}

CURRENT STATE: ${user.state}

YOUR TASK:
${stateGuide(user.state)}

RESPONSE FORMAT:
Respond with ONLY a raw JSON object - no markdown, no code block, no explanation. Example:
{"reply":"your message to the customer","nextState":"qualifying","name":null,"sinusType":null,"duration":null,"symptoms":null,"usedAllopathy":null,"selectedPlan":null}

Fields: reply is the message to send. nextState is the new conversation state. Only set extracted fields if the customer mentioned them - otherwise null.`;
}

async function getAIReply(user, history, userMsg) {
  try {
    const rawMessages = [
      ...history.map(m => ({
        role: (m.role === 'bot' || m.role === 'assistant') ? 'assistant' : 'user',
        content: String(m.content || ''),
      })),
      { role: 'user', content: String(userMsg) },
    ];

    // Merge consecutive same-role messages (Claude requires strict alternation)
    const messages = [];
    for (const m of rawMessages) {
      if (messages.length && messages[messages.length - 1].role === m.role) {
        messages[messages.length - 1].content += '\n' + m.content;
      } else {
        messages.push({ ...m });
      }
    }

    const resp = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(user),
      messages: messages.length ? messages : [{ role: 'user', content: String(userMsg) }],
    });

    const text = (resp.content[0].text || '').trim();

    try {
      return JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (e2) {}
      }
      return { reply: text, nextState: user.state };
    }
  } catch (e) {
    console.error('[AI] Error:', e.message);
    return {
      reply: 'Ek second please - abhi thodi technical dikkat aa rahi hai. Thodi der mein dobara try karein.',
      nextState: user.state,
    };
  }
}

// ─── CHANNEL SENDERS ──────────────────────────────────────────────────────────

async function sendTwilio(to, body) {
  if (!twilioClient) return;
  const from = TWILIO_WA_FROM.startsWith('whatsapp:') ? TWILIO_WA_FROM : `whatsapp:${TWILIO_WA_FROM}`;
  const dest = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  await twilioClient.messages.create({ from, to: dest, body });
}

async function sendFBMessage(userId, text) {
  if (!PAGE_TOKEN) return;
  await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: userId }, message: { text } }),
  });
}

async function sendMetaWA(to, body) {
  if (!WA_TOKEN) return;
  await fetch(`https://graph.facebook.com/v17.0/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
}

let sendInstagramMessagePW = null;

async function sendMessage(platform, userId, text) {
  if (!text || !userId) return;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 1400) {
    const cut = remaining.lastIndexOf('\n', 1400) > 800 ? remaining.lastIndexOf('\n', 1400) : 1400;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);

  for (const chunk of chunks) {
    if (platform === 'twilio')        await sendTwilio(userId, chunk);
    else if (platform === 'facebook') await sendFBMessage(userId, chunk);
    else if (platform === 'whatsapp') await sendMetaWA(userId, chunk);
    else if ((platform === 'instagram' || platform === 'instagram_playwright') && sendInstagramMessagePW)
      await sendInstagramMessagePW(userId, chunk);
    if (chunks.length > 1) await sleep(600);
  }
}

// ─── CORE MESSAGE HANDLER ─────────────────────────────────────────────────────

async function handleMessage(userId, text, platform, meta = {}) {
  if (!userId || !text || !text.trim()) return;
  try {
    console.log(`[MSG] ${platform} | ${String(userId).slice(-8)} | ${text.substring(0, 80)}`);

    const user = await getLead(userId);

    if (!user.platform || user.platform === 'unknown') user.platform = platform;
    if (meta.phone && !user.phone) user.phone = meta.phone;
    if (meta.name  && !user.name)  user.name  = meta.name;

    const history = await getHistory(userId, 20);
    const aiResp  = await getAIReply(user, history, text.trim());
    if (!aiResp || !aiResp.reply) return;

    const { reply, nextState } = aiResp;

    const updates = {
      platform: user.platform,
      state:    nextState || user.state,
    };
    if (meta.phone) updates.phone = user.phone || meta.phone;
    if (aiResp.name        && !user.name)        updates.name        = aiResp.name;
    if (aiResp.username    && !user.username)    updates.username    = aiResp.username;
    if (aiResp.sinusType   && !user.sinusType)   updates.sinusType   = aiResp.sinusType;
    if (aiResp.duration    && !user.duration)    updates.duration    = aiResp.duration;
    if (aiResp.symptoms    && !user.symptoms)    updates.symptoms    = aiResp.symptoms;
    if (aiResp.usedAllopathy != null && user.usedAllopathy == null)
      updates.usedAllopathy = aiResp.usedAllopathy;
    if (aiResp.selectedPlan && !user.selectedPlan)
      updates.selectedPlan = aiResp.selectedPlan;
    if (nextState === 'enrolled' && !user.enrolledAt)
      updates.enrolledAt = Date.now();
    if (nextState === 'needs_human')
      updates.needsAttention = true;
    if (!user.createdAt)
      updates.createdAt = Date.now();

    await saveLead(userId, updates);
    await addMsg(userId, 'user', text.trim());
    await addMsg(userId, 'bot', reply);
    await sendMessage(platform, userId, reply);

    logToSheet(userId, platform, updates.name || user.name, text, reply, updates.state).catch(() => {});
    if (nextState === 'needs_human' && !user.needsAttention) {
      sendAlertEmail(userId, { ...user, ...updates }, text, reply).catch(() => {});
    }

  } catch (e) {
    console.error('[handleMessage] Error:', e.message, e.stack && e.stack.split('\n')[1]);
  }
}

// ─── GOOGLE SHEETS LOGGING ────────────────────────────────────────────────────

async function logToSheet(userId, platform, name, userMsg, botReply, state) {
  if (!SHEET_URL) return;
  try {
    await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'log', timestamp: new Date().toISOString(),
        userId: String(userId).replace('whatsapp:', ''),
        platform, name: name || '', state, userMsg, botReply,
      }),
    });
  } catch (e) {}
}

// ─── EMAIL ALERTS (via Google Apps Script) ───────────────────────────────────

async function sendAlertEmail(userId, user, userMsg, botReply) {
  if (!SHEET_URL) return;
  try {
    await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'email', to: ALERT_EMAIL,
        subject: `[Ayusomam] Lead needs attention: ${user.name || userId}`,
        body: [
          `Lead: ${user.name || 'Unknown'} (${userId})`,
          `Platform: ${user.platform}`, `State: ${user.state}`, '',
          `Customer said: "${userMsg}"`, `Bot replied: "${botReply}"`, '',
          `Dashboard: https://bot.ayusomamherbals.com/dashboard?secret=${ADMIN_SECRET}`,
        ].join('\n'),
      }),
    });
  } catch (e) {}
}

// ─── WEBHOOK ROUTES ───────────────────────────────────────────────────────────

app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN)
    return res.send(req.query['hub.challenge']);
  res.status(403).send('Forbidden');
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (!body || !body.entry) return;
  for (const entry of body.entry) {
    for (const event of (entry.messaging || [])) {
      if (!event.message || !event.message.text || event.message.is_echo) continue;
      const platform = body.object === 'instagram' ? 'instagram' : 'facebook';
      handleMessage(String(event.sender.id), event.message.text, platform).catch(() => {});
    }
  }
});

app.post(['/twilio-webhook', '/twilio'], async (req, res) => {
  res.sendStatus(200);
  const from = req.body.From || '';
  const text = (req.body.Body || '').trim();
  if (!from || !text) return;
  const phone = from.replace('whatsapp:', '');
  handleMessage(phone, text, 'twilio', { phone }).catch(() => {});
});

app.get('/whatsapp-webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN)
    return res.send(req.query['hub.challenge']);
  res.status(403).send('Forbidden');
});

app.post('/whatsapp-webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg    = change?.messages?.[0];
    if (!msg || msg.type !== 'text') return;
    const name = change?.contacts?.[0]?.profile?.name || null;
    handleMessage(msg.from, msg.text.body, 'whatsapp', { phone: msg.from, name }).catch(() => {});
  } catch (e) {}
});

app.get('/instagram-webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN)
    return res.send(req.query['hub.challenge']);
  res.status(403).send('Forbidden');
});

app.get('/widget', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ayusomam Chat</title>
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,sans-serif}
body{display:flex;flex-direction:column;height:100vh;background:#f0f2f5}
#msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px}
.u{align-self:flex-end;background:#dcf8c6;padding:10px 14px;border-radius:18px 18px 4px 18px;max-width:75%;font-size:14px}
.b{align-self:flex-start;background:#fff;padding:10px 14px;border-radius:18px 18px 18px 4px;max-width:75%;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)}
#form{display:flex;padding:12px;gap:8px;background:#fff;border-top:1px solid #e5e7eb}
#inp{flex:1;padding:10px 16px;border:1px solid #d1d5db;border-radius:24px;outline:none;font-size:14px}
#btn{background:#2d6a4f;color:#fff;border:none;border-radius:24px;padding:10px 20px;cursor:pointer;font-size:14px}
</style></head><body>
<div id="msgs"><div class="b">Namaste! Kya aapko sinus ki problem hai? Batayein, hum aapki madad karenge.</div></div>
<form id="form"><input id="inp" placeholder="Message..." autocomplete="off"/><button id="btn" type="submit">Send</button></form>
<script>
const uid='widget_'+Math.random().toString(36).slice(2);
const msgs=document.getElementById('msgs');
const inp=document.getElementById('inp');
document.getElementById('form').onsubmit=async(e)=>{
  e.preventDefault();const t=inp.value.trim();if(!t)return;inp.value='';
  msgs.innerHTML+='<div class="u">'+t+'</div>';msgs.scrollTop=msgs.scrollHeight;
  const r=await fetch('/widget-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:uid,message:t})});
  const d=await r.json();
  msgs.innerHTML+='<div class="b">'+(d.reply||'...')+'</div>';msgs.scrollTop=msgs.scrollHeight;
};
</script></body></html>`);
});

app.post('/widget-chat', async (req, res) => {
  const { userId, message } = req.body || {};
  if (!userId || !message) return res.json({ reply: 'Error: missing fields' });
  try {
    const user    = await getLead(userId);
    const history = await getHistory(userId, 20);
    const aiResp  = await getAIReply(user, history, message);
    const reply   = aiResp.reply || '';
    const updates = { platform: 'website', state: aiResp.nextState || user.state };
    ['name','sinusType','duration','symptoms','selectedPlan'].forEach(f => {
      if (aiResp[f] != null) updates[f] = aiResp[f];
    });
    await saveLead(userId, updates);
    await addMsg(userId, 'user', message);
    await addMsg(userId, 'bot', reply);
    res.json({ reply });
  } catch (e) {
    res.json({ reply: 'Kuch technical dikkat aa rahi hai. Thodi der mein dobara try karein.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0', firebase: !!db, fbError: fbError || undefined, ig: !!sendInstagramMessagePW, time: new Date().toISOString() });
});

// ─── INSTAGRAM POLLING (Playwright) ──────────────────────────────────────────

if (IG_USERNAME && IG_PASSWORD) {
  try {
    const igMod = require('./instagram-pw');
    igMod.init({
      handleMessage, sleep,
      INSTAGRAM_USERNAME: IG_USERNAME,
      INSTAGRAM_PASSWORD: IG_PASSWORD,
      db,
      saveUsername: async (userId, username, name) => {
        const lead = await getLead(userId);
        const upd = {};
        if (username && !lead.username) upd.username = username;
        if (name     && !lead.name)     upd.name     = name;
        if (Object.keys(upd).length) await saveLead(userId, upd);
      },
    }).then(fn => {
      sendInstagramMessagePW = fn;
      console.log('[Instagram] Playwright polling started');
    }).catch(e => console.warn('[Instagram] Init failed:', e.message));
  } catch (e) {
    console.warn('[Instagram] Module not found, skipping:', e.message);
  }
}

// ─── FOLLOW-UP SCHEDULER ──────────────────────────────────────────────────────

const FOLLOWUP_DAYS = [3, 5, 7];

async function runFollowups() {
  if (!db) return;
  console.log('[Followup] Running check...');
  try {
    const now  = Date.now();
    const snap = await db.collection('leads')
      .where('state', 'in', ['qualifying', 'pitched', 'awaiting_payment'])
      .get();

    let sent = 0;
    for (const doc of snap.docs) {
      try {
        const user      = doc.data();
        const userId    = doc.id;
        const daysSince = (now - (Number(user.lastMessageAt) || now)) / 86400000;
        const attempts  = Number(user.ghostAttempts) || 0;
        if (attempts >= 3) continue;
        if (daysSince < (FOLLOWUP_DAYS[attempts] || 7)) continue;

        const history = await getHistory(userId, 10);
        const aiResp  = await getAIReply(
          { ...user, state: 'ghosted' }, history,
          '[SYSTEM: Customer has not responded. Send a gentle re-engagement message. Start with a statement, not a question.]'
        );

        if (aiResp && aiResp.reply) {
          await sendMessage(user.platform, userId, aiResp.reply);
          await addMsg(userId, 'bot', aiResp.reply);
          await saveLead(userId, { ghostAttempts: attempts + 1 });
          logToSheet(userId, user.platform, user.name, '[followup]', aiResp.reply, 'ghosted').catch(() => {});
          sent++;
          console.log(`[Followup] Sent to ${String(userId).slice(-8)} (attempt ${attempts + 1})`);
        }
        await sleep(3000);
      } catch (e) { continue; }
    }
    if (sent > 0) console.log(`[Followup] Done - sent ${sent} messages`);
  } catch (e) {
    console.warn('[Followup] Error:', e.message);
  }
}

setInterval(runFollowups, 6 * 60 * 60 * 1000);
setTimeout(runFollowups, 60 * 1000);

// ─── ADMIN API ────────────────────────────────────────────────────────────────

app.get('/admin/data', async (req, res) => {
  if (req.query.secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!db) return res.json({ stats: {}, leads: [] });
  try {
    const snap  = await db.collection('leads').orderBy('lastMessageAt', 'desc').limit(300).get();
    const leads = [];

    for (const doc of snap.docs) {
      const u = doc.data();
      const msgSnap = await doc.ref.collection('messages').orderBy('ts', 'desc').limit(50).get();
      const msgs = [];
      msgSnap.forEach(m => msgs.push(m.data()));
      msgs.reverse();

      leads.push({
        id: doc.id,
        name: u.name || null, username: u.username || null, phone: u.phone || null,
        platform: u.platform || 'unknown', state: u.state || 'new',
        sinusType: u.sinusType || null, duration: u.duration || null,
        symptoms: u.symptoms || null, lang: u.lang || null,
        usedAllopathy: u.usedAllopathy ?? null, selectedPlan: u.selectedPlan || null,
        enrolledAt: u.enrolledAt || null, createdAt: u.createdAt || null,
        lastMessageAt: u.lastMessageAt || null, ghostAttempts: u.ghostAttempts || 0,
        needsAttention: u.needsAttention || false, messages: msgs,
      });
    }

    const stats = {
      total:    leads.length,
      enrolled: leads.filter(u => u.state === 'enrolled').length,
      pitched:  leads.filter(u => ['pitched','awaiting_payment'].includes(u.state)).length,
      active:   leads.filter(u => !['new','enrolled','ghosted'].includes(u.state)).length,
      attention: leads.filter(u => u.needsAttention).length,
    };
    stats.conversion = stats.total ? ((stats.enrolled / stats.total) * 100).toFixed(1) + '%' : '0%';
    res.json({ stats, leads });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/reply', async (req, res) => {
  if (req.body.secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { userId, platform, message } = req.body;
  if (!userId || !platform || !message) return res.status(400).json({ error: 'Missing fields' });
  try {
    await sendMessage(platform, userId, message);
    await addMsg(userId, 'bot', message);
    await saveLead(userId, { needsAttention: false });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/attention', async (req, res) => {
  if (req.body.secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { userId, value } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  await saveLead(userId, { needsAttention: !!value });
  res.json({ ok: true });
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  if (req.query.secret !== ADMIN_SECRET) return res.status(401).send('Unauthorized');
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ayusomam Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;color:#1a1a1a;height:100vh;display:flex;flex-direction:column;overflow:hidden}
.topbar{background:linear-gradient(135deg,#1b4332,#2d6a4f);color:#fff;padding:14px 24px;display:flex;align-items:center;gap:16px;flex-shrink:0}
.topbar h1{font-size:18px;font-weight:700;flex:1}
.topbar .refresh{cursor:pointer;background:rgba(255,255,255,.15);border:none;padding:6px 12px;border-radius:6px;color:#fff;font-size:12px}
.stats{display:flex;gap:12px;padding:14px 24px;flex-shrink:0;flex-wrap:wrap}
.stat{background:#fff;border-radius:10px;padding:12px 18px;flex:1;min-width:110px;box-shadow:0 1px 3px rgba(0,0,0,.08);border-left:4px solid #2d6a4f}
.stat.warn{border-left-color:#f59e0b} .stat.bad{border-left-color:#ef4444}
.stat .n{font-size:24px;font-weight:800;color:#2d6a4f} .stat.warn .n{color:#d97706} .stat.bad .n{color:#dc2626}
.stat .l{font-size:11px;color:#6b7280;margin-top:2px}
.main{display:flex;flex:1;min-height:0}
.sidebar{width:340px;min-width:260px;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;background:#fff}
.search{padding:10px 12px;border-bottom:1px solid #f0f0f0}
.search input{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:7px 12px;font-size:13px;outline:none}
.filters{display:flex;gap:4px;border-bottom:1px solid #f0f0f0;padding:6px 10px;flex-wrap:wrap}
.filter-btn{border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;background:#f3f4f6;color:#374151}
.filter-btn.active{background:#2d6a4f;color:#fff}
.lead-list{flex:1;overflow-y:auto}
.lead-item{padding:12px 14px;border-bottom:1px solid #f5f5f5;cursor:pointer;transition:background .15s}
.lead-item:hover,.lead-item.active{background:#f0fdf4}
.lead-item .ln{font-weight:600;font-size:13px;margin-bottom:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.lead-item .lsub{font-size:11px;color:#6b7280}
.lattn{background:#ef4444;color:#fff;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:#fff}
.detail{flex:1;display:flex;flex-direction:column;min-width:0}
.detail-header{padding:14px 20px;border-bottom:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;gap:12px;flex-shrink:0}
.detail-header h2{font-size:15px;font-weight:700;flex:1}
.reply-bar{padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff;display:flex;gap:8px;flex-shrink:0}
.reply-bar input{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 14px;font-size:13px;outline:none}
.reply-bar button{background:#2d6a4f;color:#fff;border:none;border-radius:8px;padding:8px 18px;cursor:pointer;font-size:13px}
.chat-area{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px}
.msg-u{align-self:flex-end;background:#dcfce7;border-radius:14px 14px 4px 14px;padding:8px 14px;max-width:70%;font-size:13px;line-height:1.5}
.msg-b{align-self:flex-start;background:#fff;border-radius:14px 14px 14px 4px;padding:8px 14px;max-width:70%;font-size:13px;line-height:1.5;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.msg-label{font-size:10px;color:#9ca3af;margin-bottom:1px}
.info-panel{width:260px;min-width:200px;border-left:1px solid #e5e7eb;background:#fafafa;overflow-y:auto;padding:14px;flex-shrink:0}
.info-panel h3{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;margin-top:14px}
.info-panel h3:first-child{margin-top:0}
.info-row{display:flex;justify-content:space-between;margin-bottom:6px;gap:8px}
.info-row .k{font-size:11px;color:#6b7280;flex-shrink:0}
.info-row .v{font-size:11px;font-weight:600;text-align:right;word-break:break-word}
.empty{display:flex;align-items:center;justify-content:center;flex:1;color:#9ca3af;font-size:14px;flex-direction:column;gap:8px}
</style>
</head>
<body>
<div class="topbar">
  <h1>&#127807; Ayusomam Lead Dashboard</h1>
  <button class="refresh" onclick="load()">&#8635; Refresh</button>
  <span id="ts" style="font-size:11px;opacity:.7"></span>
</div>
<div class="stats" id="stats"></div>
<div class="main">
  <div class="sidebar">
    <div class="search"><input id="search" placeholder="Search name, phone..." oninput="renderList()"/></div>
    <div class="filters">
      <button class="filter-btn active" onclick="setFilter('all',this)">All</button>
      <button class="filter-btn" onclick="setFilter('attention',this)">&#128276; Needs Me</button>
      <button class="filter-btn" onclick="setFilter('active',this)">Active</button>
      <button class="filter-btn" onclick="setFilter('pitched',this)">Pitched</button>
      <button class="filter-btn" onclick="setFilter('enrolled',this)">Enrolled</button>
      <button class="filter-btn" onclick="setFilter('ghosted',this)">Ghosted</button>
    </div>
    <div class="lead-list" id="lead-list"></div>
  </div>
  <div class="detail" id="detail">
    <div class="empty"><span style="font-size:32px">&#128172;</span>Select a lead to view conversation</div>
  </div>
</div>
<script>
const SECRET=new URLSearchParams(location.search).get('secret');
let leads=[],selId=null,filter='all';
const SC={new:'#94a3b8',qualifying:'#6366f1',pitched:'#f59e0b',awaiting_payment:'#ef4444',enrolled:'#22c55e',needs_human:'#dc2626',ghosted:'#9ca3af'};
function sc(s){return SC[s]||'#94a3b8';}
function dn(l){return l.name||l.username||(l.phone?l.phone.slice(-10):null)||('ID:'+l.id.slice(-8));}
function esc(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
async function load(){
  document.getElementById('ts').textContent='Loading...';
  try{
    const r=await fetch('/admin/data?secret='+SECRET);
    const d=await r.json();
    leads=d.leads||[];renderStats(d.stats||{});renderList();
    if(selId)openLead(selId);
    document.getElementById('ts').textContent=new Date().toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'});
  }catch(e){document.getElementById('ts').textContent='Error';}
}
function renderStats(s){
  document.getElementById('stats').innerHTML=[
    ['Total Leads',s.total||0,''],['Enrolled',s.enrolled||0,''],
    ['Pitched',s.pitched||0,''],['Active',s.active||0,''],
    ['Need Attention',s.attention||0,s.attention>0?'warn':''],['Conversion',s.conversion||'0%',''],
  ].map(([l,n,c])=>'<div class="stat '+c+'"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>').join('');
}
function setFilter(f,el){
  filter=f;document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));el.classList.add('active');renderList();
}
function renderList(){
  const q=document.getElementById('search').value.toLowerCase();
  let list=leads;
  if(filter==='attention')list=list.filter(l=>l.needsAttention);
  else if(filter==='active')list=list.filter(l=>!['new','enrolled','ghosted'].includes(l.state));
  else if(filter!=='all')list=list.filter(l=>l.state===filter);
  if(q)list=list.filter(l=>(dn(l)+l.id+(l.phone||'')+(l.symptoms||'')).toLowerCase().includes(q));
  document.getElementById('lead-list').innerHTML=list.map(l=>{
    const name=dn(l);
    const ts=l.lastMessageAt?new Date(l.lastMessageAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
    const pi={facebook:'FB',instagram:'IG',twilio:'WA',whatsapp:'WA',website:'WEB'}[l.platform]||'?';
    return '<div class="lead-item'+(l.id===selId?' active':'')+'" onclick="openLead(\''+l.id+'\')">'+
      '<div class="ln">'+(l.needsAttention?'<span class="lattn">!</span>':'')+
      '<span>'+esc(name)+'</span>'+
      '<span style="font-size:10px;background:#e5e7eb;padding:1px 5px;border-radius:4px;color:#555">'+pi+'</span>'+
      '<span class="badge" style="background:'+sc(l.state)+'">'+l.state+'</span></div>'+
      '<div class="lsub">'+(l.sinusType||'')+(l.duration?' - '+l.duration:'')+' '+ts+'</div></div>';
  }).join('')||'<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">No leads found</div>';
}
function openLead(id){
  selId=id;renderList();
  const l=leads.find(x=>x.id===id);
  if(!l){document.getElementById('detail').innerHTML='<div class="empty">Not found</div>';return;}
  const msgs=(l.messages||[]).map(m=>{
    const isBot=m.role==='bot'||m.role==='assistant';
    return '<div>'+(isBot?'<div class="msg-label">Bot</div>':'<div class="msg-label" style="text-align:right">Customer</div>')+
      '<div class="'+(isBot?'msg-b':'msg-u')+'" style="'+(isBot?'':'margin-left:auto')+'">'+
      (m.content||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')+'</div></div>';
  }).join('');
  const rows=[
    ['Name',l.name],['Username',l.username?'@'+l.username:null],['Phone',l.phone],
    ['Platform',l.platform],['State',l.state],['Sinus',l.sinusType],['Duration',l.duration],
    ['Symptoms',l.symptoms],['Allopathy',l.usedAllopathy!=null?(l.usedAllopathy?'Yes':'No'):null],
    ['Plan',l.selectedPlan],['Enrolled',l.enrolledAt?new Date(l.enrolledAt).toLocaleDateString('en-IN'):null],
    ['Follow-ups',l.ghostAttempts||0],
    ['First contact',l.createdAt?new Date(l.createdAt).toLocaleDateString('en-IN'):null],
    ['Last active',l.lastMessageAt?new Date(l.lastMessageAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):null],
  ].filter(r=>r[1]!=null);
  document.getElementById('detail').innerHTML=
    '<div class="detail-header">'+
      '<div style="width:36px;height:36px;border-radius:50%;background:'+sc(l.state)+';display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700">'+
        (dn(l)[0]||'?').toUpperCase()+'</div>'+
      '<div><h2>'+esc(dn(l))+'</h2><div style="font-size:11px;color:#6b7280">'+l.id+'</div></div>'+
      (l.needsAttention?'<button onclick="clearAttn(\''+l.id+'\')" style="background:#fef2f2;border:1px solid #fecaca;color:#dc2626;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">Mark handled</button>':'')+
    '</div>'+
    '<div class="main" style="flex:1;min-height:0">'+
      '<div class="chat-area" id="ca">'+(msgs||'<div class="empty">No messages yet</div>')+'</div>'+
      '<div class="info-panel"><h3>Lead Profile</h3>'+
        rows.map(r=>'<div class="info-row"><span class="k">'+r[0]+'</span><span class="v">'+esc(String(r[1]))+'</span></div>').join('')+
      '</div></div>'+
    '<div class="reply-bar">'+
      '<input id="ri" placeholder="Send manual reply..." onkeydown="if(event.key===\'Enter\')sr(\''+l.id+'\',\''+l.platform+'\')"/>'+
      '<button onclick="sr(\''+l.id+'\',\''+l.platform+'\')">Send</button></div>';
  setTimeout(()=>{const c=document.getElementById('ca');if(c)c.scrollTop=c.scrollHeight;},50);
}
async function sr(uid,platform){
  const inp=document.getElementById('ri');const msg=inp.value.trim();if(!msg)return;
  inp.disabled=true;
  try{
    const r=await fetch('/admin/reply',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({secret:SECRET,userId:uid,platform,message:msg})});
    const d=await r.json();
    if(d.ok){inp.value='';await load();}else alert('Failed: '+(d.error||'unknown'));
  }catch(e){alert('Error');}
  inp.disabled=false;
}
async function clearAttn(uid){
  await fetch('/admin/attention',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({secret:SECRET,userId:uid,value:false})});
  await load();
}
setInterval(load,30000);load();
</script>
</body>
</html>`);
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Ayusomam Bot v2.0 running on port ${PORT}`);
  console.log(`[Server] Firebase: ${db ? 'connected' : 'NOT connected'}`);
  console.log(`[Server] Dashboard: https://bot.ayusomamherbals.com/dashboard?secret=${ADMIN_SECRET}`);
});
