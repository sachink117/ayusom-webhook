// ============================================================
// AYUSOMAM WHATSAPP BOT — Twilio + Claude API
// Intelligent conversational sinus consultation via WhatsApp
// ============================================================

const Anthropic = require("@anthropic-ai/sdk");
const twilio = require("twilio");

// ─── CONFIG ────────────────────────────────────────────────
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER; // e.g. "whatsapp:+14155238886"
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const PAYMENT_1299 = "https://rzp.io/rzp/qu8zhQT";
const PAYMENT_499 = process.env.PAYMENT_499_LINK || "https://rzp.io/rzp/REPLACE_499";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwWjnJa2utTx0vQUkjdKtSaVpJBllL1-f-inxEfmxzutyF5GpGS2bChD5qVXkYPwqSbuA/exec";

// ─── VALIDATE CONFIG ────────────────────────────────────────
const missingVars = [];
if (!TWILIO_ACCOUNT_SID) missingVars.push("TWILIO_ACCOUNT_SID");
if (!TWILIO_AUTH_TOKEN) missingVars.push("TWILIO_AUTH_TOKEN");
if (!TWILIO_WHATSAPP_NUMBER) missingVars.push("TWILIO_WHATSAPP_NUMBER");
if (!ANTHROPIC_API_KEY) missingVars.push("ANTHROPIC_API_KEY");

if (missingVars.length > 0) {
  console.error(`⚠️ WhatsApp Bot: Missing env vars — ${missingVars.join(", ")}`);
}

// ─── CLIENTS ────────────────────────────────────────────────
let twilioClient = null;
let anthropic = null;

if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}
if (ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

// ─── CONVERSATION STORE ─────────────────────────────────────
// { phoneNumber: { messages: [{role, content}], lastActive, sinusType, stage } }
const conversations = {};

const CONV_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
setInterval(() => {
  const now = Date.now();
  for (const id of Object.keys(conversations)) {
    if (now - (conversations[id].lastActive || 0) > CONV_TTL_MS) {
      delete conversations[id];
    }
  }
}, 30 * 60 * 1000);

// ─── SYSTEM PROMPT ──────────────────────────────────────────
const SYSTEM_PROMPT = `Tu Ayusomam ka sinus relief consultant hai — tera naam Sachin hai. Tu WhatsApp pe sinus patients se baat karta hai. Tera goal hai unki sinus problem samajhna, sinus type detect karna, aur unhe Ayusom ke protocol mein enroll karna.

## Tera Personality:
- Warm, caring, empathetic — jaise ek bada bhai jo genuinely madad karna chahta hai
- Hindi-English mix (Hinglish) mein baat kar — jaise normal WhatsApp chat hoti hai
- Chhote messages bhej — 2-4 lines max ek baar mein. WhatsApp pe lamba text koi nahi padhta
- Emojis kam use kar — sirf 🌿 aur relevant ones

## Sinus Knowledge:
Sinus ke 5 types hain:
1. **Allergic Sinus** — dhool, dhuan, mausam se trigger hota hai. Chheenk, aankh khujlana, seasonal pattern
2. **Congestive Sinus** — naak band, sar bhaari, subah worst. Sabse common type
3. **Spray Dependency** — Otrivin/Nasivion pe depend. Spray chhodne se aur bura hota hai (rebound congestion)
4. **Infective Sinus** — peela/hara mucus, chehra dard, fever, antibiotic cycle
5. **Polyp/Blockage** — dono taraf naak band, smell/taste gayab, surgery suggest hui hogi

## Conversation Flow:
1. **Hook** — Pehle unki takleef acknowledge kar, empathy dikhaa
2. **Duration pucho** — "Kitne time se hai yeh problem?"
3. **Symptoms pucho** — "Kya kya hota hai — naak band, spray use, smell nahi aati?"
4. **Type detect kar** — Symptoms se sinus type identify kar
5. **Self-test bataa** — Ek simple ghar pe test bataa jo unka type confirm kare
6. **Pitch** — Protocol ke baare mein bataa
7. **Payment links share kar** — Jab ready hon tab

## Payment Options:
- 🌱 ₹499 Starter Kit — Self-guided protocol on WhatsApp
- 🌿 ₹1,299 — 14-Din Sinus Recovery Program (personal daily check-in by Sachin)
  - Day 1: personal consultation
  - Daily WhatsApp check-in for 14 days
  - Custom routine (subah + raat)
  - Day 7 + Day 14 progress review
  - Post-protocol maintenance guidance free

Payment links:
- ₹499: ${PAYMENT_499}
- ₹1,299: ${PAYMENT_1299}

## Objection Handling:
- **Mahanga hai**: Compare with ENT doctor cost (₹8,000-10,000/year), spray monthly ₹200-300
- **Free mein mil jaayega**: Generic info kaam nahi karti — personalized protocol zaroori hai
- **Proof chahiye**: 3,000+ clients, offer to connect with real client
- **Time nahi**: Sirf 15-20 min daily. Jitna late karoge utna mushkil hoga

## IMPORTANT RULES:
- KABHI bhi medical diagnosis mat de — tu doctor nahi hai. Tu sirf Ayusom ka sinus pattern identifier hai
- Payment links SIRF tab share kar jab user interested ho ya pitch ke baad
- Agar user bahut serious medical issue bataye (blood, surgery scheduled, etc.) — recommend real doctor visit
- Maximum 2-3 follow-ups after pitch. Uske baad: "Jab ready ho tab batana, main yahan hun 🌿"
- Agar user Hindi mein baat kare toh Hindi mein reply kar. English mein baat kare toh Hinglish mein reply kar
- NEVER break character — tu Sachin hai, Ayusom ka consultant`;

// ─── SEND WHATSAPP MESSAGE ──────────────────────────────────
async function sendWhatsApp(to, body) {
  if (!twilioClient) {
    console.error("❌ Twilio client not initialized — cannot send WhatsApp message");
    return;
  }
  try {
    await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: to, // format: "whatsapp:+91XXXXXXXXXX"
      body: body,
    });
  } catch (e) {
    console.error("❌ Twilio send error:", e.message);
  }
}

