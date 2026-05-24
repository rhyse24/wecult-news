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

export const GET: APIRoute = () => {
  // Google News sitemap only indexes articles from the last 2 days
  const twoDaysAgo = Date.now() - 48 * 3600000

  const articles = Object.values(rawArticles)
    .map((m: unknown) => {
      const mod = m as { default?: Record<string, unknown> } & Record<string, unknown>
      return (mod.default ?? mod) as Record<string, unknown>
    })
    .filter(a => new Date(a.published_at as string).getTime() > twoDaysAgo)
    .sort((a, b) =>
      new Date(b.published_at as string).getTime() - new Date(a.published_at as string).getTime()
    )

  const base = 'https://wecult.app/news'

  const items = articles
    .filter(a => {
      const translations = a.translations as Record<string, { title?: string } | null> | undefined
      const title = (a.original_title as string) || translations?.en?.title || ''
      return title.trim().length > 0 // skip articles with no title
    })
    .map(a => {
      const translations = a.translations as Record<string, { title?: string } | null> | undefined
      const title = escapeXml((a.original_title as string) || translations?.en?.title || '')
      const pubDate = new Date(a.published_at as string).toISOString()
      return `  <url>
    <loc>${base}/article/${a.slug}</loc>
    <lastmod>${pubDate}</lastmod>
    <news:news>
      <news:publication>
        <news:name>WeCult News</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${title}</news:title>
    </news:news>
  </url>`
    }).join('\n')

  // Return empty but valid sitemap when no recent articles exist
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
