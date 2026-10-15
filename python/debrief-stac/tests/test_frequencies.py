"""How often tracks are labelled, marked and arrowed (CAP-32): presentation content, held
per track, each change one recorded, undoable step for every track chosen at once."""

import json
from pathlib import Path

import pytest

from debrief_schemas import DocumentValidationError, load_plot, models
from debrief_schemas.documents import dump_plot
from debrief_stac import Catalogue, CatalogueError, Changes, Conflict
from debrief_stac.frequencies import describe_track, duration_of, interval_from, same, step_name

AGENT = models.AgentRef(kind="person", name="analyst")
TEN_MIN = {"value": 10, "unit": "min"}
VECTORS = json.loads(
    (Path(__file__).resolve().parents[3] / "schemas" / "vectors" / "fix-intervals.json").read_text()
)


@pytest.mark.parametrize("case", VECTORS["track"], ids=lambda c: c["text"])
def test_a_tracks_intervals_in_words_shared_with_typescript(case) -> None:
    assert describe_track(case["properties"]) == case["text"]


def test_intervals_are_on_the_track_not_its_fixes(catalogue) -> None:
    """Held at track level (product owner, 15 Oct 2026): one value per track, never per fix."""
    catalogue.set_track_frequencies("p", ["blue"], {"label_interval": TEN_MIN}, AGENT)
    plot = json.loads(dump_plot(catalogue.read_plot("p")))
    blue = next(f for f in plot["features"] if f["id"] == "blue")["properties"]
    assert blue["label_interval"] == {"value": 10.0, "unit": "min"}
    assert describe_track(props(catalogue, "blue")) == (
        "Labels every 10 min · Symbols default · Arrows default"
    )


def track(feature_id: str, name: str) -> models.TrackFeature:
    return models.TrackFeature(
        type="Feature",
        id=feature_id,
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[-4.0, 50.0], [-4.1, 50.1]]
        ),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=["2026-10-11T09:30:00.000Z", "2026-10-11T10:31:00.000Z"],
        ),
    )


def note(feature_id: str) -> models.AnnotationFeature:
    return models.AnnotationFeature(
        type="Feature",
        id=feature_id,
        geometry=None,
        properties=models.AnnotationProperties(
            kind="annotation", style="note", name="Note", time="2026-10-11T09:30:00.000Z"
        ),
    )


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    record = models.ProvRecord(
        id="op-1", kind="edit", started_at="2026-10-11T10:00:00.000Z", agent=AGENT
    )
    tracks = [track("blue", "BLUE ONE"), track("red", "RED ONE"), track("green", "GREEN ONE")]
    catalogue.commit("p", [record], Changes(added=[*tracks, note("a")]))
    return catalogue


def props(catalogue: Catalogue, feature_id: str) -> models.TrackProperties:
    return next(f for f in catalogue.read_plot("p").features if f.id == feature_id).properties


def last_note(catalogue: Catalogue) -> str:
    return catalogue.history("p").steps()[-1].records[0].notes[0]


def test_one_step_for_several_tracks_named_for_what_was_set(catalogue) -> None:
    seq = catalogue.set_track_frequencies(
        "p", ["blue", "red"], {"label_interval": TEN_MIN, "arrow_interval": "5 min"}, AGENT
    )
    assert seq == 2 and len(catalogue.history("p").steps()) == 2
    assert last_note(catalogue) == "Labels every 10 min, arrows every 5 min on BLUE ONE and RED ONE"
    for feature_id in ("blue", "red"):
        p = props(catalogue, feature_id)
        assert p.label_interval == models.Duration(value=10, unit="min")
        assert p.arrow_interval == models.Duration(value=5, unit="min")
        assert p.symbol_interval is None  # left out: unchanged
    assert props(catalogue, "green").label_interval is None
    # What was asked is recorded exactly, beside the name.
    record = catalogue.history("p").steps()[-1].records[0]
    assert [p.name for p in record.parameters] == ["label_interval", "arrow_interval"]
    assert record.selected == ["blue", "red"]
    # Undo takes the whole change back, for both tracks.
    catalogue.history("p").undo()
    assert props(catalogue, "blue").label_interval is None
    assert props(catalogue, "red").arrow_interval is None


