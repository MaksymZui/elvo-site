import { mkdir } from 'node:fs/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { startPreview, URL_BASE } from './preview.ts';

const OUT = '.local/shots';
const SECTIONS = ['top', 'drones', 'payload', 'fiber', 'solutions', 'contact'];
const CPU_SLOWDOWN = 4;
const FRAME_BUDGET_MS = 33.4;
/** Longer than the transition plus the wheel lock in slider.ts. */
const SETTLE_MS = 1600;

interface Viewport {
  width: number;
  height: number;
  scale: number;
}

const SLIDER_VIEWPORTS: Viewport[] = [
  { width: 1440, height: 900, scale: 1 },
  { width: 1024, height: 768, scale: 1 },
  { width: 768, height: 1024, scale: 1 },
];

const SCROLL_VIEWPORTS: Viewport[] = [
  { width: 390, height: 844, scale: 2 },
  { width: 360, height: 640, scale: 2 },
];

/** Lowest screens that still get the slider: every slide must fit without inner scrolling. */
const FIT_VIEWPORTS: Viewport[] = [
  { width: 1366, height: 650, scale: 1 },
  { width: 1536, height: 650, scale: 1 },
  { width: 1024, height: 650, scale: 1 },
  { width: 900, height: 650, scale: 1 },
  { width: 768, height: 650, scale: 1 },
];

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

function expectEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) fail(`${message}: got ${actual}, expected ${expected}`);
}

