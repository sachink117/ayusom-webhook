const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const app = express();

app.use('/razorpay-webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

const PAGE_ID = '1035532399636645';
const PAYMENT_1299 = 'https://rzp.io/rzp/qu8zhQT';
const PAYMENT_499 = 'https://rzp.io/rzp/Re2W26iX';
const WHATSAPP_NUM = '+91 85951 60713';
const WEBSITE = 'www.ayusomamherbals.com';

// ============================================================
// IN-MEMORY STATE
// ============================================================
const userState = {};
const userProfile = {};
const convHistory = {};

// ============================================================
// IST TIME HELPER
// ============================================================
function getISTHour() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours();
}
// morning = 5am–1:59pm IST | night = 2pm–4:59am IST
function getTimeSlot() {
  const h = getISTHour();
  return (h >= 5 && h < 14) ? 'morning' : 'night';
}

// ============================================================
// FREE STEPS — Strictly 2 synergistic Ayurvedic steps
// Time-based (morning/night) + Type-based
// Steps are complementary, herbal, with approx time gap
// ============================================================
const FREE_STEPS = {
  morning: {
    allergic: `✅ Vataja-Kaphaja Pratishyaya 🌿
Type: Allergic Rhinosinusitis | Dosha: Vata + Kapha

Aaj ke 2 steps subah try karein — ek doosre ke complementary hain:

1️⃣ *Tulsi-Ginger Steam* — Subah uthte hi, khaana khaane se pehle
Ek bhagona paani mein 4-5 fresh tulsi patte + adha inch kuch adrak daalen. Ubaal lein, phir towel sar pe odh ke 8-10 min steam lein. Muh band, sirf naak se saans lein.

⏱️ 15-20 min baad —

2️⃣ *Saline Nasal Rinse*
1 cup gunguna paani + ½ tsp saindhav namak (sendha namak). Haath ki hatheli mein leke ek naak se kheenchein, doosri se bahar aane dein. Dono taraf. Steam ne mucus dhila kiya — rinse usse bahar karta hai.

⚠️ Yeh steps aaj ke liye temporary surface relief hain. Allergy ka root — sensitized naak ki lining — sirf structured protocol se address hoti hai.

Shaam ko zaroor batana — kuch fark mehsoos hua? 🙏`,

    congestive: `✅ Kaphaja Pratishyaya 🔵
Type: Congestive Sinusitis | Dosha: Kapha dominant

Aaj ke 2 steps subah try karein:

1️⃣ *Adrak-Saunth Steam* — khaali pet, uthte hi
Paani mein 1 inch kuchi adrak + ½ tsp saunth (dry ginger powder) daalen. Ubaal ke 10 min steam lein, towel sar pe. Balgam loose hoga andar se.

⏱️ 20-25 min baad —

2️⃣ *Warm Jal Neti / Saline Rinse*
1 cup gunguna paani + ½ tsp saindhav namak. Naak mein dono taraf rinse karein — gently, force nahi. Loose hua balgam bahar nikalega.

⚠️ Yeh sirf aaj ke liye temporary relief hai. Andar ki congestion ka source structured approach se hi address hota hai.

Shaam ko batana zaroor — kitna fark aaya? 🙏`,

    heat: `✅ Pittaja Pratishyaya 🔥
Type: Inflammatory Sinusitis | Dosha: Pitta aggravation

Aaj ke 2 steps subah try karein:

1️⃣ *Dhaniya-Saunf Infusion* — khaali pet, subah uthke
1 tsp dhaniya (coriander seeds) + 1 tsp saunf ko raat bhar paani mein bhigo ke rakhein. Subah chhan ke thanda hi peeyein. Pitta ko andar se shant karta hai.

⏱️ 30-40 min baad khaana khaane ke baad —

2️⃣ *Ghee Nasya* (medicated nasal application)
Dono naak mein 1-1 boond pure desi ghee (garm nahi — room temp). 5 min bilkul still baith ke rakhein. Burning sensation aur inflammation mein seedha kaam karta hai.

⚠️ Yeh andar ki pitta vitiation ka root address nahi karti — sirf aaj ke liye relief hai.

Shaam ko zaroor batana 🙏`,

    dependency: `✅ Dushta Pratishyaya ⚠️
Type: Chronic Rebound Sinusitis | Dosha: Vata + Srotas blockage

Aaj ke 2 steps subah try karein:

1️⃣ *Pre-Spray Steam Replacement*
Spray use karne se pehle 10 min steam karein — plain paani, koi additive nahi. Agar naak khul jaaye toh spray ki zaroorat na padhe. Agar padhe toh sirf ek naak mein — doosri naak open rahe.

⏱️ Dono ke beech minimum 30 min ka gap —

2️⃣ *Anu Taila / Desi Ghee Nasya*
Steam ke 30 min baad, dono naak mein 1-1 boond desi ghee ya anu taila (Ayurvedic nasal drops — easily available). Naak ki lining ko nourish karta hai — spray ki harshness se healing shuru hoti hai.

⚠️ Spray ne jo mucosal damage kiya hai — yeh ghee se thodi healing karta hai, lekin dependency todne ke liye structured protocol chahiye.

Shaam ko zaroor batana 🙏`
  },

  night: {
    allergic: `✅ Vataja-Kaphaja Pratishyaya 🌿
Type: Allergic Rhinosinusitis | Dosha: Vata + Kapha

Aaj raat ke 2 steps try karein:

1️⃣ *Haldi-Ghee Nasal Protocol* — Khana khaane ke 1 hour baad
Ek cup garm doodh mein ½ tsp haldi + ½ tsp ghee milaen. Dhire dhire peeyein. Saath mein — dono naak mein 1-1 boond desi ghee nasya karein. Andar ki inflammation pe kaam karta hai.

⏱️ 45-60 min baad, sone se 20-30 min pehle —

2️⃣ *Sone se Pehle Steam*
4-5 tulsi patte paani mein, 8 min steam. Towel sar pe. Raat ko dustbits aur allergens naak mein settle hote hain — yeh flush karta hai. Steam ke baad seedha so jaayein, bahar hawa mein mat niklein.

⚠️ Yeh raat ke liye surface relief hai — allergy ki root cause waise ki waisi hai.

Subah uthke zaroor batana — neend kaisi aayi, naak khuli thi ya band? 🙏`,

    congestive: `✅ Kaphaja Pratishyaya 🔵
Type: Congestive Sinusitis | Dosha: Kapha dominant

Aaj raat ke 2 steps try karein:

1️⃣ *Adrak-Haldi Kadha* — Raat ke khane ke 30-40 min baad
½ inch adrak + ½ tsp haldi + 1 cup paani — 5 min ubaalein. Thoda thanda karke peeyein. Balgam ko andar se loose karta hai overnight.

⏱️ 40-50 min baad, sone se 15-20 min pehle —

2️⃣ *Steam + Ghee Nasya*
10 min steam (towel sar pe). Phir 5 min baith ke — dono naak mein 1-1 boond desi ghee. Steam ne balgam dhila kiya, ghee nasal lining ko coat karta hai taki raat ko throat mein na girta rahe.

⚠️ Yeh sirf aaj raat ke liye temporary relief hai.

Subah uthke naak ki condition zaroor batana 🙏`,

    heat: `✅ Pittaja Pratishyaya 🔥
Type: Inflammatory Sinusitis | Dosha: Pitta aggravation

Aaj raat ke 2 steps try karein:

1️⃣ *Cooling Drink Before Dinner*
Khana khaane se 20-30 min pehle — 1 glass room-temp nariyal paani ya saunf-dhaniya infusion (raat bhar bhigo ke). Fried, spicy, fermented khana aaj avoid karein — pitta raat ko badhta hai.

⏱️ Khana khaane ke 1 hour baad —

2️⃣ *Chandan-Ghee Nasya*
Dono naak mein 1-1 boond desi ghee. Sone se pehle 5 min bilkul still baith ke rakhein. Ghee cooling + anti-inflammatory hota hai — pitta-based burning pe seedha kaam karta hai.

⚠️ Yeh raat ke liye surface-level relief hai. Pitta ka root internally address karna padega.

Subah kaise feel hua zaroor batana 🙏`,

    dependency: `✅ Dushta Pratishyaya ⚠️
Type: Chronic Rebound Sinusitis | Dosha: Vata + Srotas blockage

Aaj raat ke 2 steps try karein:

1️⃣ *Spray se Pehle Steam Trial*
Sone se pehle 10 min steam — plain paani. Naak kholne ki koshish spray ki jagah steam se karein. Agar zaroorat pad hi jaaye toh sirf ek naak, minimum amount.

⏱️ Steam ke 30-40 min baad —

2️⃣ *Ghee Nasya + Correct Sleeping Position*
Dono naak mein 1-1 boond desi ghee. Sone ki position: jis taraf naak zyada khuli ho — us taraf nahi, doosri taraf karwat lein. Gravity se dono naak ko equally breathe karne ka mauka milta hai.

⚠️ Spray dependency mein mucosal damage heal hone mein time lagta hai — yeh raat ke liye thodi madad hai.

Subah zaroor batana — spray lena pada ya nahi? 🙏`
  }
};

