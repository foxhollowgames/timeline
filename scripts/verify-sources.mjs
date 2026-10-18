// Check every world-history quote against its live source (DESIGN.md Q13).
// Run `npm run verify:sources`. It needs the network and takes about two seconds per article.
// Wikipedia sources are read through the MediaWiki API as plain text. A quote passes when it
// appears in the article after spaces, dashes, and quote marks are made uniform.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'history');
const normalize = text => String(text).normalize('NFC')
  .replace(/[‐-―−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();

const files = (await readdir(dir)).filter(f => /^batch-\d+\.json$/.test(f)).sort();
const byArticle = new Map();
for (const file of files) {
  const batch = JSON.parse(await readFile(join(dir, file), 'utf8'));
  for (const event of batch.events) {
    const quotes = [event.source.quote].flat();
    if (!event.source.wiki) { console.log(`skip ${event.id}: not a Wikipedia source. Check it by hand.`); continue; }
    if (!byArticle.has(event.source.wiki)) byArticle.set(event.source.wiki, []);
    byArticle.get(event.source.wiki).push({ id: event.id, quotes });
  }
}

const results = [];
let failures = 0;
for (const [title, uses] of byArticle) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|revisions&rvprop=ids|timestamp&explaintext=1&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  let page;
  for (let attempt = 1; attempt <= 3 && !page; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'wayfinder-timeline-source-check/1.0 (https://github.com/foxhollowgames/timeline)' } });
      if (response.ok) page = (await response.json()).query.pages[0];
      else await new Promise(r => setTimeout(r, 4000 * attempt));
    } catch { await new Promise(r => setTimeout(r, 4000 * attempt)); }
  }
  const text = normalize(page?.extract ?? '');
  for (const use of uses) {
    const missing = use.quotes.filter(q => !text.includes(normalize(q)));
    const ok = text && !missing.length;
    if (!ok) failures++;
    results.push({ id: use.id, article: title, revision: page?.revisions?.[0]?.revid ?? null, checked: page?.revisions?.[0]?.timestamp ?? null, ok, missing });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${use.id} · ${title}${ok ? '' : ` · missing: ${missing.map(q => `"${q}"`).join(', ') || 'article not found'}`}`);
  }
  await new Promise(r => setTimeout(r, 1500));
}

// Record which article revision each quote was checked against.
await writeFile(join(dir, 'verified.json'), JSON.stringify({ checked: new Date().toISOString().slice(0, 10), results }, null, 1) + '\n');
console.log(failures ? `\n${failures} quote check(s) failed.` : `\nAll ${results.length} sources contain their quotes.`);
process.exit(failures ? 1 : 0);
