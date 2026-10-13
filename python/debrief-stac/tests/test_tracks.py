"""Tracks moved, rotated, split and merged by hand: geodesically correct, each one
step in the plot's history with its parameters, undone and redone like any change,
and never made over a change made elsewhere (CAP-01, CAP-02, SUB-19, SUB-21, SUB-28)."""

from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import DocumentKind, dump_document, load_document, models
from debrief_stac import Catalogue, CatalogueError, Changes, Conflict
from debrief_stac.tracks import (
    TrackError,
    default_pivot,
    merge,
    moved,
    overlaps,
    period_indices,
    rotated,
    split,
)

AGENT = models.AgentRef(kind="person", name="analyst")
T0 = parse_utc("2026-10-11T09:00:00.000Z")
MINUTE = 60_000


def at(minutes: float) -> str:
    return format_utc(T0 + int(minutes * MINUTE))


def track(
    track_id: str,
    name: str,
    positions: list[list[float]],
    start: float = 0,
    *,
    courses: bool = True,
    colour: str = "#0064bd",
) -> models.TrackFeature:
    n = len(positions)
    props = {
        "kind": "track",
        "name": name,
        "times": [at(start + 10 * i) for i in range(n)],
        "speeds": {"unit": "[kn_i]", "values": [12.0] * n},
        "style": {"colour": colour},
        "provenance": [
            {"id": f"origin-{track_id}", "kind": "import", "started_at": at(0), "agent": AGENT}
        ],
    }
    if courses:
        props["courses"] = {"unit": "deg", "values": [90.0] * n}
    return models.TrackFeature(
        type="Feature",
        id=track_id,
        geometry=models.LineStringGeometry(type="LineString", coordinates=positions),
        properties=models.TrackProperties(**props),
    )


BLUE = track("track-blue", "BLUE ONE", [[-4.0 + 0.05 * i, 50.0] for i in range(6)])
# Later than BLUE, and once BLUE has finished.
BLUE_LATER = track("track-blue-later", "BLUE TWO", [[-3.7 + 0.05 * i, 50.0] for i in range(4)], 60)
RED = track("track-red", "RED ONE", [[-4.0, 50.2 - 0.03 * i] for i in range(5)], colour="#e01c3e")


def sensor(host: str, start: str, end: str, sensor_id: str) -> models.SensorObservationsFeature:
    return models.SensorObservationsFeature(
        type="Feature",
        id=sensor_id,
        geometry=None,
        properties=models.SensorObservationsProperties(
            kind="sensor_observations",
            name=f"{sensor_id} bearings",
            sensor_name="2087",
            host_track_id=host,
            observation_type="bearing",
            time_range=models.TimeRange(start=start, end=end),
            observation_count=10,
            payload=models.PayloadRef(
                href=f"{sensor_id}.parquet",
                format="parquet",
                inner_schema=models.InnerSchemaRef(
                    name="debrief.bearing_observations", version="0.0.1"
                ),
                columns=[models.PayloadColumn(name="time")],
                crs="EPSG:4326",
                time_reference="UTC",
                content_hash="sha256:" + "a1" * 32,
            ),
        ),
    )


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    origin = models.ProvRecord(id="op-1", kind="import", started_at=at(0), agent=AGENT)
    sensors = [
        sensor("track-blue", at(0), at(20), "early"),
        sensor("track-blue", at(30), at(50), "late"),
        sensor("track-blue-later", at(60), at(80), "second"),
    ]
    catalogue.commit(
        "p",
        [origin],
        Changes(
            added=[BLUE, BLUE_LATER, RED, *sensors],
            named_sets=[
                models.NamedSet(id="set-1", name="Blue force", feature_ids=["track-blue"]),
                models.NamedSet(
                    id="set-2", name="Both", feature_ids=["track-blue", "track-blue-later"]
                ),
            ],
        ),
    )
    return catalogue


def feature(catalogue: Catalogue, feature_id: str):
    return next(f for f in catalogue.read_plot("p").features if f.id == feature_id)


def last_record(catalogue: Catalogue) -> models.ProvRecord:
    return catalogue.history("p").steps()[-1].records[0]


def parameters(record: models.ProvRecord) -> dict:
    out = {}
    for p in record.parameters or []:
        value = p.value
        out[p.name] = (value.value, str(value.unit)) if hasattr(value, "unit") else value
    return out


def valid(catalogue: Catalogue) -> None:
    """The plot as written passes every rule: parallel arrays aligned, times in
    order, ids unique, host tracks present, named sets whole."""
    text = dump_document(DocumentKind.PLOT, catalogue.read_plot("p"))
    load_document(DocumentKind.PLOT, text)


