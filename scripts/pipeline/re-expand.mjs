#!/usr/bin/env node
/**
 * Kısa body'li makaleleri Gemini ile yeniden genişletir.
 * Çalıştırma: GEMINI_API_KEY=xxx node scripts/pipeline/re-expand.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) { console.error('GEMINI_API_KEY required'); process.exit(1); }

const ARTICLES_DIR = 'src/content/articles';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MIN_BODY_LENGTH = 400;
const SENTENCE_ENDS = /[.!?"»]$/;
const TRUNCATION_MARKERS = ['[…]', '[&#8230;]', '...Read more', '…]', '[&hellip;]'];

const categoryVoice = {
  games: 'a passionate gaming journalist writing for hardcore and casual gamers alike',
  film:  'an enthusiastic film critic writing for cinephiles and casual moviegoers',
  tv:    'an engaging TV writer writing for binge-watchers and series fans',
  books: 'a literary journalist writing for avid readers and book lovers',
};

const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'));
console.log(`[re-expand] Found ${files.length} articles`);

let fixed = 0, skipped = 0, failed = 0;

for (const file of files) {
  const path = join(ARTICLES_DIR, file);
  const article = JSON.parse(readFileSync(path, 'utf8'));

  const enBody = article.translations?.en?.body || '';
  const isTooShort = enBody.length < MIN_BODY_LENGTH;
  const isCutoff = enBody.length >= 2900 && !SENTENCE_ENDS.test(enBody.trim());
  const isTeaser = TRUNCATION_MARKERS.some(m => enBody.includes(m));
  if (!isTooShort && !isCutoff && !isTeaser) {
    skipped++;
    continue;
  }
  if (isCutoff) console.log(`  [cutoff] ${file.slice(0, 50)} (${enBody.length} chars)`);
  if (isTeaser) console.log(`  [teaser] ${file.slice(0, 50)} — RSS truncation detected`);


  const title = article.original_title || article.translations?.en?.title || '';
  const rawContent = article.content_raw || enBody;

  if (!title || !rawContent) {
    console.warn(`  [skip] ${file} — no content`);
    skipped++;
    continue;
  }

  console.log(`  Expanding: ${title.slice(0, 65)}...`);

  try {
    const enData = await expandArticle(article, rawContent);
    if (!enData) {
      console.warn(`  [fail] Could not expand ${file}`);
      failed++;
      continue;
    }

    await sleep(5000);
    const trData = await translateToTurkish(enData);

    article.translations.en = {
      title:   enData.title,
      summary: enData.summary,
      body:    enData.body,
    };
    article.translations.tr = trData;
    article.summary_en = enData.summary;
    article.ai_analysis = enData.ai_analysis || '';

    writeFileSync(path, JSON.stringify(article, null, 2));
    fixed++;
    console.log(`  ✓ EN body: ${enData.body.length} chars | TR: ${trData ? 'ok' : 'null'}`);
  } catch (err) {
    console.warn(`  [error] ${file}: ${err.message}`);
    failed++;
  }

  // Rate limit: 15 RPM → 4s between article cycles
  await sleep(4000);
}

console.log(`[re-expand] Done — fixed: ${fixed}, skipped: ${skipped}, failed: ${failed}`);

async function expandArticle(article, rawContent) {
  const voice = categoryVoice[article.category] || 'an entertainment journalist';
  const hookExamples = {
    games: 'e.g. "After years of speculation, the studio behind [X] just changed everything..."',
    film:  'e.g. "Few directors arrive at Cannes with a story like [X]\'s — and what happened next surprised everyone."',
    tv:    'e.g. "Fans of [X] spent the weekend convinced the show was cancelled. They were wrong."',
    books: 'e.g. "The debut novel that quietly sold 200,000 copies before a publisher even touched it..."',
  }[article.category] ?? '';

  const prompt = `You are ${voice} at WeCult — a premium entertainment platform.

═══════ SOURCE MATERIAL ═══════
ARTICLE TITLE: ${article.original_title}
SOURCE OUTLET: ${article.source_name}

RSS TEASER (⚠ SHORT PREVIEW — do NOT reproduce this verbatim, use it as context only):
${rawContent.slice(0, 1500)}
═══════════════════════════════

MANDATORY RULES — violating ANY = invalid output:
✗ NEVER copy the RSS teaser word-for-word — write original prose using your knowledge
✗ NEVER write "[...]", "[Read more]", "..." at sentence end, or leave thoughts incomplete
✗ NEVER invent specific quotes not in source material
✗ NEVER write fewer than 600 words in body
✗ NEVER use generic openers like "In a surprising turn of events..."

✓ Open with a SPECIFIC hook tied to this exact story (${hookExamples})
✓ Use **Name** for bold on key people/titles, *word* for emphasis
✓ Use ## Heading for section titles — make them specific, not generic
✓ Use > "Quote" — Person for real direct quotes
✓ Use bullet lists (- item) for 3+ items
✓ Separate every block with \\n\\n

STRUCTURE:
[Vivid 2–3 sentence hook]

## [Specific section title]

[2 paragraphs: background and context]

## [Specific section title]

[2–3 paragraphs: main story details]

> "[Quote if available]" — Name

## [Fan/Community angle section]

[1–2 paragraphs]

## What's Next

[1 closing paragraph]

Return ONLY this JSON (no markdown wrapper, no extra text):
{"title":"[Engaging reworded headline]","summary":"[2-sentence hook]","ai_analysis":"[1-sentence fan insight]","body":"[Full article — all sections, \\\\n\\\\n between blocks, 600–850 words]"}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed?.body || parsed.body.length < 300) {
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }

      return parsed;
    } catch (err) {
      if (attempt < 2) { await sleep(8000); continue; }
      return null;
    }
  }
  return null;
}

async function translateToTurkish(enData) {
  const prompt = `Translate this entertainment news article to Turkish for WeCult — a premium Turkish entertainment platform.

═══════ ENGLISH ARTICLE ═══════
TITLE: ${enData.title}
SUMMARY: ${enData.summary}

BODY:
${enData.body}
═══════════════════════════════

TRANSLATION RULES — violating ANY rule = invalid output:
✗ NEVER leave English words except: proper nouns (person names, film/game/book titles, brands, places)
✗ NEVER copy the English text — write natural Turkish, not word-for-word
✗ NEVER write fewer than 400 words in the Turkish body

✓ Translate ALL ## section headings to Turkish
✓ Keep ALL markdown: **bold**, *italic*, ## headings, > quotes, - lists, \\n\\n spacing
✓ Use natural Turkish journalism style
✓ Keep > quotes in original language but translate surrounding context

Return ONLY this JSON (no code blocks, no extra text):
{"title":"[Türkçe başlık]","summary":"[Türkçe 2 cümle özet]","body":"[Türkçe makale — tüm bölümler, \\\\n\\\\n ayrımlarıyla, minimum 400 kelime]"}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed?.body || parsed.body.length < 200) {
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }
      if (parsed.title === enData.title || parsed.body.slice(0, 80) === enData.body.slice(0, 80)) {
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }

      return parsed;
    } catch (err) {
      if (attempt < 2) { await sleep(8000); continue; }
      return null;
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
