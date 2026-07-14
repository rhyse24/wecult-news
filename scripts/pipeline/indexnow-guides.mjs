#!/usr/bin/env node
/*
 * IndexNow submitter for the AUTONOMOUS guides pipeline.
 * Reads the ephemeral marker written by guides.mjs (which slug this run produced)
 * and pings Bing/Yandex for that article's 3 language URLs. Runs AFTER deploy.
 * Mirrors scripts/pipeline/indexnow.mjs — same key, host, endpoint. Non-fatal.
 */
import { readFileSync, existsSync } from 'fs';

const KEY       = 'wecult2024news';
const HOST      = 'wecultdaily.com';
const LAST_FILE = 'scripts/pipeline/.guides-last.json';

if (!existsSync(LAST_FILE)) {
  console.log('[indexnow-guides] No marker file — skip');
  process.exit(0);
}

let slug = null;
try { slug = JSON.parse(readFileSync(LAST_FILE, 'utf8'))?.slug ?? null; } catch {}

if (!slug) {
  console.log('[indexnow-guides] No guide produced this run — skip');
  process.exit(0);
}

const urls = [
  `https://${HOST}/article/${slug}`,
  `https://${HOST}/tr/article/${slug}`,
  `https://${HOST}/es/article/${slug}`,
];

console.log(`[indexnow-guides] Submitting ${urls.length} URLs for ${slug} to Bing/Yandex...`);

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
  console.log(`[indexnow-guides] HTTP ${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    console.warn(`[indexnow-guides] Response body: ${text.slice(0, 200)}`);
  }
} catch (err) {
  console.warn(`[indexnow-guides] Failed (non-fatal): ${err.message?.slice(0, 80)}`);
}