const slideIndex = (page: Page) =>
  page.evaluate(
    () =>
      (document.getElementById('main') as HTMLElement & { swiper?: { activeIndex: number } }).swiper
        ?.activeIndex ?? -1,
  );

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function openPage(page: Page, path = ''): Promise<void> {
  await page.goto(`${URL_BASE}${path}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
}

async function openSlider(page: Page, path = ''): Promise<void> {
  await openPage(page, path);
  await page.waitForFunction(() =>
    document.getElementById('main')?.classList.contains('swiper-initialized'),
  );
  // The wheel lock counts from the slider's start
  await page.waitForTimeout(SETTLE_MS);
}

async function checkAccessibility(page: Page, label: string): Promise<void> {
  const state = await page.evaluate(() => {
    const slides = [...document.querySelectorAll<HTMLElement>('[data-section]')];
    return {
      roles: slides.every((slide) => slide.getAttribute('role') === 'group'),
      labels: slides.map((slide) => slide.getAttribute('aria-label')).join(','),
      notification: document.querySelectorAll('.swiper-notification').length,
      live: document.querySelector('.screens')!.getAttribute('aria-live'),
      bullets: [...document.querySelectorAll('.dots__bullet')].map((bullet) => bullet.tagName),
    };
  });
  if (!state.roles) fail(`${label}: slides have no group role`);
  expectEqual(
    state.labels,
    'Home,Drones,Payload,Fiber Optic,Solutions,Contact',
    `${label}: labels`,
  );
  expectEqual(state.notification, 0, `${label}: live region`);
  expectEqual(state.live, null, `${label}: wrapper aria-live`);
  if (state.bullets.some((tag) => tag !== 'BUTTON')) fail(`${label}: dots are not buttons`);
}

async function checkPagination(page: Page, label: string): Promise<void> {
  const bullets = page.locator('.dots__bullet');
  expectEqual(await bullets.count(), SECTIONS.length, `${label}: dots`);

  await bullets.nth(2).hover();
  await page.waitForTimeout(400);
  const hint = await bullets
    .nth(2)
    .locator('.dots__label')
    .evaluate((el) => ({
      opacity: getComputedStyle(el).opacity,
      text: el.textContent,
    }));
  expectEqual(hint.opacity, '1', `${label}: dot label on hover`);
  expectEqual(hint.text, 'Payload', `${label}: dot label text`);

  await bullets.nth(2).click();
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), 2, `${label}: dot click`);

  const focusOnSlide = await page.evaluate(
    () => document.activeElement === document.querySelector('.swiper-slide-active'),
  );
  if (!focusOnSlide) fail(`${label}: focus did not move into the active slide`);
}

async function checkKeyboard(page: Page, label: string): Promise<void> {
  const presses: [string, number][] = [
    ['ArrowDown', 3],
    ['ArrowUp', 2],
    ['PageDown', 3],
    ['PageUp', 2],
    ['Space', 3],
    ['Shift+Space', 2],
  ];
  for (const [key, expected] of presses) {
    await page.keyboard.press(key);
    await page.waitForTimeout(SETTLE_MS);
    expectEqual(await slideIndex(page), expected, `${label}: ${key}`);
  }
}

const jumpTo = async (page: Page, index: number) => {
  await page.evaluate((target) => {
    (
      document.getElementById('main') as HTMLElement & {
        swiper: { slideTo: (index: number, speed: number) => void };
      }
    ).swiper.slideTo(target, 0);
  }, index);
  await page.waitForTimeout(SETTLE_MS);
};

/** Trackpad flick: a push, then inertia that fades for over a second with small bumps. */
async function flick(page: Page, direction = 1): Promise<void> {
  for (let step = 0; step < 90; step += 1) {
    const inertia = 90 * Math.exp(-step / 22);
    await page.mouse.wheel(0, direction * Math.max(inertia + (step % 7 === 0 ? 6 : 0), 1));
    await page.waitForTimeout(16);
  }
}

async function checkWheel(page: Page, label: string): Promise<void> {
  const start = 1;
  await page.mouse.move(700, 450);

  await jumpTo(page, start);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), start + 1, `${label}: one wheel notch`);

  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), start, `${label}: wheel back`);

  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(100);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), start + 1, `${label}: double notch`);

  await jumpTo(page, start);
  await flick(page);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), start + 1, `${label}: trackpad flick`);

  await flick(page, -1);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), start, `${label}: trackpad flick back`);

  // The very next gesture must work: nothing stays locked once inertia has ended
  await flick(page);
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), start + 2, `${label}: next gesture after a flick`);

  await jumpTo(page, start);
  await page.mouse.move(700, 20);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), start + 1, `${label}: wheel over the header`);

  await page.mouse.move(700, 450);
  await jumpTo(page, 0);
}

async function checkEdges(page: Page, label: string): Promise<void> {
  await page.locator('.dots__bullet').last().click();
  await page.waitForTimeout(SETTLE_MS);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), SECTIONS.length - 1, `${label}: wheel past the last slide`);
  const scrolled = await page.evaluate(() => window.scrollY);
  expectEqual(scrolled, 0, `${label}: page scroll on the last slide`);
}

async function checkHashes(browser: Browser, viewport: Viewport): Promise<void> {
  const label = 'hash';
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  await openSlider(page);
  await page.getByRole('banner').getByRole('link', { name: 'Fiber Optic' }).click();
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), 3, `${label}: menu link`);
  expectEqual(new URL(page.url()).hash, '#fiber', `${label}: url after menu link`);

  await page.getByRole('banner').getByRole('link', { name: 'Contact' }).click();
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), 5, `${label}: Contact button`);

  await page.goBack();
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), 3, `${label}: back button`);

  await context.close();

  for (const [index, id] of SECTIONS.entries()) {
    if (id === 'top') continue;
    const direct = await browser.newContext({ viewport });
    const directPage = await direct.newPage();
    await openSlider(directPage, `#${id}`);
    expectEqual(await slideIndex(directPage), index, `${label}: direct link #${id}`);
    await direct.close();
  }
  console.log('hash links: ok');
}