def test_held_per_track_so_tracks_set_together_may_later_differ(catalogue) -> None:
    catalogue.set_track_frequencies("p", ["blue", "red", "green"], {"symbol_interval": 60}, AGENT)
    assert last_note(catalogue) == "Symbols every 1 min on 3 tracks"
    catalogue.set_track_frequencies("p", ["red"], {"symbol_interval": "off"}, AGENT)
    assert last_note(catalogue) == "Symbols off on RED ONE"
    assert props(catalogue, "blue").symbol_interval == models.Duration(value=1, unit="min")
    assert props(catalogue, "red").symbol_interval == models.FixIntervalOffEnum.off
    # Back to Debrief's default: left out of the file.
    catalogue.set_track_frequencies("p", ["red"], {"symbol_interval": None}, AGENT)
    assert last_note(catalogue) == "Symbols back to the default on RED ONE"
    assert props(catalogue, "red").symbol_interval is None


def test_nothing_to_change_records_nothing(catalogue) -> None:
    catalogue.set_track_frequencies("p", ["blue"], {"label_interval": TEN_MIN}, AGENT)
    # The same interval in another unit is the same interval.
    assert (
        catalogue.set_track_frequencies(
            "p", ["blue"], {"label_interval": {"value": 600, "unit": "s"}}, AGENT
        )
        is None
    )
    # Of two tracks one already has it; the step names both, as asked.
    catalogue.set_track_frequencies("p", ["blue", "red"], {"label_interval": "10 min"}, AGENT)
    assert last_note(catalogue) == "Labels every 10 min on BLUE ONE and RED ONE"
    assert props(catalogue, "red").label_interval == models.Duration(value=10, unit="min")


@pytest.mark.parametrize(
    ("value", "problem"),
    [
        ({"value": 0.5, "unit": "s"}, "Give whole seconds"),
        ({"value": 25, "unit": "h"}, "from 1 s to 24 h"),
        (0, "from 1 s to 24 h"),
        ("10", "Say the unit"),
        (True, "Give an interval"),
        ({"value": 10, "unit": "kn"}, "Give an interval as"),
    ],
)
def test_bad_intervals_are_refused_in_plain_words(catalogue, value, problem) -> None:
    with pytest.raises(CatalogueError, match=problem):
        catalogue.set_track_frequencies("p", ["blue"], {"label_interval": value}, AGENT)


def test_the_extremes_are_allowed(catalogue) -> None:
    catalogue.set_track_frequencies(
        "p", ["blue"], {"label_interval": "1 s", "arrow_interval": "24 h"}, AGENT
    )
    assert props(catalogue, "blue").label_interval == models.Duration(value=1, unit="s")
    assert props(catalogue, "blue").arrow_interval == models.Duration(value=24, unit="h")


def test_only_tracks_and_only_known_fields(catalogue) -> None:
    with pytest.raises(CatalogueError, match="Only tracks"):
        catalogue.set_track_frequencies("p", ["a"], {"label_interval": TEN_MIN}, AGENT)
    with pytest.raises(CatalogueError, match="label_frequency"):
        catalogue.set_track_frequencies("p", ["blue"], {"label_frequency": TEN_MIN}, AGENT)
    with pytest.raises(CatalogueError, match="Say which"):
        catalogue.set_track_frequencies("p", ["blue"], {}, AGENT)
    with pytest.raises(CatalogueError, match="no feature"):
        catalogue.set_track_frequencies("p", ["nobody"], {"label_interval": TEN_MIN}, AGENT)


def test_a_stale_base_conflicts(catalogue) -> None:
    base = catalogue.history("p").base()
    catalogue.set_colour("p", ["blue"], "#e01c3e", AGENT)
    with pytest.raises(Conflict):
        catalogue.set_track_frequencies("p", ["blue"], {"label_interval": TEN_MIN}, AGENT, base)