// ============================================================
// ASSESSMENT INSIGHTS — educational line after each answer
// ============================================================
const DURATION_INSIGHT = {
  short:    '📌 Short-term mein body abhi reactive phase mein hai — sahi approach se results zyada fast aate hain.',
  medium:   '📌 6 mahine–1 saal mein pattern set hone lagta hai — structured intervention sahi time pe hai.',
  long:     '📌 1–3 saal mein problem chronic hone ki taraf jaati hai — root cause pe kaam karna zaroori ho jaata hai.',
  verylong: '📌 3+ saal ki chronic condition mein repeated stress hua hai — deep protocol hi kaam karta hai.'
};

const TRIED_INSIGHT = {
  'kuch nahi':   '📌 Abhi tak kuch try nahi kiya — body naturally respond karti hai structured approach se jab already medicated na ho.',
  allopathy:     '📌 Allopathy symptoms suppress karti hai — inflammation temporarily thami, root cause waise ka waisa rehta hai. Isliye band karne pe symptoms wapas aate hain.',
  'nasal spray': '📌 Nasal spray naak ki lining constrict karti hai — temporary open hoti hai. Regular use se mucosal damage aur dependency badhti hai.',
  'sab try kiya':'📌 Root cause pe seedha kaam nahi hua isliye wapas aaya. Ayurvedic approach underlying imbalance pe kaam karti hai, sirf symptoms pe nahi.'
};

