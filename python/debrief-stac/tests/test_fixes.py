"""Cleaning tracks: jumps found and shown before they are removed, smoothing previewed
before it is applied, and fixes marked with a colour, label or comment of their own;
each change one step in the plot's history with its parameters, undone and redone like
any change, and never made over a change made elsewhere (CAP-01, CAP-02, EXT-14,
SUB-19, SUB-21, SUB-24, SUB-28)."""

import math
from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, destination, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import DocumentKind, dump_document, load_document, models
from debrief_stac import Catalogue, CatalogueError, Changes, Conflict
from debrief_stac.fixes import (
    MAX_RUN,
    default_threshold,
    describe_largest,
    find_jumps,
    marked,
    median_speed,
    smoothed,
    without_fixes,
)
from debrief_stac.tracks import TrackError, merge, moved, rotated, split

AGENT = models.AgentRef(kind="person", name="analyst")
COLLEAGUE = models.AgentRef(kind="person", name="a colleague")
T0 = parse_utc("2026-10-11T09:00:00.000Z")
MINUTE = 60_000
KN = 1852.0 / 3600.0  # metres a second in a knot


def at(minutes: float) -> str:
    return format_utc(T0 + int(minutes * MINUTE))


def steady(
    n: int,
    knots: float = 10.0,
    start: tuple[float, float] = (-4.0, 50.0),
    course: float = 90.0,
    minutes: float = 1.0,
) -> list[list[float]]:
    """n fixes a minute apart (or minutes) at knots along course, along the geodesic."""
    origin = Position(*start)
    out = []
    for i in range(n):
        p = destination(
            origin, Quantity(course, "deg"), Quantity(knots * KN * 60 * minutes * i, "m")
        )
        out.append([p.longitude, p.latitude])
    return out


def track(
    positions: list[list[float]],
    *,
    track_id: str = "track-blue",
    name: str = "BLUE ONE",
    start: float = 0,
    minutes: float = 1.0,
    courses: list[float] | None = None,
    marks: list[dict] | None = None,
) -> models.TrackFeature:
    n = len(positions)
    props = {
        "kind": "track",
        "name": name,
        "times": [at(start + minutes * i) for i in range(n)],
        "speeds": {"unit": "[kn_i]", "values": [10.0 + (i % 3) for i in range(n)]},
        "courses": {"unit": "deg", "values": courses or [90.0] * n},
        "depths": {"unit": "m", "values": [float(i) for i in range(n)]},
        "style": {"colour": "#0064bd"},
    }
    if marks:
        props["fix_marks"] = marks
    return models.TrackFeature(
        type="Feature",
        id=track_id,
        geometry=models.LineStringGeometry(type="LineString", coordinates=positions),
        properties=models.TrackProperties(**props),
    )


def jumped(positions: list[list[float]], index: int, north_m: float) -> list[list[float]]:
    """positions with the fix at index taken north_m north: a GPS glitch."""
    out = [list(p) for p in positions]
    p = destination(Position(*out[index]), Quantity(0, "deg"), Quantity(north_m, "m"))
    out[index] = [p.longitude, p.latitude]
    return out


def jump_times(t: models.TrackFeature, threshold: float | None = None, period=None) -> list[str]:
    limit = Quantity(threshold, "[kn_i]") if threshold is not None else None
    return [j.time for j in find_jumps(t, limit, period)[1]]


# --- Finding jumps ------------------------------------------------------------------------


def test_one_fix_off_the_track_is_a_jump_and_its_neighbours_are_not() -> None:
    t = track(jumped(steady(20), 7, 2000))  # 2 km in a minute: about 65 kn
    used, jumps = find_jumps(t)
    assert [j.index for j in jumps] == [7]
    assert jumps[0].time == at(7)
    assert jumps[0].since == at(6)
    assert jumps[0].speed_kn == pytest.approx(65, abs=2)
    assert used.value == pytest.approx(30.0)  # three times the median of 10 kn


