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
- **Active window (Q6).** The scrubber selects one year. An event is active when its date or range overlaps a window around that year. The window is about 2% of the visible timeline width, so it narrows as the user zooms in, but it never reaches more than 10 years either side of the selected year.
  - Only active events get pins. Past and future pins are hidden.
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

- **Sync (Q21).** `npm run import` fetches the inputs pinned in `scripts/sources.json` into `scripts/source/`. That folder is git-ignored. `npm run build` converts it to `dist/data/events.json` and `dist/data/details/<volume>.json`. To take in fixes from a sibling repository, move its pin forward, then import and build again.
  - Bible: `dist/data/books/<id>-native-content.json` and `<id>-native-scripture.json`. They supply passages, chapter maps, places, routes, key verses, and date bands.
  - Book of Mormon: `dist/data/content.json` and `scripture.json`. Chapters with no focus place fall back to the places they mention. Old World places are converted back to latitude and longitude with the stage settings in `scripts/old-world.mjs`.
  - D&C: `content/sections/*.json`, the place files, `routes.json`, and the verse text.
  - The Church Bible Chronology pages, parsed into table rows, so the checks can confirm every cited year.
  - Natural Earth land, for the check that places are on land.
- **Shared place ids.** Books sometimes use one id for different spots, such as Succoth in Egypt and Succoth by the Jordan. When a later book's point is more than 25 km away, that book gets its own place key.
- **Curated events.** `scripts/curated-events.json` holds scripture events that no chapter supplies, such as Adam-ondi-Ahman (Q15). It also adds notes, such as Babel's traditional site.
- **Pin placement (Q19).** The pin sits at the chapter's first focus place. When the event is selected, its other places show as small dots and its routes are drawn.

### Events, not chapters (2026-10-18)

A pin is a scripture event, such as the scattering of the ten tribes. It is not a chapter. The event's card links the chapters that tell it. This replaces chapter pins era by era.

- **Batches.** Events are written by hand in `scripts/scripture/batch-N.json`, one era per batch. Each batch is one pull request, as with world history.

| Batch | Era | Covers | Status |
| --- | --- | --- | --- |
| 1 | The divided kingdom to the exile | 1 Kings 12–22, 2 Kings, 2 Chronicles 10–36 | 31 events |
| 2 | The prophets of the divided kingdom and the exile | Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah | 99 events |

- **Fields.** Each event has `id`, `volume`, `title`, `chapters`, and `summary`. It may add these:
  - `dateFrom`: the chapters that set its years.
  - `place`: the pin's place key.
  - `verse`: written as `<chapter id>:<verse>`.
  - `alsoRead`: references in other volumes, each with a short note.
  - `related` and `relatedNote`: hand-picked world history, as in section 4.
- **Dates and places.** By default the years span the linked chapters' dates. The pin sits at the first chapter's place. An event may write its own years, with a `dateLabel` and `sourceIds`.
- **Chapters lose their pins.** A chapter linked by an event, or inside a batch's `covers` range, gets no pin. It also leaves the density bar, the event buttons, and "Also at this time."
- **Chapters stay findable.** Search still finds each chapter. Its card lists the events it is part of under "Part of." Place and person lists show the event instead of its chapters.
- **Event card.** It leads with the title. "In scripture" lists its chapters, and each opens that chapter's card. "Also read" links other volumes, such as D&C 110:11 for the ten tribes. These links never change the event's years.
- **Readers.** `chapters.json` still lists chapter ids, so "See on timeline" opens the chapter's card. That card links to its event.
- **Not yet events.** Chapters outside every batch keep their own pins until their era's batch lands.
- **Pearl of Great Price (Q23).** Left out of version 1. It will be added later as its own batch of about 20 events.

### Dates

The primary date follows the Church chronology (Q10). The repository's scholarly date shows on the card as a "Scholarly estimate" line where the two differ materially.

The Church Bible Chronology does not give a year for every era. These rules fill the gaps:

