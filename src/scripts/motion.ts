import { SLIDER_MEDIA } from '../lib/slider-mode';

declare global {
  interface Window {
    __motionGuard?: number;
  }
}

const root = document.documentElement;
const screens = [...document.querySelectorAll<HTMLElement>('[data-section]')];
const sliderMedia = window.matchMedia(SLIDER_MEDIA);

let stopMode = () => {};
let modeRun = 0;

/** Text first, media last, whatever the DOM order is. */
function numberReveals(screen: HTMLElement): void {
  const items = [...screen.querySelectorAll<HTMLElement>('[data-reveal]')];
  const isMedia = (item: Element) => item.matches('.model__image, .callouts, .callout');
  [...items.filter((item) => !isMedia(item)), ...items.filter(isMedia)].forEach((item, index) => {
    item.style.setProperty('--i', String(index));
  });
}

function observeScreens(): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        target.classList.toggle('is-playing', isIntersecting);
        if (isIntersecting) target.classList.add('is-in');
      });
    },
    { rootMargin: '0px 0px -30% 0px' },
  );
  screens.forEach((screen) => observer.observe(screen));
  return () => observer.disconnect();
}

/** The slider chunk takes a moment: the first screen reveals without waiting for it. */
function showFirstScreen(): void {
  const linked = screens.find((screen) => `#${screen.id}` === window.location.hash);
  (linked ?? screens[0])?.classList.add('is-in', 'is-playing');
}

async function applyMode(): Promise<void> {
  modeRun += 1;
  const run = modeRun;

  stopMode();
  stopMode = () => {};
  screens.forEach((screen) => screen.classList.remove('is-in', 'is-playing'));
  root.classList.toggle('slider', sliderMedia.matches);

  if (!sliderMedia.matches) {
    stopMode = observeScreens();
    return;
  }

  showFirstScreen();
  try {
    const { startSlider } = await import('./slider');
    if (run === modeRun) stopMode = startSlider();
  } catch {
    if (run !== modeRun) return;
    root.classList.remove('slider');
    stopMode = observeScreens();
  }
}

function start(): void {
  window.clearTimeout(window.__motionGuard);
  if (!root.classList.contains('motion')) return;

  screens.forEach(numberReveals);
  sliderMedia.addEventListener('change', applyMode);
  void applyMode();
}

start();
