const express = require('express');
const fetch = require('node-fetch');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// ─── ENV VARIABLES ────────────────────────────────────────────
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const PAGE_ID = '1035532399636645';
const INSTAGRAM_ID = '17841445309536661';
const PAYMENT_LINK = 'https://rzp.io/rzp/qu8zhQT';
const WHATSAPP_NUMBER = '+91 85951 60713';
const WEBSITE = 'www.ayusomamherbals.com';
const SHEET_NAME = 'Leads';

// ─── GOOGLE SHEETS ────────────────────────────────────────────
const auth = new google.auth.JWT(
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });

// ─── IN-MEMORY STATE ─────────────────────────────────────────
const userState = {};
const userProfile = {};
const rowCache = {};

// ─── SHEETS: SAVE NEW LEAD ───────────────────────────────────
async function saveToSheet(senderId, platform, text, stage, status, symptom, sinusType, profile) {
  try {
    console.log('Saving to sheet:', senderId);
    const res = await sheets.spreadsheets.values.append({
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
          status || 'New Lead',
          stage || 'new',
          new Date().toISOString(),
          symptom || '',
          '',
          sinusType || '',
          JSON.stringify(profile || {})
        ]]
      }
    });
    const updatedRange = res.data.updates?.updatedRange || '';
    const match = updatedRange.match(/(\d+)$/);
    if (match) rowCache[senderId] = parseInt(match[1]);
    console.log('Sheet save SUCCESS:', senderId, 'row:', rowCache[senderId]);
  } catch (err) {
    console.error('SHEET SAVE ERROR:', err.message);
  }
}