| Era | Primary date | Source |
| --- | --- | --- |
| Genesis 1–11 | No year. The event goes in the "Years not given" band (Q25) | Church chronology gives the order only |
| Genesis 12–50 | Early 2nd millennium BCE (2000–1700 BCE). The card states that the Church chronology gives the order only (Q25) | Britannica, "Abraham". The Bible repo leaves these chapters undated |
| Exodus to Joshua | Scholarly range, shown as a range bar. The card states that the Church chronology gives the order only (Q25) | Bible repo `chapterDateBands` |
| Judges, Ruth, 1 Samuel 1–7 | Scholarly range | Bible repo. The Church chronology calls these dates "very uncertain" and gives no year before Saul |
| Saul to Solomon | The Church chronology's only column: Saul 1095, David 1055 and 1047, Solomon 1015–975 BC | Church Bible Chronology appendix |
| Divided kingdom to the exile | The revised column, which is built from Assyrian inscriptions (Q26). It starts at Rehoboam, 953 BC | Church Bible Chronology appendix |
| Prophetic books | The prophet's lifetime (setting), not the composition theory. For example, Isaiah 40–66 is 740–697 BCE and Daniel is 606–536 BCE (Q27). A repo date inside that lifetime is kept | Church chronology. The repo's composition date becomes the scholarly line |
| Ecclesiastes, Song of Solomon | Solomon's reign, following each book's first verse (Q27) | Church chronology |
| Psalms | Scholarly range, 1000–300 BCE. Marked `broad` because it spans more than 300 years | Bible repo |
| Exile to Malachi | Church chronology, which is close to the scholarly dates | Church Bible Chronology appendix |
| Gospels and Acts 1–7 | Scholarly range. The Church's New Testament table gives the order only: it lists the birth, ministry, and Crucifixion with no years | Bible repo |
| Acts 8–28 and Paul's letters | Church chronology, such as Paul's conversion in AD 35 and Romans in AD 55 | Church New Testament chronology |
| Book of Mormon | Church-edition chapter dates. Mosiah 27 and Helaman 11 are corrected here because the repo has typos | `book-of-mormon/scripts/chapter-dates.tsv`, checked against all 239 Church headings |
| Ether (Jaredites) | No year. The event goes in its own order-only band in the Book of Mormon panel. The band ends where Coriantumr is found by the people of Zarahemla in Omni 1:21 (Q29) | Ether has no dates in the Church edition |
| D&C | Exact dates of the sections | D&C repository |

- **Override file.** These rules live in `scripts/date-overrides.json`, keyed by volume, book, and chapter range. Each row names its source. The build stops when an imported chapter matches no rule. A Church rule lists the table rows it uses, and the check confirms each one.
- **Skipped chapters.** A skip rule removes a chapter that would mislead. Each one states its reason:
  - 1 Chronicles 1–9: the genealogies span many eras.
  - Job 40, Proverbs 7, Hebrews 11, 2 Peter 2, and Jude: each names its only place in a comparison or a retold story.
  - The rest of Proverbs and James: neither source gives a date.
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
  - Tier 2 (about 200 events) shows once the strip shows 1,500 years or fewer. The count line says how many are waiting. Opening a tier 2 event from search or a list zooms the strip in.
- **Sourcing (Q13).**
  - Every event cites at least one reputable reference: Britannica, a museum or university page, or a Wikipedia article that cites the date.
  - An uncertain date uses "c." and a range.
  - The check script fails on an event with no source.
  - The check script prints a count per region: Africa, the Americas, Central Asia, East Asia, South Asia, Southeast Asia, Middle East, Europe, and Oceania. This is a warning, not a quota.
  - Each event quotes the words in its source that carry the date. `npm run verify:sources` fetches each Wikipedia article and confirms every quote is in it. It records the article revision in `scripts/history/verified.json`.
  - `npm run check` fails when a Wikipedia-sourced event has not passed that verification. Britannica blocks scripted reading, so a Britannica source would be checked by hand.
  - The card shows the quote and links to the source.
- **Church history after 1847 (Q36).**
  - One curated batch of 45 events from 1847 to 2026, with the same sourcing rules. The plan said about 60. Each added event needed a quotable date in its source, and 45 cleared that bar.
  - It covers the arrival in the Salt Lake Valley, the auxiliaries, the Utah War and Mountain Meadows, statehood, temples as they reach each inhabited continent, the proclamations, and the presidents since 2018.
  - The batch file sets `"volume": "dc"`. Its events join the D&C volume, so they use the gold triangle pin and the D&C toggle. They need no tier or region.
  - Their date basis is `church-history`. The card reads "Date from the cited source", leads with the title, and shows the source quote as world history does.
  - The status line counts them as Church history events, apart from scripture.
- **Conference globe link (Q36).**
  - From 1851 onward, a D&C or Church history card can link to the conference globe at `#year=YYYY`.
  - The link is built but off. `dist/config.js` holds `CONFERENCE_GLOBE.url`, which is `null`.
  - It stays off for two reasons. The live conference globe needs a sign-in and returns 401 to visitors. It also does not read a year from its address yet.
  - Setting the url turns the link on with no other change.
