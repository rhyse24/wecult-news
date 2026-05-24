// RSS feed sources — category: games | film | tv | books
// 6 high-quality sources per category for a larger, higher-quality pool
export const SOURCES = [
  // ── Games (6 sources) ───────────────────────────────────────────
  { url: 'https://feeds.feedburner.com/ign/all',        category: 'games', name: 'IGN' },
  { url: 'https://www.eurogamer.net/?format=rss',       category: 'games', name: 'Eurogamer' },
  { url: 'https://www.rockpapershotgun.com/feed',       category: 'games', name: 'Rock Paper Shotgun' },
  { url: 'https://www.gamespot.com/feeds/mashup/',      category: 'games', name: 'GameSpot' },
  { url: 'https://kotaku.com/rss',                      category: 'games', name: 'Kotaku' },
  { url: 'https://www.pcgamer.com/rss/',                category: 'games', name: 'PC Gamer' },

  // ── Film (6 sources) ────────────────────────────────────────────
  { url: 'https://variety.com/feed/',                   category: 'film',  name: 'Variety' },
  { url: 'https://deadline.com/feed/',                  category: 'film',  name: 'Deadline' },
  { url: 'https://www.hollywoodreporter.com/feed/',     category: 'film',  name: 'Hollywood Reporter' },
  { url: 'https://www.indiewire.com/feed/',             category: 'film',  name: 'IndieWire' },
  { url: 'https://thewrap.com/feed/',                   category: 'film',  name: 'The Wrap' },
  { url: 'https://screenrant.com/feed/',                category: 'film',  name: 'Screen Rant' },

  // ── TV (6 sources) ──────────────────────────────────────────────
  { url: 'https://tvline.com/feed/',                    category: 'tv',    name: 'TVLine' },
  { url: 'https://www.denofgeek.com/feed/',             category: 'tv',    name: 'Den of Geek' },
  { url: 'https://collider.com/feed/',                  category: 'tv',    name: 'Collider' },
  { url: 'https://www.slashfilm.com/feed/',             category: 'tv',    name: 'Slash Film' },
  { url: 'https://www.theguardian.com/tv-and-radio/rss', category: 'tv',  name: 'Guardian TV' },

  // ── Books (6 sources) ───────────────────────────────────────────
  { url: 'https://www.tor.com/feed/',                   category: 'books', name: 'Tor.com' },
  { url: 'https://www.theguardian.com/books/rss',       category: 'books', name: 'The Guardian Books' },
  { url: 'https://bookriot.com/feed/',                  category: 'books', name: 'Book Riot' },
  { url: 'https://lithub.com/feed/',                    category: 'books', name: 'Literary Hub' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Books.xml', category: 'books', name: 'NY Times Books' },
];

// Max articles fetched per source per run (pool for scoring)
export const MAX_PER_SOURCE = 2;

// Max articles in pool per category (ensures variety in selection)
export const MAX_PER_CATEGORY = 2;

// 1 article per category per run — 4 categories × 12 runs/day = up to 48 articles/day
// Gemini usage: 4 articles × 2 calls (EN+TR) = 8 calls/run × 12 = 96/day (well under 1500 RPD)
export const MAX_TOTAL = 4;