const SEVERITY_INSIGHT = {
  mild:     '📌 Abhi flare mode mild hai — sahi time hai tackle karne ka before it becomes moderate.',
  moderate: '📌 Moderate impact matlab body already compensating kar rahi hai daily — structured intervention needed.',
  severe:   '📌 Severe impact mein sleep, focus, energy sab affected — yeh sirf sinus nahi, quality of life issue hai.'
};

const SYMPTOM_INSIGHT = {
  congestive: '📌 Yeh Kaphaja Pratishyaya ka pattern hai — Kapha dosha vitiated hone se nasal passages mein ama accumulate hoti hai, srotas block hote hain. Subah zyada hona is ka classic sign hai.',
  allergic:   '📌 Yeh Vataja-Kaphaja Pratishyaya hai — Vata aur Kapha dono vitiated hain. Sneezing Vata ka naak se bahar nikalna hai, watery discharge bhi Vata-Kapha imbalance ka sign.',
  heat:       '📌 Yeh Pittaja Pratishyaya hai — Pitta dosha vitiated hone se nasal lining mein heat aur inflammation badh jaati hai. Yellow-green discharge aur burning Pitta aggravation ke clear signs hain.',
  dependency: '📌 Yeh Dushta Pratishyaya ka pattern hai — prolonged external substance se nasal mucosa ki natural functioning disturb ho gayi hai. Srotas chronically block hain, Vata movement irregular hai.'
};

