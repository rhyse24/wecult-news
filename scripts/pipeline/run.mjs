#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { fetchFeed } from './fetch.mjs';
import { summarizeArticle, validateArticle, isTruncated, titleEntityPresent } from './summarize.mjs';
import { searchContext, scrapeOgImage, searchTmdbImage, searchIgdbImage, searchInlineImage, searchOpenLibraryImage } from './search.mjs';
import { SOURCES, MAX_PER_SOURCE, MAX_TOTAL } from './sources.mjs';

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
const LOG_FILE = 'public/pipeline-log.json';
const MAX_ARTICLE_AGE_HOURS = 48;

// Run log — filled during pipeline execution, written at the end
const runLog = {
  timestamp: new Date().toISOString(),
  status: 'filtered',
  articlesWritten: 0,
  quotaExhausted: false,
  totalFetched: 0,
  totalCandidates: 0,
  written: [],
  rejected: [],
};

mkdirSync(ARTICLES_DIR, { recursive: true });

// Load seen URLs to avoid reprocessing
const seen = new Set(existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, 'utf8')) : []);

// Fetch Reddit hot keywords + velocity per category for popularity scoring
const REDDIT_SUBS = { games: 'gaming', film: 'movies', tv: 'television', books: 'books' };
const redditKeywords = {};
const redditVelocity = {}; // keyword → upvotes/hour for rising posts
console.log('[pipeline] Fetching Reddit trending signals...');
for (const [cat, sub] of Object.entries(REDDIT_SUBS)) {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=30`, {
      headers: { 'User-Agent': 'WeCultNews/1.0 (+https://wecult.app/news)' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const posts = data.data.children.map(p => p.data);
      redditKeywords[cat] = posts.map(p => p.title.toLowerCase()).join(' ');
      // Velocity: upvotes per hour for posts < 6 hours old
      const velocityWords = [];
      for (const p of posts) {
        const ageHours = (Date.now() / 1000 - p.created_utc) / 3600;
        if (ageHours < 6 && p.ups > 50) {
          const velocity = p.ups / Math.max(ageHours, 0.1);
          if (velocity > 100) {
            velocityWords.push(...p.title.toLowerCase().split(/\s+/).filter(w => w.length > 4));
          }
        }
      }
      redditVelocity[cat] = velocityWords;
      console.log(`  r/${sub}: ${posts.length} hot posts, ${velocityWords.length} velocity keywords`);
    }
  } catch {
    console.warn(`  [skip] Reddit r/${sub}`);
  }
}

// Fetch Google Trends daily trending searches (US) — no auth required
let googleTrendsText = '';
try {
  const res = await fetch('https://trends.google.com/trends/trendingsearches/daily/rss?geo=US', {
    headers: { 'User-Agent': 'WeCultNews/1.0 (+https://wecult.app/news)' },
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) {
    const xml = await res.text();
    const titles = [...xml.matchAll(/<title[^>]*>(.*?)<\/title>/gi)]
      .map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').trim())
      .filter(t => t && !t.toLowerCase().includes('google trends') && t.length > 3)
      .slice(0, 40);
    googleTrendsText = titles.join(' ').toLowerCase();
    console.log(`[pipeline] Google Trends: ${titles.length} trending topics loaded`);
  }
} catch {
  console.warn(`[pipeline] Google Trends: fetch failed (non-critical, continuing)`);
}

const sourceTierMap = new Map(SOURCES.map(s => [s.name, s.tier ?? 2]));

const NEWS_SIGNALS = ['announced', 'confirms', 'reveals', 'acquired', 'renewed', 'cancelled', 'trailer', 'release date', 'launches', 'officially', 'exclusive', 'breaking'];

function scoreArticle(article) {
  let score = 0;
  const titleLower = article.title.toLowerCase();
  const titleWords = titleLower.split(/\s+/).filter(w => w.length > 4);
  const trending = redditKeywords[article.category] || '';
  // Reddit trending match
  for (const word of titleWords) {
    if (trending.includes(word)) score += 2;
  }
  // Reddit velocity match — post rising fast right now = +4
  const velWords = redditVelocity[article.category] || [];
  if (velWords.length > 0) {
    for (const word of titleWords) {
      if (velWords.includes(word)) { score += 4; break; }
    }
  }
  // Google Trends match — fuzzy: any title word appears in any trending phrase
  if (googleTrendsText) {
    const trendsWords = googleTrendsText.split(/\s+/).filter(w => w.length > 4);
    for (const word of titleWords) {
      if (trendsWords.some(tw => tw.includes(word) || word.includes(tw))) { score += 3; break; }
    }
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
  // Source tier bonus — premium trade publications rank higher
  const tier = sourceTierMap.get(article.source_name) ?? 2;
  if (tier === 1) score += 2;
  else if (tier === 3) score -= 1;
  // News signal bonus — hard news over opinion/analysis
  for (const signal of NEWS_SIGNALS) {
    if (titleLower.includes(signal)) { score += 2; break; }
  }
  // Story velocity — covered by multiple sources = important story
  const sourceCount = article._sourceCount ?? 1;
  if (sourceCount >= 4) score += 4;
  else if (sourceCount >= 3) score += 3;
  else if (sourceCount >= 2) score += 2;
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

// Story velocity — how many sources covered the same story before dedup
for (const article of deduped) {
  const wordsA = normalizeTitle(article.title);
  article._sourceCount = allArticles.filter(a =>
    a.category === article.category &&
    jaccardSimilarity(wordsA, normalizeTitle(a.title)) > 0.5
  ).length;
  if (article._sourceCount > 1) {
    console.log(`  [velocity] "${article.title.slice(0, 55)}" — ${article._sourceCount} sources`);
  }
}

// Score and sort — trending articles bubble to top
const MIN_SCORE = 2;
const scored = deduped.map(a => ({ ...a, _score: scoreArticle(a) }));
const aboveThreshold = scored.filter(a => a._score >= MIN_SCORE);
const pool = (aboveThreshold.length > 0 ? aboveThreshold : scored).sort((a, b) => b._score - a._score);

if (aboveThreshold.length === 0) {
  console.log(`[pipeline] No articles above score threshold (${MIN_SCORE}), using top scored as fallback`);
}

// Category reserve: top 1 per category guaranteed, then fill with global top scorers
const categories = ['games', 'film', 'tv', 'books'];
const reserved = categories.map(cat => pool.find(a => a.category === cat)).filter(Boolean);
const reservedLinks = new Set(reserved.map(a => a.link));
const globalTop = pool.filter(a => !reservedLinks.has(a.link)).slice(0, 2);
const candidatePool = [...reserved, ...globalTop].sort((a, b) => b._score - a._score);
const dist = candidatePool.map(a => `${a.category}:${a._score}`).join(' ');
console.log(`[pipeline] Candidate pool: ${candidatePool.length} articles (${dist}), target: ${MAX_TOTAL}`);
runLog.totalFetched = allArticles.length;
runLog.totalCandidates = candidatePool.length;

let saved = 0;
let quotaExhausted = false;
for (const article of candidatePool) {
  if (saved >= MAX_TOTAL) break;
  if (quotaExhausted) break;
  try {
    // Image fallback chain: RSS → og:image → TMDB/IGDB/OpenLibrary → Wikipedia
    if (!article.image_url) {
      article.image_url = await scrapeOgImage(article.link);
    }
    if (!article.image_url && (article.category === 'film' || article.category === 'tv') && TMDB_TOKEN) {
      article.image_url = await searchTmdbImage(article.title, article.category, TMDB_TOKEN);
    }
    if (!article.image_url && article.category === 'games' && TWITCH_CLIENT_ID) {
      article.image_url = await searchIgdbImage(article.title, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);
    }
    if (!article.image_url && article.category === 'books') {
      article.image_url = await searchOpenLibraryImage(article.title);
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
      if (geminiErr.message.includes('429')) {
        console.warn(`  [quota] Gemini quota exhausted — stopping pipeline early`);
        quotaExhausted = true;
        runLog.quotaExhausted = true;
        break;
      }
      // Rule 5: RSS teaser without Gemini expansion = useless, skip
      if (article.content.length < 600 || isTruncated(article.content)) {
        console.warn(`  [skip] ${article.title.slice(0, 50)} — Gemini failed + RSS too short/truncated`);
        runLog.rejected.push({ title: article.title, category: article.category, source: article.source_name, score: scoreArticle(article), reason: 'gemini_fail_short' });
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
      runLog.rejected.push({ title: article.title, category: article.category, source: article.source_name, score: scoreArticle(article), reason: 'quality_gate', errors: qc.errors });
      continue;
    }
    console.log(`  [quality-gate] ✓ passed`);

    // Rule 9 — Hallucination guard
    const enBody = ai.translations?.en?.body ?? '';
    if (!titleEntityPresent(article.title, enBody)) {
      console.warn(`  [hallucination-guard] title keywords missing from body — skip`);
      console.warn(`    title: "${article.title.slice(0, 65)}"`);
      runLog.rejected.push({ title: article.title, category: article.category, source: article.source_name, score: scoreArticle(article), reason: 'hallucination_guard' });
      continue;
    }

    const slug = slugify(article.title);
    const id = createHash('md5').update(article.link).digest('hex').slice(0, 8);
    const filename = `${id}-${slug}`;

    const json = {
      id: filename,
      slug: filename,
      category: article.category,
      author: 'WeCult Editorial',
      source_name: article.source_name,
      source_url: article.link,
      original_title: article.title,
      published_at: new Date(article.pubDate).toISOString(),
      fetched_at: new Date().toISOString(),
      summary_en: ai.summary_en,
      ai_analysis: ai.ai_analysis,
      story_type: ai.story_type || 'other',
      translations: ai.translations,
      content_raw: article.content,
      tags: inferTags(article),
      image_url: article.image_url || '',
      trending_score: scoreArticle(article),
    };

    writeFileSync(`${ARTICLES_DIR}/${filename}.json`, JSON.stringify(json, null, 2));
    seen.add(article.link);
    saved++;
    runLog.written.push({ title: article.title, category: article.category, source: article.source_name, score: scoreArticle(article), slug: filename });
    console.log(`  ✓ ${article.title.slice(0, 60)}`);

    // Rate limit: 5 RPM (2.5-flash-lite free tier) → min 12s between calls
    await sleep(15000);
  } catch (err) {
    console.warn(`  [skip] ${article.title.slice(0, 50)}: ${err.message}`);
    runLog.rejected.push({ title: article.title, category: article.category, source: article.source_name, score: scoreArticle(article), reason: 'error', error: err.message?.slice(0, 100) });
  }
}

// Persist seen URLs (keep last 2000)
const seenArr = [...seen].slice(-2000);
writeFileSync(SEEN_FILE, JSON.stringify(seenArr, null, 2));

// Write pipeline run log
runLog.articlesWritten = saved;
runLog.quotaExhausted = quotaExhausted;
runLog.status = quotaExhausted ? 'quota' : saved > 0 ? 'success' : 'filtered';

// Açıklama: neden makale yazılmadı
if (saved === 0 && !quotaExhausted) {
  if (allArticles.length === 0) {
    runLog.filterNote = 'RSS kaynaklarında yeni içerik bulunamadı';
  } else if (candidatePool.length === 0) {
    runLog.filterNote = `${allArticles.length} RSS içeriği bulundu ancak tümü daha önce görülmüş veya çok eski`;
  } else if (runLog.rejected.length > 0) {
    runLog.filterNote = `${candidatePool.length} aday işlendi, tümü kalite/hallüsinasyon kontrolünden geçemedi`;
  } else {
    runLog.filterNote = `${allArticles.length} RSS içeriği bulundu, ${candidatePool.length} aday değerlendirildi`;
  }
}

let existingLog = { totalArticles: 0, runs: [] };
try {
  if (existsSync(LOG_FILE)) existingLog = JSON.parse(readFileSync(LOG_FILE, 'utf8'));
} catch {}
existingLog.totalArticles = (existingLog.totalArticles || 0) + saved;
existingLog.lastUpdated = runLog.timestamp;
existingLog.runs = [runLog, ...(existingLog.runs || [])].slice(0, 72);
writeFileSync(LOG_FILE, JSON.stringify(existingLog, null, 2));
console.log(`[pipeline] Log written to ${LOG_FILE}`);

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

