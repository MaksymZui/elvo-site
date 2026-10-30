export {};

declare global {
  interface Window {
    __motionGuard?: number;
  }
}

const root = document.documentElement;
const screens = [...document.querySelectorAll<HTMLElement>('[data-section]')];

/** Text first, media last, whatever the DOM order is. */
function numberReveals(screen: HTMLElement): void {
  const items = [...screen.querySelectorAll<HTMLElement>('[data-reveal]')];
  const isMedia = (item: Element) => item.matches('.model__image, .callouts, .callout');
  [...items.filter((item) => !isMedia(item)), ...items.filter(isMedia)].forEach((item, index) => {
    item.style.setProperty('--i', String(index));
  });
}

function observeScreens(): void {
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
}

function start(): void {
  window.clearTimeout(window.__motionGuard);
  if (!root.classList.contains('motion')) return;

  screens.forEach(numberReveals);
  observeScreens();
}

start();
