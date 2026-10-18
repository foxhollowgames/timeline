// Wayfinder Timeline: start-up. Joins the globe, the timeline strip, and the event data.
// Milestone 2 loads the events for the density bar, the counts, and the event buttons.
// Pins, cards, and filters arrive in milestone 3.

import { createGlobe } from './globe.js';
import { createScrubber } from './scrubber.js';
import { formatYear, formatRange } from './time-scale.js';
import { loadEvents, stripBands, activeEvents, eventStops, nextStop, previousStop } from './events.js';

const $ = id => document.getElementById(id);
const START_YEAR = -600;

function setStatus(message) {
  $('status').textContent = message;
  $('status').hidden = !message;
}

async function start() {
  let globe;
  try {
    globe = createGlobe({ stage: $('globe-stage'), container: $('scene'), onStatus: setStatus });
  } catch (error) {
    console.error(error);
    setStatus('The globe could not start. This view needs a browser with 3D graphics.');
  }

  if (globe) {
    $('globe-zoom-in').addEventListener('click', globe.zoomIn);
    $('globe-zoom-out').addEventListener('click', globe.zoomOut);
    $('globe-reset').addEventListener('click', globe.reset);
    globe.onFrame(() => {
      const distance = globe.distance();
      $('globe-zoom-in').disabled = distance <= globe.limits.min + 0.005;
      $('globe-zoom-out').disabled = distance >= globe.limits.max - 0.005;
    });
  }

  let data = null, stops = [];

  function updateEvents(year, window) {
    if (!data) return;
    const active = activeEvents(data, window, year);
    const undated = active.filter(e => e.start == null).length, plural = n => (n === 1 ? 'event' : 'events');
    $('overview-count').textContent = !active.length ? 'No scripture events in this window.'
      : undated === active.length ? `${undated} scripture ${plural(undated)} with no years given.`
      : `${active.length} scripture ${plural(active.length)} in this window.${undated ? ` Years are not given for ${undated}.` : ''}`;
    const previous = previousStop(stops, year), next = nextStop(stops, year);
    $('previous-event').disabled = !previous;
    $('next-event').disabled = !next;
    $('previous-event').title = previous ? `Previous event: ${previous.label}, ${formatYear(previous.year)}` : 'No earlier event';
    $('next-event').title = next ? `Next event: ${next.label}, ${formatYear(next.year)}` : 'No later event';
  }

  const scrubber = createScrubber({
    strip: $('strip'),
    overview: $('strip-overview'),
    input: $('year-input'),
    zoomIn: $('strip-zoom-in'),
    zoomOut: $('strip-zoom-out'),
    fit: $('strip-fit'),
    onChange({ year, window }) {
      $('overview-year').textContent = formatYear(year);
      $('overview-window').textContent = `Showing events from ${formatRange(window.start, window.end)}`;
      updateEvents(year, window);
    },
  });

  $('previous-event').addEventListener('click', () => { const stop = previousStop(stops, scrubber.year); if (stop) scrubber.setYear(stop.year); });
  $('next-event').addEventListener('click', () => { const stop = nextStop(stops, scrubber.year); if (stop) scrubber.setYear(stop.year); });

  // The arrow keys move through time unless a form field or the strip has focus.
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (target.closest?.('input, textarea, select, button, [role="slider"]')) return;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) scrubber.handleKey(event);
  });

  scrubber.start(START_YEAR);

  try {
    data = await loadEvents();
    stops = eventStops(data);
    scrubber.setEvents(data.events, stripBands(data));
    updateEvents(scrubber.year, scrubber.window());
  } catch (error) {
    console.error(error);
    $('overview-count').textContent = 'The event list could not load. Reload the page to try again.';
  }
}

start();
