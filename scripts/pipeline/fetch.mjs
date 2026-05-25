import { parseStringPromise } from 'xml2js';

export async function fetchFeed(source, maxItems = 3) {
  const res = await fetch(source.url, {
    headers: { 'User-Agent': 'WeCultNews/1.0 (+https://wecult.app/news)' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    console.warn(`[fetch] ${source.name} failed: ${res.status}`);
    return [];
  }

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });

  const channel = parsed?.rss?.channel || parsed?.feed;
  if (!channel) return [];

  const items = channel.item
    ? Array.isArray(channel.item) ? channel.item : [channel.item]
    : channel.entry
    ? Array.isArray(channel.entry) ? channel.entry : [channel.entry]
    : [];

  return items.slice(0, maxItems * 3).map(item => {
    const rawHtml = item['content:encoded'] || item.content?._ || item.description || item.summary || '';
    return {
      title: item.title?._ || item.title || '',
      link: item.link?.href || item.link || item.guid?._ || item.guid || '',
      pubDate: item.pubDate || item.published || item.updated || new Date().toISOString(),
      content: strip(rawHtml),
      image_url: extractImage(item, rawHtml),
      source_name: source.name,
      source_url: source.url,
      category: source.category,
    };
  })
  .filter(a => a.title && a.link)
  .filter(isQuality)
  .slice(0, maxItems);
}

/**
 * Quality filter — rejects deals, sponsored, video-only, and stub articles.
 */
const LOW_QUALITY_PATTERNS = [
  /\b(deals?|sale|% off|\$\d+|discount|coupon|promo)\b/i,
  /\b(best of|top \d+|ranked|roundup|gift guide)\b/i,
  /\b(giveaway|contest|sweepstakes|sponsored|advertisement)\b/i,
  /\b(gallery|photos?|pictures?|video:|podcast:|listen:)\b/i,
  /^(review:|opinion:|guide:|interview:|hands.on:|feature:|essay:|analysis:|watch:|listen:|podcast:)/i,
];

// Off-topic content that slips through entertainment RSS feeds
const OFF_TOPIC_PATTERNS = [
  /\b(white house|secret service|pentagon|cia|fbi|nsa)\b/i,
  /\b(gunfire exchange|suspect dead|officer involved|shooting near)\b/i,
  /\b(peace (agreement|deal|talks?|treaty)|ceasefire|war (ends?|over))\b/i,
  /\b(trump|biden|harris|obama|putin)\b.*\b(says?|announces?|signs?|threatens?|calls?|urges?)\b/i,
  /\b(congressional|senate (bill|vote|hearing)|election (results?|fraud))\b/i,
];

function isQuality(article) {
  if (article.content.length < 80) return false; // Gemini+Tavily fills the gaps, just need topic identification
  const title = article.title.toLowerCase();
  for (const pattern of LOW_QUALITY_PATTERNS) {
    if (pattern.test(title)) return false;
  }
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(article.title)) return false;
  }
  return true;
}

/**
 * Extract image URL from RSS item — tries multiple common locations.
 */
function extractImage(item, rawHtml) {
  // 1. media:content (most common in game/entertainment RSS)
  const mc = item['media:content'];
  if (mc) {
    const url = mc?.$ ? mc.$.url : (Array.isArray(mc) ? mc[0]?.$.url : mc?.url);
    if (url && isImageUrl(url)) return url;
  }

  // 2. media:thumbnail
  const mt = item['media:thumbnail'];
  if (mt) {
    const url = mt?.$ ? mt.$.url : (Array.isArray(mt) ? mt[0]?.$.url : mt?.url);
    if (url && isImageUrl(url)) return url;
  }

  // 3. enclosure (podcasts use this too, check type)
  const enc = item.enclosure;
  if (enc) {
    const url = enc?.$ ? enc.$.url : enc?.url;
    const type = enc?.$ ? enc.$.type : enc?.type;
    if (url && (!type || type.startsWith('image/'))) return url;
  }

  // 4. First <img> tag in HTML content
  const imgMatch = rawHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1] && isImageUrl(imgMatch[1])) return imgMatch[1];

  return '';
}

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:')) return false;
  return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url) || url.includes('image') || url.includes('img');
}

function strip(html) {
  return html
    // Remove script and style blocks entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    // Remove HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Remove CSS rules like .class { ... }
    .replace(/\.[a-z-]+\s*\{[^}]*\}/gi, ' ')
    // Remove inline styles and data attributes leftovers
    .replace(/\b(margin|padding|display|font|color|background)[^;]+;/gi, ' ')
    // Remove URLs
    .replace(/https?:\/\/\S+/g, ' ')
    // Remove Reddit-style artifacts (u/username, r/subreddit)
    .replace(/\b[ur]\/\w+/g, ' ')
    // Decode common HTML entities
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
}
