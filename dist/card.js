// The side card: one event, or a list of events (a pin group, a place, or a person).
// Details load per volume the first time a card needs them (dist/data/details/<volume>.json).

import { VOLUMES, shapeSVG, routeStyle } from './volumes.js';
import { formatRange } from './time-scale.js';
import { CONFERENCE_GLOBE } from './config.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BASIS = {
  church: 'Church chronology',
  ministry: 'Church chronology, the prophet’s lifetime',
  scholarly: 'Scholarly estimate',
  edition: 'Book of Mormon chapter heading',
  section: 'D&C section heading',
  'not-given': 'Order only',
  history: 'Date from the cited source',
  'church-history': 'Date from the cited source',
};
// Hand-sourced events (world and Church history) and scripture events lead with their title, not a reference.
const titleFirst = e => e.volume === 'history' || e.basis === 'church-history' || e.kind === 'event';
const ALSO_COUNT = 4;
const ALSO_MIN_NEAREST = 2; // nearest rows still shown when hand-picked links fill the list
const ALSO_MAX_GAP = 150; // years between two events' ranges
const VERSE_WORDS = 40;

export const eventDate = e => (e.start == null ? 'Years not given' : formatRange(e.start, e.end));

// The nearest events of the other kind: history for scripture, scripture for history (DESIGN.md Q8).
// Hand-picked related ids come first, then the nearest fill up to four, never fewer than two.
// Order-only events have no years, so they get no nearest links (Q28).
export function alsoAtThisTime(event, events, related = []) {
  const linked = [...new Set(related)].map(id => events.find(e => e.id === id)).filter(Boolean);
  if (event.start == null) return linked;
  const wantHistory = event.volume !== 'history';
  const gap = e => Math.max(0, e.start - event.end, event.start - e.end);
  const mid = e => (e.start + e.end) / 2, center = mid(event);
  const nearest = events
    .filter(e => e.start != null && !e.broad && !e.covered && (e.volume === 'history') === wantHistory && gap(e) <= ALSO_MAX_GAP && !linked.includes(e))
    // Rank by closeness, then prefer specific events over centuries-long eras.
    .map(e => ({ e, score: gap(e) + Math.abs(mid(e) - center) * 0.5 + (e.end - e.start) * 0.25 }))
    .sort((a, b) => a.score - b.score)
    .map(({ e }) => e)
    .slice(0, Math.max(ALSO_MIN_NEAREST, ALSO_COUNT - linked.length));
  return [...linked, ...nearest];
}

// A history event's picture, with its Commons credit (scripts/fetch-images.mjs).
// A long artist line is cut, since the Commons page carries the full credit.
function picture(image, title) {
  const artist = image.artist.length > 70 ? image.artist.slice(0, 68).trimEnd() + '…' : image.artist;
  return `<figure class="card-figure">
    <img src="${escapeHTML(image.src)}" width="${image.width}" height="${image.height}" alt="${escapeHTML(title)}" loading="lazy" decoding="async">
    <figcaption>${escapeHTML(artist)} · ${escapeHTML(image.license)} · <a href="${escapeHTML(image.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></figcaption>
  </figure>`;
}

// One verse, cut to about 40 words (DESIGN.md Q24). A cut ends with an ellipsis.
function shortVerse(text) {
  const words = text.split(/\s+/);
  return words.length <= VERSE_WORDS ? text : words.slice(0, VERSE_WORDS).join(' ').replace(/[,;:]$/, '') + ' …';
}