def test_the_default_threshold_is_three_times_the_median_never_below_ten_knots() -> None:
    assert median_speed(track(steady(10, 12))).value == pytest.approx(12, abs=0.01)
    assert default_threshold(track(steady(10, 12))).value == pytest.approx(36.0, abs=0.1)
    # A ship at anchor: its noise is not a jump, so the floor.
    assert default_threshold(track(steady(10, 0.5))).value == 10.0
    assert str(default_threshold(track(steady(10, 0.5))).unit) == "[kn_i]"


def test_a_burst_of_bad_fixes_in_a_row_is_found_whole() -> None:
    positions = steady(30)
    for i in (10, 11, 12):
        positions = jumped(positions, i, 3000)
    assert jump_times(track(positions)) == [at(10), at(11), at(12)]


def test_the_second_of_two_bad_fixes_is_found_though_reachable_from_the_last_good_one() -> None:
    # 1 nmi north, two fixes in a row: 60 kn from the fix before, but only about 30 kn over
    # the two minutes from the last good fix to the second, just under the threshold.
    positions = jumped(jumped(steady(30), 10, 1852), 11, 1852)
    assert jump_times(track(positions), threshold=31) == [at(10), at(11)]


def test_two_jumps_with_a_good_fix_between_are_two_jumps() -> None:
    positions = jumped(jumped(steady(30), 10, 3000), 12, 3000)
    assert jump_times(track(positions)) == [at(10), at(12)]


def test_a_track_that_goes_off_and_stays_is_not_a_jump() -> None:
    # The platform really goes somewhere: more than MAX_RUN fixes, and the track goes on.
    positions = steady(12) + [
        [p[0], p[1] + 0.2] for p in steady(MAX_RUN + 4, start=(-4.0 + 12 * 0.0043, 50.0))
    ]
    assert jump_times(track(positions)) == []


def test_a_ship_getting_under_way_at_the_end_is_not_a_jump() -> None:
    at_anchor = [[-4.0, 50.0]] * 20
    under_way = steady(4, 11, start=(-4.0, 50.0))[1:]
    assert jump_times(track(at_anchor + under_way)) == []


def test_the_first_and_last_fixes_can_be_jumps() -> None:
    positions = jumped(jumped(steady(15), 0, 4000), 14, 4000)
    assert jump_times(track(positions)) == [at(0), at(14)]


def at_one_time(north_m: float = 2000) -> models.TrackFeature:
    """Ten fixes, and an eleventh at the same time as the fifth, north_m north of it."""
    positions = steady(10)
    positions.insert(5, jumped(positions, 4, north_m)[4])
    t = track(positions)
    times = list(t.properties.times)
    times[5] = times[4]  # the same time as the fix before, somewhere else
    return t.model_copy(
        update={"properties": t.properties.model_copy(update={"times": sorted(times)})}
    )


def test_two_fixes_at_one_time_in_different_places_is_a_jump() -> None:
    (jump,) = find_jumps(at_one_time())[1]
    assert jump.index == 5 and math.isinf(jump.speed_kn)


def test_a_sprint_between_drifts_is_not_a_jump() -> None:
    # Sprint and drift: 3 kn, then 20 kn for three minutes, then 3 kn. The track goes on
    # smoothly from where the sprint took it, so nothing is offered, though it is far
    # above three times the median speed.
    positions = steady(31, 3)
    for knots, n in ((20, 3), (3, 30)):
        positions += steady(n + 1, knots, start=tuple(positions[-1]))[1:]
    assert jump_times(track(positions)) == []


def test_removing_a_jump_at_the_time_of_another_fix_keeps_the_other() -> None:
    t = at_one_time()
    (jump,) = find_jumps(t)[1]
    after, _ = without_fixes(t, [jump.time])
    assert len(after.properties.times) == 10
    assert after.properties.times.count(jump.time) == 1
    assert after.geometry.coordinates[4] == t.geometry.coordinates[4]  # the good one kept
    # Neither of two fixes at a time is a jump (they are in one place): which to remove
    # cannot be told, so nothing is.
    with pytest.raises(TrackError, match="2 fixes at 09:04:00Z"):
        without_fixes(at_one_time(0.1), [jump.time])


