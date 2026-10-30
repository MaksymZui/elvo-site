// Favicons and the Open Graph image, written to public/.
// Run: node scripts/assets/brand.ts
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const NAVY = '#001027';
const mark = await readFile('src/assets/logo-mark.svg', 'utf8');
const markInner = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

// The white bar needs a dark plate on light browser tabs
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${NAVY}"/><svg x="56" y="116" width="400" height="280" viewBox="14 17 374 223">${markInner}</svg></svg>\n`;
await writeFile('public/favicon.svg', favicon);
await sharp(Buffer.from(favicon)).resize(32, 32).png().toFile('public/favicon-32.png');
await sharp(Buffer.from(favicon))
  .resize(180, 180)
  .flatten({ background: NAVY })
  .png()
  .toFile('public/apple-touch-icon.png');

const logo = await sharp('src/assets/logo.svg', { density: 300 })
  .resize({ width: 340 })
  .png()
  .toBuffer();
const shade = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g"><stop offset="0" stop-color="${NAVY}" stop-opacity=".82"/><stop offset=".62" stop-color="${NAVY}" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/></svg>`;

await sharp('src/assets/sections/hero.webp')
  .resize(1200, 630, { fit: 'cover', position: 'right' })
  .composite([{ input: Buffer.from(shade) }, { input: logo, left: 64, top: 64 }])
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile('public/og-image.jpg');