// ============================================================
// FOLLOW-UP MESSAGES
// ============================================================
const SURFACE_MSG = `Yeh surface level relief dega 🙏

Agar aapko sinus baar baar hota hai ya theek nahi ho pa raha — toh sirf in steps se root tak nahi pahunchoge. Iske liye structured approach use karna chahiye jo dosha imbalance pe seedha kaam kare.

Aap kya prefer karenge?
1️⃣ Abhi structured approach start karna chahta/chahti hun
2️⃣ Pehle steps try karta/karti hun, baad mein decide karunga/karungi

Number reply karein.`;

// ============================================================
// DUAL PLAN PITCH
// ============================================================
function buildPlanMsg(sinusType) {
  const TYPE_LABEL_MAP = {
    allergic:   'Vataja-Kaphaja Pratishyaya | Allergic Rhinosinusitis | Dosha: Vata + Kapha',
    congestive: 'Kaphaja Pratishyaya | Congestive Sinusitis | Dosha: Kapha dominant',
    heat:       'Pittaja Pratishyaya | Inflammatory Sinusitis | Dosha: Pitta aggravation',
    dependency: 'Dushta Pratishyaya | Chronic Rebound Sinusitis | Dosha: Vata + Srotas'
  };
  const typeLabel = TYPE_LABEL_MAP[sinusType] || 'Pratishyaya';

  return `Identified presentation: *${typeLabel}*

Hum 2 alag protocols offer karte hain — yeh upgrades nahi hain, approaches fundamentally alag hain:

╔═══════════════════════════════╗
║   PROTOCOL 1 — Rs.499        ║
║   7-Day Sinus Stabilization   ║
╚═══════════════════════════════╝

Kiske liye sahi hai:
✔ Problem 6 mahine–1 saal ke andar
✔ Pehli baar structured try karna
✔ Symptoms baar baar aate hain — stable karna hai

Kya milega:
📅 7 din ka complete protocol
⏰ Ek time daily (subah ya raat) — simple routine
📲 WhatsApp pe daily guidance
🌿 Herbal support — optional, zaroorat pe suggest
🎯 Body ko flare mode se stable state mein laana

Price: Rs.499 (one-time)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

╔═══════════════════════════════╗
║   PROTOCOL 2 — Rs.1,299      ║
║   14-Day Deep Sinus Protocol  ║
╚═══════════════════════════════╝

Kiske liye sahi hai:
✔ Problem 1+ saal se chal rahi hai
✔ Nasal spray pe dependent hain
✔ Pehle try kar chuke — temporary hi raha
✔ Root imbalance address karna chahte hain

Kya milega:
📅 14 din ka complete protocol
⏰ Subah + Raat — dono time personalized routine
📊 Daily tracking — steps progress ke saath adjust hoti hain
🌿 Herbal support included aur personalized
🩺 Dosha-specific diet guidance
🎯 Root dosha imbalance directly address karna

Price: Rs.1,299 (one-time)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

         P1 Rs.499   |   P2 Rs.1,299
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Duration    7 din    |    14 din
Routine    1x/day    |    2x/day
Tracking    Basic    |    Full daily
Herbal   Optional    |    Included
Diet tips    No      |    Yes
Best for  Acute/New  |    Chronic/Old
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Dono alag approaches hain — ek doosre ka extension nahi. Jo aapki situation pe fit kare wohi lo.

Reply karein:
1 — Protocol 1 (Rs.499)
2 — Protocol 2 (Rs.1,299)
3 — Dono mein kya fark hai?
4 — Specialist se baat karni hai`;
}

// ============================================================
// EMAIL ASK
// ============================================================
const EMAIL_ASK = `Ek kaam aur — aapki email ID kya hai?

Aage ke protocol reminders aur tips hum email pe bhi bhejte hain — aapko value milegi aur process yaad rehta hai.

Reply mein sirf email likhen 🙏`;