def test_the_threshold_decides_and_the_period_limits() -> None:
    positions = jumped(jumped(steady(30), 5, 600), 20, 3000)  # about 20 kn, and about 100 kn
    t = track(positions)
    assert jump_times(t) == [at(20)]  # 20 kn is under three times 10 kn
    assert jump_times(t, threshold=15) == [at(5), at(20)]
    assert jump_times(t, threshold=150) == []
    assert jump_times(t, threshold=15, period=(T0, T0 + 10 * MINUTE)) == [at(5)]
    with pytest.raises(TrackError, match="above zero"):
        find_jumps(t, Quantity(0, "[kn_i]"))
    # In any unit: 15 kn in metres a second.
    assert jump_times(t, threshold=None) == [j.time for j in find_jumps(t)[1]]
    assert [j.time for j in find_jumps(t, Quantity(15 * KN, "m/s"))[1]] == [at(5), at(20)]


def test_a_track_of_two_fixes_has_no_jumps_to_find() -> None:
    assert jump_times(track([[-4.0, 50.0], [10.0, 60.0]])) == []


# --- Removing jumps -----------------------------------------------------------------------


def test_removing_fixes_keeps_every_series_and_mark_in_step() -> None:
    marks = [
        {"time": at(2), "label": "kept"},
        {"time": at(3), "comment": "goes with its fix"},
        {"time": at(9), "colour": "#e01c3e"},
    ]
    t = track(steady(10), marks=marks)
    after, lost = without_fixes(t, [at(3), at(5)])
    props = after.properties
    keep = [0, 1, 2, 4, 6, 7, 8, 9]
    assert props.times == [t.properties.times[i] for i in keep]
    assert after.geometry.coordinates == [t.geometry.coordinates[i] for i in keep]
    for name in ("speeds", "courses", "depths"):
        assert getattr(props, name).values == [getattr(t.properties, name).values[i] for i in keep]
    assert [m.time for m in props.fix_marks] == [at(2), at(9)]
    assert lost == 1


def test_removal_is_refused_for_a_time_with_no_fix_or_too_few_left() -> None:
    t = track(steady(3))
    with pytest.raises(TrackError, match="no fix at 09:00:30Z"):
        without_fixes(t, [at(0.5)])
    with pytest.raises(TrackError, match="needs at least 2"):
        without_fixes(t, [at(0), at(1)])
    with pytest.raises(TrackError, match="Choose the fixes"):
        without_fixes(t, [])


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    positions = jumped(jumped(jumped(steady(40), 8, 2500), 21, 3000), 22, 3100)
    blue = track(positions, marks=[{"time": at(8), "label": "Glitch?"}])
    red = track(steady(40, 6, start=(-4.0, 50.1)), track_id="track-red", name="RED ONE")
    origin = models.ProvRecord(id="op-1", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[blue, red]))
    return catalogue


def feature(catalogue: Catalogue, feature_id: str = "track-blue") -> models.TrackFeature:
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
    load_document(DocumentKind.PLOT, dump_document(DocumentKind.PLOT, catalogue.read_plot("p")))


def test_jumps_are_shown_first_and_finding_them_changes_nothing(catalogue) -> None:
    steps = len(catalogue.history("p").steps())
    used, median, jumps = catalogue.find_jumps("p", "track-blue")
    assert [j.time for j in jumps] == [at(8), at(21), at(22)]
    assert median.value == pytest.approx(10, abs=0.1)
    assert used.value == pytest.approx(30.0, abs=0.1)
    assert len(catalogue.history("p").steps()) == steps


