#!/usr/bin/env node
// ============================================================
// AYUSOM CLI — AI Marketing Command Center
// Tracks leads, conversions, followers, and generates AI content
// Usage: node ayusom-cli.js <command> [options]
// ============================================================

const Anthropic = require("@anthropic-ai/sdk");

// ── Firebase setup ──────────────────────────────────────────
let db = null;
try {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
    if (sa.project_id) {
      admin.initializeApp({ credential: admin.credential.cert(sa) });
      db = admin.firestore();
    }
  } else {
    db = admin.firestore();
  }
} catch (e) {
  // Firebase not available — some commands will be limited
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Colors (no deps) ────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bg: {
    green: "\x1b[42m",
    yellow: "\x1b[43m",
    red: "\x1b[41m",
    cyan: "\x1b[46m",
  },
};

function banner() {
  console.log(`
${c.cyan}${c.bold}  AYUSOM CLI${c.reset} ${c.dim}— AI Marketing Command Center${c.reset}
${c.dim}  Ayusomam Herbals | Sinus Wellness Program${c.reset}
${"─".repeat(50)}
`);
}

// ── COMMAND: dashboard ──────────────────────────────────────
async function cmdDashboard() {
  banner();
  if (!db) {
    console.log(`${c.red}Firebase not configured. Set FIREBASE_SERVICE_ACCOUNT env var.${c.reset}`);
    return;
  }

  const snap = await db.collection("users").get();
  const users = [];
  snap.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));

  const now = Date.now();
  const day = 86400000;

  // Funnel stages
  const total = users.length;
  const qualified = users.filter((u) => u.convPhase === "qualified" || u.selectedPlan).length;
  const enrolled = users.filter((u) => u.enrolledAt).length;
  const activeToday = users.filter((u) => u.lastMessageAt && now - u.lastMessageAt < day).length;
  const ghosted = users.filter(
    (u) => u.lastMessageAt && now - u.lastMessageAt > 2 * day && !u.enrolledAt
  ).length;

  // Platform breakdown
  const platforms = {};
  users.forEach((u) => {
    const p = u.platform || "unknown";
    platforms[p] = (platforms[p] || 0) + 1;
  });

  // Conversion rate
  const convRate = total > 0 ? ((enrolled / total) * 100).toFixed(1) : "0.0";

  console.log(`${c.bold}  LEAD DASHBOARD${c.reset}`);
  console.log(`${"─".repeat(50)}`);
  console.log(`  ${c.cyan}Total Leads:${c.reset}       ${total}`);
  console.log(`  ${c.green}Qualified:${c.reset}         ${qualified}`);
  console.log(`  ${c.green}${c.bold}Enrolled:${c.reset}          ${enrolled}`);
  console.log(`  ${c.yellow}Active Today:${c.reset}      ${activeToday}`);
  console.log(`  ${c.red}Ghosted (48h+):${c.reset}    ${ghosted}`);
  console.log();
  console.log(`  ${c.bold}Conversion Rate:${c.reset}   ${c.bold}${convRate}%${c.reset}`);
  console.log();

  console.log(`  ${c.bold}PLATFORM BREAKDOWN${c.reset}`);
  console.log(`  ${"─".repeat(30)}`);
  for (const [plat, count] of Object.entries(platforms).sort((a, b) => b[1] - a[1])) {
    const bar = "█".repeat(Math.ceil((count / total) * 20));
    const pct = ((count / total) * 100).toFixed(0);
    console.log(`  ${c.cyan}${plat.padEnd(12)}${c.reset} ${bar} ${count} (${pct}%)`);
  }
  console.log();

  // Funnel visualization
  console.log(`  ${c.bold}CONVERSION FUNNEL${c.reset}`);
  console.log(`  ${"─".repeat(30)}`);
  const stages = [
    { label: "Leads", count: total, color: c.cyan },
    { label: "Qualified", count: qualified, color: c.yellow },
    { label: "Enrolled", count: enrolled, color: c.green },
  ];
  const maxWidth = 30;
  stages.forEach((s) => {
    const w = total > 0 ? Math.max(1, Math.ceil((s.count / total) * maxWidth)) : 0;
    const bar = "█".repeat(w);
    console.log(`  ${s.color}${s.label.padEnd(12)}${c.reset} ${s.color}${bar}${c.reset} ${s.count}`);
  });
  console.log();
}