# --- Geodesy --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("positions", "distance_m", "bearing"),
    [
        ([[-4.0, 50.0], [-3.9, 50.05], [-3.8, 50.1]], 2222.4, 45.0),
        # High latitude: every fix still goes exactly the distance along the bearing.
        ([[10.0, 88.5], [40.0, 88.7], [80.0, 88.6]], 50_000.0, 300.0),
        # Across the antimeridian, and taken further across it.
        ([[179.8, -30.0], [179.95, -30.02], [-179.9, -30.05]], 30_000.0, 90.0),
    ],
)
def test_a_move_takes_every_fix_the_same_range_along_the_same_bearing(
    positions, distance_m, bearing
) -> None:
    before = track("t", "T", positions)
    after = moved(before, Quantity(distance_m, "m"), Quantity(bearing, "deg"), range(3))
    for old, new in zip(before.geometry.coordinates, after.geometry.coordinates, strict=True):
        assert -180 <= new[0] <= 180 and -90 <= new[1] <= 90
        distance, direction = range_bearing(Position(*old), Position(*new))
        assert distance.value == pytest.approx(distance_m, abs=1e-6)
        assert direction.value == pytest.approx(bearing, abs=1e-9)
    # Times, speeds and courses over ground are as they were.
    assert after.properties.times == before.properties.times
    assert after.properties.courses == before.properties.courses


def test_a_move_is_not_a_change_of_latitude_and_longitude() -> None:
    # Far north, a move east along a geodesic is not the same change of longitude for
    # fixes at different latitudes: Debrief does not slide a track as a parallel rule would.
    before = track("t", "T", [[0.0, 70.0], [0.0, 80.0]])
    after = moved(before, Quantity(100_000, "m"), Quantity(90, "deg"), range(2))
    d_lon = [
        new[0] - old[0]
        for old, new in zip(before.geometry.coordinates, after.geometry.coordinates, strict=True)
    ]
    assert d_lon[1] > d_lon[0] * 1.5


@pytest.mark.parametrize(
    ("positions", "pivot", "angle"),
    [
        ([[-4.0, 50.0], [-3.9, 50.05], [-3.8, 50.1]], (-4.0, 50.0), 30.0),
        ([[10.0, 88.5], [40.0, 88.7], [80.0, 88.6]], (20.0, 88.0), -75.0),
        ([[179.8, -30.0], [179.95, -30.02], [-179.9, -30.05]], (179.9, -30.1), 120.0),
    ],
)
def test_a_rotation_keeps_each_range_from_the_pivot_and_turns_its_bearing(
    positions, pivot, angle
) -> None:
    before = track("t", "T", positions)
    centre = Position(*pivot)
    after = rotated(before, centre, Quantity(angle, "deg"), range(3))
    for old, new in zip(before.geometry.coordinates, after.geometry.coordinates, strict=True):
        assert -180 <= new[0] <= 180
        r0, b0 = range_bearing(centre, Position(*old))
        r1, b1 = range_bearing(centre, Position(*new))
        if r0.value == 0:
            assert new == old
            continue
        assert r1.value == pytest.approx(r0.value, abs=1e-6)
        assert (b1.value - b0.value - angle) % 360 == pytest.approx(0, abs=1e-7) or (
            b1.value - b0.value - angle
        ) % 360 == pytest.approx(360, abs=1e-7)
    # Courses over ground turn with the track.
    assert after.properties.courses.values == pytest.approx([(90 + angle) % 360] * 3)


def test_a_rotation_in_radians_keeps_courses_in_radians() -> None:
    before = track("t", "T", [[-4.0, 50.0], [-3.9, 50.0]])
    props = before.properties.model_copy(
        update={"courses": models.AngleSeries(unit="rad", values=[6.2, 0.1])}
    )
    before = before.model_copy(update={"properties": props})
    after = rotated(before, Position(-4.0, 50.0), Quantity(90, "deg"), range(2))
    assert str(after.properties.courses.unit) == "rad"
    assert after.properties.courses.values == pytest.approx(
        [(6.2 + 1.5707963) % 6.2831853, 1.6707963]
    )


def test_nothing_to_move_or_turn_is_no_change() -> None:
    assert moved(BLUE, Quantity(0, "m"), Quantity(45, "deg"), range(6)) is None
    assert rotated(BLUE, Position(-4, 50), Quantity(360, "deg"), range(6)) is None


