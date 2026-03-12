// ============================================================
// AYUSOMAM MESSENGER BOT
// Version 2.4 — Human-like typing + One-message-per-turn + Devanagari
// Flow: Hook → [wait] → Duration → [wait] → Symptoms → [wait]
//       → Reveal → [wait] → Pitch → Claude AI handles rest
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const Anthropic = require("@anthropic-ai/sdk");
const app = express();
app.use(express.json());

// ─── CONFIG ──────────────────────────────────────────────────
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAYMENT_1299 = "https://rzp.io/rzp/qu8zhQT";
const PAYMENT_499 = process.env.PAYMENT_499_LINK || "https://rzp.io/rzp/REPLACE_499";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwWjnJa2utTx0vQUkjdKtSaVpJBllL1-f-inxEfmxzutyF5GpGS2bChD5qVXkYPwqSbuA/exec";

// ─── ANTHROPIC CLIENT ─────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── STATE + DEDUP ────────────────────────────────────────────
const userState = {};
const processedMessages = new Set();
setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

// ─── SALESOM SYSTEM PROMPT ────────────────────────────────────
const SALESOM_SYSTEM_PROMPT = `SALESOM — MASTER SYSTEM PROMPT
Ayusomam Herbals | Sinus Sales Specialist | Complete Deployment Prompt

IDENTITY
Tu SALESOM hai — Ayusomam Herbals ka Sinus Sales Specialist aur Ayurvedic Consultation AI.
- Brand: Ayusomam Herbals (ayusomamherbals.com)
- Consultant name: Sachin
- Platform: Facebook Messenger
- Core expertise: Charaka Samhita + Ashtanga Hridayam based Pratishyaya (Sinus) management
- Mission: Type-specific Ayurvedic sinus consultation → 14-Din Protocol conversion

LANGUAGE + SCRIPT RULES — HIGHEST PRIORITY
Auto-detect from every message:
- Devanagari script (हिंदी में लिखा) → Reply in Devanagari script only
- Roman Hindi / Hinglish → Roman Hindi reply
- English → English reply
- Marathi → Marathi reply
CRITICAL: Mirror the SCRIPT, not just the language. If user writes in Devanagari, ALL your text must be in Devanagari.
Never ask about language. Detect and mirror instantly.
Once script set — maintain it for entire conversation unless user switches.

TONE — NON-NEGOTIABLE
NEVER USE: Bhai, Yaar, Boss, Dude, street language, stiff corporate tone, long paragraphs
ALWAYS USE: Aap / Ji, caring expert register, warm professional, short mobile-friendly blocks

Style: Caring expert. Doctor jaisi authority + human warmth.
Keep responses SHORT — 3-5 lines max. Mobile screen readable.

4 PRATISHYAYA TYPES — KEY FACTS

TYPE 1: VATAJA-KAPHAJA (ALLERGIC)
Symptoms: Sneezing (especially morning), watery eyes, dust/cold triggers, seasonal pattern
Key treatment: Anu Tailam Nasya + Anulom-Vilom (4:16:8 ratio, 10-15 min)
Day milestones: Day 4-5: Morning sneezing reduces | Day 7: Triggers less reactive | Day 14: Significant baseline improvement

TYPE 2: KAPHAJA (CONGESTIVE)
Symptoms: Naak band, smell/taste loss, heaviness, started after cold/infection
KEY RULE: Dairy = Nidana. Band kiye bina protocol kaam nahi karta.
Key treatment: Til Taila Nasya + Gandoosha Kriya (pehle) + specific Kwatha
Day milestones: Day 5-7: Smell/taste begins returning (KEY) | Day 8-10: Morning congestion reduced | Day 12-14: Taste/smell mostly restored

TYPE 3: PITTAJA (HEAT PATTERN)
Symptoms: Burning sensation, watery/yellow discharge, worse in heat, antibiotics gave temporary relief
CRITICAL: Eucalyptus/camphor steam = CONTRAINDICATED (Ushna Virya — worsens Pitta)
Key treatment: Narikela Taila Nasya (cooling) + Sheetali Pranayama + steam: plain water ONLY
Day milestones: Day 3-4: Burning starts reducing | Day 5: Noticeable burning reduction | Day 14: Burning mostly resolved

TYPE 4: AUSHADHA ASAKTI (SPRAY DEPENDENCY)
Symptoms: Can't sleep without spray, frequency increasing, failed cold turkey attempts
KEY RULE: NEVER cold turkey. Graduated rehabilitation ONLY.
Key treatment: Gau Ghrita Nasya (conditioning FIRST) + Bhramari Pranayama before bed + graduated dose reduction
Day milestones: Day 4-5: First 1-2 hours spray-free | Day 8-10: 4-6 hours spray-free | Day 14: Night spray becomes optional

PRICING
- 14-Din Nasal Restoration: Rs.1,299 — default close for all types
- 28-Din Deep Protocol: Rs.2,199 — for 5+ year history, spray dependency
- VIP Intensive: Rs.7,999 — professionals, high-engagement leads
- Maintenance Protocol: Rs.799/month — Day 13-14 of active patient

OBJECTION HANDLING
"Thoda mahanga hai" → Monthly antihistamines + spray: Rs.400-800 indefinitely. ENT visit: Rs.1,000-2,000 — sirf prescription. Yahan 14 din daily personal guidance: Rs.1,299 ek baar.
"Pehle bhi Ayurveda try kiya" → Jo try kiya — kya woh specifically aapke Pratishyaya type ke liye tha? Kaphaja ke liye jo kaam karta hai, Pittaja mein WORSE karta hai.
"Koi guarantee hai?" → Jo honestly bol sakta hun: jo patients ne protocol exactly follow kiya — unhe Day 5-7 mein meaningful change mila.
"Abhi nahi" → Jo cycle chal rahi hai, woh apne aap nahi tooti. Koi specific reason hai wait karne ka?

RED FLAGS — ALWAYS REFER TO DOCTOR
Fever above 102F with sinus | Blood in discharge | Severe one-sided facial pain | Vision changes (EMERGENCY) | Children under 6 | Zero improvement after Day 7.

POWER CLOSES
On the fence: "Ek sawaal: jo condition abhi hai — kya aap iske saath 1 saal aur comfortable hain? Agar nahi — toh 14 din ka structured try worth karne wali cheez hai."
Chronic: "5+ saal se problem hai — matlab kai cheezon ne kaam nahi kiya. Mera protocol unse alag hai kyunki type-specific hai."

CRITICAL INSTRUCTION FOR THIS DEPLOYMENT:
- You are handling POST-PITCH messages. Sinus type already identified, pitch already delivered.
- Do NOT restart diagnostic flow. Do NOT ask symptoms again.
- Do NOT include payment links or URLs — system sends them separately.
- Keep responses SHORT — under 150 words. End with soft close or open question.
- If user says yes/wants to buy — respond warmly but NO payment links. System handles.`;

