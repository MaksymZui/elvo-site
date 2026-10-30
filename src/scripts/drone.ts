import type { Timeline } from 'animejs';
import type * as Anime from './anime';

type AnimeApi = typeof Anime;

interface Knot {
  scroll: number;
  x: number;
  y: number;
}

interface Band {
  id: string;
  top: number;
  bottom: number;
}

interface Metrics {
  width: number;
  height: number;
  maxScroll: number;
  droneWidth: number;
  droneHeight: number;
  slotX: number;
  slotY: number;
  contactTop: number;
  heroTextRight: number;
  bands: Band[];
}

const DESKTOP = '(min-width: 1024px)';
const SECTIONS = ['top', 'drones', 'payload', 'fiber', 'solutions'];
const KEEP_CLEAR = '.copy, .model__name';

/** Free column of each section on desktop, as a share of the viewport width. */
const COLUMNS: Record<string, number> = {
  top: 0.72,
  drones: 0.69,
  payload: 0.22,
  fiber: 0.76,
  solutions: 0.86,
  contact: 0.86,
};

const CLEARANCE = 16;
const MIN_HOLD = 40;
const MIN_MOVE = 32;
const TILT_DEG = 10;
const TILT_FROM_PX = 24;
const FLIP_FROM_PX = 1.5;
const LAND_SCALE = 0.92;
const LANE_INSET = 24;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/** Piecewise-linear lookup over ascending `xs`. */
function interpolate(xs: number[], ys: number[], x: number): number {
  const index = xs.findIndex((value) => value >= x);
  if (index <= 0) return index === 0 ? ys[0]! : ys[ys.length - 1]!;
  const from = xs[index - 1]!;
  const to = xs[index]!;
  return lerp(ys[index - 1]!, ys[index]!, (x - from) / (to - from));
}

function measure(probe: HTMLElement, slot: HTMLElement, drone: HTMLElement): Metrics {
  const pageTop = window.scrollY;
  const height = probe.offsetHeight;
  const maxScroll = document.documentElement.scrollHeight - height;
  const slotRect = slot.getBoundingClientRect();
  const droneWidth = drone.offsetWidth;

  const bands = SECTIONS.flatMap((id) => {
    const rects = [...document.querySelectorAll(`#${id} :is(${KEEP_CLEAR})`)].map((element) =>
      element.getBoundingClientRect(),
    );
    if (rects.length === 0) return [];
    return {
      id,
      top: Math.min(...rects.map((rect) => rect.top)) + pageTop,
      bottom: Math.max(...rects.map((rect) => rect.bottom)) + pageTop,
    };
  });

  return {
    width: document.documentElement.clientWidth,
    height,
    maxScroll,
    droneWidth,
    droneHeight: drone.offsetHeight,
    slotX: slotRect.left + slotRect.width / 2,
    slotY: slotRect.top + slotRect.height / 2 + pageTop - maxScroll,
    contactTop: document.getElementById('contact')!.getBoundingClientRect().top + pageTop,
    heroTextRight: document.querySelector('.features')!.getBoundingClientRect().right,
    bands,
  };
}

/** The drone reaches the slot sideways, moving with the row, so it never crosses the text above. */
function landing(m: Metrics, x: number, last: number): Knot[] {
  const room = m.height - m.slotY - m.droneHeight / 2 - CLEARANCE;
  const rise = Math.max(Math.min(room, 200), 0);
  return [
    { scroll: Math.max(m.maxScroll - rise, last), x, y: m.slotY + rise },
    { scroll: m.maxScroll, x: m.slotX, y: m.slotY },
  ];
}

/** Desktop: holds a free column while a block of text crosses the flight line, moves in the gaps. */
function columnRoute(m: Metrics): Knot[] {
  const flightY = m.height * 0.46;
  const clearance = m.droneHeight / 2 + CLEARANCE;
  const knots: Knot[] = [{ scroll: 0, x: m.width + m.droneWidth, y: m.height * 0.3 }];
  let last = m.height * 0.14;

  // Feature text keeps its 16px on narrow desktops and can grow past the hero's column
  const heroColumn = m.heroTextRight + m.droneWidth / 2 + CLEARANCE;

  m.bands.forEach((band, index) => {
    const share = m.width * COLUMNS[band.id]!;
    const x = band.id === 'top' ? Math.max(share, heroColumn) : share;
    const from = Math.max(band.top - flightY - clearance, last);
    const to = Math.max(band.bottom - flightY + clearance, from + MIN_HOLD);
    const drift = index % 2 === 0 ? 14 : -14;
    knots.push({ scroll: from, x, y: flightY }, { scroll: to, x: x + drift, y: flightY + drift });
    last = to + MIN_MOVE;
  });

  const x = m.width * COLUMNS['contact']!;
  knots.push({ scroll: last, x, y: flightY });
  return [...knots, ...landing(m, x, last)];
}

