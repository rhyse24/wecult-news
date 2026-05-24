const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function summarizeArticle(article, apiKey, webContext = '') {
  const voice = {
    games: 'a passionate gaming journalist at WeCult, writing for hardcore and casual gamers',
    film:  'an enthusiastic film critic at WeCult, writing for cinephiles and casual moviegoers',
    tv:    'an engaging TV writer at WeCult, writing for binge-watchers and series fans',
    books: 'a literary journalist at WeCult, writing for avid readers and book lovers',
  }[article.category] ?? 'an entertainment journalist at WeCult';

  const hookExamples = {
    games: 'e.g. "After five years of silence, the studio behind [X] just dropped a bombshell..."',
    film:  'e.g. "Few directors can claim a Cannes career like [X]\'s — but what happened next surprised everyone."',
    tv:    'e.g. "Fans of [X] spent the weekend convinced the show was cancelled. They were wrong."',
    books: 'e.g. "The debut novel that quietly sold 200,000 copies before a publisher even touched it..."',
  }[article.category] ?? 'e.g. "The story everyone in [category] is talking about — and why it matters."';

  // ── Step 1: Generate English article ─────────────────────────────────
  const rssContent = article.content.slice(0, 1800);
  const webBlock = webContext
    ? `\nWEB RESEARCH — Facts gathered from the internet (use these to enrich the article):\n${webContext.slice(0, 2000)}`
    : '\nWEB RESEARCH: None available — rely on your training knowledge.';

  const enPrompt = `You are ${voice}. Your task: write a COMPLETE, ORIGINAL article for WeCult readers.

═══════ SOURCE MATERIAL ═══════
ARTICLE TITLE: ${article.title}
SOURCE OUTLET: ${article.source_name}

RSS TEASER (⚠ this is a SHORT PREVIEW, not the full article — do NOT reproduce it verbatim):
${rssContent}
${webBlock}
═══════════════════════════════

MANDATORY RULES — violating ANY rule = invalid output:
✗ NEVER copy the RSS teaser word-for-word — write original prose using your knowledge
✗ NEVER write "[...]", "[Read more]", "..." at the end of a sentence, or leave thoughts unfinished
✗ NEVER invent quotes that are not in the source material — only use real attributable quotes
✗ NEVER write fewer than 650 words in the "body" field
✗ NEVER use a generic opener like "In a surprising turn of events..." or "The entertainment world..."
✗ NEVER skip the ## section headings — they are mandatory

✓ Open with a SPECIFIC, vivid hook tied to this exact story (${hookExamples})
✓ Bold key names/titles with **Name** (e.g. **Park Chan-wook**, **Resident Evil 9**)
✓ Use *word* for natural emphasis
✓ Use ## Heading for every section title — make them SPECIFIC to the story, not generic
✓ Use > "Quote text" — Person Name for any real direct quote
✓ Use bullet lists (- item) when listing 3 or more things
✓ Separate EVERY paragraph and block with \\n\\n (double newline)
✓ Target 700–900 words in the body

ARTICLE STRUCTURE (follow exactly):
[Hook: 2–3 vivid, specific sentences that pull readers in]

## [Section 1 title — specific to this story, e.g. "Why Park Chan-wook's Take Shocked Cannes"]

[2 paragraphs: background and context that fans need to understand the story]

## [Section 2 title — e.g. "What Actually Happened at the Press Conference"]

[2–3 paragraphs: the main news — what happened, key details, who said/did what]

> "[Direct quote if available]" — Person Name

## [Section 3 title — community/fan angle, e.g. "How Fans Are Reacting"]

[1–2 paragraphs: fan or community perspective, why this resonates]

## What's Next

[1 closing paragraph: upcoming dates, what to watch for, forward-looking angle]

Return ONLY this JSON (no markdown code blocks, no extra text before or after):
{"title":"[Engaging reworded headline — not clickbait, not the RSS title verbatim]","summary":"[2-sentence hook for article previews — compelling, specific]","ai_analysis":"[1-sentence insight tailored specifically for ${article.category} fans]","body":"[Full article — all sections with \\\\n\\\\n between every block, 700–900 words]"}`;

  let enData = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: enPrompt }] }],
          generationConfig: { temperature: 0.65, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn(`  [gemini-en attempt ${attempt}] ${res.status}: ${err.slice(0, 120)}`);
        if (attempt < 3) { await sleep(attempt * 6000); continue; }
        throw new Error(`Gemini ${res.status}`);
      }

      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = raw
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Sometimes Gemini wraps the body with extra escaping — try to salvage
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error('JSON parse failed');
      }

      const body = parsed?.body ?? '';
      const TRUNCATION = ['[…]', '[&#8230;]', '...Read more', '…]', '[&hellip;]', '[...]'];
      const isTruncated = TRUNCATION.some(m => body.includes(m));

      if (!body || body.length < 400) {
        console.warn(`  [gemini-en attempt ${attempt}] body too short (${body.length} chars)`);
        if (attempt < 3) { await sleep(attempt * 6000); continue; }
        throw new Error('EN body too short after all attempts');
      }
      if (isTruncated) {
        console.warn(`  [gemini-en attempt ${attempt}] truncation marker in body — retrying`);
        if (attempt < 3) { await sleep(attempt * 6000); continue; }
        throw new Error('EN body contains truncation markers');
      }

      enData = parsed;
      break;
    } catch (err) {
      console.warn(`  [gemini-en attempt ${attempt}] ${err.message}`);
      if (attempt < 3) { await sleep(attempt * 6000); continue; }
      throw err;
    }
  }

  // ── Step 2: Translate to Turkish ─────────────────────────────────────
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
  // Send full body — no truncation
  const trPrompt = `Translate this entertainment news article to Turkish for WeCult — a premium Turkish entertainment platform.

═══════ ENGLISH ARTICLE ═══════
TITLE: ${enData.title}
SUMMARY: ${enData.summary}

BODY:
${enData.body}
═══════════════════════════════

TRANSLATION RULES — violating ANY rule = invalid output:
✗ NEVER leave any English words except: proper nouns (person names, film/game/book titles, brand names, place names)
✗ NEVER copy the English text — this must be a real translation into natural Turkish
✗ NEVER translate proper nouns (keep "Park Chan-wook", "Palme d'Or", "Cannes", "Netflix" as-is)
✗ NEVER write fewer than 400 words in the Turkish body

✓ Translate ALL ## section headings to Turkish (e.g. "## Why This Matters" → "## Bu Neden Önemli")
✓ Keep ALL markdown formatting: **bold**, *italic*, ## headings, > quotes, - lists, \\n\\n spacing
✓ Use natural, engaging Turkish journalism style — not word-for-word translation
✓ Maintain the same tone: enthusiastic, fan-focused, premium
✓ Keep > quotes in original language but add Turkish attribution context if needed

Return ONLY this JSON (no markdown code blocks, no extra text):
{"title":"[Türkçe başlık — çekici, doğal]","summary":"[Türkçe 2 cümle özet]","body":"[Türkçe makale — tüm bölümler dahil, \\\\n\\\\n ayrımlarıyla, minimum 400 kelime]"}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: trPrompt }] }],
          generationConfig: { temperature: 0.45, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        console.warn(`  [gemini-tr attempt ${attempt}] ${res.status}`);
        if (attempt < 3) { await sleep(attempt * 6000); continue; }
        return null;
      }

      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = raw
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error('JSON parse failed');
      }

      const body = parsed?.body ?? '';

      if (!body || body.length < 200) {
        console.warn(`  [gemini-tr attempt ${attempt}] body too short`);
        if (attempt < 3) { await sleep(attempt * 6000); continue; }
        return null;
      }

      // Detect if Gemini just copied English — title and first 120 chars
      const titleSame = parsed.title === enData.title;
      const bodySame = body.slice(0, 120).toLowerCase() === enData.body.slice(0, 120).toLowerCase();
      if (titleSame || bodySame) {
        console.warn(`  [gemini-tr attempt ${attempt}] TR is English copy — retrying`);
        if (attempt < 3) { await sleep(attempt * 6000); continue; }
        return null;
      }

      return parsed;
    } catch (err) {
      console.warn(`  [gemini-tr attempt ${attempt}] ${err.message}`);
      if (attempt < 3) { await sleep(attempt * 6000); continue; }
      return null;
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
