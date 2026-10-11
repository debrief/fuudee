# Language

**North Star:** say what an analyst would say: plain British English, glossary terms, never software jargon.

Applies to every word a person reads: labels, messages, tool explanations (CAP-24), walkthroughs, blog posts and these guides. It builds on the [glossary](../glossary.md) (DEV-07).

## Spelling and tone

- British English: colour, analyse, behaviour, centre, licence (noun), metres. Not "color", "analyze".
- Plain and direct. Prefer the active voice and short sentences. Address the analyst as "you" in help and walkthroughs.
- Sentence case for headings, labels and buttons: "Add annotation", not "Add Annotation".
- Name things by what they are to an analyst, not how they are built (PRN-07, CAP-24).

## Terms

Use the glossary term. These replacements come up most often:

| Write | Not | Why |
| --- | --- | --- |
| plot | document, file, dataset | A plot is the unit of analysis (SUB-05). |
| track | polyline, line feature | |
| fix | point, record, row | |
| annotation | shape, drawing, markup | Shapes are one kind of annotation (CAP-03). |
| catalogue | repository, database, index | The STAC catalogue (SUB-15); British spelling. |
| source | input file, raw file | Imported sources are never modified (SUB-10). |
| tool | function, plugin, script | |
| history | provenance log, audit trail | In the interface. "Provenance" is fine in guides and the tool-author guide. |
| undo to here | revert, roll back | Undo is replay to a point (SUB-21). |
| current time | playhead, cursor | Shared state (SUB-26). |
| bearing | azimuth, heading | Heading is the platform's own direction. |

Abbreviations analysts already use (TMA, CPA, SATC, DR, OTG, DTG, AIS) need no expansion in the interface; expand them once in help text.

## Numbers, units and times

Display always goes through the formatting service (SUB-04), in Python or its TypeScript twin; never format a value any other way. Rounding is half away from zero. Its defaults are this guide's defaults:

| Quantity | Default | Example |
| --- | --- | --- |
| Speed | knots, one decimal | `12.3 kn` |
| Range and distance | nautical miles, two decimals | `4.25 nmi` |
| Bearing | three figures, true, one decimal | `045.0°T` |
| Position | degrees and decimal minutes | `50°20.120'N 004°07.210'W` |
| Time | Zulu | `09:30:05Z` |
| Date and time | day month year, Zulu | `11 Oct 2026 09:30:05Z` |
| Date-time group | military DTG | `110930Z OCT 26` |
| Local time, if chosen | offset from UTC | `10:30:05 UTC+1` |

- Put a space between a number and its unit (`12.3 kn`), but none before `°`.
- Times are Zulu unless the analyst chose a display zone, which is shown as an offset from UTC (`10:30:05 UTC+1`), never an abbreviation such as BST. Never write a time without its zone.
- Use the analyst's chosen units everywhere, including in tool explanations: write "the window, in the units you have chosen", not "the window in metres".

## Messages

Say what happened, why, and what the analyst can do next. Never blame the analyst. Never show a stack trace or an internal identifier.

| Write | Not |
| --- | --- |
| Closest approach failed: NELSON and LATE do not overlap in time. | Error: ValueError in closest() |
| Spacing must be at most 100 nmi. | Validation failed: maximum exceeded |
| The plot changed while the tool was running, so its result was not saved. Run it again. | Conflict (409) |
| Imported 3 tracks, 135 fixes. Some content was not imported. | Import completed with warnings |

- **Counts read naturally.** Write "1 plot" and "3 plots", never "1 plots".
- **Nothing is dropped silently (EXT-14).** Say what wasn't done, and where to see the detail.

## Tool explanations (CAP-24)

Written from the first four core tools.

- **Explanation.** One sentence on what the tool does, starting with a verb: "Draws rings at equal ranges around a track's position at a chosen time."
- **Judgement.** Only where the result involves one. Say what to check: "Distance runs straight between fixes, so a gap in the track shortens it. Check for gaps before relying on distance run or mean speed."
- **Parameter titles.** Short, sentence case, and a noun: "Spacing", "Number of rings", "Time". Each parameter's explanation says what it changes, in the analyst's units.
- **New feature names.** Name them so an analyst can find them in the outline: "NELSON 1.5 nmi", "Closest approach NELSON – BLUE".

**The check (DEV-10).** `npm run check:language`, run in CI, reads the **Not** column of the terms table above and fails on any of those words in the extension's interface text.
