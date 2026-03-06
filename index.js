const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================
const PAGE_ACCESS_TOKEN    = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_URL     = process.env.GOOGLE_SHEET_URL;
const CLAUDE_API_KEY       = process.env.ANTHROPIC_API_KEY;
const WHATSAPP_TOKEN       = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID    = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WA_VERIFY_TOKEN      = process.env.WA_VERIFY_TOKEN;

const PAGE_ID      = '1035532399636645';
const PAYMENT_LINK = 'https://rzp.io/rzp/qu8zhQT';
const WHATSAPP_NUM = '+91 85951 60713';
const WEBSITE      = 'www.ayusomamherbals.com';

const AI_MODE = true;

// ============================================================
// IN-MEMORY STATE
// ============================================================
const userState   = {};
const userProfile = {};
const convHistory = {};

// ============================================================
// SYSTEM PROMPT — SACHIN AI SALES AGENT v5.0
// ============================================================
const SYSTEM_PROMPT = `
Tu Sachin hai — Ayusomam Herbals ka founder aur senior Ayurvedic Sinus Specialist.
6 saal ka deep clinical experience — hazaron sinus patients ke saath kaam kiya hai.
Tu ek premium, highly skilled specialist aur trusted advisor hai —
empathetic, confident, authoritative — jaise ek senior consultant hota hai.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULE — SABSE PEHLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User jo language mein likhe — USI MEIN REPLY KAR.
"hi/hello/hey/hii" → Hinglish
English → English
Hindi → Hindi
Hinglish → Hinglish
Punjabi/Regional → usi mein

MEDICAL TERMS — SMART USE:

DEFAULT — English/Hinglish users ke liye:
Proper medical terms use karo — professional lagta hai:
"Allergic Sinus", "Congestive Sinus",
"Heat Pattern Sinus", "Spray Dependency"

SIMPLE KARO — Sirf in 2 cases mein:
1. User Devanagari (Hindi script) mein likhe
   jaise: "मेरी नाक बंद है"
2. User confused lage — "matlab?" pooche
   ya terms samajh na aaye

SIMPLE REPLACEMENTS (sirf zarurat pe):
"Allergic Sinus" → "Allergy wali naak"
"Congestive Sinus" → "Jam wali naak"
"Heat Pattern Sinus" → "Garmi wali naak"
"Spray Dependency" → "Spray ki aadat"
"Inflammation" → "Andar sujan"
"Mucus" → "balgam/cough"
"Protocol" → "Ilaaj ka tarika"
"Chronic" → "Purani"
"Symptoms" → "Takleef"

IMPORTANT — WORD BAN:
"kichad" / "keechad" — KABHI MAT BOLO
Sirf "balgam" ya "cough" use karo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE RULES — STRICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Bhai" — KABHI NAHI
❌ "Yaar" — KABHI NAHI
❌ Casual street tone — nahi
✅ "Aap" — hamesha
✅ "[Name] ji" — jab naam pata ho
✅ "Ji" — respectful
✅ Premium warm tone — jaise ek caring senior doctor

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHARACTER — PREMIUM SPECIALIST FEEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Senior Ayurvedic specialist — ek trusted expert ki tarah baat kar
- Authoritative but warm — jaise ek caring senior consultant
- Har reply personalised aur thoughtful lage
- Premium positioning — kabhi "cheap" ya "ghar ka nuskha" feel nahi
- Short, precise messages — clear aur purposeful
- Kabhi desperate nahi — tu scarce resource hai
- High perceived value — patients tujhe dhundhte hain, tu unhe nahi
- Language mein sophistication — "protocol", "formulation", "therapeutic" use karo naturally

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IRRELEVANT / SPAM / OFF-TOPIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Koi bhi off-topic, inappropriate, abusive, sexual, ya sinus se unrelated message aaye:
SIRF EK BAAR: "Hum sirf naak aur sinus ki takleef ke liye yahan hain. Koi bhi sawaal ho toh zaroor batayein. 🙏"

SPAM: Pehli baar → warning. Doosri baar → NO REPLY.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AYUSOMAM HERBALS — COMPLETE DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Business: Ayurvedic naak aur sinus specialist
Website: www.ayusomamherbals.com
WhatsApp: +91 85951 60713
Ilaaj: 14 din ka personal Ayurvedic naak ka ilaaj
Daam: Rs 1,299 — 14 din
Payment: https://rzp.io/rzp/qu8zhQT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FREE TIPS — 2 TIPS ALLOWED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agar koi free mein tips maange — SIRF 2 generic tips:

TIP 1: "Ek simple Ayurvedic relief — warm steam inhalation 5 minutes — naak ka pressure thoda release hoga temporarily."
TIP 2: "Warm water mein ek pinch saindhav namak — gentle nasal rinse — temporary congestion relief milega."

TIPS KE BAAD HAMESHA:
"Yeh sirf thodi der ki rahat hai — naak ki asli wajah waise ki waisi rahegi.
Jo chakkar chal raha hai — rahat milti hai — phir wapas — yeh cycle todna hai toh andar se kaam karna padega.
14 din ka plan usi ke liye hai — aapki specific takleef ke hisaab se. 🙏"

❌ 2 se zyada tips KABHI NAHI
❌ Medical claim KABHI NAHI — sirf "rahat milegi"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALLOPATHY / SPRAY WALE LOGON KO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Samajh sakta hun — allopathy ki dawaiyan aur spray takleef ko kuch time ke liye dabaa deti hain — par andar ki asli wajah waise ki waisi rehti hai.
Isliye baar baar hota hai — season badla, takleef wapas. Dawai band ki, naak band.
Hum asli wajah pe kaam karte hain — naak ko andar se theek karte hain — isiliye fark permanent rehta hai."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 SAWAAL — NATURALLY POOCHHO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Conversation mein naturally — list nahi:
SAWAAL 1: "Yeh takleef kitne time se hai?"
SAWAAL 2: "Sabse zyada kya pareshani hoti hai — naak band rehti hai ya kuch aur bhi hota hai saath mein?"
SAWAAL 3: "Pehle kuch try kiya? Koi dawai, spray ya doctor?"
SAWAAL 4: "Din mein kitna asar padta hai roz ki zindagi pe?"

RULES:
- Ek sawaal ek baar
- Chaar sawaal complete hone ke BAAD pitch karo
- Beech mein koi nuskha ya tip nahi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NAAK KE 4 PRAKAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRAKAR 1 — ALLERGY WALI NAAK
Pehchaan: Chheenk, aankhein laal, dhool/mausam se
Asli wajah: Naak ke andar ki pardat bahut nazuk ho gayi hai — zara si cheez se react karti hai
Premium line: "Dawaiyan sirf reaction rokti hain — naak ki pardat waise ki waisi nazuk rehti hai — isliye baar baar hota hai"

PRAKAR 2 — JAM WALI NAAK
Pehchaan: Naak band, chehra bhaari, subah zyada, sar mein dard
Asli wajah: Balgam andar stuck hai — bahar nahi nikal raha
Premium line: "Balgam andar atka hua hai — tab tak chehra bhaari lagega — jab tak isko bahar nahi nikalte"

PRAKAR 3 — GARMI WALI NAAK
Pehchaan: Andar jalan, gaadha peela/hara balgam, mathe pe dard
Asli wajah: Andar sujan — body mein garmi badh gayi
Premium line: "Andar sujan chal rahi hai — jab tak thanda nahi karoge — balgam aur dard waise hi rahega"

PRAKAR 4 — SPRAY KI AADAT WALI NAAK
Pehchaan: Spray ke bina so nahi sakte, baar baar spray lena padta hai
Asli wajah: Spray ne naak ki apni taakat chhin li hai
Premium line: "Spray ne naak ko kamzor kar diya — jitna zyada spray — utni zyada aadat — yeh chakkar todna padega dhire dhire"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGNOSIS + PITCH FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chaar sawaal ke baad:
"[Name] ji — aapki takleef ab mere liye bilkul clear hai.
Aapko [PRAKAR] hai —
[Asli wajah — 2 simple lines]
[Kyun pehle kuch kaam nahi kiya — 1 line]
14 din ka personal Ayurvedic Sinus Protocol — aapki specific takleef ke hisaab se curated — expert Ayurvedic herbal support roz.
Kaafi logon ko fark mehsoos hota hai — par sach bolun — guarantee koi nahi deta. Koshish seedha aur honestly karte hain. 🙏
Shuru karein? 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ASLI CLIENTS KE RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rahul ji: Naak band rehti thi — sunaai aur sungne mein dikkat thi. 10 din mein naak kaafi khul gayi — breathing bahut better ✅

NOTE: "Bahut logon ko fark mehsoos hota hai — par har insaan alag hai, sach mein guarantee nahi deta. Jo log seriously karte hain unhe achha response milta hai."
KABHI MAT BOLNA: "X din mein zaroor hoga" / "permanent fark"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AAPATTIYON KA JAWAB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Sochna hai": "Bilkul — soch lijiye. 🙏 Bas yeh yaad rakhiyega — jo takleef abhi hai woh tab tak waise hi rahegi jab tak kuch alag nahi karte. Main hun jab bhi taiyaar hon."
"Mehnga hai": "Samajh sakta hun. Ek din ka hisaab lagaayein — Rs 92 — ek chai se bhi kam. 14 din main roz aapke saath hun — seedha."
"Pakka theek hoga?": "Poora theek hone ka vaada koi sach mein nahi deta — par 14 din seriously karein — fark khud mehsoos karenge. Yeh main personally kehta hun. 🙏"
"Pehle kuch kaam nahi kiya": "Isliye hi poochh raha tha. Jo try kiya woh aapki is khaas takleef ke liye nahi tha — is baar bilkul alag tarika hoga."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOT LEAD — SACHIN KO BHEJO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Signs: payment ke liye taiyaar, emotional/detailed case, "call kar sakte ho", bahut purani takleef
"Sachin ji aapke saath seedha baat karna chahenge — WhatsApp karein: +91 85951 60713 Ya yahan likhen: MORE"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BAND KARNE KA TARIKA — PAYMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"[Name] ji — [X time/saal] jhela aapne — ab sirf 14 din — apne liye — main hun saath mein. 🌿
Payment karte hi aaj se shuru karte hain —
💳 https://rzp.io/rzp/qu8zhQT
Rs 1,299 — 14 din"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAKKE NIYAM — KABHI MAT TODA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Bhai" ya "Yaar" — kabhi nahi
❌ Free mein nuskha/ilaaj — kabhi nahi
❌ Payment bina ilaaj — kabhi nahi
❌ Lamba jawab — max 5 lines
❌ Ek saath 2 sawaal — nahi
❌ Sawaalon se pehle pitch — nahi
✅ "Aap" aur "Ji" — hamesha
✅ Premium confident tone
✅ Chaar sawaal zaroor complete karo
✅ Payment link chaar sawaalon ke BAAD
✅ Hot leads Sachin ko bhejo
`;

