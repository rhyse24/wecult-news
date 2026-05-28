import type { APIRoute } from 'astro'

const rawArticles = import.meta.glob('../content/articles/*.json', { eager: true })

const BASE = 'https://news.wecult.app'

const STATIC_PAGES = [
  { loc: `${BASE}/`,           priority: '1.0', changefreq: 'hourly'  },
  { loc: `${BASE}/games`,      priority: '0.9', changefreq: 'hourly'  },
  { loc: `${BASE}/film`,       priority: '0.9', changefreq: 'hourly'  },
  { loc: `${BASE}/tv`,         priority: '0.9', changefreq: 'hourly'  },
  { loc: `${BASE}/books`,      priority: '0.9', changefreq: 'hourly'  },
  { loc: `${BASE}/tr`,         priority: '0.8', changefreq: 'hourly'  },
  { loc: `${BASE}/tr/games`,   priority: '0.7', changefreq: 'hourly'  },
  { loc: `${BASE}/tr/film`,    priority: '0.7', changefreq: 'hourly'  },
  { loc: `${BASE}/tr/tv`,      priority: '0.7', changefreq: 'hourly'  },
  { loc: `${BASE}/tr/books`,   priority: '0.7', changefreq: 'hourly'  },
  { loc: `${BASE}/es`,         priority: '0.8', changefreq: 'hourly'  },
  { loc: `${BASE}/es/games`,   priority: '0.7', changefreq: 'hourly'  },
  { loc: `${BASE}/es/film`,    priority: '0.7', changefreq: 'hourly'  },
  { loc: `${BASE}/es/tv`,      priority: '0.7', changefreq: 'hourly'  },
  { loc: `${BASE}/es/books`,   priority: '0.7', changefreq: 'hourly'  },
  { loc: `${BASE}/search`,     priority: '0.6', changefreq: 'daily'   },
  { loc: `${BASE}/tr/search`,  priority: '0.5', changefreq: 'daily'   },
  { loc: `${BASE}/es/search`,  priority: '0.5', changefreq: 'daily'   },
  { loc: `${BASE}/about`,               priority: '0.5', changefreq: 'monthly' },
  { loc: `${BASE}/contact`,             priority: '0.5', changefreq: 'monthly' },
  { loc: `${BASE}/editorial-standards`, priority: '0.4', changefreq: 'monthly' },
  { loc: `${BASE}/privacy`,             priority: '0.3', changefreq: 'monthly' },
  { loc: `${BASE}/terms`,               priority: '0.3', changefreq: 'monthly' },
]

export const GET: APIRoute = () => {
  const articles = Object.values(rawArticles)
    .map((m: unknown) => {
      const mod = m as { default?: Record<string, unknown> } & Record<string, unknown>
      return (mod.default ?? mod) as Record<string, unknown>
    })
    .sort((a, b) =>
      new Date(b.published_at as string).getTime() - new Date(a.published_at as string).getTime()
    )

  const staticEntries = STATIC_PAGES.map(p => `  <url>
    <loc>${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')

  const articleEntries = articles.map(a => {
    const lastmod = new Date(a.published_at as string).toISOString()
    return `  <url>
    <loc>${BASE}/article/${a.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${BASE}/tr/article/${a.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${BASE}/es/article/${a.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.6</priority>
  </url>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${articleEntries}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
