import { mkdir } from 'node:fs/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { startPreview, URL_BASE } from './preview.ts';

const OUT = '.local/shots';
const BOB_PX = 3;
const MIN_VISIBLE_SHARE = 0.8;
const LANDING_TOLERANCE_PX = 2;

interface Viewport {
  width: number;
  height: number;
  scale: number;
  shot: boolean;
}

interface Sample {
  visible: boolean;
  hits: string[];
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

async function launchDrone(page: Page): Promise<void> {
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.mouse.wheel(0, 1);
  await page.waitForSelector('[data-drone-state="flying"]', { state: 'attached', timeout: 8000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Waits until the smoothed scroll sync has all but stopped moving the drone. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const pos = document.querySelector<HTMLElement>('[data-drone-pos]')!;
        const read = () => (pos.style.transform.match(/-?[\d.]+/g) ?? []).map(Number);
        let previous = read();
        let calm = 0;
        const tick = () => {
          const current = read();
          const moved = Math.max(...current.map((value, i) => Math.abs(value - previous[i]!)));
          calm = moved < 0.4 ? calm + 1 : 0;
          previous = current;
          if (calm >= 3) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** Drone against real text lines and interactive rects in the current viewport. */
function sample(page: Page, bob: number): Promise<Sample> {
  return page.evaluate((margin) => {
    const side = document.querySelector<HTMLElement>('[data-drone-side]')!;
    const top = document.querySelector<HTMLElement>('[data-drone-top]')!;
    const active = Number(getComputedStyle(side).opacity) >= 0.5 ? side : top;
    const box = active.getBoundingClientRect();
    const drone = {
      left: Math.max(box.left - margin, 0),
      right: Math.min(box.right + margin, document.documentElement.clientWidth),
      top: box.top - margin,
      bottom: box.bottom + margin,
    };
    const visible =
      drone.right > drone.left &&
      drone.bottom > 0 &&
      drone.top < window.innerHeight &&
      Number(getComputedStyle(active).opacity) > 0;

    const hits = new Set<string>();
    const touches = (rect: DOMRect) =>
      rect.width > 1 &&
      rect.height > 1 &&
      rect.left < drone.right &&
      rect.right > drone.left &&
      rect.top < drone.bottom &&
      rect.bottom > drone.top;

    // splitText keeps an accessible copy in a 1px box: its text has rects but is never painted
    const inHiddenBox = (element: Element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const { width, height } = node.getBoundingClientRect();
        if (width <= 1 || height <= 1) return true;
      }
      return false;
    };

    const main = document.querySelector('main')!;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (!text) continue;
      const parent = node.parentElement!;
      if (parent.closest('.sr-only, [aria-hidden="true"]') || inHiddenBox(parent)) continue;
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some(touches)) hits.add(text.slice(0, 32));
    }
    for (const control of main.querySelectorAll('a, button')) {
      if (touches(control.getBoundingClientRect())) hits.add(`<${control.tagName}>`);
    }
    return { visible, hits: [...hits] };
  }, bob);
}

async function landingError(page: Page): Promise<number> {
  await instantScroll(page, 1e6);
  await page.waitForTimeout(600);
  await settle(page);
  return page.evaluate(() => {
    const active = document.querySelector('[data-drone-top]')!.getBoundingClientRect();
    const slot = document.querySelector('[data-drone-slot]')!.getBoundingClientRect();
    return Math.hypot(
      active.left + active.width / 2 - (slot.left + slot.width / 2),
      active.top + active.height / 2 - (slot.top + slot.height / 2),
    );
  });
}

async function sweep(page: Page, label: string): Promise<void> {
  const { max, droneHeight } = await page.evaluate(() => ({
    max: document.documentElement.scrollHeight - window.innerHeight,
    droneHeight: document.querySelector('[data-drone-tilt]')!.getBoundingClientRect().height,
  }));
  const step = Math.max(Math.floor(droneHeight / 2), 48);
  const down = Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => Math.min(i * step, max));

  const hits = new Map<string, number>();
  let visible = 0;
  let total = 0;

  for (const positions of [down, [...down].reverse()]) {
    for (const top of positions) {
      await instantScroll(page, top);
      await settle(page);
      const result = await sample(page, BOB_PX);
      total += 1;
      if (result.visible) visible += 1;
      result.hits.forEach((hit) => hits.set(hit, top));
    }
  }

  const share = visible / total;
  if (share < MIN_VISIBLE_SHARE) {
    fail(`${label}: drone visible in only ${(share * 100).toFixed(0)}% of ${total} samples`);
  }
  for (const [hit, top] of hits) fail(`${label}: drone covers "${hit}" at scroll ${top}`);
  console.log(
    `${label}: ${total} samples, drone visible ${(share * 100).toFixed(0)}%, ${hits.size} overlaps`,
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

  await launchDrone(page);

  const overflow = await hasOverflow(page);
  if (overflow > 0) fail(`${label}: horizontal overflow of ${overflow}px`);

  await sweep(page, label);

  const error = await landingError(page);
  if (error > LANDING_TOLERANCE_PX) fail(`${label}: landed ${error.toFixed(1)}px off the slot`);
  console.log(`${label}: landing error ${error.toFixed(2)}px`);

  if (shot) {
    await page.screenshot({ path: `${OUT}/${width}-landed.png` });
    await fullShot(page, String(width), height);
  }
  await context.close();
}

async function checkRotation(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await launchDrone(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  const error = await landingError(page);
  if (error > LANDING_TOLERANCE_PX) fail(`rotation: landed ${error.toFixed(1)}px off the slot`);
  if ((await hasOverflow(page)) > 0) fail('rotation: horizontal overflow');
  console.log(`rotation: landing error ${error.toFixed(2)}px`);
  await context.close();
}

/** Without motion all content must be there, and the drone sits still in its slot. */
async function expectStaticPage(page: Page, label: string): Promise<void> {
  const state = await page.evaluate(() => ({
    motion: document.documentElement.classList.contains('motion'),
    hidden: [...document.querySelectorAll('[data-reveal], [data-split], [data-panel]')].filter(
      (element) => getComputedStyle(element).opacity !== '1',
    ).length,
    layerHidden: document.querySelector<HTMLElement>('[data-drone]')!.hidden,
    slotDrone: getComputedStyle(document.querySelector('[data-drone-slot] img')!).display,
  }));
  if (state.motion) fail(`${label}: motion class still set`);
  if (state.hidden > 0) fail(`${label}: ${state.hidden} elements stay hidden`);
  if (!state.layerHidden) fail(`${label}: flying drone is shown`);
  if (state.slotDrone === 'none') fail(`${label}: static drone is missing`);
  console.log(`${label}: ok`);
}

async function checkFallbacks(browser: Browser): Promise<void> {
  const viewport = { width: 390, height: 844 };

  const blocked = await browser.newContext({ viewport });
  const blockedPage = await blocked.newPage();
  await blockedPage.route('**/anime.*.js', (route) => route.abort());
  await blockedPage.goto(URL_BASE, { waitUntil: 'load' });
  await blockedPage.waitForTimeout(3000);
  await expectStaticPage(blockedPage, 'anime chunk blocked');
  await blocked.close();

  const reduced = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  const requests: string[] = [];
  reducedPage.on('request', (request) => requests.push(request.url()));
  await reducedPage.goto(URL_BASE, { waitUntil: 'load' });
  await reducedPage.waitForTimeout(500);
  await expectStaticPage(reducedPage, 'reduced motion');
  if (requests.some((url) => url.includes('anime.'))) fail('reduced motion: anime was loaded');
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
  await checkRotation(browser);
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
