const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
const GROQ_URL                     = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL                   = 'llama-3.3-70b-versatile'; // main pipeline — 12K TPM, 100K TPD
export const GROQ_TRANSLATE_MODEL  = 'llama-3.1-8b-instant';   // patch step    —  6K TPM, 500K TPD

// ── WeCult News Content Rules (approved 2026-05-24) ───────────────────────
// Rule 1: EN body ≥ 320 words, TR body ≥ 220 words, ES body ≥ 220 words, ≥1 ## heading, no truncation
// Rule 2: Hook → Context → Main Story → Fan Angle → What's Next
// Rule 3: No hallucinated quotes, dates, cast, numbers — if unknown write "yet to be announced"
// Rule 4: TR keeps proper nouns, translates headings, natural style, ≠ EN copy
// Rule 5: RSS is a teaser — Gemini must write original content using knowledge + Tavily
// Rule 6: Source bar shown on every article (handled in Astro pages)
// Rule 7: Category-specific tone (games/film/tv/books)
// Rule 8: Quality gate — article rejected if any minimum fails
// Rule 9: Hallucination guard — key title words must appear in expanded body
// ─────────────────────────────────────────────────────────────────────────

const PLATFORM_CONTEXT = `WeCult News is the editorial arm of WeCult — a global premium entertainment platform covering film, TV, games, and books. Our readers are smart, passionate fans from around the world who consume content on mobile. We write in both English and Turkish. Our voice is enthusiastic but credible — never clickbait, never dry.`;

const TONE_BY_CATEGORY = {
  games:  'passionate gaming journalist — knowledgeable about franchise history, platforms, developer track records; writes for both hardcore and casual gamers',
  film:   'enthusiastic film critic — comfortable with cinematic language but always accessible; writes for cinephiles and casual moviegoers alike',
  tv:     'engaging TV writer — focused on narrative arcs, showrunner decisions, renewal/cancellation stakes; writes for binge-watchers and series fans',
  books:  'literary journalist — excited about storytelling craft, genre trends, debut authors; writes for avid readers and curious newcomers',
};

const HOOK_EXAMPLE_BY_CATEGORY = {
  games: '"After five years of silence, the studio behind [X] just confirmed what fans feared — and what they hoped for."',
  film:  '"Few directors arrive at Cannes carrying a career like [X]\'s. What happened at the closing ceremony rewrote the story."',
  tv:    '"Fans spent the weekend convinced [X] was cancelled. The network just proved them wrong — and then some."',
  books: '"The debut novel that sold 200,000 copies before a major publisher touched it is finally getting its moment."',
};

const TRUNCATION_MARKERS = ['[…]', '[&#8230;]', '...Read more', '…]', '[&hellip;]', '[...]', 'read more →'];

