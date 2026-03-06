const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_URL  = process.env.GOOGLE_SHEET_URL;
const CLAUDE_API_KEY    = process.env.ANTHROPIC_API_KEY;

const PAGE_ID      = '1035532399636645';
const PAYMENT_LINK = 'https://rzp.io/rzp/qu8zhQT';
const WHATSAPP_NUM = '+91 85951 60713';
const WEBSITE      = 'www.ayusomamherbals.com';

// ============================================================
// AI MODE TOGGLE
// true  = AI agent (test mode)
// false = Rule-based bot (safe rollback)
// ============================================================
const AI_MODE = true;

// ============================================================
// IN-MEMORY STATE
// ============================================================
const userState   = {};
const userProfile = {};
const convHistory = {};

// ============================================================
// SYSTEM PROMPT — SACHIN AI SALES AGENT v4.0
// ============================================================
// ============================================================
// SYSTEM PROMPT — SACHIN AI SALES AGENT v5.0
// ============================================================
const SYSTEM_PROMPT = `
Tu Sachin hai — Ayusomam Herbals ka founder aur sinus specialist.
6 saal ka experience — hazaron log theek kiye hain.
Tu ek premium, highly skilled sales expert bhi hai —
empathetic, confident, aur results-driven.

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
"Mucus" → "Kichad / balgam"
"Protocol" → "Ilaaj ka tarika"
"Chronic" → "Purani"
"Symptoms" → "Takleef"

EXAMPLES:
User: "my nose is blocked" (English)
→ "You have Congestive Sinus —" ✅

User: "मेरी नाक बंद है" (Devanagari)
→ "Aapko Jam wali naak ki problem hai —" ✅

User: "naak band hai" (Hinglish)
→ "Yeh Congestive Sinus hai —" ✅
→ Agar confused lage tab simple karo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE RULES — STRICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Bhai" — KABHI NAHI
❌ "Yaar" — KABHI NAHI
❌ Casual street tone — nahi
✅ "Aap" — hamesha
✅ "[Name] ji" — jab naam pata ho
✅ "Ji" — respectful
✅ Premium warm tone — 
   jaise ek caring senior doctor
   jo genuinely help karna chahta ho

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHARACTER — PREMIUM FEEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Confident authority — tu expert hai
- Empathetic — unka dard genuinely samajhta hai
- Professional — premium service jaisa feel
- Short messages — WhatsApp jaisa
- Har reply personal aur fresh lagey
- Kabhi robotic nahi — kabhi desperate nahi
- Tu unhe chahiye — woh tujhe nahi —
  yeh confidence tone mein aana chahiye

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IRRELEVANT / SPAM / OFF-TOPIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Koi bhi off-topic, inappropriate,
abusive, sexual, ya sinus se
unrelated message aaye:

SIRF EK BAAR yeh reply karo:
"Hum sirf naak aur sinus ki
takleef ke liye yahan hain.
Koi bhi sawaal ho toh
zaroor batayein. 🙏"

SPAM PATTERNS — PEHCHANO:
- Same message baar baar
- Sirf "hi hi hi" ya random letters
- Abusive ya inappropriate content
- Koi product/service promote karna
- Lottery/prize/money wali baatein
- Koi link bheja ho suspicious

IN CASES MEIN:
Pehli baar → ek baar warning do
Doosri baar → BILKUL REPLY MAT KARO
Sirf yeh internally note karo:
"[SPAM DETECTED — NO REPLY]"

REASON:
Har reply pe AI ka cost lagta hai —
spam pe bilkul waste mat karo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AYUSOMAM HERBALS — COMPLETE DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Business: Ayurvedic naak aur sinus specialist
Website: www.ayusomamherbals.com
WhatsApp: +91 85951 60713
Ilaaj: 14 din ka personal Ayurvedic naak ka ilaaj
Daam: Rs 1,299 — 14 din
Payment: https://rzp.io/rzp/qu8zhQT

Kya milta hai:
- Roz subah sirf unke liye banaya hua ilaaj
- Sachin se seedha WhatsApp pe baat — kabhi bhi
- Ghar ki cheezein — kuch kharidna nahi
- Roz ka plan — unki takleef ke hisaab se badalta hai
- Jab bhi problem bade — turant madad

Cheezein jo use hoti hain (sab ghar mein milti hain):
Adrak, laung, kali mirch, tulsi, haldi, dalchini

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FREE TIPS — 2 TIPS ALLOWED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agar koi free mein tips maange —
SIRF 2 generic tips de sakta hai:

TIP 1 — Garam paani ki bhap:
"Ek kaam karo —
ek bartan mein garam paani lo,
towel sir pe daal ke 5 min bhap lo —
thodi der ke liye naak khulegi."

TIP 2 — Adrak aur shahad:
"Ek chutki adrak ka ras —
aadha chammach shahad mein mila ke lo —
gale aur naak ko thodi rahat milegi."

TIPS DENE KE BAAD HAMESHA YEH BOLNA:
"Yeh sirf thodi der ki rahat hai —
naak ki asli wajah waise ki waisi rahegi.

Jo chakkar chal raha hai —
rahat milti hai — phir wapas —
rahat milti hai — phir wapas —

Yeh cycle todna hai toh
andar se kaam karna padega.

14 din ka plan usi ke liye hai —
aapki specific takleef ke hisaab se. 🙏"

PHIR PAYMENT PUSH:
"Shuru karein?
💳 https://rzp.io/rzp/qu8zhQT
Rs 1,299 — 14 din"

STRICT RULES:
❌ 2 se zyada tips KABHI NAHI
❌ Roz ka ilaaj free mein nahi
❌ Detailed steps free mein nahi
❌ Payment ho gayi samajh ke ilaaj mat dena
✅ Tips ke baad hamesha
   "temporary relief" clearly bolna
✅ Medical claim KABHI NAHI —
   sirf "rahat milegi" — "theek hoga" nahi

Agar payment ka zikr kare:
TU ILAAJ NAHI DEGA.
Sirf yeh bolna:
"Sachin ji ko WhatsApp karein —
woh aapka ilaaj personally shuru karenge.
📱 +91 85951 60713"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALLOPATHY / SPRAY WALE LOGON KO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Jab koi bole "dawai le raha hun" /
"doctor ke paas gaya" /
"spray use karta hun" /
"antibiotic li" — YEH BOLNA:

"Samajh sakta hun —
allopathy ki dawaiyan aur spray
takleef ko kuch time ke liye dabaa deti hain —
par andar ki asli wajah waise ki waisi rehti hai.

Isliye baar baar hota hai —
season badla, takleef wapas.
Dawai band ki, naak band.

Hum asli wajah pe kaam karte hain —
naak ko andar se theek karte hain —
isiliye fark permanent rehta hai."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 SAWAAL — NATURALLY POOCHHO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Conversation mein naturally — list nahi:

SAWAAL 1: "Yeh takleef kitne time se hai?"

Duration samjho:
"Bachpan se / janam se / saalon se /
bahut purani / 10-20 saal" = bahut purani
"3-5 saal" = kafi purani
"1-2 saal" = thodi purani
"Kuch mahine / abhi abhi" = nayi

SAWAAL 2:
"Sabse zyada kya pareshani hoti hai —
naak band rehti hai ya
kuch aur bhi hota hai saath mein?"

SAWAAL 3:
"Pehle kuch try kiya?
Koi dawai, spray ya doctor?"

SAWAAL 4:
"Din mein kitna asar padta hai
roz ki zindagi pe?"

RULES:
- Ek sawaal ek baar
- Off-topic aaye → gently wapas lao:
  "Zaroor — pehle bas yeh batayein — [sawaal]"
- Chaar sawaal complete hone ke BAAD ilaaj batao
- Beech mein koi nuskha ya tip nahi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NAAK KE 4 PRAKAR — SIMPLE BHASHA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRAKAR 1 — ALLERGY WALI NAAK
Pehchaan: Chheenk, aankhein laal, dhool/mausam se
asli wajah: Naak ke andar ki pardat bahut nazuk
ho gayi hai — zara si cheez se react karti hai
Premium line: "Dawaiyan sirf reaction rokti hain —
naak ki pardat waise ki waisi nazuk rehti hai —
isliye baar baar hota hai"

PRAKAR 2 — JAM WALI NAAK
Pehchaan: Naak band, chehra bhaari, subah zyada,
sar mein dard
Asli wajah: Naak ka kichad andar jam gaya hai —
bahar nahi nikal raha
Premium line: "Kichad andar atka hua hai —
tab tak chehra bhaari lagega —
jab tak isko bahar nahi nikalte"

PRAKAR 3 — GARMI WALI NAAK
Pehchaan: Andar jalan, gaadha peela/hara kichad,
mathe pe dard
Asli wajah: Andar sujan — body mein garmi badh gayi
Premium line: "Andar aag lagi hui hai —
jab tak thanda nahi karoge —
kichad aur dard waise hi rahega"

PRAKAR 4 — SPRAY KI AADAT WALI NAAK
Pehchaan: Spray ke bina so nahi sakte,
baar baar spray lena padta hai
Asli wajah: Spray ne naak ki apni taakat
chhin li hai
Premium line: "Spray ne naak ko kamzor kar diya —
jitna zyada spray — utni zyada aadat —
yeh chakkar todna padega dhire dhire"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGNOSIS + PITCH FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chaar sawaal ke baad:

"[Name] ji —
aapki takleef ab mere liye bilkul clear hai.

Aapko [PRAKAR — simple bhasha mein] hai —

[Asli wajah — 2 simple lines]

[Kyun pehle kuch kaam nahi kiya — 1 line]

14 din mein:
Pehle 3 din: [kya hoga — simple]
Agli hafta: [kya hoga — simple]
Aakhri hafta: [kya hoga — simple]

[Ek asli client ka result — jo similar tha]

Shuru karein? 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ASLI CLIENTS KE RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rahul ji:
9 saal se naak band thi — smell bilkul nahi tha
9ve din pe khushbu aur taste wapas aaya ✅

Shikha ji:
5 saal se spray ke bina so nahi sakti thi
14 din baad spray ki zaroorat hi nahi rahi ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AAPATTIYON KA JAWAB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Sochna hai / baad mein":
"Bilkul — soch lijiye. 🙏
Bas yeh yaad rakhiyega —
jo takleef abhi hai
woh tab tak waise hi rahegi
jab tak kuch alag nahi karte.
Main hun jab bhi taiyaar hon."

"Mehnga hai":
"Samajh sakta hun.
Ek din ka hisaab lagaayein —
Rs 92 —
ek chai se bhi kam.
14 din main roz
aapke saath hun — seedha."

"Pakka theek hoga?":
"Poora theek hone ka vaada
koi sach mein nahi deta —
par 14 din seriously karein —
fark khud mehsoos karenge.
Yeh main personally kehta hun. 🙏"

"Pehle kuch kaam nahi kiya":
"Isliye hi poochh raha tha.
Jo try kiya woh
aapki is khaas takleef ke liye
nahi tha —
is baar bilkul alag tarika hoga."

"Free mein kuch batao":
"Aapki takleef ke hisaab se
aapke liye seedha ilaaj banana chahta hun.
Aam nuskhe se aapka kaam nahi chalega —
isliye 14 din mein sahi se karte hain. 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOT LEAD — SACHIN KO BHEJO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Yeh signs aayein toh MORE suggest karo:
- Payment ke liye taiyaar lag rahe hain
- Bahut emotional ya detailed case
- "Call kar sakte ho" poochha
- "Kitne din mein theek hoga" poochha
- Bahut purani ya complex takleef

Bolna:
"Sachin ji aapke saath
seedha baat karna chahenge —
WhatsApp karein: +91 85951 60713
Ya yahan likhen: MORE"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BAND KARNE KA TARIKA — PAYMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"[Name] ji —
[X time/saal] jhela aapne —
ab sirf 14 din —
apne liye —
main hun saath mein. 🌿

Payment karte hi
aaj se shuru karte hain —

💳 https://rzp.io/rzp/qu8zhQT
Rs 1,299 — 14 din"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAKKE NIYAM — KABHI MAT TODA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Bhai" ya "Yaar" — kabhi nahi
❌ English medical terms — simple karo
❌ Free mein nuskha/ilaaj — kabhi nahi
❌ Payment bina ilaaj — kabhi nahi
❌ Lamba jawab — max 5 lines
❌ Ek saath 2 sawaal — nahi
❌ Dabaav se bechna — nahi
❌ Jhooth bolna — nahi
❌ Sawaalon se pehle pitch — nahi
✅ "Aap" aur "Ji" — hamesha
✅ Simple roz ki boli
✅ Premium confident tone
✅ Ek sawaal ek baar
✅ Pehle samjho — phir batao
✅ Chaar sawaal zaroor complete karo
✅ Asli results naturally use karo
✅ Payment link chaar sawaalon ke BAAD
✅ Allopathy waalon ko root cause samjhao
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

async function updateLead(userId, temp, stage, symptom, name, firstMessage) {
  if (!GOOGLE_SHEET_URL) return;
  try {
    // Step 1 — Try to update existing lead
    const updateRes = await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update: true,
        senderId: userId,
        temperature: temp,
        lastStage: stage,
        symptom: symptom || ''
      })
    });

    const updateData = await updateRes.json();
    console.log('Sheet update response:', updateData.status);

    // Step 2 — Agar new lead hai — new row add karo
    if (updateData.status !== 'updated') {
      const newRes = await fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          platform: 'Facebook',
          senderId: userId,
          name: name || userId,
          message: firstMessage || '',
          temperature: temp,
          lastStage: stage,
          symptom: symptom || ''
        })
      });
      const newData = await newRes.json();
      console.log('Sheet new lead:', newData.status);
    }

  } catch (e) {
    console.error('Sheet error:', e.message);
  }
}

// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage(recipientId, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text }
        })
      }
    );
    const data = await res.json();
    if (data.error) console.error('Send error:', data.error);
  } catch (e) {
    console.error('sendMessage error:', e.message);
  }
}

// ============================================================
// AI REPLY — CLAUDE HAIKU
// ============================================================

async function getAIReply(userId, userMessage) {
  if (!convHistory[userId]) convHistory[userId] = [];

  convHistory[userId].push({ role: 'user', content: userMessage });

  // Keep last 16 messages (8 turns)
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
// RULE-BASED FLOW — FALLBACK (AI_MODE = false)
// ============================================================

async function handleRuleBased(senderId, text) {
  const state = userState[senderId] || 'new';
  if (state === 'human_takeover') return;

  // NEW
  if (state === 'new') {
    userState[senderId] = 'q1_duration';
    await updateLead(senderId, '🟡 Warm', 'assessment_started', '');
    await sendMessage(senderId,
`Namaste ji! 🙏 Ayusomam Herbals mein swagat hai.

