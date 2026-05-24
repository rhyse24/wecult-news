import type { APIRoute } from 'astro'

const rawArticles = import.meta.glob('../content/articles/*.json', { eager: true })

function escapeXml(str: string): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function rssDate(iso: string): string {
  return new Date(iso).toUTCString()
}

export const GET: APIRoute = () => {
  const articles = Object.values(rawArticles)
    .map((m: unknown) => {
      const mod = m as { default?: Record<string, unknown> } & Record<string, unknown>
      return (mod.default ?? mod) as Record<string, unknown>
    })
    .sort((a, b) =>
      new Date(b.published_at as string).getTime() - new Date(a.published_at as string).getTime()
    )
    .slice(0, 30)

  const base = 'https://news.wecult.app'

  const items = articles.map(a => {
    const translations = a.translations as Record<string, { title?: string; summary?: string } | null> | undefined
    const title = escapeXml((a.original_title as string) || translations?.en?.title || '')
    const summary = escapeXml(translations?.en?.summary || '')
    const url = `${base}/article/${a.slug}`
    const image = a.image_url as string || ''
    const category = escapeXml(a.category as string || '')

    return `    <item>
      <title>${title}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${summary}</description>
      <pubDate>${rssDate(a.published_at as string)}</pubDate>
      <category>${category}</category>
      ${image ? `<media:content url="${escapeXml(image)}" medium="image" />` : ''}
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>WeCult News</title>
    <link>${base}</link>
    <description>Entertainment news about film, TV, games, and books — curated and expanded by AI.</description>
    <language>en</language>
    <ttl>60</ttl>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