// ─── GET CLAUDE RESPONSE ────────────────────────────────────
async function getChatResponse(phoneNumber, userMessage) {
  if (!anthropic) {
    console.error("❌ Anthropic client not initialized");
    return "Abhi kuch technical issue hai — thodi der mein try karo. 🌿";
  }

  // Init conversation if new
  if (!conversations[phoneNumber]) {
    conversations[phoneNumber] = {
      messages: [],
      lastActive: Date.now(),
      stage: "new",
    };
  }

  const conv = conversations[phoneNumber];
  conv.lastActive = Date.now();

  // Add user message to history
  conv.messages.push({ role: "user", content: userMessage });

  // Keep last 30 messages to stay within context limits
  if (conv.messages.length > 30) {
    conv.messages = conv.messages.slice(-30);
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300, // Short WhatsApp-style messages
      system: SYSTEM_PROMPT,
      messages: conv.messages,
    });

    const assistantMessage = response.content[0].text;

    // Add assistant response to history
    conv.messages.push({ role: "assistant", content: assistantMessage });

    return assistantMessage;
  } catch (e) {
    console.error("❌ Claude API error:", e.message);
    return "Ek second — thodi der mein reply karta hun. 🌿";
  }
}

// ─── LOG TO GOOGLE SHEET ────────────────────────────────────
async function logToSheet(phone, message, stage) {
  try {
    const fetch = require("node-fetch");
    const params = new URLSearchParams({
      platform: "WhatsApp",
      senderId: phone,
      name: phone,
      message: message.substring(0, 200),
      status: "🟡",
      stage,
      symptom: "",
    });
    await fetch(`${GAS_URL}?${params.toString()}`, { method: "GET" });
  } catch (e) {
    console.error("Sheet log error:", e.message);
  }
}

// ─── SETUP ROUTES ───────────────────────────────────────────
function setupWhatsAppRoutes(app) {
  // Twilio WhatsApp webhook — receives incoming messages
  app.post("/whatsapp", async (req, res) => {
    // Respond immediately to Twilio
    res.status(200).send("<Response></Response>");

    try {
      const from = req.body.From; // "whatsapp:+91XXXXXXXXXX"
      const body = req.body.Body;

      if (!from || !body) return;

      console.log(`📱 WhatsApp from ${from}: ${body}`);

      // Log incoming message
      await logToSheet(from, body, "INCOMING");

      // Get Claude response
      const reply = await getChatResponse(from, body);

      // Send reply via Twilio
      await sendWhatsApp(from, reply);

      // Log outgoing
      await logToSheet(from, reply, "REPLIED");
    } catch (err) {
      console.error("WhatsApp webhook error:", err);
    }
  });

  // WhatsApp status callback (delivery receipts)
  app.post("/whatsapp/status", (req, res) => {
    res.sendStatus(200);
    // Can log delivery status if needed
  });

  // Health check for WhatsApp
  app.get("/whatsapp", (req, res) => {
    res.json({
      status: "running",
      twilio: !!twilioClient,
      claude: !!anthropic,
      activeConversations: Object.keys(conversations).length,
    });
  });

  console.log("📱 WhatsApp bot routes mounted (Twilio + Claude API)");
}

module.exports = { setupWhatsAppRoutes };
