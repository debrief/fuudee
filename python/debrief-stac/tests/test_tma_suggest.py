"""A suggested first guess (CAP-21 as amended; docs/notes/tma-suggested-first-guess.md):
batch least squares over the cuts, as gitma2's, offered only where the cuts settle the range,
and refused while any cut is ambiguous and unresolved (product owner, 18 Nov 2026)."""

from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, destination, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import models
from debrief_stac import Catalogue, CatalogueError, Changes
from debrief_stac import sensors as plot_sensors
from debrief_stac.sensors import ReadCut, ReadSensor

AGENT = models.AgentRef(kind="person", name="analyst")
T0 = parse_utc("2026-10-11T09:00:00.000Z")
MINUTE = 60_000
KNOT = 1852 / 3600
OWN = Position(-4.0, 50.0)
TARGET_COURSE, TARGET_KN = 200.0, 6.0
TARGET_RANGE = 6 * 1852.0
TARGET_START = destination(OWN, Quantity(30.0, "deg"), Quantity(TARGET_RANGE, "m"))
N = 61


def at(minutes: float) -> str:
    return format_utc(T0 + int(minutes * MINUTE))


def run(start: Position, courses: list[float], knots: float) -> list[Position]:
    out = [start]
    for course in courses[1:]:
        out.append(destination(out[-1], Quantity(course, "deg"), Quantity(knots * KNOT * 60, "m")))
    return out


def own_courses(zig: bool) -> list[float]:
    return [90.0 if not zig or m <= 30 else 0.0 for m in range(N)]


def own_track(zig: bool) -> models.TrackFeature:
    fixes = run(OWN, own_courses(zig), 10.0)
    return models.TrackFeature(
        type="Feature",
        id="track-blue",
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[p.longitude, p.latitude] for p in fixes]
        ),
        properties=models.TrackProperties(
            kind="track",
            name="BLUE ONE",
            times=[at(i) for i in range(N)],
            courses=models.AngleSeries(unit="deg", values=own_courses(zig)),
            speeds=models.SpeedSeries(unit="[kn_i]", values=[10.0] * N),
            style={"colour": "#0064bd"},
        ),
    )


def sensors_for(zig: bool) -> list[ReadSensor]:
    own = run(OWN, own_courses(zig), 10.0)
    target = run(TARGET_START, [TARGET_COURSE] * N, TARGET_KN)
    bearings = [range_bearing(own[m], target[m])[1].value for m in range(N)]
    bow = ReadSensor(
        name="Bow sonar",
        host_track_id="track-blue",
        cuts=[ReadCut(T0 + m * MINUTE, bearings[m]) for m in range(N)],
    )
    towed = ReadSensor(
        name="Towed array",
        host_track_id="track-blue",
        cuts=[
            ReadCut(
                T0 + m * MINUTE,
                bearings[m],
                ambiguous=(2 * own_courses(zig)[m] - bearings[m]) % 360,
            )
            for m in range(N)
        ],
    )
    # The same target turning to 090 at minute 45, and the Bow sonar with one wild bearing.
    turned = run(TARGET_START, [TARGET_COURSE if m <= 45 else 90.0 for m in range(N)], TARGET_KN)
    hull = ReadSensor(
        name="Hull array",
        host_track_id="track-blue",
        cuts=[
            ReadCut(T0 + m * MINUTE, range_bearing(own[m], turned[m])[1].value) for m in range(N)
        ],
    )
    wild = ReadSensor(
        name="Wild sonar",
        host_track_id="track-blue",
        cuts=[
            ReadCut(T0 + m * MINUTE, (bearings[m] + (25.0 if m == 45 else 0.0)) % 360)
            for m in range(N)
        ],
    )
    return [bow, towed, hull, wild]


def make(tmp_path: Path, zig: bool) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    origin = models.ProvRecord(id="op-1", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[own_track(zig)]))
    record = models.ProvRecord(id="op-2", kind="import", started_at=at(0), agent=AGENT)
    catalogue.add_sensors("p", sensors_for(zig), record)
    return catalogue


def sensor_id(catalogue: Catalogue, name: str) -> str:
    plot = catalogue.read_plot("p")
    return next(s.id for s in plot_sensors.sensors(plot) if s.properties.name == name)


def ask(catalogue: Catalogue, name: str = "Bow sonar") -> dict:
    return {"sensor_ids": [sensor_id(catalogue, name)], "period": {"start": at(0), "end": at(60)}}


