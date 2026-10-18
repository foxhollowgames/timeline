// Fetch the pinned inputs into scripts/source/ (git-ignored).
// Run `npm run import` once, and again after you move a pin in scripts/sources.json.
// `npm run import -- --refresh` downloads every file again.
// Nothing here changes the app. `npm run build` turns these files into dist/data.

import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, 'source');
const config = JSON.parse(await readFile(join(here, 'sources.json'), 'utf8'));
const refresh = process.argv.includes('--refresh');

const exists = path => access(path).then(() => true, () => false);
const raw = (key, path) => `https://raw.githubusercontent.com/${config.repos[key].repo}/${config.repos[key].commit}/${path}`;

async function fetchTo(url, target, attempts = 3) {
  if (!refresh && await exists(target)) return 'cached';
  for (let i = 1; ; i++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'wayfinder-timeline-import' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
      return 'fetched';
    } catch (error) {
      if (i >= attempts) throw new Error(`${url}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 800 * i));
    }
  }
}

// Run a list of downloads a few at a time.
async function all(jobs, width = 8) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < jobs.length) { const job = jobs[next++]; results.push(await job()); }
  }));
  return results;
}

const jobs = [];
const add = (url, path) => jobs.push(() => fetchTo(url, join(cache, path)));

for (const id of config.bibleBooks) {
  add(raw('bible', `dist/data/books/${id}-native-content.json`), `bible/${id}-native-content.json`);
  add(raw('bible', `dist/data/books/${id}-native-scripture.json`), `bible/${id}-native-scripture.json`);
  add(raw('bible', `dist/data/books/${id}-people.json`), `bible/${id}-people.json`);
}

add(raw('book-of-mormon', 'dist/data/content.json'), 'book-of-mormon/content.json');
add(raw('book-of-mormon', 'dist/data/scripture.json'), 'book-of-mormon/scripture.json');
add(raw('book-of-mormon', 'scripts/old-world.mjs'), 'book-of-mormon/old-world.mjs');

const dc = 'doctrine-and-covenants';
for (const file of ['places-base.json', 'places-extra.json', 'routes.json', 'people-ids.json', 'raw/doctrine-and-covenants.json']) {
  add(raw(dc, `content/${file}`), `${dc}/${file.replace('raw/', '')}`);
}
for (let n = 1; n <= 138; n++) {
  const name = String(n).padStart(3, '0');
  add(raw(dc, `content/sections/${name}.json`), `${dc}/sections/${name}.json`);
}
for (const name of ['od1', 'od2']) add(raw(dc, `content/sections/${name}.json`), `${dc}/sections/${name}.json`);

add(raw('natural-earth', 'geojson/ne_50m_land.geojson'), 'natural-earth/ne_50m_land.geojson');
add(raw('natural-earth', 'geojson/ne_10m_minor_islands.geojson'), 'natural-earth/ne_10m_minor_islands.geojson');

for (const [key, url] of Object.entries(config.pages)) add(url, `church-chronology/${key}.html`);

const results = await all(jobs);
const fetched = results.filter(r => r === 'fetched').length;
console.log(`${jobs.length} files ready in scripts/source (${fetched} downloaded, ${jobs.length - fetched} cached).`);

// Turn the Church chronology tables into rows of plain text for the build and the checks.
const decode = html => html
  .replace(/<br\s*\/?>/gi, ' / ').replace(/<\/p>\s*<p[^>]*>/gi, ' / ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const chronology = {};
for (const key of Object.keys(config.pages)) {
  const html = await readFile(join(cache, `church-chronology/${key}.html`), 'utf8');
  chronology[key] = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map(table =>
    [...table[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map(row =>
      [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(cell => decode(cell[1]))));
  if (!chronology[key].length) throw new Error(`No tables found in ${config.pages[key]}. The page layout may have changed.`);
}
await writeFile(join(cache, 'church-chronology/tables.json'), JSON.stringify(chronology));
console.log('Church chronology tables parsed.');
