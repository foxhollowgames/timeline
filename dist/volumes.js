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