async function checkSliderViewport(browser: Browser, viewport: Viewport): Promise<void> {
  const { width, height, scale } = viewport;
  const label = `${width}x${height}`;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => fail(`${label}: page error: ${error.message}`));

  await openSlider(page);

  expectEqual(await horizontalOverflow(page), 0, `${label}: horizontal overflow`);
  const range = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expectEqual(range, 0, `${label}: page scroll range`);

  await checkAccessibility(page, label);

  for (const [index, id] of SECTIONS.entries()) {
    await page.locator('.dots__bullet').nth(index).click();
    await page.waitForTimeout(2200);
    expectEqual(await slideIndex(page), index, `${label}: slide ${id}`);
    await page.mouse.move(width / 2, height / 2);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${width}-${id}.png` });

    const slide = await page.evaluate((name) => {
      const section = document.getElementById(name)!;
      const body = section.querySelector<HTMLElement>('[data-screen-body]')!;
      const others = [...document.querySelectorAll('.screen.is-in')].filter((el) => el !== section);
      const hidden = [...section.querySelectorAll('[data-reveal], [data-panel]')].filter(
        (el) => el.getClientRects().length > 0 && getComputedStyle(el).opacity !== '1',
      );
      return {
        overflow: body.scrollHeight - body.clientHeight,
        stale: others.length,
        hidden: hidden.length,
      };
    }, id);
    if (slide.overflow > 0) fail(`${label}: slide ${id} is ${slide.overflow}px too tall`);
    expectEqual(slide.stale, 0, `${label}: revealed slides besides ${id}`);
    expectEqual(slide.hidden, 0, `${label}: hidden elements on ${id}`);
  }

  console.log(`${label}: slider ok`);
  await context.close();
}

async function checkControls(browser: Browser, viewport: Viewport): Promise<void> {
  const label = `controls ${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await openSlider(page);

  await checkWheel(page, label);
  await checkPagination(page, label);
  await checkKeyboard(page, label);
  await checkEdges(page, label);

  console.log(`${label}: ok`);
  await context.close();
}

/** Tab into the next slide must bring that slide on screen. */
async function checkTabbing(browser: Browser, viewport: Viewport): Promise<void> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await openSlider(page, '#solutions');

  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#contact .contact__mail')!.focus();
  });
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), 5, 'focus into a slide');
  await context.close();
  console.log('tabbing: ok');
}

async function checkInnerScroll(browser: Browser, viewport: Viewport): Promise<void> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '#drones .stage__copy { padding-block: 40rem; }';
      document.head.append(style);
    });
  });
  await openSlider(page, '#drones');
  await page.mouse.move(viewport.width / 2, viewport.height / 2);

  const scrollTop = () =>
    page.evaluate(() => document.querySelector('#drones [data-screen-body]')!.scrollTop);

  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(500);
  expectEqual(await slideIndex(page), 1, 'tall slide: wheel stays inside');
  if ((await scrollTop()) === 0) fail('tall slide: wheel did not scroll it');

  // One long push runs into the edge: the rest of it must not flip the slide
  await page.evaluate(() => {
    const body = document.querySelector('#drones [data-screen-body]')!;
    body.scrollTop = body.scrollHeight - body.clientHeight - 120;
  });
  await page.waitForTimeout(400);
  await flick(page);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), 1, 'tall slide: a gesture stops at the edge');

  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), 2, 'tall slide: wheel passes on at the edge');

  await context.close();
  console.log('tall slide: ok');
}

/** Tablets have no wheel: a swipe must change the slide, and one slide only. */
async function checkSwipe(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await openSlider(page);

  const cdp = await context.newCDPSession(page);
  const touch = (type: string, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: 384, y }],
    });

  await touch('touchStart', 800);
  for (let y = 780; y >= 300; y -= 40) {
    await touch('touchMove', y);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', 300);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), 1, 'swipe up');

  await context.close();
  console.log('swipe: ok');
}

async function checkModeSwitch(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await openSlider(page);
  await page.locator('.dots__bullet').nth(3).click();
  await page.waitForTimeout(SETTLE_MS);

  await page.setViewportSize({ width: 1440, height: 640 });
  await page.waitForTimeout(800);
  const scrolling = await page.evaluate(() => ({
    slider: document.documentElement.classList.contains('slider'),
    swiper: document.getElementById('main')!.classList.contains('swiper-initialized'),
    dots: document.querySelectorAll('.dots').length,
    shadows: document.querySelectorAll('.swiper-slide-shadow').length,
    styled: document.getElementById('top')!.getAttribute('style'),
    range: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expectEqual(scrolling.slider, false, 'switch to scroll: html.slider');
  expectEqual(scrolling.swiper, false, 'switch to scroll: swiper');
  expectEqual(scrolling.dots, 0, 'switch to scroll: dots');
  expectEqual(scrolling.shadows, 0, 'switch to scroll: shadows');
  expectEqual(Boolean(scrolling.styled), false, 'switch to scroll: inline styles');
  if (scrolling.range <= 0) fail('switch to scroll: the page does not scroll');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() =>
    document.getElementById('main')?.classList.contains('swiper-initialized'),
  );
  await page.waitForTimeout(SETTLE_MS);
  await page.mouse.move(700, 450);
  const before = await slideIndex(page);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(SETTLE_MS);
  expectEqual(await slideIndex(page), before + 1, 'switch back: wheel');

  await context.close();
  console.log('mode switch: ok');
}

async function checkThreshold(browser: Browser): Promise<void> {
  for (const viewport of FIT_VIEWPORTS) {
    const label = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await openSlider(page);
    const tall = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-screen-body]')]
        .filter((body) => body.scrollHeight > body.clientHeight)
        .map((body) => body.closest('section')!.id),
    );
    if (tall.length > 0) fail(`${label}: slides too tall: ${tall.join(', ')}`);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1366, height: 649 } });
  const page = await context.newPage();
  await openPage(page);
  await page.waitForTimeout(500);
  const slider = await page.evaluate(() => document.documentElement.classList.contains('slider'));
  expectEqual(slider, false, '1366x649: slider below the threshold');
  await context.close();
  console.log('threshold 650: all slides fit');
}