// ── COMMAND: leads ──────────────────────────────────────────
async function cmdLeads(filter) {
  banner();
  if (!db) {
    console.log(`${c.red}Firebase not configured.${c.reset}`);
    return;
  }

  const snap = await db.collection("users").get();
  const users = [];
  snap.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));

  const now = Date.now();
  const day = 86400000;

  let filtered = users;
  if (filter === "hot") {
    filtered = users.filter(
      (u) =>
        u.lastMessageAt &&
        now - u.lastMessageAt < day &&
        !u.enrolledAt &&
        (u.convPhase === "qualified" || u.awaitingCommitment)
    );
    console.log(`${c.bold}${c.red}  HOT LEADS — Ready to convert${c.reset}\n`);
  } else if (filter === "ghosted") {
    filtered = users.filter(
      (u) => u.lastMessageAt && now - u.lastMessageAt > 2 * day && !u.enrolledAt
    );
    console.log(`${c.bold}${c.yellow}  GHOSTED LEADS — Need re-engagement${c.reset}\n`);
  } else if (filter === "enrolled") {
    filtered = users.filter((u) => u.enrolledAt);
    console.log(`${c.bold}${c.green}  ENROLLED — Active customers${c.reset}\n`);
  } else {
    console.log(`${c.bold}  ALL LEADS${c.reset}\n`);
  }

  if (filtered.length === 0) {
    console.log(`  ${c.dim}No leads found for this filter.${c.reset}`);
    return;
  }

  filtered.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

  filtered.slice(0, 25).forEach((u) => {
    const name = u.name || u.id.slice(0, 12);
    const plat = (u.platform || "?").padEnd(6);
    const phase = (u.convPhase || "new").padEnd(12);
    const ago = u.lastMessageAt
      ? `${Math.floor((now - u.lastMessageAt) / 3600000)}h ago`
      : "never";
    const status = u.enrolledAt
      ? `${c.green}ENROLLED${c.reset}`
      : u.awaitingCommitment
        ? `${c.yellow}AWAITING${c.reset}`
        : `${c.dim}${phase}${c.reset}`;
    console.log(`  ${c.cyan}${name.padEnd(15)}${c.reset} ${plat} ${status}  ${c.dim}${ago}${c.reset}`);
  });

  if (filtered.length > 25) {
    console.log(`\n  ${c.dim}... and ${filtered.length - 25} more${c.reset}`);
  }
  console.log();
}

