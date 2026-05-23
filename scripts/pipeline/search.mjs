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
  // Strip common prefixes
  title = title.replace(/^(Review:|Preview:|How to|Guide:|Opinion:|Feature:|Watch:)\s*/i, '');
  // Extract quoted title if present (e.g. 'Kingdom Come: Deliverance 3' Confirmed)
  const quoted = title.match(/['"]([^'"]{4,})['"]/);
  if (quoted) return quoted[1];
  // Otherwise first 4 words
  return title.split(/\s+/).slice(0, 4).join(' ');
}

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(url) || url.includes('upload.wikimedia');
}

/**
 * Search the web for additional context on an article topic.
 * Returns a combined string of search results to feed into Gemini.
 */
export async function searchContext(article, apiKey) {
  const query = `${article.title} ${article.category === 'games' ? 'game' : article.category}`;

  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`  [tavily] ${res.status} for "${query.slice(0, 50)}"`);
      return '';
    }

    const data = await res.json();
    const parts = [];

    if (data.answer) parts.push(`Web summary: ${data.answer}`);

    for (const r of (data.results ?? []).slice(0, 4)) {
      if (r.content) parts.push(`[${r.title}]: ${r.content.slice(0, 400)}`);
    }

    return parts.join('\n\n');
  } catch (err) {
    console.warn(`  [tavily] failed: ${err.message.slice(0, 60)}`);
    return '';
  }
}
