import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startPreview, URL_BASE } from './preview.ts';

const OUT = '.local/shots';
const VIEWPORTS = [
  { width: 390, height: 844, scale: 2 },
  { width: 768, height: 1024, scale: 1 },
  { width: 1440, height: 900, scale: 1 },
];

await mkdir(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch();
const failures: string[] = [];

try {
  for (const { width, height, scale } of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
    });
    const page = await context.newPage();
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2800);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 0) failures.push(`${width}: horizontal overflow of ${overflow}px`);

    // Scroll through the page so lazy images load before the full-page shot
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += height / 2) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/${width}.png`, fullPage: true });
    console.log(`${width}: ok, page height ${total}px`);
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
