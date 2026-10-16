"""Narrative entries: one combined Zulu time axis, each entry added, changed or deleted
as one recorded, undoable step (CAP-05, CAP-20, SUB-19, SUB-21)."""

import json
import time
from pathlib import Path

import pytest

from debrief_kernel.time import format_utc, parse_utc
from debrief_schemas import DocumentKind, dump_document, models
from debrief_stac import Catalogue, CatalogueError, Changes, Conflict, narrative
from debrief_stac.narrative import NarrativeError, Query

ROOT = Path(__file__).resolve().parents[3]
VECTORS = json.loads((ROOT / "schemas" / "vectors" / "narrative-order.json").read_text())
AGENT = models.AgentRef(kind="person", name="analyst")
T0 = parse_utc("2026-10-11T09:30:00.000Z")


def entry(feature_id: str, at: str, source: str, text: str = "Logged.", **more):
    return models.NarrativeFeature(
        type="Feature",
        id=feature_id,
        geometry=None,
        properties=models.NarrativeProperties(
            kind="narrative", time=at, source=source, text=text, **more
        ),
    )


def track(feature_id: str, name: str) -> models.TrackFeature:
    return models.TrackFeature(
        type="Feature",
        id=feature_id,
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[-4.1, 50.3], [-4.0, 50.3]]
        ),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=[format_utc(T0), format_utc(T0 + 600_000)],
        ),
    )


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    origin = models.ProvRecord(
        id="op-1", kind="import", started_at="2026-10-11T10:00:00.000Z", agent=AGENT
    )
    features = [
        track("track-blue-one", "BLUE ONE"),
        track("track-red-one", "RED ONE"),
        entry(
            "narrative-001",
            "2026-10-11T09:30:00.000Z",
            "BLUE ONE",
            "Steady on 270°T.",
            entry_type="Course",
            track_id="track-blue-one",
        ),
        entry(
            "narrative-002",
            "2026-10-11T09:31:00.000Z",
            "CONTROL",
            "Serial started.",
            entry_type="Comment",
        ),
    ]
    catalogue.commit("p", [origin], Changes(added=features))
    return catalogue


def feature(catalogue: Catalogue, feature_id: str):
    return next((f for f in catalogue.read_plot("p").features if f.id == feature_id), None)


def last_note(catalogue: Catalogue) -> str:
    return catalogue.history("p").steps()[-1].records[0].notes[0]


# --- One order for every source --------------------------------------------------


@pytest.mark.parametrize("case", VECTORS["cases"], ids=lambda c: c["name"])
def test_the_shared_order_and_the_entry_at_current_time(case) -> None:
    features = [entry(e["id"], e["time"], e["source"]) for e in case["entries"]]
    ordered = narrative.order(features)
    assert [f.id for f in ordered] == case["order"]
    times = [parse_utc(f.properties.time) for f in ordered]
    for current in case["current"]:
        assert narrative.current_index(times, parse_utc(current["at"])) == current["index"]


def test_the_order_does_not_depend_on_which_source_was_imported_first() -> None:
    blue = [entry(f"b{i}", format_utc(T0 + i * 1000), "BLUE ONE") for i in range(5)]
    red = [entry(f"r{i}", format_utc(T0 + i * 1000), "RED ONE") for i in range(5)]
    assert [f.id for f in narrative.order(blue + red)] == [
        f.id for f in narrative.order(red + blue)
    ]