// ─── SCRIPT DETECTION ─────────────────────────────────────────
// Returns 'dev' if Devanagari Unicode chars present, else 'rom'
function detectScript(text) {
  return /[\u0900-\u097F]/.test(text) ? "dev" : "rom";
}

// ─── SINUS TYPE DETECTION ─────────────────────────────────────
function detectSinusType(text) {
  const t = text.toLowerCase();
  if (/spray|nasivion|otrivin|otrivine|bina spray|afrin|chhodna|chhod nahi|dependent|\u0938\u094d\u092a\u094d\u0930\u0947/.test(t)) return "spray";
  if (/smell nahi|taste nahi|bilkul band|dono taraf|surgery|polyp|growth|\u0917\u0902\u0927 \u0928\u0939\u0940\u0902|\u0928\u093e\u0915 \u092c\u0902\u0926/.test(t)) return "polyp";
  if (/peela|peeli|hara|hari|infection|antibiotic|burning|jalan|\u091c\u0932\u0928|\u092a\u0940\u0932\u093e|\u0938\u0902\u0915\u094d\u0930\u092e\u0923/.test(t)) return "infective";
  if (/dhool|dust|smoke|dhuan|season|chheenk|sneez|allerg|\u091b\u0940\u0902\u0915|\u0927\u0942\u0932|\u090f\u0932\u0930\u094d\u091c\u0940/.test(t)) return "allergic";
  return "congestive";
}

// ─── SEND TYPING INDICATOR ────────────────────────────────────
async function sendTypingOn(recipientId) {
  try {
    await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          sender_action: "typing_on",
        }),
      }
    );
  } catch (e) { /* silent fail — typing indicator is best-effort */ }
}

// ─── SEND MESSAGE (raw) ────────────────────────────────────────
async function sendMessage(recipientId, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          messaging_type: "RESPONSE",
        }),
      }
    );
    const data = await res.json();
    if (data.error) console.error("Send error:", data.error);
  } catch (e) {
    console.error("Send fetch error:", e.message);
  }
}

// ─── SEND QUICK REPLIES (raw) ─────────────────────────────────
async function sendQuickReplies(recipientId, text, replies) {
  try {
    const quick_replies = replies.map((r) => ({
      content_type: "text",
      title: r.substring(0, 20),
      payload: r.toUpperCase().replace(/[^A-Z0-9]/g, "_").substring(0, 1000),
    }));
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text, quick_replies },
          messaging_type: "RESPONSE",
        }),
      }
    );
    const data = await res.json();
    if (data.error) console.error("QR error:", data.error);
  } catch (e) {
    console.error("QR fetch error:", e.message);
  }
}

// ─── HUMAN-LIKE SEND: typing indicator → realistic delay → send ──────────────
// Delay = 900ms base + 25ms per char, capped at 3000ms
// This makes the bot feel like a real person typing
async function sendWithTyping(recipientId, text) {
  await sendTypingOn(recipientId);
  const delay = Math.min(900 + text.length * 25, 3000);
  await new Promise((r) => setTimeout(r, delay));
  await sendMessage(recipientId, text);
}

async function sendQRWithTyping(recipientId, text, replies) {
  await sendTypingOn(recipientId);
  const delay = Math.min(900 + text.length * 25, 3000);
  await new Promise((r) => setTimeout(r, delay));
  await sendQuickReplies(recipientId, text, replies);
}

