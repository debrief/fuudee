"""The plot's island: view state in the plot file, outside its history (SUB-22, decision 12 Oct).

Content goes into history; view state goes into the island. These tests hold
the history to that: an island change never alters a content hash, never
conflicts, is never undone, and is never mistaken for an edit made outside
Debrief. And colour and hiding, being content, are ordinary recorded steps.
"""

import json
from pathlib import Path

import pytest

from debrief_schemas import DocumentValidationError, models
from debrief_schemas.island import view_of
from debrief_stac import Base, Catalogue, CatalogueError, Changes, Conflict, HistoryError
from debrief_stac import history as history_module
from debrief_stac.history import content_hash, text_hash, view_hash

AGENT = models.AgentRef(kind="person", name="analyst")
WINDOW = {"time_window": {"start": "2026-10-11T09:30:00.000Z", "end": "2026-10-11T09:45:00.000Z"}}
LATER = {"time_window": {"start": "2026-10-11T09:40:00.000Z", "end": "2026-10-11T09:50:00.000Z"}}


def record(n: int) -> models.ProvRecord:
    return models.ProvRecord(
        id=f"op-{n}", kind="edit", started_at="2026-10-11T10:00:00.000Z", agent=AGENT
    )


def note(feature_id: str, text: str = "Note") -> models.AnnotationFeature:
    return models.AnnotationFeature(
        type="Feature",
        id=feature_id,
        geometry=None,
        properties=models.AnnotationProperties(
            kind="annotation", style="note", name=text, time="2026-10-11T09:30:00.000Z"
        ),
    )


def track(feature_id: str, name: str, colour: str = "#0064bd") -> models.TrackFeature:
    return models.TrackFeature(
        type="Feature",
        id=feature_id,
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[-4.0, 50.0], [-4.1, 50.1]]
        ),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=["2026-10-11T09:30:00.000Z", "2026-10-11T09:31:00.000Z"],
            style=models.TrackStyle(colour=colour),
        ),
    )


def plot_details(title: str = "Serial 1") -> models.PlotFeature:
    return models.PlotFeature(
        type="Feature",
        id="plot",
        geometry=None,
        properties=models.PlotProperties(kind="plot", title=title),
    )


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    catalogue.commit(
        "p",
        [record(1)],
        Changes(added=[plot_details(), track("blue", "BLUE ONE"), note("a")]),
    )
    return catalogue


def plot_file(catalogue: Catalogue) -> Path:
    return Path(catalogue.store.root) / "p" / "plot.geojson"


def set_window(catalogue: Catalogue, view=WINDOW) -> str:
    _, current = catalogue.read_view("p")
    return catalogue.write_view("p", view, current)


def island_on_disk(catalogue: Catalogue):
    raw = json.loads(plot_file(catalogue).read_text())
    plot = next(f for f in raw["features"] if f["properties"]["kind"] == "plot")
    return plot["properties"].get("view")


def test_an_island_change_leaves_the_content_hash_and_history_alone(catalogue) -> None:
    history = catalogue.history("p")
    before = history.base()
    text_before = plot_file(catalogue).read_text()
    new_hash = set_window(catalogue)
    text_after = plot_file(catalogue).read_text()
    assert text_after != text_before  # the file holds the island...
    assert content_hash(text_after) == content_hash(text_before) == before.plot_hash
    assert history.base() == before  # ...but nothing in the history moved
    assert [s.seq for s in history.steps()] == [1]
    assert island_on_disk(catalogue) == WINDOW
    assert new_hash == view_hash(WINDOW)
    view, current = catalogue.read_view("p")
    assert view.time_window.start == WINDOW["time_window"]["start"] and current == new_hash
    # The plot as read has its island; the delta never does.
    assert view_of(catalogue.read_plot("p")) == view
    assert "view" not in json.dumps(history.delta(1).model_dump(mode="json", exclude_none=True))


def test_a_change_made_after_an_island_change_keeps_it_and_does_not_conflict(catalogue) -> None:
    base = catalogue.history("p").base()
    set_window(catalogue)  # someone moves the window after the analyst opened the plot
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]), base)  # no Conflict
    assert island_on_disk(catalogue) == WINDOW
    delta = catalogue.history("p").delta(2)
    assert delta.result_hash == content_hash(plot_file(catalogue).read_text())


