// The Book of Mormon panel map (DESIGN.md section 7). Leaflet's flat CRS, one unit per Sorenson mile.
// The relief, land, rivers, and labels come from Book of Mormon Wayfinder via dist/data/bom-map.json.
// Leaflet loads only the first time the panel opens.

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
  // An arrowhead at the end of a path, in miles. Its size follows the last leg.
  const arrowhead = points => {
    const [x1, y1] = points[points.length - 1], [x0, y0] = points[points.length - 2] ?? [];
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (!length) return null;
    const size = Math.min(14, Math.max(4, length * 0.35)), ux = (x1 - x0) / length, uy = (y1 - y0) / length;
    const bx = x1 - ux * size, by = y1 - uy * size;
    return [[bx - uy * size * 0.6, by + ux * size * 0.6], [x1, y1], [bx + uy * size * 0.6, by - ux * size * 0.6]];
  };
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
    // Two layers, as on the globe: every active event's paths, and the selected event's routes in gold.
    setRoutes(list = [], layer = 'selected') {
      const group = layers[layer];
      group.clearLayers();
      for (const route of list) {
        const style = { pane: layer === 'selected' ? 'routes' : 'paths', color: route.color ?? '#efcc88', weight: layer === 'selected' ? 2.4 : 1.8, opacity: route.opacity ?? 0.95, interactive: false };
        const line = L.polyline(route.points.map(ll), { ...style, dashArray: route.dashed ? '6 6' : null }).addTo(group);
        const head = arrowhead(route.points);
        if (head) L.polyline(head.map(ll), style).addTo(group);
        // A wide, invisible line takes the click, as in the Book of Mormon reader.
        if (route.key && routeClick) {
          const hit = L.polyline(route.points.map(ll), { pane: style.pane, color: '#000', weight: 18, opacity: 0, className: 'route-hit' }).addTo(group);
          hit.on('click', event => { L.DomEvent.stopPropagation(event); routeClick(route.key); });
          hit.on('mouseover', () => line.setStyle({ opacity: 1, weight: style.weight + 1 }));
          hit.on('mouseout', () => line.setStyle({ opacity: style.opacity, weight: style.weight }));
        }
      }
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
