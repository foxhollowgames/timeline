// The split between the globe and the Book of Mormon panel (DESIGN.md Q7, Q11).
// Desktop: side by side. Phone in portrait: globe on top, panel below. A divider resizes them.
// The globe's share is remembered in this browser only.

const KEY = 'wayfinder-timeline-split';
const DEFAULT = 0.55, MIN = 0.3, MAX = 0.75, DIVIDER = 10;

const readShare = () => {
  try { const value = Number(localStorage.getItem(KEY)); return value >= MIN && value <= MAX ? value : DEFAULT; } catch { return DEFAULT; }
};
const saveShare = value => { try { localStorage.setItem(KEY, String(value)); } catch {} };

export function createSplit({ main, globeStage, panel, divider, timeline, onLayout }) {
  let open = false, share = readShare();
  const stacked = () => innerWidth <= 650 || innerHeight > innerWidth * 1.15;

  function layout() {
    const timelineHeight = timeline.offsetHeight;
    const width = main.clientWidth, height = main.clientHeight - timelineHeight;
    for (const el of [globeStage, panel, divider]) el.style.removeProperty('inset');
    panel.hidden = !open;
    divider.hidden = !open;
    document.body.classList.toggle('split-open', open);
    document.body.classList.toggle('split-stacked', open && stacked());
    if (!open) {
      globeStage.style.inset = `0 0 ${timelineHeight}px 0`;
      onLayout?.({ open, stacked: false, globe: { width, height }, panel: null });
      return;
    }
    if (stacked()) {
      const globeHeight = Math.round(height * share);
      globeStage.style.inset = `0 0 ${timelineHeight + (height - globeHeight)}px 0`;
      divider.style.inset = `${globeHeight - DIVIDER / 2}px 0 auto 0`;
      panel.style.inset = `${globeHeight + DIVIDER / 2}px 0 ${timelineHeight}px 0`;
      divider.setAttribute('aria-orientation', 'horizontal');
      onLayout?.({ open, stacked: true, globe: { width, height: globeHeight }, panel: { top: globeHeight + DIVIDER / 2, height: height - globeHeight - DIVIDER / 2 } });
    } else {
      const globeWidth = Math.round(width * share);
      globeStage.style.inset = `0 ${width - globeWidth}px ${timelineHeight}px 0`;
      divider.style.inset = `0 auto ${timelineHeight}px ${globeWidth - DIVIDER / 2}px`;
      panel.style.inset = `0 0 ${timelineHeight}px ${globeWidth + DIVIDER / 2}px`;
      divider.setAttribute('aria-orientation', 'vertical');
      onLayout?.({ open, stacked: false, globe: { width: globeWidth, height }, panel: { left: globeWidth + DIVIDER / 2, width: width - globeWidth - DIVIDER / 2 } });
    }
    divider.setAttribute('aria-valuenow', String(Math.round(share * 100)));
    divider.setAttribute('aria-valuetext', `Globe ${Math.round(share * 100)} percent`);
  }

  function setShare(value) { share = Math.min(MAX, Math.max(MIN, value)); saveShare(share); layout(); }

  divider.setAttribute('role', 'separator');
  divider.setAttribute('tabindex', '0');
  divider.setAttribute('aria-valuemin', String(MIN * 100));
  divider.setAttribute('aria-valuemax', String(MAX * 100));
  divider.setAttribute('aria-label', 'Resize the globe and the Book of Mormon map');
  divider.addEventListener('pointerdown', event => {
    event.preventDefault();
    divider.setPointerCapture(event.pointerId);
    divider.classList.add('dragging');
    const rect = main.getBoundingClientRect(), height = main.clientHeight - timeline.offsetHeight;
    const move = e => setShare(stacked() ? (e.clientY - rect.top) / height : (e.clientX - rect.left) / rect.width);
    const up = () => { divider.classList.remove('dragging'); divider.removeEventListener('pointermove', move); divider.removeEventListener('pointerup', up); divider.removeEventListener('pointercancel', up); };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up);
    divider.addEventListener('pointercancel', up);
  });
  divider.addEventListener('dblclick', () => setShare(DEFAULT));
  divider.addEventListener('keydown', event => {
    const step = event.shiftKey ? 0.1 : 0.05;
    const moves = { ArrowLeft: -step, ArrowUp: -step, ArrowRight: step, ArrowDown: step };
    if (event.key in moves) { event.preventDefault(); setShare(share + moves[event.key]); }
    else if (event.key === 'Home') { event.preventDefault(); setShare(MIN); }
    else if (event.key === 'End') { event.preventDefault(); setShare(MAX); }
  });
  addEventListener('resize', layout);
  layout();

  return {
    get open() { return open; },
    setOpen(value) { open = Boolean(value); layout(); },
    layout,
  };
}
