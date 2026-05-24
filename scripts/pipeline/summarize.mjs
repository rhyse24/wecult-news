const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function summarizeArticle(article, apiKey, webContext = '') {
  const categoryVoice = {
    games: 'a passionate gaming journalist writing for hardcore and casual gamers alike',
    film:  'an enthusiastic film critic writing for cinephiles and casual moviegoers',
    tv:    'an engaging TV writer writing for binge-watchers and series fans',
    books: 'a literary journalist writing for avid readers and book lovers',
  };
  const voice = categoryVoice[article.category] || 'an entertainment journalist';

  // ── Step 1: Generate English article ──────────────────────────────
  const enPrompt = `You are ${voice} at WeCult — a premium entertainment platform.

CRITICAL: Return ONLY a single valid JSON object. No markdown, no code blocks, no extra text before or after.

Article title: ${article.title}
Source: ${article.source_name}
RSS content: ${article.content.slice(0, 2000)}
${webContext ? `\nWeb research:\n${webContext.slice(0, 1500)}` : ''}

Write a structured English article. The body MUST use \\n\\n between blocks:
Hook paragraph\\n\\n## Why This Matters\\n\\nParagraph\\n\\n## The Full Story\\n\\nParagraph 1\\n\\nParagraph 2\\n\\n## What Fans Are Saying\\n\\nParagraph\\n\\n> Pull quote\\n\\n## What's Next\\n\\nClosing paragraph

Return this JSON (nothing else):
{"summary_en":"2-sentence English hook","ai_analysis":"1-sentence insight for fans","title":"Reworded engaging title","summary":"2-sentence English hook","body":"[full structured article in English, min 500 words]"}`;

  let enData = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: enPrompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn(`  [gemini-en attempt ${attempt}] ${res.status}: ${err.slice(0, 120)}`);
        if (attempt < 2) { await sleep(8000); continue; }
        throw new Error(`Gemini ${res.status}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/,'').trim();

      const parsed = JSON.parse(cleaned);
      if (!parsed?.body || parsed.body.length < 300) {
        console.warn(`  [gemini-en attempt ${attempt}] body too short (${parsed?.body?.length ?? 0} chars)`);
        if (attempt < 2) { await sleep(8000); continue; }
        throw new Error('EN body too short');
      }
      enData = parsed;
      break;
    } catch (err) {
      console.warn(`  [gemini-en attempt ${attempt}] ${err.message}`);
      if (attempt < 2) { await sleep(8000); continue; }
      throw err;
    }
  }

  // ── Step 2: Translate to Turkish ──────────────────────────────────
  await sleep(5000);
  const trData = await translateToTurkish(enData, apiKey);

  return {
    summary_en: enData.summary_en || enData.summary,
    ai_analysis: enData.ai_analysis,
    translations: {
      en: {
        title:   enData.title,
        summary: enData.summary,
        body:    enData.body,
      },
      tr: trData,
    },
  };
}

async function translateToTurkish(enData, apiKey) {
  const trPrompt = `Translate this entertainment article to Turkish (Türkçe).

CRITICAL: ALL output fields MUST be in Turkish. Return ONLY a valid JSON object. No markdown.

English title: ${enData.title}
English summary: ${enData.summary}
English body:
${enData.body.slice(0, 2500)}

Translate everything to Turkish. Keep the same ## section structure in the body but translate the headings too.

Return this JSON (all values must be in Turkish, NOT English):
{"title":"[Türkçe başlık]","summary":"[Türkçe 2 cümle özet]","body":"[Türkçe makale, minimum 400 kelime, ## başlıkları Türkçe olmalı]"}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: trPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn(`  [gemini-tr attempt ${attempt}] ${res.status}: ${err.slice(0, 120)}`);
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/,'').trim();

      const parsed = JSON.parse(cleaned);
      if (!parsed?.body || parsed.body.length < 200) {
        console.warn(`  [gemini-tr attempt ${attempt}] body too short`);
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }

      // Validate: TR must differ from EN (Gemini sometimes just copies EN)
      if (parsed.title === enData.title || parsed.body.slice(0, 100) === enData.body.slice(0, 100)) {
        console.warn(`  [gemini-tr attempt ${attempt}] TR same as EN — retrying`);
        if (attempt < 2) { await sleep(8000); continue; }
        return null;
      }

      return parsed;
    } catch (err) {
      console.warn(`  [gemini-tr attempt ${attempt}] ${err.message}`);
      if (attempt < 2) { await sleep(8000); continue; }
      return null;
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