- **Batches (Q22, Q36).** World history comes in six era batches, and Church history is batch 7. Each batch is one pull request, and the user reviews each one.

| Batch | Era | Status |
| --- | --- | --- |
| 1 | 4000–1000 BCE | 38 events |
| 2 | 1000 BCE–1 CE | 40 events |
| 3 | 1–1000 CE | 40 events |
| 4 | 1000–1500 CE | 44 events |
| 5 | 1500–1800 CE | 43 events |
| 6 | 1800–2026 | 49 events |
| 7 | Church history, 1847–2026 | 45 events |

- **Data file.** `scripts/history/batch-N.json`. Each event has `id`, `title`, `start`, `end`, `dateLabel`, `tier`, `region`, `place`, `lat`, `lng`, `summary`, and `source`. A source is `{ wiki, quote }` for Wikipedia, or `{ title, publisher, url, quote }` otherwise. `quote` may be a list when the start and end need separate quotes. Batch 7 adds a top-level `"volume": "dc"`, and its events leave out `tier` and `region`.
- **Display.** History pins are hollow grey hexagons, smaller than scripture pins, so shape and fill set them apart without color. In a group a scripture event always leads. History has its own legend toggle. The event buttons and the density bar follow scripture only.
- **Also at this time.** A card lists up to four events of the other kind whose dates fall within 150 years. Closer dates rank first, and short events rank above centuries-long eras. Order-only events get none (Q28).
- **Related history.** Ranking by years misses some clear links, such as D&C 87 and the Civil War. These are hand-picked in `scripts/curated-events.json`. An annotation's `related` lists history ids without the `h-` prefix. Its `relatedNote` gives the reason in one line. The build stops when an id is not a history event. Section 6 shows how the card uses them.

## 5. Globe and pins

- **Base map (Q16).** The conference globe's Earth texture, with no political borders in version 1. Ancient empire areas come in a later version. They may reuse the Bible repository's `regions`.
- **Scripture pins (Q30).** Each volume has its own hue and its own shape, so color is never the only cue. This covers color blindness. `dist/volumes.js` holds the values.

| Volume | Hue | Shape |
| --- | --- | --- |
| Old Testament | blue `#3987e5` | circle |
| New Testament | aqua `#199e70` | square |
| Book of Mormon | orange `#d95926` | diamond |
| D&C and Church history | olive `#b9b04a` | triangle |

  - The hues were checked with the dataviz validator on the globe surface `#060b16`, comparing every pair. The worst color-blind ΔE is 9.4, the worst normal-vision ΔE is 17.5, and every hue clears 3:1 contrast.
  - No four hues inside the validator's lightness band pass every pair. The olive sits above the band on purpose, because a lighter mark reads better on the dark globe.
  - Each shape has a 2px ring in the surface color.
- **History pins (Q5).** Smaller, hollow, and grey. They are secondary to scripture pins. They arrive in milestone 5 and will need a fifth shape.
- **Groups.** Events at one place, or within one pin width on screen, form one group. A group shows the lead volume's shape and a count. A mixed group adds a small second shape. Selecting a group opens a list.
- **Wide dates.** An event whose range spans more than 300 years, which today means the 48 placed Psalms, gets no pin. The count line names them, and search and place lists still find them.
- **Book of Mormon map events** are counted but not pinned on the globe. They wait for the panel in milestone 4.
- **Selection.** The selected event's group gets a gold ring. Its other places show as small gold dots, labeled where labels do not overlap. Its routes are drawn as gold arcs.
- **Legend and filters (Q30, Q31).** The legend in the header shows each volume's shape and name. Each entry is also a toggle that hides or shows that volume. Hidden volumes leave the pins, the counts, the density bar, and the event buttons. A world history toggle joins in milestone 5.
- **Search (Q31).** One box finds events by reference or title, places, and people. Choosing an event moves the scrubber, turns the globe, and opens its card. Choosing a place or a person opens a list of its events. People come from each repository's people data.

## 6. Event card (Q8, Q24)

- The card shows the title, date label, scholarly estimate line if any, and summary.
- **Verse.** One verse of about 40 words or fewer.
  - Bible: the key verse the repository already selected in `chapterStudies`, from the World English Bible.
  - D&C: the close-reading verse.
  - Book of Mormon: the first verse that names the focus place.
