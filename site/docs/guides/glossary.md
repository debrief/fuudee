# Glossary

The terms Debrief uses in its interface, tools and documentation. The [language section](style-guide/language.md) of the style guide says when to use them.

Adapted from `DOMAIN_GLOSSARY.md` in debrief/debrief-future, itself adapted from legacy Debrief's glossary, and corrected to the SRD. The changes are listed [at the end](#changes-from-the-earlier-glossary).

## Data

**Plot.** The unit of analysis: one exercise serial or deployment period, its tracks, annotations, sensor observations and narrative, with the history of every change made to it. Stored as GeoJSON in a STAC catalogue (SUB-05).

**Plot file.** The one file that holds a plot: its content, its island and its whole history. Send it to a colleague and the history goes with it, undo included; they add it to a catalogue with **Add a plot file…**. Other GeoJSON tools can read it (SUB-07, SUB-19).

**Catalogue.** A folder of plots, sources and supporting files, described in STAC. Each catalogue holds data of one protection level (SEC-02).

**Source.** A file imported into Debrief, such as a REP file or a legacy plot. Debrief never changes a source; a revision arrives as a new source (SUB-10). A catalogue keeps its sources, but they don't travel with a plot file: the plot's first step holds what was imported, and its history names each source.

In collation, a source is a **catalogue item**: an imported file, kept as a plot of its own, or any other plot in a catalogue, from which a plot takes data (decision, product owner, 16 Oct 2026).

**Supporting file.** Video, imagery, acoustic files and other content that is not geographic data, kept beside a plot (SUB-06).

**History** (in guides, **provenance**). The record of every operation that produced a plot: imports, tool runs, edits and deletions, with who or what made them (SUB-18 to SUB-24). Kept in the plot file, all of it, always.

**Step.** One change in a plot's history: what made it, who, when, and what it changed. A step is in the plot, undone (can be redone) or replaced by a later change (kept on record) (SUB-19, SUB-21).

**Checksum** (in guides). A short fingerprint of some data that changes if the data does. Each step of a plot's history carries one covering the step and the step before, and the current step records the checksum of the plot's content, so a history altered outside Debrief is noticed. The island is outside every checksum (SUB-19).

**Time window.** The period of the plot being looked at, one for the whole plot. Sensor data is shown only within it (CAP-28, CAP-29). Saved with the plot, but not part of its history: changing it is never undone.

**Saved window.** The time window as saved in the plot. A tool that moves current time outside it shows a wider or moved window instead, without saving it; the time controller says so, with **Keep** to save the window shown and **Revert** to show the saved window again (CAP-28).

**Context tracks.** Each track's whole line outside the time window, drawn thin and quieter so the whole picture stays in view. A plot draws them visible (at least 3:1 against the map), faint or hidden (CAP-29).

**Island** (in guides). View state saved inside the plot file, so it travels with the plot, but outside its history: never recorded, never undone. The time window is the first, and the Tote's choice of tracks another. Everything else in a plot, a track's colour and what is hidden included, is part of its history (SUB-22).

**Feature.** Anything in a plot: a track, an annotation, or a set of sensor observations. Used where a statement covers all three, as in "Plot features" in the outline; otherwise name the kind.

**Fix.** A single timestamped position of a platform, with course, speed and depth where known. Depth is positive down.

**Track.** The movement of one platform over time: its fixes in order.

**Annotation.** A line, area, circle, ellipse, label, marker, note or period of interest drawn on or attached to a plot, or chart furniture such as the north arrow (CAP-03). An annotation with only a time, such as a note or a period, has no position (CAP-04). How it looks (colour, line, fill, label) is part of the plot: changing it is a step in its history. Write *annotation*, not *shape*, in the interface.

**Circle, ellipse** (annotations). Every position at one range from a centre; or an ellipse about a centre, its longer axis along a true bearing. Ranges are measured along geodesics. Kept in the plot file with their exact centre and size, and a polygon approximating them so other GeoJSON tools see the area (CAP-03).

**Handle.** A small square or circle on an annotation or a track selected on the map, dragged (or moved with the arrow keys) to change it: a corner, the point between two corners, a centre, a radius, an ellipse's axis end or side; a track's move and rotate handles, its pivot, and the diamonds at its ends, to shear or stretch it. Letting go is one step.

