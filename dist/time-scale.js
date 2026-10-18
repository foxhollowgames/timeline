// Time scale for the timeline strip. Pure functions, no DOM.
//
// Years in data are historical: -701 is 701 BCE, 33 is 33 CE, and there is no year 0.
// Internally the scale uses astronomical years (1 BCE = 0, 2 BCE = -1) so arithmetic
// is continuous. Convert at the edges with toAstro and fromAstro.
//
// The full span is warped: the default view compresses 4000–2000 BCE and 100–1800 CE,
// and expands 2000 BCE–100 CE and 1800–2026 CE (DESIGN.md section 2). The warp maps an
// astronomical year to a position u in [0, 1]. A view is a window [u0, u1] of that range.

export const FIRST_YEAR = -4000;
export const LAST_YEAR = 2026;

export const toAstro = year => (year < 0 ? year + 1 : year);
export const fromAstro = value => {
  const rounded = Math.round(value);
  return rounded <= 0 ? rounded - 1 : rounded;
};

// Breakpoints in astronomical years and the share of the full strip each segment gets.
export const SEGMENTS = [
  { from: toAstro(-4000), to: toAstro(-2000), share: 0.10, compressed: true },
  { from: toAstro(-2000), to: 100, share: 0.50, compressed: false },
  { from: 100, to: 1800, share: 0.15, compressed: true },
  { from: 1800, to: LAST_YEAR, share: 0.25, compressed: false },
];
{
  let start = 0;
  for (const segment of SEGMENTS) { segment.u0 = start; start += segment.share; segment.u1 = start; }
  SEGMENTS[SEGMENTS.length - 1].u1 = 1;
}
export const ASTRO_MIN = SEGMENTS[0].from;
export const ASTRO_MAX = SEGMENTS[SEGMENTS.length - 1].to;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function astroToU(astro) {
  const a = clamp(astro, ASTRO_MIN, ASTRO_MAX);
  const segment = SEGMENTS.find(s => a <= s.to) ?? SEGMENTS[SEGMENTS.length - 1];
  return segment.u0 + ((a - segment.from) / (segment.to - segment.from)) * (segment.u1 - segment.u0);
}

export function uToAstro(u) {
  const value = clamp(u, 0, 1);
  const segment = SEGMENTS.find(s => value <= s.u1) ?? SEGMENTS[SEGMENTS.length - 1];
  return segment.from + ((value - segment.u0) / (segment.u1 - segment.u0)) * (segment.to - segment.from);
}

export const yearToU = year => astroToU(toAstro(year));
export const uToYear = u => fromAstro(uToAstro(u));

// Years per unit of u at a given position. Used for local step sizes.
export function yearsPerU(u) {
  const value = clamp(u, 0, 1);
  const segment = SEGMENTS.find(s => value <= s.u1) ?? SEGMENTS[SEGMENTS.length - 1];
  return (segment.to - segment.from) / (segment.u1 - segment.u0);
}

const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
export function niceStep(rawYears) {
  return NICE.find(step => step >= rawYears) ?? NICE[NICE.length - 1];
}

// A view is { u0, u1 }. The deepest zoom shows about 10 years around its anchor.
// Segments have different densities, so the limit in u depends on where the zoom is.
export const MIN_VISIBLE_YEARS = 10;
export const minSpanAt = u => MIN_VISIBLE_YEARS / yearsPerU(u);
export const MIN_VIEW_SPAN = Math.min(...SEGMENTS.map(s => MIN_VISIBLE_YEARS * (s.u1 - s.u0) / (s.to - s.from)));
export const FULL_VIEW = Object.freeze({ u0: 0, u1: 1 });

export function clampView(view) {
  let span = clamp(view.u1 - view.u0, MIN_VIEW_SPAN, 1);
  let u0 = clamp(view.u0, 0, 1 - span);
  return { u0, u1: u0 + span };
}

// Zoom by a factor around an anchor position u. factor < 1 zooms in.
export function zoomView(view, factor, anchorU) {
  const span = view.u1 - view.u0;
  const nextSpan = clamp(span * factor, Math.min(span, minSpanAt(anchorU)), 1);
  const ratio = span ? (anchorU - view.u0) / span : 0.5;
  return clampView({ u0: anchorU - ratio * nextSpan, u1: anchorU - ratio * nextSpan + nextSpan });
}

export function panView(view, deltaU) {
  return clampView({ u0: view.u0 + deltaU, u1: view.u1 + deltaU });
}

// Move the view the least amount so that u sits inside it with a margin.
export function revealInView(view, u, margin = 0.08) {
  const span = view.u1 - view.u0, pad = span * margin;
  if (u < view.u0 + pad) return clampView({ u0: u - pad, u1: u - pad + span });
  if (u > view.u1 - pad) return clampView({ u0: u + pad - span, u1: u + pad });
  return view;
}

