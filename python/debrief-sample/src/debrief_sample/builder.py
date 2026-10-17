"""Building the sample catalogue: one plot per serial, each with its own provenance (DEP-08).

Each plot is assembled the way an analyst's plot would be, and its history
records how (SUB-18):

1. The builder synthesises the blue and red tracks and writes them as REP
   files (a tool record carrying the seed, SUB-20).
2. Each REP file is imported through debrief-io, so it becomes a hashed,
   read-only source with its own import record (SUB-10, SUB-11).
3. The AIS extract is imported as a source for the background picture.
4. The ownship's sonar bearings are derived from the imported tracks, with
   seeded noise, and stored as a Parquet payload (CON-02).
5. The scripted narrative is written, kept as a supporting file and read
   into narrative entries (CAP-20).

6. The exercise area and the named sets are added, each with its own record,
   with the plot's own details (its title). Its view, a time window over the
   serial, goes in the plot's island, outside its history.

Provenance times come from a fixed clock, so two builds with the same seed
and the same lockfile are byte-for-byte identical. (pyarrow writes its
version into each Parquet file, so another pyarrow changes the payload bytes.)
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from importlib.metadata import version
from pathlib import Path

from debrief_io import build_plot
from debrief_kernel.geodesy import TrackPath
from debrief_kernel.time import format_utc, parse_utc
from debrief_sample import ais, narrative, payload
from debrief_sample.exercise import AREA, BLUE, SERIALS, Serial, script_digest
from debrief_sample.synth import (
    SonarModel,
    course_lookup,
    generator,
    rep_text,
    simulate,
    sonar_bearings,
)
from debrief_schemas import SCHEMA_VERSION, DebriefFeatureCollection, models
from debrief_stac import Catalogue, with_plot_details
from debrief_stac import narrative as plot_narrative
from debrief_stac.history import view_hash

TOOL = "debrief-sample"
DEFAULT_SEED = 1995  # the year of the single-serial sample this replaces
RECORDED_AT = "2026-10-11T00:00:00.000Z"

CATALOGUE_ID = "debrief-sample"
CATALOGUE_TITLE = "Debrief sample exercise, 15 Jun 2023"
CATALOGUE_DESCRIPTION = (
    "Unclassified sample data for demonstrations, walkthroughs and blog posts (DEP-08). "
    "Real open AIS traffic east of the entrance to Chesapeake Bay, with an invented exercise "
    "on top: a blue ownship, a red submarine, the ownship's sonar bearings and a scripted "
    "narrative, over three serials. Every plot here is unclassified (SEC-02)."
)

AIS_FILE = "ais-2023-06-15-chesapeake-approaches.csv"
AIS_COLOUR = "#808080"
SENSOR = "Bow sonar"
SONAR = SonarModel(
    interval_ms=30_000,
    detection_range_m=4.5 * 1852.0,
    baffle_half_angle_deg=40.0,
    p_gain=0.05,
    p_lose=0.015,
    bearing_sd_deg=1.5,
)
# How each random generator is seeded (SUB-20): Python's random.Random, Mersenne Twister.
RNG_SCHEME = "random.Random('{seed}:{serial}:{purpose}')"


def extract_path() -> Path:
    """The committed AIS extract: in the source tree, or packaged in the wheel."""
    here = Path(__file__).resolve()
    for candidate in (here.parents[2] / "data" / AIS_FILE, here.parent / "data" / AIS_FILE):
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"AIS extract {AIS_FILE} not found beside the package")


class FixedClock:
    """A clock for provenance that starts at a set time and ticks a second per reading."""

    def __init__(self, start: str):
        self.now = parse_utc(start)

    def __call__(self) -> int:
        current = self.now
        self.now += 1000
        return current

    def text(self) -> str:
        return format_utc(self())


@dataclass
class BuildReport:
    root: Path
    seed: int
    plots: dict[str, dict[str, int]] = field(default_factory=dict)


def _agent() -> models.AgentRef:
    return models.AgentRef(kind="software_agent", name=f"{TOOL} builder")


def _tool(part: str | None = None) -> models.ToolRef:
    name = TOOL if part is None else f"{TOOL}.{part}"
    return models.ToolRef(name=name, version=version(TOOL))


def _param(name: str, value: object) -> models.ParameterValue:
    return models.ParameterValue(name=name, value=value)


def _area_text() -> str:
    return f"{AREA.south:.2f}N to {AREA.north:.2f}N, {abs(AREA.west):.2f}W to {abs(AREA.east):.2f}W"


def _windows_text(serial: Serial) -> str:
    """When the ownship's sonar was off, as Zulu time ranges."""
    if not serial.deaf:
        return "none"
    return ", ".join(
        f"{format_utc(serial.start_ms + a * 60_000)}/{format_utc(serial.start_ms + b * 60_000)}"
        for a, b in serial.deaf
    )