// ============================================================
// HELPERS
// ============================================================
function extractFirstNumber(text) {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

function detectDuration(text) {
  const t = text.toLowerCase();
  if (t.match(/bachpan|janam|decade|bahut purani/)) return 'long';
  if (t.match(/\b(10|15|20|25|30)\s*(year|sal|saal)\b/)) return 'long';
  if (t.match(/\b(3|4|5|6|7|8|9)\s*(year|sal|saal)\b/)) return 'long';
  if (t.match(/teen|paanch|char|saalon|years/)) return 'long';
  if (t.match(/1 year|2 year|1 saal|2 saal|do saal|ek saal/)) return 'medium';
  if (t.match(/6 month|6 mahine|kuch mahine|naya|abhi|recent/)) return 'short';
  return null;
}

function detectSymptom(text) {
  const t = text.toLowerCase();
  if (t.match(/sneez|watery|runny|allerg|dust|season|aankhein/)) return 'allergic';
  if (t.match(/band|block|bhaari|heavy|pressure|chehra|congestion/)) return 'congestive';
  if (t.match(/burn|jalan|yellow|green|headache|sar dard|thick/)) return 'heat';
  if (t.match(/otrivin|spray|depend|addiction|nasivion|vicks/)) return 'dependency';
  return null;
}

function isEmailAddress(text) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

// ============================================================
// GOOGLE SHEETS
// ============================================================
async function updateLead(userId, temp, stage, symptom, name, message, platform, extra = {}) {
  if (!GOOGLE_SHEET_URL) return;
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      platform: platform || 'Facebook',
      senderId: userId,
      name: name || userId,
      message: message || '',
      temperature: temp || '🔵 Cold',
      lastStage: stage || 'new',
      symptom: symptom || '',
      ...extra
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
        headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } })
      }
    );
    const data = await res.json();
    if (data.error) console.error('WA Send error:', data.error);
  } catch (e) {
    console.error('sendWAMessage error:', e.message);
  }
}