// ── COMMAND: content ────────────────────────────────────────
async function cmdContent(type) {
  banner();
  const contentTypes = {
    post: "Instagram post caption",
    story: "Instagram story text/CTA",
    reel: "Instagram reel script (hook + body + CTA)",
    dm: "cold DM template for sinus sufferers",
    bio: "Instagram bio optimized for conversions",
    hashtags: "30 high-reach hashtags for sinus/Ayurveda niche",
  };

  if (!type || !contentTypes[type]) {
    console.log(`${c.bold}  AI CONTENT GENERATOR${c.reset}`);
    console.log(`  ${"─".repeat(30)}`);
    console.log(`  Available types:`);
    Object.entries(contentTypes).forEach(([k, v]) => {
      console.log(`    ${c.cyan}${k.padEnd(10)}${c.reset} ${v}`);
    });
    console.log(`\n  Usage: ${c.bold}node ayusom-cli.js content <type>${c.reset}`);
    return;
  }

  console.log(`${c.bold}  Generating ${contentTypes[type]}...${c.reset}\n`);

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are the marketing expert for Ayusomam Herbals, an Ayurvedic sinus wellness brand from India.
The main product is a 14-day sinus treatment program (starting at Rs 499).
Target audience: Indians suffering from chronic sinus, allergies, nasal congestion.
The brand voice is: hopeful, knowledgeable, conversational, bilingual (Hindi/English mix).

Generate a ${contentTypes[type]} that will maximize engagement and lead generation.
For posts/reels: focus on pain points, quick wins, testimonials style.
For DMs: be warm, ask about their sinus problem, mention free consultation.
For bio/hashtags: optimize for discovery and conversion.

Output ONLY the content, no explanations. Make it ready to use.`,
      },
    ],
  });

  console.log(`${c.green}${"─".repeat(50)}${c.reset}`);
  console.log(msg.content[0].text);
  console.log(`${c.green}${"─".repeat(50)}${c.reset}\n`);
}

// ── COMMAND: followup ───────────────────────────────────────
async function cmdFollowup() {
  banner();
  if (!db) {
    console.log(`${c.red}Firebase not configured.${c.reset}`);
    return;
  }

  const snap = await db.collection("users").get();
  const users = [];
  snap.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));

  const now = Date.now();
  const hour = 3600000;

  // Categorize who needs follow-up
  const actions = [];

  users.forEach((u) => {
    if (u.enrolledAt) return; // Already converted
    const silentHours = u.lastMessageAt ? (now - u.lastMessageAt) / hour : Infinity;

    if (u.awaitingCommitment && silentHours > 4 && silentHours < 48) {
      actions.push({
        priority: "HIGH",
        user: u.name || u.id.slice(0, 12),
        platform: u.platform || "?",
        action: "Warm lead gone quiet. Send commitment nudge.",
        silentHours: Math.floor(silentHours),
      });
    } else if (u.convPhase === "qualified" && silentHours > 6 && silentHours < 72) {
      actions.push({
        priority: "MED",
        user: u.name || u.id.slice(0, 12),
        platform: u.platform || "?",
        action: "Qualified but not pitched. Share program details.",
        silentHours: Math.floor(silentHours),
      });
    } else if (silentHours > 48 && silentHours < 168 && u.convPhase !== "new") {
      actions.push({
        priority: "LOW",
        user: u.name || u.id.slice(0, 12),
        platform: u.platform || "?",
        action: "Ghosted. Send re-engagement message.",
        silentHours: Math.floor(silentHours),
      });
    }
  });

  actions.sort((a, b) => {
    const p = { HIGH: 0, MED: 1, LOW: 2 };
    return p[a.priority] - p[b.priority];
  });

  console.log(`${c.bold}  FOLLOW-UP ACTION LIST${c.reset}`);
  console.log(`  ${"─".repeat(46)}`);

  if (actions.length === 0) {
    console.log(`  ${c.green}All caught up! No follow-ups needed right now.${c.reset}`);
    return;
  }

  actions.forEach((a) => {
    const prioColor =
      a.priority === "HIGH" ? c.red : a.priority === "MED" ? c.yellow : c.dim;
    console.log(
      `  ${prioColor}${c.bold}[${a.priority}]${c.reset} ${c.cyan}${a.user.padEnd(15)}${c.reset} (${a.platform}) — silent ${a.silentHours}h`
    );
    console.log(`        ${c.dim}${a.action}${c.reset}`);
  });
  console.log(
    `\n  ${c.bold}Total actions: ${actions.length}${c.reset} (${actions.filter((a) => a.priority === "HIGH").length} high priority)\n`
  );
}

// ── COMMAND: ai-analyze ─────────────────────────────────────
async function cmdAnalyze() {
  banner();
  if (!db) {
    console.log(`${c.red}Firebase not configured.${c.reset}`);
    return;
  }

  const snap = await db.collection("users").get();
  const users = [];
  snap.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));

  const now = Date.now();
  const day = 86400000;

  // Build stats for AI analysis
  const stats = {
    totalLeads: users.length,
    enrolled: users.filter((u) => u.enrolledAt).length,
    qualified: users.filter((u) => u.convPhase === "qualified" || u.selectedPlan).length,
    ghosted: users.filter((u) => u.lastMessageAt && now - u.lastMessageAt > 2 * day && !u.enrolledAt).length,
    activeToday: users.filter((u) => u.lastMessageAt && now - u.lastMessageAt < day).length,
    platforms: {},
    sinusTypes: {},
    avgResponseTimeH: 0,
    languageBreakdown: {},
    topDropoffPhase: {},
  };

  users.forEach((u) => {
    const p = u.platform || "unknown";
    stats.platforms[p] = (stats.platforms[p] || 0) + 1;
    if (u.sinusType) stats.sinusTypes[u.sinusType] = (stats.sinusTypes[u.sinusType] || 0) + 1;
    if (u.lang) stats.languageBreakdown[u.lang] = (stats.languageBreakdown[u.lang] || 0) + 1;
    if (!u.enrolledAt && u.convPhase) {
      stats.topDropoffPhase[u.convPhase] = (stats.topDropoffPhase[u.convPhase] || 0) + 1;
    }
  });

  console.log(`${c.bold}  AI ANALYSIS — Processing your data...${c.reset}\n`);

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a growth marketing analyst for Ayusomam Herbals (Ayurvedic sinus treatment, India).
Analyze this data and give actionable insights to increase conversions, leads, and followers.

DATA:
${JSON.stringify(stats, null, 2)}

Give exactly 5 numbered insights with specific actions. Be direct, no fluff.
Focus on: conversion optimization, lead recovery, content strategy, follower growth tactics.
End with ONE bold prediction about what will 2x their results.`,
      },
    ],
  });

  console.log(msg.content[0].text);
  console.log();
}

