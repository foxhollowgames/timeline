// Volume identity: one hue and one shape each (DESIGN.md Q30), so color is never the only cue.
// Hues come from the dataviz categorical ramp, checked on the globe surface (#060b16) with all
// pairs compared: worst CVD ΔE 9.4, worst normal-vision ΔE 17.5, all above 3:1 contrast.
// The olive sits above the lightness band on purpose: lighter reads better on the dark globe.

export const SURFACE = '#060b16';

export const VOLUMES = {
  ot: { label: 'Old Testament', short: 'OT', color: '#3987e5', shape: 'circle' },
  nt: { label: 'New Testament', short: 'NT', color: '#199e70', shape: 'square' },
  bom: { label: 'Book of Mormon', short: 'BoM', color: '#d95926', shape: 'diamond' },
  dc: { label: 'D&C and Church history', short: 'D&C', color: '#b9b04a', shape: 'triangle' },
  // World history is secondary (DESIGN.md Q5): smaller, hollow, and grey, with its own shape.
  history: { label: 'World history', short: 'History', color: '#aab5c0', shape: 'hexagon', hollow: true },
};
export const VOLUME_ORDER = ['ot', 'nt', 'bom', 'dc', 'history'];
export const SCRIPTURE = ['ot', 'nt', 'bom', 'dc'];

// Shapes share a 20-unit box and have roughly equal area. The surface-colored stroke is the 2px ring.
const PATHS = {
  circle: '<circle cx="10" cy="10" r="7"/>',
  square: '<rect x="3.8" y="3.8" width="12.4" height="12.4" rx="1.6"/>',
  diamond: '<path d="M10 1.6 18.4 10 10 18.4 1.6 10Z"/>',
  triangle: '<path d="M10 2 18.6 17.2H1.4Z"/>',
  hexagon: '<path d="M10 2.6 16.4 6.3V13.7L10 17.4 3.6 13.7V6.3Z"/>',
};

export function shapeSVG(volume, size = 16, { ring = SURFACE, className = '' } = {}) {
  const v = VOLUMES[volume];
  // A hollow shape draws a wide surface-colored stroke under a narrow colored one, so it reads on any ground.
  const body = v.hollow
    ? `<g fill="none" stroke-linejoin="round"><g stroke="${ring}" stroke-width="5">${PATHS[v.shape]}</g><g stroke="${v.color}" stroke-width="2.2">${PATHS[v.shape]}</g></g>`
    : `<g fill="${v.color}" stroke="${ring}" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke">${PATHS[v.shape]}</g>`;
  return `<svg class="shape ${className}" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Paths, drawn as the Wayfinder readers draw them. The Bible and the D&C share one viewer
// (foxhollowgames.github.io viewer/chapter-map.js). The Book of Mormon reader has its own palette,
// a shadow under each line, and wider arrow spacing (book-of-mormon dist/app.js).
const SHARED_KINDS = {
  journey: { label: 'Journey', color: '#128879', dash: '8 5' },
  military: { label: 'Army path', color: '#c43c32', dash: '9 5' },
  flight: { label: 'Escape path', color: '#db8410', dash: '3 6' },
  exile: { label: 'Path into exile', color: '#904fac', dash: '10 4 2 4' },
  restoration: { label: 'Path home', color: '#128879', dash: '8 5' },
  diplomacy: { label: 'Message or gift', color: '#257fbd', dash: '12 5' },
  mission: { label: 'Mission journey', color: '#128879', dash: '8 5' },
  gathering: { label: 'Move to gather', color: '#257fbd', dash: '12 5' },
  expulsion: { label: 'Forced departure', color: '#db8410', dash: '3 6' },
  custody: { label: 'Taken as prisoners', color: '#904fac', dash: '10 4 2 4' },
};
const BOM_KINDS = {
  military: { label: 'Army', color: '#e0503f', dash: '9 5' },
  flight: { label: 'Escape or retreat', color: '#f0a020', dash: '3 6' },
  journey: { label: 'Journey or mission', color: '#4cb3f0', dash: '12 5' },
  migration: { label: 'Group moves to settle', color: '#3fc7a8', dash: '8 5' },
  exploration: { label: 'Search party', color: '#b98cf0', dash: '10 4 2 4' },
  voyage: { label: 'Sea voyage', color: '#9be7ff', dash: '2 7' },
  gathering: { label: 'Gathering', color: '#f3d36b', dash: '6 4' },
};
const SHARED_LINE = { weight: 5, contextWeight: 3.5, contextDash: '10 7', shadow: false, arrowEvery: 85, arrowAt: 0.65, arrowMin: 18 };
const BOM_LINE = { weight: 4, shadow: true, arrowEvery: 110, arrowAt: 0.6, arrowMin: 26 };

// The full look of one path: its kind's label, color, and dash, and the reader's line and arrow spacing.
export function routeStyle(volume, route) {
  const bom = volume === 'bom';
  const kind = (bom ? BOM_KINDS : SHARED_KINDS)[route.kind] ?? (bom ? BOM_KINDS.journey : SHARED_KINDS.diplomacy);
  const line = bom ? BOM_LINE : SHARED_LINE;
  const context = route.context && !bom;
  return { ...line, ...kind, weight: context ? line.contextWeight : line.weight, dash: context ? line.contextDash : kind.dash };
}

// The arrow both readers draw along a path: a chevron in the path's color with a cream edge.
export const ARROW_PATH = 'M3 3 L14 9 L3 15 L6 9 Z';
export const ARROW_EDGE = '#fff0d5';