export function createCard({ panel, content, labelEl, closeButton, data, onClose, onShow, onPick, onMove }) {
  const detailCache = new Map();
  let searchIndex = null, history = [], current = null;

  const loadDetails = volume => {
    if (!detailCache.has(volume)) detailCache.set(volume, fetch(`data/details/${volume}.json`).then(r => { if (!r.ok) throw new Error('details'); return r.json(); }));
    return detailCache.get(volume);
  };
  const loadPeople = () => (searchIndex ??= fetch('data/search.json').then(r => r.json()).catch(() => ({ people: {}, eventPeople: {} })));

  // One event as a list row. History rows lead with the title, scripture rows with the reference.
  // A hand-picked link adds "Linked" to its date line.
  const row = (e, linked = false) => titleFirst(e)
    ? `<button class="event-row" data-event="${escapeHTML(e.id)}">${shapeSVG(e.volume, 16)}<span><strong>${escapeHTML(e.title)}</strong><small class="row-date">${escapeHTML([e.ref, e.region ?? (e.kind === 'event' ? eventDate(e) : '')].filter(Boolean).join(' · '))}${linked ? ' · <span class="row-linked">Linked</span>' : ''}</small></span></button>`
    : `<button class="event-row" data-event="${escapeHTML(e.id)}">${shapeSVG(e.volume, 16)}<span><strong>${escapeHTML(e.ref)}</strong><small>${escapeHTML(e.title)}</small><small class="row-date">${escapeHTML(eventDate(e))}${linked ? ' · <span class="row-linked">Linked</span>' : ''}</small></span></button>`;

  // Drag the card by its top bar. The offset is a transform, so the layout code's placement stays as is.
  // It keeps a strip of the bar on screen and resets when the card closes.
  let drag = { x: 0, y: 0 };
  const moveCard = (x, y) => {
    panel.style.transform = 'none';
    const box = panel.getBoundingClientRect(), keep = 48;
    drag = {
      x: Math.min(innerWidth - keep - box.left, Math.max(keep - box.right, x)),
      y: Math.min(innerHeight - keep - box.top, Math.max(-box.top, y)),
    };
    panel.style.transform = drag.x || drag.y ? `translate(${drag.x}px, ${drag.y}px)` : '';
  };
  const bar = panel.querySelector('.card-bar');
  bar.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const start = { x: e.clientX - drag.x, y: e.clientY - drag.y };
    bar.setPointerCapture(e.pointerId);
    panel.classList.add('card-dragging');
    const move = ev => moveCard(ev.clientX - start.x, ev.clientY - start.y);
    const end = () => {
      panel.classList.remove('card-dragging');
      onMove?.();
      bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', end); bar.removeEventListener('pointercancel', end);
    };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
  });
  addEventListener('resize', () => { if (!panel.hidden && (drag.x || drag.y)) { moveCard(drag.x, drag.y); onMove?.(); } });

  function open() { panel.hidden = false; }
  function close() {
    panel.hidden = true; history = []; current = null;
    drag = { x: 0, y: 0 }; panel.style.transform = '';
    onClose?.();
  }
  closeButton.addEventListener('click', close);

  function backButton() {
    if (!history.length) return '';
    const previous = history[history.length - 1];
    const name = previous.type === 'event' ? (titleFirst(previous.event) ? previous.event.title : previous.event.ref)
      : previous.type === 'route' ? previous.route.title : previous.title;
    return `<button class="card-back" data-back>Back to ${escapeHTML(name)}</button>`;
  }
  function bind() {
    content.querySelector('[data-back]')?.addEventListener('click', () => {
      const previous = history.pop();
      if (previous?.type === 'event') { onPick?.(previous.event); showEvent(previous.event); }
      else if (previous?.type === 'route') showRoute(previous.event, previous.route.id, { push: false });
      else if (previous) showList(previous.title, previous.events, { note: previous.note, push: false });
    });
    for (const row of content.querySelectorAll('[data-event]')) {
      row.addEventListener('click', () => {
        const event = data.events.find(e => e.id === row.dataset.event);
        if (event) { history.push(current); onPick?.(event); showEvent(event); }
      });
    }
  }

  async function showEvent(event, { resetHistory = false } = {}) {
    if (resetHistory) history = [];
    open();
    labelEl.textContent = VOLUMES[event.volume].label.toUpperCase();
    content.innerHTML = `${backButton()}<p class="card-loading">Loading this event…</p>`;
    bind();
    current = { type: 'event', event };
    onShow?.({ type: 'event', event });
    let d, people;
    try { [d, people] = await Promise.all([loadDetails(event.volume).then(all => all[event.id]), loadPeople()]); }
    catch { content.innerHTML = `${backButton()}<p class="card-loading">This event's details could not load. Reload the page to try again.</p>`; bind(); return; }
    if (current?.event !== event) return;
    current.details = d;
    const place = data.places[event.place];
    const otherPlaces = event.places.filter(k => k !== event.place).map(k => data.places[k]?.name).filter(Boolean);
    const names = (people.eventPeople[event.id] ?? []).map(k => people.people[k]).filter(Boolean);
    const isHistory = event.volume === 'history';
    const conference = CONFERENCE_GLOBE.url && event.volume === 'dc' && event.start >= CONFERENCE_GLOBE.firstYear
      ? `${CONFERENCE_GLOBE.url}#year=${event.start}` : null;
    // A history card lists the scripture events that link to it (built as linkedFrom).
    const related = d.related ?? d.linkedFrom ?? [];
    const also = alsoAtThisTime(event, data.events, related);
    const sources = (d.dateSourceIds ?? []).map(id => data.sources[id]).filter(Boolean);
    const dateLines = [
      d.dateNote, d.dateDetail, d.biblical,
      d.scholarly && `Scholarly estimate: ${d.scholarly.label}.`,
      d.dateFix && `Corrected here. ${d.dateFix}`,
    ].filter(Boolean);
    const notes = [
      d.placeNote,
      event.band === 'jaredite' && data.bands.jaredite?.note,
      event.broad && 'This text spans more than 300 years, so it has no pin on the globe.',
      event.covered && !event.partOf && 'This era is shown as events. This chapter is in none yet, so it has no pin.',
    ].filter(Boolean);
    // An event lists the chapters that tell it. A chapter lists the events it is part of.
    const byId = id => data.events.find(e => e.id === id);
    const chapters = (event.chapters ?? []).map(byId).filter(Boolean);
    const partOf = (event.partOf ?? []).map(byId).filter(Boolean);
    const alsoRead = d.alsoRead ?? [];
    content.innerHTML = `${backButton()}
      <p class="card-volume">${shapeSVG(event.volume, 16)}<span>${escapeHTML(VOLUMES[event.volume].label)}</span></p>
      <h2>${escapeHTML(event.title)}</h2>
      ${titleFirst(event) ? '' : `<p class="card-ref">${escapeHTML(event.ref)}</p>`}
      ${d.image ? picture(d.image, event.title) : ''}
      <div class="card-date">
        <p><strong>${escapeHTML(d.dateLabel)}</strong> <span>${escapeHTML(d.dateKept ? 'Scholarly date, inside the prophet’s lifetime' : BASIS[event.basis] ?? '')}</span></p>
        ${dateLines.map(line => `<p class="card-date-note">${escapeHTML(line)}</p>`).join('')}
      </div>
      ${d.setting ? `<p class="card-setting">${escapeHTML(d.setting)}</p>` : ''}
      <p class="card-summary">${escapeHTML(d.summary)}</p>
      ${d.verse?.text ? `<blockquote class="card-verse"><p>${escapeHTML(shortVerse(d.verse.text))}</p><cite>${escapeHTML(d.verse.ref)}</cite></blockquote>` : ''}
      ${partOf.length ? `<div class="card-part-of"><h3>Part of</h3><p class="card-part-note">This chapter is pinned as ${partOf.length === 1 ? 'this event' : 'these events'}.</p><div class="event-rows">${partOf.map(e => row(e)).join('')}</div></div>` : ''}
      ${chapters.length ? `<div class="card-chapters"><h3>In scripture</h3><div class="event-rows">${chapters.map(e => row(e)).join('')}</div>${alsoRead.length ? `<h4>Also read</h4><ul class="also-read">${alsoRead.map(a => `<li><a href="${escapeHTML(a.url)}" target="_blank" rel="noopener">${escapeHTML(a.ref)}</a>${a.note ? ` <span>${escapeHTML(a.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}</div>` : ''}
      <p class="card-links">${d.readerUrl ? `<a href="${escapeHTML(d.readerUrl)}" target="_blank" rel="noopener">Read the chapter</a>` : ''}${conference ? `<a href="${escapeHTML(conference)}" target="_blank" rel="noopener">General conference in ${event.start}</a>` : ''}</p>
      ${notes.map(n => `<p class="card-note">${escapeHTML(n)}</p>`).join('')}
      <dl class="card-facts">
        <dt>Place</dt><dd>${escapeHTML(place?.name ?? '')}${otherPlaces.length ? `<span> · also ${escapeHTML(otherPlaces.join(', '))}</span>` : ''}</dd>
        ${isHistory ? `<dt>Region</dt><dd>${escapeHTML(d.region)}</dd>` : ''}
        ${names.length ? `<dt>People</dt><dd>${escapeHTML(names.join(', '))}</dd>` : ''}
        ${d.citations ? `<dt>In scripture</dt><dd>${escapeHTML(d.citations.join('; '))}</dd>` : ''}
      </dl>
      ${also.length ? `<div class="card-also"><h3>Also at this time</h3><div class="event-rows">${also.map(e => row(e, related.includes(e.id))).join('')}</div>${d.relatedNote && also.some(e => related.includes(e.id)) ? `<p class="card-also-note">Linked: ${escapeHTML(d.relatedNote)}</p>` : ''}</div>` : ''}
      ${sources.length ? `<div class="card-sources"><h3>${titleFirst(event) && event.kind !== 'event' ? 'Source' : 'Date sources'}</h3>${sources.map(s => `${s.quote ? `<blockquote class="source-quote">“${escapeHTML(s.quote.join(' … '))}”</blockquote>` : ''}<a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.title)}</a>`).join('')}</div>` : ''}`;
    content.scrollTop = 0;
    bind();
    onShow?.({ type: 'event', event, details: d });
  }

  // One path, opened from the globe or the Book of Mormon map. It links back to its event.
  async function showRoute(event, routeId, { push = true } = {}) {
    if (push && current && !(current.type === 'route' && current.route.id === routeId)) history.push(current);
    open();
    labelEl.textContent = 'PATH';
    current = { type: 'route', event, route: { id: routeId, title: '' } };
    content.innerHTML = `${backButton()}<p class="card-loading">Loading this path…</p>`;
    bind();
    let d;
    try { d = (await loadDetails(event.volume))[event.id]; }
    catch { content.innerHTML = `${backButton()}<p class="card-loading">This path's details could not load. Reload the page to try again.</p>`; bind(); return; }
    if (current?.type !== 'route' || current.event !== event || current.route.id !== routeId) return;
    const route = d?.routes?.find(r => r.id === routeId);
    if (!route) { close(); return; }
    current.route = route;
    content.innerHTML = `${backButton()}
      <p class="card-volume">${shapeSVG(event.volume, 16)}<span style="color:${routeStyle(event.volume, route).color}">${escapeHTML(routeStyle(event.volume, route).label)}</span></p>
      <h2>${escapeHTML(route.title)}</h2>
      ${route.ref ? `<p class="card-ref">${escapeHTML(route.ref)}</p>` : ''}
      ${route.intro ? `<p class="card-setting">${escapeHTML(route.intro)}</p>` : ''}
      ${route.text ? `<p class="card-summary">${escapeHTML(route.text)}</p>` : ''}
      ${route.stops?.length ? `<div class="card-stops"><h3>Named stops</h3><p>${route.stops.map(escapeHTML).join(' → ')}</p></div>` : ''}
      ${route.note ? `<p class="card-note">${escapeHTML(route.note)}</p>` : ''}
      <div class="card-part-of"><h3>Part of</h3><div class="event-rows">${row(event)}</div></div>
      <p class="card-footnote">The line joins the named stops in order. It does not trace the road.</p>`;
    content.scrollTop = 0;
    bind();
    onShow?.({ type: 'route', event, route });
  }

  function showList(title, events, { note = '', push = true, label = 'EVENTS' } = {}) {
    if (push && current?.type === 'event') history = [];
    open();
    labelEl.textContent = label;
    current = { type: 'list', title, events, note };
    const sorted = [...events].sort((a, b) => (a.start ?? -1e9) - (b.start ?? -1e9));
    content.innerHTML = `${backButton()}<h2 class="list-title">${escapeHTML(title)}</h2>
      <p class="list-note">${escapeHTML(note || `${events.length} ${events.length === 1 ? 'event' : 'events'}. Select one to read more.`)}</p>
      <div class="event-rows">${sorted.map(e => row(e)).join('')}</div>`;
    content.scrollTop = 0;
    bind();
    onShow?.({ type: 'list', events });
  }

  return { showEvent, showRoute, showList, close, get isOpen() { return !panel.hidden; }, get current() { return current; }, loadPeople };
}
