import { mkdir } from 'node:fs/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { startPreview, URL_BASE } from './preview.ts';

const OUT = '.local/shots';
const SECTIONS = ['top', 'drones', 'payload', 'fiber', 'solutions', 'contact'];
const STACK_FROM = 768;
const SNAP_TOLERANCE_PX = 2;
const CPU_SLOWDOWN = 4;
const FRAME_BUDGET_MS = 33.4;

interface Viewport {
  width: number;
  height: number;
  scale: number;
}

const VIEWPORTS: Viewport[] = [
  { width: 360, height: 640, scale: 2 },
  { width: 390, height: 844, scale: 2 },
  { width: 768, height: 1024, scale: 1 },
  { width: 1024, height: 768, scale: 1 },
  { width: 1440, height: 900, scale: 1 },
];

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

const instantScroll = (page: Page, top: number) =>
  page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);

/** A pinned section is fixed in place, so its position is read from the spacer. */
const pageTop = (page: Page, id: string) =>
  page.evaluate((name) => {
    const section = document.getElementById(name)!;
    const parent = section.parentElement!;
    const box = parent.classList.contains('pin-spacer') ? parent : section;
    return Math.round(box.getBoundingClientRect().top + window.scrollY);
  }, id);

async function openPage(page: Page): Promise<void> {
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}

async function hasOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function checkHeights(page: Page, label: string, height: number): Promise<void> {
  const heights = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-section]')].map((section) => ({
      id: section.id,
      value: section.offsetHeight,
    })),
  );
  const footer = await page.evaluate(() => document.querySelector('footer')!.offsetHeight);
  for (const { id, value } of heights) {
    const total = id === 'contact' ? value + footer : value;
    if (total < height - 1) fail(`${label}: #${id} is ${total}px, shorter than the screen`);
  }
  const tall = heights.filter(({ value }) => value > height + 1).map(({ id }) => id);
  console.log(`${label}: heights ok${tall.length > 0 ? `, grown: ${tall.join(', ')}` : ''}`);
}

/** Everything in the section must fit its box: the body hides overflow, so clipping is silent. */
async function checkClipping(page: Page, label: string, id: string): Promise<void> {
  const { overflow, cut } = await page.evaluate((name) => {
    const section = document.getElementById(name)!;
    const body = section.querySelector<HTMLElement>('[data-screen-body]')!;
    const box = body.getBoundingClientRect();
    const clipped = [...body.querySelectorAll<HTMLElement>('a, p, h2, address, img, li')].filter(
      (element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) return false;
        return (
          rect.left < box.left - 1 ||
          rect.right > box.right + 1 ||
          rect.top < box.top - 1 ||
          rect.bottom > box.bottom + 1
        );
      },
    );
    return {
      overflow: body.scrollHeight - body.clientHeight,
      cut: clipped.map((element) => `${element.tagName} ${element.textContent?.slice(0, 24)}`),
    };
  }, id);

  if (overflow > 1) fail(`${label}: #${id} body overflows by ${overflow}px`);
  for (const item of cut) fail(`${label}: #${id} clips "${item}"`);
}

