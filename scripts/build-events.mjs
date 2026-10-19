// Build dist/data from the pinned sources in scripts/source and the rules in scripts/date-overrides.json.
// Run `npm run import` first. Then `npm run build`, then `npm run check`.
//
// Output
//   dist/data/events.json          compact index: every event, its date, and its place (loaded at start-up)
//   dist/data/details/<volume>.json  summaries, key verses, routes, and date notes (loaded when a card opens)
//
// One chapter (or D&C section) is one event. A chapter with no places is skipped (DESIGN.md section 3).

import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatYear, formatRange } from '../dist/time-scale.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'source');
const out = join(here, '..', 'dist', 'data');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));

const config = await readJSON(join(here, 'sources.json'));
const overrides = await readJSON(join(here, 'date-overrides.json'));
const problems = [], warnings = [];
const stats = { chapters: 0, events: 0, noPlace: 0, skipped: [] };

// ---------- Dates ----------

// Read a date-band label such as "~970 - 930 BCE", "~7 BCE - 8 CE", "~853 BCE",
// "After ~516 BCE (disputed)", or "~60s CE or 2nd century (disputed)".
// Returns {start, end, disputed} with null for an open end, or null when undated.
export function parseLabel(label) {
  if (!label) return null;
  const disputed = /\(disputed\)/i.test(label);
  const text = label.replace(/\([^)]*\)/g, '').replace(/~/g, '').replace(/[–—]/g, '-').trim();
  if (/^(undated|date unknown|jaredite era)/i.test(text) || /date not given/i.test(label)) return null;
  const year = (n, era) => (era === 'BCE' ? -Number(n) : Number(n));
  let m;
  if ((m = text.match(/^(\d+)\s*(BCE|CE)?\s*-\s*(\d+)\s*(BCE|CE)$/))) {
    return { start: year(m[1], m[2] ?? m[4]), end: year(m[3], m[4]), disputed };
  }
  if ((m = text.match(/^After\s+(\d+)\s*(BCE|CE)$/i))) return { start: year(m[1], m[2]), end: null, disputed };
  if ((m = text.match(/^Before\s+(\d+)\s*(BCE|CE)$/i))) return { start: null, end: year(m[1], m[2]), disputed };
  if ((m = text.match(/^(\d+)0s\s*(BCE|CE)\b/))) {
    const decade = year(m[1] + '0', m[2]);
    return /2nd century/.test(text) ? { start: decade, end: 199, disputed } : { start: decade, end: decade + 9, disputed };
  }
  if ((m = text.match(/^(\d+)\s*(BCE|CE)\s+or later$/i))) return { start: year(m[1], m[2]), end: null, disputed };
  if ((m = text.match(/^(\d+)\s*(BCE|CE)$/))) return { start: year(m[1], m[2]), end: year(m[1], m[2]), disputed };
  return undefined; // not understood
}

const tidyLabel = label => label.replace(/~/g, 'c. ').replace(/(\d)\s*-\s*(\d|c\.)/g, '$1–$2').replace(/c\. (\d+)\s*–\s*c\. /, 'c. $1–').replace(/\s+/g, ' ').trim();
const rangeLabel = (start, end, approx) => (approx ? 'c. ' : '') + formatRange(start, end);

function ruleFor(volume, book, chapter) {
  return overrides.rules.find(rule => {
    const ruleVolume = rule.volume ?? 'bible';
    if (ruleVolume === 'bible' ? !['ot', 'nt'].includes(volume) : ruleVolume !== volume) return false;
    if (rule.book && rule.book !== book) return false;
    if (rule.chapters && (chapter < rule.chapters[0] || chapter > rule.chapters[1])) return false;
    return true;
  });
}
const noteText = key => (key ? overrides.notes[key] ?? key : undefined);

// For a rule that uses the revised column, find the same rows' biblical-number years (Q26).
// A king's row reads "B.C. 918 | ... Ahab | Rev. Chr. 875 | ...".
const chronology = await readJSON(join(src, 'church-chronology', 'tables.json'));
const biblicalCache = new Map();
function biblicalYears(rule) {
  if (biblicalCache.has(rule)) return biblicalCache.get(rule);
  let result = null;
  if (rule.basis === 'church' || rule.basis === 'ministry') {
    const rows = chronology['church-ot'].flat().map(row => row.join(' | '));
    const found = (rule.evidence ?? []).map(([text, year]) => {
      const row = rows.find(r => r.includes(text) && new RegExp(`Rev\\. Chr\\. ${year}(\\D|$)`).test(r));
      return row?.match(/^B\.C\. (\d+)/)?.[1];
    });
    if (found.length && found.every(Boolean) && found.some((b, i) => b !== rule.evidence[i][1])) {
      const [first, last] = [found[0], found[found.length - 1]];
      result = first === last ? `${first} BC` : `${first}–${last} BC`;
    }
  }
  biblicalCache.set(rule, result);
  return result;
}

