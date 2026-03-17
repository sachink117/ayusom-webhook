/**
 * Ayusomam Herbals — AI Video Generator using Google Veo 3.1 (Gemini API)
 *
 * Generates viral Hindi sinus treatment videos for Instagram Reels, YouTube Shorts, WhatsApp Status
 *
 * Usage:
 *   node video-scripts/generate-videos.js [video-type]
 *
 * Video types: hook, problem, rootcause, solution, testimonial, cta, full-reel
 *
 * Requires: GOOGLE_AI_API_KEY env variable (get from https://aistudio.google.com/apikey)
 * Plan: Google AI Pro ($19.99/mo) or use Gemini API pay-per-use
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const OUTPUT_DIR = path.join(__dirname, 'generated');

// === VIDEO PROMPT TEMPLATES (Hindi Sinus Content) ===

const VIDEO_PROMPTS = {

  // ─── REEL 1: Main Hook Video ───
  'hook-sinus-suffering': {
    title: 'Sinus 3+ Saal Se Hai?',
    prompt: `Close-up shot of an Indian woman in her 30s, holding her nose bridge in pain, eyes slightly closed, dim warm lighting, cinematic shallow depth of field. She opens her eyes and looks directly at camera with a knowing expression. Text overlay appears: "Sinus 3+ saal se hai?" in bold white Devanagari text. Dramatic tension music. 9:16 vertical format, 8 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 8,
    caption_hi: 'Sinus 3+ saal se hai? Yeh suno. 👇',
    hashtags: '#sinus #sinusrelief #ayurveda #sinustreatment #sinuskailaj'
  },

  // ─── REEL 2: Problem Agitation ───
  'problem-spray-tablet': {
    title: 'Spray Liya, Tablet Khayi, Phir Bhi Wapas?',
    prompt: `Montage of Indian home remedies for sinus: steam inhalation over a steel bowl, nasal spray bottle being used, medicine tablets on a plate, a person sneezing. Each shot transitions smoothly. Warm indoor Indian household setting. Melancholic but relatable mood. Slow motion sneeze at the end. 9:16 vertical, 10 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 10,
    caption_hi: 'Steam kiya. Spray liya. Tablet khayi. 2 hafte theek... phir wahi congestion wapas. 😤',
    hashtags: '#nasalspray #sinusproblems #congestion #headache #sneezing'
  },

  // ─── REEL 3: Root Cause Education ───
  'rootcause-6types': {
    title: '6 Types of Sinus — Kaunsa Aapko Hai?',
    prompt: `Clean educational infographic style animation on a soft green background (#E8F5E9). A circular diagram appears showing 6 types of sinus with Hindi labels: Vataja-Kaphaja, Kaphaja, Pittaja, Dushta, Sannipataja, Raktaja. Each type highlights with a gentle glow as the camera slowly zooms in. Minimalist Ayurvedic herb illustrations float around. Professional medical education aesthetic. 9:16 vertical, 12 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 12,
    caption_hi: 'Ayurveda mein 6 type ke sinus hote hain. Har ek ka treatment ALAG hai. Aapko kaunsa hai? Comment karo 👇',
    hashtags: '#ayurveda #sinustypes #healthtips #nasalcongestion #ayurvedicmedicine'
  },

  // ─── REEL 4: Solution Reveal ───
  'solution-ai-protocol': {
    title: 'AI Se Pata Karo Apna Sinus Type',
    prompt: `A smartphone screen showing a WhatsApp-like chat interface. Messages appear one by one: "Aapko kitne saal se sinus hai?" → "3+ saal" → "Kya nasal spray use karte hain?" → "Haan" → A green result card slides up: "Aapka Sinus Type: Dushta Pratishyaya". The phone is held by Indian hands, warm golden desk lamp lighting, cozy study room background. Satisfying reveal animation. 9:16 vertical, 10 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 10,
    caption_hi: 'AI se 2 minute mein apna sinus type pata karo — bilkul FREE 🌿\n\nWhatsApp pe SINUS bhejo: 8595160713',
    hashtags: '#sinustype #aidiagnosis #ayusomam #freetest #whatsapp'
  },

  // ─── REEL 5: Spray Dependency ───
  'spray-dependency': {
    title: 'Nasal Spray Chhodni Hai? Yeh Karo',
    prompt: `Dramatic shot: An Indian person reaches for a nasal spray bottle on a nightstand at 3 AM, dim blue moonlight. Then a hopeful transition — morning sunlight, the same person breathing freely outdoors in a garden with tulsi plants, smiling. Split screen or smooth morph transition between "before" (spray dependency, dark) and "after" (natural breathing, bright green). Emotional, cinematic. 9:16 vertical, 10 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 10,
    caption_hi: 'Spray ke bina naak nahi khulti? 😰\n\nDushta Pratishyaya — yeh sinus ka sabse mushkil type hai.\nLekin Ayurveda mein iska protocol hai.\n\n👉 Link in bio',
    hashtags: '#nasalspray #spraydependency #sinusrelief #breathefreely #ayurvedictreatment'
  },

  // ─── REEL 6: 7-Day Reset Teaser ───
  'seven-day-reset': {
    title: '7 Din Mein Sinus Reset — Kaise?',
    prompt: `A 7-day calendar animation in warm earth tones. Day 1: A person starts a routine (drinking herbal kadha). Day 3: Steam inhalation with Ayurvedic herbs. Day 5: Visibly less tissue usage, smiling. Day 7: Person breathing deeply outdoors, arms spread, sunrise behind them. Progress bar fills up. Text: "7-Day Sinus Reset" in green (#2E7D32). Motivational, uplifting music. 9:16 vertical, 12 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 12,
    caption_hi: '7 din. Ek structured protocol. Sinus type ke hisaab se.\n\nRs. 499 se shuru — results ya refund 💚\n\n👉 WhatsApp pe SINUS bhejo: 8595160713',
    hashtags: '#7daychallenge #sinusreset #ayurvedicprotocol #naturalhealing #sinuscure'
  },

  // ─── REEL 7: Common Mistakes ───
  'common-mistakes': {
    title: 'Sinus Mein Yeh Galti Mat Karna',
    prompt: `Red X marks appearing over common sinus mistakes shown as icons: ice cream, cold drinks, AC blast, self-medication tablets, ignoring morning sneezing. Then green checkmarks over correct practices: warm water, steam, proper diagnosis, type-specific herbs. Clean white background with green (#2E7D32) and red accents. Educational countdown style. 9:16 vertical, 10 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 10,
    caption_hi: '❌ Cold drinks\n❌ AC mein sona\n❌ Random spray\n❌ Ignore karna\n\n✅ Pehle type pata karo\n✅ Phir sahi treatment lo\n\n👉 FREE sinus type test: link in bio',
    hashtags: '#sinusmistakes #healthmistakes #sinustips #avoidthis #ayurvedictips'
  },

  // ─── REEL 8: Testimonial Style ───
  'testimonial-style': {
    title: '500+ Logon Ne Try Kiya',
    prompt: `A warm, authentic-feeling montage: Multiple Indian people of different ages (30s-50s) smiling at camera, giving thumbs up, breathing freely. Soft bokeh backgrounds — home balconies, gardens, offices. Counter animation: "100... 200... 300... 500+" overlaid in bold. Green confetti particle effect at "500+". Warm, emotional, community feeling. 9:16 vertical, 8 seconds.`,
    aspect_ratio: '9:16',
    duration_seconds: 8,
    caption_hi: '500+ logon ne apna sinus type jaana.\nResults 7 din mein dikhne lagte hain. 🌿\n\nAap bhi try karo — FREE assessment\n📱 WhatsApp: 8595160713',
    hashtags: '#sinusresults #testimonial #500plus #sinusrelief #ayusomamherbals'
  }
};

// === GOOGLE VEO 3.1 API INTEGRATION ===

async function generateVideo(promptKey) {
  if (!GOOGLE_AI_API_KEY) {
    console.error('\n❌ GOOGLE_AI_API_KEY not set!');
    console.log('\n📋 Setup steps:');
    console.log('   1. Go to https://aistudio.google.com/apikey');
    console.log('   2. Create an API key');
    console.log('   3. Subscribe to Google AI Pro ($19.99/mo) for Veo 3.1 access');
    console.log('   4. Set: export GOOGLE_AI_API_KEY=your-key-here');
    console.log('   5. Run again: node video-scripts/generate-videos.js ' + promptKey);

    // Still output the prompt for manual use in Flow UI
    console.log('\n─────────────────────────────────────');
    console.log('📝 Meanwhile, use this prompt in Flow UI (https://flow.google):');
    console.log('─────────────────────────────────────\n');
    const template = VIDEO_PROMPTS[promptKey];
    if (template) {
      console.log(`🎬 ${template.title}\n`);
      console.log(template.prompt);
      console.log(`\n📱 Caption:\n${template.caption_hi}`);
      console.log(`\n🏷️  ${template.hashtags}`);
    }
    return;
  }

  const template = VIDEO_PROMPTS[promptKey];
  if (!template) {
    console.error(`❌ Unknown video type: ${promptKey}`);
    console.log('Available types:', Object.keys(VIDEO_PROMPTS).join(', '));
    return;
  }

  console.log(`\n🎬 Generating: ${template.title}`);
  console.log(`⏱️  Duration: ${template.duration_seconds}s | Aspect: ${template.aspect_ratio}`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    // Step 1: Submit video generation request
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${GOOGLE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{
            prompt: template.prompt
          }],
          parameters: {
            aspectRatio: template.aspect_ratio,
            durationSeconds: template.duration_seconds,
            sampleCount: 2, // Generate 2 variations to pick best
            includeAudio: true
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      // Try Gemini API format as fallback
      return await generateVideoGemini(promptKey, template);
    }

    const result = await response.json();
    console.log('✅ Generation submitted! Operation:', result.name || 'pending');
    console.log('⏳ Video generation takes 2-5 minutes...');

    // Step 2: Poll for completion
    if (result.name) {
      await pollForCompletion(result.name, promptKey, template);
    }

  } catch (err) {
    console.log(`\n⚠️  API call failed: ${err.message}`);
    console.log('Trying Gemini API format...\n');
    await generateVideoGemini(promptKey, template);
  }
}

// Gemini API format (alternative endpoint)
async function generateVideoGemini(promptKey, template) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:generateVideos?key=${GOOGLE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generateVideoConfig: {
            model: 'veo-2.0-generate-001',
            prompt: { text: template.prompt },
            config: {
              aspectRatio: template.aspect_ratio,
              numberOfVideos: 2
            }
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Gemini API also failed:', errText);
      printManualInstructions(promptKey, template);
      return;
    }

    const result = await response.json();
    console.log('✅ Gemini generation submitted!');

    if (result.name) {
      await pollForCompletion(result.name, promptKey, template);
    } else if (result.generatedVideos) {
      await saveVideos(result.generatedVideos, promptKey, template);
    }

  } catch (err) {
    console.error('❌ Gemini API error:', err.message);
    printManualInstructions(promptKey, template);
  }
}

async function pollForCompletion(operationName, promptKey, template) {
  const maxAttempts = 60; // 5 minutes max

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000)); // Poll every 5 seconds

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GOOGLE_AI_API_KEY}`
      );
      const op = await res.json();

      if (op.done) {
        if (op.response && op.response.generatedVideos) {
          await saveVideos(op.response.generatedVideos, promptKey, template);
        } else if (op.error) {
          console.error('❌ Generation failed:', op.error.message);
          printManualInstructions(promptKey, template);
        }
        return;
      }

      process.stdout.write(`\r⏳ Generating... ${(i + 1) * 5}s elapsed`);
    } catch (err) {
      // Network error during poll, continue trying
    }
  }

  console.log('\n⏱️ Timeout — check Google AI Studio for results');
}

async function saveVideos(videos, promptKey, template) {
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const filename = `${promptKey}_v${i + 1}.mp4`;
    const filepath = path.join(OUTPUT_DIR, filename);

    if (video.video && video.video.uri) {
      // Download the video
      const videoRes = await fetch(video.video.uri);
      const buffer = await videoRes.buffer();
      fs.writeFileSync(filepath, buffer);
      console.log(`\n✅ Saved: ${filepath}`);
    } else if (video.video && video.video.bytesBase64Encoded) {
      const buffer = Buffer.from(video.video.bytesBase64Encoded, 'base64');
      fs.writeFileSync(filepath, buffer);
      console.log(`\n✅ Saved: ${filepath}`);
    }
  }

  // Save caption and metadata
  const metaPath = path.join(OUTPUT_DIR, `${promptKey}_caption.txt`);
  fs.writeFileSync(metaPath,
    `${template.title}\n\n${template.caption_hi}\n\n${template.hashtags}\n\nWhatsApp CTA: https://wa.me/918595160713?text=SINUS\nLanding Page: https://bot.ayusomamherbals.com/sinus`
  );
  console.log(`📝 Caption saved: ${metaPath}`);
}

function printManualInstructions(promptKey, template) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📋 MANUAL FLOW UI INSTRUCTIONS');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`🎬 Video: ${template.title}`);
  console.log(`📐 Format: ${template.aspect_ratio} (${template.duration_seconds}s)\n`);
  console.log('Step 1: Go to https://flow.google');
  console.log('Step 2: Click "Create Video"');
  console.log('Step 3: Paste this prompt:\n');
  console.log('─── PROMPT START ───');
  console.log(template.prompt);
  console.log('─── PROMPT END ───\n');
  console.log('Step 4: Set aspect ratio to 9:16 (vertical/portrait)');
  console.log('Step 5: Generate & download\n');
  console.log('📱 CAPTION (copy for Instagram/YouTube):');
  console.log('───');
  console.log(template.caption_hi);
  console.log(template.hashtags);
  console.log('───\n');
}

// === BATCH GENERATION ===

async function generateAll() {
  console.log('🎬 AYUSOMAM HERBALS — Batch Video Generation');
  console.log('═══════════════════════════════════════════════\n');

  const keys = Object.keys(VIDEO_PROMPTS);
  console.log(`📦 ${keys.length} videos to generate:\n`);

  keys.forEach((key, i) => {
    console.log(`  ${i + 1}. ${VIDEO_PROMPTS[key].title} (${VIDEO_PROMPTS[key].duration_seconds}s)`);
  });

  console.log('');

  for (const key of keys) {
    await generateVideo(key);
    console.log('\n───────────────────────────────\n');
  }

  console.log('✅ All done! Check video-scripts/generated/ for outputs');
}

// === LIST ALL PROMPTS (for manual Flow UI use) ===

function listPrompts() {
  console.log('\n🎬 AYUSOMAM HERBALS — Video Content Library');
  console.log('═══════════════════════════════════════════════\n');
  console.log('Use these prompts in Google Flow (https://flow.google)\n');

  Object.entries(VIDEO_PROMPTS).forEach(([key, template], i) => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📹 REEL ${i + 1}: ${template.title}`);
    console.log(`   Key: ${key}`);
    console.log(`   Duration: ${template.duration_seconds}s | Format: ${template.aspect_ratio}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`\n🎯 FLOW PROMPT:\n${template.prompt}`);
    console.log(`\n📱 CAPTION:\n${template.caption_hi}`);
    console.log(`\n🏷️  ${template.hashtags}`);
  });

  console.log(`\n${'═'.repeat(60)}`);
  console.log('\n📌 POSTING SCHEDULE (Recommended):');
  console.log('   Mon: hook-sinus-suffering');
  console.log('   Tue: problem-spray-tablet');
  console.log('   Wed: rootcause-6types');
  console.log('   Thu: solution-ai-protocol');
  console.log('   Fri: spray-dependency');
  console.log('   Sat: seven-day-reset');
  console.log('   Sun: testimonial-style');
  console.log('   Mon: common-mistakes');
  console.log('\n🔁 Then repeat with variation prompts!\n');
}

// === CLI ENTRY POINT ===

const arg = process.argv[2];

if (!arg || arg === 'help') {
  console.log(`
🎬 Ayusomam Video Generator — Powered by Google Veo 3.1

Usage:
  node video-scripts/generate-videos.js <command>

Commands:
  list                    Show all prompts (for manual Flow UI use)
  all                     Generate all videos via API
  <video-key>             Generate specific video
  help                    Show this help

Video Keys:
${Object.entries(VIDEO_PROMPTS).map(([k, v]) => `  ${k.padEnd(28)} ${v.title}`).join('\n')}

Setup:
  export GOOGLE_AI_API_KEY=your-key-here

  Get key: https://aistudio.google.com/apikey
  Flow UI: https://flow.google (manual use, no API key needed)
  `);
} else if (arg === 'list') {
  listPrompts();
} else if (arg === 'all') {
  generateAll();
} else if (VIDEO_PROMPTS[arg]) {
  generateVideo(arg);
} else {
  console.error(`❌ Unknown command: ${arg}`);
  console.log('Run with "help" to see available options');
}