def test_a_change_keeps_the_island_on_disk_not_an_older_copy(catalogue) -> None:
    history = catalogue.history("p")  # read before the island changed
    history.plot()
    set_window(catalogue, WINDOW)
    set_window(catalogue, LATER)
    history.commit([record(2)], Changes(added=[note("b")]))
    assert island_on_disk(catalogue) == LATER


def test_a_stale_island_write_is_refused(catalogue) -> None:
    _, mine = catalogue.read_view("p")
    _, theirs = catalogue.read_view("p")
    catalogue.write_view("p", WINDOW, theirs)
    with pytest.raises(Conflict, match="view was changed elsewhere"):
        catalogue.write_view("p", LATER, mine)
    assert island_on_disk(catalogue) == WINDOW  # theirs stands
    # Clearing it is a change of view too, checked the same way.
    catalogue.write_view("p", None, catalogue.read_view("p")[1])
    assert island_on_disk(catalogue) is None


def test_a_tool_cannot_write_the_island_through_a_change(catalogue) -> None:
    sneaky = plot_details("Renamed")
    sneaky.properties.view = models.PlotView.model_validate(LATER)
    set_window(catalogue)
    catalogue.commit("p", [record(2)], Changes(modified=[sneaky]))
    assert island_on_disk(catalogue) == WINDOW  # the title is content; the view is not
    plot = catalogue.read_plot("p")
    assert next(f for f in plot.features if f.id == "plot").properties.title == "Renamed"
    assert catalogue.history("p").delta(2).modified[0].properties.view is None


def test_undo_redo_and_goto_leave_the_island_alone(catalogue) -> None:
    history = catalogue.history("p")
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    set_window(catalogue)
    history.undo()
    assert island_on_disk(catalogue) == WINDOW
    set_window(catalogue, LATER)
    history.redo()
    assert island_on_disk(catalogue) == LATER
    history.goto(1)
    assert island_on_disk(catalogue) == LATER
    assert [s.status for s in history.steps()] == ["applied", "undone"]


def test_recovery_with_an_island_only_difference_keeps_the_plot(catalogue) -> None:
    set_window(catalogue)
    # The island changed by hand, outside Debrief: content untouched.
    raw = json.loads(plot_file(catalogue).read_text())
    raw["features"][0]["properties"]["view"] = LATER
    plot_file(catalogue).write_text(json.dumps(raw))  # another layout, too
    assert catalogue.history("p").recover() == []
    assert not list(plot_file(catalogue).parent.glob("plot.geojson.kept-*"))
    assert island_on_disk(catalogue) == LATER


def test_recovery_after_a_crash_keeps_the_island(catalogue) -> None:
    set_window(catalogue)
    history = catalogue.history("p")
    history.commit([record(2)], Changes(added=[note("b")]))
    # A crash between the head and the plot: the plot file is the old one.
    raw = json.loads(plot_file(catalogue).read_text())
    raw["features"] = [f for f in raw["features"] if f["id"] != "b"]
    raw["provenance"] = raw["provenance"][:1]
    plot_file(catalogue).write_text(json.dumps(raw, indent=2) + "\n")
    assert catalogue.history("p").recover() == []  # a recorded state: rebuilt, not kept aside
    assert [f.id for f in catalogue.read_plot("p").features] == ["plot", "blue", "a", "b"]
    assert island_on_disk(catalogue) == WINDOW


def test_an_outside_edit_is_still_kept_aside(catalogue) -> None:
    set_window(catalogue)
    raw = json.loads(plot_file(catalogue).read_text())
    raw["features"][2]["properties"]["name"] = "Changed outside Debrief"
    plot_file(catalogue).write_text(json.dumps(raw, indent=2) + "\n")
    notes = catalogue.history("p").recover()
    assert "changed outside Debrief" in notes[0]
    assert list(plot_file(catalogue).parent.glob("plot.geojson.kept-*"))
    assert island_on_disk(catalogue) == WINDOW


def test_a_damaged_island_never_stops_the_plot_opening(catalogue) -> None:
    set_window(catalogue)
    raw = json.loads(plot_file(catalogue).read_text())
    raw["features"][0]["properties"]["view"]["time_window"]["start"] = "2026-10-11T10:00:00.000Z"
    plot_file(catalogue).write_text(json.dumps(raw, indent=2) + "\n")
    assert catalogue.history("p").recover() == []
    plot = catalogue.read_plot("p")
    assert view_of(plot) is None and len(plot.features) == 3
    assert catalogue.read_view("p")[0] is None