def test_a_zig_settles_the_range_and_the_guess_is_the_targets(tmp_path: Path) -> None:
    catalogue = make(tmp_path, zig=True)
    before = catalogue.read_plot("p")
    suggestion = catalogue.tma_suggest("p", ask(catalogue))
    assert suggestion["determined"] and suggestion["cuts"] == N
    assert suggestion["range"] == pytest.approx(TARGET_RANGE, rel=0.02)
    assert suggestion["course"] == pytest.approx(TARGET_COURSE, abs=2.0)
    assert suggestion["speed"] == pytest.approx(TARGET_KN * KNOT, rel=0.05)
    assert suggestion["note"].startswith("Suggested by least squares over 61 cuts:")
    # Reading only: nothing made.
    assert catalogue.read_plot("p") == before
    # The guess makes a solution through the form's own request.
    _step, feature = catalogue.create_tma(
        "p",
        {
            **ask(catalogue),
            "range": {"value": suggestion["range"], "unit": "m"},
            "course": {"value": suggestion["course"], "unit": "deg"},
            "speed": {"value": suggestion["speed"], "unit": "m/s"},
        },
        AGENT,
    )
    assert catalogue.tma_residuals("p", feature)["rms"] < 1.0


def test_without_a_zig_no_guess_is_offered(tmp_path: Path) -> None:
    catalogue = make(tmp_path, zig=False)
    suggestion = catalogue.tma_suggest("p", ask(catalogue))
    assert not suggestion["determined"]
    assert "range" not in suggestion and "course" not in suggestion
    assert "do not settle the range" in suggestion["note"]
    assert "BLUE ONE needs to change course or speed" in suggestion["note"]


def test_unresolved_ambiguous_cuts_are_refused_until_a_side_is_kept(tmp_path: Path) -> None:
    catalogue = make(tmp_path, zig=True)
    with pytest.raises(CatalogueError, match="61 of these cuts are ambiguous: keep a side"):
        catalogue.tma_suggest("p", ask(catalogue, "Towed array"))
    towed = sensor_id(catalogue, "Towed array")
    plot = catalogue.read_plot("p")
    cut_ids = [c.id for c in plot_sensors.cuts(plot, towed)]
    catalogue.resolve_ambiguity("p", {"keep": "bearing", "cut_ids": cut_ids}, AGENT)
    suggestion = catalogue.tma_suggest("p", ask(catalogue, "Towed array"))
    assert suggestion["determined"]
    assert suggestion["range"] == pytest.approx(TARGET_RANGE, rel=0.02)


def test_too_few_cuts_are_refused(tmp_path: Path) -> None:
    catalogue = make(tmp_path, zig=True)
    asked = {**ask(catalogue), "period": {"start": at(0), "end": at(3)}}
    with pytest.raises(CatalogueError, match="five cuts or more"):
        catalogue.tma_suggest("p", asked)


def test_cuts_that_do_not_fit_one_course_and_speed_are_not_offered(tmp_path: Path) -> None:
    catalogue = make(tmp_path, zig=True)
    # Its turn is in the middle of a short period: the cuts fit no one course and speed.
    middle = {**ask(catalogue, "Hull array"), "period": {"start": at(30), "end": at(60)}}
    suggestion = catalogue.tma_suggest("p", middle)
    assert not suggestion["determined"] and "course" not in suggestion
    # One leg's cuts fit: the target turns after minute 45, ownship at 30.
    leg = {**ask(catalogue, "Hull array"), "period": {"start": at(0), "end": at(45)}}
    assert catalogue.tma_suggest("p", leg)["determined"]
    # The whole period fits one course and speed but for its end, which the note points to.
    whole = catalogue.tma_suggest("p", ask(catalogue, "Hull array"))
    assert (
        "drift off it: the target may have manoeuvred, at or some time before then" in whole["note"]
    )
    assert "wild bearings" not in whole["note"]


def test_a_wild_bearing_is_said_and_does_not_stop_the_guess(tmp_path: Path) -> None:
    catalogue = make(tmp_path, zig=True)
    suggestion = catalogue.tma_suggest("p", ask(catalogue, "Wild sonar"))
    assert suggestion["determined"]
    assert suggestion["range"] == pytest.approx(TARGET_RANGE, rel=0.05)
    assert suggestion["note"].endswith(
        "1 cut is far off it (wild bearings, perhaps): leave it out once the solution is made."
    )
