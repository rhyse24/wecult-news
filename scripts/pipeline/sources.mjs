// RSS feed sources — category: games | film | tv | books
export const SOURCES = [
  { url: 'https://feeds.feedburner.com/ign/all', category: 'games', name: 'IGN' },
  { url: 'https://www.eurogamer.net/?format=rss', category: 'games', name: 'Eurogamer' },
  { url: 'https://www.pcgamer.com/rss/', category: 'games', name: 'PC Gamer' },
  { url: 'https://variety.com/feed/', category: 'film', name: 'Variety' },
  { url: 'https://deadline.com/feed/', category: 'film', name: 'Deadline' },
  { url: 'https://tvline.com/feed/', category: 'tv', name: 'TVLine' },
  { url: 'https://www.theverge.com/rss/index.xml', category: 'film', name: 'The Verge' },
  { url: 'https://www.tor.com/feed/', category: 'books', name: 'Tor.com' },
  { url: 'https://www.publishersweekly.com/pw/feeds/feeds.html', category: 'books', name: 'Publishers Weekly' },
];

// Max articles per source per run
export const MAX_PER_SOURCE = 2;
// Max total articles per run (Gemini free tier: 15 RPM, 1500 RPD)
export const MAX_TOTAL = 10;
