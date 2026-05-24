#!/usr/bin/env node
/**
 * Mevcut makalelerdeki TR çevirisini düzeltir.
 * Çalıştırma: GEMINI_API_KEY=xxx node scripts/pipeline/retranslate.mjs
 * GitHub Actions: Actions → News Pipeline → Run workflow (retranslate seçeneği yok, manuel çalıştır)
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) { console.error('GEMINI_API_KEY required'); process.exit(1); }

const ARTICLES_DIR = 'src/content/articles';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'));
console.log(`[retranslate] Found ${files.length} articles`);

let fixed = 0, skipped = 0, failed = 0;

for (const file of files) {
  const path = join(ARTICLES_DIR, file);
  const article = JSON.parse(readFileSync(path, 'utf8'));

  const en = article.translations?.en;
  const tr = article.translations?.tr;

  // Skip if already has proper TR translation (title differs from EN)
  if (tr && tr.title && tr.title !== en?.title && tr.body && tr.body !== en?.body) {
    skipped++;
    continue;
  }

  if (!en?.title || !en?.body) {
    console.warn(`  [skip] ${file} — no EN content`);
    skipped++;
    continue;
  }

  console.log(`  Translating: ${en.title.slice(0, 60)}...`);

  try {
    const trData = await translateToTurkish(en);
    if (!trData) {
      console.warn(`  [fail] Could not translate ${file}`);
      failed++;
      continue;
    }

    article.translations.tr = trData;
    writeFileSync(path, JSON.stringify(article, null, 2));
    fixed++;
    console.log(`  ✓ TR: ${trData.title.slice(0, 60)}`);
  } catch (err) {
    console.warn(`  [error] ${file}: ${err.message}`);
    failed++;
  }

  // Rate limit: 15 RPM → 4s between calls
  await sleep(4000);
}

console.log(`[retranslate] Done — fixed: ${fixed}, skipped: ${skipped}, failed: ${failed}`);

async function translateToTurkish(en) {
  const prompt = `Translate this entertainment article to Turkish (Türkçe).

CRITICAL: ALL output fields MUST be in Turkish. Return ONLY a valid JSON object. No markdown.

English title: ${en.title}
English summary: ${en.summary}
English body:
${en.body.slice(0, 2500)}

Translate everything to Turkish. Keep the same ## section structure but translate headings too.

Return this JSON (all values in Turkish, NOT English):
{"title":"[Türkçe başlık]","summary":"[Türkçe 2 cümle özet]","body":"[Türkçe makale, minimum 400 kelime]"}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 3000 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/,'').trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed?.body || parsed.body.length < 200) {
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }
      if (parsed.title === en.title || parsed.body.slice(0, 80) === en.body.slice(0, 80)) {
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

const apiKey = GEMINI_API_KEY;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
