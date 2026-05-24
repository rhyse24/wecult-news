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
  return /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(url) || url.includes('upload.wikimedia');
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