/** Below lg the text leaves a lane on the right: the drone stays in it and only changes height. */
function laneRoute(m: Metrics): Knot[] {
  const x = m.width - LANE_INSET;
  const knots: Knot[] = [{ scroll: 0, x: m.width + m.droneWidth, y: m.height * 0.3 }];
  let last = m.height * 0.14;

  m.bands.forEach((band, index) => {
    const scroll = Math.max(band.top - m.height / 2, last);
    knots.push({ scroll, x, y: m.height * (index % 2 === 0 ? 0.32 : 0.58) });
    last = scroll + MIN_MOVE;
  });

  return [...knots, ...landing(m, x, last)];
}

/** Keeps knots ascending in scroll, whatever the layout gave us. */
function ascending(knots: Knot[]): Knot[] {
  return knots.reduce<Knot[]>((result, knot) => {
    const previous = result[result.length - 1];
    if (previous && knot.scroll <= previous.scroll) {
      result.push({ ...knot, scroll: previous.scroll + 1 });
    } else {
      result.push(knot);
    }
    return result;
  }, []);
}

/** Horizontal tangents at every knot: x stays monotonic, so a curve cannot bulge into the text. */
function segment(from: Knot, to: Knot): string {
  const mid = (from.x + to.x) / 2;
  return `C${mid} ${from.y} ${mid} ${to.y} ${to.x} ${to.y}`;
}

function pathData(knots: Knot[], count = knots.length): string {
  const [first] = knots;
  const curves = knots
    .slice(1, count)
    .map((knot, index) => segment(knots[index]!, knot))
    .join('');
  return `M${first!.x} ${first!.y}${curves}`;
}

/** Share of the path length covered at each knot. */
function lengthStops(path: SVGPathElement, knots: Knot[]): number[] {
  path.setAttribute('d', pathData(knots));
  const total = path.getTotalLength();
  const stops = knots.map((_, index) => {
    if (index === 0) return 0;
    path.setAttribute('d', pathData(knots, index + 1));
    return path.getTotalLength() / total;
  });
  path.setAttribute('d', pathData(knots));
  return stops;
}

/** Rotation keyframes: level on a hold, leaning into a move. Durations add up to the timeline. */
function tiltKeyframes(knots: Knot[], stops: number[], duration: number) {
  return knots.slice(1).flatMap((knot, index) => {
    const from = knots[index]!;
    const time = (stops[index + 1]! - stops[index]!) * duration;
    const dx = knot.x - from.x;
    if (Math.abs(dx) < TILT_FROM_PX) return [{ to: 0, duration: time }];
    const lean = dx > 0 ? TILT_DEG : -TILT_DEG;
    return [
      { to: lean, duration: time / 2 },
      { to: 0, duration: time / 2 },
    ];
  });
}

function loadImage(image: HTMLImageElement): Promise<void> {
  const source = image.parentElement?.querySelector<HTMLSourceElement>('source');
  if (source?.dataset['srcset']) source.srcset = source.dataset['srcset'];
  image.src = image.dataset['src']!;
  return image.decode();
}