// ─── HOOKS (one sent per new user, picked randomly) ──────────
const HOOKS_ROM = [
  `😮‍💨 Subah uthte hi naak band, din bhar sar bhaari...\n\nSinus ek baar pakad le, toh chhod nahi deta.\n\nSahi jagah aaye hain aap. 🌿`,
  `Spray use karte hain? Thodi der rahat — phir wahi band. 😮‍💨\n\nYeh cycle kab tooti hai? Kabhi nahi — jab tak andar ki wajah treat na ho.\n\nSahi jagah aaye hain. 🌿`,
  `Naak band, smell nahi, din bhar bhaari, neend bhi kharab... 😮‍💨\n\nSinus sirf naak ki nahi — poori quality of life ki problem hai.\n\nAap sahi jagah aaye hain. 🌿`,
  `Doctor ke paas gaye, dawai li, kuch dino theek raha — phir wahi wapas. 😮‍💨\n\nIsliye hota hai kyunki sirf symptoms treat hoti hain, andar ki wajah nahi.\n\nSahi jagah aaye hain. 🌿`,
  `Raat ko muh khol ke sote hain? Subah fresh nahi uthte? 😮‍💨\n\nYeh sinus ka classic sign hai — aur iski asli wajah har case mein alag hoti hai.\n\nSahi jagah aaye hain. 🌿`,
];

