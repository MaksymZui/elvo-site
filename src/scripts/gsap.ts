// The only module that touches gsap. Imported dynamically, so the library stays out of the entry chunk.
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(DrawSVGPlugin, ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText };
