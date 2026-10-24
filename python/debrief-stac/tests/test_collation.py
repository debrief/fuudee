"""Collation (CAP-05, CAP-08 to CAP-12): coverage, platforms across items, source
preference per period, new data, taking it, and revisions flagged for review."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from debrief_io import import_rep
from debrief_kernel.geodesy import Position, destination, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import SCHEMA_VERSION, models
from debrief_stac import Catalogue, CatalogueError, Changes, collation
from debrief_stac import sensors as plot_sensors
from debrief_stac.catalogue import review_flags

VECTORS = Path(__file__).resolve().parents[3] / "schemas" / "vectors" / "collation.json"
AGENT = models.AgentRef(kind="person", name="analyst")
T0 = parse_utc("1995-12-12T05:00:00.000Z")


def _dm(value: float, pos: str, neg: str, width: int) -> str:
    hemi = pos if value >= 0 else neg
    value = abs(value)
    deg = int(value)
    minutes = (value - deg) * 60
    whole = int(minutes)
    return f"{deg:0{width}d} {whole:02d} {(minutes - whole) * 60:05.2f} {hemi}"


def rep_lines(name, start_min, count, step_s, origin=(-4.2, 50.3), course=90.0, knots=12.0):
    """A REP track at a steady course and speed: count fixes every step_s seconds."""
    lines = []
    quoted = f'"{name}"' if " " in name else name
    for i in range(count):
        ms = T0 + int(start_min * 60_000) + i * step_s * 1000
        metres = knots * 1852 / 3600 * (ms - T0) / 1000
        p = destination(Position(*origin), Quantity(course, "deg"), Quantity(metres, "m"))
        t = format_utc(ms)
        date, clock = t[2:4] + t[5:7] + t[8:10], t[11:13] + t[14:16] + t[17:19] + ".000"
        lines.append(
            f"{date} {clock} {quoted} @C {_dm(p.latitude, 'N', 'S', 2)} "
            f"{_dm(p.longitude, 'E', 'W', 3)} {course:05.1f} {knots:04.1f} 0"
        )
    return lines


def write_rep(folder: Path, name: str, lines: list[str]) -> Path:
    path = folder / f"{name}.rep"
    path.write_text("\n".join(lines) + "\n")
    return path


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "store", "ex", "Exercise", "Test")
    # The plot: NELSON a fix a minute 05:00 to 06:00, BLUE a fix a minute 05:00 to 05:30.
    lines = rep_lines("NELSON", 0, 61, 60) + rep_lines("BLUE", 0, 31, 60, origin=(-4.1, 50.35))
    import_rep(catalogue, write_rep(tmp_path, "serial", lines), title="Serial")
    return catalogue


def nav_log(catalogue: Catalogue, tmp_path: Path, name: str = "nav-log", **kw) -> str:
    """NELSON's own log, a fix every 10 s, 05:30 to 06:30 (half overlapping the plot's),
    under a name differing in case; and a MERCHANT the plot has never seen."""
    time.sleep(0.002)  # it comes in after the plot
    lines = rep_lines("Nelson", 30, 361, 10, **kw) + rep_lines("MERCHANT", 10, 20, 60, (-4.0, 50.2))
    return import_rep(catalogue, write_rep(tmp_path, name, lines), title="NELSON nav log").item_id


def track(catalogue: Catalogue, item: str, name: str) -> models.TrackFeature:
    plot = catalogue.read_plot(item)
    return next(
        f for f in plot.features if f.properties.kind == "track" and f.properties.name == name
    )


def platform(report: models.CoverageReport, name: str) -> models.CoveragePlatform:
    return next(p for p in report.platforms if p.name == name)


# --- Shared vectors ---------------------------------------------------------------------


def test_spans_follow_the_shared_vectors() -> None:
    for case in json.loads(VECTORS.read_text())["spans"]:
        times = [collation.ms_of(t) for t in case["times"]]
        got = [[format_utc(a), format_utc(b)] for a, b in collation.spans(times)]
        assert got == case["spans"], case["name"]


def test_platform_keys_follow_the_shared_vectors() -> None:
    for case in json.loads(VECTORS.read_text())["platform_keys"]:
        assert collation.platform_key(case["name"]) == case["key"], case["name"]


def test_periods_follow_the_shared_vectors() -> None:
    for case in json.loads(VECTORS.read_text())["periods"]:
        sources = [[(parse_utc(a), parse_utc(b)) for a, b in s] for s in case["sources"]]
        got = [
            {"start": format_utc(p.start), "end": format_utc(p.end), "sources": list(p.sources)}
            for p in collation.periods(sources)
        ]
        assert got == case["periods"], case["name"]


def test_times_read_quickly_read_as_parse_utc_does() -> None:
    for text in (
        "2023-06-15T08:00:00.000Z",
        "1995-12-31T23:59:59.999Z",
        "2024-02-29T12:30:01.250Z",
    ):
        assert collation.ms_of(text) == parse_utc(text)


# --- What an item says of itself --------------------------------------------------------


def test_every_change_keeps_the_items_revision_coverage_and_arrival(catalogue: Catalogue) -> None:
    props = catalogue.read_item("serial").properties
    assert props.created and props.debrief_revision == catalogue.history("serial").head().plot_hash
    covered = {c.name: c for c in props.debrief_coverage}
    assert covered["NELSON"].fixes == 61
    assert [(s.start, s.end) for s in covered["BLUE"].spans] == [
        ("1995-12-12T05:00:00.000Z", "1995-12-12T05:30:00.000Z")
    ]
    before = props.debrief_revision
    catalogue.set_colour("serial", ["track-nelson"], "#ff0000", AGENT)
    after = catalogue.read_item("serial").properties
    assert after.debrief_revision != before and after.created == props.created
    # Its view is not a revision: view state is not content (SUB-22).
    view, hash_ = catalogue.read_view("serial")
    catalogue.write_view("serial", {"narrative_on_map": False}, hash_)
    assert catalogue.read_item("serial").properties.debrief_revision == after.debrief_revision
    # Undo goes back to the revision before.
    catalogue.history("serial").undo()
    assert catalogue.read_item("serial").properties.debrief_revision == before


# --- Coverage, platforms and new data ---------------------------------------------------


def test_coverage_proposes_platforms_by_name_and_marks_new_data(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    report = catalogue.coverage("serial")
    assert [i.role for i in report.items] == ["this_plot"]
    assert [s.link for s in platform(report, "NELSON").sources] == ["plot"]
    item = nav_log(catalogue, tmp_path)
    report = catalogue.coverage("serial")
    nelson = platform(report, "NELSON")
    assert [(s.title, str(s.link)) for s in nelson.sources] == [
        ("Serial", "plot"),
        ("NELSON nav log", "proposed"),
    ]
    # The plot alone 05:00 to 05:30, both 05:30 to 06:00; the log's half hour after is
    # outside the plot's period, which the periods are clipped to (decision, 16 Oct 2026).
    cut = [(p.start[11:16], p.end[11:16], p.sources, p.chosen) for p in nelson.periods]
    assert cut == [
        ("05:00", "05:30", [0], 0),
        ("05:30", "06:00", [0, 1], 0),
    ]
    marked = next(i for i in report.items if i.item == item)
    assert marked.role == "other" and marked.new_data is not None
    assert marked.new_data.platforms == ["NELSON"] and marked.new_data.within_period
    assert marked.new_data.note == "New data for Serial: NELSON, within its period"


def test_an_item_from_before_the_plot_is_not_new_data(catalogue: Catalogue, tmp_path) -> None:
    item = nav_log(catalogue, tmp_path)
    # A plot made after the log: the log was there first, so it is no news to it.
    time.sleep(0.002)
    later = import_rep(
        catalogue, write_rep(tmp_path, "later", rep_lines("NELSON", 0, 10, 60)), title="Later"
    ).item_id
    report = catalogue.coverage(later)
    assert next(i for i in report.items if i.item == item).new_data is None


def test_new_data_set_aside_stays_aside_until_revised(catalogue: Catalogue, tmp_path) -> None:
    item = nav_log(catalogue, tmp_path)
    revision = catalogue.read_item(item).properties.debrief_revision
    steps = len(catalogue.history("serial").steps())
    catalogue.dismiss_new_data("serial", catalogue.id, item, revision)
    report = catalogue.coverage("serial")
    assert next(i for i in report.items if i.item == item).new_data is None
    assert len(catalogue.history("serial").steps()) == steps  # view state, never a step
    catalogue.set_colour(item, ["track-nelson"], "#00ff00", AGENT)
    report = catalogue.coverage("serial")
    assert next(i for i in report.items if i.item == item).new_data is not None


def test_a_copy_saved_from_the_plot_is_not_new_data_for_it(catalogue: Catalogue) -> None:
    """A change that conflicted, saved as a new plot (SUB-29), came in when the plot did."""
    base = catalogue.history("serial").base()
    time.sleep(0.002)
    note = models.AnnotationFeature(
        type="Feature",
        id="note-copy",
        geometry=None,
        properties=models.AnnotationProperties(
            kind="annotation", style="note", name="Mine", time="1995-12-12T05:10:00.000Z"
        ),
    )
    record = models.ProvRecord(
        id="mine", kind="edit", started_at="2026-10-16T09:00:00.000Z", agent=AGENT
    )
    copy = catalogue.save_as_new("serial", base, [record], Changes(added=[note]))
    report = catalogue.coverage("serial")
    assert next(i for i in report.items if i.item == copy).new_data is None


def test_new_data_is_limited_to_the_folder_tree_the_plot_draws_from(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    elsewhere = Catalogue.create(tmp_path / "elsewhere", "other", "Other", "Test")
    time.sleep(0.002)
    import_rep(elsewhere, write_rep(tmp_path, "far", rep_lines("NELSON", 0, 10, 60)), title="Far")
    report = catalogue.coverage("serial", [elsewhere])
    assert [i.item for i in report.items] == ["serial"]
    assert [str(s.link) for s in platform(report, "NELSON").sources] == ["plot"]


# --- Taking new data --------------------------------------------------------------------


def test_taking_new_data_fills_gaps_adds_tracks_and_is_one_step(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    item = nav_log(catalogue, tmp_path)
    before = track(catalogue, "serial", "NELSON")
    step = catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    nelson = track(catalogue, "serial", "NELSON")
    # The log's hour after the plot's, a fix every 10 s; the half hour both have stays the plot's.
    gained = len(nelson.properties.times) - len(before.properties.times)
    assert gained == 180
    assert [(s.title, s.start[11:19], s.end[11:19]) for s in nelson.properties.supplies] == [
        ("Serial", "05:00:00", "06:00:00"),
        ("NELSON nav log", "06:00:10", "06:30:00"),
    ]
    assert nelson.properties.platform_links[0].name == "Nelson"
    merchant = track(catalogue, "serial", "MERCHANT")
    assert merchant.properties.supplies[0].item == item
    records = catalogue.history("serial").steps()[step - 1].records
    # Told apart from a file's import: a tool's step, by collation (decision, 16 Oct 2026).
    assert records[0].kind == "tool" and records[0].tool.name == "debrief-stac.collation"
    assert records[0].notes[:2] == [
        "New data from NELSON nav log",
        "NELSON 180 fixes, MERCHANT added",
    ]
    assert any(
        "05:30:00Z to 06:00:00Z, where another item supplies it" in n for n in records[0].notes
    )
    assert records[0].drawn_from[0].item == item
    # The mark clears once taken; the item is drawn from.
    report = catalogue.coverage("serial")
    taken = next(i for i in report.items if i.item == item)
    assert taken.new_data is None and taken.role == "drawn_from"
    assert catalogue.read_item("serial").properties.debrief_drawn_from[0].item == item
    # One step: undone as one.
    catalogue.history("serial").undo()
    assert len(track(catalogue, "serial", "NELSON").properties.times) == 61
    assert not any(
        getattr(f.properties, "name", None) == "MERCHANT"
        for f in catalogue.read_plot("serial").features
    )


def test_no_period_is_offered_where_one_source_hands_over_to_the_next(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    # A log for NELSON 05:30 to 05:40, then on from 10 s after the plot's last fix; and a
    # colleague's serial with NELSON a fix a minute 05:00 to 07:00.
    time.sleep(0.002)
    lines = rep_lines("NELSON", 30, 61, 10) + rep_lines("NELSON", 60 + 1 / 6, 180, 10)
    item = import_rep(catalogue, write_rep(tmp_path, "log", lines), title="Log").item_id
    import_rep(
        catalogue, write_rep(tmp_path, "other", rep_lines("NELSON", 0, 121, 60)), title="Other"
    )
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    rows = [
        (p.start[11:19], p.end[11:19])
        for p in platform(catalogue.coverage("serial"), "NELSON").periods
    ]
    # 06:00:00 to 06:00:10 lies between two fixes of the stitched track: nothing to choose.
    assert ("06:00:00", "06:00:10") not in rows
    assert ("06:00:10", "06:30:00") in rows


def test_taking_new_data_keeps_the_analysts_edits(catalogue: Catalogue, tmp_path: Path) -> None:
    item = nav_log(catalogue, tmp_path)
    # Moved a mile east, labelled every 10 min, a fix marked, an annotation added.
    move = {"distance": {"value": 1, "unit": "[nmi_i]"}, "bearing": {"value": 90, "unit": "deg"}}
    catalogue.edit_track("serial", "track-nelson", {"action": "move", **move}, AGENT)
    catalogue.set_track_frequencies("serial", ["track-nelson"], {"label_interval": "10 min"}, AGENT)
    catalogue.mark_fix(
        "serial", "track-nelson", "1995-12-12T05:10:00.000Z", {"comment": "Turned"}, AGENT
    )
    catalogue.add_annotation(
        "serial", {"shape": "note", "name": "Start", "time": "1995-12-12T05:00:00.000Z"}, AGENT
    )
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    nelson = track(catalogue, "serial", "NELSON")
    assert nelson.properties.label_interval is not None
    assert nelson.properties.fix_marks[0].comment == "Turned"
    assert any(
        getattr(f.properties, "name", None) == "Start"
        for f in catalogue.read_plot("serial").features
    )
    # A new fix is a mile east of where the log puts it, as the fixes about it were moved.
    log = track(catalogue, item, "Nelson")
    at = "1995-12-12T06:15:00.000Z"
    placed = nelson.geometry.coordinates[nelson.properties.times.index(at)]
    logged = log.geometry.coordinates[log.properties.times.index(at)]
    distance, bearing = range_bearing(Position(*logged), Position(*placed))
    assert distance.to("[nmi_i]").value == pytest.approx(1.0, abs=0.002)
    assert bearing.value == pytest.approx(90.0, abs=0.5)
    notes = catalogue.history("serial").steps()[-1].records[0].notes
    assert any("follow the changes made to the track around them" in n for n in notes)


def test_taking_into_a_dead_reckoned_track_carries_its_course_changes(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    catalogue.edit_track(
        "serial", "track-nelson", {"action": "set_plotting_mode", "plotting_mode": "dr"}, AGENT
    )
    # Courses turned 10 degrees: a DR rotation changes courses.
    catalogue.edit_track(
        "serial", "track-nelson", {"action": "rotate", "angle": {"value": 10, "unit": "deg"}}, AGENT
    )
    item = nav_log(catalogue, tmp_path)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    nelson = track(catalogue, "serial", "NELSON")
    props = nelson.properties
    at = props.times.index("1995-12-12T06:20:00.000Z")
    assert props.courses.values[at] == pytest.approx(100.0, abs=0.01)
    assert props.logged_courses.values[at] == pytest.approx(90.0, abs=0.01)
    assert props.logged_positions is not None and len(props.logged_positions.coordinates) == len(
        props.times
    )


def test_nothing_new_is_refused_saying_why(catalogue: Catalogue, tmp_path: Path) -> None:
    time.sleep(0.002)
    same = import_rep(
        catalogue,
        write_rep(tmp_path, "same", rep_lines("NELSON", 10, 20, 60)),
        title="Inside the plot's",
    ).item_id
    with pytest.raises(CatalogueError, match="has nothing the plot hasn't"):
        catalogue.take_new_data("serial", catalogue.id, same, AGENT)
    with pytest.raises(CatalogueError, match="cannot take data from itself"):
        catalogue.take_new_data("serial", catalogue.id, "serial", AGENT)
    with pytest.raises(CatalogueError, match="has changed since you saw it"):
        catalogue.take_new_data("serial", catalogue.id, same, AGENT, revision="sha256:" + "0" * 64)


# --- Source preference, per period -------------------------------------------------------


def test_choosing_a_source_for_a_period_stitches_the_track(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    item = nav_log(catalogue, tmp_path)
    report = catalogue.coverage("serial")
    nelson = platform(report, "NELSON")
    log = nelson.sources[1]
    period = {"start": "1995-12-12T05:30:00.000Z", "end": "1995-12-12T06:00:00.000Z"}
    source = {"catalogue": log.catalogue, "item": log.item, "track": log.track, "name": log.name}
    step = catalogue.set_source_preference("serial", "track-nelson", period, source, AGENT)
    stitched = track(catalogue, "serial", "NELSON")
    assert [(s.title, s.start[11:19], s.end[11:19]) for s in stitched.properties.supplies] == [
        ("Serial", "05:00:00", "05:29:00"),
        ("NELSON nav log", "05:30:00", "06:00:00"),
    ]
    assert len(stitched.properties.times) == 30 + 181
    record = catalogue.history("serial").steps()[step - 1].records[0]
    assert record.notes[0] == "NELSON 05:30:00Z to 06:00:00Z from NELSON nav log"
    assert record.notes[1:3] == ["Was Serial: 31 fixes", "Now NELSON nav log: 181 fixes"]
    assert record.drawn_from[0].item == item
    # The view shows the log supplying that period now.
    nelson = platform(catalogue.coverage("serial"), "NELSON")
    assert [(p.start[11:16], p.chosen) for p in nelson.periods][:2] == [("05:00", 0), ("05:30", 1)]
    # The same choice again changes nothing; back to the plot's own data, as imported.
    assert catalogue.set_source_preference("serial", "track-nelson", period, source, AGENT) is None
    own = nelson.sources[0]
    mine = {"catalogue": own.catalogue, "item": own.item, "track": own.track, "name": own.name}
    catalogue.set_source_preference("serial", "track-nelson", period, mine, AGENT)
    back = track(catalogue, "serial", "NELSON")
    assert len(back.properties.times) == 61 and back.properties.supplies is None
    # A period the source has nothing in is refused.
    early = {"start": "1995-12-12T05:00:00.000Z", "end": "1995-12-12T05:10:00.000Z"}
    with pytest.raises(CatalogueError, match="has no data for NELSON"):
        catalogue.set_source_preference("serial", "track-nelson", early, source, AGENT)


def test_supplies_go_with_their_fixes_when_a_track_is_split(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    item = nav_log(catalogue, tmp_path)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    catalogue.split_track(
        "serial",
        "track-nelson",
        "1995-12-12T06:10:00.000Z",
        AGENT,
        names=("NELSON (1)", "NELSON (2)"),
    )
    plot = catalogue.read_plot("serial")
    first, second = (
        f for f in plot.features if getattr(f.properties, "name", "").startswith("NELSON (")
    )
    assert first.properties.supplies[-1].end <= first.properties.times[-1]
    assert [s.title for s in second.properties.supplies] == ["NELSON nav log"]
    assert second.properties.supplies[0].start == second.properties.times[0]


# --- Platforms linked and unlinked --------------------------------------------------------


def test_a_proposal_is_confirmed_refused_or_linked_by_hand(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    item = nav_log(catalogue, tmp_path)
    log = {"catalogue": catalogue.id, "item": item, "track": "track-nelson", "name": "Nelson"}
    catalogue.link_tracks("serial", "track-nelson", log, False, AGENT)
    report = catalogue.coverage("serial")
    assert [str(s.link) for s in platform(report, "NELSON").sources] == ["plot"]
    assert catalogue.history("serial").steps()[-1].records[0].notes[0] == (
        "Nelson in NELSON nav log is not NELSON"
    )
    # Sharing no platform with the plot now, it is no new data for it (decision, 16 Oct 2026).
    assert next(i for i in report.items if i.item == item).new_data is None
    catalogue.link_tracks("serial", "track-nelson", log, True, AGENT)
    assert [str(s.link) for s in platform(catalogue.coverage("serial"), "NELSON").sources] == [
        "plot",
        "linked",
    ]
    # A track named otherwise, linked by hand.
    merchant = {
        "catalogue": catalogue.id,
        "item": item,
        "track": "track-merchant",
        "name": "MERCHANT",
    }
    catalogue.link_tracks("serial", "track-blue", merchant, True, AGENT)
    assert catalogue.history("serial").steps()[-1].records[0].notes[0] == (
        "MERCHANT in NELSON nav log linked to BLUE"
    )
    assert catalogue.link_tracks("serial", "track-blue", merchant, True, AGENT) is None
    # Undo takes the link back.
    catalogue.history("serial").undo()
    assert track(catalogue, "serial", "BLUE").properties.platform_links is None


def test_an_item_supplying_a_period_cannot_be_unlinked(catalogue: Catalogue, tmp_path) -> None:
    item = nav_log(catalogue, tmp_path)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    log = {"catalogue": catalogue.id, "item": item, "track": "track-nelson", "name": "Nelson"}
    with pytest.raises(CatalogueError, match="supplies NELSON 06:00:10Z to 06:30:00Z"):
        catalogue.link_tracks("serial", "track-nelson", log, False, AGENT)


# --- Revisions and review ----------------------------------------------------------------


def test_a_revised_item_flags_the_products_that_drew_from_it(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    item = nav_log(catalogue, tmp_path)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    assert review_flags([catalogue]) == []
    # Any recorded change to the item is a revision: here, only its details' title.
    catalogue.set_colour(item, ["track-merchant"], "#00ff00", AGENT)
    (flag,) = review_flags([catalogue])
    assert (flag.item, [r.item for r in flag.revised]) == ("serial", [item])
    assert flag.note == "May need review: NELSON nav log was revised since Serial took data from it"
    report = catalogue.coverage("serial")
    assert report.review is not None
    assert next(i for i in report.items if i.item == item).revised
    # Cleared by the analyst: view state, never a step; flagged again at the next revision.
    steps = len(catalogue.history("serial").steps())
    assert catalogue.clear_review_flag("serial") == 1
    assert review_flags([catalogue]) == [] and catalogue.coverage("serial").review is None
    assert len(catalogue.history("serial").steps()) == steps
    catalogue.set_colour(item, ["track-merchant"], "#0000ff", AGENT)
    assert [f.item for f in review_flags([catalogue])] == ["serial"]
    # Undoing the revision puts the item back as it was taken: nothing to review.
    catalogue.history(item).undo()
    catalogue.history(item).undo()
    assert review_flags([catalogue]) == []


def test_taking_a_revision_again_reads_its_periods_from_it(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    item = nav_log(catalogue, tmp_path)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    # The log revised: its NELSON moved half a mile north.
    move = {"distance": {"value": 0.5, "unit": "[nmi_i]"}, "bearing": {"value": 0, "unit": "deg"}}
    catalogue.edit_track(item, "track-nelson", {"action": "move", **move}, AGENT)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    notes = catalogue.history("serial").steps()[-1].records[0].notes
    assert any("read again from its latest revision" in n for n in notes)
    nelson = track(catalogue, "serial", "NELSON")
    log = track(catalogue, item, "Nelson")
    at = "1995-12-12T06:20:00.000Z"
    assert nelson.geometry.coordinates[nelson.properties.times.index(at)] == pytest.approx(
        log.geometry.coordinates[log.properties.times.index(at)], abs=1e-6
    )
    assert catalogue.coverage("serial").review is None


# --- Second review: revisions per period, what is new data, edits carried ------------------


def _source(report: models.CoverageReport, name: str, title: str) -> dict:
    s = next(s for s in platform(report, name).sources if s.title == title)
    return {"catalogue": s.catalogue, "item": s.item, "track": s.track, "name": s.name}


def _move(catalogue: Catalogue, item: str, track_id: str, nmi: float, bearing: float) -> None:
    move = {
        "distance": {"value": nmi, "unit": "[nmi_i]"},
        "bearing": {"value": bearing, "unit": "deg"},
    }
    catalogue.edit_track(item, track_id, {"action": "move", **move}, AGENT)


def test_periods_read_at_different_revisions_keep_their_own(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    """The panel's case: the log taken at r1, moved half a mile by a colleague (r2), then
    chosen for 05:30 to 06:00. The fixes from 06:00:10 are still r1's, and say so."""
    item = nav_log(catalogue, tmp_path)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    r1 = catalogue.read_item(item).properties.debrief_revision
    _move(catalogue, item, "track-nelson", 0.5, 0)
    r2 = catalogue.read_item(item).properties.debrief_revision
    period = {"start": "1995-12-12T05:30:00.000Z", "end": "1995-12-12T06:00:00.000Z"}
    log = _source(catalogue.coverage("serial"), "NELSON", "NELSON nav log")
    catalogue.set_source_preference("serial", "track-nelson", period, log, AGENT)
    supplies = track(catalogue, "serial", "NELSON").properties.supplies
    assert [(s.title, s.start[11:19], s.end[11:19], s.revision) for s in supplies] == [
        ("Serial", "05:00:00", "05:29:00", None),
        ("NELSON nav log", "05:30:00", "06:00:00", r2),
        ("NELSON nav log", "06:00:10", "06:30:00", r1),
    ]
    # The periods still at r1 flag the plot: the item was revised since they were read.
    assert catalogue.coverage("serial").review is not None
    assert [f.item for f in review_flags([catalogue])] == ["serial"]
    assert {
        (r.item, r.revision) for r in catalogue.read_item("serial").properties.debrief_drawn_from
    } == {
        (item, r1),
        (item, r2),
    }
    # Back to the plot's own data: no edit is made up from the half mile between revisions.
    own = _source(catalogue.coverage("serial"), "NELSON", "Serial")
    step = catalogue.set_source_preference("serial", "track-nelson", period, own, AGENT)
    notes = catalogue.history("serial").steps()[step - 1].records[0].notes
    assert not any("follow the changes" in n for n in notes), notes


