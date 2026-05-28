#!/usr/bin/env node
// Generates favicon.ico and favicon PNGs from the SVG design using sharp
import sharp from 'sharp'
import { writeFileSync } from 'fs'

// The favicon design as an inline SVG (matches public/favicon.svg)
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="7" fill="#150e05"/>
  <path d="M5 7.5 L10.5 24.5 L16 14.5 L21.5 24.5 L27 7.5"
        stroke="#c9983a" stroke-width="3.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`)

// 32x32 PNG (for <link rel="icon" type="image/png">)
const png32 = await sharp(svg).resize(32, 32).png().toBuffer()
writeFileSync('public/favicon-32x32.png', png32)
console.log('Generated favicon-32x32.png')

// 16x16 PNG
const png16 = await sharp(svg).resize(16, 16).png().toBuffer()
writeFileSync('public/favicon-16x16.png', png16)
console.log('Generated favicon-16x16.png')

// 180x180 Apple Touch Icon
const png180 = await sharp(svg).resize(180, 180).png().toBuffer()
writeFileSync('public/apple-touch-icon.png', png180)
console.log('Generated apple-touch-icon.png')

// favicon.ico — ICO format with embedded PNG (supported since Win Vista / all modern browsers)
function buildIco(pngData) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)  // reserved
  header.writeUInt16LE(1, 2)  // type: 1 = icon
  header.writeUInt16LE(1, 4)  // 1 image

  const entry = Buffer.alloc(16)
  entry.writeUInt8(32, 0)                    // width
  entry.writeUInt8(32, 1)                    // height
  entry.writeUInt8(0, 2)                     // color count
  entry.writeUInt8(0, 3)                     // reserved
  entry.writeUInt16LE(1, 4)                  // planes
  entry.writeUInt16LE(32, 6)                 // bit depth
  entry.writeUInt32LE(pngData.length, 8)     // data size
  entry.writeUInt32LE(22, 12)                // data offset (6 header + 16 entry)

  return Buffer.concat([header, entry, pngData])
}

writeFileSync('public/favicon.ico', buildIco(png32))
console.log('Generated favicon.ico (PNG-wrapped ICO)')
