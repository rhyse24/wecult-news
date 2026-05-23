const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function summarizeArticle(article, apiKey, webContext = '') {
  const categoryVoice = {
    games: 'a passionate gaming journalist writing for hardcore and casual gamers alike',
    film:  'an enthusiastic film critic writing for cinephiles and casual moviegoers',
    tv:    'an engaging TV writer writing for binge-watchers and series fans',
    books: 'a literary journalist writing for avid readers and book lovers',
  };
  const voice = categoryVoice[article.category] || 'an entertainment journalist';

  const prompt = `You are ${voice} at WeCult — a premium entertainment platform.

CRITICAL: Return ONLY a single valid JSON object. No markdown, no code blocks, no extra text before or after.

Article title: ${article.title}
Source: ${article.source_name}
RSS content: ${article.content.slice(0, 2000)}
${webContext ? `\nWeb research:\n${webContext.slice(0, 1500)}` : ''}

Write a structured article. The body MUST use \\n\\n between blocks and follow this format:
Hook paragraph (2-3 engaging sentences)\\n\\n## Why This Matters\\n\\nParagraph\\n\\n## The Full Story\\n\\nParagraph 1\\n\\nParagraph 2\\n\\n## What Fans Are Saying\\n\\nParagraph\\n\\n> Memorable pull quote\\n\\n## What's Next\\n\\nClosing paragraph

Return this JSON (nothing else):
{"summary_en":"2-sentence English hook","ai_analysis":"1-sentence insight for fans","translations":{"en":{"title":"Reworded engaging title","summary":"2-sentence English hook","body":"[full structured article in English, min 700 words]"},"tr":{"title":"Türkçe başlık","summary":"Türkçe 2 cümle hook","body":"[full structured article in Turkish, min 700 words]"}}}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 3500 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn(`  [gemini attempt ${attempt}] ${res.status}: ${err.slice(0, 120)}`);
        if (attempt < 2) { await sleep(8000); continue; }
        throw new Error(`Gemini ${res.status}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/,'').trim();

      try {
        const parsed = JSON.parse(cleaned);
        // Validate — must have EN body with real content
        if (!parsed?.translations?.en?.body || parsed.translations.en.body.length < 300) {
          console.warn(`  [gemini attempt ${attempt}] body too short (${parsed?.translations?.en?.body?.length ?? 0} chars)`);
          if (attempt < 2) { await sleep(8000); continue; }
          throw new Error('Body too short');
        }
        return parsed;
      } catch (parseErr) {
        console.warn(`  [gemini attempt ${attempt}] JSON parse failed: ${parseErr.message}`);
        console.warn(`  Response preview: ${cleaned.slice(0, 200)}`);
        if (attempt < 2) { await sleep(8000); continue; }
        throw parseErr;
      }
    } catch (err) {
      if (attempt < 2) { await sleep(8000); continue; }
      throw err;
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
