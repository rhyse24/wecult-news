import type { Article, Lang } from '../types'

export const mockArticles: Article[] = [
  {
    id: '1', slug: 'gta-6-release-date-confirmed', category: 'games',
    article_type: 'news', reading_time_minutes: 3, tags: ['Rockstar Games', 'GTA', 'Open World', 'Take-Two'],
    published_at: new Date(Date.now() - 900000).toISOString(),
    cover_image: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=1000&q=80',
    inline_image_url: '', source_url: 'https://example.com', source_name: 'IGN',
    author: 'WeCult Editorial', trending_score: 0,
    translations: {
      en: { title: 'GTA 6 Release Date Finally Confirmed by Rockstar', summary: 'After months of speculation, Rockstar Games has officially announced the release window for Grand Theft Auto 6, targeting a late 2025 launch on consoles.', ai_analysis: 'Community sentiment is overwhelmingly positive. Reddit threads show high anticipation with most fans relieved the wait is nearly over. PC release timing remains the main concern.', body: "Rockstar Games has officially confirmed the release window for Grand Theft Auto VI. The announcement came via Take-Two Interactive during an earnings call, where CEO Strauss Zelnick confirmed the title is on track for its originally stated fall 2025 window.\n\nThe confirmation follows a period of intense fan speculation, particularly after the record-breaking trailer that amassed over 100 million views within 24 hours of release. The game, set in a fictionalized version of Miami and surrounding areas, introduces the series' first playable female protagonist.\n\nDevelopment sources suggest the game has been in active production for over a decade, representing one of the most expensive entertainment projects ever undertaken." },
      tr: { title: 'GTA 6 Çıkış Tarihi Netleşti: Rockstar Son Kararını Verdi', summary: 'Aylarca süren spekülasyonların ardından Rockstar Games, GTA 6\'nın çıkış penceresini resmen duyurdu.', ai_analysis: '', body: '' },
      es: { title: 'GTA 6: Rockstar Confirma Oficialmente la Fecha de Lanzamiento', summary: 'Tras meses de especulación, Rockstar Games ha anunciado oficialmente la ventana de lanzamiento de GTA 6.', ai_analysis: '', body: '' },
      pt: { title: 'GTA 6: Data de Lançamento Confirmada pela Rockstar', summary: 'Após meses de especulação, a Rockstar Games anunciou oficialmente a janela de lançamento do GTA 6.', ai_analysis: '', body: '' },
      ja: { title: 'GTA 6発売日、ロックスターが正式発表', summary: '数ヶ月の憶測の末、ロックスター・ゲームズがGTA 6の発売時期を正式発表しました。', ai_analysis: '', body: '' },
    },
  },
  {
    id: '2', slug: 'elden-ring-dlc-review', category: 'games',
    article_type: 'review', reading_time_minutes: 8, tags: ['FromSoftware', 'Elden Ring', 'Action RPG', 'Soulslike'],
    published_at: new Date(Date.now() - 14400000).toISOString(),
    cover_image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1000&q=80',
    inline_image_url: '', source_url: 'https://example.com', source_name: 'Eurogamer',
    author: 'WeCult Editorial', trending_score: 0,
    translations: {
      en: { title: 'Elden Ring: Shadow of the Erdtree — A Masterclass in Expansion Design', summary: "FromSoftware's DLC raises the bar for what a game expansion can be, delivering 30+ hours of punishing but rewarding content.", ai_analysis: '', body: '' },
      tr: { title: 'Elden Ring DLC İncelemesi: Genişleme Tasarımında Ustalık', summary: 'FromSoftware\'ın DLC\'si bir oyun genişlemesinin ne olabileceğinin sınırlarını zorluyor.', ai_analysis: '', body: '' },
      es: null, pt: null, ja: null,
    },
  },
  {
    id: '3', slug: 'dune-messiah-film-greenlit', category: 'film',
    article_type: 'news', reading_time_minutes: 3, tags: ['Denis Villeneuve', 'Dune', 'Sci-Fi', 'Legendary Pictures'],
    published_at: new Date(Date.now() - 3600000).toISOString(),
    cover_image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1000&q=80',
    inline_image_url: '', source_url: 'https://example.com', source_name: 'Variety',
    author: 'WeCult Editorial', trending_score: 0,
    translations: {
      en: { title: 'Dune: Messiah Gets Official Greenlight from Legendary', summary: "Denis Villeneuve's third Dune chapter has been greenlit following the massive box office success of Dune: Part Two.", ai_analysis: 'Box office performance of Dune Part Two ($710M worldwide) made this a near-certainty. Filming expected to begin Q3 2025.', body: '' },
      tr: { title: 'Dune: Messiah Resmi Olarak Onaylandı', summary: 'Legendary Entertainment, Dune serisinin üçüncü filmini onayladı.', ai_analysis: '', body: '' },
      es: { title: 'Dune: Messiah Recibe Luz Verde Oficial', summary: 'El tercer capítulo de Denis Villeneuve ha sido aprobado.', ai_analysis: '', body: '' },
      pt: null, ja: null,
    },
  },
  {
    id: '4', slug: 'oppenheimer-criterion-release', category: 'film',
    article_type: 'news', reading_time_minutes: 2, tags: ['Christopher Nolan', 'Criterion Collection', '4K', 'Award Winner'],
    published_at: new Date(Date.now() - 18000000).toISOString(),
    cover_image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1000&q=80',
    inline_image_url: '', source_url: 'https://example.com', source_name: 'Hollywood Reporter',
    author: 'WeCult Editorial', trending_score: 0,
    translations: {
      en: { title: 'Oppenheimer Criterion Collection Release Date and Details Announced', summary: "Christopher Nolan's Oscar-winning epic will receive the Criterion treatment with extensive new bonus materials and a 4K restoration.", ai_analysis: '', body: '' },
      tr: { title: 'Oppenheimer Criterion Koleksiyonu Tarihi Açıklandı', summary: '', ai_analysis: '', body: '' },
      es: null, pt: null, ja: null,
    },
  },
  {
    id: '5', slug: 'the-last-of-us-season-3-casting', category: 'tv',
    article_type: 'news', reading_time_minutes: 4, tags: ['HBO', 'The Last of Us', 'Pedro Pascal', 'Drama'],
    published_at: new Date(Date.now() - 7200000).toISOString(),
    cover_image: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=1000&q=80',
    inline_image_url: '', source_url: 'https://example.com', source_name: 'Deadline',
    author: 'WeCult Editorial', trending_score: 0,
    translations: {
      en: { title: 'The Last of Us Season 3: New Cast Members Revealed', summary: 'HBO has announced key casting decisions for the upcoming third season, with filming set to begin this summer.', ai_analysis: "Fan reception to the new casting is mixed online. Season 2's critical success gives the showrunners significant creative latitude.", body: '' },
      tr: { title: 'The Last of Us 3. Sezon Oyuncu Kadrosu Açıklandı', summary: 'HBO, 3. sezon için yeni oyuncu kadrosunu duyurdu.', ai_analysis: '', body: '' },
      es: null, pt: null, ja: null,
    },
  },
  {
    id: '6', slug: 'house-of-dragon-season-3-trailer', category: 'tv',
    article_type: 'feature', reading_time_minutes: 6, tags: ['HBO', 'House of the Dragon', 'Game of Thrones', 'Fantasy'],
    published_at: new Date(Date.now() - 28800000).toISOString(),
    cover_image: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=1000&q=80',
    inline_image_url: '', source_url: 'https://example.com', source_name: 'The Wrap',
    author: 'WeCult Editorial', trending_score: 0,
    translations: {
      en: { title: "House of the Dragon Season 3 Trailer Drops Early — Here's What to Expect", summary: 'HBO surprised fans with an early trailer drop for the third season, revealing major plot twists and a dramatic new look for several characters.', ai_analysis: '', body: '' },
      tr: { title: 'House of the Dragon 3. Sezon Fragmanı Yayınlandı', summary: '', ai_analysis: '', body: '' },
      es: null, pt: null, ja: null,
    },
  },
  {
    id: '7', slug: 'sandman-graphic-novel', category: 'books',
    article_type: 'review', reading_time_minutes: 5, tags: ['Neil Gaiman', 'DC Comics', 'Graphic Novel', 'Fantasy'],
    published_at: new Date(Date.now() - 10800000).toISOString(),
    cover_image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1000&q=80',
    inline_image_url: '', source_url: 'https://example.com', source_name: 'Polygon',
    author: 'WeCult Editorial', trending_score: 0,
    translations: {
      en: { title: "Neil Gaiman's Sandman Returns with New Graphic Novel", summary: 'The long-awaited continuation of the Sandman universe arrives with stunning artwork and a story that deepens the mythos.', ai_analysis: 'Pre-orders exceeded expectations. Goodreads community shows 4.8/5 average from early readers.', body: '' },
      tr: { title: 'Sandman Yeni Bir Graphic Novel ile Geri Döndü', summary: '', ai_analysis: '', body: '' },
      es: null, pt: null, ja: null,
    },
  },
  {
    id: '8', slug: 'tolkien-new-book-announced', category: 'books',
    article_type: 'news', reading_time_minutes: 3, tags: ['Tolkien', 'Middle-earth', 'Fantasy', 'Literary'],
    published_at: new Date(Date.now() - 36000000).toISOString(),
    cover_image: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1000&q=80',
    inline_image_url: '', source_url: 'https://example.com', source_name: 'The Guardian',
    author: 'WeCult Editorial', trending_score: 0,
    translations: {
      en: { title: 'New Tolkien Book Announced: Unpublished Manuscripts Set for Release', summary: 'The Tolkien Estate has announced a new volume compiling previously unpublished manuscripts and correspondence from J.R.R. Tolkien.', ai_analysis: '', body: '' },
      tr: { title: 'Yeni Tolkien Kitabı Duyuruldu', summary: '', ai_analysis: '', body: '' },
      es: null, pt: null, ja: null,
    },
  },
]

export function getByCategory(category: string) {
  return mockArticles.filter(a => a.category === category)
}

export function getByTag(tag: string) {
  return mockArticles.filter(a => a.tags.includes(tag))
}

export function getRelated(article: Article, limit = 3) {
  return mockArticles
    .filter(a => a.id !== article.id && (
      a.category === article.category ||
      a.tags.some(t => article.tags.includes(t))
    ))
    .slice(0, limit)
}

export function getByLang(articles: Article[], lang: Lang) {
  return articles.filter(a => a.translations[lang] !== null)
}

export function isBreaking(article: Article) {
  const ageMs = Date.now() - new Date(article.published_at).getTime()
  return ageMs < 3600000 // < 1 saat
}

export function isFresh(article: Article) {
  const ageMs = Date.now() - new Date(article.published_at).getTime()
  return ageMs < 10800000 // < 3 saat
}
