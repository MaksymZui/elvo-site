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
const STACK_SCALE = 0.92;
const STACK_SHADE = 0.6;

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

const isTaller = (section: HTMLElement) => section.offsetHeight > window.innerHeight + 1;

/** The next section slides over the pinned one, which steps back. A tall one is pinned once read. */
function stackSections({ gsap }: GsapApi, sections: HTMLElement[]): void {
  sections.slice(0, -1).forEach((section) => {
    const body = section.querySelector('[data-screen-body]');
    const shade = section.querySelector('[data-screen-shade]');

    gsap
      .timeline({
        scrollTrigger: {
          trigger: section,
          start: () => (isTaller(section) ? 'bottom bottom' : 'top top'),
          end: () => `+=${window.innerHeight}`,
          pin: true,
          pinSpacing: false,
          anticipatePin: 1,
          scrub: true,
        },
      })
      .to(
        body,
        {
          scale: STACK_SCALE,
          transformOrigin: isTaller(section) ? '50% 100%' : '50% 50%',
          ease: 'none',
        },
        0,
      )
      .to(shade, { opacity: STACK_SHADE, ease: 'none' }, 0);
  });
}

/** A pinned section is out of the flow, its spacer keeps the place in the page. */
function pageTop(section: HTMLElement): number {
  const parent = section.parentElement;
  const box = parent?.classList.contains('pin-spacer') ? parent : section;
  return box.getBoundingClientRect().top + window.scrollY;
}

/** Free inside a section taller than the screen, otherwise the closest section edge. */
function restingPoint(sections: HTMLElement[], y: number): number {
  const edges: number[] = [];
  for (const section of sections) {
    const top = pageTop(section);
    const bottom = top + Math.max(section.offsetHeight - window.innerHeight, 0);
    if (y >= top && y <= bottom) return y;
    edges.push(top, bottom);
  }
  return edges.reduce((best, edge) => (Math.abs(edge - y) < Math.abs(best - y) ? edge : best));
}

function snapToSections({ ScrollTrigger }: GsapApi, sections: HTMLElement[]): void {
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    snap: {
      snapTo: (progress) => {
        const max = ScrollTrigger.maxScroll(window);
        return restingPoint(sections, progress * max) / max;
      },
      duration: { min: 0.2, max: 0.5 },
      delay: 0.12,
      ease: 'power2.inOut',
    },
  });
}

/** ScrollTrigger turns CSS smooth scrolling off, and a pinned section has no usable anchor. */
function followAnchors(sections: HTMLElement[]): () => void {
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    const section = link && sections.find((item) => `#${item.id}` === link.hash);
    if (!section) return;

    event.preventDefault();
    window.scrollTo({ top: pageTop(section), behavior: 'smooth' });
    history.pushState(null, '', link.hash);
    section.tabIndex = -1;
    section.focus({ preventScroll: true });
  };

  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
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

    // Pin and snap fight the address bar and touch inertia on phones
    if (large) {
      stackSections(api, sections);
      snapToSections(api, sections);
    }

    return followAnchors(sections);
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