// ============================================================
// RULE-BASED FLOW — STRICT
// ============================================================
async function handleRuleBased(senderId, text, sendFn) {
  const state = userState[senderId] || 'new';
  if (state === 'human_takeover') return;

  // ── NEW ──
  if (state === 'new') {
    if (!userProfile[senderId]) userProfile[senderId] = {};
    userState[senderId] = 'q1_duration';
    await updateLead(senderId, '🟡 Warm', 'assessment_started', '', '', '', 'Facebook');
    await sendFn(senderId,
      `Namaste! 🙏 Ayusomam Herbals mein swagat hai.\n\nAapko sinus ki takleef hai — sahi jagah aaiye hain.\n\nPehle samajhte hain — yeh problem kitne samay se hai?\n1 — 1 se 6 mahine\n2 — 6 mahine se 1 saal\n3 — 1 se 3 saal\n4 — 3 saal se zyada\n\nBas number reply karein 🙏`
    );
    return;
  }

  // ── Q1: DURATION ──
  if (state === 'q1_duration') {
    const num = extractFirstNumber(text);
    const detected = detectDuration(text);
    const ans = detected || (num === 1 ? 'short' : num === 2 ? 'medium' : num >= 3 ? 'long' : null);
    if (!ans) {
      await sendFn(senderId, 'Thoda aur clearly batayein — kitne mahine ya saal se hai? 🙏');
      return;
    }
    userProfile[senderId].duration = ans;
    userState[senderId] = 'q2_symptom';
    const dInsight = DURATION_INSIGHT[ans] || '';
    if (dInsight) await sendFn(senderId, dInsight);
    await sendFn(senderId,
      `Samajh gaya 🙏\n\nMain problem kya hai?\n1️⃣ Naak band, chehra bhaari, pressure\n2️⃣ Sneezing, runny nose, dust/mausam se trigger\n3️⃣ Burning sensation, thick mucus, sar dard\n4️⃣ Nasal spray ke bina so nahi sakta\n\nNumber reply karein.`
    );
    return;
  }

  // ── Q2: SYMPTOM ──
  if (state === 'q2_symptom') {
    const num = extractFirstNumber(text);
    const detected = detectSymptom(text);
    const map = { 1: 'congestive', 2: 'allergic', 3: 'heat', 4: 'dependency' };
    const ans = detected || map[num] || null;
    if (!ans) {
      await sendFn(senderId, 'Apna main symptom batayein — ek number reply karein 🙏');
      return;
    }
    userProfile[senderId].symptom = ans;
    userState[senderId] = 'q3_tried';
    const sInsight = SYMPTOM_INSIGHT[ans] || '';
    if (sInsight) await sendFn(senderId, sInsight);
    await sendFn(senderId,
      `Pehle kuch try kiya?\n1️⃣ Nahi, abhi tak kuch nahi\n2️⃣ Allopathy / antibiotic\n3️⃣ Nasal spray\n4️⃣ Sab try kiya — relief temporary hi raha\n\nNumber reply karein.`
    );
    return;
  }

  // ── Q3: TRIED ──
  if (state === 'q3_tried') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 4) {
      await sendFn(senderId, '1 se 4 ke beech number reply karein 🙏');
      return;
    }
    const map = { 1: 'kuch nahi', 2: 'allopathy', 3: 'nasal spray', 4: 'sab try kiya' };
    const triedVal = map[num];
    userProfile[senderId].tried = triedVal;
    userState[senderId] = 'q4_severity';
    const tInsight = TRIED_INSIGHT[triedVal] || '';
    if (tInsight) await sendFn(senderId, tInsight);
    await sendFn(senderId,
      `Roz ki life mein kitna affect karta hai?\n1️⃣ Thoda — adjust ho jaata hun\n2️⃣ Moderate — kaafi takleef hoti hai\n3️⃣ Severe — neend, kaam, sab affected\n\nNumber reply karein.`
    );
    return;
  }

  // ── Q4: SEVERITY → FREE STEPS ──
  if (state === 'q4_severity') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 3) {
      await sendFn(senderId, '1, 2 ya 3 reply karein 🙏');
      return;
    }
    const sevVal = { 1: 'mild', 2: 'moderate', 3: 'severe' }[num];
    userProfile[senderId].severity = sevVal;
    const sevInsight = SEVERITY_INSIGHT[sevVal] || '';
    if (sevInsight) await sendFn(senderId, sevInsight);
    const type = userProfile[senderId].symptom || 'congestive';
    const timing = getTimeSlot();
    userProfile[senderId].freeStepTiming = timing;

    await updateLead(senderId, '🔴 Hot', 'assessment_complete', type, '', '', 'Facebook');
    userState[senderId] = 'free_steps_sent';

    const stepMsg = (FREE_STEPS[timing] && FREE_STEPS[timing][type]) || FREE_STEPS[timing]['congestive'];
    await sendFn(senderId, stepMsg);

    // Send surface disclaimer + choice immediately
    userState[senderId] = 'after_steps';
    await sendFn(senderId, SURFACE_MSG);
    return;
  }

  // ── AFTER STEPS: start now or try first ──
  if (state === 'after_steps') {
    const t = text.toLowerCase().trim();
    const wantsTry = t === '2' || t.match(/pehle|try|baad|steps/);

    if (wantsTry) {
      userState[senderId] = 'try_first';
      await updateLead(senderId, '🟡 Warm', 'try_first', userProfile[senderId].symptom, '', '', 'Facebook');
      await sendFn(senderId, `Bilkul 🙏 Steps try karein — subah aur raat dono.\n\nKuch bhi sawaal ho ya result share karna ho — yahan reply karein.\n\nJab ready ho tab protocol ke liye batayein.`);
      return;
    }

    // Default: 1 or any other input → show full plans
    userState[senderId] = 'pitched';
    const sinusType = userProfile[senderId].symptom || 'congestive';
    await updateLead(senderId, '🔴 Hot', 'plans_shown', sinusType, '', '', 'Facebook');
    await sendFn(senderId, buildPlanMsg(sinusType));
    return;
  }

  // ── PLAN SELECTION ──
  if (state === 'pitched') {
    const t = text.toLowerCase().trim();

    // Protocol 1 — 499
    if (t === '1' || t.match(/\b499\b|protocol 1|plan 1/)) {
      userState[senderId] = 'plan_selected';
      await updateLead(senderId, '🔴 Hot', 'protocol_1_selected', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId,
        `Sahi decision 🙏\n\n7-Day Sinus Stabilization Plan — Rs.499\n\nPayment link:\n${PAYMENT_499}\n\nPayment ke baad screenshot yahan bhejein.\n\nAyusomam Herbals 🌿`
      );
      return;
    }

    // Protocol 2 — 1299
    if (t === '2' || t.match(/\b1299\b|protocol 2|plan 2/)) {
      userState[senderId] = 'plan_selected';
      await updateLead(senderId, '🔴 Hot', 'protocol_2_selected', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId,
        `Bahut achha 🙏\n\n14-Day Deep Sinus Protocol — Rs.1,299\n\nPayment link:\n${PAYMENT_1299}\n\nPayment ke baad screenshot yahan bhejein.\n\nAyusomam Herbals 🌿`
      );
      return;
    }

    // Difference question
    if (t === '3' || t.match(/kaun sa|fark|difference|confused|dono mein|samajh/)) {
      await sendFn(senderId,
        `Key difference:\n\nProtocol 1 — 7 din, ek time daily, acute/new cases. Body ko stabilize karna goal.\n\nProtocol 2 — 14 din, subah + raat dono, chronic/old ya spray dependent cases. Root dosha imbalance address karna goal.\n\nDono fundamentally alag hain — ek ka extension nahi.\n\nSeedha batayein — 1 ya 2?`
      );
      return;
    }

    // Specialist
    if (t === '4' || t.match(/specialist|sachin|baat|call/)) {
      userState[senderId] = 'human_takeover';
      await updateLead(senderId, '🔴 Hot', 'requested_specialist', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId,
        `Bilkul 🙏 Sachin Ji personally baat karenge.\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`
      );
      return;
    }

    await sendFn(senderId,
      `Reply karein:\n1 — Protocol 1 (Rs.499)\n2 — Protocol 2 (Rs.1,299)\n3 — Dono mein kya fark hai?\n4 — Specialist se baat 🙏`
    );
    return;
  }

  // ── POST PAYMENT ──
  if (state === 'plan_selected' || state === 'done') {
    await sendFn(senderId, `Kisi bhi madad ke liye seedha WhatsApp karein:\n📱 ${WHATSAPP_NUM}\nAyusomam Herbals 🌿`);
    return;
  }
}

