import { parseStringPromise } from 'xml2js';

/**
 * Fetch and parse a single RSS feed.
 * Returns array of { title, link, pubDate, content, source_name, category }
 */
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

  // Handle both RSS 2.0 and Atom
  const items = channel.item
    ? Array.isArray(channel.item) ? channel.item : [channel.item]
    : channel.entry
    ? Array.isArray(channel.entry) ? channel.entry : [channel.entry]
    : [];

  return items.slice(0, maxItems).map(item => ({
    title: item.title?._ || item.title || '',
    link: item.link?.href || item.link || item.guid?._ || item.guid || '',
    pubDate: item.pubDate || item.published || item.updated || new Date().toISOString(),
    content: strip(item['content:encoded'] || item.content?._ || item.description || item.summary || ''),
    source_name: source.name,
    source_url: source.url,
    category: source.category,
  })).filter(a => a.title && a.link);
}

function strip(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
}
