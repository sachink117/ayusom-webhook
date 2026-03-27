"use strict";
const express=require("express"),crypto=require("crypto"),fetch=require("node-fetch"),Anthropic=require("@anthropic-ai/sdk"),path=require("path");
const firebase=require("./firebase"),notifications=require("./notifications");
const {persona,language,style,conversion}=require("./prompts/system");
const {terms}=require("./prompts/glossary");
const app=express(), claude=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY});
app.use(express.json());

// In-memory dedup for WA message IDs — prevents duplicate replies on webhook retries or batched events
const _seenMsgIds = new Map();
function _isDupMsg(id) {
  if (!id) return false;
  const now = Date.now();
  if (_seenMsgIds.has(id)) return true;
  _seenMsgIds.set(id, now);
  for (const [k, ts] of _seenMsgIds) if (now - ts > 300000) _seenMsgIds.delete(k);
  return false;
}

// QR code helper — generates scannable PNG from any URL via qrserver.com
function getQRUrl(link){ return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`; }
const QR_499  = ()=>getQRUrl(process.env.PAYMENT_499_LINK);
const QR_1299 = ()=>getQRUrl(process.env.PAYMENT_1299_LINK);

app.get("/health",(req,res)=>res.json({status:"ok",version:"2.3",time:new Date().toISOString()}));

app.get("/webhook",(req,res)=>{
  if(req.query["hub.mode"]==="subscribe"&&req.query["hub.verify_token"]===process.env.WEBHOOK_VERIFY_TOKEN)
    return res.send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

app.post("/webhook",async(req,res)=>{
  res.sendStatus(200);
  try {
    const body=req.body;
    if(!body.object) return;
    for(const entry of body.entry||[]) {
      for(const msg of entry.messaging||[])
        if(msg.message&&!msg.message.is_echo) await handleIG(msg);
      for(const change of entry.changes||[])
        if(change.field==="messages") await handleWA(change.value);
    }
  } catch(e){ console.error("[Webhook]",e.message); }
});

async function handleIG(event) {
  const userId=event.sender.id, text=event.message?.text;
  if(!text) return;
  await processMessage({userId,text,source:"instagram",platform:"instagram"});
}

async function handleWA(value) {
  const contact=value.contacts?.[0]||{};
  for(const msg of value.messages||[]) {
    if(msg.type!=="text") continue;
    // Skip duplicate message IDs (webhook retries / batched re-delivery)
    if(_isDupMsg(msg.id)){ console.log("[WA] Duplicate skipped:",msg.id); continue; }
    if(msg.text.body && msg.text.body.trim()==='#repeat'){
      await firebase.clearHistory(msg.from);
      await sendWAReply(msg.from,'Starting fresh!\n\nMujhe batayein — aapko kitne time se sinus ki problem hai? Aur sabse zyada kya hota hai — naak band, sneezing, ya sar mein bhaari pan?');
      continue;
    }
    await processMessage({userId:msg.from,text:msg.text.body,source:"whatsapp",platform:"whatsapp",name:contact.profile?.name||""});
  }
}

async function processMessage({userId,text,source,platform,name=""}) {
  try {
    let lead=await firebase.getLead(userId);
    if(!lead){ await firebase.createLead(userId,{name,source,platform}); lead={id:userId,name,source,platform,status:"new"}; }
    await firebase.saveMessage(userId,"user",text);
    const history=await firebase.getHistory(userId,20);
    const reply=await getAIReply(lead,history);
    await firebase.saveMessage(userId,"assistant",reply);
    await firebase.updateLead(userId,{lastMessage:text,name:lead.name||name,followUpsSent:0});

    if(platform==="instagram") {
      await sendIGReply(userId,reply);
    } else if(platform==="whatsapp") {
      await sendWAReply(userId,reply);
      // Auto-send QR image when a payment link appears in the reply
      if(process.env.PAYMENT_499_LINK && reply.includes(process.env.PAYMENT_499_LINK)) {
        await sendWAImage(userId, QR_499(), "💰 Scan karke pay karo – 7-Day Sinus Reset Plan (Rs.499)");
      } else if(process.env.PAYMENT_1299_LINK && reply.includes(process.env.PAYMENT_1299_LINK)) {
        await sendWAImage(userId, QR_1299(), "💰 Scan karke pay karo – 14-Day Deep Relief Plan (Rs.1299)");
      }
    }
  } catch(e){ console.error("[ProcessMessage]",e.message); }
}

async function getAIReply(lead,history) {
  const glossary=Object.entries(terms).map(([w,r])=>`- Never say "${w}" - say "${r}"`).join("\n");
  const system=`${persona}\n${language}\n${style}\n${conversion}\n\nGLOSSARY:\n${glossary}\n\nLEAD: Name=${lead.name||"Unknown"}, Source=${lead.source}, Status=${lead.status}\nPLANS: Basic Rs.499 = ${process.env.PAYMENT_499_LINK} | Complete Rs.1299 = ${process.env.PAYMENT_1299_LINK}`;
  // Sanitize history: Claude API requires first message to be 'user' role
  let msgs=(history||[]).map(m=>({role:m.role,content:m.content}));
  while(msgs.length>0 && msgs[0].role!=='user') msgs.shift();
  if(msgs.length===0) return "Namaste! Mujhe batayein aapko sinus ki problem hai? Kitne time se hai aur kya symptoms hain?";
  const response=await claude.messages.create({model:"claude-sonnet-4-6",max_tokens:220,system,messages:msgs});
  return response.content[0].text;
}

async function sendIGReply(userId,text) {
  try {
    const token=process.env.PAGE_ACCESS_TOKEN||process.env.INSTAGRAM_TOKEN;
    console.log("[IG] Sending reply to",userId,"token starts:",token?.substring(0,10));
    const r=await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${token}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient:{id:userId},message:{text}})});
    const data=await r.json();
    if(data.error) console.error("[IG Reply Error]",JSON.stringify(data.error));
    else console.log("[IG Reply OK]",userId,data.message_id||"sent");
  } catch(e){ console.error("[IG Reply Fail]",e.message); }
}

async function sendWAReply(phone,text) {
  try {
    const r=await fetch(`https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:"POST",headers:{Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:phone,type:"text",text:{body:text}})});
    const data=await r.json();
    if(data.error) console.error("[WA Reply Error]",JSON.stringify(data.error));
    else console.log("[WA Reply OK]",phone);
  } catch(e){ console.error("[WA Reply]",e.message); }
}

