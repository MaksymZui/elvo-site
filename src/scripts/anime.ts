// The only module that touches animejs. Imported dynamically, so the library stays out of the entry chunk.
export {
  animate,
  createDrawable,
  createMotionPath,
  createScope,
  createTimeline,
  cubicBezier,
  onScroll,
  splitText,
  stagger,
  utils,
} from 'animejs';
