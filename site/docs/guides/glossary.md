# Glossary

The terms Debrief uses in its interface, tools and documentation. The [language section](style-guide/language.md) of the style guide says when to use them.

Adapted from `DOMAIN_GLOSSARY.md` in debrief/debrief-future, itself adapted from legacy Debrief's glossary, and corrected to the SRD. The changes are listed [at the end](#changes-from-the-earlier-glossary).

## Data

**Plot.** The unit of analysis: one exercise serial or deployment period, its tracks, annotations, sensor observations and narrative, with the history of every change made to it. Stored as GeoJSON in a STAC catalogue (SUB-05).

**Plot file.** The one file that holds a plot: its content, its island and its whole history. Send it to a colleague and the history goes with it, undo included; they add it to a catalogue with **Add a plot file…**. Other GeoJSON tools can read it (SUB-07, SUB-19).

**Catalogue.** A folder of plots, sources and supporting files, described in STAC. Each catalogue holds data of one protection level (SEC-02).

**Source.** A file imported into Debrief, such as a REP file or a legacy plot. Debrief never changes a source; a revision arrives as a new source (SUB-10). A catalogue keeps its sources, but they don't travel with a plot file: the plot's first step holds what was imported, and its history names each source.

**Supporting file.** Video, imagery, acoustic files and other content that is not geographic data, kept beside a plot (SUB-06).

**History** (in guides, **provenance**). The record of every operation that produced a plot: imports, tool runs, edits and deletions, with who or what made them (SUB-18 to SUB-24). Kept in the plot file, all of it, always.

**Step.** One change in a plot's history: what made it, who, when, and what it changed. A step is in the plot, undone (can be redone) or replaced by a later change (kept on record) (SUB-19, SUB-21).

**Checksum** (in guides). A short fingerprint of some data that changes if the data does. Each step of a plot's history carries one covering the step and the step before, and the current step records the checksum of the plot's content, so a history altered outside Debrief is noticed. The island is outside every checksum (SUB-19).

**Time window.** The period of the plot being looked at, one for the whole plot. Sensor data is shown only within it (CAP-28, CAP-29). Saved with the plot, but not part of its history: changing it is never undone.

**Saved window.** The time window as saved in the plot. A tool that moves current time outside it shows a wider or moved window instead, without saving it; the time controller says so, with **Keep** to save the window shown and **Revert** to show the saved window again (CAP-28).

**Context tracks.** Each track's whole line outside the time window, drawn thin and quieter so the whole picture stays in view. A plot draws them visible (at least 3:1 against the map), faint or hidden (CAP-29).

**Island** (in guides). View state saved inside the plot file, so it travels with the plot, but outside its history: never recorded, never undone. The time window is the first. Everything else in a plot, a track's colour and what is hidden included, is part of its history (SUB-22).

**Feature.** Anything in a plot: a track, an annotation, or a set of sensor observations. Used where a statement covers all three, as in "Plot features" in the outline; otherwise name the kind.

**Fix.** A single timestamped position of a platform, with course, speed and depth where known. Depth is positive down.

**Track.** The movement of one platform over time: its fixes in order.

**Annotation.** A line, area, circle, ellipse, label, marker, note or period of interest drawn on or attached to a plot, or chart furniture such as the north arrow (CAP-03). An annotation with only a time, such as a note or a period, has no position (CAP-04). How it looks (colour, line, fill, label) is part of the plot: changing it is a step in its history. Write *annotation*, not *shape*, in the interface.

**Circle, ellipse** (annotations). Every position at one range from a centre; or an ellipse about a centre, its longer axis along a true bearing. Ranges are measured along geodesics. Kept in the plot file with their exact centre and size, and a polygon approximating them so other GeoJSON tools see the area (CAP-03).

**Handle.** A small square or circle on an annotation or a track selected on the map, dragged (or moved with the arrow keys) to change it: a corner, the point between two corners, a centre, a radius, an ellipse's axis end or side; a track's move and rotate handles, and its pivot. Letting go is one step.

**Pivot.** The position a track is rotated about. Each fix keeps its range from the pivot; its bearing from the pivot turns. Unless the analyst chooses, the fix nearest current time (CAP-01).

**Split, merge** (tracks). Splitting a track at a time makes two tracks, the fixes before it and the fixes from it on; merging joins tracks into one in time order, and is refused where they overlap in time. Each is one step (CAP-01).

**Jump.** A fix the platform could not have reached in time from the last good fix before it: faster than a threshold speed, unless the analyst says three times the track's median speed, at least 10 kn. Jumps are found and shown first; those the analyst confirms are removed as one step (CAP-01).

**Smoothing.** Moving each fix of a track, or of a period of it, to the average position of itself and the same number of fixes either side, the first and last fixes staying where they are. Previewed first; applied as one step (CAP-01).

**Marked fix.** A fix with a colour, a label or a comment of its own, as legacy plots carry. Found by its time, so the mark stays with its fix whatever else changes. Each change is one step (CAP-01, EXT-14).

**Fix list.** A track's fixes in time order, each with its time, position, course, speed and any mark, for choosing one fix to colour, label or comment on.

**Chart furniture.** What a chart carries besides its data: the scale bar, always drawn, and the north arrow, which a plot shows or not.

**Timeline.** The view listing a plot's time-only annotations, such as narrative notes and periods of interest, in time order. Choosing an entry moves current time to it (CAP-05). The SRD calls it the temporal view.

**Named set.** A saved selection of features, reusable as a selection or as a tool's input (TL-11).

**Narrative.** The log of events from each platform, imported from Word or PDF and combined on one time axis (CAP-19, CAP-20).

**Serial.** A period of an exercise, typically 4, 6, 12 or 24 hours.

## Sensors and TMA

**Sensor.** A device on a platform that observes others: sonar, radar or visual.

**Sensor observations** (**contacts**, **cuts**). Measurements from a sensor, in Debrief usually bearings. Weeks of them may be held as one set (CON-02).

**Bearing.** The direction from one position to another, measured clockwise from true north. A **relative bearing** is measured from the platform's own heading. Debrief displays true bearings as three figures: `045.0°T`.

**Ambiguous bearing.** A towed-array bearing that could be on either side of the array: two candidate bearings mirrored about the array's axis. The analyst resolves each to one side (CAP-22).

**Bearing error.** The uncertainty of a bearing, where the sensor data supplies it. Debrief can draw such a bearing as a wedge of that width (CAP-22).

**TMA** (target motion analysis). Estimating a target's course and speed from bearings, typically bearing-only from passive sonar. A **solution** is rooted in a selected period of bearings, and its positions match the bearing times (CAP-21).

**Residual.** The difference between a measured bearing and the bearing to the solution at the same time. Small, unpatterned residuals suggest a good solution.

**Leg.** A period of steady conditions. An **ownship leg** has steady course and speed; a **bearing leg** has a steady bearing rate. Changes of ownship leg give the geometry TMA needs.

**SATC** (semi-automatic track construction). Generating a TMA solution automatically from bearings. Lower priority than manual TMA (CAP-21).

## Analysis

**Tote.** The table of relative geometry between one primary and several secondary platforms at current time: range, bearing and other measures (CAP-06).

**Measure group.** A named, reusable set of measures for a mode of analysis, defined by a study's lead analyst. The Tote is a view onto one (CAP-07).

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