- **In scripture.** Citation links into the Wayfinder readers, plus a "Read the chapter" link.
- **Sources.** The source list for the event.
- **Also at this time.** The nearest events of the other kind, history for a scripture event and scripture for a history event.
  - Hand-picked related history comes first, marked "Linked", with its reason below the list. These links ignore the 150-year window.
  - The nearest events fill the rest, up to four in all. An event already linked is not listed twice.
- **Map details.** The event's other places and its routes, drawn on the globe.
- **Date lines.** The card names the date's basis. It adds the scholarly estimate, the Church table's biblical-number years, and any correction where they apply. A prophet chapter that keeps the repository's own date says so.
- **Lists.** A pin group, a place, or a person opens a list. Choosing an event in the list moves time to it, and a back link returns to the list.

## 7. Book of Mormon panel (Q7, Q11, Q32)

- **Separate map.** The Book of Mormon uses its own map because its geography is relative and not placed on real land. The map is Sorenson's mile grid with the relief tiles from the `book-of-mormon` repository.
- **Old World on the globe.** 1 Nephi 1–17 happens in the Old World, so those events go on the globe at real coordinates.
- **Layout.** A split view with a draggable divider.
  - Desktop: side by side.
  - Phone in portrait: globe on top, Book of Mormon map below.
  - The default split is 55/45 with the globe larger. There is no bottom sheet.
- **One scrubber.** Both views follow the same scrubber and window.
- **Default state.** The panel starts off, and so does the Book of Mormon pill in the volume legend. There is no chip or prompt to open it.
- **Empty state.** When the panel is open and the window has no Book of Mormon events, the panel shows the nearest event in each direction as jump buttons.
- **No history pins.** History pins never show on the Book of Mormon map.
- **How it is built.**
  - `npm run import` fetches the relief tiles, `relief.json`, and Leaflet 1.9.4 from `book-of-mormon` at the pinned commit.
  - `npm run build` copies the tiles to `dist/assets/bom-relief/` and writes `dist/data/bom-map.json`. That file holds the land outline, the Sidon, the named waters, the traced rivers, and the sea labels.
  - `dist/bom-map.js` loads Leaflet the first time the panel opens. Leaflet uses its flat CRS, with one unit per mile.
  - The panel reuses the globe's pin code. `dist/pins.js` draws on any view that can project a place to the screen.
- **Toggle and address.** The Book of Mormon pill in the volume legend opens and closes the panel: the pill is on exactly while the panel is open. The **Book of Mormon map** button beside the globe controls does the same. The address adds `bom=1` while the panel is open.
- **Divider.** Drag it, or focus it and use the arrow keys. Double-click resets it to 55/45. Each browser remembers its own split. Portrait screens stack the two views.
- **Card placement.** On desktop the card sits beside the panel, over the globe. On a stacked phone layout it covers the half that does not hold the selected event.
- **Selecting an event.** The panel opens if it is closed, and the map flies to the event's places. Closing the card zooms the map back out to the whole land.
- **The Jaredite band (Q29).** Ether's events have no years. They are active from the Tower of Babel, at the start of the primeval band, until Omni 1, where Coriantumr is found (130 BCE). Their pins have a dashed ring, and a note in the panel explains the band. While the panel is open, the strip shows the band as a thin top lane.

## 8. Links (Q34)

- The address holds the state, for example `#year=-701&event=isaiah-36`. Any view can be shared.
- After launch, each Wayfinder reader gets a "See on timeline" link for each chapter. That is one small pull request per sibling repository.
  - The build writes `dist/data/chapters.json`, the ids of the events that come from a chapter.
  - A reader fetches `../timeline/data/chapters.json`. It shows the link only on a listed chapter, under the chapter heading.
  - The Bible and the D&C share one reader, so the link is written once in the hub's `viewer/`. The Book of Mormon reader has its own copy.
  - The D&C sections page links each Official Declaration from its dialog.
  - The link opens `../timeline/#event=<id>`. With no year in the address, the timeline moves to the event.

## 9. Build order (Q37)

Each milestone is one pull request.

1. Repository scaffold, this document, and the conference-globe fork showing an empty globe and scrubber.
2. The import pipeline from the three repositories, `date-overrides.json`, and the check script.
3. Pins, clustering, cards, filters, search, and links in the address. After this step the timeline is usable with scripture only.
4. The Book of Mormon split panel, including the Ether band.
5. World-history batches 1–6, then Church-history batch 7.
6. Deploy to `/timeline/`, add the hub card, then add the "See on timeline" links in the sibling repositories. The hub card is a crop of the Earth texture centered on the Bible lands.

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