// ─── SHEETS: UPDATE LEAD ─────────────────────────────────────
async function updateSheetLead(senderId, stage, status, symptom, sinusType, profile) {
  try {
    let rowIndex = rowCache[senderId];
    if (!rowIndex) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${SHEET_NAME}!A:C`,
      });
      const rows = res.data.values || [];
      for (let i = rows.length - 1; i >= 1; i--) {
        if (rows[i][2] === senderId) { rowIndex = i + 1; break; }
      }
      if (rowIndex) rowCache[senderId] = rowIndex;
    }
    if (!rowIndex) {
      console.log('Row not found for update:', senderId);
      return;
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!F${rowIndex}:L${rowIndex}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          status || 'New Lead',
          stage || 'new',
          new Date().toISOString(),
          symptom || '',
          '',
          sinusType || '',
          JSON.stringify(profile || {})
        ]]
      }
    });
    console.log('Sheet update SUCCESS:', senderId, stage, 'row:', rowIndex);
  } catch (err) {
    console.error('SHEET UPDATE ERROR:', err.message);
  }
}

// ─── SEND MESSAGES ────────────────────────────────────────────
async function sendFBMessage(senderId, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: senderId }, message: { text } })
      }
    );
    console.log('FB sent:', res.status);
  } catch (err) {
    console.error('FB send error:', err.message);
  }
}

async function sendIGMessage(senderId, text) {
  try {
    const res = await fetch(
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
    console.log('IG sent:', res.status);
  } catch (err) {
    console.error('IG send error:', err.message);
  }
}

// ─── SYMPTOM RESPONSE MESSAGES ───────────────────────────────
function getSymptomResponseMessage(symptom) {
  if (symptom === 'allergic') {
    return `Samajh gaya. ✅\n\nYeh dust, pollution ya season change se trigger hoti hai — body bahar ki cheez pe overreact karti hai.\nGeneric approach se fark nahi padta — aapke specific pattern ke hisaab se guidance chahiye.`;
  }
  if (symptom === 'congestive') {
    return `Samajh gaya. ✅\n\nNaak band, chehra bhaari — nasal passage mein chronic sujan hoti hai.\nSteam aur saline sirf upar se kaam karte hain — isliye baar baar wahi problem hoti hai.`;
  }
  if (symptom === 'heat') {
    return `Samajh gaya. ✅\n\nAndar se burning, thick mucus — isko cooling aur soothing approach chahiye.\nGeneric decongestant se yeh address nahi hota.`;
  }
  if (symptom === 'dependency') {
    return `Samajh gaya. ✅\n\nSpray ke bina mushkil hoti hai — yeh ek common pattern hai jo naturally reset kiya ja sakta hai.\nStep by step, properly karna padta hai.`;
  }
  return `Samajh gaya. ✅`;
}

// ─── TRIED RESPONSE MESSAGES ─────────────────────────────────
function getTriedResponseMessage(tried) {
  if (tried === 'sirf nasal spray') {
    return `Samajh gaya. ✅\n\nNasal spray waqti rahat deta hai — par baar baar use karne se ek cycle ban jaati hai.\nIsliye spray band karte ho toh aur takleef hoti hai — yeh cycle todna zaroori hai.`;
  }
  if (tried === 'allopathy medicines') {
    return `Samajh gaya. ✅\n\nAllopathy se symptoms temporarily kam hote hain — par cycle continue rehti hai.\nIsliye kuch din baad wahi problem wapas aati hai.`;
  }
  if (tried === 'ghar ke nuskhe') {
    return `Samajh gaya. ✅\n\nGhar ke nuskhe thodi rahat dete hain — par bina structured approach ke consistent results nahi milte.\nEk systematic daily routine chahiye jo ek direction mein kaam kare.`;
  }
  if (tried === 'kuch nahi') {
    return `Samajh gaya. ✅\n\nAbhi tak kuch nahi kiya — isliye problem time ke saath aur uncomfortable hoti ja rahi hai.\nAbhi sahi waqt hai sahi direction mein kaam karne ka.`;
  }
  if (tried === 'other Ayurvedic') {
    return `Samajh gaya. ✅\n\nAyurvedic direction sahi hai — par generic aur personalized mein bahut fark hota hai.\nAapke specific sinus type ke hisaab se tailored routine chahiye.`;
  }
  return `Samajh gaya. ✅`;
}

// ─── PITCH MESSAGE ────────────────────────────────────────────
function getPitchMessage(sinusType, p) {
  const header = `📋 Aapka Sinus Assessment Complete ✅\n\nAapki details:\n• Problem duration: ${p.duration}\n• Main symptom: ${p.symptom}\n• Previous approach: ${p.tried}\n• Severity: ${p.severity}\n\n`;

  const specialist = `Yeh koi app nahi. Koi generic PDF nahi.\n\nAapko milega ek dedicated Sinus Relief Specialist —\n14 din tak, directly aapke WhatsApp pe.\n\nKabhi bhi kuch feel ho — message karein.\nSpecialist personally respond karega aur\naapki daily routine usi waqt adjust karega.\n`;

  const footer = `\n━━━━━━━━━━━━━━━━━━━━\n⭐ CLIENT EXPERIENCE\n━━━━━━━━━━━━━━━━━━━━\n\nShikha ji — 5 saal se nasal spray use kar rahi thin.\nAyusomam 14-day program ke baad spray ki zaroorat naturally kam ho gayi.\n\n"Pehli baar itne saalon baad khulke saans li." ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299\n━━━━━━━━━━━━━━━━━━━━\n\nKya aap apna personalized routine shuru karna chahte hain?\nReply karein YES 🙏\n\nAur details ke liye "MORE" type karein.\n\n🌐 ${WEBSITE}`;

  const types = {
    allergic: `━━━━━━━━━━━━━━━━━━━━\n🌿 AAPKA SINUS TYPE: ALLERGIC PATTERN\n━━━━━━━━━━━━━━━━━━━━\n\nDust, pollution ya season change se trigger hota hai.\nPersonalized routine is pattern ko address karti hai.\n\n${specialist}\nDin 3 tak — discomfort mein fark.\nDin 7 tak — breathing comfortable.\nDin 14 tak — pattern mein significant change. 🌿`,
    congestive: `━━━━━━━━━━━━━━━━━━━━\n🔴 AAPKA SINUS TYPE: CONGESTIVE PATTERN\n━━━━━━━━━━━━━━━━━━━━\n\nSubah uthte hi naak band. Chehra bhaari.\nPersonalized routine andar se kaam karti hai.\n\n${specialist}\nDin 3 tak — pressure mein fark.\nDin 7 tak — subah breathing better.\nDin 14 tak — significant improvement. 🌿`,
    heat: `━━━━━━━━━━━━━━━━━━━━\n🔥 AAPKA SINUS TYPE: HEAT PATTERN\n━━━━━━━━━━━━━━━━━━━━\n\nAndar se burning, thick mucus.\nCooling aur soothing routine chahiye.\n\n${specialist}\nDin 3 tak — burning mein fark.\nDin 7 tak — discomfort reduce.\nDin 14 tak — significant improvement. 🌿`,
    dependency: `━━━━━━━━━━━━━━━━━━━━\n⚠️ AAPKA SINUS TYPE: DEPENDENCY PATTERN\n━━━━━━━━━━━━━━━━━━━━\n\nSpray ke bina mushkil — yeh ek common pattern hai.\nNatural reset step by step hota hai.\n\n${specialist}\nDin 3 tak — natural breathing mein fark.\nDin 7 tak — spray ki zaroorat kam.\nDin 14 tak — significant improvement. 🌿`,
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
  const state = userState[senderId] || 'new';
  const profile = userProfile[senderId] || {};
  const t = text.toLowerCase().trim();

  console.log(`[${platform}] ID: ${senderId} | State: ${state} | Msg: ${text}`);

  // Human takeover
  if (state === 'human_takeover') {
    if (text.startsWith('BOT_ON_')) {
      const targetId = text.replace('BOT_ON_', '').trim();
      userState[targetId] = 'new';
      delete userProfile[targetId];
      delete rowCache[targetId];
      console.log(`BOT REACTIVATED for ${targetId}`);
    }
    return;
  }

  // Restart trigger — any state
 if (['restart', 'dobara', 'reset', 'fir se', 'start again'].some(k => t.includes(k))) {
    userState[senderId] = 'asked_duration';
    delete userProfile[senderId];
    delete rowCache[senderId];
    saveToSheet(senderId, platform, 'restart', 'asked_duration', '🔴 Cold', '', '', {});
    await sendFn(senderId,
`🙏 Namaste! Ayusomam Herbals mein aapka swagat hai.

Hum sinus discomfort ke liye personalized Ayurvedic wellness guidance dete hain — naturally, bina spray ya steroid dependency ke.

🌐 ${WEBSITE}

Aapke liye best guidance ke liye kuch quick questions —

✦ Aapko sinus ki takleef kitne samay se hai?

1️⃣ 6 mahine se kam
2️⃣ 6 mahine se 2 saal
3️⃣ 2 saal se zyada

Number ya text mein reply karein.`
    );
    return;
  }

  // Contact request
  const contactKeywords = ['whatsapp', 'contact', 'call', 'phone', 'helpline', 'direct', 'number'];
  if (contactKeywords.some(k => t.includes(k))) {
    await sendFn(senderId,
`Bilkul! Seedha hamare Sinus Relief Specialist se baat karein. 🙏

📱 WhatsApp: ${WHATSAPP_NUMBER}
🌐 Website: ${WEBSITE}

Ayusomam Herbals 🌿`
    );
    return;
  }

  // NEW LEAD
  if (state === 'new') {
    userState[senderId] = 'asked_duration';
    saveToSheet(senderId, platform, text, 'asked_duration', '🔴 Cold', '', '', {});
    await sendFn(senderId,
`🙏 Namaste! Ayusomam Herbals mein aapka swagat hai.

Hum sinus discomfort ke liye personalized Ayurvedic wellness guidance dete hain — naturally, bina spray ya steroid dependency ke.

🌐 ${WEBSITE}

Aapke liye best guidance ke liye kuch quick questions —

✦ Aapko sinus ki takleef kitne samay se hai?

1️⃣ 6 mahine se kam
2️⃣ 6 mahine se 2 saal
3️⃣ 2 saal se zyada

Number ya text mein reply karein.`
    );
    return;
  }

  // ASKED DURATION
  if (state === 'asked_duration') {
    const duration = detectDuration(text);
    if (!duration) {
      await sendFn(senderId, `Thoda aur clearly batayein — kitne mahine ya saal se hai?\n\n1️⃣ 6 mahine se kam\n2️⃣ 6 mahine se 2 saal\n3️⃣ 2 saal se zyada`);
      return;
    }
    const durationLabel = duration === 'short' ? '6 mahine se kam' : duration === 'medium' ? '6 mahine se 2 saal' : '2 saal se zyada';
    userProfile[senderId] = { ...profile, duration: durationLabel };
    userState[senderId] = 'asked_symptoms';
    updateSheetLead(senderId, 'asked_symptoms', '🔴 Cold', '', '', userProfile[senderId]);
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

  // ASKED SYMPTOMS
  if (state === 'asked_symptoms') {
    const symptom = detectSymptom(text);
    if (!symptom) {
      await sendFn(senderId, `Main symptom kya hai?\n\n1️⃣ Sneezing, watery — dust/season se\n2️⃣ Naak band, pressure\n3️⃣ Burning, thick mucus, headache\n4️⃣ Spray/Otrivin dependency\n5️⃣ Post nasal drip, neend problem`);
      return;
    }
    const symptomLabel = {
      allergic: 'Allergic — sneezing, watery, dust triggered',
      congestive: 'Congestive — naak band, pressure, heaviness',
      heat: 'Heat — burning, thick mucus, headache',
      dependency: 'Dependency — Otrivin/spray dependent'
    }[symptom];
    userProfile[senderId] = { ...profile, symptom: symptomLabel, sinusType: symptom };
    userState[senderId] = 'asked_tried';
    updateSheetLead(senderId, 'asked_tried', '🟡 Warm', symptomLabel, symptom, userProfile[senderId]);
    const symptomMsg = getSymptomResponseMessage(symptom);
    await sendFn(senderId, symptomMsg + `

✦ Pehle koi approach try ki hai?

1️⃣ Sirf nasal spray
2️⃣ Doctor ki allopathy dawai
3️⃣ Ghar ke nuskhe
4️⃣ Abhi kuch nahi kiya
5️⃣ Koi aur Ayurvedic approach

Number ya describe karein.`
    );
    return;
  }

  // ASKED TRIED
  if (state === 'asked_tried') {
    const tried = detectTried(text);
    if (!tried) {
      await sendFn(senderId, `Kya approach try ki thi?\n\n1️⃣ Sirf nasal spray\n2️⃣ Doctor ki dawai\n3️⃣ Ghar ke nuskhe\n4️⃣ Kuch nahi\n5️⃣ Ayurvedic approach`);
      return;
    }
    userProfile[senderId] = { ...profile, tried };
    userState[senderId] = 'asked_severity';
    updateSheetLead(senderId, 'asked_severity', '🟡 Warm', userProfile[senderId].symptom, userProfile[senderId].sinusType, userProfile[senderId]);
    const triedMsg = getTriedResponseMessage(tried);
    await sendFn(senderId, triedMsg + `

✦ Yeh takleef aapki daily life ko kitna affect karti hai?

1️⃣ Thodi — kabhi kabhi (Mild)
2️⃣ Kaafi — kaam aur neend affect (Moderate)
3️⃣ Bahut zyada — daily routine affect (Severe)
4️⃣ Extreme — normal kaam mushkil (Very Severe)

Number ya describe karein.`
    );
    return;
  }

  // ASKED SEVERITY → PITCH
  if (state === 'asked_severity') {
    const severity = detectSeverity(text);
    if (!severity) {
      await sendFn(senderId, `Kitna affect karti hai?\n\n1️⃣ Mild\n2️⃣ Moderate\n3️⃣ Severe\n4️⃣ Very Severe`);
      return;
    }
    userProfile[senderId] = { ...profile, severity };
    userState[senderId] = 'pitched';
    updateSheetLead(senderId, 'pitched', '🟡 Warm', userProfile[senderId].symptom, userProfile[senderId].sinusType, userProfile[senderId]);
    const severityMsg = severity === 'Severe' || severity === 'Very Severe'
      ? `Samajh gaya. ✅\n\nItne time se itni takleef — aur abhi tak koi consistent relief nahi mili.\nAbhi ek structured approach try karna sahi rahega.\n\n`
      : `Samajh gaya. ✅\n\nAbhi manageable hai — par consistent approach se aur comfortable ho sakta hai.\n\n`;
    await sendFn(senderId, severityMsg + getPitchMessage(userProfile[senderId].sinusType, userProfile[senderId]));
    return;
  }

  // PITCHED → Objection handling
  if (state === 'pitched' || state === 'following_up') {

    if (['yes', 'haan', 'han', 'ha', 'y', 'हाँ', 'हां'].includes(t)) {
      userState[senderId] = 'done';
      updateSheetLead(senderId, 'done', '🟢 Hot', userProfile[senderId]?.symptom, userProfile[senderId]?.sinusType, userProfile[senderId]);
      await sendFn(senderId,
`Bahut achha! 🙏

Aapka 14-day personalized wellness routine confirm karne ke liye:

💳 Payment Link: ${PAYMENT_LINK}
Amount: ₹1,299

Payment ke baad WhatsApp pe message karein — Sinus Relief Specialist khud aapko personally guide karenge.

📱 WhatsApp: ${WHATSAPP_NUMBER}
🌐 ${WEBSITE}

Thoda wait karein — specialist jald connect karenge. 🌿`
      );
      return;
    }

    if (t === 'more') {
      userState[senderId] = 'human_takeover';
      updateSheetLead(senderId, 'human_takeover', '🟢 Hot', userProfile[senderId]?.symptom, userProfile[senderId]?.sinusType, userProfile[senderId]);
      await sendFn(senderId,
`Bilkul! 🙏

Hamare Sinus Relief Specialist aapse seedha baat karenge.

Thoda wait karein — ya seedha WhatsApp pe message karein:
📱 ${WHATSAPP_NUMBER}

Ayusomam Herbals 🌿`
      );
      return;
    }

    // Objection handling — no AI, smart fallbacks
    userState[senderId] = 'following_up';
    updateSheetLead(senderId, 'following_up', '🟡 Warm', userProfile[senderId]?.symptom, userProfile[senderId]?.sinusType, userProfile[senderId]);

    if (t.match(/\b(price|kitna|cost|mahanga|1299|paise|paisa|costly|expensive|kam karo|discount)\b/)) {
      await sendFn(senderId,
`Samajh sakte hain. 🙏

₹1,299 mein milta hai:
✅ 14 din tak dedicated Sinus Relief Specialist
✅ Aapke specific pattern ke hisaab se daily routine
✅ Direct WhatsApp access — kabhi bhi message karo
✅ Roz ka feedback aur adjustment

Ek specialist ka itna personal attention — yeh value hai. 🌿

Shuru karne ke liye YES reply karein ya seedha WhatsApp karein:
📱 ${WHATSAPP_NUMBER}`
      );
      return;
    }

    if (t.match(/\b(guarantee|results|kaam karega|sach|proof|trust|bharosa|pakka)\b/)) {
      await sendFn(senderId,
`Bilkul valid sawaal hai. 🙏

Hum koi medical claim nahi karte — par hamare clients ki personal experience hai ki consistent Ayurvedic routine se unhe fark mila.

Shikha ji — 5 saal spray use karti thin — 14 din baad spray ki zaroorat naturally kam ho gayi.

Aap khud 14 din try karo — specialist personally guide karega. 🌿

Shuru karne ke liye YES reply karein.`
      );
      return;
    }

    if (t.match(/\b(sochna|think|baad mein|later|kal|time|abhi nahi)\b/)) {
      await sendFn(senderId,
`Bilkul, aaram se socho. 🙏

Jab bhi ready ho — hum yahan hain.

Koi bhi sawaal ho toh seedha poochh sakte ho ya WhatsApp pe message karo:
📱 ${WHATSAPP_NUMBER}

💳 Payment Link: ${PAYMENT_LINK}

Ayusomam Herbals 🌿`
      );
      return;
    }

    // Default fallback
    await sendFn(senderId,
`Koi bhi sawaal ho toh poochh sakte hain. 🙏

Seedha hamare Sinus Relief Specialist se baat karne ke liye:
📱 WhatsApp: ${WHATSAPP_NUMBER}

Ya shuru karne ke liye YES reply karein.
💳 ${PAYMENT_LINK}

🌐 ${WEBSITE}`
    );
    return;
  }

  // DONE STATE
  if (state === 'done') {
    await sendFn(senderId,
`Aapka program confirm ho gaya hai. 🙏

Payment ke baad WhatsApp pe message karein — Sinus Relief Specialist khud aapko personally guide karenge.

Thoda wait karein — ya seedha WhatsApp pe message karein:
📱 ${WHATSAPP_NUMBER}

🌐 ${WEBSITE}

Ayusomam Herbals 🌿`
    );
    return;
  }
}

// ─── LOAD STATE FROM SHEETS ON STARTUP ───────────────────────
async function loadStateFromSheets() {
  try {
    console.log('Loading state from sheets...');
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:L`,
    });
    const rows = res.data.values || [];
    const seen = {};
    for (let i = rows.length - 1; i >= 1; i--) {
      const r = rows[i];
      const senderId = r[2];
      if (!senderId || seen[senderId]) continue;
      seen[senderId] = true;
      const stage = r[6] || 'new';
      const profileJson = r[11] || '{}';
      userState[senderId] = stage;
      rowCache[senderId] = i + 1;
      try {
        userProfile[senderId] = JSON.parse(profileJson);
      } catch {
        userProfile[senderId] = {};
      }
    }
    console.log(`State loaded: ${Object.keys(seen).length} leads`);
  } catch (err) {
    console.error('loadStateFromSheets error:', err.message);
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
            userState[targetId] = 'new';
            delete userProfile[targetId];
            delete rowCache[targetId];
            console.log(`BOT REACTIVATED for ${targetId}`);
          } else {
            userState[recipientId] = 'human_takeover';
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
app.listen(PORT, async () => {
  console.log(`✅ Ayusomam webhook running on port ${PORT}`);
  await loadStateFromSheets();
});
