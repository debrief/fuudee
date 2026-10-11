# debrief-io

Importers that turn legacy formats into validated plots with provenance: REP fix lines (EXT-01) and legacy plot files, `.dpf` (EXT-14, EXT-15).

```python
from debrief_io import import_rep

report = import_rep(catalogue, Path("serial-01.rep"), title="Serial 1")
report.tracks  # ["NELSON", "HMS BLUE"]
report.omitted  # everything not imported, in words an analyst can act on
```

The import runs in four steps:

1. The fix lines are parsed into tracks, with speeds in knots, courses in degrees and a colour taken from the REP symbology.
2. One provenance record is made, naming the importer and its version, the source and its hash, and every omission (SUB-18). The whole plot is validated before anything is written.
3. The source is copied into a new catalogue item, read-only, and hashed (SUB-10, SUB-11), and the plot written. If writing fails, the new item is removed, so a failed import leaves the catalogue as it was.
4. Nothing is dropped silently. Each of these is listed, both in the report and in provenance:
   - other record types (`;SENSOR:`, `;NARRATIVE:` and so on), but not `;;` comment lines, which hold no data;
   - lines that could not be read;
   - tracks with a single fix;
   - depths of a track where some fixes give none, since a depth series has no gaps;
   - labels, which the data model does not yet hold;
   - times truncated to milliseconds.

## The REP reader

Ported from legacy Debrief's `ImportFix` and `DebriefFormatDateTime`, with their test cases:

- two-digit years in the fixed window 1950 to 2049, or four-digit years;
- short date and time fields padded with leading zeros;
- fractions of a second to microseconds, truncated to milliseconds (SUB-01);
- quoted track names; fields separated by spaces or tabs;
- decimal degrees, minutes or seconds;
- a hemisphere letter run together with the longitude degrees;
- `NaN` depths;
- labels with `//` comments.

Legacy files that are not UTF-8 are read as Latin-1.

The provenance record is timed by a `clock` (epoch milliseconds), the wall clock by default. A builder that must give the same plot every run, such as the sample data, passes a fixed one.

Checked against every REP file in legacy Debrief's sample data: 85 files and 173,548 fixes. The only line that failed is in `BAD_boat2.rep`, a file broken on purpose. A 28,000-fix file imports in about 1.5 s.

Not yet: sensor and narrative lines (Phases 3 and 4), per-fix labels, and the legacy OTG and DR modes (CAP-01).

## Legacy plot files (.dpf)

```python
from debrief_io import import_dpf

report = import_dpf(catalogue, Path("sample.dpf"), title="Sample")
report.tracks  # ["NELSON", "COLLINGWOOD"]
report.annotations, report.narrative_entries  # 5, 19
report.omitted  # every entity not imported, by name
```

The import follows the same four steps as REP: the file is kept read-only and hashed as the plot's source, one provenance record names the importer (`debrief-io.dpf`), its version and the source, and its notes carry the list of what was not imported (EXT-15). A file that is not well-formed XML, or larger than 200 MB, raises `DpfError` before anything is written; so does a plot that fails validation (`DocumentValidationError`), and an import that fails while writing removes the item it started.

What becomes what:

| Legacy | v4 |
| --- | --- |
| Track, all its legs | One track: fixes joined in time order, with courses, speeds, depths and the track's colour. TMA solution legs and dynamic infills are imported as their saved fixes; the solution behind them is not. When legs overlap in time, each leg becomes a track of its own, named `<track> (<leg>)`, since joining them would zig-zag. Fixes that share a time are kept and reported. A colour that cannot be read is replaced by the default, with a note. |
| Text label | Label annotation (a point). |
| Circle, ellipse | Shape annotation, a polygon of 72 sides, since a plot holds no curves. |
| Rectangle, polygon | Shape annotation, a polygon. An open polygon is a line. |
| Line, vector | Shape annotation, a line. |
| A shape's time range | The annotation's time, or time range. |
| Narrative entry | A time-only note annotation, named after its track, as the sample data holds its narrative. The entry's type is listed as not imported. |
| Layer, narrative | A named set of the annotations or notes it held, with the layer's name. Its settings are listed as not imported, since v4 has no layers yet. |

Not imported, each named in the report and in provenance:

- sensors and their cuts, TMA solution sets and dynamic shape sets carried by a track, with their counts;
- planned (composite) tracks, SATC solutions, external chart files;
- arcs, wheels and other shapes without a v4 equivalent;
- chart features: grids, scales, coastlines, chart libraries, time displays;
- tracks with fewer than two fixes, fix labels and comments, fixes drawn in their own colour, hidden fixes (imported and shown), and depths that could not be read (imported as zero, listed by line);
- anything inside a track or one of its legs that is not a fix or a part of the track this importer knows;
- display settings: fix labels and symbols, fonts, line styles, the colours of annotations, and visibility, so hidden items are shown;
- view settings: the tote, the time stepper, the background and the projection;
- elements that could not be read, with their line numbers, and any element this importer does not know, by element name and name.

Times finer than milliseconds are truncated and counted (SUB-01). A shape's time range that ends before it starts is reported, and only its start imported. The `details` element, which records the legacy version that saved the file, is not content; its text is kept in the provenance notes.

## The .dpf reader

Ported from legacy Debrief's SAX handlers (`DebriefXMLReaderWriter` and its `TrackHandler`, `FixHandler`, `NarrativeHandler`, `ShapeHandler` family, `LocationHandler`, `ColourHandler`, `WorldDistanceHandler` and `TimeRangeHandler`), with their test cases:

- dates as `yyMMdd HHmmss[.ffffff]` or with four-digit years, in the same 1950 to 2049 window as REP; the legacy null date reads as no time;
- numbers with a decimal point or a decimal comma, but not an ambiguous `1,234`, nor NaN or a number too large for a double, such as `1e999`;
- named and custom colours from `DebriefColors`;
- short and long locations; an unreadable depth reads as zero and is reported, an unreadable latitude or longitude skips the element;
- distances in metres, yards, kiloyards, kilometres, nautical miles, minutes and degrees of arc; a circle's radius and an ellipse's axes also as attributes in kiloyards, as older files give them;
- `\n` in a label as a line break.

The XML is read with the standard library's expat parser, refusing document type declarations and entities, so a hostile file cannot expand entities or reach outside itself. Elements the importer only names or counts, such as a sensor's cuts or a chart feature, are not kept in memory below their first level. No new dependency, so it also runs under Pyodide.

Checked against every `.dpf` file in legacy Debrief's sample data: 46 files, 99 tracks and 27,942 fixes, in about 3 s. The only file that failed is `BAD_sample.dpf`, broken on purpose. `tests/data/shapes.dpf` is legacy sample data (EPL-1.0), kept as a test fixture; see `tests/data/README.md`.