def test_the_default_pivot_is_the_fix_nearest_current_time_else_the_periods_first() -> None:
    indices = period_indices(BLUE, (parse_utc(at(10)), parse_utc(at(40))))
    assert indices == [1, 2, 3, 4]
    assert default_pivot(BLUE, indices, parse_utc(at(24))) == Position(
        *BLUE.geometry.coordinates[2]
    )
    assert default_pivot(BLUE, indices, parse_utc(at(26))) == Position(
        *BLUE.geometry.coordinates[3]
    )
    # Current time outside the period's fixes, or not known: the period's first fix.
    assert default_pivot(BLUE, indices, parse_utc(at(55))) == Position(
        *BLUE.geometry.coordinates[1]
    )
    assert default_pivot(BLUE, indices, None) == Position(*BLUE.geometry.coordinates[1])


def test_a_period_with_no_fixes_says_so() -> None:
    with pytest.raises(TrackError, match="BLUE ONE has no fixes from 09:01:00Z to 09:02:00Z"):
        period_indices(BLUE, (parse_utc(at(1)), parse_utc(at(2))))


# --- Moving and rotating as steps -------------------------------------------------------


def test_moving_a_track_is_one_step_named_by_range_and_bearing(catalogue) -> None:
    steps = len(catalogue.history("p").steps())
    edit = {
        "action": "move",
        "distance": {"value": 1.2, "unit": "[nmi_i]"},
        "bearing": {"value": 45, "unit": "deg"},
    }
    step = catalogue.edit_track("p", "track-blue", edit, AGENT)
    assert step == steps + 1
    record = last_record(catalogue)
    assert record.notes == ["BLUE ONE moved 1.20 nmi 045.0°T"]
    assert str(record.kind) == "edit" and record.agent == AGENT
    assert record.selected == ["track-blue"]
    assert parameters(record) == {"distance": (1.2, "[nmi_i]"), "bearing": (45.0, "deg")}
    after = feature(catalogue, "track-blue")
    for old, new in zip(BLUE.geometry.coordinates, after.geometry.coordinates, strict=True):
        distance, bearing = range_bearing(Position(*old), Position(*new))
        assert distance.value == pytest.approx(1.2 * 1852, abs=1e-6)
        assert bearing.value == pytest.approx(45)
    valid(catalogue)
    # Undo puts it back exactly; redo moves it again.
    catalogue.history("p").undo()
    assert feature(catalogue, "track-blue").geometry.coordinates == BLUE.geometry.coordinates
    catalogue.history("p").redo()
    assert feature(catalogue, "track-blue").geometry == after.geometry


def test_moving_a_period_moves_only_its_fixes_and_the_joins_jump(catalogue) -> None:
    edit = {
        "action": "move",
        "distance": {"value": 2, "unit": "km"},
        "bearing": {"value": 180, "unit": "deg"},
        "period": {"start": at(15), "end": at(30)},
    }
    catalogue.edit_track("p", "track-blue", edit, AGENT)
    after = feature(catalogue, "track-blue").geometry.coordinates
    before = BLUE.geometry.coordinates
    assert [i for i in range(6) if after[i] != before[i]] == [2, 3]
    record = last_record(catalogue)
    assert record.notes == [
        "BLUE ONE part moved 1.08 nmi 180.0°T",
        "Only the fixes from 09:15:00Z to 09:30:00Z",
    ]
    assert parameters(record)["period_start"] == at(15)
    valid(catalogue)


def test_rotating_a_track_is_one_step_with_its_pivot(catalogue) -> None:
    edit = {"action": "rotate", "angle": {"value": -20, "unit": "deg"}}
    catalogue.edit_track("p", "track-blue", edit, AGENT, current_time=at(31))
    record = last_record(catalogue)
    # The pivot: the fix nearest current time, 09:30.
    pivot = Position(*BLUE.geometry.coordinates[3])
    assert record.notes[0] == "BLUE ONE rotated 20.0° anticlockwise"
    assert record.notes[1].startswith("About 50°00.000'N 003°51.000'W")
    assert parameters(record)["pivot_longitude"] == pivot.longitude
    after = feature(catalogue, "track-blue")
    assert after.geometry.coordinates[3] == BLUE.geometry.coordinates[3]
    assert after.properties.courses.values == pytest.approx([70.0] * 6)
    # A pivot given is used.
    edit = {"action": "rotate", "angle": {"value": 5, "unit": "deg"}, "pivot": [-4.5, 50.5]}
    catalogue.edit_track("p", "track-red", edit, AGENT)
    assert last_record(catalogue).notes == [
        "RED ONE rotated 5.0° clockwise",
        "About 50°30.000'N 004°30.000'W",
    ]
    valid(catalogue)


