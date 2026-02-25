const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

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
    console.log('Webhook verified');
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
          if (msg.message && msg.message.text) {
            const senderId = msg.sender.id;
            const text = msg.message.text;
            console.log(`FACEBOOK LEAD - ID: ${senderId} - Message: ${text}`);
            await saveToSheet({
              timestamp: new Date().toISOString(),
              platform: 'Facebook',
              senderId: senderId,
              name: 'FB_' + senderId,
              message: text
            });
            await sendMessage(senderId,
              `Namaste! 🙏 Ayusom Herbals mein aapka swagat hai.\n\nAapki sinus problem kitne samay se hai?\n\n1️⃣ 6 mahine se kam\n2️⃣ 6 mahine - 2 saal\n3️⃣ 2 saal se zyada\n\nBas number reply karein.`
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
