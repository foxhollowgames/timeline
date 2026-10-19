// Pins on the globe or the Book of Mormon map. Each pin is a button drawn over the map, as in the conference globe.
// A view supplies project(key, place) -> {x, y} or null, and onFrame(callback) for redraws.
// Events at the same place, or within one pin width on screen, join one group with a count.
// Only events in the active window get pins (DESIGN.md Q6).

import { shapeSVG, VOLUMES, VOLUME_ORDER } from './volumes.js';
import { formatYear } from './time-scale.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The globe as a view: places become 3D points once, then project each frame.
export function globeView(globe) {
  const positions = new Map();
  return {
    project(key, place) {
      if (!positions.has(key)) positions.set(key, globe.vector(place));
      return globe.project(positions.get(key));
    },
    onFrame: callback => globe.onFrame(callback),
  };
}

export function createPins({ view, layer, onOpen, topInset = () => 64 }) {
  const buttons = new Map();
  let items = [], markers = [], selectedId = null;
  const markerLayer = document.createElement('div');
  markerLayer.className = 'place-markers';
  layer.before(markerLayer);

  const pinSize = () => (innerWidth <= 650 ? 26 : 30);

  function group(width, height) {
    const visible = [];
    const byPlace = new Map();
    for (const item of items) {
      const screen = view.project(item.placeKey, item.place);
      if (!screen || screen.x < 8 || screen.x > width - 8 || screen.y < topInset() || screen.y > height - 8) continue;
      if (!byPlace.has(item.placeKey)) { byPlace.set(item.placeKey, { ...screen, items: [] }); visible.push(byPlace.get(item.placeKey)); }
      byPlace.get(item.placeKey).items.push(item);
    }
    // Join places that sit closer than one pin on screen.
    const parent = visible.map((_, i) => i), find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const threshold = pinSize() * 0.9;
    for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
      if (Math.hypot(visible[i].x - visible[j].x, visible[i].y - visible[j].y) < threshold) parent[find(j)] = find(i);
    }
    const groups = new Map();
    visible.forEach((place, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, { places: [], items: [] });
      const g = groups.get(root);
      g.places.push(place);
      g.items.push(...place.items);
    });
    return [...groups.values()].map(g => {
      g.items.sort((a, b) => VOLUME_ORDER.indexOf(a.event.volume) - VOLUME_ORDER.indexOf(b.event.volume) || (a.event.start ?? -1e9) - (b.event.start ?? -1e9));
      const anchor = g.places.reduce((best, p) => (p.items.length > best.items.length ? p : best));
      return { key: g.items.map(i => i.event.id).sort().join('|'), x: anchor.x, y: anchor.y, items: g.items };
    });
  }

  function label(g) {
    if (g.items.length === 1) {
      const e = g.items[0].event;
      return `${VOLUMES[e.volume].label}: ${e.ref}, ${e.title}`;
    }
    const counts = VOLUME_ORDER.map(v => [v, g.items.filter(i => i.event.volume === v).length]).filter(([, n]) => n);
    return `${g.items.length} events near ${g.items[0].place.name}: ` + counts.map(([v, n]) => `${VOLUMES[v].label} ${n}`).join(', ');
  }

  function render(g) {
    const lead = g.items[0].event;
    const volumes = VOLUME_ORDER.filter(v => g.items.some(i => i.event.volume === v));
    // A group shows the lead volume's shape. A second, smaller shape marks a mixed group.
    const second = volumes.find(v => v !== lead.volume);
    const caption = g.items.length > 1 ? `${g.items.length} events · ${g.items[0].place.name}` : lead.title;
    const size = lead.volume === 'history' ? (g.items.length > 1 ? 16 : 14) : (g.items.length > 1 ? 20 : 17);
    return shapeSVG(lead.volume, size, { className: 'pin-shape' })
      + (second ? shapeSVG(second, 11, { className: 'pin-second' }) : '')
      + (g.items.length > 1 ? `<span class="count" aria-hidden="true">${g.items.length}</span>` : '')
      + `<span class="pin-caption" aria-hidden="true">${escapeHTML(caption)}</span>`;
  }

  view.onFrame(({ width, height }) => {
    const groups = group(width, height), used = new Set();
    for (const g of groups) {
      used.add(g.key);
      let button = buttons.get(g.key);
      if (!button) {
        button = document.createElement('button');
        button.className = 'pin';
        button.innerHTML = render(g);
        button.addEventListener('click', () => onOpen(button.group.items.map(i => i.event), button.group));
        layer.append(button);
        buttons.set(g.key, button);
        requestAnimationFrame(() => button.classList.add('shown'));
      }
      button.group = g;
      button.setAttribute('aria-label', label(g));
      button.classList.toggle('undated', g.items.every(i => i.event.start == null));
      button.classList.toggle('secondary', g.items.every(i => i.event.volume === 'history'));
      button.classList.toggle('selected', Boolean(selectedId) && g.items.some(i => i.event.id === selectedId));
      button.style.transform = `translate(${g.x}px, ${g.y}px) translate(-50%, -50%)`;
    }
    for (const [key, button] of buttons) if (!used.has(key)) { button.remove(); buttons.delete(key); }

    // Every other place gets a dot. A label shows only where it does not overlap one already placed.
    const boxes = [];
    markerLayer.innerHTML = markers.map(m => {
      const screen = view.project(m.key, m);
      if (!screen) return '';
      const box = { x0: screen.x + 4, x1: screen.x + 10 + m.name.length * 6.2, y0: screen.y - 8, y1: screen.y + 8 };
      const fits = !boxes.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
      if (fits) boxes.push(box);
      return `<span class="place-marker" style="transform:translate(${screen.x}px,${screen.y}px)"><i></i>${fits ? `<b>${escapeHTML(m.name)}</b>` : ''}</span>`;
    }).join('');
  });

  return {
    // items: [{event, placeKey, place}]
    setItems(next) { items = next; view.request?.(); },
    setSelected(id) { selectedId = id; view.request?.(); },
    // Small labeled dots for the selected event's other places.
    setMarkers(next) { markers = next; view.request?.(); },
    describe: event => `${event.ref}, ${event.start == null ? 'years not given' : formatYear(event.start)}`,
  };
}
