# Wayfinder Timeline

Wayfinder Timeline is a globe with a timeline. It places the events of the scriptures beside world history. It is live at <https://wayfinder.josephnewelldesign.com/timeline/>. The full plan is in [DESIGN.md](DESIGN.md).

All 6 milestones are done. The scripture events are on the globe as pins. Each pin opens a card with the event's date, summary, and key verse. Search, volume filters, and shareable links work. The Book of Mormon map opens beside the globe and follows the same timeline. World history covers 4000 BCE to 2026, with 254 sourced events. Church history adds 45 sourced events from 1847 to 2026. They show with the D&C pins.

## Run locally

Node.js is the only requirement. Nothing needs installing.

1. Double-click **Start Wayfinder Timeline.cmd**, or run `npm start` in this folder.
2. Open <http://127.0.0.1:4175>.

The Bible and D&C volumes use port 4173. The Book of Mormon uses 4174. All four can run at once.

## Deploy

GitHub Pages publishes `dist/` after each push to `main`. The workflow is `.github/workflows/deploy-pages.yml`, the same as the other volumes. The site appears at `/timeline/` on the Wayfinder domain because the repository is named `timeline`.

- Every path in `dist/` is relative, so the site works in a subfolder.
- The Wayfinder hub card uses `dist/assets/hub-card.jpg`.
- `npm run build` also writes `dist/data/chapters.json`. The Wayfinder readers fetch it and show "See on timeline" on each listed chapter. Bible and Book of Mormon ids are `book-chapter`, such as `isaiah-36`. D&C ids are `dc-N`, `od1`, and `od2`. The check confirms every chapter event follows these rules.

## Use the timeline

- Drag or tap the strip to choose a year.
- Type a year in the box, such as `701 BCE`, `33 CE`, or `1830`.
- Scroll on the strip to zoom it. Pinch to zoom on a touch screen.
- Use Shift and scroll, or drag the thin bar under the strip, to move along it.
- Press the left and right arrow keys to step through time. Hold Shift for bigger steps.
- Press plus or minus to zoom. Press 0 or select **All years** to see the whole span.
- Select **Previous event** or **Next event** to jump to the nearest scripture event.

## Use the globe

- Drag the globe to turn it. Scroll, pinch, or use the plus and minus buttons to zoom.
- Pins show the events in the active window. Faded pins ended a little earlier.
- Each volume has its own color and shape: Old Testament circle, New Testament square, Book of Mormon diamond, D&C triangle.
- A pin with a number holds several events. Select it to see the list.
- Select an event to open its card. Its other places and its routes show in gold.
- Select a volume in the header to hide or show it. **History** hides or shows world history.
- World history pins are hollow grey hexagons. Zoom the strip in to see the smaller events. A card's **Also at this time** lists events of the other kind from the same years.
- Search finds events, places, and people. Choose a result to go to it.
- The address keeps the year, the open event, hidden volumes, the strip zoom, and the open panel. Copy it to share the view.

## Use the Book of Mormon map

The Book of Mormon map is relative. It is not placed on real land. One unit is one of John L. Sorenson's estimated miles.

- Select the Book of Mormon pill in the volume legend to open or close it.
- Drag the divider to resize the two views. You can also focus the divider and use the arrow keys.
- The map follows the same timeline. With no events in the window, it offers the nearest event before and after.
- Ether's events have no years. They show from the Tower of Babel until Coriantumr is found in Omni 1, with a dashed ring.
- 1 Nephi 1–17 happens in the Old World, so those events stay on the globe.

The strip is not drawn to one scale. It gives more space to 2000 BCE–100 CE and to 1800–2026. The striped spans, 4000–2000 BCE and 100–1800 CE, are compressed.

The bars show how many events fall at each point. The gold band around the selected year is the active window. The window is about 2% of the visible strip, so it narrows when you zoom in. It never reaches more than 10 years either side of the selected year.

The block marked **Years not given** holds Genesis 1–11 and Adam-ondi-Ahman. The Church chronology gives their order, not their years. All of them count as active while the selected year is inside the block.

## Update the data

The scripture events come from the three Wayfinder repositories. `scripts/sources.json` pins the commit used from each one.

```text
npm run import
npm run build
npm run verify:sources
npm run images
npm run check
```

- `npm run import` downloads the pinned files into `scripts/source/`. That folder is not committed.
- `npm run build` writes `dist/data/events.json`, `dist/data/details/<volume>.json`, and `dist/data/search.json`. It stops when a chapter has no date rule.
- `npm run verify:sources` confirms each world-history quote is in its live source. Run it after you change a batch.
- `npm run images` saves one picture for each history event in `dist/assets/history/`. It needs the network. Run it after you add a history event.
- `npm run check` tests the scripts, the time scale, and the data.

### World history

World history lives in `scripts/history/batch-N.json`, one file per era. Batch 7 holds Church history after 1847. DESIGN.md section 4 gives the format and the sourcing rules. Each event quotes the words in its source that carry the date.

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
| `history`, `church-history` | Dates from the quoted source of a history batch. |
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
| `dist/globe-detail.js` | High-detail Earth tiles: local 2 km tiles, then NASA GIBS 500 m tiles when zoomed in close |
| `dist/scrubber.js` | The timeline strip |
| `dist/time-scale.js` | Year math: the warped scale, zoom, ticks, and BCE/CE dates |
| `dist/events.js` | Which events fall in the window, and the event-button stops |
| `dist/pins.js` | Pins, groups, and place markers on the globe |
| `dist/card.js` | The event card and the event lists |
| `dist/search.js` | The search box |
| `dist/volumes.js` | Each volume's hue and shape |
| `dist/address.js` | Reading and writing the address |
| `dist/data/chapters.json` | The chapter event ids the readers link to |
| `dist/config.js` | The conference globe link. It is off until its url is set |
| `dist/split.js` | The split between the globe and the panel |
| `dist/bom-map.js` | The Book of Mormon map |
| `dist/data/` | Built event data. Do not edit by hand |
| `scripts/import.mjs` | Downloads the pinned inputs |
| `scripts/build-events.mjs` | Builds `dist/data` |
| `scripts/check.mjs`, `scripts/check-data.mjs` | The checks |
| `scripts/serve.mjs` | The local server |

Data years use negative numbers for BCE, as the Bible volume does. The year 701 BCE is `-701`. There is no year 0.

## Credits

Earth imagery is NASA's Blue Marble: Next Generation. The 3D graphics use three.js under the MIT license. The Book of Mormon relief and shapes come from Book of Mormon Wayfinder, after Sorenson's *Mormon's Map* (2000). The flat map uses Leaflet under the BSD 2-Clause license. Land outlines for the checks come from Natural Earth. See `dist/assets/CREDITS.txt`.
