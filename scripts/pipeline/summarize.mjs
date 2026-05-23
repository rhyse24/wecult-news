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
      "body": "900-1200 word structured editorial article in English. Use this EXACT format with \\n\\n between every block:\\n\\nHook paragraph (2-3 sentences, grabs attention immediately)\\n\\n## Why This Matters\\n\\n1-2 paragraphs on why this news is significant to fans\\n\\n## The Full Story\\n\\n2-3 paragraphs with all the details, background, franchise history\\n\\n## What the Community Is Saying\\n\\n1-2 paragraphs on fan reaction, community response, social buzz\\n\\n> A powerful pull quote — one memorable sentence from the story or your analysis\\n\\n## The Bigger Picture\\n\\n1-2 paragraphs on industry context and implications\\n\\n## What's Next\\n\\n1 paragraph forward-looking conclusion. Write like a long-form Polygon or Eurogamer feature — engaging, opinionated, rich with context."
    },
    "tr": {
      "title": "Türkçe başlık",
      "summary": "İki cümlelik Türkçe hook",
      "body": "900-1200 kelime yapılandırılmış Türkçe makale. Her blok arasında \\n\\n kullan:\\n\\nHook paragrafı\\n\\n## Neden Önemli\\n\\n1-2 paragraf\\n\\n## Tüm Hikaye\\n\\n2-3 paragraf\\n\\n## Topluluk Ne Diyor\\n\\n1-2 paragraf\\n\\n> Güçlü bir alıntı cümlesi\\n\\n## Büyük Resim\\n\\n1-2 paragraf\\n\\n## Sırada Ne Var\\n\\n1 paragraf sonuç"
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
