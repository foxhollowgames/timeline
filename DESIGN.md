# Wayfinder Timeline: design

Wayfinder Timeline is an explorable globe with a timeline scrubber. It spans from the Creation to today. It places the events of the scriptures beside major events of world history, so a reader can see what else happened at the same time.

It is a timeline explorer, not a reader. Cards may quote one short verse and link to the full chapter in the Wayfinder readers.

The decisions below were settled in a design interview on 2026-10-18. The question numbers from that interview are given as (Q1), (Q2), and so on.

## 1. Product and stack

- **A fourth Wayfinder volume (Q1).** Repository `foxhollowgames/timeline`. The repository is public (Q2).
- **Live path.** `wayfinder.josephnewelldesign.com/timeline/`. GitHub Pages publishes `dist/` after each push to `main`. The Wayfinder hub gets a card for it.
- **Stack.** The stack is the same as the other volumes: plain ES modules, no bundler, and no package dependencies to run. Node build scripts write `dist/`.
- **Globe base.** A fork of the conference globe (`Conference Mind Map/conference-map/dist/globe.js`). It uses three.js with OrbitControls, vendored locally. It keeps the Earth texture, atmosphere, graticule, stars, zoom, pinch, idle spin, focus motion, and pin clustering.
- **Shared Wayfinder files.** The menu and modal drag come from `Wayfinder/viewer/`, synced the same way as the other volumes.
- **Local run.** `npm start` serves on 127.0.0.1 port 4175. The Bible and D&C volumes use 4173, and the Book of Mormon uses 4174.
- **Name and writing (Q35).** The display name is "Wayfinder Timeline." All new text follows the Bible repository's `WRITING-GUIDE.md`. The check script enforces the 15-word sentence rule.

## 2. Time span and scrubber

- **Span (Q3).** From 4000 BCE (the Fall of Adam in the Church Bible Chronology) to 2026 CE.
- **Scale (Q3).** The scale is non-linear, and users can zoom with the wheel or a pinch on the strip. The default view compresses 4000–2000 BCE and 100–1800 CE. It expands 2000 BCE–100 CE and 1800–2026 CE.
- **Notation (Q14).** BCE and CE. BCE years are negative integers in data, as in the Bible repository.
- **Active window (Q6).** The scrubber selects one year. An event is active when its date or range overlaps a window around that year. The window is about 2% of the visible timeline width, so it narrows as the user zooms in.
  - Active pins show at full strength.
  - Pins just behind the scrubber fade as a trail.
  - Future pins are hidden.
- **Navigation (Q6, Q12).** There is no play button. Users drag the scrubber or type a year, as in the conference globe. Arrow keys step through time. The previous and next event buttons jump to the nearest scripture event.
- **Strip contents (Q33).**
  - A density bar shows the number of events in each period.
  - A scripture era lane shows eras such as Patriarchs, United Kingdom, Divided Kingdom, Exile, Ministry of Jesus, Nephite era, and Restoration.
  - A world era lane shows eras such as Bronze Age, Iron Age, Classical, Medieval, Early Modern, and Modern.
  - Selecting an era label jumps the scrubber to that era.

## 3. Scripture events

### Source and unit

- **Imported, not rewritten (Q17, Q18).** Scripture events come from the three Wayfinder repositories. One chapter, or one D&C section, is one event. A chapter with no places is skipped and gets no pin (Q4).

| Volume | Repository | Events in repo | With places | Places stored as |
| --- | --- | --- | --- | --- |
| Bible | `bible` | 1,135 | 766 | latitude and longitude |
| Book of Mormon | `book-of-mormon` | 239 | most | Sorenson miles, or latitude and longitude for the Old World stage |
| D&C | `doctrine-and-covenants` | 140 | 140 | latitude and longitude |

- **Sync (Q21).** `scripts/import.mjs` fetches each volume's `dist/data` files from GitHub at a pinned commit. It saves the files to `scripts/source/<volume>/` and converts them to `dist/data/events.json`. To take in fixes from a sibling repository, move its pinned commit forward and rebuild.
  - Bible: `dist/data/books/<id>-native-content.json`, which supplies `events`, `chapterMaps`, `places`, `textRoutes`, `campaigns`, `chapterStudies`, and `chapterDateBands`.
  - Book of Mormon: `dist/data/content.json`, which supplies `chapterMaps`, `places`, `routes`, and `dateLabel`. The Old World places come from `scripts/old-world.mjs`, which stores latitude and longitude.
  - D&C: `dist/data/sections.json` and the section study files, which supply the date, month, and place received.