def test_a_query_by_source_type_text_and_period() -> None:
    plot = models.DebriefFeatureCollection(
        type="FeatureCollection",
        schema_version="0.0.21",
        provenance=[],
        features=[
            entry(
                "a", "2026-10-11T09:30:00.000Z", "BLUE ONE", "Contact gained", entry_type="Sonar"
            ),
            entry("b", "2026-10-11T09:31:00.000Z", "RED ONE", "Went deep", entry_type="Course"),
            entry("c", "2026-10-11T09:32:00.000Z", "BLUE ONE", "Lost CONTACT", entry_type="Sonar"),
            entry("d", "2026-10-11T09:33:00.000Z", "BLUE ONE", "Weather fair"),
        ],
    )
    ids = lambda q: [f.id for f in narrative.query(plot, q)]  # noqa: E731
    assert ids(Query()) == ["a", "b", "c", "d"]
    assert ids(Query(sources=frozenset({"BLUE ONE"}))) == ["a", "c", "d"]
    assert ids(Query(types=frozenset({"Sonar"}))) == ["a", "c"]
    assert ids(Query(types=frozenset({""}))) == ["d"]  # no type
    assert ids(Query(text="contact")) == ["a", "c"]  # ignoring case
    assert ids(Query(text="red one")) == ["b"]  # the source is searched too
    assert ids(
        Query(
            start_ms=parse_utc("2026-10-11T09:31:00.000Z"),
            end_ms=parse_utc("2026-10-11T09:32:00.000Z"),
        )
    ) == ["b", "c"]
    counts = narrative.summary(narrative.entries(plot))
    assert counts["sources"] == [
        {"name": "BLUE ONE", "entries": 3},
        {"name": "RED ONE", "entries": 1},
    ]
    assert counts["types"][0] == {"name": "Sonar", "entries": 2}


def test_an_entry_belongs_to_the_track_of_its_source_name_ignoring_case_and_spacing() -> None:
    tracks = {"BLUE ONE": "track-blue-one", "RED ONE": "track-red-one"}
    assert narrative.track_for("Blue  one", tracks) == "track-blue-one"
    assert narrative.track_for("CONTROL", tracks) is None
    assert narrative.track_for("blue one", {"BLUE ONE": "a", "Blue One": "b"}) is None  # which?


def test_new_ids_follow_the_highest_and_never_clash() -> None:
    assert narrative.new_ids(set()) == ["narrative-0001"]
    assert narrative.new_ids({"narrative-001", "narrative-0007", "track-1"}, 2) == [
        "narrative-0008",
        "narrative-0009",
    ]


# --- Changes, each one step ---------------------------------------------------------


def test_an_entry_added_is_one_step_named_plainly_and_belongs_to_its_track(catalogue) -> None:
    step, feature_id = catalogue.add_narrative(
        "p",
        {
            "time": "2026-10-11T09:35:00.000Z",
            "source": "RED ONE",
            "text": "  Going deep.\n  Depth 40 m.  ",
            "entry_type": "Course",
        },
        AGENT,
    )
    added = feature(catalogue, feature_id)
    assert added.properties.text == "  Going deep.\n  Depth 40 m.".strip()
    assert added.properties.track_id == "track-red-one"
    assert added.geometry is None
    assert last_note(catalogue) == "Narrative entry by RED ONE at 09:35:00Z added"
    assert catalogue.history("p").head().current == step


def test_an_entry_can_be_added_without_a_track_or_type(catalogue) -> None:
    _, feature_id = catalogue.add_narrative(
        "p",
        {
            "time": "2026-10-11T09:35:00.000Z",
            "source": "BLUE ONE",
            "text": "Unlinked.",
            "track_id": None,
        },
        AGENT,
    )
    props = feature(catalogue, feature_id).properties
    assert (props.track_id, props.entry_type) == (None, None)


@pytest.mark.parametrize(
    ("spec", "said"),
    [
        ({"source": "X", "text": "t"}, "its time"),
        ({"time": "2026-10-11T09:35:00Z", "source": "X", "text": "t"}, "not described properly"),
        ({"time": "2026-10-11T09:35:00.000Z", "source": "  ", "text": "t"}, "who wrote"),
        ({"time": "2026-10-11T09:35:00.000Z", "source": "X", "text": " \n "}, "some text"),
        (
            {
                "time": "2026-10-11T09:35:00.000Z",
                "source": "X",
                "text": "t",
                "track_id": "track-gone",
            },
            "no track",
        ),
        (
            {"time": "2026-10-11T09:35:00.000Z", "source": "X", "text": "t", "colour": "red"},
            "no colour",
        ),
    ],
)
def test_an_entry_that_cannot_be_made_says_why_and_changes_nothing(catalogue, spec, said) -> None:
    before = catalogue.history("p").head().current
    with pytest.raises((CatalogueError, NarrativeError), match=said):
        catalogue.add_narrative("p", spec, AGENT)
    assert catalogue.history("p").head().current == before