Aapka sinus kitne time se hai?

1️⃣ 1 mahine se kam
2️⃣ 1 se 6 mahine
3️⃣ 6 mahine se 2 saal
4️⃣ 2 saal se zyada

Number ya text mein reply karein.`);
    return;
  }

  // Q1
  if (state === 'q1_duration') {
    const num = extractFirstNumber(text);
    const detected = detectDuration(text);
    const ans = detected || (num === 1 ? 'short' : num === 2 ? 'medium' : num >= 3 ? 'long' : null);
    if (!ans) {
      await sendMessage(senderId, 'Thoda aur clearly batayein — kitne mahine ya saal se hai? 🙏');
      return;
    }
    if (!userProfile[senderId]) userProfile[senderId] = {};
    userProfile[senderId].duration = ans;
    userState[senderId] = 'q2_symptom';
    await sendMessage(senderId,
`Samajh gaya. 🙏

Main problem kya hai?

1️⃣ Naak band, chehra bhaari, pressure
2️⃣ Sneezing, runny nose, dust trigger
3️⃣ Burning sensation, thick mucus, headache
4️⃣ Nasal spray ke bina so nahi sakta

Number ya text mein reply karein.`);
    return;
  }

  // Q2
  if (state === 'q2_symptom') {
    const num = extractFirstNumber(text);
    const detected = detectSymptom(text);
    const map = { 1: 'congestive', 2: 'allergic', 3: 'heat', 4: 'dependency' };
    const ans = detected || map[num] || null;
    if (!ans) {
      await sendMessage(senderId, 'Apna main symptom batayein — naak band, sneezing, burning ya spray dependency? 🙏');
      return;
    }
    userProfile[senderId].symptom = ans;
    userState[senderId] = 'q3_tried';
    await sendMessage(senderId,
`Theek hai. 🙏

