// The timeline strip: a zoomable, warped year slider (DESIGN.md section 2).
// Drag or tap the strip to choose a year. Wheel or pinch on the strip to zoom it.
// Shift+wheel, a sideways wheel, or the overview bar pans it. The arrow keys step the year.

import {
  FIRST_YEAR, LAST_YEAR, SEGMENTS, FULL_VIEW, yearToU, uToYear, yearsPerU, niceStep,
  zoomView, panView, clampView, revealInView, activeWindow, keyStep, addYears, snapYear,
  formatYear, formatRange, parseYear, ticks, minSpanAt,
} from './time-scale.js';

export function createScrubber({ strip, overview, input, zoomIn, zoomOut, fit, onChange }) {
  let year = -600, view = { ...FULL_VIEW };
  const pointers = new Map();
  let dragId = null, pinch = null;

  // Build the fixed layers once.
  strip.innerHTML = `
    <div class="strip-bands" aria-hidden="true"></div>
    <div class="strip-order-bands" aria-hidden="true"></div>
    <canvas class="strip-density" aria-hidden="true"></canvas>
    <div class="strip-axis" aria-hidden="true"></div>
    <div class="strip-window" aria-hidden="true"></div>
    <div class="strip-thumb" aria-hidden="true"></div>
    <div class="strip-ticks" aria-hidden="true"></div>`;
  const bandsLayer = strip.querySelector('.strip-bands');
  const orderLayer = strip.querySelector('.strip-order-bands');
  const density = strip.querySelector('.strip-density');
  let densityEvents = [], orderBands = [];
  const windowLayer = strip.querySelector('.strip-window');
  const thumb = strip.querySelector('.strip-thumb');
  const ticksLayer = strip.querySelector('.strip-ticks');
  overview.innerHTML = `
    <div class="overview-bands" aria-hidden="true"></div>
    <div class="overview-view" aria-hidden="true"></div>
    <div class="overview-year" aria-hidden="true"></div>`;
  const overviewBands = overview.querySelector('.overview-bands');
  const overviewView = overview.querySelector('.overview-view');
  const overviewYear = overview.querySelector('.overview-year');
  overviewBands.innerHTML = SEGMENTS.map(s => `<i class="${s.compressed ? 'compressed' : ''}" style="left:${s.u0 * 100}%;width:${(s.u1 - s.u0) * 100}%"></i>`).join('');

  strip.setAttribute('role', 'slider');
  strip.setAttribute('tabindex', '0');
  strip.setAttribute('aria-valuemin', String(FIRST_YEAR));
  strip.setAttribute('aria-valuemax', String(LAST_YEAR));

  const width = () => Math.max(1, strip.clientWidth);
  const xToU = x => view.u0 + (x / width()) * (view.u1 - view.u0);
  const uToX = u => ((u - view.u0) / (view.u1 - view.u0)) * width();
  const localX = event => event.clientX - strip.getBoundingClientRect().left;

  function render() {
    const w = width(), span = view.u1 - view.u0;
    bandsLayer.innerHTML = SEGMENTS.filter(s => s.compressed && s.u1 > view.u0 && s.u0 < view.u1).map(s => {
      const left = Math.max(0, uToX(s.u0)), right = Math.min(w, uToX(s.u1));
      return `<i style="left:${left}px;width:${right - left}px" title="Compressed span"></i>`;
    }).join('');
    orderLayer.innerHTML = orderBands.map(band => {
      const left = Math.max(0, uToX(yearToU(band.start))), right = Math.min(w, uToX(yearToU(band.end)));
      if (right <= 0 || left >= w) return '';
      return `<i class="lane-${band.lane ?? 0}" style="left:${left}px;width:${right - left}px" title="${band.label}"><span>${right - left > 110 ? band.label : ''}</span></i>`;
    }).join('');
    renderDensity(w);
    // Labels near an edge align inward so they are not cut off.
    ticksLayer.innerHTML = ticks(view, w).map(t => {
      const edge = t.x < 34 ? ' edge-start' : t.x > w - 34 ? ' edge-end' : '';
      return `<span class="${t.major ? 'major' : ''}${edge}" style="left:${t.x}px">${formatYear(t.year)}</span>`;
    }).join('');
    const u = yearToU(year), thumbX = uToX(u);
    thumb.style.left = `${thumbX}px`;
    thumb.hidden = thumbX < -1 || thumbX > w + 1;
    const range = activeWindow(year, view);
    const left = Math.max(0, uToX(yearToU(range.start))), right = Math.min(w, uToX(yearToU(range.end)));
    windowLayer.hidden = right <= 0 || left >= w;
    windowLayer.style.left = `${left}px`;
    windowLayer.style.width = `${Math.max(2, right - left)}px`;
    overviewView.style.left = `${view.u0 * 100}%`;
    overviewView.style.width = `${span * 100}%`;
    overviewYear.style.left = `${u * 100}%`;
    strip.setAttribute('aria-valuenow', String(year));
    strip.setAttribute('aria-valuetext', formatYear(year));
    if (document.activeElement !== input) input.value = formatYear(year);
    zoomIn.disabled = span <= minSpanAt(u) + 1e-9;
    zoomOut.disabled = fit.disabled = span >= 1 - 1e-9;
  }

  // Event density: each event spreads one unit over the columns its date range covers.
  // Bars use a square-root scale against the busiest column in view.
  function renderDensity(w) {
    const column = 3, ratio = Math.min(devicePixelRatio || 1, 2), height = 40;
    const columns = Math.ceil(w / column), counts = new Float32Array(columns);
    for (const e of densityEvents) {
      const x0 = uToX(yearToU(e.start)), x1 = uToX(yearToU(e.end));
      if (x1 < 0 || x0 > w) continue;
      const c0 = Math.max(0, Math.floor(x0 / column)), c1 = Math.min(columns - 1, Math.floor(x1 / column));
      const share = 1 / (c1 - c0 + 1);
      for (let c = c0; c <= c1; c++) counts[c] += share;
    }
    if (density.width !== Math.round(w * ratio)) { density.width = Math.round(w * ratio); density.height = height * ratio; density.style.width = `${w}px`; density.style.height = `${height}px`; }
    const ctx = density.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, height);
    const max = Math.max(...counts, 0);
    if (!max) return;
    const range = activeWindow(year, view);
    const windowStart = uToX(yearToU(range.start)), windowEnd = uToX(yearToU(range.end));
    for (let c = 0; c < columns; c++) {
      if (!counts[c]) continue;
      const x = c * column, h = Math.max(2, Math.sqrt(counts[c] / max) * (height - 4));
      ctx.fillStyle = x + column >= windowStart && x <= windowEnd ? '#efcc88cc' : '#6f9bb88c';
      ctx.fillRect(x, height - h, column - 1, h);
    }
  }

  function emit() { render(); onChange?.({ year, view: { ...view }, window: activeWindow(year, view) }); }

  function setYear(next, { reveal = true } = {}) {
    const clamped = Math.min(LAST_YEAR, Math.max(FIRST_YEAR, Math.round(next)));
    year = clamped === 0 ? 1 : clamped;
    if (reveal) view = revealInView(view, yearToU(year));
    emit();
  }
  function setView(next) { view = clampView(next); emit(); }

  // Year from a strip position, snapped to a round value for the local scale.
  function yearAt(x) {
    const u = xToU(Math.min(width(), Math.max(0, x)));
    const yearsPerPixel = yearsPerU(u) * (view.u1 - view.u0) / width();
    return snapYear(uToYear(u), niceStep(yearsPerPixel * 2));
  }

  strip.addEventListener('pointerdown', event => {
    if (event.button > 0) return;
    pointers.set(event.pointerId, localX(event));
    strip.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.abs(a - b), mid: (a + b) / 2 };
      dragId = null;
    } else if (pointers.size === 1) {
      dragId = event.pointerId;
      strip.focus({ preventScroll: true });
      setYear(yearAt(localX(event)), { reveal: false });
    }
    event.preventDefault();
  });
  strip.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, localX(event));
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], distance = Math.max(8, Math.abs(a - b)), mid = (a + b) / 2;
      let next = zoomView(view, pinch.distance / distance, xToU(pinch.mid));
      next = panView(next, -((mid - pinch.mid) / width()) * (next.u1 - next.u0));
      pinch = { distance, mid };
      setView(next);
    } else if (event.pointerId === dragId) {
      setYear(yearAt(localX(event)), { reveal: false });
    }
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (event.pointerId === dragId) dragId = null;
    if (pointers.size < 2) pinch = null;
  };
  strip.addEventListener('pointerup', release);
  strip.addEventListener('pointercancel', release);

  strip.addEventListener('wheel', event => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width() : 1;
    const dx = event.deltaX * unit, dy = event.deltaY * unit;
    if (event.shiftKey || Math.abs(dx) > Math.abs(dy)) {
      setView(panView(view, ((event.shiftKey ? dy || dx : dx) / width()) * (view.u1 - view.u0)));
    } else {
      setView(zoomView(view, Math.exp(Math.max(-0.5, Math.min(0.5, dy * 0.0015))), xToU(localX(event))));
    }
  }, { passive: false });

  // Overview bar: drag to move the visible part of the strip.
  let overviewDrag = null;
  overview.addEventListener('pointerdown', event => {
    if (event.button > 0) return;
    const rect = overview.getBoundingClientRect(), u = (event.clientX - rect.left) / rect.width;
    const span = view.u1 - view.u0;
    if (u < view.u0 || u > view.u1) setView({ u0: u - span / 2, u1: u + span / 2 });
    overviewDrag = { start: event.clientX, u0: view.u0, rect };
    overview.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  overview.addEventListener('pointermove', event => {
    if (!overviewDrag) return;
    const delta = (event.clientX - overviewDrag.start) / overviewDrag.rect.width;
    const span = view.u1 - view.u0;
    setView({ u0: overviewDrag.u0 + delta, u1: overviewDrag.u0 + delta + span });
  });
  for (const type of ['pointerup', 'pointercancel']) overview.addEventListener(type, () => { overviewDrag = null; });

  function step(direction, big) {
    const size = keyStep(year, view) * (big ? 10 : 1);
    const target = addYears(year, direction * size);
    setYear(size > 1 ? snapYear(target, size) : target);
  }
  function handleKey(event) {
    const keys = {
      ArrowLeft: () => step(-1, event.shiftKey), ArrowDown: () => step(-1, event.shiftKey),
      ArrowRight: () => step(1, event.shiftKey), ArrowUp: () => step(1, event.shiftKey),
      PageDown: () => step(-1, true), PageUp: () => step(1, true),
      Home: () => setYear(FIRST_YEAR), End: () => setYear(LAST_YEAR),
      '+': () => setView(zoomView(view, 0.6, yearToU(year))), '=': () => setView(zoomView(view, 0.6, yearToU(year))),
      '-': () => setView(zoomView(view, 1 / 0.6, yearToU(year))), '0': () => setView(FULL_VIEW),
    };
    const action = keys[event.key];
    if (!action) return false;
    event.preventDefault(); action(); return true;
  }
  strip.addEventListener('keydown', handleKey);

  zoomIn.addEventListener('click', () => setView(zoomView(view, 0.5, yearToU(year))));
  zoomOut.addEventListener('click', () => setView(zoomView(view, 2, yearToU(year))));
  fit.addEventListener('click', () => setView(FULL_VIEW));

  input.addEventListener('change', () => {
    const parsed = parseYear(input.value);
    if (parsed === null) { input.value = formatYear(year); input.setAttribute('aria-invalid', 'true'); return; }
    input.removeAttribute('aria-invalid');
    setYear(parsed);
  });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') input.blur(); if (event.key === 'Escape') { input.value = formatYear(year); input.blur(); } });
  input.addEventListener('focus', () => input.select());

  new ResizeObserver(render).observe(strip);

  return {
    get year() { return year; },
    get view() { return { ...view }; },
    setYear,
    setView,
    // Dated events [{start, end}] for the density bar. Order-only bands [{start, end, label}].
    setEvents(events, bands = []) { densityEvents = events.filter(e => e.start != null && e.end != null); orderBands = bands; render(); },
    handleKey,
    window: () => activeWindow(year, view),
    describe: () => formatRange(activeWindow(year, view).start, activeWindow(year, view).end),
    start(initialYear) { year = initialYear; emit(); },
  };
}