// Turn a rule and the repo's own label into the event's date fields.
function resolveDate(rule, repoLabel, where) {
  const repo = repoLabel ? parseLabel(repoLabel) : null;
  if (repoLabel && repo === undefined) problems.push(`${where}: date label not understood: "${repoLabel}"`);
  const date = { basis: rule.basis, sourceIds: rule.sourceIds ?? [] };
  const note = noteText(rule.note);
  if (note) date.note = note;
  if (rule.dateNote) date.dateNote = rule.dateNote;
  const biblical = biblicalYears(rule);
  const addBiblical = () => { if (biblical) date.biblical = `Biblical numbers in the same table: ${biblical}.`; };
  const scholarlyLine = () => {
    if (!repo || repo.start == null || repo.end == null) return;
    const gap = Math.max(Math.abs(repo.start - date.start), Math.abs(repo.end - date.end));
    if (gap >= overrides.materialDifference) date.scholarly = { label: tidyLabel(repoLabel), start: repo.start, end: repo.end };
  };
  switch (rule.basis) {
    case 'not-given':
      return { ...date, start: null, end: null, band: rule.band, label: 'Years not given' };
    case 'scholarly': {
      const start = rule.start ?? repo?.start, end = rule.end ?? repo?.end;
      if (start == null || end == null) { problems.push(`${where}: scholarly rule needs a start and end ("${repoLabel}")`); return null; }
      return { ...date, start, end, label: rule.label ?? (rule.start != null ? rangeLabel(start, end, true) : tidyLabel(repoLabel)) };
    }
    case 'church': {
      Object.assign(date, { start: rule.start, end: rule.end, label: rule.label ?? formatRange(rule.start, rule.end) });
      addBiblical();
      scholarlyLine();
      return date;
    }
    case 'ministry': {
      // Keep the part of the repo's range that falls inside the prophet's lifetime.
      // With no overlap (a later composition date), use the whole lifetime.
      const known = repo && repo.start != null && repo.end != null;
      const start = known ? Math.max(repo.start, rule.start) : null, end = known ? Math.min(repo.end, rule.end) : null;
      if (known && start <= end) {
        const unchanged = start === repo.start && end === repo.end;
        // The repo's own date is kept, so the card names it as a scholarly date.
        Object.assign(date, { start, end, kept: true, sourceIds: ['bible-repo', ...date.sourceIds], label: unchanged ? tidyLabel(repoLabel) : rangeLabel(start, end, true) });
      } else { Object.assign(date, { start: rule.start, end: rule.end, label: rule.label ?? formatRange(rule.start, rule.end) }); addBiblical(); }
      scholarlyLine();
      return date;
    }
    case 'edition': {
      if (rule.start != null) return { ...date, start: rule.start, end: rule.end, label: rule.label ?? rangeLabel(rule.start, rule.end, true), fix: rule.fix };
      if (!repo || repo.start == null || repo.end == null) { problems.push(`${where}: no edition date ("${repoLabel}")`); return null; }
      if (repo.end < repo.start) problems.push(`${where}: date runs backward ("${repoLabel}"). Add a corrected rule.`);
      return { ...date, start: repo.start, end: repo.end, label: tidyLabel(repoLabel) };
    }
    case 'skip':
      return { basis: 'skip', reason: noteText(rule.reason) };
    default:
      problems.push(`${where}: unknown basis ${rule.basis}`);
      return null;
  }
}

// ---------- Places ----------