def test_only_files_imported_are_new_data(catalogue: Catalogue, tmp_path: Path) -> None:
    """Decision, 16 Oct 2026: an item that came in by file import, sharing a platform with
    the plot and with data within its period; never one made by hand, a product of other
    items, or one made from this plot."""
    time.sleep(0.002)
    record = models.ProvRecord(id="made", kind="tool", started_at=format_utc(T0), agent=AGENT)
    by_hand = models.DebriefFeatureCollection(
        type="FeatureCollection",
        schema_version=SCHEMA_VERSION,
        features=[_synthetic("NELSON", T0 + 600_000, 30, 60_000, -4.2)],
        provenance=[record],
    )
    catalogue.create_plot("by-hand", "By hand", by_hand)
    # A product: an import that took data from another item.
    product = import_rep(
        catalogue, write_rep(tmp_path, "prod", rep_lines("NELSON", 0, 10, 60)), title="Product"
    ).item_id
    other_log = nav_log(catalogue, tmp_path, name="other-log")
    catalogue.take_new_data(product, catalogue.id, other_log, AGENT)
    # Made from this plot: an import that took Serial's data.
    derived = import_rep(
        catalogue, write_rep(tmp_path, "der", rep_lines("BLUE", 40, 10, 60)), title="Derived"
    ).item_id
    catalogue.take_new_data(derived, catalogue.id, "serial", AGENT)
    # Imported, but sharing no platform with the plot; and imported, but out of its period.
    import_rep(catalogue, write_rep(tmp_path, "else", rep_lines("OTHER", 0, 10, 60)), title="Else")
    import_rep(
        catalogue, write_rep(tmp_path, "late", rep_lines("NELSON", 600, 10, 60)), title="Late"
    )
    report = catalogue.coverage("serial")
    marked = sorted(i.title for i in report.items if i.new_data is not None)
    assert marked == ["NELSON nav log"]  # the other log, imported, is the only one
    assert catalogue.read_item("by-hand").properties.debrief_imported is False
    assert catalogue.read_item(other_log).properties.debrief_imported is True