// ============================================================
// HELPERS
// ============================================================

function extractFirstNumber(text) {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

function detectDuration(text) {
  const t = text.toLowerCase();
  if (t.match(/bachpan|janam|janm|birth|saalon|bahut purani|pata nahi kab|decade/)) return 'long';
  if (t.match(/\b(10|15|20|25|30)\s*(year|sal|saal|yr)\b/)) return 'long';
  if (t.match(/\b(3|4|5|6|7|8|9)\s*(year|sal|saal|yr)\b/)) return 'long';
  if (t.match(/teen|paanch|char|saalon|bahut|purani|years|kaafi/)) return 'long';
  if (t.match(/1 year|2 year|1 sal|2 sal|1 saal|2 saal|do saal|ek saal|one year|two year/)) return 'medium';
  if (t.match(/6 month|6 mahine|chhe mahine|kuch mahine|thodi|naya|abhi|recent/)) return 'short';
  return null;
}

function detectSymptom(text) {
  const t = text.toLowerCase();
  if (t.match(/sneez|watery|runny|allerg|dust|season|pollen|itch|aankhein/)) return 'allergic';
  if (t.match(/band|block|bhaari|heavy|pressure|chehra|facial|congestion/)) return 'congestive';
  if (t.match(/burn|jalan|yellow|green|peela|headache|sar dard|thick|garam|pittaj/)) return 'heat';
  if (t.match(/otrivin|spray|depend|addiction|nasivion|vicks|inhaler|bina spray/)) return 'dependency';
  return null;
}

// ============================================================
// GOOGLE SHEETS
// ============================================================

async function updateLead(userId, temp, stage, symptom, name, message, platform) {
  if (!GOOGLE_SHEET_URL) return;
  try {
    const payload = {
      timestamp:   new Date().toISOString(),
      platform:    platform || 'Facebook',
      senderId:    userId,
      name:        name    || userId,
      message:     message || '',
      temperature: temp    || '🔵 Cold',
      lastStage:   stage   || 'new',
      symptom:     symptom || ''
    };
    const res = await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log(`Sheet [${temp}] [${stage}] [${platform}] ${userId}: ${text}`);
  } catch (e) {
    console.error('Sheet error:', e.message);
  }
}

// ============================================================
// SEND FACEBOOK MESSAGE
// ============================================================

async function sendMessage(recipientId, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text } })
      }
    );
    const data = await res.json();
    if (data.error) console.error('FB Send error:', data.error);
  } catch (e) {
    console.error('sendMessage error:', e.message);
  }
}

