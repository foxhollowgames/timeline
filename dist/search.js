// Search box: events (reference or title), places, and people (DESIGN.md Q31).
// A combobox with a listbox of results. The arrow keys move, Enter chooses, Escape closes.

import { shapeSVG } from './volumes.js';
import { eventDate } from './card.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'");

// Lower is better: whole-text start, then a word start, then anywhere.
function score(haystack, query) {
  const i = haystack.indexOf(query);
  if (i < 0) return null;
  if (i === 0) return 0;
  return /[\s(·,-]/.test(haystack[i - 1]) ? 1 : 2;
}

export function createSearch({ input, list, data, loadPeople, onEvent, onPlace, onPerson }) {
  let options = [], active = -1, peopleIndex = null;
  const placeGroups = new Map(); // place name -> {name, keys:Set}
  for (const [key, place] of Object.entries(data.places)) {
    const id = fold(place.name);
    if (!placeGroups.has(id)) placeGroups.set(id, { name: place.name, keys: new Set() });
    placeGroups.get(id).keys.add(key);
  }
  // A chapter that an event tells is listed through that event, not on its own.
  const listed = e => !e.partOf;
  const eventsAtPlace = keys => data.events.filter(e => listed(e) && e.places.some(k => keys.has(k)));
  const searchable = data.events.map(e => ({ event: e, text: fold(`${e.ref} · ${e.title}`) }));

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  list.setAttribute('role', 'listbox');

  async function ensurePeople() {
    if (peopleIndex) return peopleIndex;
    const raw = await loadPeople();
    const byPerson = new Map();
    for (const [eventId, keys] of Object.entries(raw.eventPeople)) for (const key of keys) {
      if (!byPerson.has(key)) byPerson.set(key, []);
      byPerson.get(key).push(eventId);
    }
    peopleIndex = [...byPerson].map(([key, ids]) => ({ key, name: raw.people[key], text: fold(raw.people[key]), ids }));
    return peopleIndex;
  }

  function hide() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
  function highlight(index) {
    active = index;
    list.querySelectorAll('[role="option"]').forEach((el, i) => el.setAttribute('aria-selected', String(i === index)));
    const el = list.querySelector(`[data-index="${index}"]`);
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
  }

  async function run() {
    const query = fold(input.value.trim());
    if (query.length < 2) { hide(); return; }
    const people = await ensurePeople();
    if (fold(input.value.trim()) !== query) return;
    const rank = (rows, key, limit) => rows.map(row => ({ row, s: score(row[key], query) })).filter(r => r.s != null)
      .sort((a, b) => a.s - b.s || a.row[key].length - b.row[key].length).slice(0, limit).map(r => r.row);
    const events = rank(searchable, 'text', 6).map(r => ({ kind: 'event', event: r.event }));
    const places = rank([...placeGroups.values()].map(p => ({ ...p, text: fold(p.name) })), 'text', 4)
      .map(p => ({ kind: 'place', name: p.name, events: eventsAtPlace(p.keys) })).filter(p => p.events.length);
    const persons = rank(people, 'text', 4).map(p => ({ kind: 'person', name: p.name, events: p.ids.map(id => data.events.find(e => e.id === id)).filter(e => e && listed(e)) })).filter(p => p.events.length);
    options = [...events, ...places, ...persons];
    if (!options.length) {
      list.innerHTML = '<p class="search-empty">No events, places, or people match.</p>';
      list.hidden = false; input.setAttribute('aria-expanded', 'true'); active = -1;
      return;
    }
    const heading = { event: 'Events', place: 'Places', person: 'People' };
    let last = null;
    list.innerHTML = options.map((o, i) => {
      const head = o.kind !== last ? `<p class="search-group" role="presentation">${heading[o.kind]}</p>` : '';
      last = o.kind;
      const body = o.kind === 'event'
        ? o.event.kind === 'event'
          ? `${shapeSVG(o.event.volume, 14)}<span><strong>${escapeHTML(o.event.title)}</strong><small>${escapeHTML(o.event.ref)} · ${escapeHTML(eventDate(o.event))}</small></span>`
          : `${shapeSVG(o.event.volume, 14)}<span><strong>${escapeHTML(o.event.ref)}</strong><small>${escapeHTML(o.event.title)} · ${escapeHTML(eventDate(o.event))}</small></span>`
        : `<span class="search-kind" aria-hidden="true">${o.kind === 'place' ? '◎' : '◉'}</span><span><strong>${escapeHTML(o.name)}</strong><small>${o.events.length} ${o.events.length === 1 ? 'event' : 'events'}</small></span>`;
      return `${head}<div class="search-option" role="option" id="search-option-${i}" data-index="${i}" aria-selected="false">${body}</div>`;
    }).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    for (const el of list.querySelectorAll('[role="option"]')) {
      el.addEventListener('pointerdown', e => e.preventDefault());
      el.addEventListener('click', () => choose(Number(el.dataset.index)));
    }
    highlight(0);
  }

  function choose(index) {
    const option = options[index];
    if (!option) return;
    hide();
    input.value = '';
    input.blur();
    if (option.kind === 'event') onEvent(option.event);
    else if (option.kind === 'place') onPlace(option.name, option.events);
    else onPerson(option.name, option.events);
  }

  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  input.addEventListener('focus', () => { ensurePeople(); if (input.value.trim().length >= 2) run(); });
  input.addEventListener('blur', () => setTimeout(hide, 120));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && options.length && !list.hidden) { event.preventDefault(); highlight((active + 1) % options.length); }
    else if (event.key === 'ArrowUp' && options.length && !list.hidden) { event.preventDefault(); highlight((active - 1 + options.length) % options.length); }
    else if (event.key === 'Enter' && active >= 0 && !list.hidden) { event.preventDefault(); choose(active); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!list.hidden) hide(); else { input.value = ''; input.blur(); } }
  });
}
