# Timeline and narrative

How an analyst reads a plot's narrative along with a replay: narrative entries from every platform, with time-only notes and periods and the comments on fixes, in one time-ordered list, the Timeline; how it follows current time without fighting the reader; how entries are chosen, filtered, searched, highlighted, added, changed and deleted; and how narrative is held and imported, from REP files, legacy plots, and Word and PDF documents.

The product owner decided on 15 Oct 2026 that narrative is read in the Timeline, not a view of its own: one list on one Zulu time axis, which data coverage joins later (CAP-05, CAP-08).

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-05 | An optional temporal view shows narrative entries, time-only annotations and data coverage per source; choosing an entry moves current time to it. |
| CAP-19 | Narrative is imported from Word and PDF in the legacy parsers' dialects, ported to Python with their tests. |
| EXT-04 | Narrative documents: Word and PDF, several dialects. |
| CON-09, CON-10 | The playground runs the same Python in the browser; a capability it lacks is explained, never failed at the point of use. |
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
7. **Into the plot already open.** **Read narrative into this plot (REP, Word, PDF)…** (on the Timeline's title bar in VS Code; *A narrative into the open plot* under *Import your own* in the playground; `debrief/import_narrative` for agents) reads a second platform's log into the open plot as one step: the file is kept in the plot's item as a source, read-only and hashed, the step's record names the importer, its version and that source (and for a document its dialect and the analyst's choices), and it lists what was not read (fix lines, which belong to an import as a plot of their own, and lines that could not be read, each with why). Undo takes the whole log out again. A Word or PDF document is read in legacy Debrief's dialects, the analyst asked first what legacy Debrief asked: see [Word and PDF documents](#word-and-pdf-documents-cap-19). **Import plot file (REP, .dpf, Word, PDF)…** makes a plot of a document's narrative alone, as of a REP file's.
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
14. **Adding, changing and deleting an entry.** **+** (or `N` with the list focused; **Add narrative entry…** in VS Code) opens a short form above the list: *Time* (starting at current time, in any of the analyst's notations: `09:30Z`, `15 Jun 2023 09:30:00Z`, `150930Z JUN 23`), *Source* and *Type* (each suggesting those the plot has), *Track* (following the source's name until chosen) and *Entry*. **Edit** and **Delete** appear on the row being worked with (the one chosen, or the keyboard's), so the list stays quiet; `F2` or double-click changes, `Delete` deletes. Each is one step, named in the History view (*Narrative entry by BLUE ONE at 08:40:00Z added*, *…: text changed*, *… moved to 08:41:00Z*, *… deleted*), undone like any other: **Undo** in the History view, or `Ctrl+Z` (`Cmd+Z` on macOS) from the Timeline itself, as from the map, the Outline or the History view, except in the search box and the form's text boxes, where it undoes the typing (product owner, 15 Oct 2026). `Ctrl+Shift+Z` or `Ctrl+Y` redoes. Deleting from the keyboard keeps its place, on the entry after the one deleted. A form that cannot be saved says why and stays open; a change made elsewhere meanwhile is never overwritten (SUB-28).
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
| Highlights, text size, wrapping, columns, the choosing switch | No (the reader's own, in the page) | No |
| Reading a Word or PDF narrative into the plot | Yes, one for the document | Yes |
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
| The reader's view (highlights, choosing, text, columns) | `Tab` to **⋯**, `Enter`; `Escape` closes | **⋯** |
| Close the form | `Escape`; `Ctrl+Enter` saves | **Cancel** |
| Undo or redo the plot's last step | `Ctrl+Z`; `Ctrl+Shift+Z` or `Ctrl+Y` (`Cmd+Z`, `Cmd+Shift+Z` on macOS), anywhere in the Timeline but a text box | **Undo** in History |

The list is a listbox for screen readers: each entry read with its full date and time, its source, type and text; the keyboard's place is its active option, the entry current time is at its current one (`aria-current="time"`).

`Ctrl+Z` is decided in the Timeline's page as the key is pressed, against what has focus then: in a text box it is left to the text; elsewhere the page asks its host to undo (`undo_asked`, `redo_asked` in VS Code, which runs **Undo** as the map's `Ctrl+Z` does, and only when there is something to undo). A context key that a keybinding read would reach the page's host after focus had moved, so a `Ctrl+Z` straight after clicking into the search box could undo the plot.

### The reader's view: highlights, choosing, text and columns

17. **One small menu, so the bar stays quiet.** Legacy Debrief's Narrative viewer had extras the product owner kept (15 Oct 2026): phrases highlighted, an off switch for *choosing an entry moves current time*, the text's size and a wrap toggle, and which columns show. They are in a menu, **⋯** in the bar beside **Filter**, a box under the bar like the filter's, never a row of controls above the list:

    | In the menu | What it does |
    | --- | --- |
    | **Highlight** *words, phrases, separated by commas* | Each word or phrase is marked wherever it is in an entry's text, ignoring case: bold, underlined in the theme's highlight, so it is told from what the search found (shaded) without colour alone. The longest phrase at a place wins (*contact lost* whole, not *contact*); the search wins where the two meet. Twenty phrases at most. A row with one is read as *…, highlighted* by a screen reader. |
    | **Choosing an entry moves current time** | On, as before. Off, choosing an entry (click, tap, `Enter`) puts the keyboard's place on it, showing its **Edit** and **Delete**, and leaves current time, and the list's following, as they were: for reading back through a log while a replay holds its place. |
    | **Wrap long entries** | On, as before. Off, each entry is one line, cut with an ellipsis; the whole text is still read by a screen reader and shown in the form. |
    | *Text 12px*, **A−**, **A+** | The list's text from 11 to 18 px; the bar and the menu keep theirs. |
    | *Columns*: **Time**, **Source**, **Type** | The columns shown; the entry's text always is. Narrow, with the time hidden, the text starts at the left edge. |

    **⋯** is drawn like **Filter (2)** when anything differs from the Timeline's own view. `Escape` closes the menu, back to its button. Like the filter, the view is the reader's own (product owner, 15 Oct 2026): kept in the page (VS Code's webview state; the browser's storage in the playground, guarded), never in the plot, never sent to the host. The page never scrolls sideways at any of these settings, at 210, 280 or 390 px, in a wider font than this machine's (the tests' check).

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

## Word and PDF documents (CAP-19)

Legacy Debrief read narrative from Word (`.doc`, `.docx`) and PDF in four dialects, in `Debrief.ReaderWriter.Word`. They are ported to Python in `debrief_io.word`, with the cases of their tests on synthetic documents (DEV-05: none of legacy Debrief's documents or their text is copied), and checked against legacy Debrief's own expectations on its sample documents where a checkout of it is at hand (`DEBRIEF_LEGACY`): the same 13, 5, 18, 364, 350, 371 and 285 entries, the same 15 Rider entries and 28 ASW positions.

| Dialect | Known by | Read as |
| --- | --- | --- |
| Narrative log (`ImportNarrativeDocument`, and `ImportWord_LEGACY` before it) | anything not below; `.doc`, `.docx` and PDF | An entry a paragraph, `DTG,day,month,year,platform,type,text`, the DTG `HHMM` or `DDHHMM`, the metadata usually hidden text. A short entry (`DDHHMM text`, `HHMM text`) takes the date and platform from the entry before, its type *FCS* if it starts with a track number, otherwise none (legacy *N/A*; the Timeline's filter lists entries with none as *(no type)*). Text alone continues the entry before, every line of it up to the next entry (product owner, 15 Oct 2026), so a PDF's long entry, a line a paragraph, is whole; past 2,000 lines, a runaway document, the rest is listed as not read. `12 Mar 20` marks a new day. `START OF RECORDS` and `END OF RECORDS FOR` bound the entries in a longer document. |
| Rider's narrative (`ImportRiderNarrativeDocument`) | a first table whose first cell is *DTG Start* | Its second row the start DTG (`220000Z JUL 09`, to the hour) and, fifth, the platform; from its fourth row an entry a row: time of day, bearing (`273`, `92/112`, an arc `096-112`, `No B`), beam, text. Every entry of type *Rider*, written `[Brg:92/112, Beam:12/13] text` as legacy Debrief wrote it. |
| ASW data (`ImportASWDataDocument`) | five `TMPOS` lines in its first hundred | Positions of one platform: a track, not narrative. Imported as a plot of its own, the track named as the analyst says (legacy Debrief asked); refused, saying so, when read into an open plot. `TIMPD` gives the year. |
| Dated narrative (`ImportWordDummy`) | a line `yyyy,MM,dd,HH:mm[:ss],` | Type, platform and text after the date. Legacy Debrief never offered it; read here rather than misread as a narrative log. |

The corrections legacy Debrief made are made, and said in the step's record: a day that goes backwards with no new month or year (a mangled cut and paste) keeps the day before; an entry at 23xx whose hidden day is one after its DTG's (logged just after midnight about the evening before) takes the DTG's day; a six-figure short entry whose day is earlier than the last is in the next month. FCS entries are read as legacy Debrief read them (bearing, range in kiloyards, yards or metres, course, speed, classification, track number, the solution's source) and kept as narrative: TMA solution positions on the platform's track wait for TMA solutions in the data model (Phase 4, D stream), and the record says how many there were. Rider bearings, which legacy Debrief also made sensor cuts, stay in the entry's text until sensor data comes.

Where this differs from legacy Debrief, deliberately: times are UTC throughout (legacy Debrief read some in the machine's time zone); a day or time that does not exist is listed, not rolled on (legacy's 31 April was 1 May); a long type missing its comma keeps its whole first word (legacy cut its last letter); every line continuing an entry is joined to it (legacy joined six, dropped the seventh and went on joining; product owner, 15 Oct 2026); a bad line or Rider row is listed with its number and why, and reading goes on (legacy stopped some imports at the first); a Rider log that passes midnight goes on into the next day (legacy kept the first day); an entry's type *N/A* is no type. A day marker's two-figure year follows the entries' rule (after 80, 19xx).

**What the analyst is asked**, as legacy Debrief asked, before a document is read into the open plot (`debrief/preview_narrative` says what the file holds, changing nothing):

- which types of entry to read, with how many of each, all ticked, when there are several;
- all entries, or only those within the plot's period (its tracks' first to last fix), when some fall outside;
- which of the plot's tracks a platform is, for each of up to five platforms with no track of their name (legacy Debrief's prefixes *HMS*, *Hms*, *USS*, *RNAS* and *HNLMS* are skipped before matching: *HMS BLUE ONE* is *BLUE ONE*'s).

An entry whose platform is matched to a track, by its name or by the analyst's answer, has the track's name as its source, and so its colour (product owner, 15 Oct 2026): *HMS BLUE ONE*'s entries are *BLUE ONE*'s. The name as the document wrote it is kept in the step's record (*9 entries written as from HMS BLUE ONE are BLUE ONE's*). A platform matched to no track keeps its name as written.

**The answers are remembered**, for each dialect, as the analyst's own setting (product owner, 15 Oct 2026): the types not read, whether only within the period, and the track (by name) each platform was said to be. In VS Code they are kept in the user's configuration file (debrief-config's `narrative_import`, configuration version 3), in the playground in the page's settings; never in a plot or a catalogue, and the importer is only given the answers. Next time a document of that dialect is read, they are offered: in VS Code a first Quick Pick, **Read as last time** with the answers in a line, chosen by `Enter`, or **Choose again**; in the playground the form comes filled in, the answers said above it, with **Read** taking the keyboard. A type not seen before is read; a platform not remembered, or whose track the plot has not, is asked about.

VS Code asks in Quick Picks, one after another; the playground in one form. An agent passes the answers to `debrief/import_narrative` (`types`, `within_period`, `tracks`, `platform`) or reads everything. A PDF of a log names no platform (its metadata was hidden text, not printed): its entries' source is the plot's one track, as legacy Debrief took it, or else the document's name, or `platform` where an agent gives it.

**Reading the files.** Documents come from elsewhere, so each reader has hard limits and refuses, saying which, what passes them rather than exhaust the host's memory or time: a file over 200 MB (before it is read into memory); a `.docx` whose zip directory is over 4 MB, whose text part unpacks to over 64 MB, or whose XML nests over 1,000 deep; a `.doc` claiming more text than its stream holds, or whose piece table is out of order; a PDF of over 10,000 pages, a page drawing over 4 MB of instructions or showing text over 20,000 times, a stream unpacking to over 32 MB, over 5 million operations in all, or taking over 60 seconds; and, for all, over 500,000 paragraphs or 20 million characters, far more than any narrative. `.docx` with the standard library (zip and expat, refusing document type declarations, as the `.dpf` reader does); `.doc` with olefile (pure Python, for the compound file), its text from the piece table and its tables' rows from the paragraph properties, read in `debrief_io.documents`; PDF with pypdf (pure Python), a line of text a line. A file is known by its first bytes, not its name: legacy Debrief met `.docx` files named `.doc`. All three run in Pyodide, so the playground reads Word and PDF too, in the browser; the Pyodide spike holds the browser's reading to the desktop's. A Word 6 or 95 document, a password-protected one, a damaged one, and a PDF with no text (a scan, which needs text recognition first) are refused, saying which. python-docx is used only to build the tests' synthetic documents.

## Reference implementation

- **Model and Python:** schema 0.0.19's `NarrativeFeature`, `NarrativeProperties` and `NarrativeSpec` in `schemas/linkml/features.yaml`, the Timeline's messages and `TimelineEntry` in `schemas/linkml/messages.yaml`; `debrief_stac.narrative` (order, query, build, describe) and `Catalogue.add_narrative`, `edit_narrative`, `delete_narrative`, `add_narrative_entries`; `debrief_io.rep.parse_narrative` and `debrief_io.narrative.import_narrative` (with `Choices`, and `preview_narrative`); Word and PDF in `debrief_io.documents` (reading the files), `debrief_io.word` (the dialects) and `debrief_io.document_import` (a document as a plot); the service methods `debrief/narrative`, `debrief/add_narrative`, `debrief/edit_narrative`, `debrief/delete_narrative`, `debrief/import_narrative` and `debrief/preview_narrative`.
- **The Timeline:** `vscode/webview/timelinecontrol.ts` (the component), `vscode/webview/timelinelogic.ts` (filter, current entry, rows, layout, following, which keys undo and where they are left to the text; the reader's view: highlights, text sizes, columns), `vscode/src/narrativeimport.ts` (what to ask before reading a document in, shared by both hosts), `vscode/src/timeline.ts` (the entries from a plot, in order; the entry on the map), `vscode/src/panels/timelineview.ts` (VS Code's view), `vscode/play/host.ts` and `narrative` in `vscode/play/play.py` (the playground).
- **Tests:** `python/debrief-stac/tests/test_narrative.py`, `python/debrief-io/tests/test_rep_narrative.py`, the dialects' `test_word.py`, `test_narrative_documents.py` and (with `DEBRIEF_LEGACY`) `test_word_legacy_samples.py`, on the synthetic documents of `synthetic_docs.py` and `tests/data`; the service's in `python/debrief-tools/tests/test_service.py`; Pyodide's reading held to CPython's in `spikes/pyodide`; `vscode/test/unit/timeline.test.ts` and `timelineview.test.ts`; the playground's `vscode/test/play/narrative.mjs` and `narrativeword.mjs`, played by `vscode/test/play/play.mjs`; the narrative steps of `vscode/test/integration/suite.ts`.
