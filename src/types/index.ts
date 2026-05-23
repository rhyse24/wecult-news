export type Category = 'games' | 'film' | 'tv' | 'books'

export type Lang = 'en' | 'tr' | 'es' | 'pt' | 'ja'

export type ArticleType = 'news' | 'review' | 'feature' | 'opinion' | 'guide'

export interface Article {
  id: string
  slug: string
  category: Category
  article_type: ArticleType
  published_at: string
  cover_image: string | null
  inline_image_url: string
  source_url: string
  source_name: string
  tags: string[]
  reading_time_minutes: number
  translations: Record<Lang, ArticleTranslation | null>
}

export interface ArticleTranslation {
  title: string
  summary: string
  ai_analysis: string
  body: string
}

export interface Source {
  id: string
  name: string
  rss_url: string
  category: Category
  active: boolean
}