- **Pin placement (Q19).** The pin sits at the chapter's first focus place. When the event is selected, its other places show as small dots and its routes are drawn.
- **Pearl of Great Price (Q23).** Left out of version 1. It will be added later as its own batch of about 20 events.

### Dates

The primary date follows the Church chronology (Q10). The repository's scholarly date shows on the card as a "Scholarly estimate" line where the two differ materially.

The Church Bible Chronology does not give a year for every era. These rules fill the gaps:

| Era | Primary date | Source |
| --- | --- | --- |
| Genesis 1–11 | No year. The event goes in the "Years not given" band (Q25) | Church chronology gives the order only |
| Abraham to Joshua | Scholarly range, shown as a range bar. The card states that the Church chronology gives the order only (Q25) | Bible repo `chapterDateBands` |
| Judges | Scholarly range | Bible repo. The Church chronology calls these dates "very uncertain" |
| Saul to the exile | The Church chronology's revised column, which is built from Assyrian inscriptions. The biblical-number year goes on the card as a note (Q26) | Church Bible Chronology appendix |
| Prophetic books | The prophet's lifetime (setting), not the composition theory. For example, Isaiah 40–66 is about 740–700 BCE and Daniel 7–12 is in the 500s BCE (Q27) | Church chronology. The repo's composition date becomes the scholarly line |
| Exile to the New Testament | Church chronology, which is close to the scholarly dates | Church Bible Chronology appendix |
| Book of Mormon | Church-edition chapter dates | `book-of-mormon/scripts/chapter-dates.tsv` |
| Ether (Jaredites) | No year. The event goes in its own order-only band in the Book of Mormon panel. The band ends where Coriantumr is found by the people of Zarahemla in Omni 1:21 (Q29) | Ether has no dates in the Church edition |
| D&C | Exact dates of the sections | D&C repository |

- **Override file.** These rules live in `scripts/date-overrides.json`, keyed by volume, book, and chapter range. Each row names its source. The build stops when an imported chapter matches no rule.
- **Uncertainty.** A range shows as a bar on the strip. A circa date shows "c." on the card.

### The "years not given" band (Q28)

- The band appears on the strip as one shaded block. It sits before the first dated scripture event.
- When the scrubber is anywhere inside the band, all of its pins show at once.
- World-history pins inside the band's span still show. No "Also at this time" links are made between them and the band's pins.
- **Placement in the band (Q15).**
  - Adam-ondi-Ahman: pinned in Daviess County, Missouri, citing D&C 107:53 and D&C 116.
  - Tower of Babel: pinned at Babylon and labeled "traditional site."
  - Eden and the Creation: no pin.

## 4. World history and Church history

- **New writing (Q22).** The repositories have no world-history data except Isaiah's 12 events. These events are written from scratch.
- **Scope (Q5).** Global history, as broad as responsible sources allow, including Mesoamerica (Olmec and Preclassic Maya).
  - Tier 1 (about 60 events) always shows, for example the Giza pyramids, Hammurabi, Alexander, the Han dynasty, and the printing press.
  - Tier 2 (about 200 events) shows as the user zooms the timeline in.
- **Sourcing (Q13).**
  - Every event cites at least one reputable reference: Britannica, a museum or university page, or a Wikipedia article that cites the date.
  - An uncertain date uses "c." and a range.
  - The check script fails on an event with no source.
  - The check script prints a count per region: Africa, the Americas, East Asia, South Asia, Middle East, Europe, and Oceania. This is a warning, not a quota.
- **Church history after 1847 (Q36).**
  - One curated batch of about 60 events from 1847 to 2026, with the same sourcing rules.
  - Examples: the arrival in the Salt Lake Valley, the first missions abroad, and temple dedications.
  - From 1851 onward, the card also links to the conference globe for that year.