// ── COMMAND: growth ─────────────────────────────────────────
async function cmdGrowth() {
  banner();
  console.log(`${c.bold}  FOLLOWER GROWTH PLAYBOOK${c.reset}`);
  console.log(`  ${"─".repeat(40)}\n`);

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a social media growth expert for Ayusomam Herbals, an Ayurvedic sinus wellness brand on Instagram.
Current situation: They have an AI chatbot that auto-replies to DMs, a 14-day sinus program (Rs 499-1299).
They need more followers and engagement to feed their lead pipeline.

Create a practical weekly growth plan with SPECIFIC daily actions.
Include: content calendar outline (7 days), engagement tactics, collaboration ideas, hashtag strategy, reel hooks.
Make it actionable — someone should be able to execute this TODAY.
Format with clear sections and bullet points.`,
      },
    ],
  });

  console.log(msg.content[0].text);
  console.log();
}

// ── COMMAND: help ────────────────────────────────────────────
function cmdHelp() {
  banner();
  console.log(`${c.bold}  COMMANDS${c.reset}`);
  console.log(`  ${"─".repeat(40)}`);
  const cmds = [
    ["dashboard", "Lead funnel overview with conversion metrics"],
    ["leads [filter]", "List leads (filters: hot, ghosted, enrolled)"],
    ["followup", "AI-prioritized follow-up action list"],
    ["content <type>", "AI content generator (post/story/reel/dm/bio/hashtags)"],
    ["analyze", "AI analysis of your funnel with growth insights"],
    ["growth", "AI-generated weekly follower growth playbook"],
    ["help", "Show this help message"],
  ];
  cmds.forEach(([cmd, desc]) => {
    console.log(`  ${c.cyan}${cmd.padEnd(18)}${c.reset} ${desc}`);
  });
  console.log(`\n${c.dim}  Examples:${c.reset}`);
  console.log(`    ${c.dim}node ayusom-cli.js dashboard${c.reset}`);
  console.log(`    ${c.dim}node ayusom-cli.js leads hot${c.reset}`);
  console.log(`    ${c.dim}node ayusom-cli.js content reel${c.reset}`);
  console.log(`    ${c.dim}node ayusom-cli.js analyze${c.reset}\n`);
}

// ── MAIN ────────────────────────────────────────────────────
async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  try {
    switch (cmd) {
      case "dashboard":
      case "dash":
        await cmdDashboard();
        break;
      case "leads":
        await cmdLeads(args[0]);
        break;
      case "followup":
      case "follow":
        await cmdFollowup();
        break;
      case "content":
        await cmdContent(args[0]);
        break;
      case "analyze":
      case "analysis":
        await cmdAnalyze();
        break;
      case "growth":
        await cmdGrowth();
        break;
      default:
        cmdHelp();
    }
  } catch (err) {
    console.error(`\n${c.red}Error: ${err.message}${c.reset}`);
    if (err.message.includes("API") || err.message.includes("key")) {
      console.error(`${c.dim}Make sure ANTHROPIC_API_KEY is set.${c.reset}`);
    }
    process.exit(1);
  }
}

main();
