import type * as Gsap from './gsap';

declare global {
  interface Window {
    __motionGuard?: number;
  }
}

type GsapApi = typeof Gsap;

const root = document.documentElement;
const LARGE = '(min-width: 768px) and (prefers-reduced-motion: no-preference)';
const SMALL = '(max-width: 767px) and (prefers-reduced-motion: no-preference)';
const EASE = 'power3.out';
const ZOOM_LARGE = 1.08;
const ZOOM_SMALL = 1.04;

const whenEntering = (section: Element) => ({
  trigger: section,
  start: 'top 70%',
  once: true,
});

function revealHeading({ gsap, SplitText }: GsapApi, section: Element): void {
  const heading = section.querySelector<HTMLElement>('[data-split]');
  if (!heading) return;

  SplitText.create(heading, {
    type: 'words',
    mask: 'words',
    autoSplit: true,
    onSplit: (self) => {
      gsap.set(heading, { opacity: 1 });
      return gsap.from(self.words, {
        yPercent: 110,
        duration: 0.8,
        stagger: 0.07,
        ease: EASE,
        scrollTrigger: whenEntering(section),
      });
    },
  });
}

/** Text first, media last, whatever the DOM order is. */
function revealOrder(section: Element): Element[] {
  const items = [...section.querySelectorAll('[data-reveal]')];
  const isMedia = (item: Element) => item.matches('.model__image, .callouts, .callout');
  return [...items.filter((item) => !isMedia(item)), ...items.filter(isMedia)];
}

function revealContent({ gsap }: GsapApi, section: Element): void {
  const items = revealOrder(section);
  if (items.length > 0) {
    gsap.fromTo(
      items,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        delay: 0.3,
        stagger: 0.09,
        ease: EASE,
        scrollTrigger: whenEntering(section),
      },
    );
  }

  const panels = section.querySelectorAll('[data-panel]');
  if (panels.length > 0) {
    gsap.fromTo(
      panels,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        delay: 0.4,
        stagger: 0.07,
        ease: EASE,
        scrollTrigger: whenEntering(section),
      },
    );
  }
}

function zoomBackground({ gsap }: GsapApi, section: Element, scale: number): void {
  const frame = section.querySelector('[data-zoom]');
  if (!frame) return;

  gsap.fromTo(
    frame,
    { scale: 1 },
    {
      scale,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'clamp(top bottom)',
        end: 'bottom top',
        scrub: true,
      },
    },
  );
}

function runFiberLight({ gsap }: GsapApi): void {
  const light = document.querySelector<SVGSVGElement>('[data-fiber-light]');
  if (!light) return;

  gsap.set(light, { opacity: 0.9 });
  gsap.fromTo(
    light.querySelectorAll('path'),
    { drawSVG: '0% 0%' },
    {
      keyframes: [
        { drawSVG: '0% 12%', duration: 0.3 },
        { drawSVG: '88% 100%', duration: 2 },
        { drawSVG: '100% 100%', duration: 0.3 },
      ],
      ease: 'none',
      stagger: { each: 0.32, repeat: -1 },
      scrollTrigger: {
        trigger: light.closest('[data-section]'),
        start: 'top bottom',
        end: 'bottom top',
        toggleActions: 'play pause resume pause',
      },
    },
  );
}

async function start(): Promise<void> {
  if (!root.classList.contains('motion')) return;

  let api: GsapApi;
  try {
    api = await import('./gsap');
  } catch {
    root.classList.remove('motion');
    return;
  }

  // The guard already gave up: the page is static now, do not hide it again
  if (!root.classList.contains('motion')) return;
  window.clearTimeout(window.__motionGuard);

  const { gsap, ScrollTrigger } = api;
  const media = gsap.matchMedia();

  media.add({ large: LARGE, small: SMALL }, (context) => {
    const large = Boolean(context.conditions?.['large']);
    const sections = gsap.utils.toArray<HTMLElement>('[data-section]');

    sections.forEach((section) => {
      revealHeading(api, section);
      revealContent(api, section);
      zoomBackground(api, section, large ? ZOOM_LARGE : ZOOM_SMALL);
    });
    runFiberLight(api);
  });

  void document.fonts.ready.then(() => ScrollTrigger.refresh());

  window.addEventListener(
    'pagehide',
    (event) => {
      if (!event.persisted) media.revert();
    },
    { once: true },
  );
}

void start();
