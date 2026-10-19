// Paths that run between the same two places would draw on top of each other, and only the top one
// could be clicked. Each such leg takes its own lane instead: the lines run side by side, a few pixels
// apart, and meet again at the places they share. Used by the globe (route-layer.js) and the
// Book of Mormon map (bom-map.js).

const LANE_PIXELS = 9; // a 5px line and a 4px gap
const MIN_LANE_PIXELS = 6; // lanes squeeze down to this when many paths share a leg
const BAND_PIXELS = 40; // the widest a set of lanes grows, unless lanes reach their minimum
const RAMP_PIXELS = 28; // how far from a place a lane takes to open to its full width

// Pixels between lanes, for `count` lanes along a leg `length` pixels long on screen.
// A short leg (the globe zoomed out) keeps its lanes narrow, so the band stays a line.
export function laneSpacing(count, length = Infinity) {
  if (count < 2) return 0;
  const fit = Math.max(MIN_LANE_PIXELS, Math.min(LANE_PIXELS, BAND_PIXELS / (count - 1)));
  return Math.min(fit, length / 4 / (count - 1));
}

// Lanes for every leg of every path, as an array per path: null for a leg no other path shares,
// otherwise its signed lane number centered on the shared line, and how many lanes the leg has.
// So a path running both ways on one leg takes two lanes. Each route has `points` and a `key`,
// and places closer than `near` (in the points' own units) count as one place.
export function assignLanes(routes, near) {
  const nodes = [];
  const node = ([a, b]) => {
    let i = nodes.findIndex(([x, y]) => Math.hypot(x - a, y - b) < near);
    if (i < 0) i = nodes.push([a, b]) - 1;
    return i;
  };
  const shared = new Map();
  const legs = routes.map(({ points, key: path = '' }) => points.slice(1).map((point, i) => {
    const from = node(points[i]), to = node(point);
    if (from === to) return null;
    // The shared line runs from the place that sorts first, by position, so it does not hang on list order.
    const [x0, y0] = nodes[from], [x1, y1] = nodes[to], forward = x0 < x1 || (x0 === x1 && y0 < y1);
    const key = forward ? `${from}|${to}` : `${to}|${from}`;
    const leg = { path, forward };
    if (!shared.has(key)) shared.set(key, []);
    shared.get(key).push(leg);
    return leg;
  }));
  // Lanes go in key order, so a path keeps its lane when it is selected or dimmed.
  for (const group of shared.values()) group.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).forEach((leg, i) => {
    const lane = i - (group.length - 1) / 2;
    // The side is set by the shared line's direction, so a path running the other way stays on its side.
    leg.lane = leg.forward ? lane : -lane;
    leg.count = group.length;
  });
  return legs.map(list => list.map(leg => leg && leg.count > 1 ? { lane: leg.lane, count: leg.count } : null));
}

// Shift one leg's screen points sideways into its lane, easing in and out at both ends.
// Points that are null (behind the Earth) stay null.
export function shiftLeg(points, lane) {
  if (!lane) return points;
  const out = points.slice();
  let start = 0;
  while (start < points.length) {
    if (!points[start]) { start++; continue; }
    let end = start;
    while (end + 1 < points.length && points[end + 1]) end++;
    shiftRun(points, out, start, end, lane);
    start = end + 1;
  }
  return out;
}

function shiftRun(points, out, start, end, { lane, count }) {
  const along = [0];
  for (let i = start + 1; i <= end; i++) along.push(along[along.length - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = along[along.length - 1];
  if (!total) return;
  const offset = lane * laneSpacing(count, total);
  const ramp = Math.min(RAMP_PIXELS, total / 3);
  for (let i = start; i <= end; i++) {
    const a = points[Math.max(start, i - 1)], b = points[Math.min(end, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (!length) continue;
    const s = along[i - start], ease = Math.min(1, s / ramp, (total - s) / ramp);
    const shift = offset * (ease * ease * (3 - 2 * ease)); // smoothstep
    out[i] = { x: points[i].x - dy / length * shift, y: points[i].y + dx / length * shift };
  }
}
