const express = require('express');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

// ─── ENV VARIABLES ────────────────────────────────────────────
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const PAGE_ID = '1035532399636645';
const INSTAGRAM_ID = '17841445309536661';
const PAYMENT_LINK = 'https://rzp.io/rzp/qu8zhQT';
const WHATSAPP_NUMBER = '+91 85951 60713';
const WEBSITE = 'www.ayusomamherbals.com';
const SHEET_NAME = 'Leads';

// ─── CLIENTS ─────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const auth = new google.auth.JWT(
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });

// ─── IN-MEMORY CACHE ─────────────────────────────────────────
const userCache = {};

// ─── GOOGLE SHEETS HELPERS ────────────────────────────────────
async function findLeadRow(senderId) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:C`,
    });
    const rows = res.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][2] === senderId) return i + 1;
    }
    return null;
  } catch (err) {
    console.error('findLeadRow error:', err.message);
    return null;
  }
}

async function getLeadData(senderId) {
  if (userCache[senderId]) return userCache[senderId];
  try {
    const row = await findLeadRow(senderId);
    if (!row) return null;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A${row}:L${row}`,
    });
    const r = res.data.values?.[0] || [];
    const data = {
      timestamp: r[0] || '',
      platform: r[1] || '',
      senderId: r[2] || '',
      name: r[3] || '',
      message: r[4] || '',
      status: r[5] || 'New Lead',
      lastStage: r[6] || 'new',
      lastActive: r[7] || '',
      symptom: r[8] || '',
      notes: r[9] || '',
      sinusType: r[10] || '',
      profileJson: r[11] || '{}',
      row,
    };
    data.profile = JSON.parse(data.profileJson);
    userCache[senderId] = data;
    return data;
  } catch (err) {
    console.error('saveLead FULL error:', JSON.stringify(err, null, 2));
    console.error('saveLead message:', err.message);
    console.error('saveLead stack:', err.stack);
  }
}

async function saveLead(senderId, platform, text) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:L`,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          new Date().toISOString(),
          platform,
          senderId,
          `${platform}_${senderId}`,
          text,
          'New Lead',
          'asked_duration',
          new Date().toISOString(),
          '', '', '', '{}'
        ]]
      }
    });
    console.log('Lead saved:', senderId);
  } catch (err) {
    console.error('saveLead error:', err.message);
  }
}

async function updateLead(senderId, updates) {
  try {
    let lead = await getLeadData(senderId);
    if (!lead) return;
    const row = lead.row;
    const merged = { ...lead, ...updates };
    if (updates.profile) {
      merged.profileJson = JSON.stringify(updates.profile);
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A${row}:L${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          merged.timestamp,
          merged.platform,
          merged.senderId,
          merged.name,
          merged.message,
          merged.status,
          merged.lastStage,
          new Date().toISOString(),
          merged.symptom || '',
          merged.notes || '',
          merged.sinusType || '',
          merged.profileJson || '{}'
        ]]
      }
    });
    userCache[senderId] = { ...merged, profile: updates.profile || lead.profile };
    console.log('Lead updated:', senderId, updates.lastStage);
  } catch (err) {
    console.error('updateLead error:', err.message);
  }
}

// ─── SEND MESSAGES ────────────────────────────────────────────
async function sendFBMessage(senderId, text) {
  try {
    await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: senderId }, message: { text } })
      }
    );
  } catch (err) {
    console.error('FB send error:', err.message);
  }
}

async function sendIGMessage(senderId, text) {
  try {
    await fetch(
      `https://graph.facebook.com/v18.0/${INSTAGRAM_ID}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text },
          messaging_type: 'RESPONSE',
          access_token: PAGE_ACCESS_TOKEN
        })
      }
    );
  } catch (err) {
    console.error('IG send error:', err.message);
  }
}

