"""The background picture: a reduced, anonymised extract of open AIS data (DEP-08).

The extract committed under ``data/`` was made once, by ``reduce_marinecadastre``,
from one day of the US national AIS archive published by NOAA's Office for
Coastal Management on MarineCadastre.gov. The reduction keeps a small sea
area and the serial windows, drops military, law-enforcement, pilot and
search-and-rescue vessels and those of unknown type, picks a handful of
vessels, thins their fixes to at most one a minute, and replaces every
identifier (MMSI, IMO number, call sign, name) with the vessel type and a
generated name such as "Cargo 03".
"""

from __future__ import annotations

import csv
import io
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from debrief_kernel.time import to_epoch_ms
from debrief_sample.exercise import AREA, WINDOWS

EXTRACT_COLUMNS = (
    "vessel",
    "vessel_type",
    "time",
    "latitude",
    "longitude",
    "speed_kn",
    "course_deg",
)

# AIS ship and cargo type codes (ITU-R M.1371) grouped as an analyst names them.
_TYPE_GROUPS = (
    (range(30, 31), "Fishing"),
    (range(31, 33), "Towing"),
    (range(33, 34), "Dredger"),
    (range(36, 37), "Sailing"),
    (range(37, 38), "Pleasure craft"),
    (range(52, 53), "Tug"),
    (range(60, 70), "Passenger"),
    (range(70, 80), "Cargo"),
    (range(80, 90), "Tanker"),
)
# Left out of the extract: military (35), pilot (50), search and rescue (51),
# law enforcement (55), unknown or other types.

MIN_SPACING_S = 60
MOVERS_PER_SERIAL = 5
ANCHORED = 2
MAX_VESSELS = 20
MIN_FIXES = 10
MOVING_KN = 3.0

# AIS "not available" values.
SOG_UNAVAILABLE = 102.3
COG_UNAVAILABLE = 360.0


def vessel_type(code: str) -> str | None:
    """The analyst's name for an AIS type code, or None if it is left out."""
    try:
        number = int(code)
    except ValueError:
        return None
    for codes, name in _TYPE_GROUPS:
        if number in codes:
            return name
    return None


@dataclass(frozen=True)
class AisFix:
    time_ms: int
    latitude: float
    longitude: float
    speed_kn: float | None
    course_deg: float | None


@dataclass(frozen=True)
class AisVessel:
    name: str
    vessel_type: str
    fixes: tuple[AisFix, ...]

    def between(self, start_ms: int, end_ms: int) -> tuple[AisFix, ...]:
        return tuple(f for f in self.fixes if start_ms <= f.time_ms <= end_ms)


def _parse_time(text: str) -> int:
    """MarineCadastre writes UTC without a zone; the extract adds a Z."""
    instant = datetime.strptime(text.rstrip("Z"), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=UTC)
    return to_epoch_ms(instant)


def _in_area(latitude: float, longitude: float) -> bool:
    south, north, west, east = AREA.south, AREA.north, AREA.west, AREA.east
    return south <= latitude <= north and west <= longitude <= east


def _in_a_serial(time_ms: int) -> bool:
    return any(start <= time_ms <= end for start, end in WINDOWS)


def _thin(rows: list[tuple[int, list[str]]]) -> list[tuple[int, list[str]]]:
    kept: list[tuple[int, list[str]]] = []
    for time_ms, row in sorted(rows, key=lambda r: r[0]):
        if not kept or time_ms - kept[-1][0] >= MIN_SPACING_S * 1000:
            kept.append((time_ms, row))
    return kept


