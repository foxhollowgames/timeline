// Fetch one picture for each world and Church history event. Run `npm run images`.
// It needs the network. The picture is the lead image of the event's Wikipedia article,
// or the Wikidata image when the article has no free lead image. Only freely licensed files
// are used. Each is saved in dist/assets/history/, and its artist, license, and Commons page
// go in scripts/history/images.json for the card's credit line. On Windows each picture is
// re-saved as a JPEG of at most 440 by 330 pixels (scripts/shrink-image.ps1); elsewhere the
// 500px Commons thumbnail is kept as it is.
//
// An event may set "image" in its batch file:
//   "image": "File:Some picture.jpg"   use this Commons file
//   "image": false                     no picture
// Pictures already saved are kept. Pass --refresh to fetch every picture again.

import { readFile, readdir, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const historyDir = join(here, 'history');
const outDir = join(here, '..', 'dist', 'assets', 'history');
const recordFile = join(historyDir, 'images.json');
const WIDTH = 500;
const shrink = process.platform === 'win32';
const refresh = process.argv.includes('--refresh');
const headers = { 'User-Agent': 'wayfinder-timeline-images/1.0 (https://github.com/foxhollowgames/timeline)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return await response.json();
    } catch {}
    await sleep(3000 * attempt);
  }
  throw new Error(`Could not read ${url}`);
}
const api = (host, params) => getJSON(`https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params }));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
// Commons metadata is HTML. Keep the text only.
const plain = html => String(html ?? '').replace(/<span[^>]*display:\s*none[^>]*>.*?<\/span>/gs, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// Every history event, with the article to look in.
const events = [];
for (const file of (await readdir(historyDir)).filter(f => /^batch-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))) {
  const batch = JSON.parse(await readFile(join(historyDir, file), 'utf8'));
  for (const e of batch.events) events.push({ id: e.id, wiki: e.source.wiki, image: e.image });
}
const record = await readFile(recordFile, 'utf8').then(JSON.parse).catch(() => ({ images: {} }));
const images = refresh ? {} : record.images;

// 1. Choose a Commons file for each event that needs one.
const chosen = new Map();
for (const e of events) if (typeof e.image === 'string') chosen.set(e.id, e.image.replace(/^File:/, ''));
const todo = events.filter(e => e.image !== false && !chosen.has(e.id) && !images[e.id] && e.wiki);
const leadImage = new Map(), wikidata = new Map();
for (const group of chunks([...new Set(todo.map(e => e.wiki))], 50)) {
  const data = await api('en.wikipedia.org', { action: 'query', prop: 'pageimages|pageprops', piprop: 'name', pilicense: 'free', ppprop: 'wikibase_item', redirects: '1', titles: group.join('|') });
  const alias = new Map();
  for (const r of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) alias.set(r.to, r.from);
  for (const page of data.query.pages ?? []) {
    // Walk back through redirects and normalization to the title the batch file used.
    let title = page.title;
    const names = [title];
    while (alias.has(title)) { title = alias.get(title); names.push(title); }
    for (const name of names) {
      if (page.pageimage) leadImage.set(name, page.pageimage);
      if (page.pageprops?.wikibase_item) wikidata.set(name, page.pageprops.wikibase_item);
    }
  }
  await sleep(500);
}
// Wikidata's image (P18) for articles with no free lead image.
const needWikidata = todo.filter(e => !leadImage.has(e.wiki) && wikidata.has(e.wiki));
for (const group of chunks([...new Set(needWikidata.map(e => wikidata.get(e.wiki)))], 50)) {
  const data = await getJSON('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', ids: group.join('|'), props: 'claims', format: 'json' }));
  for (const [qid, entity] of Object.entries(data.entities ?? {})) {
    const file = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (file) for (const [title, q] of wikidata) if (q === qid && !leadImage.has(title)) leadImage.set(title, file);
  }
  await sleep(500);
}
for (const e of todo) if (leadImage.has(e.wiki)) chosen.set(e.id, leadImage.get(e.wiki));

// Credit the maker. For a photo of an old object, Commons often names the object's
// unknown maker as the artist, so the photographer in Credit is named instead.
function credit(meta, uploader) {
  const artist = plain(meta.Artist?.value), from = plain(meta.Credit?.value);
  const usable = from && !/^(own work|transferred from)/i.test(from);
  if ((!artist || /^unknown/i.test(artist)) && usable) return `Photo: ${from}`;
  // With no maker named at all, name the person who uploaded the file.
  return artist && !/^unknown$/i.test(artist) ? artist : from || (uploader ? `Uploaded by ${uploader}` : 'Unknown');
}

// 2. Read the thumbnail and license of each chosen file, and of each file already saved,
// so credits stay current.
const info = new Map();
for (const group of chunks([...new Set([...chosen.values(), ...Object.values(images).map(p => p.title)])], 50)) {
  const data = await api('commons.wikimedia.org', { action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata|user', iiurlwidth: String(WIDTH), iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|UsageTerms|Credit|ObjectName', titles: group.map(f => `File:${f}`).join('|') });
  const alias = new Map((data.query.normalized ?? []).map(n => [n.to, n.from]));
  for (const page of data.query.pages ?? []) {
    const ii = page.imageinfo?.[0];
    if (!ii) continue;
    const meta = ii.extmetadata ?? {};
    const name = (alias.get(page.title) ?? page.title).replace(/^File:/, '');
    info.set(name, {
      title: page.title.replace(/^File:/, ''),
      thumb: ii.thumburl ?? ii.url, width: ii.thumbwidth ?? ii.width, height: ii.thumbheight ?? ii.height,
      page: ii.descriptionurl,
      artist: credit(meta, ii.user),
      license: plain(meta.LicenseShortName?.value) || plain(meta.UsageTerms?.value) || 'See file page',
      licenseUrl: meta.LicenseUrl?.value ?? null,
    });
  }
  await sleep(500);
}

// 3. Save each picture.
await mkdir(outDir, { recursive: true });
let saved = 0;
for (const [id, file] of chosen) {
  const meta = info.get(file);
  if (!meta) { console.log(`skip ${id}: ${file} not found on Commons`); continue; }
  const ext = shrink ? '.jpg' : (extname(new URL(meta.thumb).pathname).toLowerCase() || '.jpg').replace('.jpeg', '.jpg');
  const name = `${id}${ext}`;
  if (images[id]?.file === name && images[id]?.title === meta.title && await stat(join(outDir, name)).catch(() => null)) continue;
  let body;
  for (let attempt = 1; attempt <= 4 && !body; attempt++) {
    try {
      const response = await fetch(meta.thumb, { headers });
      if (response.ok && /^image\//.test(response.headers.get('content-type') ?? '')) body = Buffer.from(await response.arrayBuffer());
      // Wikimedia answers 429 when pictures are fetched too fast. Wait as long as it asks.
      else await sleep(1000 * (Number(response.headers.get('retry-after')) || 15 * attempt));
    } catch { await sleep(4000 * attempt); }
  }
  if (!body) { console.log(`FAIL ${id}: could not download ${meta.thumb}`); continue; }
  if (images[id]?.file && images[id].file !== name) await unlink(join(outDir, images[id].file)).catch(() => {});
  const { thumb, ...kept } = meta;
  if (shrink) {
    const raw = join(outDir, `${id}.download${extname(new URL(meta.thumb).pathname)}`);
    await writeFile(raw, body);
    try {
      const [w, h] = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'shrink-image.ps1'), '-In', raw, '-Out', join(outDir, name)], { encoding: 'utf8' }).trim().split(' ').map(Number);
      Object.assign(kept, { width: w, height: h });
    } catch { console.log(`FAIL ${id}: could not convert ${meta.title}`); await unlink(raw).catch(() => {}); continue; }
    await unlink(raw);
  } else await writeFile(join(outDir, name), body);
  images[id] = { file: name, ...kept };
  saved++;
  console.log(`saved ${name} · ${meta.title} · ${meta.license}`);
  await sleep(1500);
}
// Refresh the credit of pictures kept from an earlier run.
for (const p of Object.values(images)) {
  const meta = info.get(p.title);
  if (meta) Object.assign(p, { artist: meta.artist, license: meta.license, licenseUrl: meta.licenseUrl, page: meta.page });
}
// Drop records for events that no longer exist or no longer want a picture.
for (const id of Object.keys(images)) {
  const e = events.find(x => x.id === id);
  if (!e || e.image === false) { await unlink(join(outDir, images[id].file)).catch(() => {}); delete images[id]; }
}

const sorted = Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(recordFile, JSON.stringify({ about: 'One picture per history event, from Wikimedia Commons. Written by npm run images.', images: sorted }, null, 1) + '\n');
const missing = events.filter(e => !images[e.id]).map(e => e.id);
console.log(`\n${saved} saved. ${Object.keys(images).length} of ${events.length} events have a picture.`);
if (missing.length) console.log(`No picture: ${missing.join(', ')}`);