def test_removing_the_jumps_confirmed_is_one_step_with_its_parameters(catalogue) -> None:
    steps = len(catalogue.history("p").steps())
    threshold = Quantity(30, "[kn_i]")
    step = catalogue.remove_jumps(
        "p", "track-blue", [at(8), at(21), at(22)], AGENT, threshold=threshold
    )
    assert step == steps + 1
    record = last_record(catalogue)
    assert record.notes == [
        "BLUE ONE: 3 jumps removed",
        "At 09:08:00Z, 09:21:00Z and 09:22:00Z",
        "Each faster than 30.0 kn to reach",
        "1 marked fix removed with them",
    ]
    assert str(record.kind) == "edit" and record.agent == AGENT
    assert record.selected == ["track-blue"]
    assert parameters(record) == {
        "fix_times": f"{at(8)} {at(21)} {at(22)}",
        "threshold": (30.0, "[kn_i]"),
    }
    after = feature(catalogue)
    assert len(after.properties.times) == 37
    assert after.properties.fix_marks is None
    assert catalogue.find_jumps("p", "track-blue")[2] == []
    valid(catalogue)
    # Undo puts every fix back; redo takes them out again.
    catalogue.history("p").undo()
    assert len(feature(catalogue).properties.times) == 40
    assert feature(catalogue).properties.fix_marks[0].label == "Glitch?"
    catalogue.history("p").redo()
    assert feature(catalogue) == after


def test_the_analyst_may_keep_some_of_the_jumps_found(catalogue) -> None:
    catalogue.remove_jumps("p", "track-blue", [at(8)], AGENT)
    assert last_record(catalogue).notes == [
        "BLUE ONE: 1 jump removed",
        "At 09:08:00Z",
        "1 marked fix removed with them",
    ]
    assert [j.time for j in catalogue.find_jumps("p", "track-blue")[2]] == [at(21), at(22)]


def test_removing_jumps_over_a_change_made_elsewhere_is_refused(catalogue) -> None:
    base = catalogue.history("p").base()
    catalogue.mark_fix("p", "track-red", at(3), {"label": "Turn"}, COLLEAGUE)
    with pytest.raises(Conflict):
        catalogue.remove_jumps("p", "track-blue", [at(8)], AGENT, base)
    with pytest.raises(Conflict):
        catalogue.smooth_track("p", "track-blue", 5, AGENT, base)
    with pytest.raises(Conflict):
        catalogue.mark_fix("p", "track-blue", at(3), {"label": "Turn"}, AGENT, base)
    # Finding jumps reads the plot the analyst is looking at, and changes nothing.
    assert len(catalogue.find_jumps("p", "track-blue", base=base)[2]) == 3
    assert len(feature(catalogue).properties.times) == 40


def test_removing_jumps_that_cannot_be_made_says_so(catalogue) -> None:
    with pytest.raises(CatalogueError, match="Choose the jumps"):
        catalogue.remove_jumps("p", "track-blue", [], AGENT)
    with pytest.raises(CatalogueError, match="no fix at 09:08:30Z"):
        catalogue.remove_jumps("p", "track-blue", [at(8.5)], AGENT)
    with pytest.raises(CatalogueError, match="not a track|no feature"):
        catalogue.remove_jumps("p", "nothing", [at(8)], AGENT)


# --- Smoothing ------------------------------------------------------------------------------


def wobbly(n: int = 30) -> list[list[float]]:
    """A track east at 10 kn, every other fix 60 m north: noise smoothing should take out."""
    return [jumped(steady(n), i, 60)[i] if i % 2 else p for i, p in enumerate(steady(n))]


def test_smoothing_keeps_the_ends_and_the_times_and_says_how_far_fixes_moved() -> None:
    t = track(wobbly())
    after, smoothing = smoothed(t, 5, list(range(30)))
    assert after.geometry.coordinates[0] == t.geometry.coordinates[0]
    assert after.geometry.coordinates[-1] == t.geometry.coordinates[-1]
    assert after.properties.times == t.properties.times
    assert after.properties.depths == t.properties.depths
    moves = [
        range_bearing(Position(*a), Position(*b))[0].value
        for a, b in zip(t.geometry.coordinates, after.geometry.coordinates, strict=True)
    ]
    assert smoothing.moved == sum(1 for m in moves if m > 1e-6) == 28
    assert smoothing.largest_m == pytest.approx(max(moves), abs=1e-6)
    assert smoothing.largest_time == t.properties.times[moves.index(max(moves))]
    assert 20 < smoothing.largest_m < 60
    # Smoother: the fixes' north-south wobble is much smaller.
    wobble = lambda ps: max(abs(a[1] - b[1]) for a, b in zip(ps, ps[1:], strict=False))  # noqa: E731
    assert wobble(after.geometry.coordinates[3:-3]) < wobble(t.geometry.coordinates) / 3
    assert describe_largest(smoothing).startswith("28 fixes moved; the most a fix moved: ")