**Pivot.** The position a track is rotated about. Each fix keeps its range from the pivot; its bearing from the pivot turns. Unless the analyst chooses, the fix nearest current time (CAP-01).

**Shear** (tracks). Holding one end of a track, or of its fixes in the time window, and dragging the other: every fix moves in proportion to its time from the held end, so a straight leg at a steady speed stays one, with a new course and speed. The drag analysts use most with TMA legs. One step (CAP-01, CAP-21).

**Stretch** (tracks). Holding one end and dragging the other along the track: every fix keeps its bearing from the held end and its range from it is scaled, so speeds change and courses do not. One step (CAP-01, CAP-21).

**Course made good, speed made good.** The course and speed of a period of a track taken from its first fix to its last: what a shear or a stretch reports and is given.

**Split, merge** (tracks). Splitting a track at a time makes two tracks, the fixes before it and the fixes from it on; merging joins tracks into one in time order, and is refused where they overlap in time. Each is one step (CAP-01).

**Jump.** A fix the platform could not have reached in time from the last good fix before it: faster than a threshold speed, unless the analyst says three times the track's median speed, at least 10 kn. Jumps are found and shown first; those the analyst confirms are removed as one step (CAP-01).

**Smoothing.** Moving each fix of a track, or of a period of it, to the average position of itself and the same number of fixes either side, the first and last fixes staying where they are. Previewed first; applied as one step (CAP-01).

**Marked fix.** A fix with a colour, a label or a comment of its own, as legacy plots carry, or one that always shows its time label or symbol whatever its track's intervals (force on only). Found by its time, so the mark stays with its fix whatever else changes. Each change is one step (CAP-01, CAP-32, EXT-14).

**Label, symbol and arrow intervals.** How often a track is labelled with the time, marked with a small dot in its colour and given a direction arrow: each from every second to every 24 hours, or off (labels and symbols also at every fix, legacy *All*), held by the track (not its fixes) and set for several tracks at once as one step. Drawn on whole multiples of the interval of UTC (every 10 min is 0900, 0910, 0920), as legacy Debrief's symbol, label and arrow frequencies were, and thinned when zoomed out (CAP-32).

**Moving a fix** (a single fix). Putting one fix of a track somewhere else, alone: its time, its recorded course and speed, and every other fix stay. The speeds its new position implies, to reach it and to go on from it, are said. One step (CAP-01).