// ─── CLAUDE AI ────────────────────────────────────────────────
async function getClaudeResponse(stage, userMessage, profile) {
  const systemPrompt = `You are an Ayurvedic sinus specialist assistant for Ayusomam Herbals.
You help people with chronic sinus problems through a 14-day personalized program costing ₹1299.

Your personality:
- Warm, empathetic, professional
- Speak in simple Hindi/Hinglish
- Never use complex medical jargon
- Always validate the person's pain before pitching

Current lead profile: ${JSON.stringify(profile)}
Current conversation stage: ${stage}

Sinus types:
- Allergic: sneezing, watery eyes, dust/season triggered
- Congestive: nose block, face pressure, heaviness
- Heat Sinus: burning, thick mucus, headache
- Dependency: Otrivin/spray dependent

Payment link: ${PAYMENT_LINK}
WhatsApp: ${WHATSAPP_NUMBER}
Website: ${WEBSITE}

Rules:
- Keep responses concise and conversational
- For price objections, emphasize daily personal guidance value
- If person says YES, give payment link immediately
- If person asks for specialist, say one will contact them on WhatsApp soon
- Never give up on a lead — always re-engage`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });
  return response.content[0].text;
}

// ─── PITCH MESSAGES ──────────────────────────────────────────
function getPitchMessage(sinusType, p) {
  const header = `📋 Aapka Sinus Assessment Complete ✅\n\nAapki details:\n• Problem duration: ${p.duration}\n• Main symptom: ${p.symptom}\n• Previous treatment: ${p.tried}\n• Severity: ${p.severity}\n\n`;
  const specialist = `Yeh koi app nahi. Koi generic PDF nahi.\n\nAapko milega ek dedicated Ayurvedic specialist —\n14 din tak, directly aapke WhatsApp pe.\n\nKabhi bhi symptoms feel ho — message karein.\nSpecialist personally respond karega aur\naapka protocol usi waqt adjust karega.\n`;
  const footer = `\n━━━━━━━━━━━━━━━━━━━━\n⭐ CLIENT EXPERIENCE\n━━━━━━━━━━━━━━━━━━━━\n\nShikha Tyagi ji — 5 saal se Otrivin use kar rahi thin. Ayusomam 14-day program ke baad spray naturally reduce kar li.\n\n"Pehli baar itne saalon baad khulke saans li." ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299\n━━━━━━━━━━━━━━━━━━━━\n\nKya aap apna protocol shuru karna chahte hain?\nReply karein YES 🙏\n\nAur details ke liye "MORE" type karein.\n\n🌐 ${WEBSITE}`;

  const types = {
    allergic: `━━━━━━━━━━━━━━━━━━━━\n🌿 AAPKA SINUS TYPE: ALLERGIC SINUS\n━━━━━━━━━━━━━━━━━━━━\n\nDust, pollution ya season change se trigger hoti hai. Generic solution kaam nahi karega.\n\n${specialist}\nDay 3 — discomfort kam.\nDay 7 — breathing comfortable.\nDay 14 — jo har season mein hota tha, is baar nahi hua. 🌿`,
    congestive: `━━━━━━━━━━━━━━━━━━━━\n🔴 AAPKA SINUS TYPE: CONGESTIVE SINUS\n━━━━━━━━━━━━━━━━━━━━\n\nSubah uthte hi naak band. Chehra bhaari. Steam aur saline sirf surface pe kaam karte hain.\n\n${specialist}\nDay 3 — pressure kam.\nDay 7 — subah breathing better.\nDay 14 — bina kuch kiye khulke saans. 🌿`,
    heat: `━━━━━━━━━━━━━━━━━━━━\n🔥 AAPKA SINUS TYPE: HEAT SINUS\n━━━━━━━━━━━━━━━━━━━━\n\nAndar se burning. Headache intense. Cooling protocol chahiye — generic decongestant nahi.\n\n${specialist}\nDay 3 — burning kam.\nDay 7 — headache frequency reduce.\nDay 14 — Burning gone. Clear naak. 🌿`,
    dependency: `━━━━━━━━━━━━━━━━━━━━\n⚠️ AAPKA SINUS TYPE: DEPENDENCY SINUS\n━━━━━━━━━━━━━━━━━━━━\n\nSpray ke bina breathe mushkil. Yeh aapki galti nahi — body ko naturally reset karna padega.\n\n${specialist}\nDay 3 — natural breathing improve.\nDay 7 — spray ki zaroorat kam.\nDay 14 — spray naturally reduce. 🌿`,
  };

  return header + (types[sinusType] || specialist) + footer;
}

// ─── DETECTION HELPERS ────────────────────────────────────────
function extractFirstNumber(text) {
  const match = text.match(/\d+/);
  return match ? match[0] : null;
}

