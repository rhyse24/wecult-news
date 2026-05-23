// RSS feed sources — category: games | film | tv | books
// 3 high-quality sources per category for balanced coverage
export const SOURCES = [
  // ── Games (3 sources) ───────────────────────────────────────────
  { url: 'https://feeds.feedburner.com/ign/all',        category: 'games', name: 'IGN' },
  { url: 'https://www.eurogamer.net/?format=rss',       category: 'games', name: 'Eurogamer' },
  { url: 'https://www.rockpapershotgun.com/feed',       category: 'games', name: 'Rock Paper Shotgun' },

  // ── Film (3 sources) ────────────────────────────────────────────
  { url: 'https://variety.com/feed/',                   category: 'film',  name: 'Variety' },
  { url: 'https://deadline.com/feed/',                  category: 'film',  name: 'Deadline' },
  { url: 'https://www.hollywoodreporter.com/feed/',     category: 'film',  name: 'Hollywood Reporter' },

  // ── TV (3 sources) ──────────────────────────────────────────────
  { url: 'https://tvline.com/feed/',                    category: 'tv',    name: 'TVLine' },
  { url: 'https://www.avclub.com/tv/rss',               category: 'tv',    name: 'AV Club' },
  { url: 'https://www.denofgeek.com/feed/',             category: 'tv',    name: 'Den of Geek' },

  // ── Books (3 sources) ───────────────────────────────────────────
  { url: 'https://www.tor.com/feed/',                   category: 'books', name: 'Tor.com' },
  { url: 'https://www.theguardian.com/books/rss',       category: 'books', name: 'The Guardian Books' },
  { url: 'https://bookriot.com/feed/',                  category: 'books', name: 'Book Riot' },
];

// Max articles fetched per source per run
export const MAX_PER_SOURCE = 3;

// Max articles saved per CATEGORY per run → equal distribution (3 × 4 = 12 total)
export const MAX_PER_CATEGORY = 3;

// Hard cap on total articles processed (Gemini free tier: ~1500 RPD)
export const MAX_TOTAL = 12;
