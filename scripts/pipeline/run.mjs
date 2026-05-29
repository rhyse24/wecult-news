#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { fetchFeed } from './fetch.mjs';
import { summarizeArticle, validateArticle, isTruncated, titleEntityPresent, isListArticle } from './summarize.mjs';
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

// Capitalized "named" words (entities: movie/show/game titles, people)
function namedWords(title) {
  return new Set(
    title.split(/\s+/)
      .filter(w => /^[A-Z]/.test(w) && w.replace(/[^a-z]/gi,'').length > 3)
      .map(w => w.toLowerCase().replace(/[^a-z0-9]/g,''))
  );
}

function isSameStory(titleA, titleB) {
  const wA = normalizeTitle(titleA);
  const wB = normalizeTitle(titleB);
  if (jaccardSimilarity(wA, wB) > 0.50) return true;
  // Entity overlap: 2+ shared named words = same story
  const nA = namedWords(titleA);
  const nB = namedWords(titleB);
  const sharedEntities = [...nA].filter(w => nB.has(w));
  return sharedEntities.length >= 2;
}

function deduplicateByTitle(articles) {
  const kept = [];
  for (const article of articles) {
    const isDup = kept.some(b => {
      if (b.category !== article.category) return false;
      const dateA = new Date(article.pubDate);
      const dateB = new Date(b.pubDate);
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return false;
      const timeDiff = Math.abs(dateA - dateB);
      if (timeDiff > 24 * 3600000) return false;
      return isSameStory(article.title, b.title);
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
const GROQ_API_KEY   = process.env.GROQ_API_KEY || '';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TMDB_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN || '';
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY env var required');
  process.exit(1);
}
if (GROQ_API_KEY) {
  console.log('[pipeline] Groq key found — TR/ES translations via Groq (Llama 3.3 70B)');
} else {
  console.warn('[pipeline] No GROQ_API_KEY — TR/ES will use Gemini (quota risk)');
}

const ARTICLES_DIR = 'src/content/articles';
const SEEN_FILE = 'scripts/pipeline/.seen-urls.json';
const ROTATION_FILE = 'scripts/pipeline/.rotation-index.json';
const LOG_FILE = 'public/pipeline-log.json';
const MAX_ARTICLE_AGE_HOURS = 48;

// Category rotation: film×4, tv×4, games×3, books×1 per 12-run cycle
const ROTATION = ['games','film','tv','books','film','games','tv','film','games','tv','film','tv'];
const rotationIndex = existsSync(ROTATION_FILE) ? JSON.parse(readFileSync(ROTATION_FILE, 'utf8')).index ?? 0 : 0;
const targetCategory = ROTATION[rotationIndex % ROTATION.length];
const nextIndex = (rotationIndex + 1) % ROTATION.length;
console.log(`[pipeline] Rotation index ${rotationIndex} → category: ${targetCategory} (next: ${ROTATION[nextIndex]})`);

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
pruneOldImages();

// Load titles of articles written in the last 48h for cross-run topic dedup
const recentTitles = [];
try {
  const cutoff = Date.now() - 48 * 3600000;
  for (const file of readdirSync(ARTICLES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(`${ARTICLES_DIR}/${file}`, 'utf8'));
    if (new Date(data.published_at).getTime() > cutoff) {
      recentTitles.push({ title: data.original_title || data.translations?.en?.title || '', category: data.category });
    }
  }
} catch { /* empty dir on first run */ }
console.log(`[pipeline] Cross-run dedup: ${recentTitles.length} recent articles loaded`);

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

// Franchise/IP önemi — A-tier büyük kültürel IP'ler, B-tier yerleşik markalar
const FRANCHISE_A = new Set([
  // Games
  'grand theft auto','gta vi','gta 6','call of duty','minecraft','fortnite','zelda','pokemon',
  'god of war','last of us','cyberpunk','elden ring','dark souls','halo','resident evil',
  'final fantasy','assassin\'s creed','red dead','diablo','overwatch','baldur\'s gate',
  'elder scrolls','skyrim','fallout','league of legends','valorant','apex legends',
  'starfield','dragon age','mass effect','metroid','mario','donkey kong','kirby',
  'street fighter','mortal kombat','tekken','metal gear',
  // Film
  'marvel','mcu','spider-man','spiderman','batman','superman','star wars','disney','pixar',
  'avatar','dune','mission impossible','james bond','007','john wick','avengers','x-men',
  'deadpool','indiana jones','jurassic','transformers','lord of the rings','hobbit',
  'fast and furious','godzilla','king kong','alien','predator','terminator',
  // TV
  'game of thrones','house of the dragon','stranger things','breaking bad','succession',
  'the bear','wednesday addams','the boys','squid game','andor','mandalorian',
  'yellowstone','peaky blinders','the crown','ozark','euphoria','white lotus',
  'severance','ted lasso','abbott elementary','last of us',
  // Books
  'harry potter','hunger games','twilight','percy jackson','wheel of time','witcher',
]);

const FRANCHISE_B = new Set([
  'netflix original','hbo max','apple tv+','amazon prime','paramount+','disney+',
  'playstation','xbox','nintendo switch','steam deck','epic games',
  'activision','ubisoft','ea sports','rockstar','bethesda','naughty dog',
  'christopher nolan','spielberg','tarantino','scorsese','villeneuve',
  'a24','blumhouse','legendary','lionsgate',
]);

// TMDB trending bugün — film & TV
let tmdbTrendingTitles = [];
if (TMDB_TOKEN) {
  try {
    const res = await fetch('https://api.themoviedb.org/3/trending/all/day?language=en-US', {
      headers: { 'Authorization': `Bearer ${TMDB_TOKEN}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      tmdbTrendingTitles = (data.results || [])
        .map(r => (r.title || r.name || '').toLowerCase())
        .filter(t => t.length > 2);
      console.log(`[pipeline] TMDB trending today: ${tmdbTrendingTitles.length} titles`);
    }
  } catch {
    console.warn('[pipeline] TMDB trending: fetch failed (non-critical)');
  }
}

// IGDB trending — bugün popüler oyunlar
let igdbTrendingTitles = [];
if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
  try {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST', signal: AbortSignal.timeout(8000) }
    );
    if (tokenRes.ok) {
      const { access_token } = await tokenRes.json();
      const gamesRes = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'text/plain',
        },
        body: 'fields name; sort popularity desc; limit 20; where popularity > 1;',
        signal: AbortSignal.timeout(8000),
      });
      if (gamesRes.ok) {
        const games = await gamesRes.json();
        igdbTrendingTitles = games.map(g => (g.name || '').toLowerCase()).filter(Boolean);
        console.log(`[pipeline] IGDB trending: ${igdbTrendingTitles.length} games`);
      }
    }
  } catch {
    console.warn('[pipeline] IGDB trending: fetch failed (non-critical)');
  }
}

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
  // Franchise/IP importance — büyük kültürel IP'ler öne çıksın
  const fullText = (article.title + ' ' + article.content).toLowerCase();
  for (const ip of FRANCHISE_A) {
    if (fullText.includes(ip)) { score += 5; break; }
  }
  for (const ip of FRANCHISE_B) {
    if (fullText.includes(ip)) { score += 2; break; }
  }
  // TMDB trending today — bugün popüler olan film/dizi
  if (tmdbTrendingTitles.length > 0) {
    for (const tmdbTitle of tmdbTrendingTitles) {
      if (tmdbTitle.length > 3 && titleLower.includes(tmdbTitle)) { score += 5; break; }
    }
  }
  // IGDB trending — bugün popüler oyunlar
  if (igdbTrendingTitles.length > 0) {
    for (const igdbTitle of igdbTrendingTitles) {
      if (igdbTitle.length > 3 && titleLower.includes(igdbTitle)) { score += 5; break; }
    }
  }
  return score;
}

console.log('[pipeline] Fetching RSS feeds (parallel)...');
const feedResults = await Promise.allSettled(
  SOURCES.map(source => fetchFeed(source, MAX_PER_SOURCE).then(items => ({ source, items })))
);

const allArticles = [];
for (const result of feedResults) {
  if (result.status === 'rejected') {
    console.warn(`  [skip] feed error: ${result.reason?.message?.slice(0, 60)}`);
    continue;
  }
  const { source, items } = result.value;
  const fresh = items.filter(a => {
    if (seen.has(a.link)) return false;
    const ageHours = (Date.now() - new Date(a.pubDate).getTime()) / 3600000;
    if (ageHours > MAX_ARTICLE_AGE_HOURS) return false;
    return true;
  });
  console.log(`  ${source.name}: ${fresh.length} new / ${items.length} total`);
  allArticles.push(...fresh);
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

// Category rotation: pick best article from targetCategory, fallback to any category
const rotationPool = pool.filter(a => a.category === targetCategory);
const candidatePool = rotationPool.length > 0 ? rotationPool : pool;
const dist = candidatePool.slice(0, 4).map(a => `${a.category}:${a._score}`).join(' ');
console.log(`[pipeline] Candidate pool: ${candidatePool.length} articles (${dist}), target: ${MAX_TOTAL}`);
runLog.totalFetched = allArticles.length;
runLog.totalCandidates = candidatePool.length;

let saved = 0;
let quotaExhausted = false;
for (const article of candidatePool) {
  if (saved >= MAX_TOTAL) break;
  if (quotaExhausted) break;
  try {
    // Cross-run topic dedup: skip if same topic was already covered in the last 48h
    const topicDup = recentTitles.find(r =>
      r.category === article.category &&
      isSameStory(article.title, r.title)
    );
    if (topicDup) {
      console.log(`  [topic-dedup] skipped "${article.title.slice(0, 55)}" — similar to recent: "${topicDup.title.slice(0, 45)}"`);
      runLog.rejected.push({ title: article.title, category: article.category, source: article.source_name, score: article._score, reason: 'topic_dedup_recent' });
      continue;
    }

    // Image fallback chain: og:image first (most relevant — chosen by the article author),
    // then content-centric CDNs (TMDB/IGDB/Wikipedia) as fallbacks.
    // Hotlink protection is handled by the download step below, not by reordering.
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

    // Download og:images locally — serves from our own domain, no hotlink issues ever.
    // TMDB/IGDB/Wikipedia are already trusted CDNs, skipped automatically.
    const imgId = createHash('md5').update(article.link).digest('hex').slice(0, 8);
    article.image_url = await downloadArticleImage(article.image_url, imgId);

    // Web search for richer context
    let webContext = '';
    if (TAVILY_API_KEY) {
      webContext = await searchContext(article, TAVILY_API_KEY);
      if (webContext) console.log(`    [search] context found (${webContext.length} chars)`);
    }

    const listMode = isListArticle(article.title);
    if (listMode) console.log(`    [list-mode] liste makalesi tespit edildi`);
    let ai;
    try {
      ai = await summarizeArticle(article, GEMINI_API_KEY, webContext, GROQ_API_KEY, listMode);
    } catch (geminiErr) {
      console.warn(`  [gemini-fail] ${geminiErr.message.slice(0, 80)}`);
      if (geminiErr.message.includes('429')) {
        console.warn(`  [quota] Gemini quota exhausted — stopping pipeline early`);
        quotaExhausted = true;
        runLog.quotaExhausted = true;
        break;
      }
      // Without Gemini expansion the RSS teaser is always too short — skip
      console.warn(`  [skip] ${article.title.slice(0, 50)} — Gemini failed`);
      runLog.rejected.push({ title: article.title, category: article.category, source: article.source_name, score: article._score, reason: 'gemini_fail' });
      continue;
    }

    // Rule 8 — Quality Gate: reject articles that fail editorial minimums
    const qc = validateArticle(ai);
    if (!qc.valid) {
      console.warn(`  [quality-gate] ${article.title.slice(0, 50)}`);
      for (const e of qc.errors) console.warn(`    ✗ ${e}`);
      console.warn(`  [skip] article did not meet WeCult editorial standards`);
      runLog.rejected.push({ title: article.title, category: article.category, source: article.source_name, score: article._score, reason: 'quality_gate', errors: qc.errors });
      continue;
    }
    console.log(`  [quality-gate] ✓ passed`);

    // Rule 9 — Hallucination guard
    const enBody = ai.translations?.en?.body ?? '';
    if (!titleEntityPresent(article.title, enBody)) {
      console.warn(`  [hallucination-guard] title keywords missing from body — skip`);
      console.warn(`    title: "${article.title.slice(0, 65)}"`);
      runLog.rejected.push({ title: article.title, category: article.category, source: article.source_name, score: article._score, reason: 'hallucination_guard' });
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
      published_at: new Date().toISOString(),
      source_published_at: new Date(article.pubDate).toISOString(),
      fetched_at: new Date().toISOString(),
      summary_en: ai.summary_en,
      ai_analysis: ai.ai_analysis,
      story_type: ai.story_type || 'other',
      translations: ai.translations,
      content_raw: article.content,
      tags: inferTags(article),
      image_url: article.image_url || '',
      trending_score: article._score ?? scoreArticle(article),
    };

    writeFileSync(`${ARTICLES_DIR}/${filename}.json`, JSON.stringify(json, null, 2));
    seen.add(article.link);
    // Add to recentTitles immediately so later articles in this run are checked against it
    recentTitles.push({ title: article.title, category: article.category });
    saved++;
    runLog.written.push({ title: article.title, category: article.category, source: article.source_name, score: article._score, slug: filename });
    console.log(`  ✓ ${article.title.slice(0, 60)}`);

    // Rate limit: 2 RPM buffer — 30s between articles keeps us well under Gemini RPM limit
    if (saved < MAX_TOTAL) await sleep(30000);
  } catch (err) {
    console.warn(`  [skip] ${article.title.slice(0, 50)}: ${err.message}`);
    runLog.rejected.push({ title: article.title, category: article.category, source: article.source_name, score: article._score, reason: 'error', error: err.message?.slice(0, 100) });
  }
}

// Persist seen URLs (keep last 2000)
const seenArr = [...seen].slice(-2000);
writeFileSync(SEEN_FILE, JSON.stringify(seenArr, null, 2));

// Persist rotation index — only advance when an article was actually written
// (prevents coverage gaps if pipeline saves 0 articles multiple runs in a row)
writeFileSync(ROTATION_FILE, JSON.stringify({ index: saved > 0 ? nextIndex : rotationIndex }, null, 2));

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
  const text = (article.title + ' ' + (article.content || '')).toLowerCase();

  // All keyword groups checked regardless of source category
  const keywords = {
    games:  ['playstation', 'xbox', 'nintendo', 'steam', 'gta', 'zelda', 'indie', 'gaming', 'esports', 'dlc', 'console'],
    film:   ['marvel', 'dc', 'disney', 'box office', 'trailer', 'oscar', 'premiere', 'sequel', 'reboot'],
    tv:     ['hbo', 'streaming', 'season', 'episode', 'renewed', 'cancelled', 'finale', 'spinoff'],
    books:  ['novel', 'fantasy', 'sci-fi', 'author', 'bestseller', 'memoir', 'adaptation'],
  };
  const kwTags = [];
  for (const kwList of Object.values(keywords)) {
    for (const kw of kwList) {
      if (text.includes(kw)) kwTags.push(kw);
    }
  }

  // Named entities from title — capitalized proper nouns (e.g. "Netflix", "Spielberg")
  const STOPWORDS = new Set(['this','that','with','from','they','what','when','where','will','have',
    'been','says','said','just','first','last','next','show','film','game','book','best',
    'more','most','even','after','every','about','there','their','which','series','finally','reveals']);
  const entities = article.title
    .split(/\s+/)
    .filter(w => /^[A-Z]/.test(w) && w.replace(/[^a-zA-Z]/g, '').length > 3)
    .map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(w => !STOPWORDS.has(w));

  // Entities first (specific), then keyword matches; category always included
  return [...new Set([article.category, ...entities, ...kwTags])].slice(0, 6);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Already-local or Unsplash fallback — skip download
function isTrustedCdn(url) {
  if (!url) return false;
  return (
    url.includes('unsplash.com') ||
    url.startsWith('/article-images/')
  );
}

// Remove images for articles older than 90 days to keep repo size under control.
// ~90 days × 15 articles × 100KB ≈ 135MB, well within Vercel's 500MB deploy limit.
function pruneOldImages() {
  const dir = 'public/article-images';
  if (!existsSync(dir)) return;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recentFiles = new Set();
  for (const file of readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const art = JSON.parse(readFileSync(`${ARTICLES_DIR}/${file}`, 'utf8'));
      if (new Date(art.published_at).getTime() > cutoff && art.image_url) {
        const imgFile = art.image_url.split('/').pop();
        if (imgFile) recentFiles.add(imgFile);
      }
    } catch {}
  }
  let pruned = 0;
  for (const file of readdirSync(dir)) {
    if (!recentFiles.has(file)) {
      try { unlinkSync(`${dir}/${file}`); pruned++; } catch {}
    }
  }
  if (pruned > 0) console.log(`[prune] removed ${pruned} old image(s)`);
}

// Download og:image to public/article-images/ so it's served from our own domain.
// Avoids hotlink protection entirely — no wsrv.nl proxy needed for these images.
// Images are resized to 1200px wide (Google Discover min requirement) and converted to AVIF for fast load.
async function downloadArticleImage(imageUrl, articleId) {
  if (!imageUrl || isTrustedCdn(imageUrl)) return imageUrl;
  const dir = 'public/article-images';
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Save as AVIF (30-50% smaller than WebP) — ArticleCard uses <picture> with WebP fallback
  const filename = `${articleId}.avif`;
  const filepath = `${dir}/${filename}`;
  if (existsSync(filepath)) return `/article-images/${filename}`;
  // Also check legacy .webp (already downloaded before AVIF switch)
  const legacyWebp = `${dir}/${articleId}.webp`;
  if (existsSync(legacyWebp)) return `/article-images/${articleId}.webp`;
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'WeCultNews/1.0 (+https://news.wecult.app)' },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 5000) return ''; // too small = error page
    const compressed = await sharp(Buffer.from(buffer))
      .resize({ width: 1200, withoutEnlargement: true })
      .avif({ quality: 72 })
      .toBuffer();
    await writeFile(filepath, compressed);
    console.log(`    [image-dl] ${filename} ${(buffer.byteLength / 1024).toFixed(0)}KB → ${(compressed.byteLength / 1024).toFixed(0)}KB (avif)`);
    return `/article-images/${filename}`;
  } catch {
    return '';
  }
}

