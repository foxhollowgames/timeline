// The side card: one event, or a list of events (a pin group, a place, or a person).
// Details load per volume the first time a card needs them (dist/data/details/<volume>.json).

import { VOLUMES, shapeSVG } from './volumes.js';
import { formatRange } from './time-scale.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BASIS = {
  church: 'Church chronology',
  ministry: 'Church chronology, the prophet’s lifetime',
  scholarly: 'Scholarly estimate',
  edition: 'Book of Mormon chapter heading',
  section: 'D&C section heading',
  'not-given': 'Order only',
};
const VERSE_WORDS = 40;

export const eventDate = e => (e.start == null ? 'Years not given' : formatRange(e.start, e.end));

// One verse, cut to about 40 words (DESIGN.md Q24). A cut ends with an ellipsis.
function shortVerse(text) {
  const words = text.split(/\s+/);
  return words.length <= VERSE_WORDS ? text : words.slice(0, VERSE_WORDS).join(' ').replace(/[,;:]$/, '') + ' …';
}

export function createCard({ panel, content, labelEl, closeButton, data, onClose, onShow, onPick }) {
  const detailCache = new Map();
  let searchIndex = null, history = [], current = null;

  const loadDetails = volume => {
    if (!detailCache.has(volume)) detailCache.set(volume, fetch(`data/details/${volume}.json`).then(r => { if (!r.ok) throw new Error('details'); return r.json(); }));
    return detailCache.get(volume);
  };
  const loadPeople = () => (searchIndex ??= fetch('data/search.json').then(r => r.json()).catch(() => ({ people: {}, eventPeople: {} })));

  function open() { panel.hidden = false; }
  function close() {
    panel.hidden = true; history = []; current = null;
    onClose?.();
  }
  closeButton.addEventListener('click', close);

  function backButton() {
    if (!history.length) return '';
    return `<button class="card-back" data-back>Back to ${escapeHTML(history[history.length - 1].title)}</button>`;
  }
  function bind() {
    content.querySelector('[data-back]')?.addEventListener('click', () => {
      const previous = history.pop();
      if (previous) showList(previous.title, previous.events, { note: previous.note, push: false });
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
    ].filter(Boolean);
    content.innerHTML = `${backButton()}
      <p class="card-volume">${shapeSVG(event.volume, 16)}<span>${escapeHTML(VOLUMES[event.volume].label)}</span></p>
      <h2>${escapeHTML(event.title)}</h2>
      <p class="card-ref">${escapeHTML(event.ref)}</p>
      <div class="card-date">
        <p><strong>${escapeHTML(d.dateLabel)}</strong> <span>${escapeHTML(d.dateKept ? 'Scholarly date, inside the prophet’s lifetime' : BASIS[event.basis] ?? '')}</span></p>
        ${dateLines.map(line => `<p class="card-date-note">${escapeHTML(line)}</p>`).join('')}
      </div>
      ${d.setting ? `<p class="card-setting">${escapeHTML(d.setting)}</p>` : ''}
      <p class="card-summary">${escapeHTML(d.summary)}</p>
      ${d.verse?.text ? `<blockquote class="card-verse"><p>${escapeHTML(shortVerse(d.verse.text))}</p><cite>${escapeHTML(d.verse.ref)}</cite></blockquote>` : ''}
      <p class="card-links">${d.readerUrl ? `<a href="${escapeHTML(d.readerUrl)}" target="_blank" rel="noopener">Read the chapter</a>` : ''}</p>
      ${notes.map(n => `<p class="card-note">${escapeHTML(n)}</p>`).join('')}
      <dl class="card-facts">
        <dt>Place</dt><dd>${escapeHTML(place?.name ?? '')}${otherPlaces.length ? `<span> · also ${escapeHTML(otherPlaces.join(', '))}</span>` : ''}</dd>
        ${names.length ? `<dt>People</dt><dd>${escapeHTML(names.join(', '))}</dd>` : ''}
        ${d.citations ? `<dt>In scripture</dt><dd>${escapeHTML(d.citations.join('; '))}</dd>` : ''}
      </dl>
      ${sources.length ? `<div class="card-sources"><h3>Date sources</h3>${sources.map(s => `<a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.title)}</a>`).join('')}</div>` : ''}`;
    content.scrollTop = 0;
    bind();
    onShow?.({ type: 'event', event, details: d });
  }

  function showList(title, events, { note = '', push = true, label = 'EVENTS' } = {}) {
    if (push && current?.type === 'event') history = [];
    open();
    labelEl.textContent = label;
    current = { type: 'list', title, events, note };
    const sorted = [...events].sort((a, b) => (a.start ?? -1e9) - (b.start ?? -1e9));
    content.innerHTML = `${backButton()}<h2 class="list-title">${escapeHTML(title)}</h2>
      <p class="list-note">${escapeHTML(note || `${events.length} ${events.length === 1 ? 'event' : 'events'}. Select one to read more.`)}</p>
      <div class="event-rows">${sorted.map(e => `<button class="event-row" data-event="${escapeHTML(e.id)}">${shapeSVG(e.volume, 16)}<span><strong>${escapeHTML(e.ref)}</strong><small>${escapeHTML(e.title)}</small><small class="row-date">${escapeHTML(eventDate(e))}</small></span></button>`).join('')}</div>`;
    content.scrollTop = 0;
    bind();
    onShow?.({ type: 'list', events });
  }

  return { showEvent, showList, close, get isOpen() { return !panel.hidden; }, get current() { return current; }, loadPeople };
}
