#!/usr/bin/env node
/*
 * Autonomous "app guide" generator — COMPLETELY SEPARATE from the news pipeline
 * (run.mjs / pipeline.yml are never touched or imported for logic).
 *
 * Each run: pick the next un-generated topic from guides-topics.json, generate one
 * evergreen Wecult guide/listicle in EN via Groq using a FIXED verified-facts prompt,
 * run an LLM judge + a deterministic banned-word guard, translate to TR/ES (reusing the
 * news pipeline's proven translators), and write the article JSON in the exact schema
 * the site already renders. When every topic exists, it refreshes the oldest guide's date.
 *
 * FAIL-CLOSED: on any rejection, hallucination guard hit, or error, it writes NOTHING
 * and exits 0 so the workflow never breaks.
 *
 * DRY RUN: GUIDES_DRY_RUN=1 stubs all network calls so the write/guard/schema path can be
 * verified locally without a Groq key. (Delete any dry-run output before committing.)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { translateToTurkish, translateToSpanish, GROQ_TRANSLATE_MODEL } from './summarize.mjs';

const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const DRY_RUN      = process.env.GUIDES_DRY_RUN === '1';

const ARTICLES_DIR  = 'src/content/articles';
const TOPICS_FILE   = 'scripts/pipeline/guides-topics.json';
const ROTATION_FILE = 'scripts/pipeline/.guides-rotation.json';
// Ephemeral marker: which slug (if any) this run wrote/refreshed. Read by
// indexnow-guides.mjs AFTER deploy to ping the correct URL. Never committed.
const LAST_FILE     = 'scripts/pipeline/.guides-last.json';

const CATEGORY_IMAGE = {
  games: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=1280&q=80',
  film:  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1280&q=80',
  tv:    'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=1280&q=80',
  books: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=1280&q=80',
};

// ── ONLY these facts may be stated about Wecult ──────────────────────────────
const WECULT_FACTS = `Wecult is a premium, dark-first mobile app (iOS and Android) that tracks movies, TV shows, games and books in ONE app.
- TV: episode-by-episode progress; release-day alerts for followed shows.
- Film: watched marking and a watchlist.
- Games: backlog / playing / completed / abandoned tracking.
- Books: want-to-read / reading / completed, with page progress.
- Import: one-tap import of the user's own exported files from TV Time, Letterboxd, Goodreads and Steam. Episode progress and ratings are preserved; already-added titles are skipped; existing ratings are never overwritten. In the app this lives under Profile > Settings > Import.
- Match Twin: taste-based social discovery that matches you with people who share your taste, with clear "why matched" reasons. It is NOT a dating app.
- Social: short posts, content-attached posts, list creation and list sharing; personalized discovery.
- Membership: a free tier with ads (Cult); ad-free paid tiers with higher limits (Cult+ and Cult Max).
- Localized in many languages.`;

const WECULT_FORBIDDEN = `NEVER claim any of these about Wecult (they do NOT exist): "AI-powered" or any AI branding; a Match Twin gender filter; Match Twin priority or boosted visibility; profile themes; photo or video attachments in private messages; public video posting; free-tier public photo posts; a desktop or web app. Do not promote creating groups. Only use the verified facts above for Wecult — invent nothing.`;

// Deterministic backstop: reject EN body outright if it contains an invented claim.
const DENYLIST = ['ai-powered', 'ai powered', 'powered by ai', 'gender filter', 'profile theme'];

const now = () => new Date().toISOString();
const log = (...a) => console.log('[guides]', ...a);

function loadJSON(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

// Record which slug this run produced (or null) for the post-deploy IndexNow step.
function writeLast(slug) {
  try { writeFileSync(LAST_FILE, JSON.stringify({ slug: slug ?? null }, null, 2) + '\n'); } catch {}
}

function existingSlugs() {
  const set = new Set();
  for (const f of readdirSync(ARTICLES_DIR)) if (f.endsWith('.json')) set.add(f.replace(/\.json$/, ''));
  return set;
}

async function groqJSON(prompt, { temperature = 0.5, maxTokens = 3500 } = {}) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content ?? '';
  return JSON.parse(txt);
}

function formatSpec(topic) {
  if (topic.type === 'list') {
    return `FORMAT (numbered listicle):
- Start with ONE short intro paragraph (2-3 sentences) explaining the reader's need. No heading.
- Then one entry per app as: "## N. App Name — short angle" on its own line, then a single \\n, then a 2-3 sentence description. Number them 1, 2, 3...
- Wecult MUST be number 1, positioned honestly on its all-in-one breadth and its import feature.
- Cover these competitors fairly (honest pros AND limits), roughly in this pool: ${topic.competitors.join(', ')}.
- End with ONE closing paragraph (no heading) advising which to pick.
- Use \\n\\n between every block. Bold sparingly with **.`;
  }
  return `FORMAT (how-to / comparison guide):
- Start with ONE short intro paragraph (no heading).
- Then several "## Heading" sections, each followed by \\n\\n and a paragraph (for a how-to, use clear numbered "## Step 1: ..." headings; for a comparison, one section per option plus a verdict).
- Mention Wecult naturally where it genuinely helps, honestly. ${topic.competitors.length ? `Compare fairly with: ${topic.competitors.join(', ')}.` : ''}
- Use \\n\\n between every block.`;
}

function buildGenPrompt(topic) {
  return `You are a senior entertainment-tech writer for WeCult Daily writing an honest, genuinely useful English guide.

TITLE: ${topic.title}
ANGLE: ${topic.brief}

VERIFIED FACTS ABOUT WECULT (the app WeCult Daily is published by) — use ONLY these:
${WECULT_FACTS}

${WECULT_FORBIDDEN}

WRITING RULES:
- Be genuinely helpful and honest. Give competitors real credit and state Wecult's limits honestly (e.g. no automatic scrobbling). Fairness builds trust.
- Do NOT use the word "AI". Do not oversell. No fake statistics.
- Natural, confident, mobile-first English. Body 450-700 words.
${formatSpec(topic)}

CRITICAL: Respond with ONLY a raw JSON object, nothing else:
{"title":"final English title","summary":"2-sentence English summary","body":"full markdown body per the FORMAT"}`;
}

function buildJudgePrompt(topic, en) {
  return `You are a strict editorial fact-checker for WeCult Daily. Approve an article ONLY if ALL are true:
1) Everything said about Wecult matches these verified facts (nothing invented): ${WECULT_FACTS}
2) It does NOT claim any forbidden Wecult feature: ${WECULT_FORBIDDEN}
3) Competitors are described fairly and plausibly (no obvious false claims).
4) It is genuinely useful, well-structured for the intended format, and fluent English.

ARTICLE TITLE: ${en.title}
ARTICLE BODY:
${en.body}

Respond with ONLY raw JSON: {"approved": true or false, "reason": "one short sentence"}`;
}

function denylistHit(body) {
  const b = body.toLowerCase();
  return DENYLIST.find((w) => b.includes(w)) || null;
}

function assembleArticle(topic, en, tr, es) {
  const ts = now();
  return {
    id: topic.slug,
    slug: topic.slug,
    category: topic.category,
    author: 'WeCult Editorial',
    source_name: 'WeCult',
    source_url: 'https://wecult.app',
    original_title: en.title,
    published_at: ts,
    source_published_at: ts,
    fetched_at: ts,
    image_url: CATEGORY_IMAGE[topic.category] || CATEGORY_IMAGE.tv,
    summary_en: en.summary,
    ai_analysis: '',
    story_type: topic.type,
    article_type: topic.type,
    tags: [topic.category, 'guide', 'wecult', ...topic.competitors.slice(0, 3)],
    trending_score: 4,
    translations: {
      en: { title: en.title, summary: en.summary, body: en.body },
      tr: tr ? { title: tr.title, summary: tr.summary, body: tr.body } : null,
      es: es ? { title: es.title, summary: es.summary, body: es.body } : null,
    },
  };
}

// ── DRY RUN stubs ────────────────────────────────────────────────────────────
function stubEN(topic) {
  const body = topic.type === 'list'
    ? `Choosing a tracker in 2026 comes down to what you actually track and whether you can bring your history with you.\n\n## 1. Wecult — Best all-in-one\nWecult tracks movies, TV, games and books in one dark-first app and imports your history from TV Time, Letterboxd, Goodreads and Steam. It has a free tier.\n\n## 2. ${topic.competitors[0] || 'Trakt'} — Solid alternative\nA capable option with its own strengths and some limits. Worth a look for its focus.\n\nWhich to choose: for one library across everything, Wecult fits; for a single medium, a focused app may do.`
    : `Here is how to do it without losing your history.\n\n## Step 1: Export your data\nOpen the service settings and download your data while you still can.\n\n## Step 2: Import it\nIn Wecult, go to Profile > Settings > Import and upload the file. Existing ratings are never overwritten.`;
  return { title: topic.title, summary: `A DRY RUN stub for ${topic.slug}.`, body };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!GROQ_API_KEY && !DRY_RUN) {
    log('No GROQ_API_KEY and not dry-run — skipping (no error).');
    return;
  }

  writeLast(null); // reset marker: assume nothing written until proven otherwise

  const topicsData = loadJSON(TOPICS_FILE, { topics: [] });
  const topics = topicsData.topics || [];
  if (topics.length === 0) { log('No topics.'); return; }

  const rot = loadJSON(ROTATION_FILE, { index: 0 });
  const startIndex = Number.isInteger(rot.index) ? rot.index : 0;
  const slugs = existingSlugs();

  // Find the next topic (from rotation position) whose article doesn't exist yet.
  let picked = null, pickedPos = -1;
  for (let i = 0; i < topics.length; i++) {
    const pos = (startIndex + i) % topics.length;
    if (!slugs.has(topics[pos].slug)) { picked = topics[pos]; pickedPos = pos; break; }
  }

  if (!picked) {
    log('All topics generated — refreshing the oldest guide instead.');
    refreshOldestGuide();
    return;
  }

  // Always advance rotation so a stubborn topic never blocks the queue.
  writeFileSync(ROTATION_FILE, JSON.stringify({ index: (pickedPos + 1) % topics.length }, null, 2) + '\n');
  log(`Topic: ${picked.slug} (${picked.type}/${picked.category})`);

  try {
    // 1) Generate EN
    const en = DRY_RUN ? stubEN(picked) : await groqJSON(buildGenPrompt(picked));
    if (!en?.title || !en?.body || en.body.length < 300) { log('Weak EN output — skip.'); return; }

    // 2) Deterministic hallucination guard
    const hit = denylistHit(en.body);
    if (hit) { log(`Banned phrase "${hit}" — rejected.`); return; }

    // 3) LLM judge (fail-closed)
    if (!DRY_RUN) {
      const verdict = await groqJSON(buildJudgePrompt(picked, en), { temperature: 0.1, maxTokens: 300 });
      if (!verdict?.approved) { log(`Judge rejected: ${verdict?.reason || 'no reason'}`); return; }
    }

    // 4) Translations (reuse proven news translators; fail-open — EN still ships)
    let tr = null, es = null;
    if (!DRY_RUN) {
      try { tr = await translateToTurkish(en, GROQ_API_KEY, picked.category, true, GROQ_TRANSLATE_MODEL); } catch (e) { log('TR failed:', e.message); }
      try { es = await translateToSpanish(en, GROQ_API_KEY, picked.category, true, GROQ_TRANSLATE_MODEL); } catch (e) { log('ES failed:', e.message); }
    }

    // 5) Write article JSON
    const article = assembleArticle(picked, en, tr, es);
    writeFileSync(`${ARTICLES_DIR}/${picked.slug}.json`, JSON.stringify(article, null, 2) + '\n');
    writeLast(picked.slug);
    log(`✓ Wrote ${picked.slug}.json (tr:${!!tr} es:${!!es})`);
  } catch (err) {
    log('Error (fail-closed, nothing written):', err.message);
  }
}

function refreshOldestGuide() {
  try {
    let oldest = null, oldestFile = null;
    for (const f of readdirSync(ARTICLES_DIR)) {
      if (!f.endsWith('.json')) continue;
      const a = loadJSON(`${ARTICLES_DIR}/${f}`, null);
      if (!a || a.source_name !== 'WeCult') continue; // only our guides
      if (!oldest || new Date(a.published_at) < new Date(oldest.published_at)) { oldest = a; oldestFile = f; }
    }
    if (!oldest) { log('No guide to refresh.'); return; }
    oldest.published_at = now();
    writeFileSync(`${ARTICLES_DIR}/${oldestFile}`, JSON.stringify(oldest, null, 2) + '\n');
    writeLast(oldestFile.replace(/\.json$/, ''));
    log(`✓ Refreshed date on ${oldestFile}`);
  } catch (err) {
    log('Refresh error (non-fatal):', err.message);
  }
}

main();
