#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { fetchFeed } from './fetch.mjs';
import { summarizeArticle, validateArticle, isTruncated, titleEntityPresent } from './summarize.mjs';
import { searchContext, scrapeOgImage, searchTmdbImage, searchIgdbImage, searchInlineImage } from './search.mjs';
import { SOURCES, MAX_PER_SOURCE, MAX_PER_CATEGORY, MAX_TOTAL } from './sources.mjs';

// ── Title dedup helpers (must be before first use) ──────────────────
const TITLE_STOP_WORDS = new Set(['the','and','for','with','from','that','this','have','will','what','when','your','their','about','more','into','over','after','then','them','some','these','than','been','were','said','also','just','like','very','only','even','such','both','here']);

function normalizeTitle(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !TITLE_STOP_WORDS.has(w));
}

function jaccardSimilarity(wordsA, wordsB) {
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function deduplicateByTitle(articles) {
  const kept = [];
  for (const article of articles) {
    const wordsA = normalizeTitle(article.title);
    const isDup = kept.some(b => {
      if (b.category !== article.category) return false;
      const timeDiff = Math.abs(new Date(article.pubDate) - new Date(b.pubDate));
      if (timeDiff > 12 * 3600000) return false;
      return jaccardSimilarity(wordsA, normalizeTitle(b.title)) > 0.65;
    });
    if (isDup) {
      console.log(`  [dedup] skipped "${article.title.slice(0, 55)}" — similar story exists`);
    } else {
      kept.push(article);
    }
  }
  return kept;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TMDB_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN || '';
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY env var required');
  process.exit(1);
}

const ARTICLES_DIR = 'src/content/articles';
const SEEN_FILE = 'scripts/pipeline/.seen-urls.json';
const MAX_ARTICLE_AGE_HOURS = 48;

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
    const fresh = items.filter(a => {
      if (seen.has(a.link)) return false;
      const ageHours = (Date.now() - new Date(a.pubDate).getTime()) / 3600000;
      if (ageHours > MAX_ARTICLE_AGE_HOURS) return false;
      return true;
    });
    console.log(`  ${source.name}: ${fresh.length} new / ${items.length} total`);
    allArticles.push(...fresh);
  } catch (err) {
    console.warn(`  [skip] ${source.name}: ${err.message}`);
  }
}

// Deduplicate by title — same story from multiple sources
const deduped = deduplicateByTitle(allArticles);
if (deduped.length < allArticles.length) {
  console.log(`[pipeline] Dedup: ${allArticles.length} → ${deduped.length} articles (removed ${allArticles.length - deduped.length} near-duplicates)`);
}

// Score and sort — trending articles bubble to top
deduped.sort((a, b) => scoreArticle(b) - scoreArticle(a));

// Equal distribution across categories — keep up to 2 candidates per category for fallback
const CANDIDATES_PER_CATEGORY = 2;
const byCategory = {};
for (const a of deduped) {
  if (!byCategory[a.category]) byCategory[a.category] = [];
  if (byCategory[a.category].length < CANDIDATES_PER_CATEGORY) byCategory[a.category].push(a);
}
// Build candidate pool: up to 2 per category, ordered so categories alternate (variety across runs)
const candidatePool = [];
for (let i = 0; i < CANDIDATES_PER_CATEGORY; i++) {
  for (const arr of Object.values(byCategory)) {
    if (arr[i]) candidatePool.push(arr[i]);
  }
}
const dist = Object.entries(byCategory).map(([c, arr]) => `${c}:${arr.length}`).join(' ');
console.log(`[pipeline] Candidate pool: ${candidatePool.length} articles (${dist}), target: ${MAX_TOTAL}`);

let saved = 0;
for (const article of candidatePool) {
  if (saved >= MAX_TOTAL) break;
  try {
    // Image fallback chain: RSS → og:image → TMDB/IGDB → Wikipedia
    if (!article.image_url) {
      article.image_url = await scrapeOgImage(article.link);
    }
    if (!article.image_url && (article.category === 'film' || article.category === 'tv') && TMDB_TOKEN) {
      article.image_url = await searchTmdbImage(article.title, article.category, TMDB_TOKEN);
    }
    if (!article.image_url && article.category === 'games' && TWITCH_CLIENT_ID) {
      article.image_url = await searchIgdbImage(article.title, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);
    }
    if (!article.image_url) {
      article.image_url = await searchInlineImage(article);
    }

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
      console.warn(`  [gemini-fail] ${geminiErr.message.slice(0, 80)}`);
      // Rule 5: RSS teaser without Gemini expansion = useless, skip
      if (article.content.length < 600 || isTruncated(article.content)) {
        console.warn(`  [skip] ${article.title.slice(0, 50)} — Gemini failed + RSS too short/truncated`);
        continue;
      }
      // Fallback only when RSS gave substantial content (≥600 chars, no truncation)
      const snippet = article.content.slice(0, 300);
      ai = {
        summary_en: snippet,
        ai_analysis: '',
        translations: {
          en: { title: article.title, summary: snippet, body: article.content },
          tr: null,
        },
      };
    }

    // Rule 8 — Quality Gate: reject articles that fail editorial minimums
    const qc = validateArticle(ai);
    if (!qc.valid) {
      console.warn(`  [quality-gate] ${article.title.slice(0, 50)}`);
      for (const e of qc.errors) console.warn(`    ✗ ${e}`);
      console.warn(`  [skip] article did not meet WeCult editorial standards`);
      continue;
    }
    console.log(`  [quality-gate] ✓ passed`);

    // Rule 9 — Hallucination guard
    const enBody = ai.translations?.en?.body ?? '';
    if (!titleEntityPresent(article.title, enBody)) {
      console.warn(`  [hallucination-guard] title keywords missing from body — skip`);
      console.warn(`    title: "${article.title.slice(0, 65)}"`);
      continue;
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
      trending_score: scoreArticle(article),
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

