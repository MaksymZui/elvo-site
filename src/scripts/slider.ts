import Swiper from 'swiper';
import {
  A11y,
  EffectCreative,
  HashNavigation,
  Keyboard,
  Mousewheel,
  Pagination,
} from 'swiper/modules';

const SPEED = 900;
/**
 * A pause this long ends a wheel gesture: trackpad inertia keeps events coming until it fades.
 * Gaps inside a simulated flick reached 128 ms, so a lower value splits one gesture in two.
 */
const GESTURE_GAP_MS = 200;

/** Keeps the old slide readable until it is gone, then rewinds its reveals for the next visit. */
function markActive(swiper: Swiper): void {
  swiper.slides[swiper.activeIndex]?.classList.add('is-in', 'is-playing');
}

function clearInactive(swiper: Swiper): void {
  swiper.slides.forEach((slide, index) => {
    if (index !== swiper.activeIndex) slide.classList.remove('is-in', 'is-playing');
  });
}

/** Neighbours are off screen, so lazy images would still be loading when they slide in. */
function preloadNeighbours(swiper: Swiper): void {
  [swiper.activeIndex - 1, swiper.activeIndex + 1].forEach((index) => {
    swiper.slides[index]?.querySelectorAll('img').forEach((image) => {
      if (image.getClientRects().length > 0) image.loading = 'eager';
    });
  });
}

function focusActive(swiper: Swiper): void {
  const slide = swiper.slides[swiper.activeIndex];
  if (!slide || slide.contains(document.activeElement)) return;
  slide.tabIndex = -1;
  slide.focus({ preventScroll: true });
}

/** True while the wheel should move a slide taller than the screen, not the slider. */
function scrollsInsideSlide(event: WheelEvent): boolean {
  const body = (event.target as Element).closest<HTMLElement>('[data-screen-body]');
  if (!body || body.scrollHeight <= body.clientHeight + 1) return false;

  return event.deltaY > 0
    ? body.scrollTop + body.clientHeight < body.scrollHeight - 1
    : body.scrollTop > 0;
}

/** Fitting slides leave the swipe to Swiper; one that outgrows the screen keeps its own scroll. */
function markTallSlides(swiper: Swiper): void {
  swiper.slides.forEach((slide) => {
    const body = slide.querySelector<HTMLElement>('[data-screen-body]');
    body?.classList.toggle('is-tall', body.scrollHeight > body.clientHeight + 1);
  });
}

/** Swiper adds a shadow only after it set the transition time, so the first one would pop in. */
function addShadows(slides: HTMLElement[]): void {
  slides.forEach((slide) => {
    const shadow = document.createElement('div');
    shadow.className = 'swiper-slide-shadow swiper-slide-shadow-creative';
    slide.append(shadow);
  });
}

function createDots(main: HTMLElement): HTMLElement {
  const dots = document.createElement('div');
  dots.className = 'dots';
  dots.setAttribute('role', 'group');
  dots.setAttribute('aria-label', main.dataset['slidesLabel'] ?? '');
  main.append(dots);
  return dots;
}

export function startSlider(): () => void {
  const main = document.getElementById('main')!;
  const dots = createDots(main);
  const slides = [...main.querySelectorAll<HTMLElement>('[data-section]')];
  const labels = slides.map((slide) => slide.dataset['label']);
  addShadows(slides);

  let gestureSpent = false;
  let lastWheelAt = 0;

  const swiper = new Swiper(main, {
    modules: [A11y, EffectCreative, HashNavigation, Keyboard, Mousewheel, Pagination],
    wrapperClass: 'screens',
    slideClass: 'screen',
    direction: 'vertical',
    speed: SPEED,
    simulateTouch: false,
    longSwipesRatio: 0.25,
    effect: 'creative',
    creativeEffect: {
      prev: { shadow: true, translate: [0, 0, -1], scale: 0.9 },
      next: { translate: [0, '100%', 0] },
    },
    mousewheel: { thresholdDelta: 10, releaseOnEdges: false, eventsTarget: 'body' },
    keyboard: { enabled: true },
    pagination: {
      el: dots,
      clickable: true,
      bulletClass: 'dots__bullet',
      bulletActiveClass: 'dots__bullet--active',
      renderBullet: (index, className) =>
        `<button type="button" class="${className}"><span class="dots__label">${labels[index]}</span></button>`,
    },
    // replaceState: assigning location.hash would make the browser scroll to the section
    hashNavigation: { watchState: true, replaceState: true },
    a11y: { slideRole: 'group', slideLabelMessage: '', wrapperLiveRegion: false },
    on: {
      init(instance) {
        markActive(instance);
        markTallSlides(instance);
        preloadNeighbours(instance);
      },
      resize: markTallSlides,
      slideChange(instance) {
        gestureSpent = true;
        markActive(instance);
        preloadNeighbours(instance);
      },
      slideChangeTransitionEnd(instance) {
        clearInactive(instance);
        focusActive(instance);
      },
    },
  });

  // A11y has no switch for its live region
  main.querySelector('.swiper-notification')?.remove();

  const onAnchorClick = (event: MouseEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;

    if (link.hash === `#${main.id}`) {
      event.preventDefault();
      focusActive(swiper);
      return;
    }

    const index = swiper.slides.findIndex((slide) => `#${slide.dataset['hash']}` === link.hash);
    if (index < 0) return;
    event.preventDefault();
    window.history.pushState(null, '', link.hash);
    swiper.slideTo(index);
  };

  // The Keyboard module has no Space. On a link or button Space must keep its own meaning
  const onSpace = (event: KeyboardEvent) => {
    if (event.code !== 'Space') return;
    if ((event.target as Element).closest('a, button, input, select, textarea')) return;
    event.preventDefault();
    if (event.shiftKey) swiper.slidePrev();
    else swiper.slideNext();
  };

  // One gesture, one slide: Swiper's own thresholds cannot tell inertia from a new push, and a long
  // flick outlasts the transition. A gesture that scrolled inside a slide stops at its edge too.
  const onWheel = (event: WheelEvent) => {
    // A pause during the transition proves nothing: the main thread is busy, inertia may go on
    if (!swiper.animating && event.timeStamp - lastWheelAt > GESTURE_GAP_MS) gestureSpent = false;
    lastWheelAt = event.timeStamp;
    if (scrollsInsideSlide(event)) gestureSpent = true;
    if (gestureSpent) event.stopPropagation();
  };

  document.addEventListener('click', onAnchorClick);
  document.addEventListener('keydown', onSpace);
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });

  return () => {
    document.removeEventListener('click', onAnchorClick);
    document.removeEventListener('keydown', onSpace);
    window.removeEventListener('wheel', onWheel, { capture: true });

    swiper.destroy(true, true);
    dots.remove();
    main.querySelectorAll('.swiper-slide-shadow').forEach((shadow) => shadow.remove());
    slides.forEach((slide) => {
      slide.removeAttribute('role');
      slide.removeAttribute('tabindex');
    });
  };
}
