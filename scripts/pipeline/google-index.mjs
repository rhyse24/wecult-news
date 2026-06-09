#!/usr/bin/env node
/**
 * Google Indexing API — yeni makaleler için otomatik, tüm makaleler için --batch
 * Kullanım:
 *   node scripts/pipeline/google-index.mjs           ← son pipeline run'ı gönder
 *   node scripts/pipeline/google-index.mjs --batch   ← tüm mevcut makaleleri gönder
 *
 * Gerekli env var: GOOGLE_SA_KEY_PATH → service account JSON dosyasının tam yolu
 * Günlük limit: 200 URL (Google kısıtı)
 */
import { createSign } from 'crypto';
import { readFileSync, existsSync, readdirSync } from 'fs';

const SA_KEY_PATH = process.env.GOOGLE_SA_KEY_PATH;
const ARTICLES_DIR = 'src/content/articles';
const LOG_FILE    = 'public/pipeline-log.json';
const HOST        = 'www.wecultdaily.com';
const DAILY_LIMIT = 200;

if (!SA_KEY_PATH || !existsSync(SA_KEY_PATH)) {
  console.error('[google-index] GOOGLE_SA_KEY_PATH ayarlanmamış veya dosya bulunamadı');
  process.exit(1);
}

const sa = JSON.parse(readFileSync(SA_KEY_PATH, 'utf8'));

async function getAccessToken() {
  const now    = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  if (!res.ok) throw new Error(`Token alınamadı: ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

async function notifyUrl(token, url) {
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url, type: 'URL_UPDATED' }),
    signal:  AbortSignal.timeout(10000),
  });
  return res.status;
}

// URL listesini oluştur
let urls = [];

if (process.argv.includes('--batch')) {
  // Tüm mevcut makaleler
  const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const art  = JSON.parse(readFileSync(`${ARTICLES_DIR}/${file}`, 'utf8'));
      const slug = art.slug || art.id;
      urls.push(
        `https://${HOST}/article/${slug}`,
        `https://${HOST}/tr/article/${slug}`,
        `https://${HOST}/es/article/${slug}`,
      );
    } catch { /* bozuk dosya, atla */ }
  }
  console.log(`[google-index] Batch: ${files.length} makale × 3 dil = ${urls.length} URL`);
  if (urls.length > DAILY_LIMIT) {
    console.log(`[google-index] Günlük limit ${DAILY_LIMIT} — ilk ${DAILY_LIMIT} URL gönderilecek`);
    urls = urls.slice(0, DAILY_LIMIT);
  }
} else {
  // Sadece son pipeline run'ındaki yeni makaleler
  if (!existsSync(LOG_FILE)) {
    console.log('[google-index] Pipeline log bulunamadı — atlanıyor');
    process.exit(0);
  }
  const log    = JSON.parse(readFileSync(LOG_FILE, 'utf8'));
  const latest = log.runs?.[0];
  if (!latest?.written?.length) {
    console.log('[google-index] Son run\'da yeni makale yok — atlanıyor');
    process.exit(0);
  }
  urls = latest.written.flatMap(a => [
    `https://${HOST}/article/${a.slug}`,
    `https://${HOST}/tr/article/${a.slug}`,
    `https://${HOST}/es/article/${a.slug}`,
  ]);
  console.log(`[google-index] ${latest.written.length} yeni makale × 3 dil = ${urls.length} URL`);
}

// Token al
console.log('[google-index] Access token alınıyor...');
let token;
try {
  token = await getAccessToken();
  console.log('[google-index] Token OK');
} catch (err) {
  console.error(`[google-index] Auth hatası: ${err.message}`);
  console.error('[google-index] İpucu: Service account GSC\'de Owner olarak eklenmemiş olabilir');
  process.exit(1);
}

// URL\'leri gönder
let ok = 0, fail = 0;
for (const url of urls) {
  const status = await notifyUrl(token, url);
  if (status === 200) {
    ok++;
    console.log(`  ✓ ${url}`);
  } else {
    fail++;
    console.warn(`  ✗ ${url} (HTTP ${status})`);
  }
  await new Promise(r => setTimeout(r, 300)); // rate limit buffer
}

console.log(`[google-index] Tamamlandı: ${ok} başarılı, ${fail} başarısız`);
