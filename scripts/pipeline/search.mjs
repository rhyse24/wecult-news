const TAVILY_URL = 'https://api.tavily.com/search';

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
