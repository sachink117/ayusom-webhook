const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;
const PAGE_ID = '1035532399636645';

const userState = {};
const userProfile = {};

async function saveToSheet(data) {
  try {
    const response = await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      redirect: 'follow'
    });
    const text = await response.text();
    console.log('Sheet saved:', response.status, text.substring(0, 100));
  } catch(err) {
    console.error('Sheet error:', err.message);
  }
}

async function sendMessage(senderId, text) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: text }
        })
      }
    );
    console.log('Message sent, status:', response.status);
  } catch(err) {
    console.error('Send error:', err.message);
  }
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === 'ayusom2026') {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.entry) {
    for (const entry of body.entry) {
      if (entry.messaging) {
        for (const msg of entry.messaging) {
          if (msg.sender.id === PAGE_ID) continue;
          if (!msg.message || !msg.message.text) continue;

          const senderId = msg.sender.id;
          const text = msg.message.text.trim();
          const state = userState[senderId] || 'new';
          const profile = userProfile[senderId] || {};

          console.log(`LEAD - ID: ${senderId} - State: ${state} - Message: ${text}`);

          await saveToSheet({
            timestamp: new Date().toISOString(),
            platform: 'Facebook',
            senderId: senderId,
            name: 'FB_' + senderId,
            message: text
          });

          if (state === 'new') {
            userState[senderId] = 'asked_duration';
            await sendMessage(senderId,
`🙏 Namaste! Welcome to Ayusom Herbals.

We specialize in Ayurvedic treatment for chronic sinus — naturally, without dependency on sprays or steroids.

To prepare your personalized assessment, please answer a few quick questions.

✦ How long have you been suffering from sinus?
✦ Aapko sinus ki problem kitne samay se hai?

1️⃣ Less than 6 months / 6 mahine se kam
2️⃣ 6 months – 2 years / 6 mahine se 2 saal
3️⃣ More than 2 years / 2 saal se zyada`
            );

          } else if (state === 'asked_duration') {
            if (!['1','2','3'].includes(text)) {
              await sendMessage(senderId, `Please reply with 1, 2 or 3. / Kripya 1, 2 ya 3 reply karein. 🙏`);
            } else {
              const duration = text === '1' ? 'less than 6 months' : text === '2' ? '6 months to 2 years' : 'more than 2 years';
              userProfile[senderId] = { ...profile, duration };
              userState[senderId] = 'asked_symptoms';
              await sendMessage(senderId,
`Noted. / Samajh gaya. ✅

✦ What are your main symptoms?
✦ Mukhya symptoms kya hain?

1️⃣ Blocked nose / Naak band rehna
2️⃣ Headache & facial pressure / Sar dard aur bhaari chehra
3️⃣ Dependent on Otrivin / nasal spray
4️⃣ Post nasal drip / Gale mein balgam
5️⃣ Sleep disruption / Raat ko neend nahi

Reply with number.`
              );
            }

          } else if (state === 'asked_symptoms') {
            const symptomMap = {
              '1': 'Blocked nose',
              '2': 'Headache & facial pressure',
              '3': 'Otrivin/spray dependency',
              '4': 'Post nasal drip',
              '5': 'Sleep disruption'
            };
            const symptom = symptomMap[text] || text;
            userProfile[senderId] = { ...profile, symptom };
            userState[senderId] = 'asked_tried';
            await sendMessage(senderId,
`Noted. ✅

✦ Have you tried any treatment before?
✦ Pehle koi treatment try ki hai?

1️⃣ Only nasal sprays / Sirf nasal spray
2️⃣ Allopathy medicines / Doctor ki dawai
3️⃣ Home remedies / Ghar ke nuskhe
4️⃣ Nothing yet / Abhi kuch nahi kiya
5️⃣ Other Ayurvedic treatment`
            );

          } else if (state === 'asked_tried') {
            const treatmentMap = {
              '1': 'nasal sprays only',
              '2': 'allopathy',
              '3': 'home remedies',
              '4': 'nothing yet',
              '5': 'other Ayurvedic'
            };
            const tried = treatmentMap[text] || text;
            userProfile[senderId] = { ...profile, tried };
            userState[senderId] = 'asked_severity';
            await sendMessage(senderId,
`Understood. / Samajh gaya. ✅

✦ How severely does sinus affect your daily life?
✦ Sinus aapki daily life ko kitna affect karta hai?

1️⃣ Mild — occasional discomfort
2️⃣ Moderate — affects work/sleep sometimes
3️⃣ Severe — affects daily routine regularly
4️⃣ Very severe — difficult to function normally`
            );

          } else if (state === 'asked_severity') {
            const severityMap = {
              '1': 'Mild', '2': 'Moderate', '3': 'Severe', '4': 'Very Severe'
            };
            const severity = severityMap[text] || 'Moderate';
            userProfile[senderId] = { ...profile, severity };
            userState[senderId] = 'pitched';

            const p = userProfile[senderId];

            await sendMessage(senderId,
`📋 Assessment Complete ✅

Based on your responses:
- Duration: ${p.duration}
- Primary symptom: ${p.symptom}
- Previous treatment: ${p.tried}
- Severity: ${p.severity}

─────────────────────
🌿 OUR CLINICAL FINDING
─────────────────────
Your condition indicates *Prana Vaha Srotas* blockage with accumulated Ama (toxins) in the respiratory tract — a well-documented Ayurvedic diagnosis for chronic sinus conditions.

The standard allopathic approach (sprays, antihistamines) suppresses symptoms without resolving root cause. This is why most patients remain dependent for years.

Ayusom's protocol addresses the root — not just the symptoms.

─────────────────────
🌿 AYUSOM 14-DAY SINUS PROGRAM
─────────────────────
✅ Personalized diet plan for your sinus type
✅ Nasya therapy (Ayurvedic nasal cleansing)
✅ Herbal Kadha protocol
✅ Steam therapy routine
✅ 14 days direct WhatsApp guidance

*Verified Result:*
Shikha Tyagi (similar profile) — Day 14: nasal passage 90% clear, Otrivin completely stopped. ✅

─────────────────────
Investment: ₹1,299
─────────────────────

Would you like to begin your program?
Kya aap apna program shuru karna chahte hain?

Reply YES to proceed. 🙏`
            );

          } else if (state === 'pitched') {
            if (['yes','haan','han','ha','y'].includes(text.toLowerCase())) {
              userState[senderId] = 'payment';
              await sendMessage(senderId,
`🙏 Wonderful!

Your 14-day personalized Ayurvedic Sinus Program is confirmed.

💳 Program Fee: ₹1,299

Please share:
1️⃣ Your WhatsApp number
2️⃣ Your city / Aapka shahar

We will send payment details and your personalized plan on WhatsApp within a few minutes. 🌿`
              );
            } else if (
              text.toLowerCase().includes('price') ||
              text.toLowerCase().includes('cost') ||
              text.toLowerCase().includes('kitna') ||
              text.toLowerCase().includes('fees')
            ) {
              await sendMessage(senderId,
`The complete 14-day program is ₹1,299 only.

This includes:
✅ Personalized plan for your specific sinus type
✅ 14 days WhatsApp guidance
✅ Full diet + Nasya + Kadha + Steam protocol
✅ Daily morning & evening support

For lasting natural relief — this is the most effective and affordable solution available.

Reply YES to begin. 🙏`
              );
            } else {
              await sendMessage(senderId,
`For any questions, please feel free to ask. 🙏
Koi bhi sawaal poochh sakte hain.

Kya aap program shuru karna chahte hain? Reply YES.`
              );
            }

          } else if (state === 'payment') {
            userState[senderId] = 'done';
            await sendMessage(senderId,
`Thank you! 🙏

Our Ayurvedic specialist will contact you on WhatsApp shortly with payment details and your personalized 14-day plan.

Aapka healing journey jald shuru hoga. 🌿
Ayusom Herbals`
            );

          } else if (state === 'done') {
            await sendMessage(senderId,
`For further assistance, please WhatsApp us directly. Our specialist will help you. 🙏
Ayusom Herbals`
            );
          }
        }
      }
    }
  }
  res.status(200).send('EVENT_RECEIVED');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ayusom webhook running on port ${PORT}`));
