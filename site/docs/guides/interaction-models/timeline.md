# Timeline and narrative

How an analyst reads a plot's narrative along with a replay: narrative entries from every platform, with time-only notes and periods and the comments on fixes, in one time-ordered list, the Timeline; how it follows current time without fighting the reader; how entries are chosen, filtered, searched, added, changed and deleted; and how narrative is held and imported.

The product owner decided on 15 Oct 2026 that narrative is read in the Timeline, not a view of its own: one list on one Zulu time axis, which data coverage joins later (CAP-05, CAP-08).

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-05 | An optional temporal view shows narrative entries, time-only annotations and data coverage per source; choosing an entry moves current time to it. |
| CAP-19 | Narrative is imported from Word and PDF in the legacy parsers' dialects (part B). |
| CAP-20 | Narratives from several platforms are combined on a single Zulu time axis. |
| EXT-14 | A legacy .dpf plot's narrative is imported, as far as the data model allows. |
| NFR-06 | Usable with 12,000 narrative entries scaled by three to five: the stress bound. Typical narratives are a few hundred entries (product owner, 15 Oct 2026). |
| NFR-13 | Everything works from the keyboard, and by touch. |
| SUB-19, SUB-21 | Every change is a recorded step; undo replays to the step before. |
| SUB-04 | Times are written by the formatting service, in the analyst's settings. |

## Narrative entries

1. **An entry is a feature of its own.** Kind `narrative`, with no geometry, as a time-only annotation has: its `time` (UTC, to the millisecond), its `source` (who wrote it: a platform, a person or a document, such as *BLUE ONE*; legacy Debrief's track name on an entry), its `entry_type` (the source's own kind of entry, free text: legacy logs use *GenComment*, *Posn*, *CSD*, *FCS*; the sample uses *Course*, *Sonar*, *CPA*, *Log*), its `text` (which may run to several lines) and the track it belongs to, `track_id`, where there is one. Schema 0.0.19.

    One feature an entry, not one feature holding a whole log: each entry added, changed or deleted is then one small step in the history, holding that entry alone. A log of 12,000 entries held as one feature would put all 12,000 into the history at every change.
2. **The plot's narrative is every narrative entry in it.** There is no narrative layer to create first: entries from a REP file, a legacy plot, the sample's script and the analyst's own typing are one narrative. A legacy plot's narrative layers are kept as named sets of their entries, with the layers' names, as its annotation layers are.
3. **One Zulu time axis, one order.** By time; at one time by source, ignoring case (and between sources differing only in case, capitals first); from one source at one time, in the plot's order, which is the order its log gave them. Two platforms' entries at one second therefore always come in the same order, whichever log was imported first, and a log's own order at one second is kept. Legacy Debrief sorted entries at one time by source, then type, then text, which put a log's own order at one second out of order, and dropped entries alike in all four; both are kept here. Python and TypeScript are held to the same cases, `schemas/vectors/narrative-order.json`.
4. **Notes and narrative are kept apart.** The sample's scripted log, and a legacy plot's narrative entries, were time-only note annotations before schema 0.0.19; they are narrative entries now. A note the analyst adds through the annotation form stays an annotation: the analyst's own remark, with a name, a style and perhaps a period, drawn by the annotation tools, hidden or shown like any annotation. Both are listed in the Timeline.
5. **Belonging to a track.** An entry imported or added belongs to the plot's track of its source's name, ignoring case and spacing, where there is exactly one; the form and agents may choose another, or none. A track deleted since leaves the link, which is then ignored.

## Importing narrative