// Books can use one id for different spots: Succoth in Egypt and Succoth by the Jordan,
// or a region such as Moab drawn at a different point. When a second book's point is
// more than 25 km from the first, that book gets its own key (`b:<book>/<id>`).
const places = {};
function addPlace(key, place, where, scope) {
  const existing = places[key];
  if (!existing) { places[key] = place; return key; }
  if (place.lat != null && existing.lat != null && distanceKm(existing, place) > 25) {
    if (!scope) { warnings.push(`${where}: place ${key} differs between sources. Kept the first.`); return key; }
    const scoped = key.replace(/^(\w+):/, `$1:${scope}/`);
    places[scoped] ??= place;
    stats.scopedPlaces = (stats.scopedPlaces ?? 0) + (places[scoped] === place ? 1 : 0);
    return scoped;
  }
  return key;
}
function distanceKm(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const events = [];
// Search: person key -> name, and event id -> person keys.
const people = {}, eventPeople = {};
const tagPeople = (eventId, entries) => {
  const keys = [];
  for (const [key, name] of entries) { if (!name) continue; people[key] ??= name; keys.push(key); }
  if (keys.length) eventPeople[eventId] = [...new Set(keys)];
};
const details = { ot: {}, nt: {}, bom: {}, dc: {}, history: {} };

function pushEvent(event, detail, date) {
  if (date.basis === 'skip') { stats.skipped.push({ id: event.id, ref: event.ref, reason: date.reason }); return; }
  const { label, sourceIds, note, dateNote, scholarly, fix, biblical, kept, ...core } = date;
  const record = { ...event, ...core };
  // Scripture texts spanning more than 300 years get no pin. History eras keep their ranges.
  if (event.volume !== 'history' && core.start != null && core.end != null && core.end - core.start > 300) record.broad = true;
  events.push(record);
  details[event.volume][event.id] = { ...detail, dateLabel: label, dateSourceIds: sourceIds, ...(note && { dateNote: note }), ...(dateNote && { dateDetail: dateNote }), ...(scholarly && { scholarly }), ...(fix && { dateFix: fix }), ...(biblical && { biblical }), ...(kept && { dateKept: true }) };
  stats.events++;
}

// A route as the card shows it: what the text says, where it says it, and its named stops (DESIGN.md section 5).
// kind and context follow the Bible reader: a campaign with no kind is an army, unless Babylon sends it.
function routeRecord(id, source, points, { ref, text, note, stops = [], kind = source.kind, context = false }) {
  const named = [...new Set(stops.filter(Boolean))];
  return { id, title: source.title, kind, ...(context && { context: true }), ...(source.direction === false && { direction: false }), points, ...(ref && { ref }), ...(text && { text }), ...(note && note !== text && { note }), ...(named.length && { stops: named }) };
}

// ---------- Bible ----------

const ntStart = config.bibleBooks.indexOf(config.newTestamentStartsAt);
// Book name -> id, and id -> verse text, for the scripture event batches below.
const bibleBookIds = new Map(), bibleText = new Map();
for (const [index, id] of config.bibleBooks.entries()) {
  const volume = index < ntStart ? 'ot' : 'nt';
  const content = await readJSON(join(src, 'bible', `${id}-native-content.json`));
  const scripture = await readJSON(join(src, 'bible', `${id}-native-scripture.json`));
  const name = content.book.name;
  bibleBookIds.set(name, id); bibleText.set(id, scripture);
  const placeById = new Map(content.places.map(p => [p.id, p]));
  const bookPeople = (await readJSON(join(src, 'bible', `${id}-people.json`))).people ?? {};
  const routeById = new Map([...(content.textRoutes ?? []), ...(content.campaigns ?? [])].map(r => [r.id, r]));
  const bands = content.chapterDateBands ?? [];
  for (const map of content.chapterMaps) {
    stats.chapters++;
    const n = map.chapter, ref = `${name} ${n}`, where = ref;
    const placeIds = [...new Set([...(map.focusPlaceIds ?? []), ...(map.placeIds ?? [])])].filter(pid => placeById.has(pid));
    if (!placeIds.length) { stats.noPlace++; continue; }
    const rule = ruleFor(volume, id, n);
    if (!rule) { problems.push(`${where}: no date rule`); continue; }
    const band = bands.find(b => n >= b.from && n <= b.to);
    const date = resolveDate(rule, band?.label, where);
    if (!date) continue;
    const keys = placeIds.map(pid => { const p = placeById.get(pid); return addPlace(`b:${pid}`, { name: p.name, lat: p.lat, lng: p.lng }, where, id); });
    tagPeople(`${id}-${n}`, Object.entries(bookPeople).filter(([, person]) => person.chapterIds?.includes(n)).map(([pid, person]) => [`b:${pid}`, person.name]));
    const passage = (content.passages ?? []).filter(p => p.chapter === n).sort((a, b) => a.start - b.start)[0];
    const event = (content.events ?? []).find(e => e.chapter === n && !('year' in e));
    const study = (content.chapterStudies ?? []).find(s => s.chapter === n);
    const verseNumber = study?.verse ?? 1;
    const verseText = scripture.chapters[String(n)]?.find(v => v.verse === verseNumber)?.text;
    if (!verseText) warnings.push(`${where}: key verse ${verseNumber} not found`);
    const contextIds = new Set((map.contextRoutes ?? []).map(r => r.id));
    const routes = [...(map.routes ?? []), ...(map.contextRoutes ?? [])].map(r => {
      const source = routeById.get(r.id);
      if (!source?.points) return null;
      const points = source.points.slice(r.from ?? 0, (r.to ?? source.points.length - 1) + 1);
      if (points.length < 2) return null;
      const chapter = source.chapter ?? n, verses = source.verse ? `:${source.verse}${source.endVerse && source.endVerse !== source.verse ? `–${source.endVerse}` : ''}` : '';
      return routeRecord(r.id, source, points, {
        ref: `${name} ${chapter}${verses}`, text: source.summary, note: source.detail ?? source.uncertainty,
        stops: (source.placeIds ?? []).map(pid => placeById.get(pid)?.name),
        kind: r.kind ?? source.kind ?? (source.faction === 'babylonia' ? 'diplomacy' : 'military'),
        context: contextIds.has(r.id) && !(map.routes ?? []).some(x => x.id === r.id),
      });
    }).filter(Boolean);
    pushEvent(
      { id: `${id}-${n}`, volume, book: id, chapter: n, ref, title: passage?.title ?? event?.title ?? ref, map: 'globe', place: keys[0], places: keys },
      {
        summary: passage?.summary ?? event?.summary ?? map.narrative ?? '',
        verse: verseText ? { ref: `${name} ${n}:${verseNumber}`, text: verseText, translation: scripture.translation } : undefined,
        readerUrl: `../bible/${id}.html#chapter=${n}&verse=${verseNumber}`,
        ...(routes.length && { routes }),
      },
      date,
    );
  }
}

// ---------- Book of Mormon ----------

const bom = await readJSON(join(src, 'book-of-mormon', 'content.json'));
const bomText = await readJSON(join(src, 'book-of-mormon', 'scripture.json'));
const oldWorld = await import(new URL('./source/book-of-mormon/old-world.mjs', import.meta.url));
const st = oldWorld.stage;
// Old World places are stored in the stage's miles. Undo the stage projection to get latitude and longitude.
const toLatLng = ([x, y]) => ({ lat: Math.round((st.lat0 + y / st.milesPerLat) * 1e4) / 1e4, lng: Math.round((st.lng0 + (x - st.origin[0]) / st.milesPerLng) * 1e4) / 1e4 });
const bomPlaces = new Map(bom.places.map(p => [p.id, p]));
const bomPeople = new Map(bom.people.filter(p => p.kind === 'person').map(p => [p.id, p.name]));
const bomRoutes = new Map(bom.routes.map(r => [r.id, r]));
const bomBookNames = new Map(bomText.books.map(b => [b.chapters[0].replace(/-1$/, ''), b.book]));
// scripture.json keeps each chapter under chapters[<id>].verses as [{verse, text}].
const verseLookup = new Map(Object.entries(bomText.chapters ?? {}).map(([chapter, value]) => [chapter, value.verses ?? value]));
const bomPlaceKey = p => (p.stage === 'old'
  ? addPlace(`bom-old:${p.id}`, { name: p.name, ...toLatLng(p.at) }, p.id)
  : addPlace(`bom:${p.id}`, { name: p.name, x: p.at[0], y: p.at[1] }, p.id));

for (const map of bom.chapterMaps) {
  stats.chapters++;
  const [, book, num] = map.chapter.match(/^(.*)-(\d+)$/);
  const n = Number(num), name = bomBookNames.get(book) ?? book, ref = `${name} ${n}`;
  const mentioned = Object.entries(map.placeMentions ?? {}).sort((a, b) => Math.min(...a[1]) - Math.min(...b[1])).map(([pid]) => pid);
  const placeIds = [...new Set([...(map.focusPlaceIds ?? []), ...mentioned])].filter(pid => bomPlaces.has(pid));
  if (!placeIds.length) { stats.noPlace++; continue; }
  const rule = ruleFor('bom', book, n);
  if (!rule) { problems.push(`${ref}: no date rule`); continue; }
  const date = resolveDate(rule, map.dateLabel, ref);
  if (!date) continue;
  const stage = map.oldWorld ? 'old' : 'new';
  const onStage = placeIds.filter(pid => (bomPlaces.get(pid).stage ?? 'new') === stage);
  if (!onStage.length) { warnings.push(`${ref}: no place on the ${stage} stage`); continue; }
  const keys = onStage.map(pid => bomPlaceKey(bomPlaces.get(pid)));
  const focus = onStage[0];
  tagPeople(map.chapter, Object.keys(map.personMentions ?? {}).filter(pid => bomPeople.has(pid)).map(pid => [`bom:${pid}`, bomPeople.get(pid)]));
  const verseNumber = map.placeMentions?.[focus]?.[0] ?? 1;
  const verses = verseLookup.get(map.chapter);
  const verseText = Array.isArray(verses) ? verses.find(v => v.verse === verseNumber)?.text : undefined;
  const routes = (map.routes ?? []).map(rid => {
    const route = bomRoutes.get(typeof rid === 'string' ? rid : rid.id);
    if (!route) return null;
    const points = route.points.map(p => {
      const at = typeof p === 'string' ? bomPlaces.get(p)?.at : p;
      if (!at) return null;
      return stage === 'old' ? Object.values(toLatLng(at)) : at;
    }).filter(Boolean);
    if (points.length < 2) return null;
    return routeRecord(route.id, route, points, {
      ref: route.refs, text: route.text, note: route.research?.text,
      stops: route.points.filter(p => typeof p === 'string').map(pid => bomPlaces.get(pid)?.name),
    });
  }).filter(Boolean);
  pushEvent(
    { id: map.chapter, volume: 'bom', book, chapter: n, ref, title: map.title, map: stage === 'old' ? 'globe' : 'bom', place: keys[0], places: keys },
    {
      summary: map.summary ?? '',
      verse: typeof verseText === 'string' ? { ref: `${ref}:${verseNumber}`, text: verseText, translation: bomText.edition ?? bomText.translation } : undefined,
      readerUrl: `../book-of-mormon/book.html#chapter=${map.chapter}`,
      ...(routes.length && { routes }),
    },
    date,
  );
}

// ---------- Doctrine and Covenants ----------

const dcDir = join(src, 'doctrine-and-covenants');
const dcPlaces = new Map([...(await readJSON(join(dcDir, 'places-base.json'))), ...(await readJSON(join(dcDir, 'places-extra.json')))].map(p => [p.id, p]));
const dcRoutesFile = await readJSON(join(dcDir, 'routes.json'));
for (const [id, value] of Object.entries(dcRoutesFile.waypoints ?? {})) {
  if (!dcPlaces.has(id) && Array.isArray(value)) dcPlaces.set(id, { id, name: value[0], lat: value[1], lng: value[2] });
}
const dcRaw = await readJSON(join(dcDir, 'doctrine-and-covenants.json'));
const dcVerses = new Map(dcRaw.sections.map(s => [s.section, s.verses]));
const dcPeople = new Map((await readJSON(join(dcDir, 'people-ids.json'))).map(p => [p.id, p.name]));
const sectionFiles = (await readdir(join(dcDir, 'sections'))).sort();
for (const file of sectionFiles) {
  stats.chapters++;
  const section = await readJSON(join(dcDir, 'sections', file));
  const isDeclaration = Boolean(section.id && /^od/.test(section.id));
  const n = isDeclaration ? section.id : section.section;
  const ref = isDeclaration ? `Official Declaration ${section.id.slice(2)}` : `D&C ${n}`;
  const placeIds = [...new Set([section.receivedAt, ...(section.placeIds ?? [])])].filter(pid => pid && dcPlaces.has(pid));
  if (!placeIds.length) { stats.noPlace++; continue; }
  const rule = ruleFor('dc', 'dc', typeof n === 'number' ? n : 0);
  if (!rule) { problems.push(`${ref}: no date rule`); continue; }
  const year = Number(String(section.month).slice(0, 4));
  if (!year) { problems.push(`${ref}: no month`); continue; }
  const date = { basis: 'section', start: year, end: year, month: section.month, label: section.dateLabel, sourceIds: rule.sourceIds };
  const keys = placeIds.map(pid => { const p = dcPlaces.get(pid); return addPlace(`dc:${pid}`, { name: p.name, lat: p.lat, lng: p.lng }, ref); });
  tagPeople(isDeclaration ? section.id : `dc-${n}`, (section.personIds ?? []).filter(pid => dcPeople.has(pid)).map(pid => [`dc:${pid}`, dcPeople.get(pid)]));
  const verseNumber = section.studyVerse;
  const verseText = typeof n === 'number' && verseNumber ? dcVerses.get(n)?.find(v => v.verse === verseNumber)?.text : undefined;
  const routes = (dcRoutesFile.routes ?? []).filter(r => typeof n === 'number' && (r.sections ?? []).includes(n)).map(r => {
    const stops = r.points.map(pid => dcPlaces.get(pid)).filter(Boolean);
    if (stops.length < 2) return null;
    const sections = r.sections ?? [];
    return routeRecord(r.id, r, stops.map(p => [p.lat, p.lng]), {
      ref: sections.length ? `D&C ${sections.length > 2 && sections.at(-1) - sections[0] === sections.length - 1 ? `${sections[0]}–${sections.at(-1)}` : sections.join(', ')}` : undefined,
      text: r.summary, note: r.evidence, stops: stops.map(p => p.name),
    });
  }).filter(Boolean);
  pushEvent(
    { id: isDeclaration ? section.id : `dc-${n}`, volume: 'dc', book: 'dc', chapter: n, ref, title: section.title, map: 'globe', place: keys[0], places: keys },
    {
      summary: section.summary ?? '',
      setting: section.setting,
      verse: verseText ? { ref: `${ref}:${verseNumber}`, text: verseText, translation: 'Doctrine and Covenants' } : undefined,
      readerUrl: isDeclaration ? section.sources?.officialUrl ?? section.url : `../doctrine-and-covenants/doctrine-and-covenants.html#chapter=${n}&verse=${verseNumber ?? 1}`,
      ...(routes.length && { routes }),
    },
    date,
  );
}

// ---------- Curated events and notes ----------

const curated = await readJSON(join(here, 'curated-events.json'));
for (const item of curated.events) {
  const place = dcPlaces.get(item.placeId);
  if (!place) { problems.push(`${item.id}: place ${item.placeId} not found`); continue; }
  const key = addPlace(`dc:${item.placeId}`, { name: place.name, lat: place.lat, lng: place.lng }, item.id);
  const verseText = dcVerses.get(item.verse.section)?.find(v => v.verse === item.verse.verse)?.text;
  if (!verseText) problems.push(`${item.id}: verse D&C ${item.verse.section}:${item.verse.verse} not found`);
  pushEvent(
    { id: item.id, volume: item.volume, book: 'dc', chapter: null, ref: item.ref, title: item.title, map: 'globe', place: key, places: [key], curated: true },
    { summary: item.summary, citations: item.citations, verse: { ref: `D&C ${item.verse.section}:${item.verse.verse}`, text: verseText, translation: 'Doctrine and Covenants' }, readerUrl: item.readerUrl },
    { basis: 'not-given', band: item.band, start: null, end: null, label: 'Years not given', sourceIds: item.sourceIds, note: overrides.notes.orderOnly },
  );
}
for (const [id, { related, ...note }] of Object.entries(curated.annotations)) {
  const event = events.find(e => e.id === id);
  if (!event) { problems.push(`annotation for ${id}: no such event`); continue; }
  Object.assign(details[event.volume][id], note);
}

// ---------- World history (DESIGN.md section 4) ----------
// Hand-written batches in scripts/history/batch-N.json. Each event quotes its source.
// npm run verify:sources checks every quote against the live article.

export const REGIONS = ['Africa', 'Americas', 'Central Asia', 'East Asia', 'Europe', 'Middle East', 'Oceania', 'South Asia', 'Southeast Asia'];
const historySources = {};
const historyDir = join(here, 'history');
for (const file of (await readdir(historyDir)).filter(f => /^batch-\d+\.json$/.test(f)).sort()) {
  const batch = await readJSON(join(historyDir, file));
  // A Church history batch (batch.volume "dc") shares the D&C volume, hue, and shape (DESIGN.md Q30, Q36).
  // Its events need no region or tier. They follow the same sourcing rules as world history.
  const church = batch.volume === 'dc';
  for (const item of batch.events) {
    const where = `${church ? 'church history' : 'history'} ${item.id}`;
    if (!church && !REGIONS.includes(item.region)) problems.push(`${where}: unknown region ${item.region}`);
    if (!church && ![1, 2].includes(item.tier)) problems.push(`${where}: tier must be 1 or 2`);
    if (!item.source?.wiki && !item.source?.url) { problems.push(`${where}: no source`); continue; }
    const prefix = church ? 'ch' : 'h';
    const sourceId = `${prefix}-${item.id}`;
    historySources[sourceId] = item.source.wiki
      ? { title: `${item.source.wiki} (Wikipedia)`, author: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.source.wiki.replace(/ /g, '_'))}`, quote: [item.source.quote].flat() }
      : { title: item.source.title, author: item.source.publisher, url: item.source.url, quote: [item.source.quote].flat() };
    const key = addPlace(`${prefix}:${item.id}`, { name: item.place, lat: item.lat, lng: item.lng }, where);
    if (church) {
      pushEvent(
        { id: sourceId, volume: 'dc', book: 'church-history', chapter: null, ref: item.dateLabel, title: item.title, map: 'globe', place: key, places: [key], curated: true },
        { summary: item.summary, batch: batch.batch },
        { basis: 'church-history', start: item.start, end: item.end, label: item.dateLabel, sourceIds: [sourceId] },
      );
      continue;
    }
    pushEvent(
      { id: `h-${item.id}`, volume: 'history', book: `batch-${batch.batch}`, chapter: null, ref: item.dateLabel, title: item.title, map: 'globe', place: key, places: [key], tier: item.tier, region: item.region },
      { summary: item.summary, region: item.region, batch: batch.batch },
      { basis: 'history', start: item.start, end: item.end, label: item.dateLabel, sourceIds: [sourceId] },
    );
  }
}
// Hand-picked related history for scripture events (DESIGN.md section 6).
// Ids are written as in the batch files; the details file stores full event ids.
for (const [id, { related, relatedNote }] of Object.entries(curated.annotations)) {
  if (related == null) continue;
  const event = events.find(e => e.id === id);
  if (!event) continue; // reported above
  const where = `related history for ${id}`;
  if (event.volume === 'history') { problems.push(`${where}: only scripture events take related links`); continue; }
  if (!Array.isArray(related) || !related.length) { problems.push(`${where}: related must be a list of ids`); continue; }
  if (!relatedNote) problems.push(`${where}: no relatedNote`);
  const ids = related.map(r => `h-${r}`);
  for (const [i, full] of ids.entries()) {
    if (!events.some(e => e.id === full && e.volume === 'history')) problems.push(`${where}: no history event ${related[i]}${related[i].startsWith('h-') ? ' (write ids without the h- prefix)' : ''}`);
  }
  if (new Set(ids).size !== ids.length) problems.push(`${where}: an id is listed twice`);
  details[event.volume][id].related = ids;
}

// ---------- Scripture events (DESIGN.md section 3, "Events, not chapters") ----------
// Hand-written batches in scripts/scripture/batch-N.json. An event such as the scattering of
// the ten tribes is the pin. Its card links the chapters that tell it. A chapter inside a
// batch's `covers` range, or linked by an event, keeps its card and search entry but loses its pin.

// A reference such as "2 Kings 17:6", "1 Nephi 22:4", or "D&C 110:11" -> reader link and chapter event id.
const bomBookIds = new Map([...bomBookNames].map(([id, name]) => [name, id]));
function readRef(ref) {
  let m = ref.match(/^D&C (\d+)(?::(\d+))?/);
  if (m) return { url: `../doctrine-and-covenants/doctrine-and-covenants.html#chapter=${m[1]}&verse=${m[2] ?? 1}`, eventId: `dc-${m[1]}` };
  m = ref.match(/^(.+?) (\d+)(?::(\d+))?/);
  if (!m) return null;
  const [, name, chapter, verse] = m;
  if (bibleBookIds.has(name)) {
    const id = bibleBookIds.get(name);
    return { url: `../bible/${id}.html#chapter=${chapter}&verse=${verse ?? 1}`, eventId: `${id}-${chapter}` };
  }
  if (bomBookIds.has(name)) {
    const id = bomBookIds.get(name);
    return { url: `../book-of-mormon/book.html#chapter=${id}-${chapter}`, eventId: `${id}-${chapter}` };
  }
  return null;
}
// "2 Kings 18–19; 2 Chronicles 13, 16" from a list of chapter events.
function chapterRefs(list) {
  const books = [];
  for (const e of list) {
    // An Official Declaration has no chapter number, so it stands as its own reference.
    if (typeof e.chapter !== 'number') { books.push({ name: e.ref, runs: [] }); continue; }
    const name = e.ref.replace(/ \d+$/, '');
    let book = books.find(b => b.name === name && b.runs.length);
    if (!book) books.push(book = { name, runs: [] });
    const last = book.runs[book.runs.length - 1];
    if (last && e.chapter === last.to + 1) last.to = e.chapter;
    else book.runs.push({ from: e.chapter, to: e.chapter });
  }
  return books.map(b => (b.runs.length ? `${b.name} ${b.runs.map(r => `${r.from}${r.to > r.from ? `–${r.to}` : ''}`).join(', ')}` : b.name)).join('; ');
}

const VOLUMES_SCRIPTURE = ['ot', 'nt', 'bom', 'dc'];
const scriptureDir = join(here, 'scripture');
const scriptureEvents = [];
const partOf = new Map(); // chapter id -> event ids
const coveredIds = new Set();
for (const file of (await readdir(scriptureDir)).filter(f => /^batch-\d+\.json$/.test(f)).sort()) {
  const batch = await readJSON(join(scriptureDir, file));
  for (const { book, chapters: [from, to] } of batch.covers) {
    for (const e of events) if (e.book === book && e.chapter >= from && e.chapter <= to) coveredIds.add(e.id);
  }
  for (const item of batch.events) {
    const where = `scripture event ${item.id}`;
    if (events.some(e => e.id === item.id)) { problems.push(`${where}: the id is already used`); continue; }
    const linked = item.chapters.map(id => events.find(e => e.id === id && !e.curated));
    item.chapters.forEach((id, i) => { if (!linked[i]) problems.push(`${where}: no chapter event ${id}`); });
    if (!linked.every(Boolean) || !linked.length) continue;
    if (!VOLUMES_SCRIPTURE.includes(item.volume)) problems.push(`${where}: unknown volume ${item.volume}`);
    // Dates come from the chapters in `dateFrom` (default: all of them), unless the event sets its own.
    const dating = (item.dateFrom ?? item.chapters).map(id => linked[item.chapters.indexOf(id)]);
    if (!dating.every(Boolean)) { problems.push(`${where}: dateFrom must list some of its chapters`); continue; }
    const chapterDetail = e => details[e.volume][e.id];
    let date;
    if (item.start != null) {
      if (!item.sourceIds?.length || !item.dateLabel) problems.push(`${where}: a written date needs a dateLabel and sourceIds`);
      date = { basis: item.basis ?? 'church', start: item.start, end: item.end ?? item.start, label: item.dateLabel, sourceIds: item.sourceIds ?? [] };
    } else if (dating[0].start == null) {
      // Order-only chapters (Q25, Q29): the event joins the same band and has no years.
      if (dating.some(e => e.start != null || e.band !== dating[0].band)) problems.push(`${where}: dateFrom mixes dated and order-only chapters`);
      const lead = chapterDetail(dating[0]);
      date = { basis: 'not-given', band: dating[0].band, start: null, end: null, label: lead.dateLabel, sourceIds: lead.dateSourceIds ?? [], ...(lead.dateNote && { note: lead.dateNote }) };
    } else {
      const start = Math.min(...dating.map(e => e.start)), end = Math.max(...dating.map(e => e.end));
      const basis = dating[0].basis;
      date = {
        basis, start, end,
        label: (basis === 'scholarly' ? 'c. ' : '') + formatRange(start, end),
        sourceIds: [...new Set(dating.flatMap(e => chapterDetail(e).dateSourceIds ?? []))],
        dateNote: `Years from ${chapterRefs(dating)}.`,
      };
    }
    // The pin sits at the event's place, or the lead chapter's. Other places come from all the chapters.
    // One event lives on one map: the globe, or the Book of Mormon panel.
    if (linked.some(e => e.map !== linked[0].map)) problems.push(`${where}: its chapters are on different maps`);
    const placeKey = item.place ?? linked[0].place;
    if (!places[placeKey]) problems.push(`${where}: place ${placeKey} not found`);
    const placeKeys = [...new Set([placeKey, ...(item.places ?? linked.flatMap(e => e.places))])];
    // The verse is given as "<chapter id>:<verse>" and must come from one of its chapters.
    let verse;
    if (item.verse) {
      const [chapterId, number] = item.verse.split(':');
      const chapter = linked.find(e => e.id === chapterId);
      const find = list => (Array.isArray(list) ? list.find(v => v.verse === Number(number))?.text : undefined);
      let text, translation;
      if (!chapter) text = undefined;
      else if (['ot', 'nt'].includes(chapter.volume)) [text, translation] = [find(bibleText.get(chapter.book)?.chapters[String(chapter.chapter)]), bibleText.get(chapter.book).translation];
      else if (chapter.volume === 'bom') [text, translation] = [find(verseLookup.get(chapter.id)), bomText.edition ?? bomText.translation];
      else if (typeof chapter.chapter === 'number') [text, translation] = [find(dcVerses.get(chapter.chapter)), 'Doctrine and Covenants'];
      if (typeof text !== 'string') problems.push(`${where}: verse ${item.verse} not found in its chapters`);
      else verse = { ref: `${chapter.ref}:${number}`, text, translation, book: chapter.book, ...(chapter.volume === 'bom' && { chapterId: chapter.id }) };
    }
    const alsoRead = (item.alsoRead ?? []).map(({ ref, note }) => {
      const found = readRef(ref);
      if (!found) { problems.push(`${where}: reference not understood: ${ref}`); return null; }
      return { ref, note, url: found.url, ...(events.some(e => e.id === found.eventId) && { eventId: found.eventId }) };
    }).filter(Boolean);
    const routes = [...new Map(linked.flatMap(e => chapterDetail(e).routes ?? []).map(r => [r.id, r])).values()];
    const record = {
      id: item.id, volume: item.volume, book: verse?.book ?? linked[0].book, chapter: null, ref: chapterRefs(linked), title: item.title,
      map: linked[0].map, place: placeKey, places: placeKeys, curated: true, kind: 'event', chapters: item.chapters,
    };
    const { book: _, ...verseRecord } = verse ?? {};
    pushEvent(record, { summary: item.summary, batch: batch.batch, ...(item.placeNote && { placeNote: item.placeNote }), ...(verse && { verse: verseRecord }), ...(alsoRead.length && { alsoRead }), ...(routes.length && { routes }) }, date);
    // Hand-picked related history, as for annotations above.
    if (item.related) {
      if (!item.relatedNote) problems.push(`${where}: no relatedNote`);
      const ids = item.related.map(r => `h-${r}`);
      ids.forEach((full, i) => { if (!events.some(e => e.id === full && e.volume === 'history')) problems.push(`${where}: no history event ${item.related[i]}`); });
      Object.assign(details[item.volume][item.id], { related: ids, relatedNote: item.relatedNote });
    }
    scriptureEvents.push(record);
    const names = [...new Set(linked.flatMap(e => eventPeople[e.id] ?? []))];
    if (names.length) eventPeople[item.id] = names;
    for (const e of linked) { coveredIds.add(e.id); partOf.set(e.id, [...(partOf.get(e.id) ?? []), item.id]); }
  }
}
for (const e of events) {
  if (!coveredIds.has(e.id)) continue;
  e.covered = true;
  if (partOf.has(e.id)) e.partOf = partOf.get(e.id);
}
// A pinned event's paths are drawn whenever it is active, so they go in the index, not the details.
let pathCount = 0;
for (const e of events) {
  if (e.covered || e.broad || e.volume === 'history') continue;
  const routes = details[e.volume][e.id]?.routes ?? [];
  const digits = e.map === 'bom' ? 10 : 1000;
  if (routes.length) e.paths = routes.map(r => ({ id: r.id, kind: r.kind, ...(r.context && { context: true }), ...(r.direction === false && { direction: false }), points: r.points.map(p => p.map(v => Math.round(v * digits) / digits)) }));
  pathCount += routes.length;
}
stats.paths = pathCount;
stats.scriptureEvents = scriptureEvents.length;
stats.chaptersCovered = coveredIds.size;
stats.chaptersInNoEvent = [...coveredIds].filter(id => !partOf.has(id));

// A count per region, so coverage stays global. A warning, not a quota.
const regionCounts = Object.fromEntries(REGIONS.map(r => [r, events.filter(e => e.region === r).length]));
stats.historyRegions = regionCounts;

// ---------- Bands ----------

const dated = events.filter(e => e.start != null);
const firstScripture = Math.min(...dated.filter(e => e.volume === 'ot').map(e => e.start));
const omni = events.find(e => e.id === 'omni-1');
const bands = {
  primeval: { label: 'Years not given', start: -4000, end: firstScripture - 1, note: overrides.notes.orderOnly },
  // The Jaredite record runs from the Tower of Babel, inside the primeval band, until Coriantumr is found.
  jaredite: { label: 'Jaredite record, years not given', start: -4000, endsWith: 'omni-1', end: omni?.end ?? null, note: 'The band runs from the Tower of Babel until Coriantumr is found, in Omni 1:21.' },
};

// ---------- Write ----------

const volumeOrder = { ot: 0, nt: 1, bom: 2, dc: 3, history: 4 };
events.sort((a, b) => (a.start ?? -1e9) - (b.start ?? -1e9) || volumeOrder[a.volume] - volumeOrder[b.volume] || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));