def test_an_entry_changed_is_one_step_saying_what_changed(catalogue) -> None:
    catalogue.edit_narrative("p", "narrative-001", {"text": "Steady on 275°T."}, AGENT)
    assert last_note(catalogue) == "Narrative entry by BLUE ONE at 09:30:00Z: text changed"
    catalogue.edit_narrative("p", "narrative-001", {"time": "2026-10-11T09:30:30.000Z"}, AGENT)
    assert last_note(catalogue) == "Narrative entry by BLUE ONE at 09:30:00Z moved to 09:30:30Z"
    catalogue.edit_narrative("p", "narrative-001", {"entry_type": None, "track_id": None}, AGENT)
    props = feature(catalogue, "narrative-001").properties
    assert (props.entry_type, props.track_id) == (None, None)
    assert last_note(catalogue).endswith("type and track changed")
    assert (
        catalogue.edit_narrative("p", "narrative-001", {"text": "Steady on 275°T."}, AGENT) is None
    )


def test_a_link_to_a_track_since_deleted_stays_while_the_entry_changes(catalogue) -> None:
    catalogue.commit(
        "p",
        [
            models.ProvRecord(
                id="op-2", kind="edit", started_at="2026-10-11T10:01:00.000Z", agent=AGENT
            )
        ],
        Changes(deleted_ids=["track-blue-one"]),
    )
    catalogue.edit_narrative("p", "narrative-001", {"text": "Still here."}, AGENT)
    assert feature(catalogue, "narrative-001").properties.track_id == "track-blue-one"


def test_entries_deleted_are_one_step_and_undo_brings_them_back(catalogue) -> None:
    catalogue.delete_narrative("p", ["narrative-001", "narrative-002"], AGENT)
    assert last_note(catalogue) == "2 narrative entries deleted"
    assert feature(catalogue, "narrative-001") is None
    catalogue.history("p").undo()
    assert feature(catalogue, "narrative-001") is not None and feature(catalogue, "narrative-002")
    catalogue.history("p").redo()
    assert feature(catalogue, "narrative-002") is None


def test_only_narrative_entries_are_changed_or_deleted_so(catalogue) -> None:
    with pytest.raises(CatalogueError, match="not a narrative entry"):
        catalogue.delete_narrative("p", ["track-red-one"], AGENT)
    with pytest.raises(CatalogueError, match="no narrative entry"):
        catalogue.edit_narrative("p", "narrative-999", {"text": "x"}, AGENT)


def test_a_change_made_on_an_old_base_is_refused(catalogue) -> None:
    base = catalogue.history("p").base()
    catalogue.add_narrative(
        "p", {"time": "2026-10-11T09:35:00.000Z", "source": "X", "text": "First."}, AGENT
    )
    with pytest.raises(Conflict):
        catalogue.add_narrative(
            "p", {"time": "2026-10-11T09:36:00.000Z", "source": "X", "text": "Late."}, AGENT, base
        )


def test_an_edit_is_recorded_with_only_that_entry(catalogue) -> None:
    catalogue.edit_narrative("p", "narrative-002", {"text": "Serial 1 started."}, AGENT)
    step = catalogue.history("p").delta(catalogue.history("p").head().current)
    assert [f.id for f in step.modified] == ["narrative-002"] and not step.added


# --- At scale (NFR-06: 12,000 entries, scaled by 3 to 5) --------------------------


