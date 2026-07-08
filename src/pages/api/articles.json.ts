import type { APIRoute } from 'astro'

const rawArticles = import.meta.glob('../../content/articles/*.json', { eager: true })

export const GET: APIRoute = () => {
  const articles = Object.values(rawArticles)
    .map((m: unknown) => {
      const mod = m as { default?: Record<string, unknown> } & Record<string, unknown>
      return (mod.default ?? mod) as Record<string, unknown>
    })
    .sort((a, b) =>
      new Date(b.published_at as string).getTime() - new Date(a.published_at as string).getTime()
    )
    .slice(0, 60)
    .map(a => {
      const translations = a.translations as Record<string, { title?: string; summary?: string } | null> | undefined
      const base = 'https://wecultdaily.com'
      return {
        id:           a.id,
        slug:         a.slug,
        category:     a.category,
        article_type: a.article_type || a.story_type || 'news',
        source_name:  a.source_name,
        published_at: a.published_at,
        cover_image:  a.image_url
          ? (a.image_url as string).startsWith('/') ? `${base}${a.image_url}` : a.image_url
          : null,
        url: `${base}/article/${a.slug}`,
        title: {
          en: translations?.en?.title ?? null,
          tr: translations?.tr?.title ?? null,
          es: translations?.es?.title ?? null,
        },
        summary: {
          en: translations?.en?.summary ?? null,
          tr: translations?.tr?.summary ?? null,
          es: translations?.es?.summary ?? null,
        },
      }
    })

  return new Response(JSON.stringify({ articles, generated_at: new Date().toISOString() }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  })
}
