// Data checks for dist/data (DESIGN.md section 10). Called from scripts/check.mjs.
// Needs scripts/source from `npm run import` to compare verses and coordinates with their sources.

import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_YEAR, LAST_YEAR } from '../dist/time-scale.js';

const here = dirname(fileURLToPath(import.meta.url));
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const exists = path => access(path).then(() => true, () => false);

export async function checkData(test, warn) {
  const dataPath = join(here, '..', 'dist', 'data', 'events.json');
  if (!(await exists(dataPath))) { test('dist/data/events.json exists', () => { throw new Error('Run npm run build.'); }); return; }
  const index = await readJSON(dataPath);
  const details = {};
  for (const volume of ['ot', 'nt', 'bom', 'dc', 'history']) details[volume] = await readJSON(join(here, '..', 'dist', 'data', 'details', `${volume}.json`));
  const overrides = await readJSON(join(here, 'date-overrides.json'));
  const curated = await readJSON(join(here, 'curated-events.json'));
  const report = await readJSON(join(here, 'build-report.json'));
  const src = join(here, 'source');
  const haveSources = await exists(join(src, 'church-chronology', 'tables.json'));
  const { events, places } = index;

  test('every chapter with places became an event or has a skip rule', () => {
    const imported = events.filter(e => !e.curated && e.volume !== 'history').length;
    const expected = report.stats.chapters - report.stats.noPlace;
    if (imported + report.stats.skipped.length !== expected) throw new Error(`${imported} events + ${report.stats.skipped.length} skipped ≠ ${expected} chapters with places`);
    for (const skip of report.stats.skipped) if (!skip.reason) throw new Error(`${skip.ref} is skipped with no reason`);
  });

  const chapterList = await readJSON(join(here, '..', 'dist', 'data', 'chapters.json')).catch(() => ({ events: [] }));
  test('the chapter list for the readers matches the chapter events', () => {
    const list = chapterList.events;
    const expected = events.filter(e => !e.curated && e.volume !== 'history');
    if (list.length !== expected.length || expected.some((e, i) => list[i] !== e.id)) throw new Error('dist/data/chapters.json is stale. Run npm run build.');
    for (const e of expected) {
      const want = e.volume === 'dc' ? (/^od[0-9]$/.test(String(e.chapter)) ? e.chapter : `dc-${e.chapter}`) : `${e.book}-${e.chapter}`;
      if (e.id !== want) throw new Error(`${e.id} does not follow the reader rule (${want})`);
    }
  });

  test('event ids are unique and volumes are known', () => {
    const seen = new Set();
    for (const e of events) {
      if (seen.has(e.id)) throw new Error(`duplicate id ${e.id}`);
      seen.add(e.id);
      if (!['ot', 'nt', 'bom', 'dc', 'history'].includes(e.volume)) throw new Error(`${e.id}: unknown volume ${e.volume}`);
    }
  });

  test('every event has a date rule result in range', () => {
    for (const e of events) {
      if (e.basis === 'not-given') {
        if (e.start != null || e.end != null || !index.bands[e.band]) throw new Error(`${e.id}: an order-only event needs a band and no years`);
        continue;
      }
      for (const year of [e.start, e.end]) {
        if (!Number.isInteger(year) || year === 0 || year < FIRST_YEAR || year > LAST_YEAR) throw new Error(`${e.id}: bad year ${year}`);
      }
      if (e.end < e.start) throw new Error(`${e.id}: ends before it starts (${e.start} to ${e.end})`);
    }
  });

  test('every event place exists with usable coordinates', () => {
    for (const e of events) {
      for (const key of new Set([e.place, ...e.places])) {
        const p = places[key];
        if (!p) throw new Error(`${e.id}: place ${key} missing`);
        if (e.map === 'globe' && (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) throw new Error(`${e.id}: ${key} has no latitude and longitude`);
        if (e.map === 'bom' && (!Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error(`${e.id}: ${key} has no map position`);
      }
    }
  });

  test('every event has details and known sources', () => {
    for (const e of events) {
      const d = details[e.volume][e.id];
      if (!d) throw new Error(`${e.id}: no details record`);
      if (!d.dateLabel) throw new Error(`${e.id}: no date label`);
      for (const id of d.dateSourceIds ?? []) if (!index.sources[id]) throw new Error(`${e.id}: unknown source ${id}`);
      if (!d.dateSourceIds?.length) throw new Error(`${e.id}: no date source`);
    }
  });

  test('new text keeps sentences to 15 words or fewer', () => {
    const texts = [
      ...Object.values(overrides.notes), ...Object.values(overrides.bases),
      ...overrides.rules.flatMap(r => [r.dateNote, r.fix, overrides.notes[r.reason] ? null : r.reason]),
      ...Object.values(overrides.sources).map(s => s.note),
      ...curated.events.map(e => e.summary), ...Object.values(curated.annotations).map(a => a.placeNote),
      ...Object.values(details.history).map(d => d.summary),
      ...events.filter(e => e.basis === 'church-history').map(e => details.dc[e.id]?.summary),
    ].filter(Boolean);
    for (const text of texts) {
      for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/)) {
        const words = sentence.split(/\s+/).filter(Boolean).length;
        if (words > 15) throw new Error(`${words} words: "${sentence}"`);
      }
    }
  });

  test('the Book of Mormon map data is complete and every map place is inside it', async () => {
    const dist = join(here, '..', 'dist');
    const map = await readJSON(join(dist, 'data', 'bom-map.json'));
    const [[south, west], [north, east]] = map.bounds;
    for (const key of ['land', 'sidon', 'waters', 'labels', 'rivers']) if (!map[key]?.length) throw new Error(`bom-map.json has no ${key}`);
    for (let z = map.tiles.minZoom; z <= map.tiles.maxZoom; z++) {
      if (!(await exists(join(dist, 'assets', 'bom-relief', String(z))))) throw new Error(`relief zoom ${z} is missing`);
    }
    for (const file of ['leaflet.js', 'leaflet.css', 'leaflet-LICENSE.txt']) if (!(await exists(join(dist, 'vendor', file)))) throw new Error(`vendor/${file} is missing`);
    for (const e of events.filter(e => e.map === 'bom')) for (const key of e.places) {
      const p = places[key];
      if (p.y < south || p.y > north || p.x < west || p.x > east) throw new Error(`${e.id}: ${key} is outside the map`);
    }
  });

  test('every world history event is sourced, placed, and verified against its source', async () => {
    const history = events.filter(e => e.volume === 'history' || e.basis === 'church-history');
    const verified = await readJSON(join(here, 'history', 'verified.json')).catch(() => null);
    if (!verified) throw new Error('scripts/history/verified.json is missing. Run npm run verify:sources.');
    const result = new Map(verified.results.map(r => [r.church ? `ch-${r.id}` : `h-${r.id}`, r]));
    for (const e of history) {
      const d = details[e.volume][e.id];
      const source = index.sources[d.dateSourceIds?.[0]];
      if (!source?.url || !source.quote?.length) throw new Error(`${e.id}: needs a source with a URL and a quote`);
      if (e.volume === 'history' && ![1, 2].includes(e.tier)) throw new Error(`${e.id}: tier must be 1 or 2`);
      if (e.map !== 'globe') throw new Error(`${e.id}: history never goes on the Book of Mormon map`);
      if (!d.summary) throw new Error(`${e.id}: no summary`);
      if (source.author === 'Wikipedia' && !result.get(e.id)?.ok) throw new Error(`${e.id}: its quote has not passed npm run verify:sources`);
    }
    // Region coverage is reported, not enforced (DESIGN.md Q13).
    const counts = {};
    for (const e of history.filter(x => x.volume === 'history')) counts[e.region] = (counts[e.region] ?? 0) + 1;
    warn('world history by region: ' + Object.entries(counts).sort().map(([r, n]) => `${r} ${n}`).join(', '));
  });

  if (!haveSources) { warn('scripts/source is missing. Run npm run import to check verses, Church rows, and land.'); return; }

  test('quoted verses match the source text', async () => {
    const bibleCache = new Map();
    const bom = await readJSON(join(src, 'book-of-mormon', 'scripture.json'));
    const dc = await readJSON(join(src, 'doctrine-and-covenants', 'doctrine-and-covenants.json'));
    const dcText = new Map(dc.sections.map(s => [s.section, s.verses]));
    for (const e of events) {
      const verse = details[e.volume][e.id].verse;
      if (!verse) continue;
      const [, chapter, number] = verse.ref.match(/(\d+|[a-z0-9-]+):(\d+)$/) ?? [];
      let expected;
      if (e.volume === 'ot' || e.volume === 'nt') {
        if (!bibleCache.has(e.book)) bibleCache.set(e.book, await readJSON(join(src, 'bible', `${e.book}-native-scripture.json`)));
        expected = bibleCache.get(e.book).chapters[chapter]?.find(v => v.verse === Number(number))?.text;
      } else if (e.volume === 'bom') {
        expected = bom.chapters[e.id]?.verses.find(v => v.verse === Number(number))?.text;
      } else {
        const section = Number(verse.ref.match(/D&C (\d+):/)?.[1]);
        expected = dcText.get(section)?.find(v => v.verse === Number(number))?.text;
      }
      if (verse.text !== expected) throw new Error(`${e.id}: ${verse.ref} does not match the source`);
    }
  });

  test('Church chronology evidence matches the table rows', async () => {
    const tables = await readJSON(join(src, 'church-chronology', 'tables.json'));
    for (const rule of overrides.rules.filter(r => r.evidence)) {
      const page = rule.sourceIds.includes('church-nt') ? 'church-nt' : 'church-ot';
      const rows = tables[page].flat().map(row => row.join(' | '));
      for (const [text, year] of rule.evidence) {
        const yearPattern = new RegExp(`(^|\\D)${year}(\\D|$)`);
        if (!rows.some(row => row.includes(text) && yearPattern.test(row))) throw new Error(`${rule.book} ${rule.chapters ?? ''}: no ${page} row has "${text}" and ${year}`);
      }
    }
  });

  test('globe places are on land', async () => {
    // 1:50m land plus the 1:10m minor islands, which adds small islands such as Patmos.
    const features = [];
    for (const file of ['ne_50m_land.geojson', 'ne_10m_minor_islands.geojson']) {
      const path = join(src, 'natural-earth', file);
      if (await exists(path)) features.push(...(await readJSON(path)).features);
      else warn(`${file} is missing. Run npm run import.`);
    }
    const polygons = features.flatMap(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
    const boxes = polygons.map(rings => {
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const [x, y] of rings[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      return { minX, minY, maxX, maxY };
    });
    const offshore = [];
    const keys = new Set(events.filter(e => e.map === 'globe').flatMap(e => e.places));
    // Islands too small for Natural Earth. Each entry was checked by hand.
    const tooSmall = {
      'b:patmos': 'Patmos (34 km²) is in neither Natural Earth layer. The nearest outline is 16 km away.',
    };
    for (const key of keys) {
      const p = places[key];
      if (!tooSmall[key] && !onLand(p, polygons, boxes)) offshore.push(`${key} (${p.lat}, ${p.lng})`);
    }
    if (offshore.length) throw new Error(`${offshore.length} place(s) are more than 15 km from land: ${offshore.join('; ')}`);
  });
}

// A place passes when it is inside a land polygon or within 15 km of the coast.
// The tolerance covers port towns and islands that the 1:50m coastline simplifies.
function onLand({ lat, lng }, polygons, boxes) {
  const pad = 0.2;
  for (let i = 0; i < polygons.length; i++) {
    const b = boxes[i];
    if (lng < b.minX - pad || lng > b.maxX + pad || lat < b.minY - pad || lat > b.maxY + pad) continue;
    const [outer, ...holes] = polygons[i];
    if (inside(lng, lat, outer) && !holes.some(h => inside(lng, lat, h))) return true;
    if (edgeDistanceKm(lat, lng, outer) <= 15) return true;
  }
  return false;
}
function inside(x, y, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function edgeDistanceKm(lat, lng, ring) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - lng) * kx, ay = (ring[j][1] - lat) * ky, bx = (ring[i][0] - lng) * kx, by = (ring[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