6. **REP files.** `;NARRATIVE:` lines (date, time, source, text) and `;NARRATIVE2:` lines (date, time, source, type, text) are read as legacy Debrief's `ImportNarrative` and `ImportNarrative2` read them: fields separated by spaces or tabs; the source, and a type, in quotes where they hold spaces; the text the rest of the line, tabs kept, trimmed; dates in the same 1950 to 2049 window as fixes. As in legacy Debrief, a `;NARRATIVE:` line has no type: an unquoted source with a space, *HMS TORBAY*, reads as the source *HMS* and the text *TORBAY…*. Unlike legacy Debrief, text run on after a closing quote is kept for the next field rather than dropped with the quote. A line that cannot be read is listed with its number and why. A REP file of narrative alone makes a plot.
7. **Into the plot already open.** **Read narrative into this plot (REP)…** (on the Timeline's title bar in VS Code; *A narrative into the open plot* under *Import your own* in the playground; `debrief/import_narrative` for agents) reads a second platform's log into the open plot as one step: the file is kept in the plot's item as a source, read-only and hashed, the step's record names the importer, its version and that source, and it lists what was not read (fix lines, which belong to an import as a plot of their own, and lines that could not be read). Undo takes the whole log out again.
8. **Legacy plots (.dpf).** Narrative entries come in with their time, source, type and text; the entry type, which the Phase 2 import listed as not imported, is kept.

## The Timeline

9. **One component, every host.** VS Code shows the Timeline as a view in the Debrief sidebar; the playground shows the same component in its Timeline panel, which folds away like every side panel. It replaced a native tree, which could not search, filter, follow current time without taking the keyboard, or hold sixty thousand entries.
10. **A quiet table.** Column headings once, *Time*, *Source*, *Type*, *Entry*; then a row an entry, with nothing labelled in the rows:

    | Time | Source | Type | Entry |
    | --- | --- | --- | --- |
    | *15 Jun 2023* | | | |
    | `08:29:00Z` | ● BLUE ONE | Sonar | Bow sonar contact, bearing 277.0°T. Classifying. |
    | `08:30:00Z` | ● BLUE ONE | Course | Came to 215.0°T, 10.0 kn. |
    | `08:58:00Z` | EXCON | Log | Permission granted. |

    - The time in the editor's monospaced font, written by the formatting service in the analyst's settings; a day's date heads its first entry.
    - The source, with its track's colour where it belongs to one; the type quieter; the text wrapping, with its line breaks.
    - A note shows its name as its source and *Note* as its type, a period *Period* and *Until …* before its text, a fix comment its track and *Fix*. One hidden on the map says so.
    - Entries outside the time window are drawn fainter: still read, still chosen.
    - Where the list is narrow (VS Code's sidebar, the playground's side column, a phone), time, source and type are one line and the text goes under them, aligned with the source, so the time is a gutter down the left. The page never scrolls sideways.
11. **Following current time.** The entry current time is at (the last at or before it, among those listed) is marked by a bar in the theme's highlight and a quiet ground. As current time moves, while playing or stepping or from a tool, the list keeps that entry in sight: it scrolls only when the entry leaves the middle of the view (its top tenth to three quarters down), and then puts it a third of the way down, so what comes next is seen below it. It never moves the keyboard, and never animates, so a reader is not pulled about.

    The reader always wins. Scrolling the list (wheel, touch, scrollbar) or moving through it with the keyboard stops it following. **Follow time** then appears in the bar, with an arrow towards where current time is (↑ or ↓); it starts following again and brings the entry into sight. Choosing an entry also starts following again, since current time moves to it, and so does pressing **Play** (product owner, 15 Oct 2026): playing is asking to read along. Scrolling away while it plays stops it following again, as at any other time; pausing leaves it as it is.

    Following starts afresh, at current time, when another plot is opened; the same plot shown again after a change (an entry added, an undo) keeps the reader's place. The host says which plot it is (`plot_id` on `show_timeline`).
12. **Choosing an entry** (click, tap, `Enter` or `Space`) moves current time to it, or to the start of a period. Outside the window shown, the window widens or moves to take it in, shown but never saved, exactly as for a tool's time, with **Keep** and **Revert** on the time controller (CAP-28). Where several entries share a second, the one chosen is the one marked, not the last of them.
13. **Filter and search.** **Filter** opens checkboxes, with counts, for each kind (*Narrative*, *Notes and periods*, *Fix comments*), source and type; unticked ones are left out, and **Filter (2)** says how many are. **Show all** puts them back. The search box finds text in an entry's text, source or type, ignoring case, and marks it; `Escape` clears it. Under the list, *12 entries of 120* while anything is left out. The filter and the search are the reader's own (product owner, 15 Oct 2026), kept in the page (VS Code's webview state; the browser's storage in the playground, every read and write guarded), never in the plot: two analysts reading one narrative want different filters, and neither changes what the plot says. Following and current time work among the entries listed. Agents filter for themselves (`debrief/narrative`); `debrief.timelineEntries` answers for the whole plot, so its `current` is the entry current time is at among all of them, which is the row the reader sees marked unless their filter leaves it out.
14. **Adding, changing and deleting an entry.** **+** (or `N` with the list focused; **Add narrative entry…** in VS Code) opens a short form above the list: *Time* (starting at current time, in any of the analyst's notations: `09:30Z`, `15 Jun 2023 09:30:00Z`, `150930Z JUN 23`), *Source* and *Type* (each suggesting those the plot has), *Track* (following the source's name until chosen) and *Entry*. **Edit** and **Delete** appear on the row being worked with (the one chosen, or the keyboard's), so the list stays quiet; `F2` or double-click changes, `Delete` deletes. Each is one step, named in the History view (*Narrative entry by BLUE ONE at 08:40:00Z added*, *…: text changed*, *… moved to 08:41:00Z*, *… deleted*), undone like any other: **Undo** in the History view, or `Ctrl+Z` (in the playground anywhere but a text box; in VS Code with the map, the Outline or the History view focused, as for every step). Deleting from the keyboard keeps its place, on the entry after the one deleted. A form that cannot be saved says why and stays open; a change made elsewhere meanwhile is never overwritten (SUB-28).
15. **On the map.** The entry current time is at, where it belongs to a track, is shown beside that track's square: its source in bold and the start of its text, in a small box in the theme's colours, never in the way of the pointer, to the left where the right is short of room. It goes when ten minutes of plot time pass with no later entry for a track, so an entry long past does not linger. The map is never sent the narrative itself: a plot may hold sixty thousand entries.

    **Narrative on the map**, a box under the list, turns it off and on (product owner, 15 Oct 2026). It is the plot's choice, not the reader's: kept in the plot's island (`PlotView.narrative_on_map`, left out meaning on), like the Tote's *Lines on the map*, so it travels with the plot file; never a step, never undone (SUB-22). A colleague's change meanwhile is never overwritten (SUB-28).
16. **The outline** has one row, *Narrative: 120 entries from 3 sources*, which shows the Timeline; the entries are not listed there one by one (product owner, 15 Oct 2026: kept as it is).

### What is a step, and what isn't

| | Step in the history | Undone by `Ctrl+Z` |
| --- | --- | --- |
| Adding, changing or deleting an entry | Yes, one each | Yes |
| Reading a REP file's narrative into the plot | Yes, one for the file | Yes |
| Choosing an entry (current time) | No | No |
| Filtering, searching, following | No (the reader's own, in the page) | No |
| Narrative on the map, off or on | No (the plot's island) | No |

### Keyboard and touch

| In the Timeline | Keys | Touch |
| --- | --- | --- |
| Move through the list (stops following) | `Up`, `Down`, `Page Up`, `Page Down`, `Home`, `End` | swipe |
| Move current time to the entry | `Enter` or `Space` | tap |
| Change the entry | `F2` or `E` | tap it, then **Edit** |
| Delete the entry | `Delete` | tap it, then **Delete** |
| Add an entry | `N` or `Insert` | **+** |
| Search | `/`; `Escape` clears; `Down` back to the list | the box |
| Close the form | `Escape`; `Ctrl+Enter` saves | **Cancel** |

The list is a listbox for screen readers: each entry read with its full date and time, its source, type and text; the keyboard's place is its active option, the entry current time is at its current one (`aria-current="time"`).

## Scale (NFR-06)

Typical narratives are a few hundred entries; the product owner rarely sees more (15 Oct 2026). That case must be quick, and is:

| Where | What, at 2,000 entries | Time |
| --- | --- | --- |
| Python, desktop | One entry changed; undone | about 20 ms; 10 to 20 ms |
| Playground (Pyodide) | A 2,000-line log read into an open plot and shown | 0.8 s |
| Playground | An entry added through the form, saved, the plot opened again and the list shown; undone the same way | 190 to 250 ms; 220 to 250 ms |

The playground's round trip is mostly the plot opened again after the step (read from Python, the map and every panel redrawn), as for any step: 115 to 160 ms with 36 entries.

The stress bound stays the legacy sample's 12,000 entries scaled by three to five, measured with 60,000 synthetic entries:

| Where | What | Time |
| --- | --- | --- |
| Python, desktop | One step adding all 60,000; the plot file 20 MB, 35 MB with its history | 1.4 to 2.5 s |
| Python, desktop | One entry changed; undone (12,000 entries: 0.11 s; 0.08 s) | 0.7 to 1.0 s; 0.5 to 0.6 s |
| Python, desktop | Ordered; a query by source and text (`debrief/narrative`) | 0.2 to 0.6 s; 0.3 s |
| Timeline logic | Ordered; filtered, rowed and laid out; searched | 50 ms; 40 ms; 13 ms |
| Playground (Pyodide) | A 60,000-line log read into an open plot and shown | 8 to 30 s |
| Playground | The list built; rows drawn | 20 to 90 ms (0.4 s on a busy machine); 15 to 20 |
| Playground | Scrolling by the wheel: time between frames | p50 and p95 16.7 ms (60 a second) |
| Playground | A search through all of them | 30 to 60 ms |

A change rewrites the whole plot file, history included, and checks it whole before it is written: that is the design (one file, history included, 13 Oct 2026), and at 60,000 entries it costs most of a second. The review of 15 Oct halved it with small changes (the plot's period read from its earliest and latest times only; a plain narrative entry checked by hand before its JSON is hashed; the file read and hashed once a change, not twice); anything more, such as checking or hashing only what changed, is not worth building for narratives of a few hundred entries.

Only the rows in sight are drawn (with 400 px above and below), each measured once drawn; the rest are estimated from their text's length and the column's width, and the row at the top of the view stays put when estimates become measurements. Two things made the Python side fast enough: JSON Schema checks each feature against its own kind's class (narrative entries by an exact hand-written check that is never more lenient than the schema, a test holds it to that), instead of trying every feature class in turn (37 s for 20,000 entries before, 1 s after); and a history keeps the plot it built while the file is unchanged.

```mermaid
sequenceDiagram
    participant A as Analyst
    participant T as Timeline
    participant H as Host
    participant P as Python
    H->>T: show_timeline (entries in order, tracks, time)
    loop while playing
        H->>T: set_time
        T->>T: mark the entry at current time; scroll only if it left the middle
    end
    A->>T: scrolls the list
    T->>T: stop following; show Follow time
    A->>T: chooses an entry
    T->>H: timeline_chosen
    H->>H: current time to the entry (widen the window, never saved)
    A->>T: adds an entry in the form
    T->>H: save_narrative
    H->>P: debrief/add_narrative
    P-->>H: one step, new base
    H->>T: show_timeline, narrative_saved
```

## Narrative from Word and PDF: part B (CAP-19)

Part A leaves the model ready for legacy Debrief's Word and PDF parsers (`ImportNarrativeDocument`, `ImportRiderNarrativeDocument`, `ImportASWDataDocument`, `ImportWord_LEGACY`). They produce what an entry holds: a time to the minute, a platform (the source), a type (*FCS*, *N/A*, a dialect's own, or the Rider document's fixed source), and text, often running over several paragraphs. Part B needs:

- the text of `.doc`, `.docx` and PDF under Python, in the browser too (a pure-Python reader, or text extracted on the desktop only, saying so in the playground: CON-10);
- the dialects' parsing, ported with their tests on synthetic documents: comma-separated entries with a four- or six-figure DTG, day, month, year, platform and type; short entries taking the date and platform from the one before; text continuing the entry before; day markers (`dd MMM yy`); the corrections for a day that goes backwards after a cut and paste, and for an entry written just after midnight about the evening before;
- the questions legacy Debrief asked, asked by the host and passed to the importer: which types to import (with counts), only entries within the plot's period or all, and which track an unknown platform is (skipping *HMS*, *USS* and the like before matching names);
- FCS entries (fire-control solutions: bearing, range, course, speed, classification) made into TMA solution positions on the platform's track, which waits for TMA solutions in the data model (Phase 4, D stream); until then, kept as narrative and listed as not imported;
- reading into the open plot as one step with the document as its source, through the same path as a REP file's narrative (`debrief_io.narrative.import_narrative`, `Catalogue.add_narrative_entries`).

## Reference implementation

- **Model and Python:** schema 0.0.19's `NarrativeFeature`, `NarrativeProperties` and `NarrativeSpec` in `schemas/linkml/features.yaml`, the Timeline's messages and `TimelineEntry` in `schemas/linkml/messages.yaml`; `debrief_stac.narrative` (order, query, build, describe) and `Catalogue.add_narrative`, `edit_narrative`, `delete_narrative`, `add_narrative_entries`; `debrief_io.rep.parse_narrative` and `debrief_io.narrative.import_narrative`; the service methods `debrief/narrative`, `debrief/add_narrative`, `debrief/edit_narrative`, `debrief/delete_narrative` and `debrief/import_narrative`.
- **The Timeline:** `vscode/webview/timelinecontrol.ts` (the component), `vscode/webview/timelinelogic.ts` (filter, current entry, rows, layout, following), `vscode/src/timeline.ts` (the entries from a plot, in order; the entry on the map), `vscode/src/panels/timelineview.ts` (VS Code's view), `vscode/play/host.ts` and `narrative` in `vscode/play/play.py` (the playground).
- **Tests:** `python/debrief-stac/tests/test_narrative.py`, `python/debrief-io/tests/test_rep_narrative.py`, the service's in `python/debrief-tools/tests/test_service.py`; `vscode/test/unit/timeline.test.ts`; the playground's `vscode/test/play/narrative.mjs`, played by `vscode/test/play/play.mjs`; the narrative steps of `vscode/test/integration/suite.ts`.
