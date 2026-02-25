app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.entry) {
    for (const entry of body.entry) {
      if (entry.messaging) {
        for (const msg of entry.messaging) {
          if (msg.message && msg.message.text) {
            const senderId = msg.sender.id;
            const text = msg.message.text.trim();
            console.log(`FACEBOOK LEAD - ID: ${senderId} - Message: ${text}`);

            await saveToSheet({
              timestamp: new Date().toISOString(),
              platform: 'Facebook',
              senderId: senderId,
              name: 'FB_' + senderId,
              message: text
            });

            // Check what they replied
            if (text === '1') {
              await sendMessage(senderId,
                `Aapki problem 6 mahine se kam hai — yeh achha hai, abhi sahi time hai treatment ka.\n\nMukhya problem kya hai?\n\n1️⃣ Naak band rehti hai\n2️⃣ Sar dard aur pressure\n3️⃣ Otrivin/spray pe depend ho gaya\n4️⃣ Raat ko neend nahi\n\nNumber reply karein.`
              );
            } else if (text === '2') {
              await sendMessage(senderId,
                `2 saal tak ki problem mein humara 14-day program bahut effective hai.\n\nMukhya problem kya hai?\n\n1️⃣ Naak band rehti hai\n2️⃣ Sar dard aur pressure\n3️⃣ Otrivin/spray pe depend ho gaya\n4️⃣ Raat ko neend nahi\n\nNumber reply karein.`
              );
            } else if (text === '3') {
              await sendMessage(senderId,
                `5+ saal ki chronic problem — hum samajhte hain kitna frustrating hai.\n\nMukhya problem kya hai?\n\n1️⃣ Naak band rehti hai\n2️⃣ Sar dard aur pressure\n3️⃣ Otrivin/spray pe depend ho gaya\n4️⃣ Raat ko neend nahi\n\nNumber reply karein.`
              );
            } else if (['1','2','3','4'].includes(text)) {
              await sendMessage(senderId,
                `Samajh gaye. Aapke liye personalized 14-day Ayurvedic sinus program ready kar sakte hain.\n\nEk client Shikha Tyagi ji ne yahi program kiya — 14 din mein naak clear, Otrivin band.\n\nProgram start karne ke liye sirf ₹1299. Kal se shuru kar sakte hain.\n\nKya aap ready hain? Reply karein YES.`
              );
            } else if (text.toLowerCase() === 'yes') {
              await sendMessage(senderId,
                `Bahut achha! 🙏\n\nPayment link bhej raha hoon — ₹1299 ka.\n\nPayment ke baad aapka personalized 14-day plan aur WhatsApp number milega jahan poora guidance milega.\n\nAbhi reply karein: CONFIRM`
              );
            } else {
              // First message — send welcome
              await sendMessage(senderId,
                `Namaste! 🙏 Ayusom Herbals mein aapka swagat hai.\n\nAapki sinus problem kitne samay se hai?\n\n1️⃣ 6 mahine se kam\n2️⃣ 6 mahine - 2 saal\n3️⃣ 2 saal se zyada\n\nBas number reply karein.`
              );
            }
          }
        }
      }
    }
  }
  res.status(200).send('EVENT_RECEIVED');
});