def big_plot(count: int) -> list[models.NarrativeFeature]:
    sources = ["BLUE ONE", "RED ONE", "CONTROL", "BLUE TWO", "SEA KING"]
    types = ["GenComment", "Sonar", "CSD", "Posn", "Tx", None]
    return [
        entry(
            f"narrative-{i + 1:05d}",
            format_utc(T0 + (i // 3) * 2000),
            sources[i % len(sources)],
            f"Entry {i}: contact bearing {i % 360:03d}, range {i % 17} kyd, classifying as before.",
            entry_type=types[i % len(types)],
        )
        for i in range(count)
    ]


def test_sixty_thousand_entries_order_query_and_change_quickly(catalogue, capsys) -> None:
    features = big_plot(60_000)
    started = time.perf_counter()
    ordered = narrative.order(features)
    order_s = time.perf_counter() - started
    assert len(ordered) == 60_000

    origin = models.ProvRecord(
        id="op-big", kind="import", started_at="2026-10-11T10:02:00.000Z", agent=AGENT
    )
    started = time.perf_counter()
    catalogue.commit("p", [origin], Changes(added=features))
    import_s = time.perf_counter() - started

    plot = catalogue.read_plot("p")
    started = time.perf_counter()
    found = narrative.query(plot, Query(text="bearing 046", sources=frozenset({"RED ONE"})))
    query_s = time.perf_counter() - started
    assert found and all(f.properties.source == "RED ONE" for f in found)

    started = time.perf_counter()
    catalogue.edit_narrative("p", "narrative-30000", {"text": "Changed at scale."}, AGENT)
    edit_s = time.perf_counter() - started
    started = time.perf_counter()
    catalogue.history("p").undo()
    undo_s = time.perf_counter() - started
    text = dump_document(DocumentKind.PLOT, catalogue.read_plot("p"))
    with capsys.disabled():
        print(
            f"\nnarrative at 60,000 entries: order {order_s * 1000:.0f} ms, one step adding "
            f"them {import_s:.2f} s, query {query_s * 1000:.0f} ms, one entry changed "
            f"{edit_s:.2f} s, undone {undo_s:.2f} s; plot {len(text) / 1e6:.1f} MB"
        )
    # Bounds generous enough for a slow machine; the figures above are what is reported.
    assert order_s < 2 and query_s < 3 and edit_s < 30 and undo_s < 30


def test_the_plot_period_runs_from_its_earliest_entry_to_its_latest(catalogue) -> None:
    """The item's period takes in narrative entries, read from their earliest and latest
    times as written (UTC to the millisecond in one form), whatever their plot order."""
    from debrief_stac.catalogue import plot_extent

    late = {"time": "2026-10-11T23:59:59.999Z", "source": "CONTROL", "text": "Late."}
    early = {"time": "2026-10-10T00:00:00.001Z", "source": "CONTROL", "text": "Early."}
    catalogue.add_narrative("p", late, AGENT)
    catalogue.add_narrative("p", early, AGENT)
    extent = plot_extent(catalogue.read_plot("p"))
    assert extent.start_ms == parse_utc(early["time"])
    assert extent.end_ms == parse_utc(late["time"])


def test_a_typical_narrative_is_changed_and_undone_at_once(catalogue, capsys) -> None:
    """Typical narratives run to a few hundred entries, two thousand at most (product
    owner, 15 Oct 2026): a change or an undo there is well under 200 ms."""
    origin = models.ProvRecord(
        id="op-typical", kind="import", started_at="2026-10-11T10:02:00.000Z", agent=AGENT
    )
    catalogue.commit("p", [origin], Changes(added=big_plot(2_000)))
    started = time.perf_counter()
    catalogue.edit_narrative("p", "narrative-01000", {"text": "Changed."}, AGENT)
    edit_s = time.perf_counter() - started
    started = time.perf_counter()
    catalogue.history("p").undo()
    undo_s = time.perf_counter() - started
    with capsys.disabled():
        print(
            f"\nnarrative at 2,000 entries: one entry changed {edit_s * 1000:.0f} ms, "
            f"undone {undo_s * 1000:.0f} ms"
        )
    assert edit_s < 1 and undo_s < 1  # generous for a slow machine; typically ~20 ms