const HOOKS_DEV = [
  `😮‍💨 सुबह उठते ही नाक बंद, दिन भर सर भारी...\n\nSinus एक बार पकड़ ले, तो छोड़ता नहीं।\n\nसही जगह आए हैं आप। 🌿`,
  `Spray use करते हैं? थोड़ी बेर राहत — फिर वही बंद। 😮‍💨\n\nयह cycle कब टूटती है? कभी नहीं — जब तक अंदर की वजह नह treat न हो।\n\nसही जगह आए हैं। 🌿`,
  `नाक बंद, smell नहीं, दिन भर भारी, नींद भी ख़ऱब... 😮‍💨\n\nSinus सिर्फ़ नाक की नहीं — पूरऀ quality of life की problem है।\n\nAap सही जगह आए हैं। 🌿`,
  `Doctor क॥प ���������_��<�������ׂ���� ���˂� ����W����l������������������T���Â�炒���P�������������ׂ�炖 ���ׂ�������ゖ���~b��7�~J�q�q�����を˂����<���炖/���������炖 ���W��7�����/����W������を���Â�7����������ѽ�́�ɕ�Ѓ��炖/����� ���炖#�����������������W�� ���ׂ�s��䃂����炖�����q�q���を炖 ���s��_��䃂���<���炖#�������~2���(�����Â��������W��,����������䃂�[��/��ȃ��W�����ゖ/��������炖#������ゖ�����䁙ɕ͠������炖�����'�����������~b��7�~J�q�q�������M���̃��W��������ͥ��ͥ�����炖 ��P���S���������W�� �����を˂� ���ׂ�s��䃂�炒����͔�������������˂�\���炖/����� ���炖#���q�q���を炖 ���s��_��䃂���<���炖#�������~2���)t�((����R�R�R �UIQ%=8�EUMQ%=8��R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R )�չ�ѥ�������Ʌѥ��EՕ�ѥ���͌���(������͌���􀉑�؈���(����ɕ��ɸ��(������ѕ��聃�����䃂����W��˂���������������W��,���W��������������を�������ゖ���炖 ���~2���(������ɕ������l�ă�����炖��������ゖ����؃�����炖��������ゖ����Ĵȃ��を���ȃ��ゖ����Ԭ���を���ȃ��ゖ�t�(������(���(��ɕ��ɸ��(����ѕ��聁e���х��������������ѹ��݅�Ё͔�������~2���(����ɕ������l�ā�������͔����؁�������͔����Ĵȁͅ���͔����Ԭ�ͅ���͔�t�(����)�((����R�R�R �UIQ%=8�5AQ!d�
,��R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R )�չ�ѥ�������Ʌѥ�����ѕ�а�͌���(������Ё啅�̀����͕%�Р�ѕ�й��э���q��������mt�l�t�������(������ЁѰ��ѕ�йѽ1�ݕ�
�͔���(������Ё��1�����啅�̀��ԁ����q�����q�����q�����q���͕q����ȼ�ѕ�СѰ��(������Ё��5����啅�̀��ȁ����ͅ���啅��q�����q���͕q����ȼ�ѕ�СѰ��(������Ё��5���􀽵�����񵽹ѡ�q���ɕq�����q�����q����༹ѕ�СѰ��((������͌���􀉑�؈���(����������1�����ɕ��ɸ����啅�́������W�� �􃂒を���ȃ��ゖ������䃂����W��˂����������炖 �����~b��7�~J�q�q��������������を���������������を���Â�7���������������T������炖����P����������������ɝ䰁����̃��を�������Ѓ��炖/���������炖#���q�q������䁍�͔������7������������ゖ��������[��������炖#�������(����������5����ɕ��ɸ����啅�́������W�� �􃂒を���ȃ��ゖ���k��ȃ��Â�炒����炖 ��P���������˂���������ѕ���Ʌ�䃂����炖�����������������W����l�͕Ѓ��炖,���k����W������炖#���q�q�M����������ͥ̃��s���Â���Â� ���炖#�����(����������5����ɕ��ɸ����W��������� ���を�������ゖ���k��ȃ��Â�炖 ���炖 ��P��������х������������を炖 ��ɽѽ������ゖ���s��˂�7����� ��������T���炖,���をW���������炖#�����(����ɕ��ɸ���������T���炖 ����を���t���_���������������炒˂���ɽ��ɱ䁑�����͔���W��Â�������炖#�������(���((��������1�����ɕ��ɸ����啅�́����-����ͅ���͔�啠�х��������������~b��7�~J�q�q�%ѹ��݅�Ё�����ͥɘ������������P�����������ɝ䰁����́ͅ�������ѕ����ф�����q�q�e�����͔���典�͔�����є��������(��������5����ɕ��ɸ����啅�́����-����ͅ���͔������Ʌ��������P���ѱ���啠�ѕ���Ʌ�䁹���������ȁ�Ս��͕Ё�����խ������q�q�M����������ͥ́�ɽ�ɤ�������(��������5����ɕ��ɸ��-�����݅�Ё͔������Ʌ��������P��́�х������ͅ����ɽѽ����͔�������ѡ�������ͅ�ф�������(��ɕ��ɸ��Q����������ͅ�������儸�A������ɽ��ɱ䁑�����͔����є��������)�((����R�R�R �Me5AQ=5L�EUMQ%=8��R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R )�չ�ѥ������M��ѽ��EՕ�ѥ���͌���(������͌���􀉑�؈���(����ɕ��ɸ��(������ѕ��聃�������������������<��P����ѽ�̃��W��7���������炖#������s��,������ ��������炖/���������炖#�����~2���(������ɕ������l���������T������������Â�炒��� ���炖 ����M�Ʌ��͔���W��Â��������炖������M����������炖���������� �����������˂�����炒Â�����͍��ɝ��t�(������(���(��ɕ��ɸ��(����ѕ��聁����х���P����ѽ�́�儁������)�������������ф�������~2���(����ɕ������l�9���������ɕ�Ѥ��������M�Ʌ��͔����ф��ո����M������������Ѥ����A�������Ʉ���͍��ɝ��t�(����)�((����R�R�R �IY0�5MML���������͍ɥ�Ф��R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R )�չ�ѥ������I�ٕ��5��ͅ���������͌���(������Ёɽ����(��������ɝ��聁��������ѕɸ���������ͅ�������儃�P�啠��Y�х���-�����������ɝ����M���̨�������~2�q�q����ե���ѕ�Ё��ɼ聝��ȁ͔�����ȁ����儁����ɔ�ɽ�������������M��ѽ�́݅����ѡ���������ɕ�Ё���������ѽ�������ɴ�����q�q��ȁ�������ȁͥ����P�����������������թ��Ѥ���������������ͅ�Ѡ��
�����ѥٔ�������������������ф��e���ͥ�������q�q�%́�����������ɥ���ȁ����ѥ�䁡�������ɕ�ձ�́����Ё���Ё���є��������((����������ѥٔ聁��������ѕɸ���������ͅ�������儃�P�啠��-��������
�����ѥٔ��M���̨�������~2�q�q���ѕ�Ё��ɼ�ͥȁ�������խ��������Ʉ���������ԁ͕���խ���5�ѡ��儁������������ɕ���ɔ���������ѽ�������ɴ�����q�q�MՉ����ѡ������������������ф�ͅ�͔���Ʉ����ф���������
���ͥ��-��������P�Ʌ�Ё���ȁ�Ս�́�������Ѥ�����q�q��i�ɽ�ɤ訁���䁥́��������ͅ�͔��������͡���������P��ɽѽ�������ͅ�Ѡ��������ɹ�����������((������Ʌ�聁��������ѕɸ���������ͅ�������儃�P�啠���͡�����ͅ�Ѥ��M�Ʌ���������䤨�������~2�q�q���ѕ��聕��Ʌ�Ё��Ʌ䁵�Ё����9�������͡��������P�啠������ɴ����ф�������������ͥ����䁑�������Ё�����խ������q�q�M�Ʌ䁭��ȴ́����є������������͔������兑��������e���ɕ��չ��������ѥ�������q�q��
������ɭ�䁭�������Ё��ɼ���P�ݽ���ͱ�唁�������ф������Ʌ�Յѕ���ɽѽ������������ф�������((���������ѥٔ聁��������ѕɸ���������ͅ�������儃�P�啠��A��х����%����ѥٔ�!��Ф�M���̨�������~2�q�q������������ȁ�������ѽ���������������ɐ�儁���٥�������ɕ�Ёͥ��́������ѥ�������q�q��ѥ���ѥ��͔�̴Ё����ѡ������������ɼ�ѽ��݅�����	��ѕɥ����危������啠�q�q��
ɥѥ���聕Ս������́儁������ȁ�ѕ�����������Ё��ɼ���P�A��х��������]=IM����ф������M�ɘ�������݅ѕȹ��((���������聁��������ѕɸ���������ͅ�������儃�P�啠��A�����	��������M���̨�������~2�q�q���ѕ��聱�չ��儁��Ʌ�������������́������P��Ս��͵�������������хɅ����Յ��䁉����q�q���хɅ��������
�����ѥٔ�������хɅ����Յ��䁉�����A��������ѕɸ������ɴ��q�q�-��������������ɝ����՝���Ё�դ�ѡ���P�����ɔ��ɽѽ����͔���������������ɝ��䁭�����ɽٕ���Ё��������������(����((������Ё��؀��(��������ɝ��聃�������W�������ѕɸ��������X���W�����を���t�����������P������䀩Y�х���-�����������ɝ����M���̨���炖#�����~2�q�q���?��T��ե���ѕ�Ѓ��W��Â���胂�c������ゖ���������炒����s�����?�����������������をÂ��ɽ���������������M��ѽ�̃��ׂ���߂�ゖ/�������-�����ɕ�Ё�������炖,���������,������ɴ���炖#���q�q���?��T�����ȁͥ����P��������[���������� ���[����s��˂������� ���炖#������������T���W�����を������
�����ѥٔ�����������W����� ������炖�����炖/����������������ͥ�����炖 �q�q���������������������ɥ���ȁ����ѥ�䃂�炖/�������������ɕ�ձ�̃�����炖�������Ѓ��������˂�������炖#�������((����������ѥٔ聃�������W�������ѕɸ��������X���W�����を���t�����������P������䀩-��������
�����ѥٔ��M���̨���炖#�����~2�q�q���?��T�ѕ�Ѓ��W��Â���胂�を���������_�����w����W�����?������k����炒Â����������k����ԁ͕����Â���W�����������������������������_�����˂�/������������ɕ���ɔ��������炖,������,������ɴ���炖#���q�q���ゖ�����䃂�'�����W��������炒˂��������������c����������を���ゖ��������Â�����˂�_���������炖 ���������
���ͥ��-��������P���Â��������������Ս�̃��s������s�������� ���炖#���q�q����s���Â���Â� 訁���䃂������������W������を���ゖ�������������������ۂ�7���������炖 ��P��ɽѽ������W�����を����������������W��Â���� ������������_�������((������Ʌ�聃�������W�������ѕɸ��������X���W�����を���t�����������P������䀩�͡�����ͅ�Ѥ��M�Ʌ���������䤨���炖#�����~2�q�q���?��T�ѕ��胂�?��T���Â��������Ʌ䃂��������˂�/����������������������ۂ�7��W�����ȃ��炖,��P������䁍����ɴ���W��Â��������炖 ���������T����ͥ����䁑�������Ѓ��炖,���k����W�� ���炖#���q�q�M�Ʌ䃂�W���ȴ̃��c����������������������炒˂����ゖ������ ���s���7�����������������������I���չ��������ѥ�����炖 ������炖�q�q��
������ɭ�䃂�W����� ����������W��Â�,���P���ׂ�,�����を˂����<��������炖/���������炖#����Ʌ�Յѕ���ɽѽ������W���������W��Â��������炖#�����((���������ѥٔ聃�������W�������ѕɸ��������X���W�����を���t�����������P������䀩A��х����%����ѥٔ�!��Ф�M���̨���炖#�����~2�q�q���?��T������胂�+���������W����������������/�������������炒˂�7��W���������Â�7��������������٥�������ɕ�Ёͥ��́������ѥ�����炖#���q�q��ѥ���ѥ����ゖ�̴Ѓ�����������������T�������������W��Â�,������,���ׂ����������	��ѕɥ����危����炖 ������炖�q�q��
ɥѥ���聕Ս������̃�������������ȁ�ѕ�����W����� ����������W��Â�,���P�A��х�����������]=IM���W��Â��������炖#������を���Â�7�������������݅ѕ˂����((���������聃�������W�������ѕɸ��������X���W�����を���t�����������P������䀩A�����	��������M���̨���炖#�����~2�q�q���?��T�ѕ��胂�˂�3����\���������������Â�T���������T���W���������������˂����L��P���W����l�͵�������������������/�����/��������Â�����Յ��䃂��������q�q���?��T������Â�������������
�����ѥٗ����������/�����/��������Â�����Յ��䃂���������A��������ѕɸ������ɷ����q�q���W�� ���˂�/��_��/�����W��,���ɝ����՝���Ѓ��炖�� ������ ��P���炒������Â���ɽѽ������ゖ���W�� ����������������������ɝ��䃂�W������ɽٕ���Ё�������W�� ���炖#�����(����((������Ё�Ɍ��͌���􀉑�؈�����؀�ɽ��(��ɕ��ɸ��ɍm����t�����ɍl�������ѥٔ�t�)�((����R�R�R �A%Q
 �5MML��R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R�R (����х����������Ѽ�չ����х�����ᅍѱ�ݡ�Ёѡ�䁝��)�չ�ѥ������A�э�5��ͅ���������͌���(������Ё����9���̀��(��������ɝ��耀��ɽ�耉���ɝ���M���̈�������耉���ɝ���M���̈���(����������ѥٔ��ɽ�耉
�����ѥٔ�M���̈�����耉
�����ѥٔ�M���̈���(������Ʌ�耀�����ɽ�耉M�Ʌ���������䈰����耉M�Ʌ���������䈁��(���������ѥٔ老�ɽ�耉%����ѥٔ�M���̈������耉%����ѥٔ�M���̈���(���������耀�����ɽ�耉A�����M���̈����������耉A�����M���̈���(����((������Ёѹ���������9����m����t��������9����l�������ѥٔ�t�m͌���􀉑�؈������؈�耉ɽ��t�((������͌���􀉑�؈���(����ɕ��ɸ���������W������ѹ��������W�����˂����<�������ͽ����镐��з�����������ɽ�Ʌ����炖#�����~2�q�q�ȁ��ѥ��̃��炖#���q�q��~2Ā��
���䃊P�Mх�ѕȁ-�Щq��������W���ͥ��́�������W����͕����ե�����ɽѽ����]������������Â�����[��������W��Â�������炒���ե�����W��Â�������炖#�����q�q����q�q��~2����
�İ��䃊P��з����������9�ͅ��I��ѽɅѥ���Aɽ�Ʌ��q���@�|���を���ゖ���s���7���������������˂�����������s������������炖 �}q�q���������W��,��ᅍѱ䃂����䃂�������˂���_����q��r���ă�P��������W�� ��������Â� ����ѽ�䰁�ɥ����́���ͽ����䃂�を���w������_����]��������������q��r��������W���ͥ��́�������W�����˂����<����ѽ��ɽ�ѥ����P���ゖ��������������������|�����Â�������ԃ�����������}q��r��Ѓ������������Â�/��s�����������Â���]�����������������P������p���W��#��を����Â�炒�������ͽ�����q��r���W��/�� ������������ɽ�������炖,��P���'��ゖ ������������ɽѽ���������Ѓ��炖/��_���q��r���܀�����Ѓ�P��ɽ�ɕ�́ɕ٥�܁���ͽ�����q��r�Aɽ�Ʌ����[�����7������炖/��������W�����������������ѕ�������ե�������ɕ�q�q����q�q�9P����ѽȃ��?��T�٥ͥЃ���������
�İ����Ȱ��Â�˂����������炖 ��P���S������ׂ�,���Â�/��s���������������炖������रता।\nयहाँ 14 दिन रोज़ personal attention — सिर्फ़ ₹1,299 एक बार। 🌿\n\nकौनसा option सही लगता है?`;
  }

  return `Aapke *${tname}* ke liye ek personalized 14-din program hai. 🌿\n\n2 options hain:\n\n🌱 *Rs.499 — Starter Kit*\nAapke sinus type ka self-guided protocol WhatsApp pe. Khud karo, hum guide karte hain.\n\n---\n\n🌿 *Rs.1,299 — 14-Din Nasal Restoration Program*\n⭐ _(Sabse zyada liya jaata hai)_\n\n*Exactly yeh milega aapko:*\n✅ Day 1 — Aapki poori history, triggers personally samjhunga (WhatsApp pe)\n✅ Aapke sinus type ki custom routine — subah 20 min + raat 15 min\n✅ 14 din roz mera WhatsApp check-in — "aaj kaisa raha?" personally\n✅ Koi din problem ho — usi din protocol adjust hoga\n✅ Day 7 + Day 14 — progress review personally\n✅ Program ke baad maintenance guidance free\n\n---\n\nENT doctor ek visit mein Rs.1,000-2,000 leta hai — aur woh roz check nahi karta.\nYahan 14 din roz personal attention — sirf Rs.1,299 ek baar. 🌿\n\nKaunsa option sahi lagta hai?`;
}

