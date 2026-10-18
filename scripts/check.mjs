// Checks for Wayfinder Timeline. Run with `npm run check`.
// 1. Script syntax. 2. The time scale. 3. The built data in dist/data (scripts/check-data.mjs).

import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}\n     ${error.message}`); }
};
const warn = message => console.log(`warn ${message}`);

// 1. Every app script parses.
for (const file of (await readdir(dist)).filter(f => f.endsWith('.js'))) {
  test(`syntax ${file}`, () => execFileSync(process.execPath, ['--check', dist + file], { stdio: 'pipe' }));
}

// 2. The time scale.
const t = await import(new URL('../dist/time-scale.js', import.meta.url));

test('there is no year 0', () => {
  assert.equal(t.toAstro(-1), 0);
  assert.equal(t.fromAstro(0), -1);
  assert.equal(t.addYears(-1, 1), 1);
  assert.equal(t.addYears(1, -1), -1);
  assert.equal(t.addYears(-701, 701), 1);
});

test('the warp covers the full span in order', () => {
  assert.equal(t.yearToU(t.FIRST_YEAR), 0);
  assert.equal(t.yearToU(t.LAST_YEAR), 1);
  let previous = -1;
  for (let year = t.FIRST_YEAR; year <= t.LAST_YEAR; year += year === -1 ? 2 : 1) {
    const u = t.yearToU(year);
    assert.ok(u > previous, `position must grow at ${year}`);
    previous = u;
  }
});

test('the warp follows DESIGN.md section 2', () => {
  const share = (a, b) => t.yearToU(b) - t.yearToU(a);
  assert.ok(Math.abs(share(-4000, -2000) - 0.10) < 1e-9);
  assert.ok(Math.abs(share(-2000, 100) - 0.50) < 1e-9);
  assert.ok(Math.abs(share(100, 1800) - 0.15) < 1e-9);
  assert.ok(Math.abs(share(1800, 2026) - 0.25) < 1e-9);
  // Expanded spans get more space per year than compressed spans.
  assert.ok(t.yearsPerU(0.3) < t.yearsPerU(0.05));
  assert.ok(t.yearsPerU(0.9) < t.yearsPerU(0.7));
});

test('year to position and back is exact', () => {
  for (const year of [-4000, -2000, -1446, -701, -600, -1, 1, 33, 100, 421, 1492, 1800, 1830, 2026]) {
    assert.equal(t.uToYear(t.yearToU(year)), year, `round trip for ${year}`);
  }
});

test('zoom keeps the anchor in place and stays in bounds', () => {
  const view = t.zoomView(t.FULL_VIEW, 0.25, 0.5);
  assert.ok(Math.abs((0.5 - view.u0) / (view.u1 - view.u0) - 0.5) < 1e-9);
  const deep = t.zoomView(t.FULL_VIEW, 1e-9, 0.3);
  assert.ok(Math.abs(deep.u1 - deep.u0 - t.minSpanAt(0.3)) < 1e-12);
  for (const year of [-3000, -600, 1000, 1830]) {
    const u = t.yearToU(year), view = t.zoomView(t.FULL_VIEW, 1e-9, u);
    const years = t.toAstro(t.uToYear(view.u1)) - t.toAstro(t.uToYear(view.u0));
    assert.ok(years >= 9 && years <= 11, `deepest zoom at ${year} shows ${years} years`);
  }
  const edge = t.panView(view, 10);
  assert.equal(edge.u1, 1);
});

test('the active window is about 2% of the visible strip', () => {
  const full = t.activeWindow(-600, t.FULL_VIEW);
  assert.ok(full.start < -600 && full.end > -600);
  const span = t.yearToU(full.end) - t.yearToU(full.start);
  assert.ok(span > 0.018 && span < 0.024, `window share ${span}`);
  const zoomed = t.activeWindow(-600, t.zoomView(t.FULL_VIEW, 0.05, t.yearToU(-600)));
  assert.ok(zoomed.end - zoomed.start < full.end - full.start, 'window narrows when zoomed in');
});

test('typed years parse', () => {
  const cases = { '701 BCE': -701, '701 bc': -701, '-701': -701, '33': 33, '33 CE': 33, 'AD 33': 33, '1830': 1830, '1,830': 1830, '9999': 2026, '0': null, 'abc': null, 'AD 33 BC': null };
  for (const [text, expected] of Object.entries(cases)) assert.equal(t.parseYear(text), expected, text);
});

test('years format with BCE and CE', () => {
  assert.equal(t.formatYear(-701), '701 BCE');
  assert.equal(t.formatYear(33), '33 CE');
  assert.equal(t.formatYear(1830), '1830');
  assert.equal(t.formatRange(-650, -550), '650–550 BCE');
  assert.equal(t.formatRange(-5, 5), '5 BCE–5 CE');
});

test('ticks never overlap and fall on round years', () => {
  for (const width of [320, 800, 1600]) {
    for (const view of [t.FULL_VIEW, t.zoomView(t.FULL_VIEW, 0.1, t.yearToU(-600)), t.zoomView(t.FULL_VIEW, 0.002, t.yearToU(1830))]) {
      const list = t.ticks(view, width);
      assert.ok(list.length >= 2, `at least two ticks at width ${width}`);
      for (let i = 1; i < list.length; i++) assert.ok(list[i].x - list[i - 1].x >= 84 * 0.8 - 1e-6, 'tick gap');
      for (const tick of list) assert.notEqual(tick.year, 0);
    }
  }
});

test('the full view labels the era line and the compressed span', () => {
  for (const width of [360, 800, 1600]) {
    const years = t.ticks(t.FULL_VIEW, width).map(tick => tick.year);
    assert.ok(years.includes(1), `1 CE tick at width ${width}: ${years}`);
    if (width >= 800) assert.ok(years.some(year => year > 100 && year < 1800), `a tick between 100 and 1800 CE at width ${width}: ${years}`);
  }
});

test('arrow-key steps scale with zoom', () => {
  const full = t.keyStep(-600, t.FULL_VIEW);
  const deep = t.keyStep(-600, t.zoomView(t.FULL_VIEW, 0.001, t.yearToU(-600)));
  assert.ok(full >= 10 && deep === 1, `steps ${full} and ${deep}`);
});

// 2b. Event window logic.
const ev = await import(new URL('../dist/events.js', import.meta.url));
const sample = {
  bands: { primeval: { start: -4000, end: -2001, label: 'Years not given' }, jaredite: { start: -4000, end: -130, label: 'Jaredite record' } },
  events: [
    { id: 'a', ref: 'A 1', start: -2000, end: -1700 },
    { id: 'b', ref: 'B 1', start: -600, end: -600 },
    { id: 'c', ref: 'C 1', start: null, end: null, band: 'primeval' },
    { id: 'd', ref: 'D 1', start: null, end: null, band: 'jaredite' },
  ],
};
test('events overlap the window; band events follow their band', () => {
  const ids = (window, year) => ev.activeEvents(sample, window, year).map(e => e.id).join(',');
  assert.equal(ids({ start: -620, end: -580 }, -600), 'b,d');
  assert.equal(ids({ start: -1800, end: -1750 }, -1775), 'a,d');
  assert.equal(ids({ start: -3020, end: -2980 }, -3000), 'c,d');
  assert.equal(ids({ start: -2030, end: -1990 }, -2010), 'a,c,d');
  assert.equal(ids({ start: -110, end: -90 }, -100), '', 'the Jaredite band ends at -130');
  assert.deepEqual(ev.stripBands(sample).map(b => b.lane), [0]);
  assert.deepEqual(ev.stripBands(sample, { bom: true }).map(b => b.lane), [0, 1]);
});
test('event stops include the band start and skip duplicates', () => {
  const stops = ev.eventStops(sample);
  assert.deepEqual(stops.map(s => s.year), [-4000, -2000, -600]);
  assert.equal(ev.nextStop(stops, -600), null);
  assert.equal(ev.previousStop(stops, -600).year, -2000);
  assert.equal(ev.nextStop(stops, -4000).year, -2000);
});

// 2b2. "Also at this time": the other kind, nearest first, within 150 years, never for order-only events.
const card = await import(new URL('../dist/card.js', import.meta.url));
test('also at this time links the other kind of event, nearest first', () => {
  const pool = [
    { id: 's1', volume: 'ot', start: -1300, end: -1200 },
    { id: 'h1', volume: 'history', start: -1274, end: -1274 },
    { id: 'h2', volume: 'history', start: -1600, end: -1600 },
    { id: 'h3', volume: 'history', start: -1150, end: -1150 },
    { id: 's2', volume: 'ot', start: -1150, end: -1100 },
    { id: 's3', volume: 'ot', start: null, end: null, band: 'primeval' },
  ];
  assert.deepEqual(card.alsoAtThisTime(pool[0], pool).map(e => e.id), ['h1', 'h3']);
  assert.deepEqual(card.alsoAtThisTime(pool[1], pool).map(e => e.id), ['s1', 's2']);
  assert.deepEqual(card.alsoAtThisTime(pool[5], pool), []);
});
test('hand-picked related events come first, without duplicates, then the nearest fill to four', () => {
  const pool = [
    { id: 's1', volume: 'dc', start: 1832, end: 1832 },
    ...[1831, 1829, 1836, 1840, 1845].map((year, i) => ({ id: `h${i + 1}`, volume: 'history', start: year, end: year })),
    { id: 'h-far', volume: 'history', start: 1861, end: 1865 },
    { id: 'h-old', volume: 'history', start: 1500, end: 1500 },
    { id: 's2', volume: 'ot', start: null, end: null, band: 'primeval' },
  ];
  const ids = (event, related) => card.alsoAtThisTime(event, pool, related).map(e => e.id);
  assert.deepEqual(ids(pool[0], []), ['h1', 'h2', 'h3', 'h4']);
  assert.deepEqual(ids(pool[0], ['h-far']), ['h-far', 'h1', 'h2', 'h3']);
  // A linked event that also ranks nearest is listed once.
  assert.deepEqual(ids(pool[0], ['h-far', 'h2', 'h2']), ['h-far', 'h2', 'h1', 'h3']);
  // Links ignore the 150-year window, and an unknown id is skipped.
  assert.deepEqual(ids(pool[0], ['h-old', 'missing']), ['h-old', 'h1', 'h2', 'h3']);
  // Order-only events still show their links.
  assert.deepEqual(ids(pool[8], ['h-far']), ['h-far']);
  assert.deepEqual(ids(pool[0], ['h1', 'h2', 'h3', 'h4', 'h5']), ['h1', 'h2', 'h3', 'h4', 'h5']);
});

// 2c. The address.
const address = await import(new URL('../dist/address.js', import.meta.url));
test('the address round-trips and rejects bad values', () => {
  const state = { year: -701, event: 'isaiah-36', hide: ['nt', 'dc'], view: { u0: 0.21, u1: 0.26 }, bom: true };
  const hash = address.writeHash(state);
  assert.equal(hash, '#year=-701&event=isaiah-36&hide=dc,nt&view=0.21,0.26&bom=1');
  assert.deepEqual(address.readHash(hash), { ...state, hide: ['dc', 'nt'] });
  assert.equal(address.writeHash({ year: 1830, view: { u0: 0, u1: 1 } }), '#year=1830');
  assert.deepEqual(address.readHash('#year=0&event=<script>&hide=xx&view=0.5,0.2'), {});
  assert.deepEqual(address.readHash('#year=-9000'), {});
});

// 2d. Volume identity: every volume has its own hue and its own shape.
const volumes = await import(new URL('../dist/volumes.js', import.meta.url));
test('each volume has a distinct hue and a distinct shape', () => {
  const list = Object.values(volumes.VOLUMES);
  assert.equal(new Set(list.map(v => v.color)).size, list.length);
  assert.equal(new Set(list.map(v => v.shape)).size, list.length);
  for (const id of volumes.VOLUME_ORDER) assert.match(volumes.shapeSVG(id), /<svg[\s\S]*<\/svg>/);
});

// 3. The built data.
const { checkData } = await import(new URL('./check-data.mjs', import.meta.url));
const pending = [];
await checkData((name, fn) => pending.push(test(name, fn)), warn);
await Promise.all(pending);

if (failures) { console.log(`\n${failures} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