export function isTruncated(text) {
  return TRUNCATION_MARKERS.some(m => text.toLowerCase().includes(m.toLowerCase()));
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countHeadings(text) {
  return (text.match(/^##\s+.+/gm) || []).length;
}

function endsCleanly(text) {
  return /[.!?»"')\]]+\s*$/.test(text.trim());
}

const HALLUCINATION_STOP_WORDS = new Set([
  'the','and','for','with','from','that','this','have','will','what','when','your',
  'they','them','about','more','into','over','after','then','some','these','than',
  'been','were','said','also','just','like','very','only','even','such','both',
  'says','gets','gets','new','next','best','how','why','who','its','but','not',
  'his','her','their','our','can','could','would','should','may','might',
]);

/**
 * Rule 9 — Hallucination guard: key words from the original RSS title must
 * appear in the expanded EN body. Catches cases where Gemini writes about
 * a completely different subject than the source.
 */
export function titleEntityPresent(originalTitle, enBody) {
  if (!originalTitle || !enBody) return true;

  // Prefer the quoted subject if present ("Game Title" or 'Film Name')
  const quoted = originalTitle.match(/['""]([^'""]{3,35})['""]/) ;
  const subject = quoted ? quoted[1] : originalTitle;

  const keyWords = subject
    .replace(/^(Review:|Preview:|Opinion:|Guide:|Analysis:|Watch:)\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !HALLUCINATION_STOP_WORDS.has(w));

  if (keyWords.length < 2) return true; // too few words to check reliably

  const bodyLower = enBody.toLowerCase();
  const found = keyWords.filter(w => bodyLower.includes(w));
  const ratio = found.length / keyWords.length;

  return ratio >= 0.3; // at least 30% of key title words must appear in body
}

// Rule 8 — quality gate applied to Gemini output before saving
export function validateArticle(ai) {
  const enBody = ai?.translations?.en?.body ?? '';
  const trBody = ai?.translations?.tr?.body ?? null;
  const enTitle = ai?.translations?.en?.title ?? '';
  const trTitle = ai?.translations?.tr?.title ?? null;

  const errors = [];

  // EN checks
  const enWords = wordCount(enBody);
  if (enWords < 320) errors.push(`EN body too short: ${enWords} words (need ≥320)`);
  if (enWords > 580) errors.push(`EN body too long: ${enWords} words (max 580)`);
  const enHeadings = countHeadings(enBody);
  if (enHeadings < 1) errors.push(`EN body has no section headings (need ≥1)`);
  if (isTruncated(enBody)) errors.push('EN body contains truncation marker');
  if (!endsCleanly(enBody)) errors.push('EN body ends mid-sentence');
  // Headline length — BuzzSumo optimal: 8–12 words
  const titleWordCount = enTitle.trim().split(/\s+/).filter(Boolean).length;
  if (titleWordCount > 12) errors.push(`Headline too long: ${titleWordCount} words (max 12)`);
  if (titleWordCount < 5) errors.push(`Headline too short: ${titleWordCount} words (min 5)`);

  // TR checks (null is allowed — EN shown as fallback)
  if (trBody !== null) {
    const trWords = wordCount(trBody);
    if (trWords < 220) errors.push(`TR body too short: ${trWords} words (need ≥220)`);
    if (trTitle && trTitle === enTitle) errors.push('TR title is identical to EN title (not translated)');
    if (trBody.slice(0, 120).toLowerCase() === enBody.slice(0, 120).toLowerCase()) {
      errors.push('TR body appears to be EN copy (first 120 chars identical)');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── List article detection ────────────────────────────────────────────────
const LIST_TITLE_PATTERNS = [
  // "10 Best X", "7 Top X", "5 Must-Play X"
  /^\d{1,2}\s+(best|top|worst|must|greatest|essential|iconic|underrated|overrated|scariest|funniest|biggest|hardest|easiest|rarest|strongest|weakest|darkest|saddest|weirdest|strangest|coolest|longest|shortest|craziest|surprising|shocking|disappointing|memorable|underappreciated)/i,
  // "Best 10 X", "Top 5 X"
  /^(best|top|worst|greatest|essential)\s+\d{1,2}/i,
  // "X games/movies/books you should..." — content nouns expanded
  /\b\d{1,2}\s+(games?|shows?|series|movies?|films?|books?|reasons?|things?|ways?|episodes?|seasons?|characters?|moments?|scenes?|villains?|heroes?|bosses?|levels?|endings?|twists?|sequels?|prequels?|adaptations?|franchises?|authors?|directors?)\s+(you|to|that|worth|every|we|fans?|should|must|need)/i,
  // "The 5 Most/Least..."
  /^(the\s+)?\d{1,2}\s+(most|least|biggest|scariest|funniest|powerful|iconic|underrated|overrated|shocking|surprising|disappointing|overlooked|beloved|hated|celebrated)/i,
  // "Only 3 Zelda Games...", "Just 5 Films..."
  /^(only|just)\s+\d{1,2}\s+\w/i,
  // "Every X Ranked", "Every X Explained"
  /^every\s+.{3,30}\s+(ranked|explained|listed|reviewed|compared|rated)/i,
  // "Ranked: X" / "Listed:" headers
  /^(ranked|listed|rating|countdown)[\s:]/i,
  // "X Things/Reasons We Love/Need/Want"
  /\b\d{1,2}\s+(things?|reasons?|ways?|facts?)\s+(we|you|fans?)\s+(love|hate|need|want|miss|remember|forget)/i,
  // "X surpass/beat Y" with a number (like "Only 3 Zelda Games Surpass...")
  /\b\d{1,2}\s+\w[\w\s]{2,25}\s+(surpass|beat|rival|top|outshine|exceed)/i,
  // "The X Games/Movies That..." — definite "The N" list form
  /^the\s+\d{1,2}\s+(games?|shows?|series|movies?|films?|books?|characters?|episodes?)\s+that\b/i,
];

export function isListArticle(title) {
  return LIST_TITLE_PATTERNS.some(p => p.test(title));
}
// ─────────────────────────────────────────────────────────────────────────

export async function summarizeArticle(article, apiKey, webContext = '', groqKey = '', isListMode = false) {
  const voice = TONE_BY_CATEGORY[article.category] ?? 'entertainment journalist';
  const hookExample = HOOK_EXAMPLE_BY_CATEGORY[article.category] ?? '';

  const webBlock = webContext
    ? `WEB RESEARCH — facts gathered from the internet to enrich the article:\n${webContext.slice(0, 2000)}`
    : 'WEB RESEARCH: None available — use your training knowledge about this topic.';

  // ── Step 1: English article ───────────────────────────────────────────
  const listPrompt = `${PLATFORM_CONTEXT}

You are a ${voice}. Rewrite this list article for WeCult News readers in an original, engaging way.

═══════ SOURCE ═══════
TITLE: ${article.title}
SOURCE OUTLET: ${article.source_name}
CONTENT: ${article.content.slice(0, 2000)}
${webBlock}
═══════════════════════

RULES — ALL MANDATORY:

RULE 1 — FORMAT (follow exactly):
• 1-2 sentence intro: why this list matters NOW — no fluff, no "In today's world..."
• 7-10 numbered items, each using this structure:
  ## [N]. [Item Name]
  [2-3 sentences: what it is + WHY it belongs on this list + one concrete specific detail]
• Final line: one punchy "Bottom Line:" sentence summing up the list (no ## heading)
• Total: 380–520 words

RULE 2 — QUALITY:
• Use items from the source — write your own fresh descriptions for each
• Every item must have a specific reason WHY it earned its spot (not just "it's great")
• Include at least 1 concrete detail per item (year, studio, developer, author, score, platform)
• If source has fewer than 7 items, expand thoughtfully using web research or your knowledge
• NEVER invent items that are clearly not related to the source topic

RULE 3 — HEADLINE:
• 8-12 words, number is prominent
• Style: "7 Games That Defined 2026 — One of Them Will Surprise You"
• Avoid generic: "Top 7 Games of 2026" is too flat

RULE 4 — NO HALLUCINATION:
• Only use items present in source or web research
• NEVER fabricate release dates, scores, or cast

FORMATTING:
• ## before every item heading (## 1. Item Name)
• \\n\\n between every item block

Return ONLY this JSON — no markdown wrapper, no text before or after:
{"title":"[List headline — number prominent, 8-12 words]","summary":"[1-2 sentence hook for card preview — what's in the list and why it matters]","ai_analysis":"[1-sentence insight for ${article.category} fans]","body":"[Full list body, ## per item, 380–520 words]","story_type":"list"}`;

  const enPrompt = isListMode ? listPrompt : `${PLATFORM_CONTEXT}

You are a ${voice}. Write a COMPLETE, ORIGINAL article for WeCult News readers.

═══════ SOURCE MATERIAL ═══════
TITLE: ${article.title}
SOURCE OUTLET: ${article.source_name}

RSS TEASER — ⚠ this is a SHORT PREVIEW only, NOT the full article:
${article.content.slice(0, 1800)}

${webBlock}
═══════════════════════════════

CONTENT RULES (WeCult Editorial Standard — ALL are mandatory):

RULE 1 — MINIMUMS:
• Body must be 380–520 words — mobile readers won't finish longer articles
• Include at least 2 paragraphs and at least 2 ## section headings
• Every sentence must be complete — NEVER end with "[...]", "Read more", "…" or mid-thought

RULE 2 — STRUCTURE (3 sections, follow this exact order):
[Hook: 1–2 punchy sentences — grab the reader immediately, no fluff]
Example of a good hook: ${hookExample}

## [Section title specific to this story — NOT "Introduction"]
[1–2 paragraphs: what happened + essential background — only what the reader needs to know]
[> "Direct quote if available" — Person Name]

## [Fan or community angle — e.g. "What Fans Are Saying" or specific to story]
[1 paragraph: why this matters to fans, stakes, community reaction]

## What's Next
[1 short paragraph: upcoming dates, what to watch for — keep it tight]

RULE 3 — NO HALLUCINATION:
• NEVER invent quotes — only use quotes clearly present in source material or web research
• NEVER fabricate release dates, box office numbers, ratings, or cast members
• NEVER invent statistics — if a number is not in your sources, do not write it
• If information is unknown: write "details have not yet been announced" or omit it
• You may reference well-known facts from your training (franchise history, a director's filmography) — that is fine

RULE 4 — VOICE AND TONE:
• NEVER open with "In a surprising turn of events...", "The world of [X] is buzzing...", or similar generic phrases
• Write with specific details — name the director, the game engine, the book imprint
• Bold key names and titles: **Park Chan-wook**, **Resident Evil 9**, **The Handmaiden**
• Use *word* for natural emphasis — sparingly
• Use bullet lists (- item) only when listing 3+ discrete things

RULE 5 — RSS TEASER HANDLING:
• The RSS snippet above is a TEASER — it is incomplete by design
• Do NOT reproduce it verbatim — write original prose
• Use it only to understand the topic, then write from your knowledge + web research

RULE 6 — HEADLINE (high-CTR mandatory):
• Optimal length: 8–12 words — BuzzSumo research shows 11-word headlines get highest shares
• Always include the main subject name (franchise, film title, game title, person name)
• Use active verbs: "Confirms", "Reveals", "Announces", "Drops", "Finally", "Officially", "Just"
• Odd numbers outperform even: prefer "7 Things" over "8 Things", "5 Reasons" over "6 Reasons"
• Use the CURIOSITY GAP — hint at the answer without giving it away (make them click to find out)
• NEVER use vague filler: "Amazing", "Shocking", "Breaking News", "You Won't Believe", "Epic"
• NEVER copy the RSS title verbatim — always rewrite with stronger, more specific language
• Match headline style to story_type:
  - breaking  → "[Subject] [Verb]s [What] — And It Changes Everything" or "[Subject] Just [Did X]"
  - rumor     → "[Subject] May [Do X] — Here's What We Actually Know"
  - analysis  → "Why [X] Is the [Superlative] [Thing] in [Category] Right Now"
  - release   → "[Title] [Verb]s [Date/Platform] — [One Key Detail Fans Care About]"
  - exclusive → "[Subject] [Verb]s [Surprising Thing] Nobody Expected"
  - event     → "[Event]: [Subject] [Does Surprising Thing]"
  - other     → lead with subject name + strong active verb
• Examples of strong headlines (use as style reference only, never copy):
  - "Rockstar Finally Confirms GTA 6 PC Window — And Fans Have Thoughts"
  - "Netflix Renews Stranger Things for a Final Season Nobody Saw Coming"
  - "Denis Villeneuve Just Cast Dune 3's Most Dangerous Villain"
  - "7 Things The Last of Us Season 3 Just Confirmed at Its Premiere"
  - "Why Elden Ring's New DLC May Be FromSoftware's Best Work Yet"

FORMATTING (mandatory):
• ## before every section heading
• \\n\\n between every paragraph and block
• > "Quote" — Person Name format for all direct quotes

Return ONLY this JSON — no markdown wrapper, no text before or after:
{"title":"[Engaging headline — specific, not clickbait, not the RSS title verbatim]","summary":"[2-sentence hook for article previews — compelling and specific]","ai_analysis":"[1-sentence insight tailored for ${article.category} fans]","body":"[Full article body — all sections with \\\\n\\\\n between blocks, 380–520 words]","story_type":"[one of: breaking | exclusive | rumor | analysis | release | event | other]"}`;

  let enData = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: enPrompt }] }],
          generationConfig: { temperature: 0.65, maxOutputTokens: 8192, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`  [gemini-en attempt ${attempt}] ${res.status}: ${errText.slice(0, 100)}`);
        if (res.status === 429) {
          if (attempt < 3) {
            const retryAfter = parseInt(res.headers.get('Retry-After') || '0') * 1000;
            const backoff = retryAfter || Math.min(15000 * Math.pow(2, attempt - 1), 60000);
            const jitter = Math.random() * 3000;
            console.warn(`  [gemini-en] 429 — ${Math.round((backoff + jitter) / 1000)}s bekle`);
            await sleep(backoff + jitter);
            continue;
          }
          throw new Error(`Gemini EN 429 — tüm denemeler tükendi`);
        }
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        throw new Error(`Gemini EN ${res.status}`);
      }

      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!raw) {
        const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'empty';
        console.warn(`  [gemini-en attempt ${attempt}] empty response — ${reason}`);
        if (reason === 'SAFETY') throw new Error('Gemini EN blocked by safety filter');
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        throw new Error('Gemini EN empty response');
      }
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) { try { parsed = JSON.parse(match[0]); } catch { throw new Error('JSON parse failed'); } }
        else throw new Error('No JSON found in response');
      }

      const body = parsed?.body ?? '';
      const title = parsed?.title ?? '';
      const words = wordCount(body);
      const titleWc = title.trim().split(/\s+/).filter(Boolean).length;
      const truncated = isTruncated(body);
      const headings = countHeadings(body);

      if (words < 320) {
        console.warn(`  [gemini-en attempt ${attempt}] body too short: ${words} words`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        throw new Error('EN body too short after all attempts');
      }
      if (words > 580) {
        console.warn(`  [gemini-en attempt ${attempt}] body too long: ${words} words — retrying`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        console.warn(`  [gemini-en] accepting ${words} words after all attempts`);
      }
      if (titleWc > 12) {
        console.warn(`  [gemini-en attempt ${attempt}] headline too long: ${titleWc} words — retrying`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        console.warn(`  [gemini-en] accepting ${titleWc}-word headline after all attempts`);
      }
      if (truncated) {
        console.warn(`  [gemini-en attempt ${attempt}] truncation marker in body — retrying`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        throw new Error('EN body contains truncation markers');
      }
      if (headings < 2) {
        console.warn(`  [gemini-en attempt ${attempt}] only ${headings} ## headings — retrying for better structure`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        console.warn(`  [gemini-en] accepting ${headings} headings after all attempts`);
      }

      enData = parsed;
      console.log(`  [gemini-en] ${words} words, ${headings} headings, ${titleWc}-word headline`);
      break;
    } catch (err) {
      console.warn(`  [gemini-en attempt ${attempt}] ${err.message}`);
      if (attempt < 3) { await sleep(attempt * 15000); continue; }
      throw err;
    }
  }

  // ── Step 2: Turkish translation (Groq) ───────────────────────────────
  if (!groqKey) await sleep(15000); // Gemini RPM limit — Groq doesn't need this
  let trData = await translateToTurkish(enData, groqKey || apiKey, article.category, !!groqKey);

  // ── Step 3: Spanish translation (Groq) ───────────────────────────────
  await sleep(65000); // wait >1 min so Groq TPM window resets between TR and ES
  let esData = await translateToSpanish(enData, groqKey || apiKey, article.category, !!groqKey);

  // If TR failed but ES succeeded, TPM window has partially reset — retry TR once
  if (!trData && esData) {
    console.warn('  [groq-tr] initial attempt failed but ES succeeded — retrying TR after 65s');
    await sleep(65000);
    trData = await translateToTurkish(enData, groqKey || apiKey, article.category, !!groqKey);
    if (trData) console.log('  [groq-tr] retry succeeded');
    else console.warn('  [groq-tr] retry also failed — saving without TR');
  }

  // If ES failed but TR succeeded, retry ES once
  if (!esData && trData) {
    console.warn('  [groq-es] initial attempt failed but TR succeeded — retrying ES after 65s');
    await sleep(65000);
    esData = await translateToSpanish(enData, groqKey || apiKey, article.category, !!groqKey);
    if (esData) console.log('  [groq-es] retry succeeded');
    else console.warn('  [groq-es] retry also failed — saving without ES');
  }

  const VALID_STORY_TYPES = new Set(['breaking', 'exclusive', 'rumor', 'analysis', 'release', 'event', 'other', 'list']);
  const story_type = VALID_STORY_TYPES.has(enData.story_type) ? enData.story_type : 'other';

  return {
    summary_en: enData.summary,
    ai_analysis: enData.ai_analysis,
    story_type,
    translations: {
      en: { title: enData.title, summary: enData.summary, body: enData.body },
      tr: trData,
      es: esData,
    },
  };
}

export async function translateToTurkish(enData, apiKey, category, useGroq = false, groqModel = GROQ_MODEL) {
  const categoryNote = {
    games: 'gaming terms like "open world", "DLC", "early access" can stay in English if they are standard in Turkish gaming culture',
    film:  'cinema terms like "box office", "premiere", "Palme d\'Or" can stay as-is',
    tv:    'TV terms like "showrunner", "season finale", "streaming" can stay as-is',
    books: 'publishing terms like "bestseller", "debut novel" can stay as-is',
  }[category] ?? '';

  const trPrompt = `${PLATFORM_CONTEXT}

Translate this entertainment news article to Turkish for WeCult News readers.

═══════ ENGLISH ARTICLE ═══════
TITLE: ${enData.title}
SUMMARY: ${enData.summary}

BODY:
${enData.body}
═══════════════════════════════

TRANSLATION RULES (WeCult Editorial Standard — ALL mandatory):

RULE 1 — LANGUAGE:
• ALL output must be in Turkish — title, summary, body, section headings
• Keep proper nouns as-is: person names (Park Chan-wook), film/game/book titles, brand names (Netflix, Steam), place names (Cannes, Hollywood)
• ${categoryNote}
• NEVER leave full sentences or paragraphs in English

RULE 2 — QUALITY:
• Write natural Turkish journalism — NOT word-for-word translation
• Use the engaging tone of Turkish entertainment media (excited but credible)
• Body must be at least 220 words in Turkish — keep it concise, mobile-first
• NEVER shorten or remove sections — translate the full article

RULE 3 — FORMATTING (keep all markdown):
• Translate all ## section headings to Turkish (e.g. "## Why This Matters" → "## Bu Neden Önemli")
• Keep **bold**, *italic*, > quotes, - bullet lists exactly as formatted
• Keep \\n\\n spacing between all blocks

RULE 4 — QUOTES:
• Keep direct quotes (> "...") in the original language
• Add Turkish attribution context around them if helpful

CRITICAL: Respond with ONLY a raw JSON object. No markdown code blocks, no \`\`\`json, no explanation text before or after. Start your response with { and end with }.
{"title":"[Türkçe başlık — çekici, doğal Türkçe]","summary":"[Türkçe 2 cümle özet — okuyucuyu çeken]","body":"[Türkçe makale — tüm bölümler dahil, \\\\n\\\\n ayrımlarıyla, 280–380 kelime]"}`;

  const provider = useGroq ? 'groq-tr' : 'gemini-tr';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let res;
      if (useGroq) {
        res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: 'user', content: trPrompt }],
            temperature: 0.45,
            max_tokens: 3000,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(90000),
        });
      } else {
        res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: trPrompt }] }],
            generationConfig: { temperature: 0.45, maxOutputTokens: 8192, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(90000),
        });
      }

      if (!res.ok) {
        console.warn(`  [${provider} attempt ${attempt}] ${res.status}`);
        if (res.status === 429) {
          const raHeader = res.headers.get('Retry-After') || '0';
          const retryAfter = /^\d+$/.test(raHeader.trim())
            ? parseInt(raHeader) * 1000
            : Math.max(0, new Date(raHeader).getTime() - Date.now());
          if (retryAfter > 30000) {
            console.warn(`  [${provider}] 429 — Retry-After too long (${Math.round(retryAfter/1000)}s) — skipping translation`);
            return null;
          }
          if (attempt < 3) {
            const backoff = retryAfter || Math.min(15000 * Math.pow(2, attempt - 1), 60000);
            const jitter = Math.random() * 3000;
            console.warn(`  [${provider}] 429 — ${Math.round((backoff + jitter) / 1000)}s bekle`);
            await sleep(backoff + jitter);
            continue;
          }
          return null;
        }
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        return null;
      }

      const data = await res.json();
      const raw = useGroq
        ? (data.choices?.[0]?.message?.content || '')
        : (data.candidates?.[0]?.content?.parts?.[0]?.text || '');
      if (!raw) {
        console.warn(`  [${provider} attempt ${attempt}] empty response`);
        if (attempt >= 3) return null;
        await sleep(attempt * 15000); continue;
      }
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) { try { parsed = JSON.parse(match[0]); } catch { throw new Error('JSON parse failed'); } }
        else throw new Error('No JSON found in TR response');
      }

      const body = parsed?.body ?? '';
      const words = wordCount(body);

      if (words < 200) {
        console.warn(`  [${provider} attempt ${attempt}] body too short: ${words} words`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        return null;
      }
      if (parsed.title === enData.title) {
        console.warn(`  [${provider} attempt ${attempt}] TR title = EN title — not translated`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        return null;
      }
      if (body.slice(0, 120).toLowerCase() === enData.body.slice(0, 120).toLowerCase()) {
        console.warn(`  [${provider} attempt ${attempt}] TR body is EN copy — retrying`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        return null;
      }

      console.log(`  [${provider}] ${words} words`);
      return parsed;
    } catch (err) {
      console.warn(`  [${provider} attempt ${attempt}] ${err.message}`);
      if (attempt < 3) { await sleep(attempt * 15000); continue; }
      return null;
    }
  }
  return null;
}