async function visitSections(page: Page, label: string, width: number): Promise<void> {
  for (const id of SECTIONS) {
    await instantScroll(page, await pageTop(page, id));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${width}-${id}.png` });
    if (id === 'solutions' || id === 'contact') await checkClipping(page, label, id);
  }

  const hidden = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-reveal], [data-split], [data-panel]')].filter(
        (element) =>
          element.getClientRects().length > 0 && getComputedStyle(element).opacity !== '1',
      ).length,
  );
  if (hidden > 0) fail(`${label}: ${hidden} elements never appeared`);
}

async function checkStack(page: Page, label: string, width: number): Promise<void> {
  const pins = await page.evaluate(() => document.querySelectorAll('.pin-spacer').length);
  const expected = width >= STACK_FROM ? SECTIONS.length - 1 : 0;
  if (pins !== expected) fail(`${label}: ${pins} pinned sections, expected ${expected}`);
}

async function checkSnap(page: Page, label: string): Promise<void> {
  const target = await pageTop(page, 'fiber');
  const height = page.viewportSize()!.height;

  await instantScroll(page, target - Math.round(height * 0.25));
  await page.waitForTimeout(1300);
  const rest = await page.evaluate(() => Math.round(window.scrollY));
  if (Math.abs(rest - target) > SNAP_TOLERANCE_PX) {
    fail(`${label}: snap stopped at ${rest}, expected ${target}`);
  }
  console.log(`${label}: snap rest ${rest}, target ${target}`);
}

async function checkAnchor(page: Page, label: string): Promise<void> {
  await instantScroll(page, 0);
  await page.waitForTimeout(600);
  await page.getByRole('banner').getByRole('link', { name: 'Contact' }).first().click();
  await page.waitForTimeout(3500);

  const state = await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    max: document.documentElement.scrollHeight - window.innerHeight,
    hash: location.hash,
  }));
  if (Math.abs(state.y - state.max) > SNAP_TOLERANCE_PX) {
    fail(`${label}: Contact link stopped at ${state.y} of ${state.max}`);
  }
  if (state.hash !== '#contact') fail(`${label}: Contact link left hash "${state.hash}"`);
}

async function checkViewport(browser: Browser, viewport: Viewport): Promise<void> {
  const { width, height, scale } = viewport;
  const label = `${width}x${height}`;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => fail(`${label}: page error: ${error.message}`));

  await openPage(page);

  const overflow = await hasOverflow(page);
  if (overflow > 0) fail(`${label}: horizontal overflow of ${overflow}px`);

  await checkHeights(page, label, height);
  await checkStack(page, label, width);
  await visitSections(page, label, width);
  if (width >= STACK_FROM) await checkSnap(page, label);
  await checkAnchor(page, label);

  await context.close();
}

/** On a short window a section outgrows the screen: snap must leave it alone. */
async function checkTallSection(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1024, height: 420 } });
  const page = await context.newPage();
  await openPage(page);

  const fit = await page.evaluate(() => {
    const section = document.getElementById('solutions')!;
    return { height: section.offsetHeight, screen: window.innerHeight };
  });
  const top = await pageTop(page, 'solutions');
  const inside = top + Math.round((fit.height - fit.screen) / 2);

  await instantScroll(page, inside);
  await page.waitForTimeout(1300);
  const rest = await page.evaluate(() => Math.round(window.scrollY));
  if (Math.abs(rest - inside) > SNAP_TOLERANCE_PX) {
    fail(`tall section: snap moved ${inside} to ${rest}`);
  }
  console.log(`tall section: ${fit.height}px on a ${fit.screen}px screen, stays at ${rest}`);
  await context.close();
}

async function checkPerformance(browser: Browser, viewport: Viewport): Promise<void> {
  const { width, height } = viewport;
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  await openPage(page);
  await page.waitForTimeout(1500);

  const result = await page.evaluate(async (durationMs) => {
    const longTasks: number[] = [];
    new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => longTasks.push(Math.round(entry.duration)));
    }).observe({ type: 'longtask' });

    const frames: number[] = [];
    let last = performance.now();
    let running = true;
    const onFrame = (now: number) => {
      frames.push(now - last);
      last = now;
      if (running) requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);

    const max = document.documentElement.scrollHeight - window.innerHeight;
    const start = performance.now();
    await new Promise<void>((done) => {
      const step = () => {
        const progress = (performance.now() - start) / durationMs;
        window.scrollTo({ top: Math.min(progress, 1) * max, behavior: 'instant' });
        if (progress < 1) requestAnimationFrame(step);
        else done();
      };
      step();
    });
    running = false;

    frames.shift();
    const sorted = [...frames].sort((a, b) => a - b);
    return {
      frames: sorted.length,
      median: sorted[sorted.length >> 1]!,
      p95: sorted[Math.floor(sorted.length * 0.95)]!,
      worst: sorted[sorted.length - 1]!,
      slow: sorted.filter((frame) => frame > 33.4).length,
      longTasks,
    };
  }, 9000);

  const label = `CPU x${CPU_SLOWDOWN} ${width}x${height}`;
  if (result.longTasks.length > 0) {
    fail(`${label}: long tasks while scrolling: ${result.longTasks.join(', ')} ms`);
  }
  console.log(
    `${label}: ${result.frames} frames, median ${result.median.toFixed(1)} ms, ` +
      `p95 ${result.p95.toFixed(1)} ms, worst ${result.worst.toFixed(1)} ms, ` +
      `over ${FRAME_BUDGET_MS} ms: ${result.slow}, long tasks ${result.longTasks.length}`,
  );
  await context.close();
}

/** Without motion all content must be there and nothing is pinned. */
async function expectStaticPage(page: Page, label: string): Promise<void> {
  const state = await page.evaluate(() => ({
    motion: document.documentElement.classList.contains('motion'),
    pins: document.querySelectorAll('.pin-spacer').length,
    hidden: [...document.querySelectorAll('[data-reveal], [data-split], [data-panel]')].filter(
      (element) => getComputedStyle(element).opacity !== '1',
    ).length,
  }));
  if (state.motion) fail(`${label}: motion class still set`);
  if (state.pins > 0) fail(`${label}: sections are pinned`);
  if (state.hidden > 0) fail(`${label}: ${state.hidden} elements stay hidden`);
  console.log(`${label}: ok`);
}

async function checkFallbacks(browser: Browser): Promise<void> {
  const viewport = { width: 1440, height: 900 };

  const blocked = await browser.newContext({ viewport });
  const blockedPage = await blocked.newPage();
  await blockedPage.route('**/gsap.*.js', (route) => route.abort());
  await blockedPage.goto(URL_BASE, { waitUntil: 'load' });
  await blockedPage.waitForTimeout(3000);
  await expectStaticPage(blockedPage, 'gsap chunk blocked');
  await blocked.close();

  const reduced = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  const requests: string[] = [];
  reducedPage.on('request', (request) => requests.push(request.url()));
  await reducedPage.goto(URL_BASE, { waitUntil: 'load' });
  await reducedPage.waitForTimeout(500);
  await expectStaticPage(reducedPage, 'reduced motion');
  if (requests.some((url) => url.includes('gsap.'))) fail('reduced motion: gsap was loaded');
  await reduced.close();

  const noScript = await browser.newContext({ viewport, javaScriptEnabled: false });
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(URL_BASE, { waitUntil: 'load' });
  const text = await noScriptPage.locator('main').innerText();
  if (!text.toUpperCase().includes('FIBER OPTIC')) fail('javascript off: content is missing');
  await noScriptPage.screenshot({ path: `${OUT}/no-js.png` });
  await noScript.close();
  console.log('javascript off: ok');
}

await mkdir(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch();

try {
  for (const viewport of VIEWPORTS) await checkViewport(browser, viewport);
  await checkTallSection(browser);
  await checkPerformance(browser, VIEWPORTS[1]!);
  await checkPerformance(browser, VIEWPORTS[4]!);
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
