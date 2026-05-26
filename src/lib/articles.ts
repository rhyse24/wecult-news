import type { Article, Category, Lang } from '../types'

// Astro build-time glob — tüm article JSON'larını okur
const rawArticles = import.meta.glob('../content/articles/*.json', { eager: true })

// Kategori başına fallback Unsplash görsel
const FALLBACK_IMAGES: Record<Category, string> = {
  games:  'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=900&q=80',
  film:   'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=900&q=80',
  tv:     'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=900&q=80',
  books:  'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=900&q=80',
}

function decodeEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function splitIntoParagraphs(text: string): string {
  // If already has paragraph breaks, use them
  if (text.includes('\n\n')) return text
  // Split on sentence boundaries every ~3 sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const paragraphs: string[] = []
  for (let i = 0; i < sentences.length; i += 3) {
    const chunk = sentences.slice(i, i + 3).join(' ').trim()
    if (chunk) paragraphs.push(chunk)
  }
  return paragraphs.join('\n\n')
}

function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

function normalizeArticle(raw: Record<string, unknown>): Article {
  const category = (raw.category as Category) ?? 'games'
  const translations = raw.translations as Record<string, { title: string; summary: string } | null>

  const contentRaw = splitIntoParagraphs(decodeEntities((raw.content_raw as string) ?? ''))
  const normalizedTranslations = {} as Article['translations']
  for (const lang of ['en', 'tr', 'es'] as Lang[]) {
    const t = translations?.[lang] as { title?: string; summary?: string; body?: string } | null
    normalizedTranslations[lang] = t
      ? {
          title: decodeEntities(t.title ?? ''),
          summary: decodeEntities(t.summary ?? ''),
          ai_analysis: (raw.ai_analysis as string) ?? '',
          body: t.body ? decodeEntities(t.body) : contentRaw,
        }
      : null
  }

  const enBody = normalizedTranslations.en?.body ?? normalizedTranslations.en?.summary ?? ''

  return {
    id: raw.id as string,
    slug: raw.slug as string,
    category,
    article_type: 'news',
    author: (raw.author as string) || 'WeCult Editorial',
    published_at: raw.published_at as string,
    cover_image: (raw.image_url as string) || FALLBACK_IMAGES[category],
    inline_image_url: (raw.inline_image_url as string) || '',
    source_url: raw.source_url as string,
    source_name: raw.source_name as string,
    tags: (raw.tags as string[]) ?? [category],
    reading_time_minutes: readingTime(enBody),
    trending_score: (raw.trending_score as number) ?? 0,
    translations: normalizedTranslations,
  }
}

// Tüm makaleleri yükle, tarihe göre sırala (yeniden eskiye)
export const articles: Article[] = Object.values(rawArticles)
  .map(m => normalizeArticle((m as { default?: unknown } & Record<string, unknown>).default
    ? (m as { default: Record<string, unknown> }).default
    : m as Record<string, unknown>))
  .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())

// Mock uyumlu helper'lar
export function getByLang(list: Article[], lang: Lang): Article[] {
  return list.filter(a => a.translations[lang] != null)
}

export function getByCategory(list: Article[], category: Category): Article[] {
  return list.filter(a => a.category === category)
}

export function getByTag(list: Article[], tag: string): Article[] {
  return list.filter(a => a.tags.map(t => t.toLowerCase()).includes(tag.toLowerCase()))
}

export function getRelated(list: Article[], article: Article, limit = 3): Article[] {
  const articleTags = new Set(article.tags.map(t => t.toLowerCase()))
  const candidates = list.filter(a => a.id !== article.id && a.category === article.category)
  // Score by tag overlap — same-category articles sharing tags rank first
  const scored = candidates.map(a => {
    const tagOverlap = a.tags.filter(t => articleTags.has(t.toLowerCase())).length
    return { a, score: tagOverlap }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(s => s.a)
}

export function isBreaking(article: Article): boolean {
  return Date.now() - new Date(article.published_at).getTime() < 2 * 60 * 60 * 1000
}

export function isFresh(article: Article): boolean {
  return Date.now() - new Date(article.published_at).getTime() < 24 * 60 * 60 * 1000
}

export function isTrending(article: Article): boolean {
  return article.trending_score >= 5
}