def test_a_straight_steady_track_is_hardly_moved() -> None:
    _, smoothing = smoothed(track(steady(20)), 7, list(range(20)))
    assert smoothing.largest_m < 0.05


def test_smoothing_never_averages_across_a_gap_in_the_data() -> None:
    # An hour of fixes, three hours with none while the ship went 30 nmi, an hour more.
    before = steady(20, 10)
    resumed = destination(Position(*before[-1]), Quantity(90, "deg"), Quantity(30 * 1852, "m"))
    t = track(before + steady(20, 10, start=(resumed.longitude, resumed.latitude)))
    times = [at(i) for i in range(20)] + [at(200 + i) for i in range(20)]
    t = t.model_copy(update={"properties": t.properties.model_copy(update={"times": times})})
    after, smoothing = smoothed(t, 5, list(range(40)))
    assert smoothing.largest_m < 0.05  # each side straight and steady: hardly moved
    assert after.geometry.coordinates[19] == t.geometry.coordinates[19]
    assert after.geometry.coordinates[20] == t.geometry.coordinates[20]


def test_smoothing_only_a_period_keeps_its_ends_and_the_rest() -> None:
    t = track(wobbly())
    after, _ = smoothed(t, 3, list(range(10, 21)))
    for i in [*range(0, 11), *range(20, 30)]:
        assert after.geometry.coordinates[i] == t.geometry.coordinates[i], i
    assert any(after.geometry.coordinates[i] != t.geometry.coordinates[i] for i in range(11, 20))


def test_courses_are_averaged_as_directions_and_speeds_with_the_positions() -> None:
    courses = [350.0, 10.0] * 5
    t = track(steady(10), courses=courses)
    after, _ = smoothed(t, 3, list(range(10)))
    values = after.properties.courses.values
    assert values[0] == 350.0 and values[-1] == 10.0
    for value in values[1:-1]:
        assert min(value, 360 - value) < 5, value  # about north, never about 180
    assert after.properties.speeds.values[1] == pytest.approx((10 + 11 + 12) / 3)


def test_smoothing_across_the_antimeridian_and_far_north() -> None:
    for start in ((179.99, -30.0), (10.0, 88.5)):
        t = track(wobbly_from(start))
        after, smoothing = smoothed(t, 5, list(range(20)))
        assert smoothing.largest_m < 60
        assert all(-180 <= lon <= 180 for lon, _ in after.geometry.coordinates)


def wobbly_from(start: tuple[float, float]) -> list[list[float]]:
    base = steady(20, start=start)
    return [jumped(base, i, 60)[i] if i % 2 else p for i, p in enumerate(base)]


def test_smoothing_needs_an_odd_window_and_three_fixes() -> None:
    t = track(steady(10))
    for window in (2, 4, 1, 101):
        with pytest.raises(TrackError, match="odd number of fixes"):
            smoothed(t, window, list(range(10)))
    with pytest.raises(TrackError, match="needs at least 3"):
        smoothed(t, 3, [4, 5])


def test_smoothing_is_previewed_then_applied_as_one_step(catalogue) -> None:
    steps = len(catalogue.history("p").steps())
    preview, smoothing = catalogue.smoothing_preview("p", "track-red", 5)
    assert len(catalogue.history("p").steps()) == steps  # a preview changes nothing
    assert smoothing.moved == 0  # RED ONE runs straight and steady
    assert catalogue.smooth_track("p", "track-red", 5, AGENT) is None
    preview, smoothing = catalogue.smoothing_preview("p", "track-blue", 5)
    step, applied = catalogue.smooth_track("p", "track-blue", 5, AGENT)
    assert step == steps + 1 and applied == smoothing
    assert feature(catalogue).geometry == preview.geometry
    record = last_record(catalogue)
    assert record.notes[0] == "BLUE ONE smoothed over 5 fixes"
    assert record.notes[1] == describe_largest(smoothing)
    assert parameters(record) == {"window": 5.0}
    valid(catalogue)
    catalogue.history("p").undo()
    assert feature(catalogue).geometry != preview.geometry


