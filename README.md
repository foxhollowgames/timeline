# Wayfinder Timeline

Wayfinder Timeline is a globe with a timeline. It will place the events of the scriptures beside world history. The full plan is in [DESIGN.md](DESIGN.md).

This is milestone 2 of 6. The globe and the timeline strip work. The scripture events are imported and dated. The strip shows where they fall, and the event buttons step through them. Pins and cards come in milestone 3.

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
- Select **Previous event** or **Next event** to jump to the nearest scripture event.

The strip is not drawn to one scale. It gives more space to 2000 BCE–100 CE and to 1800–2026. The striped spans, 4000–2000 BCE and 100–1800 CE, are compressed.

The bars show how many events fall at each point. The gold band around the selected year is the active window. The window is about 2% of the visible strip, so it narrows when you zoom in.

The block marked **Years not given** holds Genesis 1–11 and Adam-ondi-Ahman. The Church chronology gives their order, not their years. All of them count as active while the selected year is inside the block.

## Update the data

The scripture events come from the three Wayfinder repositories. `scripts/sources.json` pins the commit used from each one.

```text
npm run import
npm run build
npm run check
```

- `npm run import` downloads the pinned files into `scripts/source/`. That folder is not committed.
- `npm run build` writes `dist/data/events.json` and `dist/data/details/<volume>.json`. It stops when a chapter has no date rule.
- `npm run check` tests the scripts, the time scale, and the data.

To take in a fix from a Wayfinder repository, change its commit in `scripts/sources.json`. Then run all three commands.

### Dates

`scripts/date-overrides.json` holds one rule for each run of chapters. The first matching rule wins. DESIGN.md section 3 explains the rules. Each rule names a basis:

| Basis | Meaning |
| --- | --- |
| `church` | Years from the Church chronology. `evidence` names the table rows, and the check confirms them. |
| `ministry` | A prophet's lifetime. A repository date inside it is kept. |
| `scholarly` | The Church chronology gives no year, so a scholarly range is used. |
| `not-given` | No year. The event goes in an order-only band. |
| `edition`, `section` | Book of Mormon and D&C dates. |
| `skip` | No pin. `reason` says why. |

`scripts/curated-events.json` adds events that no chapter supplies, such as Adam-ondi-Ahman.

### What the checks cover

- Every chapter with places became an event or has a skip rule with a reason.
- Every year is in range, and no range runs backward.
- Every place exists. Globe places are within 15 km of land.
- Every quoted verse matches its source text.
- Every Church rule matches a row in the Church chronology table.
- New text keeps each sentence to 15 words or fewer.

## Files

| File | Purpose |
| --- | --- |
| `dist/index.html` | The page |
| `dist/app.js` | Joins the globe, the strip, and the event data |
| `dist/globe.js` | The globe scene, forked from the conference globe |
| `dist/globe-detail.js` | High-detail Earth tiles, copied from the conference globe |
| `dist/scrubber.js` | The timeline strip |
| `dist/time-scale.js` | Year math: the warped scale, zoom, ticks, and BCE/CE dates |
| `dist/events.js` | Which events fall in the window, and the event-button stops |
| `dist/data/` | Built event data. Do not edit by hand |
| `scripts/import.mjs` | Downloads the pinned inputs |
| `scripts/build-events.mjs` | Builds `dist/data` |
| `scripts/check.mjs`, `scripts/check-data.mjs` | The checks |
| `scripts/serve.mjs` | The local server |

Data years use negative numbers for BCE, as the Bible volume does. The year 701 BCE is `-701`. There is no year 0.

## Credits

Earth imagery is NASA's Blue Marble: Next Generation. The 3D graphics use three.js under the MIT license. Land outlines for the checks come from Natural Earth. See `dist/assets/CREDITS.txt`.