function detectDuration(text) {
  const t = text.toLowerCase().trim();
  if (t === '1') return 'short';
  if (t === '2') return 'medium';
  if (t === '3') return 'long';
  if (t.match(/(6|chhe|six)\s*(month|mahine)/)) return 'short';
  if (t.match(/\b(less|kam|thodi|new|naya|abhi|recent)\b/)) return 'short';
  if (t.match(/(1|ek|one)\s*(year|saal)/)) return 'medium';
  if (t.match(/(2|do|two)\s*(year|saal)/)) return 'medium';
  if (t.match(/([3-9]|10)\s*(year|saal)/)) return 'long';
  if (t.match(/\b(bahut|kaafi|purani|saalon|long|zyada)\b/)) return 'long';
  const n = extractFirstNumber(t);
  if (n === '1') return 'short';
  if (n === '2') return 'medium';
  if (n === '3') return 'long';
  return null;
}

function detectSymptom(text) {
  const t = text.toLowerCase().trim();
  if (t === '1') return 'allergic';
  if (t === '2') return 'congestive';
  if (t === '3') return 'heat';
  if (t === '4') return 'dependency';
  if (t === '5') return 'congestive';
  if (t.match(/\b(sneez|watery|runny|allerg|dust|season|pollen)\b/)) return 'allergic';
  if (t.match(/\b(naak band|block|bhaari|heavy|pressure|congestion)\b/)) return 'congestive';
  if (t.match(/\b(burn|jalan|yellow|green|headache|sar dard)\b/)) return 'heat';
  if (t.match(/\b(otrivin|spray|depend|nasivion)\b/)) return 'dependency';
  const n = extractFirstNumber(t);
  if (n === '1') return 'allergic';
  if (n === '2') return 'congestive';
  if (n === '3') return 'heat';
  if (n === '4') return 'dependency';
  if (n === '5') return 'congestive';
  return null;
}

function detectTried(text) {
  const t = text.toLowerCase().trim();
  if (t === '1') return 'sirf nasal spray';
  if (t === '2') return 'allopathy medicines';
  if (t === '3') return 'ghar ke nuskhe';
  if (t === '4') return 'kuch nahi';
  if (t === '5') return 'other Ayurvedic';
  if (t.match(/\b(otrivin|nasal spray|nasivion|drop)\b/)) return 'sirf nasal spray';
  if (t.match(/\b(doctor|allopath|medicine|dawai|tablet)\b/)) return 'allopathy medicines';
  if (t.match(/\b(ghar|home|nuskha|gharelu|haldi)\b/)) return 'ghar ke nuskhe';
  if (t.match(/\b(kuch nahi|nothing|nahi kiya)\b/)) return 'kuch nahi';
  const n = extractFirstNumber(t);
  if (n === '1') return 'sirf nasal spray';
  if (n === '2') return 'allopathy medicines';
  if (n === '3') return 'ghar ke nuskhe';
  if (n === '4') return 'kuch nahi';
  if (n === '5') return 'other Ayurvedic';
  return null;
}

function detectSeverity(text) {
  const t = text.toLowerCase().trim();
  if (t === '1') return 'Mild';
  if (t === '2') return 'Moderate';
  if (t === '3') return 'Severe';
  if (t === '4') return 'Very Severe';
  if (t.match(/\b(mild|thoda|kabhi kabhi|halka)\b/)) return 'Mild';
  if (t.match(/\b(moderate|kaafi|medium|affect)\b/)) return 'Moderate';
  if (t.match(/\b(severe|bahut|zyada|daily|har roz)\b/)) return 'Severe';
  if (t.match(/\b(extreme|worst|mushkil|unbearable)\b/)) return 'Very Severe';
  const n = extractFirstNumber(t);
  if (n === '1') return 'Mild';
  if (n === '2') return 'Moderate';
  if (n === '3') return 'Severe';
  if (n === '4') return 'Very Severe';
  return null;
}

