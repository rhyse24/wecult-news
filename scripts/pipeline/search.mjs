const TAVILY_URL = 'https://api.tavily.com/search';

/**
 * Search Wikipedia for an inline image related to the article subject.
 * No API key required — completely free.
 */
export async function searchInlineImage(article) {
  const subject = extractSubject(article.title, article.category);
  try {
    // Step 1: OpenSearch to find the best matching Wikipedia page
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(subject)}&limit=1&format=json&origin=*`,
      { headers: { 'User-Agent': 'WeCultNews/1.0 (+https://wecult.app/news)' }, signal: AbortSignal.timeout(6000) }
    );
    if (!searchRes.ok) return '';
    const searchData = await searchRes.json();
    const pageTitle = searchData[1]?.[0];
    if (!pageTitle) return '';

    // Step 2: Get page summary with thumbnail
    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`,
      { headers: { 'User-Agent': 'WeCultNews/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (!summaryRes.ok) return '';
    const summary = await summaryRes.json();

    // Prefer original image over thumbnail for better quality
    const img = summary.originalimage?.source || summary.thumbnail?.source || '';
    if (img && isImageUrl(img)) {
      console.log(`    [wiki-image] "${pageTitle}" → found`);
      return img;
    }
    return '';
  } catch {
    return '';
  }
}

function extractSubject(title, category) {
  title = title.replace(/^(Review:|Preview:|How to|Guide:|Opinion:|Feature:|Watch:|Analysis:)\s*/i, '');
  // Quoted title is most reliable: 'Kingdom Come: Deliverance' Confirmed...
  const quoted = title.match(/['""]([^'""]{4,40})['""]/)
  if (quoted) return quoted[1];
  // Stop before action verbs to isolate the subject name
  const stopWords = /^(dev|developer|devs|studio|confirms?|says|reveals?|announces?|review|gets|is|are|has|will|could|might|new|next|first|last|best|star|stars|actor|director|writer|creator|cast|team|sequel|prequel|reboot|remake|season|episode|trailer|teaser)$/i;
  const words = title.split(/\s+/);
  const subject = [];
  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z0-9:'-]/g, '');
    if (stopWords.test(clean) && subject.length >= 2) break;
    subject.push(clean);
    if (subject.length >= 5) break;
  }
  return subject.join(' ');
}

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.length < 10) return false;
  // Reject tracking pixels, icons, logos, avatars, ads
  if (/\b(pixel|tracker|beacon|favicon|icon|logo|avatar|placeholder|blank|spacer|1x1|ad[_-]?\d)/i.test(url)) return false;
  return /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(url) || url.includes('upload.wikimedia');
}

/**
 * Search TMDB for a poster image — film and TV categories.
 * Uses the v4 read-access Bearer token (read-only, safe for server use).
 */
export async function searchTmdbImage(title, category, bearerToken) {
  if (!bearerToken) return '';
  const endpoint = category === 'tv' ? 'tv' : 'movie';
  const query = encodeURIComponent(
    title.replace(/^(Review:|Preview:|Opinion:)\s*/i, '').replace(/\s*[\|–—]\s*.+$/, '').trim().slice(0, 80)
  );
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/${endpoint}?query=${query}&page=1`, {
      headers: { Authorization: `Bearer ${bearerToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const data = await res.json();
    const poster = data.results?.[0]?.poster_path;
    if (poster) {
      console.log(`    [tmdb-image] found poster for "${title.slice(0, 45)}"`);
      return `https://image.tmdb.org/t/p/w780${poster}`;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Search IGDB for a game cover image.
 * Fetches a short-lived OAuth token from Twitch on each call.
 */
export async function searchIgdbImage(title, clientId, clientSecret) {
  if (!clientId || !clientSecret) return '';
  try {
    // Step 1: Get Twitch OAuth token
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: 'POST', signal: AbortSignal.timeout(8000) }
    );
    if (!tokenRes.ok) return '';
    const { access_token } = await tokenRes.json();
    if (!access_token) return '';

    // Step 2: Search IGDB for the game
    const cleanTitle = title.replace(/^(Review:|Preview:)\s*/i, '').trim().slice(0, 60);
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'text/plain',
      },
      body: `search "${cleanTitle}"; fields name,cover.image_id; limit 1;`,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const games = await res.json();
    const imageId = games[0]?.cover?.image_id;
    if (imageId) {
      console.log(`    [igdb-image] found cover for "${title.slice(0, 45)}"`);
      return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Scrape og:image from the original article URL when RSS doesn't provide one.
 * No API key required — direct HTTP fetch.
 */
export async function scrapeOgImage(url) {
  if (!url) return '';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WeCultNews/1.0 (+https://wecult.app/news)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const candidates = [
      html.match(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i)?.[1],
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i)?.[1],
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1],
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1],
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1],
    ];
    const imgUrl = candidates.find(u => u && isImageUrl(u.trim()))?.trim() || '';
    if (!imgUrl) return '';

    // Skip images from CDNs that block cross-origin proxying (hotlink protection).
    // These would work in a browser with the right Referer but fail via wsrv.nl.
    if (isHotlinkProtected(imgUrl)) {
      console.log(`    [og-image] skipped — hotlink-protected domain`);
      return '';
    }

    console.log(`    [og-image] scraped from source`);
    return imgUrl;
  } catch {
    return '';
  }
}