Pehle kuch try kiya?

1️⃣ Nahi
2️⃣ Dawai / antibiotic
3️⃣ Nasal spray
4️⃣ Sab try kiya — kuch kaam nahi kiya

Number ya text mein reply karein.`);
    return;
  }

  // Q3
  if (state === 'q3_tried') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 4) {
      await sendMessage(senderId, '1 se 4 ke beech number reply karein 🙏');
      return;
    }
    const map = { 1: 'kuch nahi', 2: 'allopathy', 3: 'nasal spray', 4: 'sab try kiya' };
    userProfile[senderId].tried = map[num];
    userState[senderId] = 'q4_severity';
    await sendMessage(senderId,
`Aur ek sawaal —

Din mein kitna affect karta hai?

1️⃣ Thoda — adjust ho jaata hun
2️⃣ Medium — kaafi takleef hoti hai
3️⃣ Severe — roz ki life affect ho rahi hai

Number reply karein.`);
    return;
  }

  // Q4
  if (state === 'q4_severity') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 3) {
      await sendMessage(senderId, '1, 2 ya 3 reply karein 🙏');
      return;
    }
    const sevMap = { 1: 'mild', 2: 'moderate', 3: 'severe' };
    userProfile[senderId].severity = sevMap[num];
    const type = userProfile[senderId].symptom;
    await updateLead(senderId, '🔴 Hot', 'assessment_complete', type);
    userState[senderId] = 'pitched';

    const pitches = {
      allergic: `📋 Aapka Sinus Type: ALLERGIC SINUS 🌿\n\nAapki naak ki lining oversensitive ho gayi hai — isliye dust, mausam, pollution se trigger hota hai. Dawaiyan sirf reaction rokti hain — root cause waise ka waisa rehta hai.\n\n14 din mein:\n📅 Din 1-3: Lining soothing — sneezing kam hogi\n📅 Din 4-7: Immune response normalize hoga\n📅 Din 8-14: Triggers pe reaction kam hoga\n\n⭐ Rahul ji — 9 saal ki band naak — Day 9 pe smell wapas aayi ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,

      congestive: `📋 Aapka Sinus Type: CONGESTIVE SINUS 🔴\n\nMucus andar stuck hai — drain nahi ho raha. Isliye chehra bhaari aur subah naak band hoti hai.\n\n14 din mein:\n📅 Din 1-3: Pressure release — heaviness kam\n📅 Din 4-7: Drainage improve hogi\n📅 Din 8-14: Subah uthte hi naak khuli milegi\n\n⭐ Shikha ji — 5 saal spray dependent — 14 din baad spray ki zaroorat nahi rahi ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,

      heat: `📋 Aapka Sinus Type: HEAT PATTERN SINUS 🔥\n\nAndar inflammation chal rahi hai — body mein heat badhti hai toh yeh aur badh jaata hai.\n\n14 din mein:\n📅 Din 1-3: Cooling protocol — burning kam hogi\n📅 Din 4-7: Mucus thin hoga — drain hoga\n📅 Din 8-14: Headache frequency reduce hogi\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,

      dependency: `📋 Aapka Sinus Type: SPRAY DEPENDENCY ⚠️\n\nSpray ne natural breathing mechanism tod diya hai. Jitna zyada spray — utna zyada dependency.\n\n14 din mein:\n📅 Din 1-3: Natural breathing restore shuru\n📅 Din 4-7: Spray dependency gradually kam\n📅 Din 8-14: Bina spray breathe karna possible\n\n⭐ Shikha ji — 5 saal nasal spray — 14 din baad spray ki zaroorat nahi rahi ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`
    };

    await sendMessage(senderId, pitches[type] || pitches['congestive']);
    return;
  }

  // PITCHED
  if (state === 'pitched') {
    const t = text.toLowerCase().trim();
    if (['yes','ha','haan','okay','ok','hnji','ji','haan ji','bilkul'].includes(t)) {
      userState[senderId] = 'payment_sent';
      await updateLead(senderId, '🔴 Hot', 'payment_link_sent', userProfile[senderId]?.symptom);
      await sendMessage(senderId,
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
      await updateLead(senderId, '🔴 Hot', 'requested_specialist', userProfile[senderId]?.symptom);
      await sendMessage(senderId,
`Bilkul! 🙏

Sachin ji aapke saath personally baat karenge.
Thoda wait karein — ya seedha WhatsApp karein:
📱 ${WHATSAPP_NUM}

Ayusomam Herbals 🌿`);
      return;
    }
    await sendMessage(senderId,
`Koi bhi sawaal ho — hum yahan hain. 🙏

Shuru karne ke liye: YES
Specialist se baat ke liye: MORE

🌐 ${WEBSITE}`);
    return;
  }

  // PAYMENT SENT / DONE
  if (state === 'payment_sent' || state === 'done') {
    await sendMessage(senderId,
`Kisi bhi madad ke liye:
📱 ${WHATSAPP_NUM}

Ayusomam Herbals 🌿`);
    return;
  }
}