// The active window is about 2% of the visible strip, centred on the selected year,
// but never reaches more than 10 years either side of it.
export const WINDOW_SHARE = 0.02;
export const MAX_WINDOW_HALF_YEARS = 10;
export function activeWindow(year, view) {
  const u = yearToU(year), half = ((view.u1 - view.u0) * WINDOW_SHARE) / 2, astro = toAstro(year);
  const startAstro = Math.max(Math.floor(uToAstro(Math.max(0, u - half))), astro - MAX_WINDOW_HALF_YEARS);
  const endAstro = Math.min(Math.ceil(uToAstro(Math.min(1, u + half))), astro + MAX_WINDOW_HALF_YEARS);
  return { start: fromAstro(Math.min(startAstro, toAstro(year))), end: fromAstro(Math.max(endAstro, toAstro(year))) };
}

// Step size for the arrow keys: about 1/120 of the visible years, rounded to a nice value.
export function keyStep(year, view) {
  const visibleYears = (view.u1 - view.u0) * yearsPerU(yearToU(year));
  return niceStep(visibleYears / 120);
}

// Move a historical year by a number of years, skipping the missing year 0.
export function addYears(year, delta) {
  return fromAstro(clamp(toAstro(year) + delta, ASTRO_MIN, ASTRO_MAX));
}

// Snap a year to a multiple of step on its side of the era line.
export function snapYear(year, step) {
  if (step <= 1) return year;
  const magnitude = Math.max(step, Math.round(Math.abs(year) / step) * step);
  const snapped = year < 0 ? -magnitude : magnitude;
  return clamp(snapped, FIRST_YEAR, LAST_YEAR);
}

export function formatYear(year) {
  if (year < 0) return `${-year} BCE`;
  return year < 1000 ? `${year} CE` : String(year);
}

export function formatRange(start, end) {
  if (start === end) return formatYear(start);
  if (start < 0 && end < 0) return `${-start}–${-end} BCE`;
  if (start > 0 && end > 0) return end < 1000 ? `${start}–${end} CE` : `${formatYear(start)}–${end}`;
  return `${formatYear(start)}–${formatYear(end)}`;
}

// Read a typed year: "701 BCE", "701 BC", "-701", "33", "33 CE", "AD 33", "1830".
export function parseYear(text) {
  const value = String(text ?? '').trim().toUpperCase().replace(/(\d),(\d{3})\b/g, '$1$2').replace(/[.,\s]+/g, ' ').trim();
  const match = value.match(/^(AD|CE)?\s*(-)?\s*(\d{1,4})\s*(BCE|BC|CE|AD)?$/);
  if (!match) return null;
  const [, prefix, minus, digits, suffix] = match;
  let year = Number(digits);
  if (year === 0) return null;
  const bce = Boolean(minus) || suffix === 'BCE' || suffix === 'BC';
  if (bce && (prefix || suffix === 'CE' || suffix === 'AD')) return null;
  if (bce) year = -year;
  return clamp(year, FIRST_YEAR, LAST_YEAR);
}

// Tick marks for a view drawn at a given pixel width. Each segment picks its own step
// so labels stay readable where the scale changes. Returns [{year, x, major}].
export function ticks(view, width, minGap = 84) {
  const span = view.u1 - view.u0, out = [];
  const toX = u => ((u - view.u0) / span) * width;
  for (const segment of SEGMENTS) {
    const lo = Math.max(view.u0, segment.u0), hi = Math.min(view.u1, segment.u1);
    if (hi <= lo) continue;
    const pxPerYear = width / span / ((segment.to - segment.from) / (segment.u1 - segment.u0));
    // A compressed segment can be too narrow for its ideal step. Cap the step so the
    // segment still gets at least one round year inside it.
    const segmentYears = segment.to - segment.from;
    const step = Math.min(niceStep(minGap / pxPerYear), [...NICE].reverse().find(s => s <= segmentYears / 1.5) ?? 1);
    const aStart = uToAstro(lo), aEnd = uToAstro(hi);
    // Ticks fall on round historical years: 1500 BCE is astro -1499.
    // The era line has no year 0, so that tick is labeled 1 CE.
    for (let k = Math.ceil((aStart - 1) / step); k * step <= aEnd + 1; k++) {
      const year = k * step === 0 ? 1 : k * step;
      const astro = toAstro(year);
      if (astro < aStart - 1e-9 || astro > aEnd + 1e-9) continue;
      out.push({ year, x: toX(astroToU(astro)), major: year % (step * 5) === 0 });
    }
  }
  out.sort((a, b) => a.x - b.x);
  // Drop labels that collide, keeping the rounder year.
  const kept = [];
  for (const tick of out) {
    const last = kept[kept.length - 1];
    if (last && tick.x - last.x < minGap * 0.8) {
      if (roundness(tick.year) > roundness(last.year)) kept[kept.length - 1] = tick;
      continue;
    }
    kept.push(tick);
  }
  return kept;
}
// 1 CE stands in for the missing year 0, so it ranks as the roundest year.
const roundness = year => { if (year === 1) return 4; let n = 0, y = Math.abs(year); for (const d of [10, 100, 1000]) if (y % d === 0) n++; return n; };