export async function translateToSpanish(enData, apiKey, category, useGroq = false, groqModel = GROQ_MODEL) {
  const categoryNote = {
    games: 'gaming terms like "open world", "DLC", "early access", "battle royale" can stay in English as they are standard in Spanish gaming culture',
    film:  'cinema terms like "box office", "premiere", "streaming" can stay as-is',
    tv:    'TV terms like "showrunner", "season finale", "streaming", "spin-off" can stay as-is',
    books: 'publishing terms like "bestseller", "debut novel" can stay as-is',
  }[category] ?? '';

  const esPrompt = `${PLATFORM_CONTEXT}

Translate this entertainment news article to Spanish (Castilian/Latin American neutral) for WeCult News readers.

═══════ ENGLISH ARTICLE ═══════
TITLE: ${enData.title}
SUMMARY: ${enData.summary}

BODY:
${enData.body}
═══════════════════════════════

TRANSLATION RULES (WeCult Editorial Standard — ALL mandatory):

RULE 1 — LANGUAGE:
• ALL output must be in Spanish — title, summary, body, section headings
• Keep proper nouns as-is: person names, film/game/book titles, brand names (Netflix, Steam), place names
• ${categoryNote}
• NEVER leave full sentences or paragraphs in English

RULE 2 — QUALITY:
• Write natural Spanish journalism — NOT word-for-word translation
• Use neutral Spanish understood by both Spain and Latin America
• Body must be at least 220 words in Spanish — keep it concise, mobile-first
• NEVER shorten or remove sections — translate the full article

RULE 3 — FORMATTING (keep all markdown):
• Translate all ## section headings to Spanish (e.g. "## What's Next" → "## Próximos Pasos")
• Keep **bold**, *italic*, > quotes, - bullet lists exactly as formatted
• Keep \\n\\n spacing between all blocks

RULE 4 — QUOTES:
• Keep direct quotes (> "...") in the original language
• Add Spanish attribution context around them if helpful

CRITICAL: Respond with ONLY a raw JSON object. No markdown code blocks, no \`\`\`json, no explanation text before or after. Start your response with { and end with }.
{"title":"[Título en español — atractivo, natural]","summary":"[Resumen en español — 2 frases que enganchan al lector]","body":"[Artículo completo en español — todas las secciones incluidas, con \\\\n\\\\n entre bloques, 280–380 palabras]"}`;

  const provider = useGroq ? 'groq-es' : 'gemini-es';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let res;
      if (useGroq) {
        res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: 'user', content: esPrompt }],
            temperature: 0.45,
            max_tokens: 3000,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(90000),
        });
      } else {
        res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: esPrompt }] }],
            generationConfig: { temperature: 0.45, maxOutputTokens: 8192, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(90000),
        });
      }

      if (!res.ok) {
        console.warn(`  [${provider} attempt ${attempt}] ${res.status}`);
        if (res.status === 429) {
          const raHeader = res.headers.get('Retry-After') || '0';
          const retryAfter = /^\d+$/.test(raHeader.trim())
            ? parseInt(raHeader) * 1000
            : Math.max(0, new Date(raHeader).getTime() - Date.now());
          if (retryAfter > 30000) {
            console.warn(`  [${provider}] 429 — Retry-After too long (${Math.round(retryAfter/1000)}s) — skipping translation`);
            return null;
          }
          if (attempt < 3) {
            const backoff = retryAfter || Math.min(15000 * Math.pow(2, attempt - 1), 60000);
            const jitter = Math.random() * 3000;
            console.warn(`  [${provider}] 429 — ${Math.round((backoff + jitter) / 1000)}s bekle`);
            await sleep(backoff + jitter);
            continue;
          }
          return null;
        }
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        return null;
      }

      const data = await res.json();
      const raw = useGroq
        ? (data.choices?.[0]?.message?.content || '')
        : (data.candidates?.[0]?.content?.parts?.[0]?.text || '');
      if (!raw) {
        console.warn(`  [${provider} attempt ${attempt}] empty response`);
        if (attempt >= 3) return null;
        await sleep(attempt * 15000); continue;
      }
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) { try { parsed = JSON.parse(match[0]); } catch { throw new Error('JSON parse failed'); } }
        else throw new Error('No JSON found in ES response');
      }

      const body = parsed?.body ?? '';
      const words = wordCount(body);

      if (words < 200) {
        console.warn(`  [${provider} attempt ${attempt}] body too short: ${words} words`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        return null;
      }
      if (parsed.title === enData.title) {
        console.warn(`  [${provider} attempt ${attempt}] ES title = EN title — not translated`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        return null;
      }
      if (body.slice(0, 120).toLowerCase() === enData.body.slice(0, 120).toLowerCase()) {
        console.warn(`  [${provider} attempt ${attempt}] ES body is EN copy — retrying`);
        if (attempt < 3) { await sleep(attempt * 15000); continue; }
        return null;
      }

      console.log(`  [${provider}] ${words} words`);
      return parsed;
    } catch (err) {
      console.warn(`  [${provider} attempt ${attempt}] ${err.message}`);
      if (attempt < 3) { await sleep(attempt * 15000); continue; }
      return null;
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
