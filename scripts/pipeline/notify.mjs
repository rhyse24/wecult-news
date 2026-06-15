// Sends OneSignal push notification after pipeline writes new articles.
// Reads public/pipeline-log.json — safe, exits 0 on any non-fatal condition.
import { readFileSync, existsSync } from 'fs';

const APP_ID  = 'c0238f2c-1a19-4e96-86f5-5746ba15efe1';
const API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const SITE    = 'https://wecultdaily.com';
const LOG     = 'public/pipeline-log.json';
const ARTICLES = 'src/content/articles';

if (!API_KEY) {
  console.log('[notify] ONESIGNAL_REST_API_KEY not set — skip');
  process.exit(0);
}

if (!existsSync(LOG)) {
  console.log('[notify] No pipeline log found — skip');
  process.exit(0);
}

const { runs = [] } = JSON.parse(readFileSync(LOG, 'utf8'));
const run = runs[0];

if (!run || run.articlesWritten === 0) {
  console.log('[notify] 0 new articles in latest run — skip');
  process.exit(0);
}

const count = run.articlesWritten;
const top   = run.written?.[0];
const slug  = top?.slug;

// Try to get cover image from the top article JSON (already committed at this point)
let imageUrl;
try {
  if (slug && existsSync(`${ARTICLES}/${slug}.json`)) {
    const art = JSON.parse(readFileSync(`${ARTICLES}/${slug}.json`, 'utf8'));
    // Only use external URLs — relative /article-images/ paths aren't accessible at send time
    if (art.image_url && art.image_url.startsWith('http')) imageUrl = art.image_url;
  }
} catch {}

const heading = (top?.title || 'WeCult News').slice(0, 64);
const body    = count > 1
  ? `${count} yeni haber yayınlandı — okumak için dokun`
  : 'Yeni bir haber yayınlandı — okumak için dokun';
const url     = slug ? `${SITE}/article/${slug}` : SITE;

const payload = {
  app_id:            APP_ID,
  included_segments: ['All'],
  headings:          { en: heading, tr: heading },
  contents:          { en: body,    tr: body    },
  url,
  chrome_web_icon:   `${SITE}/logo.png`,
  firefox_icon:      `${SITE}/logo.png`,
  ...(imageUrl && { chrome_web_image: imageUrl }),
};

try {
  const res  = await fetch('https://onesignal.com/api/v1/notifications', {
    method:  'POST',
    headers: {
      'Authorization':  `Key ${API_KEY}`,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (data.id) {
    console.log(`[notify] ✓ Push sent — ${count} article(s) — id: ${data.id}`);
  } else {
    console.warn('[notify] OneSignal API error:', JSON.stringify(data).slice(0, 300));
    process.exit(1);
  }
} catch (err) {
  console.warn('[notify] Fetch error:', err.message);
  process.exit(1);
}