**OTG, DR** (over the ground, dead reckoning). How legacy Debrief plotted a track: OTG, each fix where it was logged; DR, from a start, each fix placed from the one before by the course and speed recorded there. Debrief asks which as each track is imported, unless the analyst said to use one choice for future imports (their setting, which they can clear); the mode is kept on the track, and changing it is one step (CAP-01). On a DR track an edit changes where it starts, or its courses and speeds, and the positions are worked out again; its positions, courses and speeds as logged are kept unchanged beside it (see [Track operations](interaction-models/track-operations.md#editing-a-track-plotted-by-dead-reckoning)).

**Fix list.** A track's fixes in time order, each with its time, position, course, speed and any mark, for choosing one fix to colour, label or comment on.

**Chart furniture.** What a chart carries besides its data: the scale bar, always drawn, and the north arrow, which a plot shows or not.

**Timeline.** The view listing a plot's narrative entries, time-only annotations (notes and periods of interest) and fix comments in one time order, on one Zulu time axis. Choosing an entry moves current time to it; it follows current time while playing, until the analyst scrolls it (CAP-05, CAP-20). The SRD calls it the temporal view. See [Timeline and narrative](interaction-models/timeline.md).

**Collation.** Putting a plot together from the catalogue items with data for it: seeing which item covers which periods, choosing which supplies each period of a platform, taking new data, and reviewing a plot when an item it drew from is revised. Done in the catalogue browser, Catalogues and Coverage (CAP-08 to CAP-12). See [Collation](interaction-models/collation.md).

**Catalogue item** (in collation, **item**). One entry of a catalogue: a plot, with its sources and files. Every import makes one, so an imported file and the analyst's working plot are both items.

**Coverage.** The periods a track has data for, from its first fix to its last, broken at gaps; for a plot, every source of data for each of its tracks, with those periods, side by side (CAP-08). Shown in Coverage and listed in the Timeline.

**Platform** (across items). The vessel or aircraft a track is of. Tracks in different items whose names match, ignoring case and spaces, are proposed as one platform; the analyst confirms, refuses, or links others by hand.

**Source preference.** Which catalogue item supplies each period of a track where more than one has data then: the analyst's choice, per period, one step each. The track is stitched from the chosen periods (CAP-09).

**New data.** A file imported into the catalogue after the plot, within the folders it draws from, sharing a platform with it and with data within its period, not yet taken or set aside (a colleague's copy of the plot, only once it adds data; never a plot made from it or from other items): marked with a sparkle and the words *New data* (CAP-10). Taking it is one step (CAP-11); **Not now** sets it aside until it is revised.

**Revision** (of a catalogue item). Its content after any recorded change, of data or details; known by the content's checksum, so undo brings a revision back. A plot with a period it took from an item at an earlier revision **may need review** until the analyst marks it **Reviewed** (CAP-12).

**Folder tree** (a plot draws from). The catalogue a plot is in, and the catalogues of the items it has taken data from: where its new data is looked for (CAP-10).

**Named set.** A saved selection of features, reusable as a selection or as a tool's input (TL-11).

**Narrative.** The log of events from each platform, imported from REP files, legacy plots and Word or PDF documents, and combined on one Zulu time axis (CAP-19, CAP-20). A plot's narrative is all its narrative entries; it is read in the Timeline.

**Narrative entry.** One entry of a narrative: its time, its source, its type, its text and, perhaps, the track it belongs to. A feature of its own, with no position; adding, changing or deleting one is one step. Not a note, which is the analyst's own annotation.

**Source** (of a narrative entry). Who wrote it: the platform, person or document whose log it is, such as *BLUE ONE*. Not *author* or *track*: an entry may belong to a track, but its source is who logged it.

**Entry type.** What kind of narrative entry it is, in its source's own words, such as *GenComment*, *CSD* or *Sonar*. Free text: each source has its own.

**Follow time.** The Timeline keeping the entry current time is at in sight as current time moves. It stops when the analyst scrolls the list or moves through it with the keyboard; **Follow time** starts it again.

**Dialect** (of a narrative document). One of the layouts legacy Debrief read narrative in from Word and PDF: a *narrative log* (an entry a paragraph, its date, platform and type comma-separated and usually hidden), a *Rider's narrative* (a table), *ASW data* (positions of one platform: a track, not narrative) and *dated narrative* lines. Debrief tells which from the document itself (CAP-19). See [Word and PDF documents](interaction-models/timeline.md#word-and-pdf-documents-cap-19).

**FCS** (fire-control solution). A narrative entry giving a contact's bearing, range, course, speed and classification. Kept as narrative; it becomes a TMA solution position when TMA solutions come (Phase 4).

**Highlighted phrases.** Words or phrases the analyst names in the Timeline's menu (**⋯**), marked wherever they are in an entry's text. Like the filter, text size, wrapping and the columns shown, the analyst's own: kept in their view, never in the plot.

**Serial.** A period of an exercise, typically 4, 6, 12 or 24 hours.

## Sensors and TMA

**Sensor.** A device on a platform that observes others: sonar, radar or visual.

**Sensor observations** (**contacts**, **cuts**). Measurements from a sensor, in Debrief usually bearings. Weeks of them may be held as one set (CON-02).

**Bearing.** The direction from one position to another, measured clockwise from true north. A **relative bearing** is measured from the platform's own heading; the Tote takes the primary's course as its heading, and writes relative bearings red to port and green to starboard: `R045.0°`, `G120.0°`. Debrief displays true bearings as three figures: `045.0°T`.

**Ambiguous bearing.** A towed-array bearing that could be on either side of the array: two candidate bearings mirrored about the array's axis. The analyst resolves each to one side (CAP-22).

**Bearing error.** The uncertainty of a bearing, where the sensor data supplies it. Debrief can draw such a bearing as a wedge of that width (CAP-22).

**TMA** (target motion analysis). Estimating a target's course and speed from bearings, typically bearing-only from passive sonar. A **solution** is rooted in a selected period of bearings, and its positions match the bearing times (CAP-21).

**Residual.** The difference between a measured bearing and the bearing to the solution at the same time. Small, unpatterned residuals suggest a good solution.

**Leg.** A period of steady conditions. An **ownship leg** has steady course and speed; a **bearing leg** has a steady bearing rate. Changes of ownship leg give the geometry TMA needs.

**SATC** (semi-automatic track construction). Generating a TMA solution automatically from bearings. Lower priority than manual TMA (CAP-21).

## Analysis

**Angle on the bow (AOB).** A track's aspect as another sees it: the bearing from the track to the observer less the track's course, red to port and green to starboard: `R030.0°` means the observer sees its port side. `000.0°` is bows on. In the Tote, the secondary's angle on the bow as the primary sees it.

**Bearing rate.** How fast a bearing changes, in degrees per minute, to the analyst's angle decimals: positive drawing right (clockwise), negative drawing left. Steady (zero) with both on a steady course and speed means a constant bearing, as on a collision course.

**Tote.** The table of relative geometry between one primary and several secondary tracks at current time: range, bearing and the other measures of a measure group (CAP-06). Which tracks it compares is saved in the plot's island, so it travels with the plot but is never a step in its history. See [Tote](interaction-models/tote.md).

**Primary, secondary** (the Tote). The primary is the track the others are measured from, usually ownship; each secondary is measured from it. A track is never both.

**Measure group.** A named, reusable set of measures for a mode of analysis, defined by a study's lead analyst. The Tote is a view onto one (CAP-07). Every group extends **core**: range, bearing, relative bearing, angle on the bow and bearing rate from the primary, and each track's course, speed and depth.

**Measure.** One quantity the Tote shows: between the primary and a secondary (range, bearing, relative bearing, angle on the bow, bearing rate) or of one track (course, speed, depth). Worked out in Python at current time, where the map places each track.

**Close range** (the Tote). A range under 1 nmi. Where the analyst's lengths are in nautical miles, the Tote writes it in whole yards, `60 yd`, as analysts call close ranges; from 1 nmi, in nautical miles.

**Reversal** (course). Recorded courses at two fixes that are opposite, within half a degree. There is no shorter way round between them, so the Tote does not interpolate: it takes the course of the fix nearer in time.

**CPA** (closest point of approach). The time and range at which two platforms are nearest.

**Current time.** The instant, within a time range, that every view follows. Shared state, with selection and viewport (SUB-26).

**Display window.** The earlier name for the [time window](#data), when each layer was to have its own. There is now one time window for the whole plot (CAP-28, decision 12 Oct 2026).

**Storyboard.** A sequence of map views, each with a time and narrative comments, exported as offline HTML, a PowerPoint quad chart or video (CAP-13, CAP-14).

**Tool.** An analysis operation written in Python: Debrief builds its form and offers it when it applies (section 6 of the SRD).

## Conventions

**Time.** Stored in UTC to the millisecond (SUB-01) and shown in Zulu time unless the analyst chooses a display zone.

**Position.** Latitude, positive north, and longitude, positive east, on WGS84. Debrief measures range and bearing along geodesics on the WGS84 ellipsoid, whatever the map's projection (SUB-03). Legacy Debrief used a flat-earth model, so its figures can differ by about 0.4% in range.

**Units.** Every stored quantity carries its unit. Analysts choose display units: knots, nautical miles, yards, metres, kilometres, degrees (SUB-02, SUB-04).

| Direction | Degrees | Radians |
| --- | --- | --- |
| North | 0° | 0 |
| East | 90° | π/2 |
| South | 180° | π |
| West | 270° | 3π/2 |

## Changes from the earlier glossary

| Earlier glossary | Now | Why |
| --- | --- | --- |
| Times have microsecond precision | Millisecond precision; finer legacy times are truncated on import and the truncation recorded | SUB-01, EXT-14 |
| Contacts carry frequency | Frequency is not imported; acoustic analysis stays in the acoustic replay application | CAP-22, EXT-03 |
| Speeds include feet per second | Knots, metres per second, kilometres per hour | Schema unit enums |
| Track segments: core, TMA, planning, infill | Not yet in the v4 data model; TMA solutions are rooted in a bearing period | CAP-21 |
| Depth in every location | Positions are latitude and longitude; a track may carry a depth series, positive down | Schema 0.0.4 |
| World Location, World Speed, World Distance, World Vector | Position, quantities with units | Implementation names, not domain terms |
| Plot is a collection of tracks | Plot is the unit of analysis, a GeoJSON FeatureCollection in a STAC catalogue | SUB-05 |
