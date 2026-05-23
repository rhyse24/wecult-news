#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { fetchFeed } from './fetch.mjs';
import { summarizeArticle } from './summarize.mjs';
import { searchContext } from './search.mjs';
import { SOURCES, MAX_PER_SOURCE, MAX_PER_CATEGORY, MAX_TOTAL } from './sources.mjs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY env var required');
  process.exit(1);
}

const ARTICLES_DIR = 'src/content/articles';
const SEEN_FILE = 'scripts/pipeline/.seen-urls.json';

mkdirSync(ARTICLES_DIR, { recursive: true });

// Load seen URLs to avoid reprocessing
const seen = new Set(existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, 'utf8')) : []);

// Fetch Reddit hot keywords per category for popularity scoring
const REDDIT_SUBS = { games: 'gaming', film: 'movies', tv: 'television', books: 'books' };
const redditKeywords = {};
console.log('[pipeline] Fetching Reddit trending signals...');
for (const [cat, sub] of Object.entries(REDDIT_SUBS)) {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=30`, {
      headers: { 'User-Agent': 'WeCultNews/1.0 (+https://wecult.app/news)' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      redditKeywords[cat] = data.data.children
        .map(p => p.data.title.toLowerCase())
        .join(' ');
      console.log(`  r/${sub}: ${data.data.children.length} hot posts loaded`);
    }
  } catch {
    console.warn(`  [skip] Reddit r/${sub}`);
  }
}

function scoreArticle(article) {
  let score = 0;
  const titleWords = article.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const trending = redditKeywords[article.category] || '';
  // Reddit trending match — biggest signal
  for (const word of titleWords) {
    if (trending.includes(word)) score += 2;
  }
  // Recency bonus
  const ageHours = (Date.now() - new Date(article.pubDate).getTime()) / 3600000;
  if (ageHours < 6) score += 4;
  else if (ageHours < 12) score += 2;
  else if (ageHours < 24) score += 1;
  // Has image
  if (article.image_url) score += 1;
  // Substantial content
  if (article.content.length > 500) score += 1;
  return score;
}

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

// Score and sort — trending articles bubble to top
allArticles.sort((a, b) => scoreArticle(b) - scoreArticle(a));

// Equal distribution across categories (top-scored articles per category)
const byCategory = {};
for (const a of allArticles) {
  if (!byCategory[a.category]) byCategory[a.category] = [];
  if (byCategory[a.category].length < MAX_PER_CATEGORY) byCategory[a.category].push(a);
}
const toProcess = Object.values(byCategory).flat().slice(0, MAX_TOTAL);
const dist = Object.entries(byCategory).map(([c, arr]) => `${c}:${arr.length}`).join(' ');
console.log(`[pipeline] Processing ${toProcess.length} articles (${dist}) with Gemini...`);

let saved = 0;
for (const article of toProcess) {
  try {
    // Web search for richer context
    let webContext = '';
    if (TAVILY_API_KEY) {
      webContext = await searchContext(article, TAVILY_API_KEY);
      if (webContext) console.log(`    [search] context found (${webContext.length} chars)`);
    }

    let ai;
    try {
      ai = await summarizeArticle(article, GEMINI_API_KEY, webContext);
    } catch (geminiErr) {
      // Gemini quota/rate error → fallback to raw content
      console.warn(`  [gemini-fallback] ${geminiErr.message.slice(0, 60)}`);
      const snippet = article.content.slice(0, 500);
      const body = article.content;
      ai = {
        summary_en: snippet,
        ai_analysis: '',
        translations: {
          en: { title: article.title, summary: snippet, body },
          tr: { title: article.title, summary: snippet, body },
        },
      };
    }

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
      content_raw: article.content,
      tags: inferTags(article),
      image_url: article.image_url || '',
    };

    writeFileSync(`${ARTICLES_DIR}/${filename}.json`, JSON.stringify(json, null, 2));
    seen.add(article.link);
    saved++;
    console.log(`  ✓ ${article.title.slice(0, 60)}`);

    // Rate limit: 15 RPM free tier → 1 req / 5s = 12 RPM
    await sleep(5000);
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