- **Batches (Q22, Q36).** World history comes in six era batches, and Church history is batch 7. Each batch is one pull request, and the user reviews each one.
- **Data file.** `scripts/history/<batch>.json`. Each event has `id`, `title`, `start`, `end`, `dateLabel`, `tier`, `region`, `placeId` or `lat` and `lng`, `summary`, and `sourceIds`.

## 5. Globe and pins

- **Base map (Q16).** The conference globe's Earth texture, with no political borders in version 1. Ancient empire areas come in a later version. They may reuse the Bible repository's `regions`.
- **Scripture pins (Q30).** Solid fill, with one hue per volume: Old Testament, New Testament, Book of Mormon, and D&C with Church history. The hues are chosen with the dataviz palette method and checked for contrast on the dark globe.
- **History pins (Q5).** Smaller, hollow, and grey. They are secondary to scripture pins.
- **Legend.** A small corner legend shows both pin styles and the four volume hues.
- **Clustering.** Clustering uses the conference globe's method. Scripture pins rank above history pins in a group.
- **Filters and search (Q31).**
  - Toggles turn each volume and world history on or off.
  - A search box finds events, places, and people.
  - Choosing a result moves the scrubber and focuses the globe.

## 6. Event card (Q8, Q24)

- The card shows the title, date label, scholarly estimate line if any, and summary.
- **Verse.** One verse of about 40 words or fewer.
  - Bible: the key verse the repository already selected in `chapterStudies`, from the World English Bible.
  - D&C: the close-reading verse.
  - Book of Mormon: the first verse that names the focus place.
- **In scripture.** Citation links into the Wayfinder readers, plus a "Read the chapter" link.
- **Sources.** The source list for the event.
- **Also at this time.** The nearest events of the other kind, history for a scripture event and scripture for a history event.
- **Map details.** The event's other places and its routes, drawn on the globe.

## 7. Book of Mormon panel (Q7, Q11, Q32)

- **Separate map.** The Book of Mormon uses its own map because its geography is relative and not placed on real land. The map is Sorenson's mile grid with the relief tiles from the `book-of-mormon` repository.
- **Old World on the globe.** 1 Nephi 1–17 happens in the Old World, so those events go on the globe at real coordinates.
- **Layout.** A split view with a draggable divider.
  - Desktop: side by side.
  - Phone in portrait: globe on top, Book of Mormon map below.
  - The default split is 55/45 with the globe larger. There is no bottom sheet.
- **One scrubber.** Both views follow the same scrubber and window.
- **Default state.** The panel starts off. When the window contains Book of Mormon events, a chip reads "Book of Mormon events in this period: show map."
- **Empty state.** When the panel is open and the window has no Book of Mormon events, the panel shows the nearest event in each direction as jump buttons.
- **No history pins.** History pins never show on the Book of Mormon map.

## 8. Links (Q34)

- The address holds the state, for example `#year=-701&event=isaiah-36`. Any view can be shared.
- After launch, each Wayfinder reader gets a "See on timeline" link for each chapter. That is one small pull request per sibling repository.

## 9. Build order (Q37)

Each milestone is one pull request.

1. Repository scaffold, this document, and the conference-globe fork showing an empty globe and scrubber.
2. The import pipeline from the three repositories, `date-overrides.json`, and the check script.
3. Pins, clustering, cards, filters, search, and links in the address. After this step the timeline is usable with scripture only.
4. The Book of Mormon split panel, including the Ether band.
5. World-history batches 1–6, then Church-history batch 7.
6. Deploy to `/timeline/`, add the hub card, then add the "See on timeline" links in the sibling repositories.

## 10. Checks

`npm run check` must pass before each merge. It checks these rules:

- Every imported chapter has a date rule.
- Every event has a place on land and a known volume or region.
- Every history event has at least one source.
- Every cited source ID exists.
- Every quoted verse matches the volume's local text.
- No sentence in new text has more than 15 words.
- A count per region is printed as a warning.

## Sources for the design

- Church Bible Chronology appendix: <https://www.churchofjesuschrist.org/study/scriptures/bible-chron/introduction>
- Wayfinder repositories: <https://github.com/foxhollowgames/Wayfinder>
- Sorenson, *Mormon's Map* (FARMS, 2000), as used by the `book-of-mormon` repository.