def test_track_changes_that_cannot_be_made_say_so_and_change_nothing(catalogue) -> None:
    steps = len(catalogue.history("p").steps())
    with pytest.raises(CatalogueError, match="a move needs a distance and a bearing"):
        catalogue.edit_track(
            "p", "track-blue", {"action": "move", "distance": {"value": 1, "unit": "m"}}, AGENT
        )
    with pytest.raises(CatalogueError, match="Say how to change the track"):
        catalogue.edit_track("p", "track-blue", {"action": "stretch"}, AGENT)
    with pytest.raises(CatalogueError, match="early bearings is not a track"):
        catalogue.edit_track(
            "p", "early", {"action": "rotate", "angle": {"value": 1, "unit": "deg"}}, AGENT
        )
    with pytest.raises(CatalogueError, match="no fixes from"):
        period = {"start": at(500), "end": at(600)}
        catalogue.edit_track(
            "p",
            "track-blue",
            {"action": "rotate", "angle": {"value": 1, "unit": "deg"}, "period": period},
            AGENT,
        )
    # Nothing to move: nothing recorded.
    zero = {
        "action": "move",
        "distance": {"value": 0, "unit": "m"},
        "bearing": {"value": 0, "unit": "deg"},
    }
    assert catalogue.edit_track("p", "track-blue", zero, AGENT) is None
    assert len(catalogue.history("p").steps()) == steps


def test_a_track_change_over_a_change_made_elsewhere_is_refused(catalogue) -> None:
    base = catalogue.history("p").base()
    edit = {
        "action": "move",
        "distance": {"value": 1, "unit": "km"},
        "bearing": {"value": 0, "unit": "deg"},
    }
    catalogue.edit_track("p", "track-red", edit, models.AgentRef(kind="person", name="a colleague"))
    with pytest.raises(Conflict):
        catalogue.edit_track("p", "track-blue", edit, AGENT, base)
    with pytest.raises(Conflict):
        catalogue.split_track("p", "track-blue", at(25), AGENT, base)
    with pytest.raises(Conflict):
        catalogue.merge_tracks("p", ["track-blue", "track-blue-later"], AGENT, base)


# --- Splitting --------------------------------------------------------------------------


def test_splitting_makes_two_tracks_in_one_step(catalogue) -> None:
    step, parts = catalogue.split_track("p", "track-blue", at(25), AGENT)
    assert parts == ["track-blue", "track-blue-one-2"]
    first, second = (feature(catalogue, i) for i in parts)
    assert (first.properties.name, second.properties.name) == ("BLUE ONE (1)", "BLUE ONE (2)")
    # Before the time, and from it on; every array cut at the same place.
    assert first.properties.times == BLUE.properties.times[:3]
    assert second.properties.times == BLUE.properties.times[3:]
    assert first.geometry.coordinates + second.geometry.coordinates == BLUE.geometry.coordinates
    for part in (first, second):
        n = len(part.geometry.coordinates)
        assert len(part.properties.speeds.values) == len(part.properties.courses.values) == n
        assert part.properties.style.colour == "#0064bd"
        assert part.properties.provenance == BLUE.properties.provenance
    plot = catalogue.read_plot("p")
    ids = [f.id for f in plot.features]
    assert len(ids) == len(set(ids))
    assert ids.index("track-blue-one-2") == ids.index("track-blue") + 1
    # Sensors from the time on go with the second part; named sets hold both.
    assert feature(catalogue, "early").properties.host_track_id == "track-blue"
    assert feature(catalogue, "late").properties.host_track_id == "track-blue-one-2"
    sets = {s.id: s.feature_ids for s in plot.named_sets}
    assert sets["set-1"] == ["track-blue", "track-blue-one-2"]
    record = last_record(catalogue)
    assert record.notes == ["BLUE ONE split at 09:25:00Z", "Into BLUE ONE (1) and BLUE ONE (2)"]
    assert parameters(record) == {
        "at": at(25),
        "first_name": "BLUE ONE (1)",
        "second_name": "BLUE ONE (2)",
    }
    valid(catalogue)
    # One undo puts the one track back.
    catalogue.history("p").undo()
    restored = catalogue.read_plot("p")
    assert "track-blue-one-2" not in {f.id for f in restored.features}
    assert feature(catalogue, "track-blue") == BLUE


