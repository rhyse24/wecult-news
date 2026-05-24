#!/usr/bin/env node
/**
 * Kısa, kesilmiş veya teaser body'li makaleleri Gemini ile yeniden genişletir.
 * Çalıştırma: GEMINI_API_KEY=xxx node scripts/pipeline/re-expand.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { validateArticle, isTruncated, titleEntityPresent } from './summarize.mjs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) { console.error('GEMINI_API_KEY required'); process.exit(1); }

const ARTICLES_DIR = 'src/content/articles';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MIN_BODY_WORDS = 600;
const SENTENCE_ENDS = /[.!?"»]+\s*$/;

const PLATFORM_CONTEXT = `WeCult News is the editorial arm of WeCult — a global premium entertainment platform covering film, TV, games, and books. Our readers are smart, passionate fans from around the world who consume content on mobile. We write in both English and Turkish. Our voice is enthusiastic but credible — never clickbait, never dry.`;

const TONE_BY_CATEGORY = {
  games:  'passionate gaming journalist — knowledgeable about franchise history, platforms, developer track records',
  film:   'enthusiastic film critic — comfortable with cinematic language but always accessible',
  tv:     'engaging TV writer — focused on narrative arcs, showrunner decisions, renewal/cancellation stakes',
  books:  'literary journalist — excited about storytelling craft, genre trends, debut authors',
};

const HOOK_EXAMPLE_BY_CATEGORY = {
  games: '"After five years of silence, the studio behind [X] just confirmed what fans feared — and what they hoped for."',
  film:  '"Few directors arrive at Cannes carrying a career like [X]\'s. What happened at the closing ceremony rewrote the story."',
  tv:    '"Fans spent the weekend convinced [X] was cancelled. The network just proved them wrong — and then some."',
  books: '"The debut novel that sold 200,000 copies before a major publisher touched it is finally getting its moment."',
};

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countHeadings(text) {
  return (text.match(/^##\s+.+/gm) || []).length;
}

function needsExpansion(article) {
  const enBody = article.translations?.en?.body || '';
  const words = wordCount(enBody);
  if (words < MIN_BODY_WORDS) return `EN body too short: ${words} words`;
  if (isTruncated(enBody)) return 'EN body contains truncation marker';
  if (!SENTENCE_ENDS.test(enBody.trim())) return 'EN body ends mid-sentence (cutoff)';
  if (countHeadings(enBody) < 2) return `EN body has ${countHeadings(enBody)} headings (need ≥2)`;

  const trBody = article.translations?.tr?.body || null;
  if (trBody !== null) {
    const trWords = wordCount(trBody);
    if (trWords < 400) return `TR body too short: ${trWords} words`;
  }

  return null; // article is fine
}

const BATCH_LIMIT = parseInt(process.env.BATCH_LIMIT || '10', 10);

const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'));
console.log(`[re-expand] Found ${files.length} articles — checking quality... (batch limit: ${BATCH_LIMIT})`);

let fixed = 0, skipped = 0, failed = 0, processed = 0;

for (const file of files) {
  const path = join(ARTICLES_DIR, file);
  const article = JSON.parse(readFileSync(path, 'utf8'));

  const reason = needsExpansion(article);
  if (!reason) {
    skipped++;
    continue;
  }

  if (processed >= BATCH_LIMIT) {
    console.log(`  [batch-limit] reached ${BATCH_LIMIT} articles — stopping. Run again tomorrow for the rest.`);
    break;
  }
  processed++;

  const title = article.original_title || article.translations?.en?.title || '';
  const rawContent = article.content_raw || article.translations?.en?.body || '';

  console.log(`  [expand] ${title.slice(0, 65)}`);
  console.log(`    reason: ${reason}`);

  if (!title) {
    console.warn(`  [skip] no title found`);
    skipped++; continue;
  }

  try {
    const enData = await expandArticle(article, rawContent);
    if (!enData) {
      console.warn(`  [fail] Gemini could not expand`);
      failed++; continue;
    }

    await sleep(5000);
    const trData = await translateToTurkish(enData, article.category);

    const updated = {
      ...article,
      translations: {
        ...article.translations,
        en: { title: enData.title, summary: enData.summary, body: enData.body },
        tr: trData,
      },
      summary_en: enData.summary,
      ai_analysis: enData.ai_analysis || '',
    };

    // Final quality gate before saving
    const qc = validateArticle(updated);
    if (!qc.valid) {
      console.warn(`  [quality-gate] still failing after expansion:`);
      for (const e of qc.errors) console.warn(`    ✗ ${e}`);
      failed++; continue;
    }

    // Hallucination guard
    if (!titleEntityPresent(title, enData.body)) {
      console.warn(`  [hallucination-guard] title keywords missing from expanded body — skip`);
      failed++; continue;
    }

    writeFileSync(path, JSON.stringify(updated, null, 2));
    fixed++;
    const enWords = wordCount(enData.body);
    const trWords = trData ? wordCount(trData.body) : 0;
    console.log(`  ✓ EN: ${enWords} words | TR: ${trData ? trWords + ' words' : 'null'}`);
  } catch (err) {
    console.warn(`  [error] ${err.message}`);
    failed++;
  }

  await sleep(8000); // Rate limit buffer — Gemini free tier 15 RPM
}

console.log(`\n[re-expand] Done — fixed: ${fixed} | skipped (ok): ${skipped} | failed: ${failed}`);

// ── Gemini expand ──────────────────────────────────────────────────────

async function expandArticle(article, rawContent) {
  const voice = TONE_BY_CATEGORY[article.category] || 'entertainment journalist';
  const hookExample = HOOK_EXAMPLE_BY_CATEGORY[article.category] ?? '';

  const prompt = `${PLATFORM_CONTEXT}

You are a ${voice}. Write a COMPLETE, ORIGINAL article for WeCult News readers.

═══════ SOURCE MATERIAL ═══════
TITLE: ${article.original_title}
SOURCE OUTLET: ${article.source_name}

RSS TEASER — ⚠ this is a SHORT PREVIEW only, NOT the full article:
${rawContent.slice(0, 1800)}
═══════════════════════════════

CONTENT RULES (WeCult Editorial Standard — ALL mandatory):

RULE 1 — MINIMUMS:
• Body must be 700–900 words (NEVER fewer than 600)
• Include at least 2 ## section headings
• Every sentence must be complete — NEVER end with "[...]", "Read more", "…" or mid-thought

RULE 2 — STRUCTURE:
[Hook: 2–3 vivid, specific sentences]
Example: ${hookExample}

## [Specific section title]
[2 paragraphs: background context — who, franchise history, why this outlet matters]

## [Specific section title]
[2–3 paragraphs: what happened, key details, timeline]
[> "Quote" — Person if available]

## [Fan angle — why fans care]
[1–2 paragraphs]

## What's Next
[1 closing paragraph: dates, what to watch for]

RULE 3 — NO HALLUCINATION:
• NEVER invent quotes, release dates, cast members, or statistics
• If information is unknown: write "details have not yet been announced"
• You may use your training knowledge about franchise history, director filmographies, etc.

RULE 4 — VOICE:
• NEVER open with "In a surprising turn of events..." or similar generic phrases
• Bold key names: **Director Name**, **Game Title**
• Separate every block with \\n\\n

Return ONLY this JSON (no markdown wrapper):
{"title":"[Engaging headline]","summary":"[2-sentence hook]","ai_analysis":"[1-sentence fan insight]","body":"[Full article — all sections, \\\\n\\\\n between blocks, 700–900 words]"}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.65, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`    [gemini attempt ${attempt}] HTTP ${res.status}: ${errText.slice(0, 150)}`);
        if (res.status === 429) {
          if (attempt < 3) { console.warn(`    [rate-limit] waiting 65s before retry...`); await sleep(65000); continue; }
          console.warn(`    [rate-limit] quota exhausted — skipping this article`);
          return null;
        }
        if (attempt < 3) { await sleep(attempt * 7000); continue; }
        return null;
      }

      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!raw) {
        const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'empty response';
        console.warn(`    [gemini attempt ${attempt}] empty response — ${reason}`);
        if (attempt < 3) { await sleep(attempt * 7000); continue; }
        return null;
      }

      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

      let parsed;
      try { parsed = JSON.parse(cleaned); }
      catch {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch (e2) { console.warn(`    [gemini attempt ${attempt}] JSON parse failed: ${e2.message}`); throw e2; } }
        else { console.warn(`    [gemini attempt ${attempt}] no JSON in response (${cleaned.slice(0, 80)})`); throw new Error('No JSON'); }
      }

      const body = parsed?.body ?? '';
      const words = wordCount(body);
      if (words < 400) {
        console.warn(`    [gemini attempt ${attempt}] body too short: ${words} words`);
        if (attempt < 3) { await sleep(attempt * 7000); continue; }
        return null;
      }
      if (isTruncated(body)) {
        console.warn(`    [gemini attempt ${attempt}] truncation marker in body`);
        if (attempt < 3) { await sleep(attempt * 7000); continue; }
        return null;
      }

      return parsed;
    } catch (err) {
      console.warn(`    [gemini attempt ${attempt}] exception: ${err.message}`);
      if (attempt < 3) { await sleep(attempt * 7000); continue; }
      return null;
    }
  }
  return null;
}

async function translateToTurkish(enData, category) {
  const categoryNote = {
    games: 'gaming terms like "open world", "DLC", "early access" can stay in English',
    film:  'cinema terms like "box office", "premiere", "Palme d\'Or" can stay as-is',
    tv:    'TV terms like "showrunner", "season finale", "streaming" can stay as-is',
    books: 'publishing terms like "bestseller", "debut novel" can stay as-is',
  }[category] ?? '';

  const prompt = `${PLATFORM_CONTEXT}

Translate this entertainment news article to Turkish for WeCult News readers.

═══════ ENGLISH ARTICLE ═══════
TITLE: ${enData.title}
SUMMARY: ${enData.summary}

BODY:
${enData.body}
═══════════════════════════════

TRANSLATION RULES (ALL mandatory):
• ALL output in Turkish — title, summary, body, section headings
• Keep proper nouns as-is: person names, film/game/book titles, brand names, place names
• ${categoryNote}
• Translate all ## headings to Turkish
• Keep all markdown formatting: **bold**, > quotes, - lists, \\n\\n spacing
• Write natural Turkish journalism — NOT word-for-word translation
• Body must be at least 400 words in Turkish
• NEVER copy the English text

Return ONLY this JSON:
{"title":"[Türkçe başlık]","summary":"[Türkçe 2 cümle özet]","body":"[Türkçe makale — tüm bölümler, \\\\n\\\\n ayrımlarıyla, min 400 kelime]"}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.45, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        if (res.status === 429) {
          if (attempt < 3) { console.warn(`    [tr rate-limit] waiting 65s...`); await sleep(65000); continue; }
          return null;
        }
        if (attempt < 3) { await sleep(attempt * 7000); continue; }
        return null;
      }

      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

      let parsed;
      try { parsed = JSON.parse(cleaned); }
      catch { const m = cleaned.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { throw new Error('JSON parse failed'); } } else throw new Error('No JSON'); }

      const body = parsed?.body ?? '';
      if (wordCount(body) < 200) { if (attempt < 3) { await sleep(attempt * 7000); continue; } return null; }
      if (parsed.title === enData.title) { if (attempt < 3) { await sleep(attempt * 7000); continue; } return null; }
      if (body.slice(0, 100).toLowerCase() === enData.body.slice(0, 100).toLowerCase()) { if (attempt < 3) { await sleep(attempt * 7000); continue; } return null; }

      return parsed;
    } catch (err) {
      if (attempt < 3) { await sleep(attempt * 7000); continue; }
      return null;
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