def test_smoothing_a_period_is_named_part_and_says_the_period(catalogue) -> None:
    catalogue.smooth_track("p", "track-blue", 3, AGENT, period=(at(5), at(12)))
    record = last_record(catalogue)
    assert record.notes[0] == "BLUE ONE part smoothed over 3 fixes"
    assert record.notes[2] == "Only the fixes from 09:05:00Z to 09:12:00Z"
    assert parameters(record)["period_start"] == at(5)
    with pytest.raises(CatalogueError, match="odd number"):
        catalogue.smooth_track("p", "track-blue", 4, AGENT)


# --- Marked fixes ---------------------------------------------------------------------------


def test_a_fix_is_coloured_labelled_and_commented_each_as_one_step(catalogue) -> None:
    history = catalogue.history("p")
    steps = len(history.steps())
    catalogue.mark_fix("p", "track-red", at(3), {"colour": "#e01c3e"}, AGENT, colour_name="red")
    assert last_record(catalogue).notes == ["RED ONE fix at 09:03:00Z coloured red"]
    assert parameters(last_record(catalogue)) == {"fix_time": at(3), "colour": "#e01c3e"}
    catalogue.mark_fix("p", "track-red", at(3), {"label": " Turn 1 "}, AGENT)
    assert last_record(catalogue).notes == ["RED ONE fix at 09:03:00Z labelled 'Turn 1'"]
    catalogue.mark_fix("p", "track-red", at(3), {"comment": "Wheel over"}, AGENT)
    assert last_record(catalogue).notes == ["RED ONE fix at 09:03:00Z: comment added"]
    catalogue.mark_fix("p", "track-red", at(3), {"comment": "Wheel over, 15° rudder"}, AGENT)
    assert last_record(catalogue).notes == ["RED ONE fix at 09:03:00Z: comment changed"]
    assert len(history.steps()) == steps + 4
    (mark,) = feature(catalogue, "track-red").properties.fix_marks
    assert (mark.time, mark.colour, mark.label, mark.comment) == (
        at(3),
        "#e01c3e",
        "Turn 1",
        "Wheel over, 15° rudder",
    )
    valid(catalogue)
    # The same again changes nothing, and is no step.
    assert catalogue.mark_fix("p", "track-red", at(3), {"label": "Turn 1"}, AGENT) is None
    # Taken away one by one; with nothing left, the mark goes.
    catalogue.mark_fix("p", "track-red", at(3), {"label": None}, AGENT)
    assert last_record(catalogue).notes == ["RED ONE fix at 09:03:00Z: label removed"]
    catalogue.mark_fix("p", "track-red", at(3), {"colour": None, "comment": ""}, AGENT)
    assert last_record(catalogue).notes == ["RED ONE fix at 09:03:00Z changed"]
    assert feature(catalogue, "track-red").properties.fix_marks is None
    valid(catalogue)
    history.goto(steps)
    assert feature(catalogue, "track-red").properties.fix_marks is None
    history.goto(steps + 4)
    assert feature(catalogue, "track-red").properties.fix_marks[0].comment.startswith("Wheel")


def test_marks_stay_in_time_order(catalogue) -> None:
    for minute in (9, 2, 5):
        catalogue.mark_fix("p", "track-red", at(minute), {"label": f"m{minute}"}, AGENT)
    assert [m.label for m in feature(catalogue, "track-red").properties.fix_marks] == [
        "m2",
        "m5",
        "m9",
    ]
    valid(catalogue)