// ============================================================
// MAIN PROCESSOR — Rule-based only (AI_MODE removed for strict control)
// ============================================================
async function processMessage(senderId, text, sendFn, platform) {
  if (userState[senderId] === 'human_takeover') {
    console.log(`SILENT — human takeover: ${senderId}`);
    return;
  }

  console.log(`[${platform}] ${senderId}: ${text}`);

  // Payment query — direct intercept
  const t = text.toLowerCase();
  const isPaymentQuery = t.match(/payment|kaise karu|kitna hai|price|cost|1299|499|buy|lena hai|link do|gpay|phonepe|paytm|order/);
  if (isPaymentQuery && (userState[senderId] === 'pitched' || userState[senderId] === 'after_steps')) {
    await sendFn(senderId,
      `Payment ke liye:\n\n*Protocol 1 (₹499):* 👉 ${PAYMENT_499}\n*Protocol 2 (₹1,299):* 👉 ${PAYMENT_1299}\n\nPayment ke baad screenshot bhejein 🙏\n📱 ${WHATSAPP_NUM}`
    );
    return;
  }

  await handleRuleBased(senderId, text, sendFn);
}

// ============================================================
// FACEBOOK WEBHOOK
// ============================================================
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ayusomam_verify';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else { res.sendStatus(403); }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const msg of entry.messaging) {
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
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else { res.sendStatus(403); }
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
          const from = msg.from;
          const text = msg.text?.body?.trim();
          if (!from || !text) continue;
          await processMessage(from, text, sendWAMessage, 'WhatsApp');
        }
      }
    }
  } catch (e) { console.error('WA webhook error:', e.message); }
});