// ─── PROCESS MESSAGE ─────────────────────────────────────────
async function processMessage(senderId, text, platform, sendFn) {
  let lead = await getLeadData(senderId);
  const state = lead?.lastStage || 'new';
  const profile = lead?.profile || {};

  console.log(`[${platform}] ID: ${senderId} | State: ${state} | Msg: ${text}`);

  if (state === 'human_takeover') return;

  const contactKeywords = ['whatsapp', 'contact', 'call', 'phone', 'helpline', 'direct', 'number'];
  if (state !== 'done' && contactKeywords.some(k => text.toLowerCase().includes(k))) {
    await sendFn(senderId,
`Bilkul! Seedha specialist se baat karein. 🙏

📱 WhatsApp: ${WHATSAPP_NUMBER}
🌐 Website: ${WEBSITE}

Ayusomam Herbals 🌿`
    );
    return;
  }

  if (!lead) {
    await saveLead(senderId, platform, text);
    await sendFn(senderId,
`🙏 Namaste! Ayusomam Herbals mein aapka swagat hai.

Hum chronic sinus conditions ka Ayurvedic treatment karte hain — naturally, bina spray ya steroid dependency ke.

🌐 ${WEBSITE}

Personalized assessment ke liye kuch quick questions —

✦ Aapko sinus ki problem kitne samay se hai?

1️⃣ 6 mahine se kam
2️⃣ 6 mahine se 2 saal
3️⃣ 2 saal se zyada

Number ya text mein reply karein.`
    );
    return;
  }

  if (state === 'asked_duration') {
    const duration = detectDuration(text);
    if (!duration) {
      await sendFn(senderId, `Thoda aur clearly batayein — kitne mahine ya saal se hai?\n\n1️⃣ 6 mahine se kam\n2️⃣ 6 mahine se 2 saal\n3️⃣ 2 saal se zyada`);
      return;
    }
    const durationLabel = duration === 'short' ? '6 mahine se kam' : duration === 'medium' ? '6 mahine se 2 saal' : '2 saal se zyada';
    const newProfile = { ...profile, duration: durationLabel };
    await updateLead(senderId, { lastStage: 'asked_symptoms', status: '🔴 Cold', profile: newProfile });
    await sendFn(senderId,
`Noted. ✅

✦ Aapke mukhya symptoms kya hain?

1️⃣ Sneezing, watery eyes, runny nose — dust ya season change se worse
2️⃣ Naak band, chehra bhaari, sar mein pressure
3️⃣ Andar se burning, thick mucus, intense headache
4️⃣ Otrivin ya nasal spray pe dependent ho gaya
5️⃣ Raat ko neend nahi, gale mein balgam

Number ya describe karein.`
    );
    return;
  }

  if (state === 'asked_symptoms') {
    const symptom = detectSymptom(text);
    if (!symptom) {
      await sendFn(senderId, `Main symptom kya hai?\n\n1️⃣ Sneezing, watery — dust/season se\n2️⃣ Naak band, pressure\n3️⃣ Burning, thick mucus, headache\n4️⃣ Spray/Otrivin dependency\n5️⃣ Post nasal drip, neend problem`);
      return;
    }
    const symptomLabel = {
      allergic: 'Allergic — sneezing, watery, dust triggered',
      congestive: 'Congestive — naak band, pressure, heaviness',
      heat: 'Heat Sinus — burning, thick mucus, headache',
      dependency: 'Dependency — Otrivin/spray dependent'
    }[symptom];
    const newProfile = { ...profile, symptom: symptomLabel, sinusType: symptom };
    await updateLead(senderId, { lastStage: 'asked_tried', status: '🟡 Warm', symptom: symptomLabel, sinusType: symptom, profile: newProfile });
    await sendFn(senderId,
`Samajh gaya. ✅

✦ Pehle koi treatment try ki hai?

1️⃣ Sirf nasal spray
2️⃣ Doctor ki allopathy dawai
3️⃣ Ghar ke nuskhe
4️⃣ Abhi kuch nahi kiya
5️⃣ Koi aur Ayurvedic treatment

Number ya describe karein.`
    );
    return;
  }

  if (state === 'asked_tried') {
    const tried = detectTried(text);
    if (!tried) {
      await sendFn(senderId, `Kya treatment try ki thi?\n\n1️⃣ Sirf nasal spray\n2️⃣ Doctor ki dawai\n3️⃣ Ghar ke nuskhe\n4️⃣ Kuch nahi\n5️⃣ Ayurvedic treatment`);
      return;
    }
    const newProfile = { ...profile, tried };
    await updateLead(senderId, { lastStage: 'asked_severity', status: '🟡 Warm', profile: newProfile });
    await sendFn(senderId,
`Samajh gaya. ✅

✦ Sinus aapki daily life ko kitna affect karta hai?

1️⃣ Thodi problem — kabhi kabhi (Mild)
2️⃣ Kaafi problem — kaam aur neend affect (Moderate)
3️⃣ Bahut zyada — daily routine affect (Severe)
4️⃣ Extreme — normal kaam karna mushkil (Very Severe)

Number ya describe karein.`
    );
    return;
  }

  if (state === 'asked_severity') {
    const severity = detectSeverity(text);
    if (!severity) {
      await sendFn(senderId, `Kitni severe hai problem?\n\n1️⃣ Mild\n2️⃣ Moderate\n3️⃣ Severe\n4️⃣ Very Severe`);
      return;
    }
    const newProfile = { ...profile, severity };
    await updateLead(senderId, { lastStage: 'pitched', status: '🟡 Warm', profile: newProfile });
    await sendFn(senderId, getPitchMessage(newProfile.sinusType, newProfile));
    return;
  }

  if (state === 'pitched' || state === 'following_up') {
    const t = text.toLowerCase();

    if (['yes', 'haan', 'han', 'ha', 'y', 'हाँ', 'हां'].includes(t)) {
      await updateLead(senderId, { lastStage: 'done', status: '🟢 Hot' });
      await sendFn(senderId,
`Bahut achha! 🙏

Aapka 14-day personalized protocol confirm karne ke liye:

💳 Payment Link: ${PAYMENT_LINK}
Amount: ₹1,299

Payment ke baad WhatsApp pe milega:
✅ Aapka personalized protocol
✅ Daily guidance schedule
✅ Direct specialist access

Payment karte waqt apna WhatsApp number zaroor daalein.

📱 WhatsApp: ${WHATSAPP_NUMBER}
🌐 ${WEBSITE}

Ayusomam Herbals 🌿`
      );
      return;
    }

    if (t === 'more') {
      await updateLead(senderId, { lastStage: 'human_takeover', status: '🟢 Hot' });
      await sendFn(senderId,
`Bilkul! 🙏

Hamare specialist aapse seedha baat karenge.

Thoda intezaar karein — specialist abhi aapke paas aate hain.

🌐 ${WEBSITE}

Ayusomam Herbals 🌿`
      );
      return;
    }

    try {
      await updateLead(senderId, { lastStage: 'following_up', status: '🟡 Warm' });
      const aiResponse = await getClaudeResponse(state, text, profile);
      await sendFn(senderId, aiResponse);
    } catch (err) {
      console.error('Claude error:', err.message);
      await sendFn(senderId,
`Koi bhi sawaal poochh sakte hain — hum yahan hain. 🙏

Details ke liye "MORE" type karein ya shuru karne ke liye YES reply karein.

🌐 ${WEBSITE}`
      );
    }
    return;
  }

  if (state === 'done') {
    console.log(`DONE STATE - No reply for ${senderId}`);
  }
}