def test_marking_a_fix_that_cannot_be_marked_says_so(catalogue) -> None:
    with pytest.raises(CatalogueError, match="no fix at 09:03:30Z"):
        catalogue.mark_fix("p", "track-red", at(3.5), {"label": "x"}, AGENT)
    with pytest.raises(CatalogueError, match="not a colour"):
        catalogue.mark_fix("p", "track-red", at(3), {"colour": "red"}, AGENT)
    with pytest.raises(CatalogueError, match="its colour, label or comment"):
        catalogue.mark_fix("p", "track-red", at(3), {"size": "big"}, AGENT)
    with pytest.raises(CatalogueError, match="its colour, label or comment"):
        catalogue.mark_fix("p", "track-red", at(3), {}, AGENT)
    with pytest.raises(CatalogueError, match="is not a time"):
        catalogue.mark_fix("p", "track-red", "09:03", {"label": "x"}, AGENT)


MARKS = [
    {"time": at(1), "label": "one"},
    {"time": at(4), "colour": "#e01c3e"},
    {"time": at(7), "comment": "seven"},
]


def test_marks_survive_a_move_and_a_rotation() -> None:
    t = track(steady(9), marks=MARKS)
    after = moved(t, Quantity(1, "km"), Quantity(45, "deg"), list(range(9)))
    assert after.properties.fix_marks == t.properties.fix_marks
    after = rotated(t, Position(-4.0, 50.0), Quantity(30, "deg"), list(range(9)))
    assert after.properties.fix_marks == t.properties.fix_marks


def test_marks_go_with_their_fixes_when_a_track_is_split_and_merged() -> None:
    t = track(steady(9), marks=MARKS)
    first, second = split(t, parse_utc(at(4)), ("A", "B"), "track-b")
    assert [m.time for m in first.properties.fix_marks] == [at(1)]
    assert [m.time for m in second.properties.fix_marks] == [at(4), at(7)]
    again, notes = merge([second, first])
    assert again.properties.fix_marks == t.properties.fix_marks
    assert notes == []
    # A part with no marks has none, not an empty list.
    bare, _ = split(track(steady(9), marks=MARKS[2:]), parse_utc(at(4)), ("A", "B"), "track-b")
    assert bare.properties.fix_marks is None


def test_tracks_meeting_at_a_time_both_marked_keep_the_first_mark() -> None:
    a = track(steady(3), marks=[{"time": at(2), "label": "end of A"}])
    b = track(steady(3, start=(-3.9, 50.0)), track_id="b", name="B", start=2)
    b = b.model_copy(
        update={
            "properties": b.properties.model_copy(
                update={"fix_marks": [models.FixMark(time=at(2), label="start of B")]}
            )
        }
    )
    merged, notes = merge([a, b])
    assert [m.label for m in merged.properties.fix_marks] == ["end of A"]
    assert notes == [
        "The mark on B's fix at 09:02:00Z not kept: the earlier track's fix then has a mark "
        "of its own"
    ]


def test_marks_survive_smoothing_and_split_merge_in_the_catalogue(catalogue) -> None:
    catalogue.mark_fix("p", "track-red", at(30), {"comment": "late"}, AGENT)
    catalogue.smooth_track("p", "track-blue", 5, AGENT)
    assert feature(catalogue).properties.fix_marks[0].label == "Glitch?"
    _, (first, second) = catalogue.split_track("p", "track-red", at(20), AGENT)
    assert feature(catalogue, first).properties.fix_marks is None
    assert feature(catalogue, second).properties.fix_marks[0].comment == "late"
    catalogue.merge_tracks("p", [first, second], AGENT)
    assert feature(catalogue, "track-red").properties.fix_marks[0].time == at(30)
    valid(catalogue)


def test_marked_says_what_changed() -> None:
    t = track(steady(3))
    after, note = marked(t, at(1), {"colour": "#e01c3e", "label": "Here"})
    assert note == "BLUE ONE fix at 09:01:00Z changed"
    assert marked(after, at(1), {"label": "Here"}) is None


def test_a_long_label_is_shortened_in_the_steps_name_and_kept_whole() -> None:
    after, note = marked(track(steady(3)), at(1), {"label": "Override label number one"})
    assert note == "BLUE ONE fix at 09:01:00Z labelled 'Override label …'"
    assert after.properties.fix_marks[0].label == "Override label number one"