function isHotlinkProtected(url) {
  const hotlinkDomains = [
    'variety.com', 'hollywoodreporter.com', 'deadline.com', 'thewrap.com',
    'indiewire.com', 'screendaily.com', 'empireonline.com', 'totalfilm.com',
    'ign.com', 'gamespot.com', 'polygon.com', 'eurogamer.net', 'rockpapershotgun.com',
    'pcgamer.com', 'kotaku.com', 'gamesradar.com', 'vg247.com',
    'theguardian.com', 'nytimes.com', 'washingtonpost.com', 'forbes.com',
    'rollingstone.com', 'vulture.com', 'slashfilm.com', 'collider.com',
    'screenrant.com', 'cbr.com', 'comingsoon.net',
  ];
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return hotlinkDomains.some(d => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Search Open Library for a book cover image — books category only.
 * Free API, no key required.
 */
export async function searchOpenLibraryImage(title) {
  try {
    const query = encodeURIComponent(title.replace(/^(Review:|Preview:)\s*/i, '').trim().slice(0, 80));
    const res = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=1&fields=cover_i`, {
      headers: { 'User-Agent': 'WeCultNews/1.0 (+https://wecult.app/news)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const data = await res.json();
    const coverId = data.docs?.[0]?.cover_i;
    if (coverId) {
      console.log(`    [openlibrary-image] found cover for "${title.slice(0, 45)}"`);
      return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Search the web for additional context on an article topic.
 * Returns a combined string of search results to feed into Gemini.
 */
export async function searchContext(article, apiKey) {
  // Build a precise query: strip clickbait phrases, add category context and year
  const cleanTitle = article.title
    .replace(/^(Review:|Preview:|Opinion:|Feature:|Guide:|Watch:)\s*/i, '')
    .replace(/\s*[\|–—]\s*.+$/, '') // remove source suffix after | or —
    .trim()
    .slice(0, 100);

  const categoryTerms = {
    games: 'video game',
    film: 'film movie',
    tv: 'TV series show',
    books: 'book author',
  }[article.category] ?? '';

  const query = `${cleanTitle} ${categoryTerms} 2026`.trim();

  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 6,
        include_answer: true,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      console.warn(`  [tavily] ${res.status} for "${query.slice(0, 60)}"`);
      return '';
    }

    const data = await res.json();
    const parts = [];

    // Tavily's own AI answer — put first as the most distilled context
    if (data.answer) {
      parts.push(`TOPIC SUMMARY (from web research):\n${data.answer}`);
    }

    // Individual search results — keep good snippets, skip empty ones
    const results = (data.results ?? []).slice(0, 5);
    for (const r of results) {
      if (!r.content || r.content.length < 80) continue;
      const snippet = r.content.slice(0, 500).replace(/\s+/g, ' ').trim();
      parts.push(`SOURCE: ${r.title}\n${snippet}`);
    }

    return parts.join('\n\n---\n\n');
  } catch (err) {
    console.warn(`  [tavily] failed: ${err.message.slice(0, 60)}`);
    return '';
  }
}
