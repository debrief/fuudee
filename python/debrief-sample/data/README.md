# AIS extract: Chesapeake Bay approaches, 15 June 2023

`ais-2023-06-15-chesapeake-approaches.csv` is the background picture for the Debrief sample data (DEP-08): real AIS traffic, reduced and anonymised. It is a source: the builder copies it, unchanged and hashed, into every plot (SUB-10, SUB-11).

## Origin

| | |
| --- | --- |
| Dataset | Nationwide Automatic Identification System 2023, MarineCadastre.gov |
| Publisher | NOAA Office for Coastal Management, from the US Coast Guard's national AIS receiver network |
| Record | <https://www.fisheries.noaa.gov/inport/item/70162> |
| File downloaded | <https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2023/AIS_2023_06_15.zip> |
| Downloaded | 11 Oct 2026 |
| Archive SHA-256 | `bb4f228e8935b0d1f6039c0edd01db0c823fb4cc2d7648fa7b4a3be01d85eccb` (328,773,356 bytes; one CSV of 896,142,781 bytes) |

Times in the archive are UTC.

## Licence

The data is a work of the United States Government, so it is in the public domain in the United States (17 U.S.C. 105). The NOAA record states no licence. It gives access constraints "None" and use constraints "For coastal and ocean planning", and NOAA gives no warranty and accepts no liability for the data. We read the use constraint as a statement of the dataset's purpose rather than a licence condition, but it is not explicit. Cite it as:

> Office for Coastal Management, 2025: Nationwide Automatic Identification System 2023, https://www.fisheries.noaa.gov/inport/item/70162.

The Danish Maritime Authority's archive (aisdata.ais.dk) was considered first. Its terms rest on the Danish act on the re-use of public sector information and make the recipient responsible for lawful handling, with no explicit permission to redistribute, so it was not used.

## Reduction

Made once by `python -m debrief_sample reduce-ais AIS_2023_06_15.zip <output>` (`reduce_marinecadastre` in `debrief_sample/ais.py`), which applies these steps in order:

1. **Area.** 36.70°N to 37.20°N, 75.90°W to 75.20°W: open water east of the entrance to Chesapeake Bay, including the approach lanes and an anchorage.
2. **Time.** The three serial windows only: 08:00Z to 12:00Z, 12:00Z to 17:00Z and 17:00Z to 23:00Z.
3. **Vessel types.** Kept: fishing, towing, dredger, sailing, pleasure craft, tug, passenger, cargo, tanker. Left out: military (AIS type 35), pilot (50), search and rescue (51), law enforcement (55), and unknown or other types.
4. **Thinning.** At most one fix a minute per vessel.
5. **Selection.** The two anchored vessels with the most fixes that are present in every serial, then for each serial the five vessels under way (mean speed 3 kn or more) with the most fixes in it, at least 10 fixes each. 16 vessels in all.
6. **Anonymisation.** MMSI, IMO number, call sign, name, dimensions, draught, destination, status and heading are dropped. Each vessel is named by its type and a number in order of first appearance, such as "Cargo 03". Positions, times, speed and course are kept as published.

The anonymisation keeps vessel identities out of the sample data, walkthroughs and blog posts (DEV-05). It does not make a vessel impossible to identify: anyone with the public archive can match a track back to it.

## Columns

| Column | Meaning |
| --- | --- |
| `vessel` | Generated name, such as `Cargo 03` |
| `vessel_type` | Type, from the AIS ship type code |
| `time` | UTC, to the second, such as `2023-06-15T08:00:01Z` |
| `latitude`, `longitude` | Decimal degrees, WGS84 |
| `speed_kn` | Speed over ground, knots; 102.3 means not available |
| `course_deg` | Course over ground, degrees true; 360 means not available |

3,732 fixes, about 250 KB.