def test_a_split_takes_names_and_needs_two_fixes_each_side(catalogue) -> None:
    _, parts = catalogue.split_track("p", "track-red", at(20), AGENT, names=["Before", "After"])
    assert [feature(catalogue, i).properties.name for i in parts] == ["Before", "After"]
    assert parts[1] == "track-after"
    with pytest.raises(
        CatalogueError,
        match=r"BLUE ONE was not split at 09:05:00Z: it has 1 fix before then and 5 fixes "
        r"from then on, and each part needs at least 2",
    ):
        catalogue.split_track("p", "track-blue", at(5), AGENT)
    with pytest.raises(CatalogueError, match="different names"):
        catalogue.split_track("p", "track-blue", at(25), AGENT, names=["Same", "Same"])


def test_a_fix_at_the_split_time_starts_the_second_part() -> None:
    first, second = split(BLUE, parse_utc(at(20)), ("A", "B"), "b")
    assert first.properties.times[-1] == at(10) and second.properties.times[0] == at(20)


# --- Merging ----------------------------------------------------------------------------


def test_merging_joins_tracks_in_time_order_in_one_step(catalogue) -> None:
    # Given latest first: still joined in time order, under the earliest's id.
    step, merged_id = catalogue.merge_tracks("p", ["track-blue-later", "track-blue"], AGENT)
    assert merged_id == "track-blue"
    merged = feature(catalogue, merged_id)
    assert merged.properties.name == "BLUE ONE"
    assert merged.properties.times == BLUE.properties.times + BLUE_LATER.properties.times
    times = [parse_utc(t) for t in merged.properties.times]
    assert times == sorted(times)
    assert (
        merged.geometry.coordinates == BLUE.geometry.coordinates + BLUE_LATER.geometry.coordinates
    )
    assert (
        len(merged.properties.speeds.values) == 10 and len(merged.properties.courses.values) == 10
    )
    assert [r.id for r in merged.properties.provenance] == [
        "origin-track-blue",
        "origin-track-blue-later",
    ]
    plot = catalogue.read_plot("p")
    assert "track-blue-later" not in {f.id for f in plot.features}
    assert feature(catalogue, "second").properties.host_track_id == "track-blue"
    assert {s.id: s.feature_ids for s in plot.named_sets}["set-2"] == ["track-blue"]
    record = last_record(catalogue)
    assert record.notes == ["BLUE ONE and BLUE TWO merged", "Into BLUE ONE"]
    assert record.selected == ["track-blue-later", "track-blue"]
    valid(catalogue)
    catalogue.history("p").undo()
    assert feature(catalogue, "track-blue-later") == BLUE_LATER
    assert feature(catalogue, "track-blue") == BLUE


def test_tracks_that_overlap_in_time_are_not_merged_and_the_message_says_where(catalogue) -> None:
    steps = len(catalogue.history("p").steps())
    with pytest.raises(
        CatalogueError,
        match=r"The tracks were not merged: they overlap in time "
        r"\(RED ONE and BLUE ONE from 09:00:00Z to 09:40:00Z\)",
    ):
        catalogue.merge_tracks("p", ["track-blue", "track-red"], AGENT)
    with pytest.raises(CatalogueError, match="two or more tracks"):
        catalogue.merge_tracks("p", ["track-blue"], AGENT)
    assert len(catalogue.history("p").steps()) == steps


def test_tracks_that_only_meet_do_not_overlap() -> None:
    a = track("a", "A", [[0, 0], [0.1, 0]], 0)
    b = track("b", "B", [[0.2, 0], [0.3, 0]], 10)  # starts as A ends
    assert overlaps([a, b]) == []
    merged, _ = merge([a, b], "AB")
    assert merged.properties.name == "AB" and len(merged.properties.times) == 4


def test_series_not_every_track_has_are_not_kept_and_the_notes_say_so() -> None:
    a = track("a", "A", [[0, 0], [0.1, 0]], 0)
    b = track("b", "B", [[0.2, 0], [0.3, 0]], 30, courses=False)
    merged, notes = merge([a, b])
    assert merged.properties.courses is None
    assert notes == ["Courses not kept: B had none"]
    assert len(merged.properties.speeds.values) == 4


def test_a_move_too_small_for_the_decimals_shown_is_named_in_its_own_unit() -> None:
    from debrief_stac.tracks import describe_move

    note = describe_move("BLUE ONE", Quantity(0.00054, "[nmi_i]"), Quantity(90, "deg"), False)
    assert note == "BLUE ONE moved 0.00054 nmi 090.0°T"