const usedSources = new Set(Object.values(details).flatMap(v => Object.values(v).flatMap(d => d.dateSourceIds ?? [])));
const index = {
  generated: new Date().toISOString().slice(0, 10),
  inputs: Object.fromEntries(Object.entries(config.repos).map(([key, r]) => [key, `${r.repo}@${r.commit}`])),
  bands,
  sources: { ...Object.fromEntries(Object.entries(overrides.sources).filter(([id]) => usedSources.has(id))), ...historySources },
  places,
  events,
};

if (problems.length) {
  console.error(`Build stopped. ${problems.length} problem(s):\n  ` + problems.join('\n  '));
  process.exit(1);
}
await mkdir(join(out, 'details'), { recursive: true });
await writeFile(join(out, 'events.json'), JSON.stringify(index));
// The Wayfinder readers fetch this list to show "See on timeline" only on chapters that have an event (DESIGN.md section 8).
const chapterIds = events.filter(e => !e.curated && e.volume !== 'history').map(e => e.id);
await writeFile(join(out, 'chapters.json'), JSON.stringify({ note: 'Event ids that come from one chapter. Bible and Book of Mormon ids are book-chapter. D&C ids are dc-N, od1, and od2.', events: chapterIds }));
// Loaded when the search box is first used.
for (const id of Object.keys(eventPeople)) if (!events.some(e => e.id === id)) delete eventPeople[id];
await writeFile(join(out, 'search.json'), JSON.stringify({ people, eventPeople }));
for (const [volume, records] of Object.entries(details)) await writeFile(join(out, 'details', `${volume}.json`), JSON.stringify(records));
// ---------- Book of Mormon panel map ----------
// Relief tiles and map shapes from Book of Mormon Wayfinder. One map unit is one of Sorenson's miles.
const relief = await readJSON(join(src, 'book-of-mormon', 'relief.json'));
await cp(join(src, 'book-of-mormon', 'relief'), join(here, '..', 'dist', 'assets', 'bom-relief'), { recursive: true });
for (const file of ['leaflet.js', 'leaflet.css', 'leaflet-LICENSE.txt']) await cp(join(src, 'book-of-mormon', 'vendor', file), join(here, '..', 'dist', 'vendor', file));
const round = points => points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
await writeFile(join(out, 'bom-map.json'), JSON.stringify({
  bounds: relief.bounds,
  tiles: { ...relief.tiles, url: 'assets/bom-relief/{z}/{x}_{y}.jpg' },
  note: relief.note,
  credit: 'Relative map after J. L. Sorenson, Mormon’s Map (2000), drawn by Book of Mormon Wayfinder. Not a real-world location.',
  land: round(bom.geography.land),
  sidon: round(bom.geography.sidon),
  waters: bom.geography.waters.map(w => ({ name: w.name, points: round(w.points) })),
  labels: bom.geography.labels,
  rivers: (relief.rivers ?? []).map(r => ({ size: r.size, points: round(r.points) })),
}));

await writeFile(join(here, 'build-report.json'), JSON.stringify({ stats, warnings }, null, 1) + '\n');

const count = volume => events.filter(e => e.volume === volume).length;
console.log(`${stats.chapters} chapters read. ${stats.events} events written. ${stats.noPlace} chapters have no places. ${stats.skipped.length} skipped by rule.`);
console.log(`Old Testament ${count('ot')} · New Testament ${count('nt')} · Book of Mormon ${count('bom')} · D&C ${count('dc')} · World history ${count('history')}`);
console.log('World history by region: ' + Object.entries(regionCounts).map(([r, n]) => `${r} ${n}`).join(', '));
console.log(`${stats.scriptureEvents} scripture events cover ${stats.chaptersCovered} chapters. ${stats.chaptersInNoEvent.length} covered chapter(s) are in no event: ${stats.chaptersInNoEvent.join(', ') || 'none'}.`);
console.log(`${Object.keys(places).length} places. ${warnings.length} warning(s) in scripts/build-report.json.`);