def _ais_track(vessel: ais.AisVessel, fixes: tuple[ais.AisFix, ...]) -> tuple:
    """A background track, and a note for anything AIS did not give at every fix."""
    slug = vessel.name.lower().replace(" ", "-")
    notes = []
    speeds = courses = None
    if all(f.speed_kn is not None for f in fixes):
        speeds = models.SpeedSeries(unit="[kn_i]", values=[f.speed_kn for f in fixes])
    else:
        notes.append(f"{vessel.name}: speed not given at every fix, so speeds were not imported.")
    if all(f.course_deg is not None for f in fixes):
        courses = models.AngleSeries(unit="deg", values=[f.course_deg for f in fixes])
    else:
        notes.append(f"{vessel.name}: course not given at every fix, so courses were not imported.")
    feature = models.TrackFeature(
        type="Feature",
        id=f"track-ais-{slug}",
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[f.longitude, f.latitude] for f in fixes]
        ),
        properties=models.TrackProperties(
            kind="track",
            name=vessel.name,
            platform_class=vessel.vessel_type,
            times=[format_utc(f.time_ms) for f in fixes],
            speeds=speeds,
            courses=courses,
            style=models.TrackStyle(colour=AIS_COLOUR),
        ),
    )
    return feature, notes


def _build_serial(
    catalogue: Catalogue,
    serial: Serial,
    seed: int,
    clock: FixedClock,
    vessels: list[ais.AisVessel],
    work: Path,
) -> dict[str, int]:
    item = serial.item_id
    catalogue.create_plot(item, serial.title, created=RECORDED_AT)
    agent = _agent()
    features: list = []
    provenance: list[models.ProvRecord] = []

    # 1. Synthesise blue and red, and write them as REP files.
    started = clock.text()
    rep_refs: dict[str, models.SourceRef] = {}
    rep_texts: dict[str, str] = {}
    for platform in (serial.blue, serial.red):
        fixes = simulate(platform, serial.start_ms, generator(seed, item, platform.name))
        path = work / item / platform.file_name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rep_text(platform, fixes, serial.title), encoding="utf-8")
        rep_texts[platform.name] = path.read_text(encoding="utf-8")
        rep_refs[platform.name] = catalogue.add_source(item, path, media_type="text/plain")
    provenance.append(
        models.ProvRecord(
            id=f"{item}-synthesise",
            kind="tool",
            started_at=started,
            ended_at=clock.text(),
            tool=_tool(),
            agent=agent,
            parameters=[
                _param("serial", serial.title),
                _param("start", format_utc(serial.start_ms)),
                _param("end", format_utc(serial.end_ms)),
                _param("area", _area_text()),
                _param("sonar_off", _windows_text(serial)),
                _param("script_digest", script_digest(serial)),
                _param("rng", RNG_SCHEME.format(seed=seed, serial=item, purpose="<platform>")),
            ],
            seed=seed,
            notes=[
                f"Synthesised {ref.href} ({ref.content_hash}) for {name}: fiction, one fix a "
                "minute, following the serial's scripted legs."
                for name, ref in rep_refs.items()
            ],
        )
    )

    # 2. Import each REP file through debrief-io.
    tracks: dict[str, models.TrackFeature] = {}
    for name, ref in rep_refs.items():
        part, _ = build_plot(rep_texts[name], ref, agent, clock=clock)
        features += part.features
        provenance += part.provenance
        tracks[name] = part.features[0]

    # 3. The background picture from the AIS extract.
    started = clock.text()
    ais_ref = catalogue.add_source(item, extract_path(), media_type="text/csv")
    ais_paths: dict[str, TrackPath] = {}
    ais_notes = [
        "Open AIS from MarineCadastre.gov (NOAA Office for Coastal Management, from the "
        "US Coast Guard's receiver network), 15 Jun 2023. A US Government work.",
        "The extract is reduced and anonymised; see the README beside it in debrief-sample.",
    ]
    for vessel in vessels:
        fixes = vessel.between(serial.start_ms, serial.end_ms)
        if len(fixes) < 2:
            ais_notes.append(f"{vessel.name} has no track in this serial, so it is not shown.")
            continue
        feature, notes = _ais_track(vessel, fixes)
        features.append(feature)
        ais_notes += notes
        ais_paths[vessel.name] = TrackPath.from_feature(feature)
    provenance.append(
        models.ProvRecord(
            id=f"{item}-import-ais",
            kind="import",
            started_at=started,
            ended_at=clock.text(),
            tool=_tool("ais"),
            agent=agent,
            parameters=[
                _param("start", format_utc(serial.start_ms)),
                _param("end", format_utc(serial.end_ms)),
            ],
            used=[ais_ref],
            notes=ais_notes,
        )
    )

    # 4. Sonar bearings from blue to red, from the imported tracks.
    started = clock.text()
    blue_track = tracks[serial.blue.name]
    blue_path = TrackPath.from_feature(blue_track)
    red_path = TrackPath.from_feature(tracks[serial.red.name])
    deaf_ms = [(serial.start_ms + a * 60_000, serial.start_ms + b * 60_000) for a, b in serial.deaf]
    bearings, contacts = sonar_bearings(
        blue_path,
        red_path,
        own_course=course_lookup(blue_path.times_ms, blue_track.properties.courses.values),
        model=SONAR,
        deaf_ms=deaf_ms,
        rng=generator(seed, item, "bearings"),
    )
    blue_id = blue_track.id
    sensor_id = f"sensor-{blue_id.removeprefix('track-')}-bow-sonar"
    bearing_notes = [
        f"True bearings from {BLUE} to the target, with normally distributed error. "
        "Contact is possible only within detection range, outside the baffles and while "
        "the sonar is listening; within those limits it is gained and lost at random.",
    ]
    if bearings:
        bearings_file = work / item / "bow-sonar-bearings.parquet"
        payload.write_bearings(bearings, SONAR.bearing_sd_deg, bearings_file)
        bearings_ref = catalogue.add_payload(item, bearings_file, media_type=payload.MEDIA_TYPE)
        features.append(
            models.SensorObservationsFeature(
                type="Feature",
                id=sensor_id,
                geometry=None,
                properties=models.SensorObservationsProperties(
                    kind="sensor_observations",
                    name=f"{BLUE} bow sonar",
                    sensor_name=SENSOR,
                    host_track_id=blue_id,
                    observation_type="bearing",
                    time_range=models.TimeRange(
                        start=format_utc(bearings[0].time_ms),
                        end=format_utc(bearings[-1].time_ms),
                    ),
                    observation_count=len(bearings),
                    payload=payload.envelope(bearings_ref.href, bearings_ref.content_hash),
                ),
            )
        )
        bearing_notes.append(f"Wrote {bearings_ref.href} ({bearings_ref.content_hash}).")
    else:
        bearing_notes.append("The sonar never held the target, so there are no bearings.")
    provenance.append(
        models.ProvRecord(
            id=f"{item}-sonar-bearings",
            kind="tool",
            started_at=started,
            ended_at=clock.text(),
            tool=_tool("bearings"),
            agent=agent,
            parameters=[
                _param("interval", models.Duration(value=SONAR.interval_ms / 1000, unit="s")),
                _param("bearing_error", models.Angle(value=SONAR.bearing_sd_deg, unit="deg")),
                _param(
                    "detection_range",
                    models.Length(value=SONAR.detection_range_m / 1852.0, unit="[nmi_i]"),
                ),
                _param(
                    "baffle_half_angle",
                    models.Angle(value=SONAR.baffle_half_angle_deg, unit="deg"),
                ),
                _param("p_gain", SONAR.p_gain),
                _param("p_lose", SONAR.p_lose),
                _param("sonar_off", _windows_text(serial)),
                _param("rng", RNG_SCHEME.format(seed=seed, serial=item, purpose="bearings")),
            ],
            used=list(rep_refs.values()),
            seed=seed,
            notes=bearing_notes,
        )
    )

    # 5. The scripted narrative, kept as a supporting file and read into narrative entries.
    started = clock.text()
    seen = narrative.picture(bearings, contacts, SONAR.interval_ms)
    items = narrative.entries(serial, blue_path, red_path, seen, ais_paths)
    narrative_file = work / item / "narrative.txt"
    narrative_file.write_text(narrative.write(serial, items), encoding="utf-8")
    narrative_ref = catalogue.add_supporting_file(item, narrative_file, media_type="text/plain")
    parsed = narrative.parse(narrative_file.read_text(encoding="utf-8"))
    names = {f.properties.name: f.id for f in features if f.properties.kind == "track"}
    notes = [
        models.NarrativeFeature(
            type="Feature",
            id=feature_id,
            geometry=None,
            properties=models.NarrativeProperties(
                kind="narrative",
                time=format_utc(entry.time_ms),
                source=entry.platform,
                entry_type=entry.entry_type,
                text=entry.text,
                track_id=plot_narrative.track_for(entry.platform, names),
            ),
        )
        for feature_id, entry in zip(
            plot_narrative.new_ids(set(), len(parsed)), parsed, strict=True
        )
    ]
    provenance.append(
        models.ProvRecord(
            id=f"{item}-import-narrative",
            kind="import",
            started_at=started,
            ended_at=clock.text(),
            tool=_tool("narrative"),
            agent=agent,
            parameters=[_param("script_digest", script_digest(serial))],
            used=[narrative_ref],
            notes=[
                "Scripted narrative: each line read into a narrative entry, which belongs to "
                "the track of its platform where there is one.",
                "The narrative is a supporting file, not a source: the builder wrote it.",
            ],
        )
    )

    # 6. The exercise area.
    started = clock.text()
    area = models.AnnotationFeature(
        type="Feature",
        id="annotation-exercise-area",
        geometry=models.PolygonGeometry(type="Polygon", coordinates=[AREA.ring()]),
        properties=models.AnnotationProperties(
            kind="annotation",
            style="shape",
            name="Exercise area",
            text=_area_text(),
        ),
    )
    provenance.append(
        models.ProvRecord(
            id=f"{item}-exercise-area",
            kind="tool",
            started_at=started,
            ended_at=clock.text(),
            tool=_tool("area"),
            agent=agent,
            parameters=[_param("area", _area_text())],
            notes=[f"Drew the exercise area as a shape annotation, {area.id}."],
        )
    )

    # 7. Named sets.
    started = clock.text()
    background = [f"track-ais-{n.lower().replace(' ', '-')}" for n in ais_paths]
    exercise_ids = [f.id for f in features if not f.id.startswith("track-ais-")]
    exercise_ids += [area.id] + [n.id for n in notes]
    named_sets = [
        models.NamedSet(id="set-exercise", name="Exercise", feature_ids=exercise_ids),
        models.NamedSet(
            id="set-background-traffic", name="Background traffic", feature_ids=background
        ),
    ]
    provenance.append(
        models.ProvRecord(
            id=f"{item}-named-sets",
            kind="tool",
            started_at=started,
            ended_at=clock.text(),
            tool=_tool("named-sets"),
            agent=agent,
            notes=[
                "Exercise: the blue and red tracks, the sonar bearings, the exercise area and "
                "the narrative.",
                "Background traffic: the AIS tracks.",
            ],
        )
    )

    plot = DebriefFeatureCollection(
        type="FeatureCollection",
        schema_version=SCHEMA_VERSION,
        features=features + [area] + notes,
        named_sets=named_sets,
        provenance=provenance,
    )
    # The plot's own details, and its view: a time window over the serial (SUB-22).
    plot = with_plot_details(
        plot, serial.title, f"Blue hunting red: {serial.blue.name} and {serial.red.name}."
    )
    catalogue.write_plot(item, plot)
    window = {"start": format_utc(serial.start_ms), "end": format_utc(serial.end_ms)}
    catalogue.write_view(item, {"time_window": window}, view_hash(None))
    return {
        "tracks": sum(1 for f in plot.features if f.properties.kind == "track"),
        "background_tracks": len(ais_paths),
        "bearings": len(bearings),
        "narrative_entries": len(notes),
    }


def build(
    root: Path,
    *,
    seed: int = DEFAULT_SEED,
    recorded_at: str = RECORDED_AT,
    catalogue_id: str = CATALOGUE_ID,
    title: str = CATALOGUE_TITLE,
) -> BuildReport:
    """Build the sample catalogue at root, which must not already hold one. A walkthrough's
    copy has an id and title of its own, so it is never taken for the sample."""
    root = Path(root)
    catalogue = Catalogue.create(root, catalogue_id, title, CATALOGUE_DESCRIPTION)
    clock = FixedClock(recorded_at)
    vessels = ais.read_extract(extract_path())
    report = BuildReport(root, seed)
    with tempfile.TemporaryDirectory(prefix="debrief-sample-") as scratch:
        for serial in SERIALS:
            report.plots[serial.item_id] = _build_serial(
                catalogue, serial, seed, clock, vessels, Path(scratch)
            )
    return report