export function startDrone(anime: AnimeApi): () => void {
  const layer = document.querySelector<HTMLElement>('[data-drone]');
  const slot = document.querySelector<HTMLElement>('[data-drone-slot]');
  const main = document.querySelector('main');
  if (!layer || !slot || !main) return () => {};

  const { createMotionPath, createTimeline, onScroll, utils } = anime;
  const pick = <T extends Element>(name: string) => layer.querySelector<T>(`[data-drone-${name}]`)!;

  const probe = pick<HTMLElement>('probe');
  const path = pick<SVGPathElement>('route');
  const pos = pick<HTMLElement>('pos');
  const flip = pick<HTMLElement>('flip');
  const tilt = pick<HTMLElement>('tilt');
  const side = pick<HTMLImageElement>('side');
  const top = pick<HTMLImageElement>('top');

  let timeline: Timeline | undefined;
  let observer: ResizeObserver | undefined;
  let rebuildTimer = 0;
  let signature = '';
  let lastX = Number.NaN;
  let stopped = false;

  const scrollProgress = () => {
    const max = document.documentElement.scrollHeight - probe.offsetHeight;
    return clamp01(window.scrollY / max);
  };

  function updateState(progress: number): void {
    const x = utils.get(pos, 'translateX', false) as number;
    const dx = x - lastX;
    lastX = x;
    if (Math.abs(dx) > FLIP_FROM_PX) flip.classList.toggle('is-flipped', dx > 0);
    layer!.classList.toggle('is-landed', progress > 0.995);
  }

  function build(): void {
    const seek = scrollProgress();
    timeline?.revert();

    const m = measure(probe, slot!, tilt);
    const knots = ascending(window.matchMedia(DESKTOP).matches ? columnRoute(m) : laneRoute(m));
    const stops = lengthStops(path, knots);
    const progressAt = knots.map((knot) => knot.scroll / m.maxScroll);
    const scrollToLength = (t: number) => interpolate(progressAt, stops, t);

    const duration = 1000;
    const timeAt = (scroll: number) => clamp01(scroll / m.maxScroll) * duration;
    const fadeFrom = timeAt(m.contactTop - m.height * 0.9);
    const fadeTo = Math.max(timeAt(m.contactTop - m.height * 0.5), fadeFrom + 1);
    const landFrom = timeAt(knots[knots.length - 2]!.scroll);

    const { translateX, translateY } = createMotionPath(path)!;
    timeline = createTimeline({
      defaults: { ease: 'linear', duration },
      autoplay: onScroll({
        target: document.body,
        enter: 'top top',
        leave: 'bottom bottom',
        sync: 0.6,
      }),
      onUpdate: (self) => updateState(self.progress),
    })
      .add(pos, { translateX, translateY, ease: scrollToLength }, 0)
      .add(
        tilt,
        {
          rotate: tiltKeyframes(knots, progressAt, duration),
          scale: [
            { to: 1, duration: landFrom },
            { to: LAND_SCALE, duration: duration - landFrom },
          ],
        },
        0,
      )
      .add(side, { opacity: [1, 0], duration: fadeTo - fadeFrom }, fadeFrom)
      .add(top, { opacity: [0, 1], duration: fadeTo - fadeFrom }, fadeFrom);

    // sync lerps from the timeline's own position: start where the page is, not from zero
    timeline.seek(seek * timeline.duration, true);
    lastX = Number.NaN;
  }

  function currentSignature(): string {
    return [window.innerWidth, probe.offsetHeight, main!.scrollHeight].join('|');
  }

  function watchLayout(): void {
    signature = currentSignature();
    observer = new ResizeObserver(() => {
      window.clearTimeout(rebuildTimer);
      rebuildTimer = window.setTimeout(() => {
        const next = currentSignature();
        if (next === signature) return;
        signature = next;
        build();
      }, 150);
    });
    observer.observe(main!);
    observer.observe(probe);
  }

  async function launch(): Promise<void> {
    try {
      await Promise.all([loadImage(side), loadImage(top), document.fonts.ready]);
    } catch {
      layer!.dataset['droneState'] = 'failed';
      return;
    }
    if (stopped) return;
    layer!.hidden = false;
    build();
    watchLayout();
    layer!.dataset['droneState'] = 'flying';
  }

  const triggers = ['scroll', 'pointerdown', 'keydown'] as const;
  const idleTimer = window.setTimeout(wake, 3000);

  function wake(): void {
    window.clearTimeout(idleTimer);
    triggers.forEach((name) => window.removeEventListener(name, wake));
    void launch();
  }

  triggers.forEach((name) => window.addEventListener(name, wake, { once: true, passive: true }));

  return () => {
    stopped = true;
    window.clearTimeout(idleTimer);
    window.clearTimeout(rebuildTimer);
    triggers.forEach((name) => window.removeEventListener(name, wake));
    observer?.disconnect();
    timeline?.revert();
  };
}
