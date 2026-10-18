// Wayfinder Timeline: start-up. Joins the globe, the Book of Mormon panel, the strip, the pins,
// the card, search, and the address.

import { createGlobe } from './globe.js';
import { createScrubber } from './scrubber.js';
import { formatYear, formatRange, yearsPerU, yearToU, zoomView } from './time-scale.js';
import { loadEvents, stripBands, isActive, eventStops, nextStop, previousStop } from './events.js';
import { createPins, globeView } from './pins.js';
import { createCard } from './card.js';
import { createSearch } from './search.js';
import { VOLUMES, VOLUME_ORDER, SCRIPTURE, shapeSVG } from './volumes.js';
import { readHash, writeHash } from './address.js';
import { createSplit } from './split.js';
import { createBomMap } from './bom-map.js';

const $ = id => document.getElementById(id);
const START_YEAR = -600;
const TRAIL_WINDOWS = 3; // the trail covers three window widths before the window
// Tier 2 history shows once the strip shows this many years or fewer (DESIGN.md Q5).
const TIER_2_YEARS = 1500;

function setStatus(message, id = 'status') {
  $(id).textContent = message;
  $(id).hidden = !message;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function start() {
  const initial = readHash(location.hash);
  const hidden = new Set(initial.hide ?? []);
  let data = null, stops = [], card = null, pins = null, selected = null;
  let bom = null, bomPins = null, bomLoading = null, layoutInfo = null;

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

  // ---------- Split and Book of Mormon panel ----------
  const split = createSplit({
    main: document.querySelector('main'), globeStage: $('globe-stage'), panel: $('bom-stage'), divider: $('split-divider'), timeline: document.querySelector('.timeline'),
    onLayout(info) { layoutInfo = info; bom?.resize(); placeCard(); if (card?.isOpen) slideForCard(); },
  });

  function ensureBom() {
    bomLoading ??= createBomMap({ container: $('bom-map') }).then(map => {
      bom = map;
      bomPins = createPins({ view: map.view, layer: $('bom-pins'), onOpen: openGroup });
      refresh();
      if (selected?.map === 'bom') showSelection(selected, card.current?.details);
      return map;
    }).catch(error => {
      console.error(error);
      setStatus('The Book of Mormon map could not load. Reload the page to try again.', 'bom-status');
      bomLoading = null;
      return null;
    });
    return bomLoading;
  }
  function setBomOpen(open) {
    if (open === split.open) return;
    split.setOpen(open);
    $('bom-toggle').setAttribute('aria-pressed', String(open));
    if (open) ensureBom();
    applyFilters();
  }
  $('bom-toggle').addEventListener('click', () => setBomOpen(!split.open));
  $('bom-chip').addEventListener('click', () => setBomOpen(true));
  $('bom-close').addEventListener('click', () => { setBomOpen(false); $('bom-toggle').focus(); });

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
  const isScripture = e => e.volume !== 'history';
  const visibleYears = () => { const v = scrubber.view; return (v.u1 - v.u0) * yearsPerU(yearToU(scrubber.year)); };
  const tierShown = e => isScripture(e) || e.tier === 1 || visibleYears() <= TIER_2_YEARS;
  const item = (event, state) => ({ event, placeKey: event.place, place: data.places[event.place], state });

  function refresh() {
    if (!data) return;
    const year = scrubber.year, window = scrubber.window();
    const events = shown();
    const active = events.filter(e => isActive(e, window, year, data.bands));
    const onGlobe = active.filter(e => e.map === 'globe' && !e.broad && tierShown(e));
    const onMap = active.filter(e => e.map === 'bom');
    const broad = active.filter(e => e.broad);
    const trailSpan = (window.end - window.start + 1) * TRAIL_WINDOWS;
    const inTrail = e => !e.broad && e.end != null && e.end < window.start && e.end >= window.start - trailSpan;
    pins?.setItems([...onGlobe.map(e => item(e, 'active')), ...events.filter(e => e.map === 'globe' && inTrail(e) && tierShown(e)).map(e => item(e, 'trail'))]);
    bomPins?.setItems(split.open ? [...onMap.map(e => item(e, 'active')), ...events.filter(e => e.map === 'bom' && inTrail(e)).map(e => item(e, 'trail'))] : []);

    const parts = [];
    const scriptureOnGlobe = onGlobe.filter(isScripture).length, historyOnGlobe = onGlobe.length - scriptureOnGlobe;
    if (scriptureOnGlobe) parts.push(`${plural(scriptureOnGlobe, 'scripture event')} on the globe.`);
    if (historyOnGlobe) parts.push(`${plural(historyOnGlobe, 'world history event')}.`);
    const hiddenTier = active.filter(e => !tierShown(e)).length;
    if (hiddenTier) parts.push(`Zoom the strip in to see ${plural(hiddenTier, 'more history event')}.`);
    if (onMap.length) parts.push(split.open ? `${onMap.length} on the Book of Mormon map.` : `${onMap.length} more for the Book of Mormon map.`);
    if (broad.length) parts.push(`${plural(broad.length, 'psalm')} with wide dates are not pinned.`);
    if ([...onGlobe, ...(split.open ? onMap : [])].some(e => e.start == null)) parts.push('Years are not given for some.');
    $('overview-count').textContent = parts.length ? parts.join(' ') : 'No scripture events in this window.';

    // The chip offers the panel when the window has Book of Mormon map events (DESIGN.md Q32).
    $('bom-chip').hidden = split.open || hidden.has('bom') || !onMap.length;
    updatePanelNotes(onMap, window);

    const previous = previousStop(stops, year), next = nextStop(stops, year);
    $('previous-event').disabled = !previous;
    $('next-event').disabled = !next;
    $('previous-event').title = previous ? `Previous event: ${previous.label}, ${formatYear(previous.year)}` : 'No earlier event';
    $('next-event').title = next ? `Next event: ${next.label}, ${formatYear(next.year)}` : 'No later event';
    saveAddress();
  }

  // With no events in the window, the panel offers the nearest one in each direction.
  function updatePanelNotes(onMap, window) {
    const jaredite = onMap.some(e => e.band === 'jaredite');
    $('bom-band-note').hidden = !split.open || !jaredite;
    $('bom-band-note').textContent = jaredite ? `Jaredite record: years not given. ${data.bands.jaredite.note}` : '';
    const empty = $('bom-empty');
    if (!split.open || onMap.length || hidden.has('bom')) { empty.hidden = true; return; }
    const dated = shown().filter(e => e.map === 'bom' && e.start != null);
    const before = dated.filter(e => e.end < window.start).sort((a, b) => b.end - a.end)[0];
    const after = dated.filter(e => e.start > window.end).sort((a, b) => a.start - b.start)[0];
    const button = (e, dir) => `<button data-jump="${escapeHTML(e.id)}">${dir === 'before' ? '‹ ' : ''}${escapeHTML(e.ref)} · ${escapeHTML(formatYear(dir === 'before' ? e.end : e.start))}${dir === 'after' ? ' ›' : ''}</button>`;
    empty.innerHTML = `<p>No Book of Mormon events in this window.</p><div>${before ? button(before, 'before') : ''}${after ? button(after, 'after') : ''}</div>`;
    empty.hidden = false;
    for (const b of empty.querySelectorAll('[data-jump]')) b.addEventListener('click', () => {
      const e = data.events.find(x => x.id === b.dataset.jump);
      if (e) scrubber.setYear(e.start > window.end ? e.start : e.end);
    });
  }

  function applyFilters() {
    const events = shown();
    // The event buttons and the density bar follow scripture only (DESIGN.md Q12).
    stops = eventStops({ ...data, events: events.filter(e => !e.broad && isScripture(e)) });
    scrubber.setEvents(events.filter(isScripture), stripBands(data, { bom: split.open && !hidden.has('bom') }));
    for (const button of $('legend').querySelectorAll('[data-volume]')) button.setAttribute('aria-pressed', String(!hidden.has(button.dataset.volume)));
    refresh();
  }

  // ---------- Address ----------
  let saveTimer;
  function saveAddress() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const hash = writeHash({ year: scrubber.year, event: selected?.id, hide: [...hidden], view: scrubber.view, bom: split.open });
      if (hash !== location.hash) history.replaceState(null, '', hash || location.pathname + location.search);
    }, 250);
  }

  // ---------- Selecting events ----------
  const bandYear = band => Math.round((band.start + band.end) / 2);
  function moveTo(event) {
    // A second-tier history event needs the strip zoomed in far enough to show it.
    if (event.volume === 'history' && event.tier === 2) {
      const years = (scrubber.view.u1 - scrubber.view.u0) * yearsPerU(yearToU(event.start));
      if (years > TIER_2_YEARS) scrubber.setView(zoomView(scrubber.view, (TIER_2_YEARS * 0.8) / years, yearToU(event.start)));
    }
    const window = scrubber.window();
    if (isActive(event, window, scrubber.year, data.bands)) return;
    if (event.start == null) scrubber.setYear(bandYear(data.bands[event.band] ?? data.bands.primeval));
    else scrubber.setYear(event.start);
  }
  const pointsOf = event => event.places.map(k => data.places[k]).filter(p => p?.x != null).map(p => [p.x, p.y]);
  function focusPlace(event) {
    if (event.map === 'bom') {
      if (!split.open) setBomOpen(true);
      ensureBom().then(map => map?.focus(pointsOf(event)));
      return;
    }
    const place = data.places[event.place];
    if (globe && place) globe.focusOn(globe.vector(place, 1));
  }
  function openEvent(event, { move = true } = {}) {
    if (hidden.has(event.volume)) { hidden.delete(event.volume); applyFilters(); }
    if (move) moveTo(event);
    card.showEvent(event, { resetHistory: true });
    focusPlace(event);
  }
  function openGroup(events, group) {
    if (events.length === 1) { card.showEvent(events[0], { resetHistory: true }); focusPlace(events[0]); return; }
    const place = group.items[0].place.name;
    card.showList(`Near ${place}`, events, { note: `${plural(events.length, 'event')} in this window. Select one to read more.` });
    if (events[0].map === 'globe') focusPlace(events[0]);
  }

  // The card sits beside the panel on desktop. On a phone it covers the half that does not hold the event.
  function placeCard() {
    const el = $('card');
    el.style.removeProperty('right'); el.style.removeProperty('top'); el.style.removeProperty('bottom'); el.style.removeProperty('max-height');
    if (!layoutInfo?.open) return;
    if (!layoutInfo.stacked) { el.style.right = `${layoutInfo.panel.width + 24}px`; return; }
    const header = document.querySelector('.site-header').offsetHeight;
    if (selected?.map === 'bom') {
      el.style.top = `${header + 6}px`; el.style.bottom = 'auto';
      el.style.maxHeight = `${Math.max(160, layoutInfo.globe.height - header - 12)}px`;
    } else {
      el.style.maxHeight = `${Math.max(160, layoutInfo.panel.height - 12)}px`;
    }
  }
  function slideForCard() {
    if (!globe) return;
    requestAnimationFrame(() => {
      const panel = $('card').getBoundingClientRect(), stage = $('globe-stage').getBoundingClientRect();
      const overGlobe = panel.left < stage.right && panel.right > stage.left && panel.top < stage.bottom && panel.bottom > stage.top;
      if (!overGlobe || $('card').hidden) { globe.slideTo(0, 0); return; }
      if (!layoutInfo?.stacked && innerWidth > 650) globe.slideTo(Math.max(0, (stage.right - panel.left) / 2), 0);
      else {
        // Center the globe in the space the card leaves open.
        const top = Math.max(document.querySelector('.site-header').getBoundingClientRect().bottom, stage.top);
        const freeTop = panel.top > stage.top + 40 ? top : panel.bottom, freeBottom = panel.top > stage.top + 40 ? panel.top : stage.bottom;
        globe.slideTo(0, stage.top + stage.height / 2 - (freeTop + freeBottom) / 2);
      }
    });
  }
  function showSelection(event, details) {
    const others = event.places.filter(k => k !== event.place).map(k => ({ key: k, ...data.places[k] }));
    const routes = (details?.routes ?? []).map(r => ({ points: r.points, color: 0xefcc88 }));
    const onBom = event.map === 'bom';
    pins?.setSelected(event.id); bomPins?.setSelected(event.id);
    pins?.setMarkers(onBom ? [] : others); bomPins?.setMarkers(onBom ? others : []);
    if (details) { globe?.setRoutes(onBom ? [] : routes); bom?.setRoutes(onBom ? routes : []); }
  }
  function clearSelection() {
    selected = null;
    pins?.setSelected(null); pins?.setMarkers([]); globe?.setRoutes([]);
    bomPins?.setSelected(null); bomPins?.setMarkers([]); bom?.setRoutes([]);
  }

  // ---------- Volume legend and filters ----------
  $('legend').innerHTML = VOLUME_ORDER.map(v => `<button class="legend-item" data-volume="${v}" aria-pressed="true" title="Show or hide ${VOLUMES[v].label}">${shapeSVG(v, 15)}<span class="legend-short">${VOLUMES[v].short}</span><span class="visually-hidden"> ${VOLUMES[v].label}</span></button>`).join('');
  $('bom-toggle').querySelector('.bom-toggle-shape').innerHTML = shapeSVG('bom', 14);
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
    if (target.closest?.('input, textarea, select, button, [role="slider"], [role="separator"], .bom-map')) return;
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
      if (type === 'event') { selected = event; showSelection(event, details); }
      else clearSelection();
      placeCard();
      slideForCard();
      saveAddress();
    },
    // Choosing an event from a list moves time to it and turns the map toward it.
    onPick(event) {
      if (hidden.has(event.volume)) { hidden.delete(event.volume); applyFilters(); }
      moveTo(event);
      focusPlace(event);
    },
    onClose() {
      // After a Book of Mormon event, show the whole land again.
      if (selected?.map === 'bom') bom?.focus([]);
      clearSelection();
      placeCard();
      globe?.slideTo(0, 0);
      saveAddress();
    },
  });

  if (globe) pins = createPins({ view: globeView(globe), layer: $('pins'), topInset: () => document.querySelector('.site-header').offsetHeight + 6, onOpen: openGroup });

  createSearch({
    input: $('search-input'), list: $('search-results'), data, loadPeople: card.loadPeople,
    onEvent: event => openEvent(event),
    onPlace: (name, events) => {
      card.showList(`Events at ${name}`, events, { label: 'PLACE' });
      const nearest = [...events].filter(e => e.start != null).sort((a, b) => Math.abs(a.start - scrubber.year) - Math.abs(b.start - scrubber.year))[0];
      if (nearest) { moveTo(nearest); focusPlace(nearest); }
    },
    onPerson: (name, events) => {
      card.showList(name, events, { label: 'PERSON' });
      const first = [...events].sort((a, b) => (a.start ?? -1e9) - (b.start ?? -1e9))[0];
      if (first) { moveTo(first); focusPlace(first); }
    },
  });
  $('search-input').disabled = false;

  if (initial.bom) setBomOpen(true);
  applyFilters();

  // Open the event named in the address, if any.
  const linked = initial.event && data.events.find(e => e.id === initial.event);
  if (linked) openEvent(linked, { move: initial.year == null });

  addEventListener('hashchange', () => {
    const next = readHash(location.hash);
    hidden.clear(); for (const v of next.hide ?? []) hidden.add(v);
    if (next.view) scrubber.setView(next.view);
    if (next.year != null) scrubber.setYear(next.year);
    setBomOpen(Boolean(next.bom));
    applyFilters();
    const event = next.event && data.events.find(e => e.id === next.event);
    if (event && event !== selected) openEvent(event, { move: next.year == null });
    else if (!event && card.isOpen && card.current?.type === 'event') card.close();
  });
}

start();