def reduce_marinecadastre(archive: Path, output: Path) -> int:
    """Reduce one day's MarineCadastre AIS archive to the committed extract.

    Run once, by hand; the builder never needs the archive. Returns the
    number of vessels kept.
    """
    by_vessel: dict[str, list[tuple[int, list[str]]]] = defaultdict(list)
    types: dict[str, str] = {}
    with zipfile.ZipFile(archive) as bundle:
        (member,) = bundle.namelist()
        with bundle.open(member) as stream:
            reader = csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8"))
            for row in reader:
                latitude, longitude = float(row["LAT"]), float(row["LON"])
                if not _in_area(latitude, longitude):
                    continue
                time_ms = _parse_time(row["BaseDateTime"])
                if not _in_a_serial(time_ms):
                    continue
                kind = vessel_type(row["VesselType"])
                if kind is None:
                    continue
                mmsi = row["MMSI"]
                types[mmsi] = kind
                by_vessel[mmsi].append((time_ms, [row["LAT"], row["LON"], row["SOG"], row["COG"]]))

    thinned = {mmsi: _thin(rows) for mmsi, rows in by_vessel.items()}

    def mean_speed(rows: list[tuple[int, list[str]]]) -> float:
        speeds = [float(r[2]) for _, r in rows if r[2] and float(r[2]) < SOG_UNAVAILABLE]
        return sum(speeds) / len(speeds) if speeds else 0.0

    chosen: list[str] = []
    # Anchored vessels present in every serial give a fixed background.
    anchored = [
        mmsi
        for mmsi, rows in thinned.items()
        if mean_speed(rows) < 0.5
        and all(sum(start <= t <= end for t, _ in rows) >= MIN_FIXES for start, end in WINDOWS)
    ]
    anchored.sort(key=lambda m: (-len(thinned[m]), m))
    chosen += anchored[:ANCHORED]
    for start, end in WINDOWS:
        movers = []
        for mmsi, rows in thinned.items():
            window = [(t, r) for t, r in rows if start <= t <= end]
            if len(window) >= MIN_FIXES and mean_speed(window) >= MOVING_KN:
                movers.append((-len(window), mmsi))
        # A vessel already chosen for an earlier serial counts towards this one's share.
        for _, mmsi in sorted(movers)[:MOVERS_PER_SERIAL]:
            if mmsi not in chosen:
                chosen.append(mmsi)
    chosen = chosen[:MAX_VESSELS]

    # Generated names, numbered by type in order of first appearance.
    chosen.sort(key=lambda m: (thinned[m][0][0], m))
    counters: dict[str, int] = defaultdict(int)
    names: dict[str, str] = {}
    for mmsi in chosen:
        counters[types[mmsi]] += 1
        names[mmsi] = f"{types[mmsi]} {counters[types[mmsi]]:02d}"

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out, lineterminator="\n")
        writer.writerow(EXTRACT_COLUMNS)
        for mmsi in chosen:
            for time_ms, (lat, lon, sog, cog) in thinned[mmsi]:
                stamp = datetime.fromtimestamp(time_ms / 1000, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
                writer.writerow([names[mmsi], types[mmsi], stamp, lat, lon, sog, cog])
    return len(chosen)


def _number(text: str, unavailable: float) -> float | None:
    if not text:
        return None
    value = float(text)
    return None if value >= unavailable else value


def read_extract(path: Path) -> list[AisVessel]:
    """The vessels in a committed extract, in file order."""
    fixes: dict[str, list[AisFix]] = defaultdict(list)
    kinds: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        if tuple(reader.fieldnames or ()) != EXTRACT_COLUMNS:
            raise ValueError(f"{path} does not have the extract's columns {EXTRACT_COLUMNS}")
        for row in reader:
            kinds[row["vessel"]] = row["vessel_type"]
            fixes[row["vessel"]].append(
                AisFix(
                    _parse_time(row["time"]),
                    float(row["latitude"]),
                    float(row["longitude"]),
                    _number(row["speed_kn"], SOG_UNAVAILABLE),
                    _number(row["course_deg"], COG_UNAVAILABLE),
                )
            )
    return [AisVessel(name, kinds[name], tuple(f)) for name, f in fixes.items()]