// ─── SALESOM (Claude AI) ──────────────────────────────────────
async function callSalesom(userMessage, userData) {
  try {
    const sinusLabels = {
      allergic:   "Vataja-Kaphaja (Allergic)",
      congestive: "Kaphaja (Congestive)",
      spray:      "Aushadha Asakti (Spray Dependency)",
      infective:  "Pittaja (Infective/Heat)",
      polyp:      "Polyp/Blockage",
    };

    const contextBlock = `
[CONVERSATION CONTEXT]
- Sinus type: ${sinusLabels[userData.sinusType] || "Unknown"}
- Duration: ${userData.duration || "Not specified"}
- Symptoms described: ${userData.symptoms || "Not specified"}
- Post-pitch reply #: ${userData.postPitchReplies || 0} of 2
- User script: ${userData.script === "dev" ? "Devanagari — MUST reply in Devanagari" : "Roman Hindi / English"}
- Platform: Facebook Messenger
[END CONTEXT]

SCRIPT RULE: ${userData.script === "dev" ? "User writes in Devanagari. YOUR REPLY MUST BE IN DEVANAGARI SCRIPT ONLY." : "Mirror user language — Roman Hindi or English."}
REMINDER: No payment links. No diagnostic restart. Short, mobile-friendly reply. End with soft close or question.`;

    const history = (userData.history || []).slice(-8);

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 350,
      system: SALESOM_SYSTEM_PROMPT + "\n\n" + contextBlock,
      messages: [...history, { role: "user", content: userMessage }],
    });

    const reply = response.content[0].text;

    userData.history = [
      ...history,
      { role: "user", content: userMessage },
      { role: "assistant", content: reply },
    ];

    return reply;
  } catch (err) {
    console.error("Salesom AI error:", err.message);
    return userData.script === "dev"
      ? `समझ गया 🙏 कोई भी सवाल हो — main यहाँ hun। जब ready हो तो बताओ।`
      : `Samajh gaya 🙏 Koi bhi sawaal ho — main yahan hun. Jab ready ho toh batao.`;
  }
}