// ============================================================
// RAZORPAY WEBHOOK
// ============================================================
app.post('/razorpay-webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body;
    if (RAZORPAY_WEBHOOK_SECRET && signature) {
      const expectedSig = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
      if (expectedSig !== signature) { console.error('❌ Razorpay signature mismatch'); return; }
    }
    const payload = JSON.parse(rawBody.toString());
    if (payload.event !== 'payment.captured') return;
    const payment = payload.payload?.payment?.entity;
    if (!payment) return;
    const orderId = payment.id || 'N/A';
    const amount = (payment.amount / 100).toFixed(0);
    const email = payment.email || '';
    const name = payment.notes?.name || payment.notes?.billing_name || email.split('@')[0] || 'Customer';
    let phone = (payment.contact || '').replace(/\D/g, '');
    if (phone.startsWith('91') && phone.length === 12) phone = phone.slice(2);
    console.log(`💰 Payment: ${orderId} | ${name} | ${phone} | ₹${amount}`);
    if (GOOGLE_SHEET_URL) {
      await fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(), platform: 'Razorpay',
          senderId: phone || email, name,
          message: `PAID ₹${amount} | Order: ${orderId}`,
          temperature: '✅ Paid', lastStage: 'payment_complete',
          symptom: '', email, orderId, amount: `₹${amount}`
        })
      });
    }
    if (phone && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
      const waPhone = `91${phone}`;
      await sendWAMessage(waPhone,
        `✅ *Payment Confirmed!*\n\nOrder ID: ${orderId}\nAmount: ₹${amount}\n\n*${name} Ji, aapka order register ho gaya hai.* 🙏\n\nKal subah tak aapko Day 1 protocol milega.\n\n— *Sachin, Ayusomam Herbals* 🌿`
      );
      setTimeout(async () => {
        await sendWAMessage(waPhone,
          `Namaskar *${name} Ji* 🙏\n\nAapne sahi decision liya.\n\nAbhi ke liye ek kaam: subah uthke 1 glass gunguna paani peeyein — khaali pet.\n\nKal main personally aapka Day 1 routine bhejunga. 🌿`
        );
      }, 8000);
    }
  } catch (e) { console.error('Razorpay webhook error:', e.message); }
});

// ============================================================
// BOT CONTROL
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
  } else { res.status(400).json({ error: 'action must be BOT_ON or BOT_OFF' }); }
});

// ============================================================
// WEBSITE CHATBOT LEAD ENDPOINT
// ============================================================
app.post('/website-lead', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const { name, phone, sinusType, stage, message } = req.body;
    // WEB_ prefix — sheet scientific notation nahi karega
    const senderId = phone ? `WEB_${String(phone).replace(/\D/g, '')}` : `WEB_${Date.now()}`;
    console.log(`WEBSITE LEAD: ${name} | ${phone} | ${sinusType} | ${stage}`);
    await updateLead(
      senderId,
      '🟡 Warm',
      stage || 'website_chat',
      sinusType || '',
      name || 'Website Visitor',
      (name ? name + ' — ' : '') + (sinusType || 'website lead'),
      'Website'
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Website lead error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.options('/website-lead', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ayusomam Herbals Bot v2 — Running
Port    : ${PORT}
Mode    : ✅ Rule-Based (Strict)
Facebook: /webhook
WhatsApp: /whatsapp
Razorpay: /razorpay-webhook
Website : /website-lead
Plans   : ₹499 (A) + ₹1,299 (B)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
