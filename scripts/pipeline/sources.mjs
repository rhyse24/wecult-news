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
  { url: 'https://www.rogerebert.com/feed',                        category: 'film',  name: 'RogerEbert',         tier: 3 },
  { url: 'https://movieweb.com/feed/',                             category: 'film',  name: 'MovieWeb',           tier: 2 },
  { url: 'https://www.comingsoon.net/feed',                        category: 'film',  name: 'ComingSoon',         tier: 2 },
  { url: 'https://www.firstshowing.net/feed/',                     category: 'film',  name: 'FirstShowing',       tier: 2 },
  { url: 'https://www.slashfilm.com/feed/',                        category: 'film',  name: 'Slash Film',         tier: 2 },

  // Tier 3 — Analysis/fan coverage
  { url: 'https://screenrant.com/feed/',                           category: 'film',  name: 'Screen Rant',        tier: 3 },

  // ── TV ────────────────────────────────────────────────────────────────
  // Tier 1 — Premium trade/news-first
  { url: 'https://tvline.com/feed/',                               category: 'tv',    name: 'TVLine',             tier: 1 },
  { url: 'https://variety.com/v/tv/feed/',                         category: 'tv',    name: 'Variety TV',         tier: 1 },

  // Tier 2 — Standard TV news
  { url: 'https://www.rollingstone.com/tv-movies/feed/',            category: 'tv',    name: 'Rolling Stone TV',   tier: 2 },
  { url: 'https://www.hollywoodreporter.com/c/tv/feed/',           category: 'tv',    name: 'THR TV',             tier: 1 },
  { url: 'https://www.tvinsider.com/feed/',                        category: 'tv',    name: 'TV Insider',         tier: 2 },
  { url: 'https://www.whats-on-netflix.com/feed/',                 category: 'tv',    name: "What's on Netflix",  tier: 2 },
  { url: 'https://collider.com/feed/',                             category: 'tv',    name: 'Collider',           tier: 2 },
  { url: 'https://www.denofgeek.com/feed/',                        category: 'tv',    name: 'Den of Geek',        tier: 2 },
  { url: 'https://www.theguardian.com/tv-and-radio/rss',          category: 'tv',    name: 'Guardian TV',        tier: 2 },
  { url: 'https://www.radiotimes.com/news/feed/',                  category: 'tv',    name: 'Radio Times',        tier: 2 },

  // Tier 3 — Analysis heavy
  { url: 'https://www.avclub.com/rss',                             category: 'tv',    name: 'AV Club',            tier: 3 },

  // ── Books ─────────────────────────────────────────────────────────────
  // Tier 1 — Trade publications
  { url: 'https://electricliterature.com/feed/',                                  category: 'books', name: 'Electric Literature', tier: 2 },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Books.xml',               category: 'books', name: 'NY Times Books',    tier: 1 },

  // Tier 2 — Standard book news
  { url: 'https://www.theguardian.com/books/rss',                  category: 'books', name: 'The Guardian Books', tier: 2 },
  { url: 'https://crimereads.com/feed/',                           category: 'books', name: 'CrimeReads',         tier: 2 },
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

// 3 articles per run × 12 runs/day = up to 36 articles/day
// Gemini usage: 3 calls/run × 12 = 36/day = ~2.4% of 1500 RPD free tier
export const MAX_TOTAL = 3;
