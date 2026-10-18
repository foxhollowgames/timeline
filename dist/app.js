// Wayfinder Timeline: start-up. Joins the globe, the strip, the pins, the card, search, and the address.

import { createGlobe } from './globe.js';
import { createScrubber } from './scrubber.js';
import { formatYear, formatRange } from './time-scale.js';
import { loadEvents, stripBands, isActive, eventStops, nextStop, previousStop } from './events.js';
import { createPins } from './pins.js';
import { createCard } from './card.js';
import { createSearch } from './search.js';
import { VOLUMES, VOLUME_ORDER, shapeSVG } from './volumes.js';
import { readHash, writeHash } from './address.js';

const $ = id => document.getElementById(id);
const START_YEAR = -600;
const TRAIL_WINDOWS = 3; // the trail covers three window widths before the window

function setStatus(message) {
  $('status').textContent = message;
  $('status').hidden = !message;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function start() {
  const initial = readHash(location.hash);
  const hidden = new Set(initial.hide ?? []);
  let data = null, stops = [], card = null, pins = null, selected = null;

  // ---------- Globe ----------
  let globe;
  try {
    globe = createGlobe({ stage: $('globe-stage'), container: $('scene'), onStatus: setStatus, isPaused: () => Boolean(card?.isOpen) });
  } catch (error) {
    console.error(error);
    setStatus('The globe could not start. This view needs a browser with 3D graphics.');
  }
  if (globe) {
    $('globe-zoom-in').addEventListener('click', globe.zoomIn);
    $('globe-zoom-out').addEventListener('click', globe.zoomOut);
    $('globe-reset').addEventListener('click', () => { card?.close(); globe.reset(); });
    globe.onFrame(() => {
      const distance = globe.distance();
      $('globe-zoom-in').disabled = distance <= globe.limits.min + 0.005;
      $('globe-zoom-out').disabled = distance >= globe.limits.max - 0.005;
    });
  }

  // ---------- Strip ----------
  const scrubber = createScrubber({
    strip: $('strip'), overview: $('strip-overview'), input: $('year-input'),
    zoomIn: $('strip-zoom-in'), zoomOut: $('strip-zoom-out'), fit: $('strip-fit'),
    onChange({ year, window }) {
      $('overview-year').textContent = formatYear(year);
      $('overview-window').textContent = `Showing events from ${formatRange(window.start, window.end)}`;
      refresh();
    },
  });

  // ---------- What is shown ----------
  const shown = () => data.events.filter(e => !hidden.has(e.volume));

  function refresh() {
    if (!data) return;
    const year = scrubber.year, window = scrubber.window();
    const events = shown();
    const active = events.filter(e => isActive(e, window, year, data.bands));
    const onGlobe = active.filter(e => e.map === 'globe' && !e.broad);
    const onMap = active.filter(e => e.map === 'bom');
    const broad = active.filter(e => e.broad);
    const trailSpan = (window.end - window.start + 1) * TRAIL_WINDOWS;
    const trail = events.filter(e => e.map === 'globe' && !e.broad && e.end != null && e.end < window.start && e.end >= window.start - trailSpan);
    pins?.setItems([
      ...onGlobe.map(event => ({ event, placeKey: event.place, place: data.places[event.place], state: 'active' })),
      ...trail.map(event => ({ event, placeKey: event.place, place: data.places[event.place], state: 'trail' })),
    ]);

    const parts = [];
    if (onGlobe.length) parts.push(`${plural(onGlobe.length, 'event')} on the globe.`);
    if (onMap.length) parts.push(`${onMap.length} more for the Book of Mormon map.`);
    if (broad.length) parts.push(`${plural(broad.length, 'psalm')} with wide dates are not pinned.`);
    if (onGlobe.some(e => e.start == null)) parts.push('Years are not given for some.');
    $('overview-count').textContent = parts.length ? parts.join(' ') : 'No scripture events in this window.';

    const previous = previousStop(stops, year), next = nextStop(stops, year);
    $('previous-event').disabled = !previous;
    $('next-event').disabled = !next;
    $('previous-event').title = previous ? `Previous event: ${previous.label}, ${formatYear(previous.year)}` : 'No earlier event';
    $('next-event').title = next ? `Next event: ${next.label}, ${formatYear(next.year)}` : 'No later event';
    saveAddress();
  }

  function applyFilters() {
    const events = shown();
    stops = eventStops({ ...data, events: events.filter(e => !e.broad) });
    scrubber.setEvents(events, stripBands(data));
    for (const button of $('legend').querySelectorAll('[data-volume]')) button.setAttribute('aria-pressed', String(!hidden.has(button.dataset.volume)));
    refresh();
  }

  // ---------- Address ----------
  let saveTimer;
  function saveAddress() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const hash = writeHash({ year: scrubber.year, event: selected?.id, hide: [...hidden], view: scrubber.view });
      if (hash !== location.hash) history.replaceState(null, '', hash || location.pathname + location.search);
    }, 250);
  }

  // ---------- Selecting events ----------
  const bandYear = band => Math.round((band.start + band.end) / 2);
  function moveTo(event) {
    const window = scrubber.window();
    if (isActive(event, window, scrubber.year, data.bands)) return;
    if (event.start == null) scrubber.setYear(event.band === 'primeval' ? bandYear(data.bands.primeval) : scrubber.year);
    else scrubber.setYear(event.start);
  }
  function focusPlace(event) {
    if (!globe || event.map !== 'globe') return;
    const place = data.places[event.place];
    if (place) globe.focusOn(globe.vector(place, 1));
  }
  function openEvent(event, { move = true } = {}) {
    if (hidden.has(event.volume)) { hidden.delete(event.volume); applyFilters(); }
    if (move) moveTo(event);
    card.showEvent(event, { resetHistory: true });
    focusPlace(event);
  }
  function openList(title, events, { note, label } = {}) {
    card.showList(title, events, { note, label });
  }
  function slideForCard() {
    if (!globe) return;
    requestAnimationFrame(() => {
      const panel = $('card').getBoundingClientRect(), stage = $('globe-stage').getBoundingClientRect();
      if (innerWidth > 650) globe.slideTo((stage.width - panel.left + stage.left) / 2, 0);
      else {
        // On a phone, center the globe in the gap between the header and the card.
        const top = document.querySelector('.site-header').getBoundingClientRect().bottom - stage.top;
        const gapCenter = (top + panel.top - stage.top) / 2;
        globe.slideTo(0, Math.max(0, stage.height / 2 - gapCenter));
      }
    });
  }

  // ---------- Volume legend and filters ----------
  $('legend').innerHTML = VOLUME_ORDER.map(v => `<button class="legend-item" data-volume="${v}" aria-pressed="true" title="Show or hide ${VOLUMES[v].label}">${shapeSVG(v, 15)}<span class="legend-short">${VOLUMES[v].short}</span><span class="visually-hidden"> ${VOLUMES[v].label}</span></button>`).join('');
  for (const button of $('legend').querySelectorAll('[data-volume]')) {
    button.addEventListener('click', () => {
      const v = button.dataset.volume;
      if (hidden.has(v)) hidden.delete(v);
      else hidden.add(v);
      if (selected && hidden.has(selected.volume)) card.close();
      applyFilters();
    });
  }

  // ---------- Keys ----------
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && card?.isOpen && !event.target.closest?.('.search')) { card.close(); return; }
    const target = event.target;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (target.closest?.('input, textarea, select, button, [role="slider"]')) return;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) scrubber.handleKey(event);
  });
  $('previous-event').addEventListener('click', () => { const stop = previousStop(stops, scrubber.year); if (stop) scrubber.setYear(stop.year); });
  $('next-event').addEventListener('click', () => { const stop = nextStop(stops, scrubber.year); if (stop) scrubber.setYear(stop.year); });

  if (initial.view) scrubber.setView(initial.view);
  scrubber.start(initial.year ?? START_YEAR);

  // ---------- Data ----------
  try {
    data = await loadEvents();
  } catch (error) {
    console.error(error);
    $('overview-count').textContent = 'The event list could not load. Reload the page to try again.';
    return;
  }

  card = createCard({
    panel: $('card'), content: $('card-content'), labelEl: $('card-label'), closeButton: $('card-close'), data,
    onShow({ type, event, details }) {
      if (type === 'event') {
        selected = event;
        pins?.setSelected(event.id);
        const others = event.map === 'globe' ? event.places.filter(k => k !== event.place).map(k => ({ key: k, ...data.places[k] })) : [];
        pins?.setMarkers(others);
        if (details) globe?.setRoutes(event.map === 'globe' ? (details.routes ?? []).map(r => ({ points: r.points, color: 0xefcc88 })) : []);
      } else {
        selected = null;
        pins?.setSelected(null); pins?.setMarkers([]); globe?.setRoutes([]);
      }
      slideForCard();
      saveAddress();
    },
    // Choosing an event from a list moves time to it and turns the globe toward it.
    onPick(event) {
      if (hidden.has(event.volume)) { hidden.delete(event.volume); applyFilters(); }
      moveTo(event);
      focusPlace(event);
    },
    onClose() {
      selected = null;
      pins?.setSelected(null); pins?.setMarkers([]); globe?.setRoutes([]);
      globe?.slideTo(0, 0);
      saveAddress();
    },
  });

  if (globe) {
    pins = createPins({
      globe, layer: $('pins'), topInset: () => document.querySelector('.site-header').offsetHeight + 6,
      onOpen(events, group) {
        if (events.length === 1) { card.showEvent(events[0], { resetHistory: true }); focusPlace(events[0]); return; }
        const place = group.items[0].place.name;
        openList(`Near ${place}`, events, { note: `${plural(events.length, 'event')} in this window. Select one to read more.` });
        focusPlace(events[0]);
      },
    });
  }

  createSearch({
    input: $('search-input'), list: $('search-results'), data, loadPeople: card.loadPeople,
    onEvent: event => openEvent(event),
    onPlace: (name, events) => {
      openList(`Events at ${name}`, events, { label: 'PLACE' });
      const nearest = [...events].filter(e => e.start != null).sort((a, b) => Math.abs(a.start - scrubber.year) - Math.abs(b.start - scrubber.year))[0];
      if (nearest) { moveTo(nearest); focusPlace(nearest); }
    },
    onPerson: (name, events) => {
      openList(name, events, { label: 'PERSON' });
      const first = [...events].sort((a, b) => (a.start ?? -1e9) - (b.start ?? -1e9))[0];
      if (first) { moveTo(first); focusPlace(first); }
    },
  });
  $('search-input').disabled = false;

  applyFilters();

  // Open the event named in the address, if any.
  const linked = initial.event && data.events.find(e => e.id === initial.event);
  if (linked) openEvent(linked, { move: initial.year == null });

  addEventListener('hashchange', () => {
    const next = readHash(location.hash);
    hidden.clear(); for (const v of next.hide ?? []) hidden.add(v);
    if (next.view) scrubber.setView(next.view);
    if (next.year != null) scrubber.setYear(next.year);
    applyFilters();
    const event = next.event && data.events.find(e => e.id === next.event);
    if (event && event !== selected) openEvent(event, { move: next.year == null });
    else if (!event && card.isOpen && card.current?.type === 'event') card.close();
  });
}

start();