async function sendWAImage(phone,imageUrl,caption) {
  try {
    const r=await fetch(`https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:"POST",headers:{Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:phone,type:"image",image:{link:imageUrl,caption}})});
    const data=await r.json();
    if(data.error) console.error("[WA Image Error]",JSON.stringify(data.error));
  } catch(e){ console.error("[WA Image]",e.message); }
}

app.post("/payment/webhook",express.raw({type:"application/json"}),async(req,res)=>{
  try {
    const sig=req.headers["x-razorpay-signature"];
    const exp=crypto.createHmac("sha256",process.env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest("hex");
    if(sig!==exp) return res.status(400).json({error:"Invalid signature"});
    res.sendStatus(200);
    const event=JSON.parse(req.body);
    if(event.event!=="payment.captured") return;
    const p=event.payload.payment.entity;
    const amount=p.amount/100, plan=amount>=1299?"Complete (Rs.1299)":"Basic (Rs.499)";
    await firebase.savePayment({razorpayId:p.id,name:p.name,email:p.email,phone:p.contact,amount,plan,status:"captured"});
    await firebase.createMember({name:p.name,email:p.email,phone:p.contact,plan,amount,paymentId:p.id,userId:p.contact});
    await notifications.notifyPaymentReceived({name:p.name,phone:p.contact,email:p.email,amount,plan});
    console.log(`[Payment] Rs.${amount} from ${p.name}`);
  } catch(e){ console.error("[Payment]",e.message); }
});

app.post("/api/lead",async(req,res)=>{
  try {
    const{name,phone,email,problem,source="website"}=req.body;
    if(!phone) return res.status(400).json({error:"Phone required"});
    const uid=`web_${phone}`;
    if(!await firebase.getLead(uid)) await firebase.createLead(uid,{name,phone,email,problem,source});
    res.json({ok:true});
    if(problem) await processMessage({userId:uid,text:problem,source:"website",platform:"whatsapp",name});
  } catch(e){ console.error("[Lead API]",e.message); res.status(500).json({error:e.message}); }
});


// Fix "Invalid Date" in admin dashboard - convert Firestore Timestamps to ISO strings
function serializeTimestamps(obj) {
  if(!obj || typeof obj !== 'object') return obj;
  if(obj._seconds !== undefined) return new Date(obj._seconds * 1000).toISOString();
  if(obj.seconds !== undefined) return new Date(obj.seconds * 1000).toISOString();
  if(Array.isArray(obj)) return obj.map(serializeTimestamps);
  return Object.fromEntries(Object.entries(obj).map(([k,v]) => [k, serializeTimestamps(v)]));
}

function adminAuth(req,res,next){
  const key=req.query.key||req.headers["x-admin-key"];
  if(key!==process.env.ADMIN_PASSWORD) return res.status(401).send("<h2>Access denied. Add ?key=YOUR_PASSWORD to URL</h2>");
  next();
}
app.get("/admin",adminAuth,(req,res)=>res.sendFile(path.join(__dirname,"admin","dashboard.html")));
app.get("/admin/data",adminAuth,async(req,res)=>{
  const[leads,members,payments]=await Promise.all([firebase.getAllLeads(),firebase.getAllMembers(),firebase.getAllPayments()]);
  res.json(serializeTimestamps({leads,members,payments}));
});
app.get("/admin/lead/:uid/history",adminAuth,async(req,res)=>res.json(await firebase.getHistory(req.params.uid,100)));
app.use("/public",express.static(path.join(__dirname,"public")));



// ─────────────────────────────────────────────────
// AUTOMATED FOLLOW-UP SYSTEM
// Sends gentle follow-ups to leads who went quiet
// ─────────────────────────────────────────────────
const FOLLOW_UP_MSGS=[null,
  "Sab theek hai? Kal hum baat kar rahe the sinus ke baare mein. Koi sawaal ho toh main yahan hun.",
  "Ek observation share karna tha. Chronic sinus mein jo log early protocol shuru karte hain, unka recovery time bahut kam hota hai. Aapka case kitne time ka hai?",
  "Last baar poochh raha hun. Agar try karna hai toh 7-Day Reset se shuru kar sakte hain. Rs. 499. 7 din mein khud judge karein. Interested hain?"
];
function _tsMs(ts){if(!ts)return 0;if(typeof ts==='string')return new Date(ts).getTime();if(ts._seconds!==undefined)return ts._seconds*1000;if(ts.seconds!==undefined)return ts.seconds*1000;return 0;}
async function sendFollowUp(lead,num){
  try{
    const msg=FOLLOW_UP_MSGS[num]; if(!msg)return;
    const plat=lead.platform||lead.source;
    if(plat==='whatsapp')await sendWAReply(lead.id,msg);
    else if(plat==='instagram')await sendIGReply(lead.id,msg);
    else return;
    await firebase.saveMessage(lead.id,'assistant',msg);
    await firebase.updateLead(lead.id,{followUpsSent:(lead.followUpsSent||0)+1});
    console.log('[FollowUp '+num+'] Sent to',lead.id,'('+plat+')');
  }catch(e){console.error('[FollowUp Send]',e.message);}
}
async function checkFollowUps(){
  try{
    const leads=await firebase.getAllLeads();
    const now=Date.now(); let sent=0;
    for(const lead of leads){
      if(['member','paid','converted'].includes(lead.status))continue;
      const plat=lead.platform||lead.source;
      if(!plat||plat==='website')continue;
      const lastActive=_tsMs(lead.lastActiveAt); if(!lastActive)continue;
      const hrs=(now-lastActive)/(1000*60*60);
      const n=lead.followUpsSent||0;
      if(hrs>=72&&hrs<168&&n<3){await sendFollowUp(lead,3);sent++;}
      else if(hrs>=48&&hrs<72&&n<2){await sendFollowUp(lead,2);sent++;}
      else if(hrs>=24&&hrs<48&&n<1){await sendFollowUp(lead,1);sent++;}
    }
    if(sent>0)console.log('[FollowUps] Sent',sent,'follow-up(s)');
  }catch(e){console.error('[FollowUp Check]',e.message);}
}
setInterval(checkFollowUps,2*60*60*1000); // every 2 hours
setTimeout(checkFollowUps,3*60*1000);     // 3 min after boot

// Keep-alive: prevent Render from sleeping
setInterval(() => {
  fetch('https://bot.ayusomamherbals.com/health').catch(() => {});
}, 10 * 60 * 1000); // every 10 minutes
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`[Ayusomam v2.2] Running on port ${PORT}`));
