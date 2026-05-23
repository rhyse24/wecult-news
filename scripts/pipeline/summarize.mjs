const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Call Gemini Flash to summarize an article and generate 5-language translations.
 * Returns { summary_en, ai_analysis, translations: { en, tr, es, pt, ja } }
 */
export async function summarizeArticle(article, apiKey) {
  const prompt = `You are a news editor for WeCult, an entertainment platform covering games, film, TV, and books.

Article title: ${article.title}
Source: ${article.source_name}
Category: ${article.category}
Content: ${article.content}

Return ONLY valid JSON (no markdown, no code block) with this exact structure:
{
  "summary_en": "2-3 sentence English summary",
  "ai_analysis": "1 sentence insight or why this matters to fans",
  "translations": {
    "en": { "title": "English title", "summary": "2-3 sentence summary" },
    "tr": { "title": "Turkish title", "summary": "2-3 sentence summary in Turkish" },
    "es": { "title": "Spanish title", "summary": "2-3 sentence summary in Spanish" },
    "pt": { "title": "Portuguese title", "summary": "2-3 sentence summary in Portuguese" },
    "ja": { "title": "Japanese title", "summary": "2-3 sentence summary in Japanese" }
  }
}`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Strip markdown code blocks if Gemini wraps in ```json
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn('[summarize] JSON parse failed, using fallback');
    return {
      summary_en: article.content.slice(0, 200),
      ai_analysis: '',
      translations: {
        en: { title: article.title, summary: article.content.slice(0, 200) },
        tr: { title: article.title, summary: article.content.slice(0, 200) },
        es: { title: article.title, summary: article.content.slice(0, 200) },
        pt: { title: article.title, summary: article.content.slice(0, 200) },
        ja: { title: article.title, summary: article.content.slice(0, 200) },
      },
    };
  }
}
