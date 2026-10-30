import { mkdir } from 'node:fs/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { startPreview, URL_BASE } from './preview.ts';

const OUT = '.local/shots';

interface Viewport {
  width: number;
  height: number;
  scale: number;
  shot: boolean;
}

const VIEWPORTS: Viewport[] = [
  { width: 390, height: 844, scale: 2, shot: true },
  { width: 768, height: 1024, scale: 1, shot: true },
  { width: 1440, height: 900, scale: 1, shot: true },
  { width: 360, height: 640, scale: 1, shot: false },
  { width: 1024, height: 768, scale: 1, shot: false },
];

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

const instantScroll = (page: Page, top: number) =>
  page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);

async function hasOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function fullShot(page: Page, name: string, height: number): Promise<void> {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += height / 2) {
    await instantScroll(page, y);
    await page.waitForTimeout(100);
  }
  await instantScroll(page, 0);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function checkViewport(browser: Browser, viewport: Viewport): Promise<void> {
  const { width, height, scale, shot } = viewport;
  const label = `${width}x${height}`;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => fail(`${label}: page error: ${error.message}`));

  await page.goto(URL_BASE, { waitUntil: 'load' });

  const overflow = await hasOverflow(page);
  if (overflow > 0) fail(`${label}: horizontal overflow of ${overflow}px`);

  if (shot) await fullShot(page, String(width), height);
  console.log(`${label}: ok`);
  await context.close();
}

/** Without motion all content must be there. */
async function expectStaticPage(page: Page, label: string): Promise<void> {
  const state = await page.evaluate(() => ({
    motion: document.documentElement.classList.contains('motion'),
    hidden: [...document.querySelectorAll('[data-reveal], [data-split], [data-panel]')].filter(
      (element) => getComputedStyle(element).opacity !== '1',
    ).length,
  }));
  if (state.motion) fail(`${label}: motion class still set`);
  if (state.hidden > 0) fail(`${label}: ${state.hidden} elements stay hidden`);
  console.log(`${label}: ok`);
}

async function checkFallbacks(browser: Browser): Promise<void> {
  const viewport = { width: 390, height: 844 };

  const blocked = await browser.newContext({ viewport });
  const blockedPage = await blocked.newPage();
  await blockedPage.route('**/gsap.*.js', (route) => route.abort());
  await blockedPage.goto(URL_BASE, { waitUntil: 'load' });
  await blockedPage.waitForTimeout(3000);
  await expectStaticPage(blockedPage, 'motion chunk blocked');
  await blocked.close();

  const reduced = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(URL_BASE, { waitUntil: 'load' });
  await reducedPage.waitForTimeout(500);
  await expectStaticPage(reducedPage, 'reduced motion');
  await reduced.close();

  const noScript = await browser.newContext({ viewport, javaScriptEnabled: false });
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(URL_BASE, { waitUntil: 'load' });
  await noScriptPage.screenshot({ path: `${OUT}/no-js.png`, fullPage: true });
  await noScript.close();
  console.log('javascript off: screenshot saved');
}

await mkdir(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch();

try {
  for (const viewport of VIEWPORTS) await checkViewport(browser, viewport);
  await checkFallbacks(browser);
} finally {
  await browser.close();
  server.kill();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed.');
}
