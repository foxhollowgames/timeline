# Wayfinder Timeline

Wayfinder Timeline is a globe with a timeline. It will place the events of the scriptures beside world history. The full plan is in [DESIGN.md](DESIGN.md).

This is milestone 1 of 6. It shows the globe and the timeline strip. No events are loaded yet.

## Run locally

Node.js is the only requirement. Nothing needs installing.

1. Double-click **Start Wayfinder Timeline.cmd**, or run `npm start` in this folder.
2. Open <http://127.0.0.1:4175>.

The Bible and D&C volumes use port 4173. The Book of Mormon uses 4174. All four can run at once.

## Use the timeline

- Drag or tap the strip to choose a year.
- Type a year in the box, such as `701 BCE`, `33 CE`, or `1830`.
- Scroll on the strip to zoom it. Pinch to zoom on a touch screen.
- Use Shift and scroll, or drag the thin bar under the strip, to move along it.
- Press the left and right arrow keys to step through time. Hold Shift for bigger steps.
- Press plus or minus to zoom. Press 0 or select **All years** to see the whole span.

The strip is not drawn to one scale. It gives more space to 2000 BCE–100 CE and to 1800–2026. The striped spans, 4000–2000 BCE and 100–1800 CE, are compressed.

The gold band around the selected year is the active window. Events in this window will show on the globe. The window is about 2% of the visible strip, so it narrows when you zoom in.

## Files

| File | Purpose |
| --- | --- |
| `dist/index.html` | The page |
| `dist/app.js` | Joins the globe and the strip |
| `dist/globe.js` | The globe scene, forked from the conference globe |
| `dist/globe-detail.js` | High-detail Earth tiles, copied from the conference globe |
| `dist/scrubber.js` | The timeline strip |
| `dist/time-scale.js` | Year math: the warped scale, zoom, ticks, and BCE/CE dates |
| `scripts/serve.mjs` | The local server |
| `scripts/check.mjs` | Script and time-scale checks |

Data years use negative numbers for BCE, as the Bible volume does. The year 701 BCE is `-701`. There is no year 0.

## Check

```text
npm run check
```

## Credits

Earth imagery is NASA's Blue Marble: Next Generation. The 3D graphics use three.js under the MIT license. See `dist/assets/CREDITS.txt`.
