import type * as Anime from './anime';
import { startDrone } from './drone';

declare global {
  interface Window {
    __motionGuard?: number;
  }
}

type AnimeApi = typeof Anime;

const root = document.documentElement;

function introHero({ animate, cubicBezier, splitText, stagger }: AnimeApi): void {
  const heading = document.querySelector<HTMLElement>('[data-split]');
  if (!heading) return;

  splitText(heading, { words: { wrap: 'clip' } }).addEffect(({ words }) => {
    heading.style.opacity = '1';
    return animate(words, {
      y: ['110%', '0%'],
      duration: 900,
      delay: stagger(80),
      ease: cubicBezier(0.22, 1, 0.36, 1),
    });
  });
}

function parallaxHero({ animate, onScroll }: AnimeApi): void {
  animate('[data-parallax] img', {
    translateY: ['0%', '6%'],
    ease: 'linear',
    autoplay: onScroll({ target: '#top', enter: 'top top', leave: 'top bottom', sync: true }),
  });
}

/** Text first, media last, whatever the DOM order is. */
function revealOrder(section: Element): Element[] {
  const items = [...section.querySelectorAll('[data-reveal]')];
  const isMedia = (item: Element) => item.matches('.stage__media, .model__image, .callouts');
  return [...items.filter((item) => !isMedia(item)), ...items.filter(isMedia)];
}

function revealSections({ createTimeline, cubicBezier, onScroll, stagger }: AnimeApi): void {
  const defaults = { duration: 700, ease: cubicBezier(0.22, 1, 0.36, 1) };

  document.querySelectorAll('[data-section]').forEach((section) => {
    const items = revealOrder(section);
    const panels = section.querySelectorAll('[data-panel]');
    const timeline = createTimeline({
      defaults,
      autoplay: onScroll({ target: section, enter: 'bottom-=12% top', repeat: false }),
    });

    if (items.length > 0) {
      timeline.add(items, { opacity: [0, 1], y: [32, 0], delay: stagger(90) });
    }
    if (panels.length > 0) {
      timeline.add(panels, { opacity: [0, 1], y: [32, 0], delay: stagger(60) }, '-=400');
    }
  });
}

function runFiberLight({ animate, createDrawable, onScroll, stagger }: AnimeApi): void {
  const light = document.querySelector<SVGSVGElement>('[data-fiber-light]');
  if (!light) return;

  light.style.opacity = '.9';
  animate(createDrawable(light.querySelectorAll('path')), {
    draw: ['0 0', '0 .12', '.88 1', '1 1'],
    duration: 2600,
    delay: stagger(320),
    loop: true,
    ease: 'linear',
    autoplay: onScroll({ target: light.parentElement!, sync: 'play pause' }),
  });
}

async function start(): Promise<void> {
  if (!root.classList.contains('motion')) return;

  let anime: AnimeApi;
  try {
    anime = await import('./anime');
  } catch {
    root.classList.remove('motion');
    return;
  }

  // The guard already gave up: the page is static now, do not hide it again
  if (!root.classList.contains('motion')) return;
  window.clearTimeout(window.__motionGuard);

  const scope = anime.createScope().add(() => {
    introHero(anime);
    parallaxHero(anime);
    revealSections(anime);
    runFiberLight(anime);
  });
  const stopDrone = startDrone(anime);

  window.addEventListener(
    'pagehide',
    (event) => {
      if (event.persisted) return;
      stopDrone();
      scope.revert();
    },
    { once: true },
  );
}

void start();
