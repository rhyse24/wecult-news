#!/usr/bin/env node
// One-time script: convert existing .webp article images → .avif
// Then update article JSON files to point to new paths.
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';
import sharp from 'sharp';
import { join } from 'path';

const IMG_DIR = 'public/article-images';
const ARTICLES_DIR = 'src/content/articles';

const webpFiles = readdirSync(IMG_DIR).filter(f => f.endsWith('.webp'));
console.log(`Converting ${webpFiles.length} WebP files to AVIF...`);

let converted = 0;
for (const webp of webpFiles) {
  const id = webp.replace('.webp', '');
  const webpPath = join(IMG_DIR, webp);
  const avifPath = join(IMG_DIR, `${id}.avif`);

  if (existsSync(avifPath)) {
    console.log(`  [skip] ${id}.avif already exists`);
    continue;
  }

  const buf = readFileSync(webpPath);
  const avifBuf = await sharp(buf).avif({ quality: 72 }).toBuffer();
  await writeFile(avifPath, avifBuf);
  console.log(`  [done] ${webp} ${(buf.length/1024).toFixed(0)}KB → ${id}.avif ${(avifBuf.length/1024).toFixed(0)}KB`);
  unlinkSync(webpPath);
  converted++;
}

// Update article JSONs: replace /article-images/xxx.webp → /article-images/xxx.avif
const jsonFiles = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'));
let updated = 0;
for (const jf of jsonFiles) {
  const path = join(ARTICLES_DIR, jf);
  const text = readFileSync(path, 'utf8');
  if (!text.includes('/article-images/') || !text.includes('.webp')) continue;
  const newText = text.replace(/\/article-images\/([a-f0-9]+)\.webp/g, '/article-images/$1.avif');
  if (newText !== text) {
    writeFileSync(path, newText, 'utf8');
    updated++;
  }
}

console.log(`\nDone: ${converted} images converted, ${updated} JSON files updated.`);
