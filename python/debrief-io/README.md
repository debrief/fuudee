# debrief-io

Importers that turn legacy formats into validated plots with provenance. Phase 1 covers REP fix lines (EXT-01).

```python
from debrief_io import import_rep

report = import_rep(catalogue, Path("serial-01.rep"), title="Serial 1")
report.tracks  # ["NELSON", "HMS BLUE"]
report.omitted  # everything not imported, in words an analyst can act on
```

The import runs in four steps:

1. The source is copied into the plot's catalogue item, read-only, and hashed (SUB-10, SUB-11).
2. The fix lines are parsed into tracks, with speeds in knots, courses in degrees and a colour taken from the REP symbology.
3. One provenance record is written, naming the importer and its version, the source and its hash, and every omission (SUB-18).
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