def test_hashes_of_plots_without_an_island_are_unchanged(catalogue) -> None:
    text = plot_file(catalogue).read_text()
    assert '"view"' not in text
    assert content_hash(text) == text_hash(text)


def test_a_plot_written_here_is_not_parsed_again_for_its_island(catalogue, monkeypatch) -> None:
    # Taking the island out parses the whole file: slow for a large plot, so a
    # file this process wrote is remembered, not parsed again on every read.
    set_window(catalogue)
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    parsed = []
    original = history_module._parsed
    monkeypatch.setattr(history_module, "_parsed", lambda text: parsed.append(1) or original(text))
    plot = catalogue.read_plot("p")
    catalogue.history("p").open()
    assert view_of(plot).model_dump(mode="json", exclude_none=True) == WINDOW
    assert parsed == []


def test_a_view_that_is_not_valid_is_refused(catalogue) -> None:
    _, current = catalogue.read_view("p")
    backwards = {
        "time_window": {
            "start": WINDOW["time_window"]["end"],
            "end": WINDOW["time_window"]["start"],
        }
    }
    with pytest.raises(DocumentValidationError, match="starts after it ends"):
        catalogue.write_view("p", backwards, current)
    with pytest.raises(DocumentValidationError):
        catalogue.write_view("p", {"zoom": 3}, current)


def test_a_plot_without_details_gets_them_once_as_a_recorded_step(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "c", "c", "C", "")
    catalogue.create_plot("p", "Older plot")
    catalogue.commit("p", [record(1)], Changes(added=[note("a")]))
    catalogue.write_view("p", WINDOW, view_hash(None), agent=AGENT)
    steps = catalogue.history("p").steps()
    assert len(steps) == 2 and steps[1].records[0].notes == ["Plot details added, to keep its view"]
    assert island_on_disk(catalogue) == WINDOW
    catalogue.write_view("p", LATER, view_hash(WINDOW))
    assert len(catalogue.history("p").steps()) == 2  # once only


def test_the_whole_plot_feature_cannot_be_deleted(catalogue) -> None:
    with pytest.raises(HistoryError, match="cannot be deleted"):
        catalogue.commit("p", [record(2)], Changes(deleted_ids=["plot"]))
    # Nor replaced by a feature of another kind, as a tool's modified features could.
    with pytest.raises(HistoryError, match="cannot be deleted"):
        catalogue.commit("p", [record(2)], Changes(modified=[note("plot")]))
    set_window(catalogue)
    with pytest.raises(HistoryError, match="cannot be deleted"):
        catalogue.commit("p", [record(2)], Changes(modified=[note("plot")]))
    assert island_on_disk(catalogue) == WINDOW


def test_save_as_new_takes_the_view_with_it(catalogue) -> None:
    base = catalogue.history("p").base()
    set_window(catalogue)
    catalogue.commit("p", [record(2)], Changes(modified=[note("a", "Theirs")]))
    new = catalogue.save_as_new("p", base, [record(3)], Changes(modified=[note("a", "Mine")]))
    assert view_of(catalogue.read_plot(new)).model_dump(mode="json", exclude_none=True) == WINDOW


# --- Colour and hiding are content ----------------------------------------------


def test_colour_is_a_recorded_undoable_step_named_by_its_note(catalogue) -> None:
    base = catalogue.history("p").base()
    seq = catalogue.set_colour("p", ["blue"], "#e01c3e", AGENT, base, colour_name="red")
    step = catalogue.history("p").steps()[-1]
    assert seq == 2 and step.records[0].notes == ["Colour of BLUE ONE set to red"]
    assert step.records[0].kind == "edit" and step.records[0].agent.name == "analyst"
    colour = lambda: next(f for f in catalogue.read_plot("p").features if f.id == "blue")  # noqa: E731
    assert colour().properties.style.colour == "#e01c3e"
    catalogue.history("p").undo()
    assert colour().properties.style.colour == "#0064bd"
    # The same colour again changes nothing and records nothing.
    assert catalogue.set_colour("p", ["blue"], "#0064bd", AGENT) is None
    with pytest.raises(CatalogueError, match="Only tracks"):
        catalogue.set_colour("p", ["a"], "#e01c3e", AGENT)