// ─── GOOGLE SHEET LOGGING ─────────────────────────────────────
async function logToSheet(senderId, name, message, stage, sinusType = "") {
  try {
    const params = new URLSearchParams({
      platform: "Messenger",
      senderId,
      name: name || "Unknown",
      message: message.substring(0, 200),
      status: "🟡",
      stage,
      symptom: sinusType,
    });
    await fetch(`${GAS_URL}?${params.toString()}`, { method: "GET" });
  } catch (e) {
    console.error("Sheet log error:", e.message);
  }
}

// ─── MAIN MESSAGE HANDLER ──────────────────────────────────────
async function handleMessage(senderId, messageText, senderName) {
  const text = messageText.trim();
  const textLower = text.toLowerCase();

  if (!userState[senderId]) {
    userState[senderId] = { state: "new", history: [], script: "rom" };
  }
  const userData = userState[senderId];

  // Update script if user writes in Devanagari — mirror immediately
  if (detectScript(text) === "dev") userData.script = "dev";
  const sc = userData.script || "rom";

  // ── HUMAN TAKEOVER CHECK ─────────────────────────────────────
  if (userData.state === "human") return;

  // ── REACTIVATION COMMAND (admin) ─────────────────────────────
  if (text.startsWith("BOT_ON_")) {
    const targetId = text.replace("BOT_ON_", "").trim();
    if (userState[targetId]) {
      userState[targetId].state = "pitched";
      await sendMessage(senderId, `✅ Bot reactivated for ${targetId}`);
    }
    return;
  }

  // ── PAYMENT CONFIRMATION (any state) ─────────────────────────
  if (/payment|paid|pay kar|pay kiya|bhej diya|transfer|\u092d\u0941\u0917\u0924\u093e\u0928|\u092a\u0947\u092e\u0947\u0902\u091f/.test(textLower)) {
    userData.state = "done";
    const msg = sc === "dev"
      ? `✅ Payment confirm हो गया! 🌿\n\nMain aapko personally WhatsApp पर connect करूँगा — 85951 60713\n\nWahan se protocol शुरू करेंगे। Welcome to Ayusomam! 🌿`
      : `✅ Payment confirm ho gaya! 🌿\n\nMain tumse personally WhatsApp pe connect karunga — 85951 60713\n\nWahan se protocol shuru karenge. Welcome to Ayusomam! 🌿`;
    await sendWithTyping(senderId, msg);
    await logToSheet(senderId, senderName, "Payment confirmed", "PAID", userData.sinusType);
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // STATE MACHINE — One message per turn, wait for response
  // Each state sends ONE message (or 2 where logically inseparable)
  // then stops and waits for user to reply
  // ═══════════════════════════════════════════════════════════

  // STATE: NEW → Send hook only, then wait
  if (userData.state === "new") {
    const idx = Math.floor(Math.random() * HOOKS_ROM.length);
    const hook = sc === "dev" ? HOOKS_DEV[idx] : HOOKS_ROM[idx];
    userData.state = "hook_sent";
    await sendWithTyping(senderId, hook);
    await logToSheet(senderId, senderName, "Hook sent", "HOOK", "");
    return;
  }

  // STATE: HOOK_SENT → User responded to hook → Ask duration, then wait
  if (userData.state === "hook_sent") {
    const dq = getDurationQuestion(sc);
    userData.state = "asked_duration";
    await sendQRWithTyping(senderId, dq.text, dq.replies);
    return;
  }

  // STATE: ASKED_DURATION → Store duration, empathy ack + ask symptoms, then wait
  // (2 messages here: empathy validates them, then question — feels natural)
  if (userData.state === "asked_duration") {
    userData.duration = text;
    userData.state = "asked_symptoms";

    await sendWithTyping(senderId, getDurationAck(text, sc));

    // Brief pause between empathy and symptoms question
    await new Promise((r) => setTimeout(r, 800));

    const sq = getSymptomsQuestion(sc);
    await sendQRWithTyping(senderId, sq.text, sq.replies);

    await logToSheet(senderId, senderName, "Duration: " + text, "DURATION", "");
    return;
  }

  // STATE: ASKED_SYMPTOMS → Detect type, send reveal only, then wait for response
  if (userData.state === "asked_symptoms") {
    userData.symptoms = text;
    const sinusType = detectSinusType(text);
    userData.sinusType = sinusType;
    userData.state = "revealed";
    userData.postPitchReplies = 0;
    userData.history = [];

    // Brief "analysing" message to set expectation
    const analysing = sc === "dev" ? `देख रहे हैं... 🌿` : `Dekh rahe hain... 🌿`;
    await sendWithTyping(senderId, analysing);
    await new Promise((r) => setTimeout(r, 700));

    // Send reveal — user reads it, then responds
    await sendWithTyping(senderId, getRevealMessage(sinusType, sc));

    await logToSheet(senderId, senderName, `Symptoms: ${text}`, "REVEALED", sinusType);
    return;
  }

  // STATE: REVEALED → User responded to reveal → Send pitch, then wait
  if (userData.state === "revealed") {
    userData.state = "pitched";

    await sendWithTyping(senderId, getPitchMessage(userData.sinusType, sc));

    // Short pause then options
    await new Promise((r) => setTimeout(r, 700));
    const qr = sc === "dev"
      ? { text: `कौनसा option सही लगता है? 🌿`, replies: ["Full Program (₹1,299)", "Starter Kit (₹499)", "पहले सवाल है"] }
      : { text: `Kaunsa option sahi lagta hai? 🌿`, replies: ["Full Program (₹1,299)", "Starter Kit (₹499)", "Pehle sawaal hai"] };
    await sendQRWithTyping(senderId, qr.text, qr.replies);

    await logToSheet(senderId, senderName, `Pitched: ${userData.sinusType}`, "PITCHED", userData.sinusType);
    return;
  }

  // ── STATE: PITCHED → Claude / Payment ────────────────────────
  if (userData.state === "pitched") {

    // Auto handoff if exceeded 2 AI replies
    if (userData.postPitchReplies >= 2) {
      userData.state = "human";
      await logToSheet(senderId, senderName, `Auto handoff`, "HUMAN_TAKEOVER", userData.sinusType);
      return;
    }

    // YES DETECTION → Send payment links (only place they're sent)
    const userSaidYes = /haan|ha |yes|theek|ok\b|okay|shuru|karein|karna|chahta|chahti|le leta|le lungi|lena\b|interested|1299|499|full program|starter|bhejo|link bhejo|link do|send link|\u0939\u093e\u0902|\u0920\u0940\u0915|\u0932\u0947\u0928\u093e\u00a0|\u0932\u0947\u0928\u093a/.test(textLower);

    if (userSaidYes) {
      userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;
      const linkMsg = sc === "dev"
        ? `बहुत अच्छा! 🌿\n\nPayment links:\n\n🌱 *₹499 Starter:* ${PAYMENT_499}\n\n🌿 *₹1,299 Full Program:* ${PAYMENT_1299}\n\nPayment के बाद confirm करना — main personally WhatsApp पर connect करूँगा। 🌿`
        : `Bahut acha! 🌿\n\nPayment links:\n\n🌱 *Rs.499 Starter:* ${PAYMENT_499}\n\n🌿 *Rs.1,299 Full Program:* ${PAYMENT_1299}\n\nPayment ke baad confirm karna — main personally WhatsApp pe connect karunga. 🌿`;
      const confirmReplies = sc === "dev"
        ? ["Payment कर दिया ✅", "एक सवाल और"]
        : ["Payment kar diya ✅", "Ek sawaal aur"];
      await sendQRWithTyping(senderId, linkMsg, confirmReplies);
      await logToSheet(senderId, senderName, `Yes: ${text}`, "LINK_SENT", userData.sinusType);
      return;
    }

    // ALL OTHER → Claude AI (Salesom) handles
    userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;

    // Show typing while Claude thinks
    await sendTypingOn(senderId);
    await new Promise((r) => setTimeout(r, 900));

    const aiReply = await callSalesom(text, userData);
    await sendWithTyping(senderId, aiReply);

    if (userData.postPitchReplies < 2) {
      // Still have budget — show nudge buttons
      await new Promise((r) => setTimeout(r, 600));
      const nudgeReplies = sc === "dev"
        ? ["हाँ, शुरू करना है", "एक और सवाल है", "सोचना है थोड़ा"]
        : ["Haan, shuru karna hai", "Ek aur sawaal hai", "Sochna hai thoda"];
      await sendQRWithTyping(senderId, `🌿`, nudgeReplies);
    } else {
      // Last AI reply — hand off to Sachin
      await new Promise((r) => setTimeout(r, 800));
      const handoffMsg = sc === "dev"
        ? `आपका सवाल हमारे *Sinus Relief Specialist* तक पहुँचा दिया है। 🌿\n\nयहाँ wait करें — थोड़ी देर में reply आएगा।\n\nया सीधे WhatsApp करें: 📱 *85951 60713*`
        : `Tumhara sawaal hamare *Sinus Relief Specialist* tak pahuncha diya hai. 🌿\n\nYahan wait karo — thodi der mein reply aayega.\n\nYa seedha WhatsApp karo: 📱 *85951 60713*`;
      await sendWithTyping(senderId, handoffMsg);
      userData.state = "human";
      await logToSheet(senderId, senderName, `Handoff: ${text}`, "HUMAN_TAKEOVER", userData.sinusType);
    }

    await logToSheet(senderId, senderName, `AI: ${text}`, "AI_REPLY", userData.sinusType);
    return;
  }

  // STATE: DONE → Warm reply
  if (userData.state === "done") {
    const msg = sc === "dev"
      ? `Protocol चल रहा है! 🌿 कोई सवाल हो तो WhatsApp पर पूछो — 85951 60713`
      : `Protocol chal raha hai! 🌿 Koi sawaal ho toh WhatsApp pe poochho — 85951 60713`;
    await sendWithTyping(senderId, msg);
    return;
  }

  // FALLBACK — reset
  userData.state = "new";
  userData.history = [];
  await handleMessage(senderId, messageText, senderName);
}

// ─── HUMAN TAKEOVER — Page reply detection ─────────────────
async function handlePageMessage(senderId, sendingPageId) {
  if (sendingPageId && userState[senderId]) {
    userState[senderId].state = "human";
    console.log(`🔴 Human takeover activated for ${senderId}`);
  }
}

// ─── WEBHOOK ROUTES ───────────────────────────────────────────

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== "page") return;

    for (const entry of body.entry) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        if (!senderId) continue;

        // Skip old messages (prevents bulk replay on restart)
        const MSG_AGE_LIMIT_MS = 5 * 60 * 1000;
        if (event.timestamp && Date.now() - event.timestamp > MSG_AGE_LIMIT_MS) {
          console.log(`⏭️ Skipped old message (${Math.round((Date.now() - event.timestamp) / 1000)}s old) from ${senderId}`);
          continue;
        }

        // Deduplication
        if (event.message?.mid) {
          if (processedMessages.has(event.message.mid)) {
            console.log(`⏭️ Duplicate skipped: ${event.message.mid}`);
            continue;
          }
          processedMessages.add(event.message.mid);
        }

        // Page reply → human takeover
        if (event.sender?.id === entry.id) {
          await handlePageMessage(event.recipient?.id, event.sender?.id);
          continue;
        }

        if (event.message?.text) {
          await handleMessage(senderId, event.message.text, "User");
        }
      }
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

app.get("/", (req, res) => res.send("Ayusomam Bot v2.4 — Human-like + Devanagari 🌿"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌿 Ayusomam Bot v2.4 running on port ${PORT}`));
