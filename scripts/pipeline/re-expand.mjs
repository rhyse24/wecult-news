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
  const prompt = `You are ${voice} at WeCult — a premium entertainment platform.

CRITICAL: Return ONLY a single valid JSON object. No markdown, no code blocks, no extra text.

Article title: ${article.original_title}
Source: ${article.source_name}
RSS content: ${rawContent.slice(0, 1500)}

Write a full structured English article with minimum 500 words. Body MUST use \\n\\n between blocks:
Hook paragraph\\n\\n## Why This Matters\\n\\nParagraph\\n\\n## The Full Story\\n\\nParagraph 1\\n\\nParagraph 2\\n\\n## What Fans Are Saying\\n\\nParagraph\\n\\n> Pull quote\\n\\n## What's Next\\n\\nClosing paragraph

Return this JSON (nothing else):
{"title":"Engaging reworded title","summary":"2-sentence English hook","ai_analysis":"1-sentence insight for fans","body":"[full structured article in English, min 500 words]"}`;

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
  const prompt = `Translate this entertainment article to Turkish (Türkçe).

CRITICAL: ALL output fields MUST be in Turkish. Return ONLY a valid JSON object. No markdown.

English title: ${enData.title}
English summary: ${enData.summary}
English body:
${enData.body.slice(0, 2500)}

Translate everything to Turkish. Keep the same ## section structure but translate headings too.

Return this JSON (all values in Turkish, NOT English):
{"title":"[Türkçe başlık]","summary":"[Türkçe 2 cümle özet]","body":"[Türkçe makale, minimum 400 kelime]"}`;

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