def test_a_colleagues_copy_is_new_data_only_once_it_adds_data(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    plot_file = tmp_path / "serial-from-colleague.geojson"
    plot_file.write_text(
        (tmp_path / "store" / "serial" / "plot.geojson").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    time.sleep(0.002)
    copy = catalogue.add_plot_file(plot_file, AGENT)
    assert (
        catalogue.read_item(copy).properties.debrief_origin
        == catalogue.read_item("serial").properties.debrief_origin
    )
    _move(catalogue, copy, "track-nelson", 0.2, 90)  # an edit adds no data
    report = catalogue.coverage("serial")
    assert next(i for i in report.items if i.item == copy).new_data is None
    # The colleague takes a log into their copy: data added since the copies parted.
    log = nav_log(catalogue, tmp_path)
    catalogue.dismiss_new_data(
        "serial", catalogue.id, log, catalogue.read_item(log).properties.debrief_revision, AGENT
    )
    catalogue.take_new_data(copy, catalogue.id, log, AGENT)
    mark = next(i for i in catalogue.coverage("serial").items if i.item == copy).new_data
    assert mark is not None and mark.note.startswith("Data added to a copy of Serial")


def test_answers_to_marks_keep_who_and_when(catalogue: Catalogue, tmp_path: Path) -> None:
    item = nav_log(catalogue, tmp_path)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    catalogue.set_colour(item, ["track-merchant"], "#00ff00", AGENT)
    assert catalogue.clear_review_flag("serial", agent=AGENT) == 1
    view, _ = catalogue.read_view("serial")
    (answer,) = view.collation.reviewed
    assert answer.by == "analyst" and answer.at is not None and answer.item == item


def test_taking_the_same_data_again_makes_no_step(catalogue: Catalogue, tmp_path: Path) -> None:
    item = nav_log(catalogue, tmp_path)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    # A product of Serial, flagged only if Serial really changes.
    product = import_rep(
        catalogue, write_rep(tmp_path, "prod", rep_lines("BLUE", 40, 10, 60)), title="Product"
    ).item_id
    catalogue.take_new_data(product, catalogue.id, "serial", AGENT)
    steps = len(catalogue.history("serial").steps())
    revision = catalogue.read_item("serial").properties.debrief_revision
    # The same revision again: nothing.
    assert catalogue.take_new_data("serial", catalogue.id, item, AGENT) is None
    # A revision of the log that changes nothing taken (a colour): nothing either, and the
    # plot is reviewed against it rather than flagged.
    catalogue.set_colour(item, ["track-merchant"], "#00ff00", AGENT)
    assert catalogue.coverage("serial").review is not None
    assert catalogue.take_new_data("serial", catalogue.id, item, AGENT) is None
    assert len(catalogue.history("serial").steps()) == steps
    assert catalogue.read_item("serial").properties.debrief_revision == revision
    assert catalogue.coverage("serial").review is None
    assert [f.item for f in review_flags([catalogue])] == []


def test_a_retake_counts_only_the_fixes_that_changed(catalogue: Catalogue, tmp_path: Path) -> None:
    item = nav_log(catalogue, tmp_path)
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    # The log corrected for ten minutes only: 61 of its fixes.
    edit = {
        "action": "move",
        "distance": {"value": 0.2, "unit": "[nmi_i]"},
        "bearing": {"value": 0, "unit": "deg"},
        "period": {"start": "1995-12-12T06:10:00.000Z", "end": "1995-12-12T06:20:00.000Z"},
    }
    catalogue.edit_track(item, "track-nelson", edit, AGENT)
    step = catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    notes = catalogue.history("serial").steps()[step - 1].records[0].notes
    assert notes[1] == "NELSON 61 fixes", notes


def test_no_review_flag_once_none_of_an_items_data_is_left(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    time.sleep(0.002)
    inside = import_rep(
        catalogue, write_rep(tmp_path, "in", rep_lines("NELSON", 10, 181, 10)), title="Inside"
    ).item_id
    period = {"start": "1995-12-12T05:10:00.000Z", "end": "1995-12-12T05:40:00.000Z"}
    theirs = _source(catalogue.coverage("serial"), "NELSON", "Inside")
    catalogue.set_source_preference("serial", "track-nelson", period, theirs, AGENT)
    catalogue.set_colour(inside, ["track-nelson"], "#00ff00", AGENT)
    assert catalogue.coverage("serial").review is not None
    own = _source(catalogue.coverage("serial"), "NELSON", "Serial")
    catalogue.set_source_preference("serial", "track-nelson", period, own, AGENT)
    assert track(catalogue, "serial", "NELSON").properties.supplies is None
    assert catalogue.coverage("serial").review is None
    assert review_flags([catalogue]) == []
    # Taken from once, it is no new data for the plot again.
    assert next(i for i in catalogue.coverage("serial").items if i.item == inside).new_data is None


def test_a_plot_from_before_items_kept_their_arrival_still_gets_marks(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    item = catalogue.read_item("serial")
    for name in ("created", "debrief_revision", "debrief_imported", "debrief_origin"):
        setattr(item.properties, name, None)
    catalogue._write_item(item)
    item = nav_log(catalogue, tmp_path)
    marked = next(i for i in catalogue.coverage("serial").items if i.item == item)
    assert marked.new_data is not None
    # Its next save keeps when it came in: its first step's time.
    catalogue.set_colour("serial", ["track-nelson"], "#ff0000", AGENT)
    assert catalogue.read_item("serial").properties.created is not None


def test_catalogues_sharing_an_id_are_said(tmp_path: Path, caplog) -> None:
    one = Catalogue.create(tmp_path / "one", "same", "One", "Test")
    two = Catalogue.create(tmp_path / "two", "same", "Two", "Test")
    with caplog.at_level("WARNING"):
        found = collation.Catalogues([one, two])
    assert found.duplicates == ["same"]
    assert "Two catalogues have the id 'same'" in caplog.text


def test_an_item_at_an_earlier_revision_is_replayed_once(catalogue: Catalogue, tmp_path) -> None:
    item = nav_log(catalogue, tmp_path)
    r1 = catalogue.read_item(item).properties.debrief_revision
    catalogue.set_colour(item, ["track-merchant"], "#00ff00", AGENT)
    first = catalogue._plot_at_revision(item, r1)
    assert first is not None and catalogue._plot_at_revision(item, r1) is first


# --- Edits carried to courses and speeds as well as positions ------------------------------


def _implied_errors(nelson: models.TrackFeature, start: str, end: str) -> tuple[float, float]:
    """The largest difference between each fix's recorded course and speed and those its
    position and the next fix's imply, over a period."""
    props = nelson.properties
    times = props.times
    worst_course = worst_speed = 0.0
    for i in range(len(times) - 1):
        if not start <= times[i] < end or times[i + 1] > end:
            continue
        here, there = (Position(*nelson.geometry.coordinates[k]) for k in (i, i + 1))
        distance, bearing = range_bearing(here, there)
        seconds = (parse_utc(times[i + 1]) - parse_utc(times[i])) / 1000
        knots = distance.value / seconds * 3600 / 1852
        turn = (bearing.value - props.courses.values[i] + 180) % 360 - 180
        worst_course = max(worst_course, abs(turn))
        worst_speed = max(worst_speed, abs(knots - props.speeds.values[i]))
    return worst_course, worst_speed


def _choose_log(catalogue: Catalogue, tmp_path: Path) -> models.TrackFeature:
    nav_log(catalogue, tmp_path)
    period = {"start": "1995-12-12T05:30:00.000Z", "end": "1995-12-12T06:00:00.000Z"}
    log = _source(catalogue.coverage("serial"), "NELSON", "NELSON nav log")
    catalogue.set_source_preference("serial", "track-nelson", period, log, AGENT)
    return track(catalogue, "serial", "NELSON")


def test_a_stretch_carries_to_new_fixes_speeds(catalogue: Catalogue, tmp_path: Path) -> None:
    stretch = {"action": "stretch", "anchor": "start", "speed": {"value": 18, "unit": "[kn_i]"}}
    catalogue.edit_track("serial", "track-nelson", stretch, AGENT)
    nelson = _choose_log(catalogue, tmp_path)
    at = nelson.properties.times.index("1995-12-12T05:45:10.000Z")
    assert nelson.properties.speeds.values[at] == pytest.approx(18.0, abs=0.1)
    assert nelson.properties.courses.values[at] == pytest.approx(90.0, abs=0.2)
    course, speed = _implied_errors(nelson, "1995-12-12T05:30:00.000Z", "1995-12-12T05:59:50.000Z")
    assert course < 0.5 and speed < 0.2


def test_a_rotation_carries_to_new_fixes_courses(catalogue: Catalogue, tmp_path: Path) -> None:
    rotate = {"action": "rotate", "angle": {"value": 20, "unit": "deg"}}
    catalogue.edit_track("serial", "track-nelson", rotate, AGENT)
    nelson = _choose_log(catalogue, tmp_path)
    at = nelson.properties.times.index("1995-12-12T05:45:10.000Z")
    assert nelson.properties.courses.values[at] == pytest.approx(110.0, abs=0.3)
    assert nelson.properties.speeds.values[at] == pytest.approx(12.0, abs=0.1)
    course, speed = _implied_errors(nelson, "1995-12-12T05:30:00.000Z", "1995-12-12T05:59:50.000Z")
    assert course < 0.5 and speed < 0.2


def test_a_shear_carries_to_new_fixes_courses_and_speeds(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    shear = {
        "action": "shear",
        "anchor": "start",
        "distance": {"value": 0.5, "unit": "[nmi_i]"},
        "bearing": {"value": 0, "unit": "deg"},
    }
    catalogue.edit_track("serial", "track-nelson", shear, AGENT)
    nelson = _choose_log(catalogue, tmp_path)
    at = nelson.properties.times.index("1995-12-12T05:45:10.000Z")
    # Half a mile north over the hour: 0.5 kn north on 12 kn east.
    assert nelson.properties.courses.values[at] == pytest.approx(87.6, abs=0.2)
    course, speed = _implied_errors(nelson, "1995-12-12T05:30:00.000Z", "1995-12-12T05:59:50.000Z")
    assert course < 0.5 and speed < 0.2


def test_smoothing_carries_to_new_fixes_courses_and_speeds(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "wiggly", "w", "Wiggly", "Test")
    # NELSON a fix a minute, every other one 150 m north of its line: smoothing moves them.
    lines = rep_lines("NELSON", 0, 61, 60)
    for i in range(1, 61, 2):
        north = rep_lines("NELSON", i, 1, 60, origin=(-4.2, 50.3 + 150 / 111_320))[0]
        lines[i] = north
    import_rep(catalogue, write_rep(tmp_path, "serial", lines), title="Serial")
    assert catalogue.smooth_track("serial", "track-nelson", 5, AGENT) is not None
    nelson = _choose_log(catalogue, tmp_path)
    course, speed = _implied_errors(nelson, "1995-12-12T05:30:00.000Z", "1995-12-12T05:59:50.000Z")
    assert course < 1.0 and speed < 0.3


def test_a_fix_dragged_alone_moves_only_the_new_fix_at_its_time(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    nelson = track(catalogue, "serial", "NELSON")
    at = nelson.properties.times.index("1995-12-12T05:40:00.000Z")
    north = destination(
        Position(*nelson.geometry.coordinates[at]), Quantity(0, "deg"), Quantity(0.3, "[nmi_i]")
    )
    edit = {
        "action": "move_fix",
        "fix_time": "1995-12-12T05:40:00.000Z",
        "position": [north.longitude, north.latitude],
    }
    catalogue.edit_track("serial", "track-nelson", edit, AGENT)
    nelson = _choose_log(catalogue, tmp_path)
    log = track(catalogue, "nav-log", "Nelson")

    def off(time_: str) -> float:
        placed = nelson.geometry.coordinates[nelson.properties.times.index(time_)]
        logged = log.geometry.coordinates[log.properties.times.index(time_)]
        return range_bearing(Position(*logged), Position(*placed))[0].to("[nmi_i]").value

    assert off("1995-12-12T05:40:00.000Z") == pytest.approx(0.3, abs=0.002)
    assert off("1995-12-12T05:40:10.000Z") < 0.001
    assert off("1995-12-12T05:39:50.000Z") < 0.001


# --- Performance (NFR-01) ---------------------------------------------------------------


def _synthetic(
    name: str, start_ms: int, count: int, step_ms: int, lon: float
) -> models.TrackFeature:
    return models.TrackFeature(
        type="Feature",
        id="track-" + name.lower().replace(" ", "-"),
        geometry=models.LineStringGeometry(
            type="LineString",
            coordinates=[[lon + i * 1e-4, 50.3 + i * 1e-5] for i in range(count)],
        ),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=[format_utc(start_ms + i * step_ms) for i in range(count)],
        ),
    )


def test_coverage_of_a_study_of_fifty_items_stays_responsive(tmp_path: Path) -> None:
    """Fifty items of four tracks of 2,000 fixes each (400,000 fixes): coverage is read
    from the items alone, so it takes tens of milliseconds once the plot is open, never
    the plots' seconds (budget in the collation guide)."""
    catalogue = Catalogue.create(tmp_path / "study", "study", "Study", "Test")
    record = models.ProvRecord(id="made", kind="tool", started_at=format_utc(T0), agent=AGENT)
    for n in range(50):
        names = ("NELSON", "BLUE", "RED", f"CONTACT {n}")
        features = [
            _synthetic(name, T0 + n * 300_000, 2000, 10_000, -4.2 + k * 0.05)
            for k, name in enumerate(names)
        ]
        plot = models.DebriefFeatureCollection(
            type="FeatureCollection",
            schema_version=SCHEMA_VERSION,
            features=features,
            provenance=[record],
        )
        catalogue.create_plot(f"item-{n:02d}", f"Item {n}", plot)
    fresh = Catalogue.open(tmp_path / "study")
    started = time.perf_counter()
    report = fresh.coverage("item-00")
    cold = time.perf_counter() - started
    started = time.perf_counter()
    again = fresh.coverage("item-00")
    warm = time.perf_counter() - started
    started = time.perf_counter()
    flags = review_flags([fresh])
    flagged = time.perf_counter() - started
    print(
        f"Coverage, 50 items x 4 tracks x 2,000 fixes: first {cold * 1000:.0f} ms "
        f"(opening the plot included), again {warm * 1000:.0f} ms; flags {flagged * 1000:.0f} ms"
    )
    assert len(report.items) == 50 and flags == [] and again == report
    assert len(platform(report, "NELSON").sources) == 50
    # The budget in the collation guide: 500 ms the first time, 100 ms after.
    assert cold < 0.5 and warm < 0.1 and flagged < 0.5


def _gappy(name: str, start_ms: int, bursts: int, lon: float) -> models.TrackFeature:
    """A track in bursts: five fixes 10 s apart every ten minutes, a gap between each."""
    times = [start_ms + b * 600_000 + k * 10_000 for b in range(bursts) for k in range(5)]
    return models.TrackFeature(
        type="Feature",
        id="track-" + name.lower().replace(" ", "-"),
        geometry=models.LineStringGeometry(
            type="LineString",
            coordinates=[[lon + i * 1e-4, 50.3 + i * 1e-5] for i in range(len(times))],
        ),
        properties=models.TrackProperties(
            kind="track", name=name, times=[format_utc(t) for t in times]
        ),
    )


def test_coverage_of_gappy_sources_stays_responsive(tmp_path: Path) -> None:
    """Fifty items with NELSON in a hundred bursts each, all offset a little: 5,000
    spans whose bounds all differ. Cutting the platform's time where the sources change
    sweeps along it once, so this stays within the budget (500 ms first, 100 ms after)."""
    catalogue = Catalogue.create(tmp_path / "gappy", "gappy", "Gappy", "Test")
    record = models.ProvRecord(id="made", kind="tool", started_at=format_utc(T0), agent=AGENT)
    for n in range(50):
        plot = models.DebriefFeatureCollection(
            type="FeatureCollection",
            schema_version=SCHEMA_VERSION,
            features=[_gappy("NELSON", T0 + n * 7_000, 100, -4.2)],
            provenance=[record],
        )
        catalogue.create_plot(f"item-{n:02d}", f"Item {n}", plot)
    fresh = Catalogue.open(tmp_path / "gappy")
    started = time.perf_counter()
    report = fresh.coverage("item-00")
    cold = time.perf_counter() - started
    started = time.perf_counter()
    fresh.coverage("item-00")
    warm = time.perf_counter() - started
    print(
        f"Coverage, 50 gappy sources of 100 spans: first {cold * 1000:.0f} ms, "
        f"again {warm * 1000:.0f} ms"
    )
    nelson = platform(report, "NELSON")
    assert len(nelson.sources) == 50 and len(nelson.periods) > 1000
    assert cold < 0.5 and warm < 0.1


def sensor_lines(track_name: str, start_min: int, count: int, step_min: int, sensor: str) -> list:
    """;SENSOR2: lines for a track: an ambiguous bearing every step_min minutes."""
    lines = []
    for i in range(count):
        t = format_utc(T0 + (start_min + i * step_min) * 60_000)
        date, clock = t[2:4] + t[5:7] + t[8:10], t[11:13] + t[14:16] + t[17:19] + ".000"
        lines.append(
            f";SENSOR2: {date} {clock} {track_name} @A NULL {40 + i}.0 {140 - i}.0 NULL NULL "
            f'"{sensor}" L{i}'
        )
    return lines


def test_taking_new_data_carries_its_sensors_in_the_periods_it_supplies(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    """H3: take() carried tracks only, so a log's sensor cuts were silently dropped."""
    time.sleep(0.002)
    lines = (
        rep_lines("Nelson", 30, 361, 10)
        + rep_lines("MERCHANT", 10, 20, 60, (-4.0, 50.2))
        + sensor_lines("Nelson", 30, 13, 5, "Towed array")  # 05:30 to 06:30
        + sensor_lines("MERCHANT", 12, 3, 5, "Radar")
    )
    item = import_rep(catalogue, write_rep(tmp_path, "log", lines), title="NELSON nav log").item_id
    step = catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    plot = catalogue.read_plot("serial")
    by_name = {s.properties.name: s for s in plot_sensors.sensors(plot)}
    towed, radar = by_name["Towed array"], by_name["Radar"]
    assert towed.properties.host_track_id == "track-nelson"
    times = [c.properties.time[11:16] for c in plot_sensors.cuts(plot, towed.id)]
    # Only where the log supplies NELSON (06:00:10 on): the half hour both have is the plot's.
    assert times == ["06:05", "06:10", "06:15", "06:20", "06:25", "06:30"]
    merchant = track(catalogue, "serial", "MERCHANT")
    assert radar.properties.host_track_id == merchant.id
    assert len(plot_sensors.cuts(plot, radar.id)) == 3
    notes = catalogue.history("serial").steps()[step - 1].records[0].notes
    assert "Towed array: 6 cuts taken with NELSON" in notes
    # Those left out are said, not dropped silently (panel, round 3).
    assert (
        "Towed array: 7 cuts 05:30:00Z to 06:00:00Z not taken: another item supplies NELSON then"
        in notes
    )
    # One step: undone as one.
    catalogue.history("serial").undo()
    assert not plot_sensors.sensors(catalogue.read_plot("serial"))


def test_a_revision_adding_only_cuts_is_new_data(catalogue: Catalogue, tmp_path: Path) -> None:
    """Round 3, H-1: a log revised with more cuts and the same fixes took the relabel
    path, its sensors never given a host, and was "nothing new": the cuts were dropped."""
    from debrief_io.sensor_import import import_sensor

    time.sleep(0.002)
    lines = rep_lines("Nelson", 30, 361, 10) + sensor_lines("Nelson", 70, 3, 5, "Towed array")
    item = import_rep(catalogue, write_rep(tmp_path, "log", lines), title="NELSON nav log").item_id
    catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    before = len(plot_sensors.cuts(catalogue.read_plot("serial")))
    assert before == 3
    dsf = tmp_path / "more.dsf"
    dsf.write_text("\n".join(sensor_lines("Nelson", 82, 4, 2, "Towed array")) + "\n")
    import_sensor(catalogue, item, dsf, AGENT)
    step = catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    assert step is not None, "new cuts are new data"
    plot = catalogue.read_plot("serial")
    assert len(plot_sensors.cuts(plot)) == before + 4
    (towed,) = plot_sensors.sensors(plot)
    assert len(plot_sensors.cuts(plot, towed.id)) == 7  # joined to the sensor taken before
    notes = catalogue.history("serial").steps()[step - 1].records[0].notes
    assert notes[:2] == ["New data from NELSON nav log", "4 new cuts"]
    assert "Towed array: 4 cuts taken with NELSON" in notes
    # Taken again with nothing new: no step.
    assert catalogue.take_new_data("serial", catalogue.id, item, AGENT) is None


def test_choosing_a_period_from_another_item_carries_its_cuts(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    """Round 3, H-1: a period chosen from another item in Coverage took its fixes only."""
    time.sleep(0.002)
    lines = (
        rep_lines("Nelson", 30, 361, 10)
        + rep_lines("MERCHANT", 10, 20, 60, (-4.0, 50.2))
        + sensor_lines("Nelson", 35, 3, 5, "Towed array")  # 05:35 to 05:45
    )
    item = import_rep(catalogue, write_rep(tmp_path, "log", lines), title="NELSON nav log").item_id
    step = catalogue.take_new_data("serial", catalogue.id, item, AGENT)
    notes = catalogue.history("serial").steps()[step - 1].records[0].notes
    assert any(n.startswith("Towed array: 3 cuts 05:35:00Z to 05:45:00Z not taken") for n in notes)
    assert not plot_sensors.cuts(catalogue.read_plot("serial"))
    nelson = platform(catalogue.coverage("serial"), "NELSON")
    log = next(s for s in nelson.sources if s.item == item)
    period = {"start": "1995-12-12T05:30:00.000Z", "end": "1995-12-12T06:00:00.000Z"}
    source = {"catalogue": log.catalogue, "item": log.item, "track": log.track, "name": log.name}
    step = catalogue.set_source_preference("serial", "track-nelson", period, source, AGENT)
    plot = catalogue.read_plot("serial")
    assert len(plot_sensors.cuts(plot)) == 3
    (towed,) = plot_sensors.sensors(plot)
    assert towed.properties.host_track_id == "track-nelson"
    notes = catalogue.history("serial").steps()[step - 1].records[0].notes
    assert "Towed array: 3 cuts taken with NELSON" in notes
    catalogue.history("serial").undo()
    assert not plot_sensors.cuts(catalogue.read_plot("serial"))
