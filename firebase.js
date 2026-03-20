const admin = require("firebase-admin");
let db;
function init() {
  if (admin.apps.length) return;
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    db = admin.firestore();
    console.log("[Firebase] Connected");
  } catch(e) { console.error("[Firebase]", e.message); }
}
init();
const ts = () => admin.firestore.FieldValue.serverTimestamp();
const inc = (n) => admin.firestore.FieldValue.increment(n);

async function getLead(id) { const d = await db.collection("leads").doc(id).get(); return d.exists ? {id:d.id,...d.data()} : null; }
async function createLead(id, data) { await db.collection("leads").doc(id).set({...data, status:"new", createdAt:ts(), lastActiveAt:ts()}); }
async function updateLead(id, data) { await db.collection("leads").doc(id).update({...data, lastActiveAt:ts()}); }
async function getHistory(id, limit=20) { const s = await db.collection("leads").doc(id).collection("messages").orderBy("timestamp","desc").limit(limit).get(); return s.docs.reverse().map(d=>d.data()); }
async function saveMessage(id, role, content) { await db.collection("leads").doc(id).collection("messages").add({role,content,timestamp:ts()}); }
async function createMember(data) { const r = await db.collection("members").add({...data,currentDay:1,status:"active",startDate:ts(),createdAt:ts()}); return r.id; }
async function getMemberByUserId(uid) { const s = await db.collection("members").where("userId","==",uid).where("status","==","active").limit(1).get(); if(s.empty) return null; const d=s.docs[0]; return {id:d.id,...d.data()}; }
async function updateMemberDay(id) { await db.collection("members").doc(id).update({currentDay:inc(1),lastUpdated:ts()}); }
async function logProgress(id, data) { const today=new Date().toISOString().split("T")[0]; await db.collection("members").doc(id).collection("progress").doc(today).set({...data,timestamp:ts()}); }
async function savePayment(data) { await db.collection("payments").add({...data,createdAt:ts()}); }
async function getAllLeads(limit=100) { const s = await db.collection("leads").orderBy("lastActiveAt","desc").limit(limit).get(); return s.docs.map(d=>({id:d.id,...d.data()})); }
async function getAllMembers() { const s = await db.collection("members").where("status","==","active").get(); return s.docs.map(d=>({id:d.id,...d.data()})); }
async function getAllPayments() { const s = await db.collection("payments").orderBy("createdAt","desc").limit(100).get(); return s.docs.map(d=>({id:d.id,...d.data()})); }

async function clearHistory(userId) {
  const snapshot = await db.collection("leads").doc(userId).collection("messages").get();
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  await db.collection("leads").doc(userId).update({ status: "new", lastActiveAt: ts() });
}

module.exports = { getLead, createLead, updateLead, getHistory, saveMessage, clearHistory, createMember, getMemberByUserId, updateMemberDay, logProgress, savePayment, getAllLeads, getAllMembers, getAllPayments };
