import Swiper from 'swiper';
import { EffectCreative, Mousewheel } from 'swiper/modules';

const SPEED = 900;

/** Keeps the old slide readable until it is gone, then rewinds its reveals for the next visit. */
function markActive(swiper: Swiper): void {
  swiper.slides[swiper.activeIndex]?.classList.add('is-in', 'is-playing');
}

function clearInactive(swiper: Swiper): void {
  swiper.slides.forEach((slide, index) => {
    if (index !== swiper.activeIndex) slide.classList.remove('is-in', 'is-playing');
  });
}

export function startSlider(): () => void {
  const swiper = new Swiper('#main', {
    modules: [EffectCreative, Mousewheel],
    wrapperClass: 'screens',
    slideClass: 'screen',
    direction: 'vertical',
    speed: SPEED,
    simulateTouch: false,
    effect: 'creative',
    creativeEffect: {
      prev: { shadow: true, translate: [0, 0, -1], scale: 0.9 },
      next: { translate: [0, '100%', 0] },
    },
    mousewheel: {
      thresholdDelta: 10,
      thresholdTime: SPEED + 400,
      releaseOnEdges: false,
      eventsTarget: 'body',
    },
    on: {
      init: markActive,
      slideChange: markActive,
      slideChangeTransitionEnd: clearInactive,
    },
  });

  return () => swiper.destroy(true, true);
}