async function checkScrollViewport(browser: Browser, viewport: Viewport): Promise<void> {
  const { width, height, scale } = viewport;
  const label = `${width}x${height}`;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => fail(`${label}: page error: ${error.message}`));

  await openPage(page);
  await page.waitForTimeout(800);

  expectEqual(await horizontalOverflow(page), 0, `${label}: horizontal overflow`);
  if (requests.some((url) => url.includes('slider.'))) fail(`${label}: slider chunk was loaded`);

  const heights = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-section]')].map((section) => ({
      id: section.id,
      value: section.offsetHeight,
    })),
  );
  for (const { id, value } of heights) {
    if (value < height - 1) fail(`${label}: #${id} is ${value}px, shorter than the screen`);
  }
  const grown = heights.filter(({ value }) => value > height + 1).map(({ id }) => id);

  for (const id of SECTIONS) {
    await page.evaluate((name) => {
      document.getElementById(name)!.scrollIntoView({ behavior: 'instant' });
    }, id);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${OUT}/${width}-${id}.png` });
  }

  const hidden = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-reveal], [data-panel]')].filter(
        (el) => el.getClientRects().length > 0 && getComputedStyle(el).opacity !== '1',
      ).length,
  );
  expectEqual(hidden, 0, `${label}: elements that never appeared`);

  console.log(`${label}: scroll ok${grown.length > 0 ? `, grown: ${grown.join(', ')}` : ''}`);
  await context.close();
}

const measureFrames = (page: Page, action: string, durationMs: number) =>
  page.evaluate(
    async ({ script, duration }) => {
      const longTasks: number[] = [];
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => longTasks.push(Math.round(entry.duration)));
      }).observe({ type: 'longtask' });

      const frames: number[] = [];
      let last = performance.now();
      const started = last;
      await new Promise<void>((done) => {
        const onFrame = (now: number) => {
          frames.push(now - last);
          last = now;
          if (now - started < duration) requestAnimationFrame(onFrame);
          else done();
        };
        requestAnimationFrame(onFrame);
        new Function(script)();
      });

      frames.shift();
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        frames: sorted.length,
        median: sorted[sorted.length >> 1]!,
        worst: sorted[sorted.length - 1]!,
        slow: sorted.filter((frame) => frame > 33.4).length,
        longTasks,
      };
    },
    { script: action, duration: durationMs },
  );

async function checkPerformance(browser: Browser): Promise<void> {
  const report = (label: string, result: Awaited<ReturnType<typeof measureFrames>>) => {
    if (result.longTasks.length > 0) {
      fail(`${label}: long tasks: ${result.longTasks.join(', ')} ms`);
    }
    console.log(
      `${label}: ${result.frames} frames, median ${result.median.toFixed(1)} ms, ` +
        `worst ${result.worst.toFixed(1)} ms, over ${FRAME_BUDGET_MS} ms: ${result.slow}, ` +
        `long tasks ${result.longTasks.length}`,
    );
  };

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sliderPage = await desktop.newPage();
  const sliderCdp = await desktop.newCDPSession(sliderPage);
  await sliderCdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  await openSlider(sliderPage);
  await sliderPage.waitForTimeout(1500);
  report(
    `CPU x${CPU_SLOWDOWN} slide change 1440x900`,
    await measureFrames(sliderPage, `document.getElementById('main').swiper.slideNext()`, 1600),
  );
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const scrollPage = await phone.newPage();
  const scrollCdp = await phone.newCDPSession(scrollPage);
  await scrollCdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  await openPage(scrollPage);
  await scrollPage.waitForTimeout(1500);
  report(
    `CPU x${CPU_SLOWDOWN} scroll 390x844`,
    await measureFrames(
      scrollPage,
      `const max = document.documentElement.scrollHeight - innerHeight;
       const start = performance.now();
       const step = () => {
         const progress = (performance.now() - start) / 6000;
         scrollTo({ top: Math.min(progress, 1) * max, behavior: 'instant' });
         if (progress < 1) requestAnimationFrame(step);
       };
       step();`,
      6000,
    ),
  );
  await phone.close();
}

/** Without motion the page scrolls, nothing is hidden and the slider never loads. */
async function expectScrollingPage(page: Page, label: string): Promise<void> {
  const state = await page.evaluate(() => ({
    motion: document.documentElement.classList.contains('motion'),
    slider: document.documentElement.classList.contains('slider'),
    swiper: document.getElementById('main')!.classList.contains('swiper-initialized'),
    range: document.documentElement.scrollHeight - window.innerHeight,
    hidden: [...document.querySelectorAll('[data-reveal], [data-panel], .word__in')].filter(
      (el) => {
        const style = getComputedStyle(el);
        return (
          el.getClientRects().length > 0 && (style.opacity !== '1' || style.transform !== 'none')
        );
      },
    ).length,
  }));
  expectEqual(state.slider, false, `${label}: html.slider`);
  expectEqual(state.swiper, false, `${label}: swiper`);
  if (state.range <= 0) fail(`${label}: the page does not scroll`);
  expectEqual(state.hidden, 0, `${label}: hidden elements`);
  console.log(`${label}: ok`);
}

async function checkFallbacks(browser: Browser): Promise<void> {
  const viewport = { width: 1440, height: 900 };

  const reduced = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  const requests: string[] = [];
  reducedPage.on('request', (request) => requests.push(request.url()));
  await openPage(reducedPage);
  await reducedPage.waitForTimeout(500);
  await expectScrollingPage(reducedPage, 'reduced motion');
  if (requests.some((url) => url.includes('slider.'))) fail('reduced motion: slider was loaded');
  await reducedPage.screenshot({ path: `${OUT}/reduced-motion.png` });
  await reduced.close();

  const noScript = await browser.newContext({ viewport, javaScriptEnabled: false });
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(URL_BASE, { waitUntil: 'load' });
  const text = (await noScriptPage.locator('main').innerText()).toUpperCase();
  if (!text.includes('FIBER OPTIC') || !text.includes('SUPPORT@ELVO.TECHNOLOGY')) {
    fail('javascript off: content is missing');
  }
  await noScriptPage.screenshot({ path: `${OUT}/no-js.png` });
  await noScript.close();
  console.log('javascript off: ok');

  const blocked = await browser.newContext({ viewport });
  const blockedPage = await blocked.newPage();
  await blockedPage.route('**/slider.*.js', (route) => route.abort());
  await openPage(blockedPage);
  await blockedPage.waitForTimeout(1500);
  const state = await blockedPage.evaluate(() => ({
    slider: document.documentElement.classList.contains('slider'),
    range: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expectEqual(state.slider, false, 'slider chunk blocked: html.slider');
  if (state.range <= 0) fail('slider chunk blocked: the page does not scroll');
  await blocked.close();
  console.log('slider chunk blocked: ok');
}

await mkdir(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch();
const main: Viewport = SLIDER_VIEWPORTS[0]!;

try {
  for (const viewport of SLIDER_VIEWPORTS) await checkSliderViewport(browser, viewport);
  for (const viewport of SCROLL_VIEWPORTS) await checkScrollViewport(browser, viewport);
  await checkControls(browser, main);
  await checkHashes(browser, main);
  await checkTabbing(browser, main);
  await checkInnerScroll(browser, main);
  await checkSwipe(browser);
  await checkModeSwitch(browser);
  await checkThreshold(browser);
  await checkPerformance(browser);
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