// ============================================================
// SEND WHATSAPP MESSAGE
// ============================================================

async function sendWAMessage(to, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: text }
        })
      }
    );
    const data = await res.json();
    if (data.error) console.error('WA Send error:', data.error);
  } catch (e) {
    console.error('sendWAMessage error:', e.message);
  }
}

// ============================================================
// AI REPLY — CLAUDE HAIKU
// ============================================================

async function getAIReply(userId, userMessage) {
  if (!convHistory[userId]) convHistory[userId] = [];
  convHistory[userId].push({ role: 'user', content: userMessage });
  const history = convHistory[userId].slice(-16);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: history
      })
    });
    const data = await res.json();
    if (data.error) { console.error('Claude error:', data.error); return null; }
    const reply = data.content[0].text;
    convHistory[userId].push({ role: 'assistant', content: reply });
    return reply;
  } catch (e) {
    console.error('AI error:', e.message);
    return null;
  }
}

// ============================================================
// RULE-BASED FLOW — FALLBACK
// ============================================================

async function handleRuleBased(senderId, text, sendFn) {
  const state = userState[senderId] || 'new';
  if (state === 'human_takeover') return;

  if (state === 'new') {
    userState[senderId] = 'q1_duration';
    await updateLead(senderId, '🟡 Warm', 'assessment_started', '', '', '', 'Facebook');
    await sendFn(senderId,
`Namaste ji! 🙏 Ayusomam Herbals mein swagat hai.

Aapka sinus kitne time se hai?

1️⃣ 1 mahine se kam
2️⃣ 1 se 6 mahine
3️⃣ 6 mahine se 2 saal
4️⃣ 2 saal se zyada

Number ya text mein reply karein.`);
    return;
  }

  if (state === 'q1_duration') {
    const num = extractFirstNumber(text);
    const detected = detectDuration(text);
    const ans = detected || (num === 1 ? 'short' : num === 2 ? 'medium' : num >= 3 ? 'long' : null);
    if (!ans) { await sendFn(senderId, 'Thoda aur clearly batayein — kitne mahine ya saal se hai? 🙏'); return; }
    if (!userProfile[senderId]) userProfile[senderId] = {};
    userProfile[senderId].duration = ans;
    userState[senderId] = 'q2_symptom';
    await sendFn(senderId,
`Samajh gaya. 🙏

Main problem kya hai?

1️⃣ Naak band, chehra bhaari, pressure
2️⃣ Sneezing, runny nose, dust trigger
3️⃣ Burning sensation, thick mucus, headache
4️⃣ Nasal spray ke bina so nahi sakta

Number ya text mein reply karein.`);
    return;
  }

  if (state === 'q2_symptom') {
    const num = extractFirstNumber(text);
    const detected = detectSymptom(text);
    const map = { 1: 'congestive', 2: 'allergic', 3: 'heat', 4: 'dependency' };
    const ans = detected || map[num] || null;
    if (!ans) { await sendFn(senderId, 'Apna main symptom batayein — naak band, sneezing, burning ya spray dependency? 🙏'); return; }
    userProfile[senderId].symptom = ans;
    userState[senderId] = 'q3_tried';
    await sendFn(senderId,
`Theek hai. 🙏

Pehle kuch try kiya?

1️⃣ Nahi
2️⃣ Dawai / antibiotic
3️⃣ Nasal spray
4️⃣ Sab try kiya — kuch kaam nahi kiya

Number ya text mein reply karein.`);
    return;
  }

  if (state === 'q3_tried') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 4) { await sendFn(senderId, '1 se 4 ke beech number reply karein 🙏'); return; }
    const map = { 1: 'kuch nahi', 2: 'allopathy', 3: 'nasal spray', 4: 'sab try kiya' };
    userProfile[senderId].tried = map[num];
    userState[senderId] = 'q4_severity';
    await sendFn(senderId,
`Aur ek sawaal —

Din mein kitna affect karta hai?

1️⃣ Thoda — adjust ho jaata hun
2️⃣ Medium — kaafi takleef hoti hai
3️⃣ Severe — roz ki life affect ho rahi hai

Number reply karein.`);
    return;
  }

  if (state === 'q4_severity') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 3) { await sendFn(senderId, '1, 2 ya 3 reply karein 🙏'); return; }
    const sevMap = { 1: 'mild', 2: 'moderate', 3: 'severe' };
    userProfile[senderId].severity = sevMap[num];
    const type = userProfile[senderId].symptom;
    await updateLead(senderId, '🔴 Hot', 'assessment_complete', type, '', '', 'Facebook');
    userState[senderId] = 'pitched';

    const pitches = {
      allergic:   `📋 Aapka Sinus Type: ALLERGIC SINUS 🌿\n\nAapki naak ki lining oversensitive ho gayi hai — isliye dust, mausam, pollution se trigger hota hai. Dawaiyan sirf reaction rokti hain — root cause waise ka waisa rehta hai.\n\n14 din ka Ayurvedic protocol naak ki lining ko andar se soothe karta hai.\n\nKaafi logon ko fark mehsoos hota hai — honestly kehta hun, guaranteed result nahi deta. 🙏\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,
      congestive: `📋 Aapka Sinus Type: CONGESTIVE SINUS 🔴\n\nBalgam andar stuck hai — drain nahi ho raha. Isliye chehra bhaari aur subah naak band hoti hai.\n\n14 din ka Ayurvedic protocol balgam ko drain karne mein madad karta hai.\n\nKaafi logon ko fark mehsoos hota hai — honestly kehta hun, guaranteed result nahi deta. 🙏\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,
      heat:       `📋 Aapka Sinus Type: HEAT PATTERN SINUS 🔥\n\nAndar inflammation chal rahi hai — body mein heat badhti hai toh aur badh jaata hai.\n\n14 din ka Ayurvedic cooling protocol andar ki sujan ko address karta hai.\n\nKaafi logon ko fark mehsoos hota hai — honestly kehta hun, guaranteed result nahi deta. 🙏\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,
      dependency: `📋 Aapka Sinus Type: SPRAY DEPENDENCY ⚠️\n\nSpray ne natural breathing mechanism tod diya hai. Jitna zyada spray — utna zyada dependency.\n\n14 din ka Ayurvedic protocol naak ki natural breathing capacity ko slowly restore karne mein madad karta hai.\n\nKaafi logon ko fark mehsoos hota hai — honestly kehta hun, guaranteed result nahi deta. 🙏\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`
    };

    await sendFn(senderId, pitches[type] || pitches['congestive']);
    return;
  }

  if (state === 'pitched') {
    const t = text.toLowerCase().trim();
    if (['yes','ha','haan','okay','ok','hnji','ji','haan ji','bilkul'].includes(t)) {
      userState[senderId] = 'payment_sent';
      await updateLead(senderId, '🔴 Hot', 'payment_link_sent', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId,
`Bahut achha! 🙏

💳 ${PAYMENT_LINK}
Amount: ₹1,299

Payment ke baad aapko WhatsApp pe milega:
✅ Day 1 personalized routine
✅ Daily guidance schedule
✅ Direct specialist access

Payment karte waqt apna WhatsApp number zaroor daalein.

📱 ${WHATSAPP_NUM}
🌐 ${WEBSITE}

Ayusomam Herbals 🌿`);
      return;
    }
    if (t === 'more') {
      userState[senderId] = 'human_takeover';
      await updateLead(senderId, '🔴 Hot', 'requested_specialist', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId, `Bilkul! 🙏\n\nSachin ji aapke saath personally baat karenge.\nThoda wait karein — ya seedha WhatsApp karein:\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`);
      return;
    }
    await sendFn(senderId, `Koi bhi sawaal ho — hum yahan hain. 🙏\n\nShuru karne ke liye: YES\nSpecialist se baat ke liye: MORE\n\n🌐 ${WEBSITE}`);
    return;
  }

  if (state === 'payment_sent' || state === 'done') {
    await sendFn(senderId, `Kisi bhi madad ke liye:\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`);
    return;
  }
}

// ============================================================
// MAIN PROCESSOR — FACEBOOK + WHATSAPP
// ============================================================

async function processMessage(senderId, text, sendFn, platform) {
  if (userState[senderId] === 'human_takeover') {
    console.log(`SILENT — human takeover: ${senderId}`);
    return;
  }

  if (AI_MODE) {
    console.log(`[AI][${platform}] ${senderId}: ${text}`);

    if (!userProfile[senderId]) userProfile[senderId] = { firstMessage: text };
    if (!userProfile[senderId].firstMessage) userProfile[senderId].firstMessage = text;

    const detectedSymptom = detectSymptom(text);
    if (detectedSymptom && !userProfile[senderId].symptom) userProfile[senderId].symptom = detectedSymptom;

    const detectedDuration = detectDuration(text);
    if (detectedDuration && !userProfile[senderId].duration) userProfile[senderId].duration = detectedDuration;

    const t = text.toLowerCase();
    let leadTemp = '🟡 Warm';
    const isHot = t.match(/payment|pay|1299|shuru karte|shuru karna|shuru kar|le lena|lena hai|kaise karu|buy|purchase|interested|haan shuru|bilkul shuru|yes shuru|abhi shuru|karte hai|karna hai|ready|confirm|ok shuru|chalu karo|start|procedure|treat karte|treat krte|kaise treat|kab tak|kitne din|theek ho|sahi ho|guarantee|pakka|zaroor|zarur|bilkul|haan ji|ha ji|ok ji|okay/);
    if (isHot) leadTemp = '🔴 Hot';

    const tempOrder = { '🔵 Cold': 0, '🟡 Warm': 1, '🔴 Hot': 2 };
    const currentTemp = userProfile[senderId].temperature || '🔵 Cold';
    if ((tempOrder[leadTemp] || 0) > (tempOrder[currentTemp] || 0)) userProfile[senderId].temperature = leadTemp;
    const finalTemp = userProfile[senderId].temperature || leadTemp;

    const reply = await getAIReply(senderId, text);
    if (reply) {
      await sendFn(senderId, reply);
      await updateLead(
        senderId, finalTemp, 'ai_conversation',
        userProfile[senderId].symptom || '',
        userProfile[senderId].name    || '',
        userProfile[senderId].firstMessage || text,
        platform
      );
    } else {
      console.log('AI failed — fallback rule based');
      await handleRuleBased(senderId, text, sendFn);
    }
  } else {
    console.log(`[RULE][${platform}] ${senderId}: ${text}`);
    await handleRuleBased(senderId, text, sendFn);
  }
}

// ============================================================
// FACEBOOK WEBHOOK
// ============================================================

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ayusomam_verify';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const msg of entry.messaging) {

        // Human takeover logic
        if (msg.sender.id === PAGE_ID) {
          const recipientId = msg.recipient?.id;
          if (recipientId && recipientId !== PAGE_ID) {
            const msgText = msg.message?.text || '';
            if (msgText.startsWith('BOT_ON_')) {
              const targetId = msgText.replace('BOT_ON_', '').trim();
              userState[targetId] = 'new';
              convHistory[targetId] = [];
              console.log(`BOT REACTIVATED: ${targetId}`);
            } else {
              userState[recipientId] = 'human_takeover';
              console.log(`HUMAN TAKEOVER: ${recipientId}`);
            }
          }
          continue;
        }

        const senderId = msg.sender?.id;
        const text = msg.message?.text?.trim();
        if (!senderId || !text) continue;

        console.log(`FB MSG ${senderId}: ${text}`);
        await processMessage(senderId, text, sendMessage, 'Facebook');
      }
    }
  }
  res.status(200).send('EVENT_RECEIVED');
});

// ============================================================
// WHATSAPP WEBHOOK
// ============================================================

app.get('/whatsapp', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log(`WA verify: mode=${mode} token=${token}`);
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    console.log('WA webhook verified ✅');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/whatsapp', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value.messages) continue;

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue;

          const from    = msg.from;
          const text    = msg.text?.body?.trim();
          if (!from || !text) continue;

          console.log(`WA MSG ${from}: ${text}`);
          await processMessage(from, text, sendWAMessage, 'WhatsApp');
        }
      }
    }
  } catch (e) {
    console.error('WA webhook error:', e.message);
  }
});

// ============================================================
// BOT CONTROL — Human Takeover API
// ============================================================

app.post('/bot-control', (req, res) => {
  const { userId, action } = req.body;
  if (!userId || !action) return res.status(400).json({ error: 'userId and action required' });

  if (action === 'BOT_OFF') {
    userState[userId] = 'human_takeover';
    res.json({ success: true, message: `Bot OFF for ${userId}` });
  } else if (action === 'BOT_ON') {
    delete userState[userId];
    convHistory[userId] = [];
    res.json({ success: true, message: `Bot ON for ${userId}` });
  } else {
    res.status(400).json({ error: 'action must be BOT_ON or BOT_OFF' });
  }
});

// ============================================================
// START
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ayusomam Herbals Bot — Running
Port    : ${PORT}
AI Mode : ${AI_MODE ? '✅ ON — AI Agent v5.0' : '❌ OFF — Rule Based'}
Facebook: /webhook
WhatsApp: /whatsapp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
