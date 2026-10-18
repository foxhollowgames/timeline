// Event data helpers: which events fall in the active window, and where the
// previous and next event buttons go. Pure functions, no DOM.

export async function loadEvents(url = 'data/events.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Events data unavailable (${response.status})`);
  return response.json();
}

// Order-only bands on the strip (DESIGN.md Q28, Q29). The Jaredite band shows while the
// Book of Mormon panel is open, as a thin second lane.
export const stripBands = (data, { bom = false } = {}) => [
  data.bands.primeval && { ...data.bands.primeval, lane: 0 },
  bom && data.bands.jaredite && { ...data.bands.jaredite, lane: 1 },
].filter(Boolean);

// An event is active when its years overlap the window. An order-only event is
// active while the selected year is anywhere inside its band.
export function isActive(event, window, year, bands) {
  if (event.start == null) {
    const band = bands[event.band];
    return Boolean(band) && band.start != null && band.end != null && year >= band.start && year <= band.end;
  }
  return event.start <= window.end && event.end >= window.start;
}

export const activeEvents = (data, window, year) => data.events.filter(e => isActive(e, window, year, data.bands));

// Stops for the previous and next event buttons: each distinct start year of a dated
// scripture event, plus the start of the order-only band.
export function eventStops(data) {
  const stops = new Map();
  const band = data.bands.primeval;
  if (band) stops.set(band.start, { year: band.start, label: band.label });
  for (const e of data.events) {
    if (e.start == null || stops.has(e.start)) continue;
    stops.set(e.start, { year: e.start, label: e.ref });
  }
  return [...stops.values()].sort((a, b) => a.year - b.year);
}

export const nextStop = (stops, year) => stops.find(s => s.year > year) ?? null;
export const previousStop = (stops, year) => [...stops].reverse().find(s => s.year < year) ?? null;
