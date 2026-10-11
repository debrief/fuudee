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

Display always goes through the formatting service (SUB-04); never format a value in a view or tool. Its defaults are this guide's defaults:

| Quantity | Default | Example |
| --- | --- | --- |
| Speed | knots, one decimal | `12.3 kn` |
| Range and distance | nautical miles, two decimals | `4.25 nmi` |
| Bearing | three figures, true, one decimal | `045.0°T` |
| Position | degrees and decimal minutes | `50°20.120'N 004°07.210'W` |
| Time | Zulu | `09:30:05Z` |
| Date and time | day month year, Zulu | `11 Oct 2026 09:30:05Z` |
| Date-time group | military DTG | `110930Z OCT 26` |

- Put a space between a number and its unit (`12.3 kn`), but none before `°`.
- Times are Zulu unless the analyst chose a display zone. Never write a time without its zone letter or name.
- Use the analyst's chosen units everywhere, including in tool explanations: write "the window, in the units you have chosen", not "the window in metres".

## Messages

*To be filled in Phase 1, with the first interaction models.* Will cover: what happened, why, and what the analyst can do next; never blame the analyst; never show a stack trace or an internal identifier.

## Tool explanations (CAP-24)

*To be filled in Phase 1, from the team's first tools.* Will cover: one sentence on what the tool does; one on any judgement it involves; how to name parameters.
