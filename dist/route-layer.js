// Paths on the globe, drawn as the Wayfinder readers draw them: a dashed line in the kind's color,
// with chevron arrows spaced along it (volumes.js routeStyle). Three.js lines cannot be wide or dashed,
// so paths are SVG over the globe, projected each frame like the pins.
// Clicks are read from the globe canvas, so a drag that starts on a path still turns the globe.

import { routeStyle, ARROW_PATH, ARROW_EDGE } from './volumes.js';
import { assignLanes, shiftLeg } from './route-lanes.js';

const SVG = 'http://www.w3.org/2000/svg';
const PICK_PIXELS = 11; // half the readers' 22px hit line
const DIMMED = 0.35;
const SAME_PLACE = 0.5; // degrees: endpoints this close share a lane group

export function createRouteLayer({ globe, layer }) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'route-layer');
  svg.setAttribute('aria-hidden', 'true');
  layer.before(svg);
  // Two groups: every active event's paths, and the selected event's paths above them.
  const groups = { paths: document.createElementNS(SVG, 'g'), selected: document.createElementNS(SVG, 'g') };
  svg.append(groups.paths, groups.selected);
  const drawn = { paths: [], selected: [] };
  let hovered = null, routeClick = null, pressed = null;

  const add = (parent, tag, attributes) => {
    const el = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) if (value != null) el.setAttribute(name, value);
    parent.append(el);
    return el;
  };

  function setRoutes(list = [], name = 'selected') {
    groups[name].replaceChildren();
    drawn[name] = list.map(route => {
      const style = routeStyle(route.volume, route);
      const g = add(groups[name], 'g', { class: 'route', opacity: route.dimmed ? DIMMED : 1 });
      const shadow = style.shadow ? add(g, 'path', { fill: 'none', stroke: '#071a2a', 'stroke-width': style.weight + 3, 'stroke-opacity': 0.35, 'stroke-linejoin': 'round' }) : null;
      const line = add(g, 'path', { class: 'route-line', fill: 'none', stroke: style.color, 'stroke-width': style.weight, 'stroke-dasharray': style.dash, 'stroke-linejoin': 'round' });
      const arrows = add(g, 'g', {});
      // Each leg is sampled along its great circle once. Frames only project the samples.
      const legs = [];
      for (let i = 1; i < route.points.length; i++) {
        const [a, b] = [route.points[i - 1], route.points[i]];
        legs.push(globe.arc({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }));
      }
      return { route, style, g, shadow, line, arrows, legs, runs: [] };
    });
    // Paths sharing a leg run side by side, in both groups together.
    const all = [...drawn.paths, ...drawn.selected];
    assignLanes(all.map(item => item.route), SAME_PLACE).forEach((lanes, i) => { all[i].lanes = lanes; });
    if (hovered && !drawn.paths.includes(hovered) && !drawn.selected.includes(hovered)) setHovered(null);
    draw();
  }

  // Project every path. A part behind the Earth breaks the line into runs.
  function draw() {
    for (const item of [...drawn.paths, ...drawn.selected]) {
      const runs = [];
      let run = null, arrows = '';
      for (const [i, leg] of item.legs.entries()) {
        const screen = shiftLeg(leg.map(p => globe.project(p)), item.lanes?.[i]);
        for (const p of screen) {
          if (!p) { run = null; continue; }
          if (!run) { run = []; runs.push(run); }
          run.push(p);
        }
        if (item.route.direction !== false) arrows += legArrows(screen, item.style);
      }
      item.runs = runs;
      const d = runs.filter(r => r.length > 1).map(r => 'M' + r.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')).join('');
      item.line.setAttribute('d', d);
      item.shadow?.setAttribute('d', d);
      item.arrows.innerHTML = arrows;
    }
  }

  // Arrows along one leg, spaced in screen pixels as the readers space them.
  function legArrows(screen, style) {
    const segments = [];
    let length = 0;
    for (let i = 1; i < screen.length; i++) {
      const a = screen[i - 1], b = screen[i];
      if (!a || !b) continue;
      const size = Math.hypot(b.x - a.x, b.y - a.y);
      segments.push({ a, b, from: length, size });
      length += size;
    }
    if (length < style.arrowMin) return '';
    const count = Math.max(1, Math.floor(length / style.arrowEvery));
    let out = '';
    for (let j = 0; j < count; j++) {
      const at = length * (j + style.arrowAt) / count;
      const s = segments.find(seg => at <= seg.from + seg.size) ?? segments[segments.length - 1];
      const t = s.size ? (at - s.from) / s.size : 0;
      const x = s.a.x + (s.b.x - s.a.x) * t, y = s.a.y + (s.b.y - s.a.y) * t;
      const angle = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180 / Math.PI;
      out += `<path d="${ARROW_PATH}" fill="${style.color}" stroke="${ARROW_EDGE}" stroke-width="1.2" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)}) translate(-9 -9)"/>`;
    }
    return out;
  }

  // The path nearest a screen point. The selected group wins ties.
  function pick(x, y) {
    for (const list of [drawn.selected, drawn.paths]) {
      let best = null, bestDistance = PICK_PIXELS;
      for (const item of list) {
        if (!item.route.key) continue;
        for (const run of item.runs) for (let i = 1; i < run.length; i++) {
          const a = run[i - 1], b = run[i], dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy;
          const t = lengthSq ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / lengthSq)) : 0;
          const distance = Math.hypot(a.x + t * dx - x, a.y + t * dy - y);
          if (distance < bestDistance) { bestDistance = distance; best = item; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Hovering a path brightens it and shows a pointer.
  function setHovered(item) {
    if (item === hovered) return;
    if (hovered) { hovered.g.setAttribute('opacity', hovered.route.dimmed ? DIMMED : 1); hovered.line.setAttribute('stroke-width', hovered.style.weight); }
    hovered = item;
    if (item) { item.g.setAttribute('opacity', 1); item.line.setAttribute('stroke-width', item.style.weight + 1.5); }
    globe.canvas.style.cursor = item ? 'pointer' : '';
  }

  const canvas = globe.canvas;
  const point = event => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  // A click is a press and release that barely moves. A drag turns the globe instead.
  canvas.addEventListener('pointerdown', event => { pressed = { ...point(event), time: performance.now(), touch: event.pointerType === 'touch' }; });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || event.buttons) return;
    const { x, y } = point(event);
    setHovered(routeClick ? pick(x, y) : null);
  });
  canvas.addEventListener('pointerleave', () => setHovered(null));
  canvas.addEventListener('pointerup', event => {
    const start = pressed; pressed = null;
    if (!start || !routeClick || !event.isPrimary) return;
    const { x, y } = point(event);
    if (Math.hypot(x - start.x, y - start.y) > 6 || performance.now() - start.time > 600) return;
    const item = pick(x, y);
    if (item) routeClick(item.route.key);
  });

  globe.onFrame(draw);
  return { setRoutes, onRouteClick(callback) { routeClick = callback; } };
}
