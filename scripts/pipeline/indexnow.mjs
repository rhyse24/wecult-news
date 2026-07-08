#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';

const KEY      = 'wecult2024news';
const HOST     = 'wecultdaily.com';
const LOG_FILE = 'public/pipeline-log.json';

if (!existsSync(LOG_FILE)) {
  console.log('[indexnow] No pipeline log found — skip');
  process.exit(0);
}

const log    = JSON.parse(readFileSync(LOG_FILE, 'utf8'));
const latest = log.runs?.[0];

if (!latest?.written?.length) {
  console.log('[indexnow] No new articles in latest run — skip');
  process.exit(0);
}

const urls = latest.written.flatMap(a => [
  `https://${HOST}/article/${a.slug}`,
  `https://${HOST}/tr/article/${a.slug}`,
  `https://${HOST}/es/article/${a.slug}`,
]);

console.log(`[indexnow] Submitting ${urls.length} URLs (${latest.written.length} articles × 3 langs) to Bing/Yandex...`);

try {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host:        HOST,
      key:         KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList:     urls,
    }),
    signal: AbortSignal.timeout(15000),
  });
  console.log(`[indexnow] HTTP ${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    console.warn(`[indexnow] Response body: ${text.slice(0, 200)}`);
  }
} catch (err) {
  console.warn(`[indexnow] Failed (non-fatal): ${err.message?.slice(0, 80)}`);
}
