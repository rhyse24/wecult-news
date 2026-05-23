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
IMPORTANT: Always write a MINIMUM of 900 words for the body (target 5-minute read). If the source content is brief, expand using your knowledge: franchise history, fan community context, industry implications, comparisons to similar titles/films/shows, what this means for the future. Never produce a short stub — always fill the full depth.

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
      "summary": "One punchy 2-sentence hook that makes you want to read the full article",
      "body": "900-1200 word editorial article in English. 8-10 paragraphs separated by \\n\\n. Structure: hook → background & franchise history → main news details → community/fan reaction → deeper analysis → industry context → what this means for the future → conclusion. Write like a long-form Polygon or Eurogamer feature — engaging, specific, rich with context, no fluff."
    },
    "tr": {
      "title": "Türkçe başlık",
      "summary": "İki cümlelik Türkçe hook",
      "body": "900-1200 kelime Türkçe makale. 8-10 paragraf, her biri \\n\\n ile ayrılmış. Türk okuyucuya doğrudan hitap eden, franchise geçmişi ve fan tepkileriyle zenginleştirilmiş editorial ton."
    },
    "es": {
      "title": "Título en español",
      "summary": "Dos frases gancho en español",
      "body": "Artículo editorial de 900-1200 palabras en español. 8-10 párrafos separados por \\n\\n. Con historia del tema, reacción de fans y análisis profundo."
    },
    "pt": {
      "title": "Título em português",
      "summary": "Duas frases gancho em português",
      "body": "Artigo editorial de 900-1200 palavras em português. 8-10 parágrafos separados por \\n\\n."
    },
    "ja": {
      "title": "日本語タイトル",
      "summary": "2文の日本語フック",
      "body": "900〜1200語の日本語記事。8〜10段落、\\n\\nで区切り。背景、ファンの反応、業界分析を含む。"
    }
  }
}`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 5000 },
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
