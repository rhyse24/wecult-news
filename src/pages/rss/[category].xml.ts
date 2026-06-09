import type { APIRoute, GetStaticPaths } from 'astro'

const rawArticles = import.meta.glob('../../content/articles/*.json', { eager: true })

const CATEGORIES = ['games', 'film', 'tv', 'books'] as const
type Category = typeof CATEGORIES[number]

const CATEGORY_LABELS: Record<Category, string> = {
  games: 'Games',
  film: 'Film',
  tv: 'TV',
  books: 'Books',
}

const BASE = 'https://www.wecultdaily.com'

function escapeXml(str: string): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const getStaticPaths: GetStaticPaths = () => {
  return CATEGORIES.map(cat => ({ params: { category: cat } }))
}

export const GET: APIRoute = ({ params }) => {
  const category = params.category as Category
  const label = CATEGORY_LABELS[category] ?? category

  const articles = Object.values(rawArticles)
    .map((m: unknown) => {
      const mod = m as { default?: Record<string, unknown> } & Record<string, unknown>
      return (mod.default ?? mod) as Record<string, unknown>
    })
    .filter(a => (a.category as string) === category)
    .sort((a, b) =>
      new Date(b.published_at as string).getTime() - new Date(a.published_at as string).getTime()
    )
    .slice(0, 30)

  const items = articles.map(a => {
    const translations = a.translations as Record<string, { title?: string; summary?: string } | null>
    const title = escapeXml((a.original_title as string) || translations?.en?.title || '')
    const description = escapeXml(translations?.en?.summary || '')
    const pubDate = new Date(a.published_at as string).toUTCString()
    const image = (a.image_url as string) || ''

    return `    <item>
      <title>${title}</title>
      <link>${BASE}/article/${a.slug}</link>
      <guid isPermaLink="true">${BASE}/article/${a.slug}</guid>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(category)}</category>
      ${image ? `<media:content url="${escapeXml(image)}" medium="image" />` : ''}
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>WeCult News — ${label}</title>
    <link>${BASE}/${category}</link>
    <description>${label} news and coverage from WeCult News.</description>
    <language>en</language>
    <ttl>60</ttl>
    <atom:link href="${BASE}/rss/${category}.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