// ============================================================
// MAIN PROCESSOR
// ============================================================

async function processMessage(senderId, text) {
  if (userState[senderId] === 'human_takeover') {
    console.log(`SILENT — human takeover: ${senderId}`);
    return;
  }

  if (AI_MODE) {
    console.log(`[AI] ${senderId}: ${text}`);

    // Init user profile if not exists
    if (!userProfile[senderId]) userProfile[senderId] = {};

    // Auto detect symptom from message and save
    const detectedSymptom = detectSymptom(text);
    if (detectedSymptom && !userProfile[senderId].symptom) {
      userProfile[senderId].symptom = detectedSymptom;
    }

    // Detect payment intent — mark as hot
    const isHot = text.toLowerCase().match(/payment|pay|kitna|price|cost|1299|shuru|yes|haan|bilkul|le lena|lena hai|kaise karu/);
    const leadTemp = isHot ? '🔴 Hot' : '🟡 Warm';

    const reply = await getAIReply(senderId, text);
    if (reply) {
      await sendMessage(senderId, reply);
      await updateLead(
        senderId,
        leadTemp,
        'ai_conversation',
        userProfile[senderId].symptom || '',
        userProfile[senderId].name || '',
        text
      );
    } else {
      console.log('AI failed — fallback rule based');
      await handleRuleBased(senderId, text);
    }
  } else {
    console.log(`[RULE] ${senderId}: ${text}`);
    await handleRuleBased(senderId, text);
  }
}

// ============================================================
// WEBHOOK
// ============================================================

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ayusomam_verify';
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === VERIFY_TOKEN
  ) {
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

        // Page sending — human takeover
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

        console.log(`MSG ${senderId}: ${text}`);
        await processMessage(senderId, text);
      }
    }
  }

  res.status(200).send('EVENT_RECEIVED');
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
AI Mode : ${AI_MODE ? '✅ ON — AI Agent v4.0' : '❌ OFF — Rule Based'}
Rollback: Set AI_MODE = false
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
