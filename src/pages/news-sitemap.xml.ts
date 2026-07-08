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

  const base = 'https://wecultdaily.com'

  const items = articles
    .flatMap(a => {
      const translations = a.translations as Record<string, { title?: string } | null> | undefined
      const pubDate  = new Date(a.published_at as string).toISOString()
      const rawImageUrl = (a.image_url as string) || ''
      const imageUrl = rawImageUrl.startsWith('/')
        ? `https://wecultdaily.com${rawImageUrl}`
        : rawImageUrl
      const imageTag = imageUrl
        ? `\n    <image:image>\n      <image:loc>${escapeXml(imageUrl)}</image:loc>\n    </image:image>`
        : ''

      const entries: string[] = []

      // EN entry
      const enTitle = escapeXml((a.original_title as string) || translations?.en?.title || '')
      if (enTitle.trim()) {
        entries.push(`  <url>
    <loc>${base}/article/${a.slug}</loc>
    <lastmod>${pubDate}</lastmod>
    <news:news>
      <news:publication>
        <news:name>WeCult News</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${enTitle}</news:title>
    </news:news>${imageTag}
  </url>`)
      }

      // TR entry — only when translation exists
      const trTitle = escapeXml(translations?.tr?.title || '')
      if (trTitle.trim()) {
        entries.push(`  <url>
    <loc>${base}/tr/article/${a.slug}</loc>
    <lastmod>${pubDate}</lastmod>
    <news:news>
      <news:publication>
        <news:name>WeCult News</news:name>
        <news:language>tr</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${trTitle}</news:title>
    </news:news>${imageTag}
  </url>`)
      }

      // ES entry — only when translation exists
      const esTitle = escapeXml(translations?.es?.title || '')
      if (esTitle.trim()) {
        entries.push(`  <url>
    <loc>${base}/es/article/${a.slug}</loc>
    <lastmod>${pubDate}</lastmod>
    <news:news>
      <news:publication>
        <news:name>WeCult News</news:name>
        <news:language>es</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${esTitle}</news:title>
    </news:news>${imageTag}
  </url>`)
      }

      return entries
    }).join('\n')

  // Return empty but valid sitemap when no recent articles exist
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${items}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
