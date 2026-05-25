// RSS feed sources — category: games | film | tv | books
// tier: 1 = premium trade/news-first | 2 = standard news | 3 = analysis-heavy

export const SOURCES = [

  // ── Games ─────────────────────────────────────────────────────────────
  // Tier 1 — Trade & premium news
  { url: 'https://www.gamesindustry.biz/feed',                    category: 'games', name: 'GamesIndustry.biz',  tier: 1 },

  // Tier 2 — Standard gaming news
  { url: 'https://feeds.feedburner.com/ign/all',                  category: 'games', name: 'IGN',                tier: 2 },
  { url: 'https://www.eurogamer.net/?format=rss',                  category: 'games', name: 'Eurogamer',          tier: 2 },
  { url: 'https://www.rockpapershotgun.com/feed',                  category: 'games', name: 'Rock Paper Shotgun', tier: 2 },
  { url: 'https://www.gamespot.com/feeds/mashup/',                 category: 'games', name: 'GameSpot',           tier: 2 },
  { url: 'https://www.pcgamer.com/rss/',                           category: 'games', name: 'PC Gamer',           tier: 2 },
  { url: 'https://www.polygon.com/rss/index.xml',                  category: 'games', name: 'Polygon',            tier: 2 },
  { url: 'https://www.videogameschronicle.com/feed/',              category: 'games', name: 'VGC',                tier: 2 },
  { url: 'https://www.destructoid.com/feed/',                      category: 'games', name: 'Destructoid',        tier: 2 },
  { url: 'https://www.nintendolife.com/feeds/latest',              category: 'games', name: 'Nintendo Life',      tier: 2 },
  { url: 'https://www.pushsquare.com/feeds/latest',               category: 'games', name: 'Push Square',        tier: 2 },
  { url: 'https://www.purexbox.com/feeds/news',                    category: 'games', name: 'Pure Xbox',          tier: 2 },
  { url: 'https://www.gamesradar.com/rss/',                        category: 'games', name: 'GamesRadar',         tier: 2 },
  { url: 'https://www.dexerto.com/feed/',                          category: 'games', name: 'Dexerto',            tier: 2 },
  { url: 'https://dotesports.com/feed',                            category: 'games', name: 'Dot Esports',        tier: 2 },

  // Tier 3 — Opinion/analysis heavy
  { url: 'https://kotaku.com/rss',                                 category: 'games', name: 'Kotaku',             tier: 3 },

  // ── Film ──────────────────────────────────────────────────────────────
  // Tier 1 — Premium trade publications
  { url: 'https://variety.com/feed/',                              category: 'film',  name: 'Variety',            tier: 1 },
  { url: 'https://deadline.com/feed/',                             category: 'film',  name: 'Deadline',           tier: 1 },
  { url: 'https://www.hollywoodreporter.com/feed/',               category: 'film',  name: 'Hollywood Reporter', tier: 1 },
  { url: 'https://www.indiewire.com/feed/',                        category: 'film',  name: 'IndieWire',          tier: 1 },

  // Tier 2 — Standard film news
  { url: 'https://thewrap.com/feed/',                              category: 'film',  name: 'The Wrap',           tier: 2 },
  { url: 'https://www.cinemablend.com/rss/all',                    category: 'film',  name: 'CinemaBlend',        tier: 2 },
  { url: 'https://movieweb.com/feed/',                             category: 'film',  name: 'MovieWeb',           tier: 2 },
  { url: 'https://www.comingsoon.net/feed',                        category: 'film',  name: 'ComingSoon',         tier: 2 },
  { url: 'https://www.firstshowing.net/feed/',                     category: 'film',  name: 'FirstShowing',       tier: 2 },
  { url: 'https://www.slashfilm.com/feed/',                        category: 'film',  name: 'Slash Film',         tier: 2 },

  // Tier 3 — Analysis/fan coverage
  { url: 'https://screenrant.com/feed/',                           category: 'film',  name: 'Screen Rant',        tier: 3 },

  // ── TV ────────────────────────────────────────────────────────────────
  // Tier 1 — Premium trade/news-first
  { url: 'https://tvline.com/feed/',                               category: 'tv',    name: 'TVLine',             tier: 1 },
  { url: 'https://deadline.com/feed/',                             category: 'tv',    name: 'Deadline TV',        tier: 1 },

  // Tier 2 — Standard TV news
  { url: 'https://www.vulture.com/feed/all.xml',                   category: 'tv',    name: 'Vulture',            tier: 2 },
  { url: 'https://ew.com/feed/',                                   category: 'tv',    name: 'Entertainment Weekly', tier: 2 },
  { url: 'https://www.tvinsider.com/feed/',                        category: 'tv',    name: 'TV Insider',         tier: 2 },
  { url: 'https://www.whats-on-netflix.com/feed/',                 category: 'tv',    name: "What's on Netflix",  tier: 2 },
  { url: 'https://collider.com/feed/',                             category: 'tv',    name: 'Collider',           tier: 2 },
  { url: 'https://www.denofgeek.com/feed/',                        category: 'tv',    name: 'Den of Geek',        tier: 2 },
  { url: 'https://www.theguardian.com/tv-and-radio/rss',          category: 'tv',    name: 'Guardian TV',        tier: 2 },
  { url: 'https://screenrant.com/feed/',                           category: 'tv',    name: 'Screen Rant TV',     tier: 2 },

  // Tier 3 — Analysis heavy
  { url: 'https://www.avclub.com/rss',                             category: 'tv',    name: 'AV Club',            tier: 3 },

  // ── Books ─────────────────────────────────────────────────────────────
  // Tier 1 — Trade publications
  { url: 'https://www.publishersweekly.com/pw/feeds/rss/pw_publishing_news.xml', category: 'books', name: 'Publishers Weekly', tier: 1 },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Books.xml',               category: 'books', name: 'NY Times Books',    tier: 1 },

  // Tier 2 — Standard book news
  { url: 'https://www.theguardian.com/books/rss',                  category: 'books', name: 'The Guardian Books', tier: 2 },
  { url: 'https://feeds.npr.org/1032.rss',                         category: 'books', name: 'NPR Books',          tier: 2 },
  { url: 'https://reactormag.com/feed/',                           category: 'books', name: 'Reactor Mag',        tier: 2 },

  // Tier 3 — Analysis/recommendation heavy
  { url: 'https://bookriot.com/feed/',                             category: 'books', name: 'Book Riot',          tier: 3 },
  { url: 'https://lithub.com/feed/',                               category: 'books', name: 'Literary Hub',       tier: 3 },
  { url: 'https://www.tor.com/feed/',                              category: 'books', name: 'Tor.com',            tier: 3 },
];

// Max articles fetched per source per run
export const MAX_PER_SOURCE = 8;

// Max candidates per category before Gemini selection
export const MAX_PER_CATEGORY = 2;

// 1 article per run — 7/24 = up to 24 articles/day
// Gemini usage: 1 call/run × 24 = 24/day = ~2.4% of 1000 RPD free tier
export const MAX_TOTAL = 1;