def test_hiding_is_a_recorded_undoable_step(catalogue) -> None:
    catalogue.set_hidden("p", ["blue", "a"], True, AGENT)
    plot = catalogue.read_plot("p")
    assert [f.id for f in plot.features if getattr(f.properties, "hidden", None)] == ["blue", "a"]
    assert catalogue.history("p").steps()[-1].records[0].notes == [
        "BLUE ONE and Note hidden on the map"
    ]
    catalogue.set_hidden("p", ["blue"], False, AGENT)
    assert catalogue.history("p").steps()[-1].records[0].notes == ["BLUE ONE shown on the map"]
    catalogue.history("p").undo()
    assert next(f for f in catalogue.read_plot("p").features if f.id == "blue").properties.hidden


def test_a_colour_change_against_an_old_base_conflicts(catalogue) -> None:
    base = catalogue.history("p").base()
    catalogue.set_colour("p", ["blue"], "#e01c3e", AGENT)
    with pytest.raises(Conflict):
        catalogue.set_colour("p", ["blue"], "#00a000", AGENT, base)
    set_window(catalogue)  # a view change since is no conflict
    catalogue.set_colour("p", ["blue"], "#00a000", AGENT, catalogue.history("p").base())


# --- Migrating a retired presentation.json --------------------------------------


def write_presentation(catalogue: Catalogue) -> Path:
    path = Path(catalogue.store.root) / "p" / "presentation.json"
    path.write_text(
        json.dumps(
            {
                "schema_version": "0.0.7",
                "features": [
                    {"id": "blue", "colour": "#e01c3e"},
                    {"id": "a", "hidden": True},
                    {"id": "gone", "hidden": True},
                ],
            }
        )
    )
    return path


def test_presentation_json_becomes_one_step_and_is_deleted(catalogue) -> None:
    path = write_presentation(catalogue)
    assert catalogue.migrate_presentation("p", AGENT)
    assert not path.exists()
    steps = catalogue.history("p").steps()
    assert len(steps) == 2
    assert steps[1].records[0].notes == ["Colours and hidden features kept from presentation.json"]
    assert steps[1].records[0].agent.name == "analyst"
    plot = catalogue.read_plot("p")
    by_id = {f.id: f for f in plot.features}
    assert by_id["blue"].properties.style.colour == "#e01c3e"
    assert by_id["a"].properties.hidden is True
    assert not catalogue.migrate_presentation("p", AGENT)  # once only
    assert len(catalogue.history("p").steps()) == 2


def test_presentation_json_on_a_read_only_store_is_applied_in_memory_only(catalogue) -> None:
    path = write_presentation(catalogue)
    folder = Path(catalogue.store.root) / "p"
    before = {p: p.read_bytes() for p in folder.rglob("*") if p.is_file()}

    def refuse(*args, **kwargs):
        raise PermissionError("read-only")

    for name in ("write_text_atomic", "write_text_exclusive", "rename", "locked", "delete"):
        setattr(catalogue.store, name, refuse)
    with pytest.raises(OSError):
        catalogue.migrate_presentation("p", AGENT)
    plot = catalogue.read_plot("p")
    by_id = {f.id: f for f in plot.features}
    assert by_id["blue"].properties.style.colour == "#e01c3e"
    assert by_id["a"].properties.hidden is True
    assert path.exists()
    assert {p: p.read_bytes() for p in folder.rglob("*") if p.is_file()} == before
    assert len(catalogue.history("p").steps()) == 1


def test_a_presentation_that_changes_nothing_is_deleted_without_a_step(catalogue) -> None:
    path = Path(catalogue.store.root) / "p" / "presentation.json"
    path.write_text(json.dumps({"features": [{"id": "blue", "colour": "#0064bd"}]}))
    assert catalogue.migrate_presentation("p", AGENT)
    assert not path.exists() and len(catalogue.history("p").steps()) == 1


def test_base_is_unaffected_by_reading_the_view(catalogue) -> None:
    base = catalogue.history("p").base()
    assert isinstance(base, Base)
    catalogue.read_view("p")
    assert catalogue.history("p").base() == base
