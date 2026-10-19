// The Book of Mormon panel map (DESIGN.md section 7). Leaflet's flat CRS, one unit per Sorenson mile.
// The relief, land, rivers, and labels come from Book of Mormon Wayfinder via dist/data/bom-map.json.
// Leaflet loads only the first time the panel opens.

import { routeStyle, ARROW_PATH, ARROW_EDGE } from './volumes.js';

let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletLoading ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/leaflet.css';
    document.head.append(css);
    const script = document.createElement('script');
    script.src = 'vendor/leaflet.js';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Leaflet could not load'));
    document.head.append(script);
  });
  return leafletLoading;
}

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function createBomMap({ container }) {
  const [L, shapes] = await Promise.all([
    loadLeaflet(),
    fetch('data/bom-map.json').then(r => { if (!r.ok) throw new Error('bom-map.json'); return r.json(); }),
  ]);
  const ll = ([x, y]) => L.latLng(y, x);
  const map = L.map(container, {
    crs: L.CRS.Simple, zoomControl: false, attributionControl: true, minZoom: -2, maxZoom: 3, zoomSnap: 0.25,
    maxBounds: shapes.bounds, maxBoundsViscosity: 0.8,
  });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(escapeHTML(shapes.credit));
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  // On desktop the CSS swaps the buttons above for this slider, as on the globe.
  const ZoomSlider = L.Control.extend({
    onAdd() {
      const label = L.DomUtil.create('label', 'leaflet-control zoom-slider');
      label.innerHTML = '<span aria-hidden="true">−</span><input type="range" aria-label="Book of Mormon map zoom"><span aria-hidden="true">+</span>';
      const slider = label.querySelector('input');
      Object.assign(slider, { min: map.getMinZoom(), max: map.getMaxZoom(), step: map.options.zoomSnap, value: map.getZoom() });
      slider.addEventListener('input', () => map.setZoom(Number(slider.value)));
      map.on('zoom zoomend', () => { slider.value = map.getZoom(); });
      L.DomEvent.disableClickPropagation(label);
      L.DomEvent.disableScrollPropagation(label);
      return label;
    },
  });
  new ZoomSlider({ position: 'bottomright' }).addTo(map);
  map.createPane('land').style.zIndex = 250;
  map.createPane('water').style.zIndex = 260;
  // Background paths sit below the selected routes, so a redraw never covers the selection.
  map.createPane('paths').style.zIndex = 410;
  map.createPane('routes').style.zIndex = 420;

  L.tileLayer(shapes.tiles.url, {
    pane: 'land', className: 'relief-tiles', tileSize: shapes.tiles.size, minNativeZoom: shapes.tiles.minZoom,
    maxNativeZoom: shapes.tiles.maxZoom, minZoom: -2, maxZoom: 3, bounds: shapes.bounds, keepBuffer: 3,
  }).addTo(map);
  L.polygon(shapes.land.map(ll), { pane: 'land', color: '#cfe3ee', weight: 1, opacity: 0.35, fill: false, interactive: false }).addTo(map);
  for (const river of shapes.rivers) L.polyline(river.points.map(ll), { pane: 'water', color: '#4b9fbd', weight: river.size > 1 ? 2 : 1.2, opacity: 0.8, interactive: false }).addTo(map);
  L.polyline(shapes.sidon.map(ll), { pane: 'water', color: '#5fb6d4', weight: 2.6, opacity: 0.95, interactive: false }).addTo(map);
  for (const water of shapes.waters) L.polygon(water.points.map(ll), { pane: 'water', color: '#5fb6d4', weight: 1, fillColor: '#2c6f8c', fillOpacity: 0.8, interactive: false }).addTo(map);
  for (const label of shapes.labels) {
    L.marker(ll(label.at), { interactive: false, keyboard: false, icon: L.divIcon({ className: `bom-label bom-label-${label.kind ?? 'area'}`, html: `<span>${escapeHTML(label.text)}</span>`, iconSize: null }) }).addTo(map);
  }
  const landBounds = L.latLngBounds(shapes.land.map(ll));
  map.fitBounds(landBounds, { padding: [16, 16] });

  let routeClick = null;
  const layers = { paths: L.layerGroup().addTo(map), selected: L.layerGroup().addTo(map) };
  // Paths as the Book of Mormon reader draws them: a shadow, a dashed line in the kind's color,
  // a wide invisible line for clicks, and chevron arrows spaced in screen pixels (volumes.js routeStyle).
  const drawn = { paths: [], selected: [] };
  function placeArrows(item) {
    item.arrows.clearLayers();
    if (item.route.direction === false) return;
    const { style } = item, pts = item.route.points.map(p => map.latLngToLayerPoint(ll(p)));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < style.arrowMin) continue;
      const count = Math.max(1, Math.floor(length / style.arrowEvery)), angle = Math.atan2(dy, dx) * 180 / Math.PI;
      for (let j = 0; j < count; j++) {
        const t = (j + style.arrowAt) / count;
        const html = `<svg viewBox="0 0 18 18" aria-hidden="true" style="transform:rotate(${angle}deg)"><path d="${ARROW_PATH}" fill="${style.color}" stroke="${ARROW_EDGE}" stroke-width="1.2"/></svg>`;
        L.marker(map.layerPointToLatLng([a.x + dx * t, a.y + dy * t]), { pane: item.pane, interactive: false, keyboard: false, opacity: item.opacity, icon: L.divIcon({ className: 'route-arrow', iconSize: [18, 18], iconAnchor: [9, 9], html }) }).addTo(item.arrows);
      }
    }
  }
  map.on('zoomend', () => { for (const item of [...drawn.paths, ...drawn.selected]) placeArrows(item); });
  const callbacks = new Set();
  let pending = false;
  const draw = () => {
    pending = false;
    const size = map.getSize();
    for (const callback of callbacks) callback({ width: size.x, height: size.y });
  };
  // Draw on the next frame. A timer backs it up, because a background tab may hold frames back.
  const request = () => {
    if (pending) return;
    pending = true;
    const frame = requestAnimationFrame(() => { clearTimeout(timer); if (pending) draw(); });
    const timer = setTimeout(() => { cancelAnimationFrame(frame); if (pending) draw(); }, 120);
  };
  map.on('move zoom resize viewreset zoomend moveend', request);

  return {
    view: {
      project(key, place) {
        if (place?.x == null) return null;
        const point = map.latLngToContainerPoint(ll([place.x, place.y]));
        return { x: point.x, y: point.y };
      },
      onFrame(callback) { callbacks.add(callback); request(); return () => callbacks.delete(callback); },
      request,
    },
    // Two layers, as on the globe: every active event's paths, and the selected event's paths above them.
    setRoutes(list = [], layer = 'selected') {
      const group = layers[layer], pane = layer === 'selected' ? 'routes' : 'paths';
      group.clearLayers();
      drawn[layer] = list.map(route => {
        const style = routeStyle(route.volume, route), points = route.points.map(ll), opacity = route.dimmed ? 0.35 : 1;
        if (style.shadow) L.polyline(points, { pane, color: '#071a2a', weight: style.weight + 3, opacity: 0.35 * opacity, interactive: false }).addTo(group);
        const line = L.polyline(points, { pane, color: style.color, weight: style.weight, opacity, dashArray: style.dash, interactive: false, className: 'route-line' }).addTo(group);
        const item = { route, style, pane, opacity, arrows: L.layerGroup().addTo(group) };
        placeArrows(item);
        if (route.key && routeClick) {
          const hit = L.polyline(points, { pane, color: style.color, weight: 20, opacity: 0, className: 'route-hit' }).addTo(group);
          hit.on('click', event => { L.DomEvent.stopPropagation(event); routeClick(route.key); });
          hit.on('mouseover', () => line.setStyle({ opacity: 1, weight: style.weight + 1.5 }));
          hit.on('mouseout', () => line.setStyle({ opacity, weight: style.weight }));
        }
        return item;
      });
    },
    onRouteClick(callback) { routeClick = callback; },
    // Fit the map to a set of [x, y] points, or to the whole land.
    focus(points, { animate = true } = {}) {
      map.invalidateSize({ pan: false });
      if (!points?.length) { map.fitBounds(landBounds, { padding: [16, 16], animate }); return; }
      const bounds = points.length === 1
        ? L.latLngBounds(ll([points[0][0] - 30, points[0][1] - 30]), ll([points[0][0] + 30, points[0][1] + 30]))
        : L.latLngBounds(points.map(ll));
      map.flyToBounds(bounds, { padding: [48, 48], maxZoom: 1.5, duration: animate ? 0.8 : 0 });
    },
    resize() { map.invalidateSize({ pan: false }); request(); },
  };
}
