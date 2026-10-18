// The address keeps the view so it can be shared (DESIGN.md Q34).
// Example: #year=-701&event=isaiah-36&hide=nt,dc&view=0.21,0.26
// year: the selected year. event: the open event. hide: hidden volumes. view: the strip zoom.
// bom=1: the Book of Mormon panel is open.

import { FIRST_YEAR, LAST_YEAR } from './time-scale.js';

const VOLUMES = new Set(['ot', 'nt', 'bom', 'dc']);

export function readHash(hash) {
  const params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const out = {};
  const year = Number(params.get('year'));
  if (params.has('year') && Number.isInteger(year) && year !== 0 && year >= FIRST_YEAR && year <= LAST_YEAR) out.year = year;
  const event = params.get('event');
  if (event && /^[a-z0-9-]{1,60}$/.test(event)) out.event = event;
  const hide = (params.get('hide') ?? '').split(',').filter(v => VOLUMES.has(v));
  if (hide.length) out.hide = hide;
  const view = (params.get('view') ?? '').split(',').map(Number);
  if (view.length === 2 && view.every(Number.isFinite) && view[0] >= 0 && view[1] <= 1 && view[0] < view[1]) out.view = { u0: view[0], u1: view[1] };
  if (params.get('bom') === '1') out.bom = true;
  return out;
}

export function writeHash({ year, event, hide = [], view, bom = false }) {
  const params = new URLSearchParams();
  if (year != null) params.set('year', String(year));
  if (event) params.set('event', event);
  if (hide.length) params.set('hide', [...hide].sort().join(','));
  if (view && (view.u0 > 0 || view.u1 < 1)) params.set('view', `${+view.u0.toFixed(4)},${+view.u1.toFixed(4)}`);
  if (bom) params.set('bom', '1');
  const text = params.toString().replace(/%2C/g, ',');
  return text ? `#${text}` : '';
}
