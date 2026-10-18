// Wayfinder Timeline: start-up. Joins the globe and the timeline strip.
// Milestone 1 has no events. Later milestones add pins, cards, and filters here.

import { createGlobe } from './globe.js';
import { createScrubber } from './scrubber.js';
import { formatYear, formatRange } from './time-scale.js';

const $ = id => document.getElementById(id);
const START_YEAR = -600;

function setStatus(message) {
  $('status').textContent = message;
  $('status').hidden = !message;
}

function start() {
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
    },
  });

  // The arrow keys move through time unless a form field or the strip has focus.
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (target.closest?.('input, textarea, select, button, [role="slider"]')) return;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) scrubber.handleKey(event);
  });

  scrubber.start(START_YEAR);
}

start();