def test_the_schema_holds_intervals_to_1_s_to_24_h(catalogue) -> None:
    plot = json.loads(dump_plot(catalogue.read_plot("p")))
    blue = next(f for f in plot["features"] if f["id"] == "blue")
    for good in ({"value": 1000, "unit": "ms"}, {"value": 24, "unit": "h"}, "off"):
        blue["properties"]["label_interval"] = good
        load_plot(plot)
    for bad in (
        {"value": 1500, "unit": "ms"},
        {"value": 0, "unit": "s"},
        {"value": 1441, "unit": "min"},
    ):
        blue["properties"]["label_interval"] = bad
        with pytest.raises(
            DocumentValidationError, match="whole number of seconds from 1 s to 24 h"
        ):
            load_plot(plot)
    blue["properties"]["label_interval"] = "sometimes"
    with pytest.raises(DocumentValidationError):
        load_plot(plot)


def test_helpers() -> None:
    assert duration_of(600) == models.Duration(value=10, unit="min")
    assert duration_of(5400) == models.Duration(value=90, unit="min")
    assert duration_of(90) == models.Duration(value=90, unit="s")
    assert duration_of(7200) == models.Duration(value=2, unit="h")
    assert interval_from("1h30") == models.Duration(value=90, unit="min")
    assert interval_from("off") == models.FixIntervalOffEnum.off
    assert interval_from(None) is None
    assert same(None, None) and not same(None, models.FixIntervalOffEnum.off)
    assert same(models.Duration(value=1, unit="h"), models.Duration(value=60, unit="min"))
    off = models.FixIntervalOffEnum.off
    assert step_name({"arrow_interval": off, "label_interval": None}, ["A"]) == (
        "Labels back to the default, arrows off on A"
    )


# --- A label or a symbol forced on at one fix (decision, product owner, 15 Oct 2026) ------


def test_a_fix_always_shows_its_label_or_symbol_one_step_each(catalogue) -> None:
    at = "2026-10-11T10:31:00.000Z"
    catalogue.mark_fix("p", "blue", at, {"show_label": True}, AGENT)
    assert last_note(catalogue) == "BLUE ONE fix at 10:31:00Z: time label always shown"
    catalogue.mark_fix("p", "blue", at, {"show_symbol": True}, AGENT)
    assert last_note(catalogue) == "BLUE ONE fix at 10:31:00Z: symbol always shown"
    mark = props(catalogue, "blue").fix_marks[0]
    assert (mark.show_label, mark.show_symbol, mark.label, mark.colour) == (True, True, None, None)
    # The same again changes nothing; false stops it, and a mark saying nothing goes.
    assert catalogue.mark_fix("p", "blue", at, {"show_symbol": True}, AGENT) is None
    catalogue.mark_fix("p", "blue", at, {"show_symbol": False}, AGENT)
    assert last_note(catalogue) == "BLUE ONE fix at 10:31:00Z: symbol shown only at its interval"
    catalogue.mark_fix("p", "blue", at, {"show_label": None}, AGENT)
    assert props(catalogue, "blue").fix_marks is None
    catalogue.history("p").undo()
    assert props(catalogue, "blue").fix_marks[0].show_label is True
    with pytest.raises(CatalogueError, match="true or false"):
        catalogue.mark_fix("p", "blue", at, {"show_label": "yes"}, AGENT)


def test_forced_marks_follow_their_fix_and_are_true_or_left_out(catalogue) -> None:
    at = "2026-10-11T10:31:00.000Z"
    catalogue.mark_fix("p", "blue", at, {"show_label": True}, AGENT)
    catalogue.edit_track(
        "p",
        "blue",
        {
            "action": "move",
            "distance": {"value": 1, "unit": "[nmi_i]"},
            "bearing": {"value": 90, "unit": "deg"},
        },
        AGENT,
    )
    assert props(catalogue, "blue").fix_marks[0].time == at
    plot = json.loads(dump_plot(catalogue.read_plot("p")))
    blue = next(f for f in plot["features"] if f["id"] == "blue")
    assert blue["properties"]["fix_marks"] == [{"time": at, "show_label": True}]
    blue["properties"]["fix_marks"][0]["show_label"] = False
    with pytest.raises(DocumentValidationError, match="leave it out instead"):
        load_plot(plot)