// ─── WEBHOOK ─────────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === 'ayusom2026') {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED');
  const body = req.body;
  if (!body.entry) return;

  for (const entry of body.entry) {
    if (!entry.messaging) continue;
    const isInstagram = entry.id === INSTAGRAM_ID;
    const sendFn = isInstagram ? sendIGMessage : sendFBMessage;
    const ownId = isInstagram ? INSTAGRAM_ID : PAGE_ID;

    for (const msg of entry.messaging) {
      if (msg.sender.id === ownId) {
        const recipientId = msg.recipient?.id;
        if (recipientId && recipientId !== ownId) {
          if (msg.message?.text?.startsWith('BOT_ON_')) {
            const targetId = msg.message.text.replace('BOT_ON_', '').trim();
            await updateLead(targetId, { lastStage: 'new', status: 'New Lead', profile: {} });
            delete userCache[targetId];
            console.log(`BOT REACTIVATED for ${targetId}`);
          } else {
            await updateLead(recipientId, { lastStage: 'human_takeover' });
            console.log(`HUMAN TAKEOVER for ${recipientId}`);
          }
        }
        continue;
      }
      if (!msg.message?.text) continue;
      const senderId = msg.sender.id;
      const text = msg.message.text.trim();
      const platform = isInstagram ? 'Instagram' : 'Facebook';
      await processMessage(senderId, text, platform, sendFn);
    }
  }
});

// ─── START ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Ayusomam webhook running on port ${PORT}`));
