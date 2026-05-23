#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { fetchFeed } from './fetch.mjs';
import { summarizeArticle } from './summarize.mjs';
import { SOURCES, MAX_PER_SOURCE, MAX_TOTAL } from './sources.mjs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY env var required');
  process.exit(1);
}

const ARTICLES_DIR = 'src/content/articles';
const SEEN_FILE = 'scripts/pipeline/.seen-urls.json';

mkdirSync(ARTICLES_DIR, { recursive: true });

// Load seen URLs to avoid reprocessing
const seen = new Set(existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, 'utf8')) : []);

console.log('[pipeline] Fetching RSS feeds...');
const allArticles = [];

for (const source of SOURCES) {
  try {
    const items = await fetchFeed(source, MAX_PER_SOURCE);
    const fresh = items.filter(a => !seen.has(a.link));
    console.log(`  ${source.name}: ${fresh.length} new / ${items.length} total`);
    allArticles.push(...fresh);
  } catch (err) {
    console.warn(`  [skip] ${source.name}: ${err.message}`);
  }
}

const toProcess = allArticles.slice(0, MAX_TOTAL);
console.log(`[pipeline] Processing ${toProcess.length} articles with Gemini...`);

let saved = 0;
for (const article of toProcess) {
  try {
    const ai = await summarizeArticle(article, GEMINI_API_KEY);

    const slug = slugify(article.title);
    const id = createHash('md5').update(article.link).digest('hex').slice(0, 8);
    const filename = `${id}-${slug}`;

    const json = {
      id: filename,
      slug: filename,
      category: article.category,
      source_name: article.source_name,
      source_url: article.link,
      original_title: article.title,
      published_at: new Date(article.pubDate).toISOString(),
      fetched_at: new Date().toISOString(),
      summary_en: ai.summary_en,
      ai_analysis: ai.ai_analysis,
      translations: ai.translations,
      tags: inferTags(article),
      image_url: '',
    };

    writeFileSync(`${ARTICLES_DIR}/${filename}.json`, JSON.stringify(json, null, 2));
    seen.add(article.link);
    saved++;
    console.log(`  ✓ ${article.title.slice(0, 60)}`);

    // Rate limit: ~40 req/min on free tier
    await sleep(1600);
  } catch (err) {
    console.warn(`  [skip] ${article.title.slice(0, 50)}: ${err.message}`);
  }
}

// Persist seen URLs (keep last 500)
const seenArr = [...seen].slice(-500);
writeFileSync(SEEN_FILE, JSON.stringify(seenArr, null, 2));

console.log(`[pipeline] Done — ${saved} articles saved to ${ARTICLES_DIR}/`);

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function inferTags(article) {
  const text = (article.title + ' ' + article.content).toLowerCase();
  const tags = [article.category];
  const keywords = {
    games: ['playstation', 'xbox', 'nintendo', 'pc', 'steam', 'gta', 'zelda', 'indie'],
    film: ['marvel', 'dc', 'disney', 'netflix', 'box office', 'trailer', 'oscar'],
    tv: ['hbo', 'streaming', 'season', 'episode', 'renewed', 'cancelled'],
    books: ['novel', 'fantasy', 'sci-fi', 'author', 'bestseller', 'series'],
  };
  const extra = keywords[article.category] || [];
  for (const kw of extra) {
    if (text.includes(kw)) tags.push(kw);
  }
  return [...new Set(tags)].slice(0, 5);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
