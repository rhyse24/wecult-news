#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { translateToTurkish, translateToSpanish, GROQ_TRANSLATE_MODEL } from './summarize.mjs';

const ARTICLES_DIR = 'src/content/articles';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY   = process.env.GROQ_API_KEY || '';

if (!GEMINI_API_KEY) {
  console.error('[patch] GEMINI_API_KEY required');
  process.exit(1);
}

if (!existsSync(ARTICLES_DIR)) {
  console.log('[patch] No articles directory — nothing to patch');
  process.exit(0);
}

const PATCH_WINDOW_HOURS = 48;
const cutoff = Date.now() - PATCH_WINDOW_HOURS * 3600000;

const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'));
const candidates = [];

for (const file of files) {
  try {
    const data = JSON.parse(readFileSync(`${ARTICLES_DIR}/${file}`, 'utf8'));
    if (new Date(data.published_at).getTime() < cutoff) continue;
    const needsTR = data.translations?.tr === null;
    const needsES = data.translations?.es === null;
    if (needsTR || needsES) candidates.push({ file, data, needsTR, needsES });
  } catch { /* skip malformed */ }
}

console.log(`[patch] Found ${candidates.length} article(s) with missing translations (last ${PATCH_WINDOW_HOURS}h)`);
if (candidates.length === 0) process.exit(0);

let patched = 0;
for (const { file, data, needsTR, needsES } of candidates) {
  const enData = data.translations?.en;
  if (!enData?.body) {
    console.warn(`[patch] ${file}: no EN body, skipping`);
    continue;
  }

  console.log(`[patch] ${file.slice(0, 40)} — TR:${needsTR ? 'missing' : 'ok'} ES:${needsES ? 'missing' : 'ok'}`);
  let changed = false;

  if (needsTR) {
    await sleep(65000);
    const tr = await translateToTurkish(enData, GROQ_API_KEY || GEMINI_API_KEY, data.category, !!GROQ_API_KEY, GROQ_TRANSLATE_MODEL);
    if (tr) {
      data.translations.tr = tr;
      changed = true;
      console.log(`  [patch] TR ✓`);
    } else {
      console.warn(`  [patch] TR still failing`);
    }
  }

  if (needsES) {
    await sleep(60000);
    const es = await translateToSpanish(enData, GROQ_API_KEY || GEMINI_API_KEY, data.category, !!GROQ_API_KEY, GROQ_TRANSLATE_MODEL);
    if (es) {
      data.translations.es = es;
      changed = true;
      console.log(`  [patch] ES ✓`);
    } else {
      console.warn(`  [patch] ES still failing`);
    }
  }

  if (changed) {
    writeFileSync(`${ARTICLES_DIR}/${file}`, JSON.stringify(data, null, 2));
    patched++;
  }
}

console.log(`[patch] Done — ${patched}/${candidates.length} article(s) patched`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
