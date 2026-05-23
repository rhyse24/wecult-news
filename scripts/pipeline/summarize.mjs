const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Call Gemini Flash to rewrite an article in WeCult's editorial voice.
 * Returns { summary_en, ai_analysis, translations: { en, tr, es, pt, ja } }
 */
export async function summarizeArticle(article, apiKey, webContext = '') {
  const categoryVoice = {
    games: 'a passionate gaming journalist writing for hardcore and casual gamers alike',
    film:  'an enthusiastic film critic writing for cinephiles and casual moviegoers',
    tv:    'an engaging TV writer writing for binge-watchers and series fans',
    books: 'a literary journalist writing for avid readers and book lovers',
  };
  const voice = categoryVoice[article.category] || 'an entertainment journalist';

  const prompt = `You are ${voice} working for WeCult — a premium dark-themed entertainment platform.

Your job is to REWRITE the article below in WeCult's editorial style.
IMPORTANT: Always write a MINIMUM of 500 words for the body. If the source content is brief, expand using your knowledge of the topic, the franchise, the industry context, and what fans care about. Never produce a short stub.

Rules:
- Hook the reader in the first sentence (don't start with the source name or "According to")
- Write like you're talking directly to a fan, not reporting for a newspaper
- Keep it punchy, specific, and opinionated — avoid generic filler phrases
- Highlight what actually matters to the audience (impact, excitement, controversy)
- If source content is thin, add background context, fan expectations, industry analysis
- The body must always be a full, satisfying article read — never a stub

Article title: ${article.title}
Source: ${article.source_name}
Category: ${article.category}
RSS content: ${article.content}
${webContext ? `\nAdditional web research:\n${webContext}` : ''}

Return ONLY valid JSON (no markdown, no code block):
{
  "summary_en": "One punchy hook sentence that makes you want to read more",
  "ai_analysis": "One sharp insight: why this matters to fans right now",
  "translations": {
    "en": {
      "title": "Engaging English title (can be slightly reworded for impact)",
      "summary": "One punchy hook sentence in English",
      "body": "600-800 word editorial article in English. 6-8 paragraphs separated by \\n\\n. Structure: hook paragraph → background/context → main story details → fan/community reaction or implications → analysis of what this means → forward-looking conclusion. Write like Polygon or IGN features — engaging, specific, no fluff."
    },
    "tr": {
      "title": "Türkçe başlık",
      "summary": "Türkçe tek cümle hook",
      "body": "600-800 kelime Türkçe makale. 6-8 paragraf, her biri \\n\\n ile ayrılmış. Türk okuyucuya doğrudan hitap eden samimi editorial ton."
    },
    "es": {
      "title": "Título en español",
      "summary": "Un gancho en español",
      "body": "Artículo editorial de 600-800 palabras en español. 6-8 párrafos separados por \\n\\n."
    },
    "pt": {
      "title": "Título em português",
      "summary": "Um gancho em português",
      "body": "Artigo editorial de 600-800 palavras em português. 6-8 parágrafos separados por \\n\\n."
    },
    "ja": {
      "title": "日本語タイトル",
      "summary": "日本語のフック文",
      "body": "600〜800語の日本語記事。6〜8段落、\\n\\nで区切り。"
    }
  }
}`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn('[summarize] JSON parse failed, using fallback');
    const snippet = article.content.slice(0, 500);
    return {
      summary_en: snippet,
      ai_analysis: '',
      translations: {
        en: { title: article.title, summary: snippet, body: article.content },
        tr: { title: article.title, summary: snippet, body: article.content },
        es: { title: article.title, summary: snippet, body: article.content },
        pt: { title: article.title, summary: snippet, body: article.content },
        ja: { title: article.title, summary: snippet, body: article.content },
      },
    };
  }
}
