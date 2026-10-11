"""History: deltas, replay, undo and redo, recovery after a crash, and conflicts."""

import json
from pathlib import Path

import pytest

from debrief_schemas import models
from debrief_stac import Base, Catalogue, Changes, Conflict, HistoryError
from debrief_stac.history import text_hash

AGENT = models.AgentRef(kind="person", name="analyst")


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


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    catalogue.commit("p", [record(1)], Changes(added=[note("a")]))  # the origin, like an import
    return catalogue


def names(catalogue: Catalogue) -> list[str]:
    return [f.id for f in catalogue.read_plot("p").features]


def test_every_change_is_a_delta_and_the_plot_is_their_replay(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    catalogue.commit("p", [record(3)], Changes(modified=[note("a", "Edited")], deleted_ids=["b"]))
    history = catalogue.history("p")
    assert [s.seq for s in history.steps()] == [1, 2, 3]
    assert history.replay(3) == catalogue.read_plot("p")
    assert [r.id for r in catalogue.read_plot("p").provenance] == ["op-1", "op-2", "op-3"]
    assert names(catalogue) == ["a"]


def test_undo_redo_and_undone_steps_kept_when_superseded(catalogue: Catalogue) -> None:
    history = catalogue.history("p")
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    catalogue.commit("p", [record(3)], Changes(added=[note("c")]))
    assert history.undo() == 2 and names(catalogue) == ["a", "b"]
    assert history.undo() == 1 and names(catalogue) == ["a"]
    assert history.redo() == 2 and names(catalogue) == ["a", "b"]
    # A new change after undoing: step 3 is abandoned, kept on record (SUB-19).
    catalogue.commit("p", [record(4)], Changes(added=[note("d")]))
    assert names(catalogue) == ["a", "b", "d"]
    assert [(s.seq, s.status) for s in history.steps()] == [
        (1, "applied"),
        (2, "applied"),
        (3, "abandoned"),
        (4, "applied"),
    ]
    with pytest.raises(HistoryError, match="nothing to redo"):
        history.redo()
    with pytest.raises(HistoryError, match="cannot be returned to"):
        history.goto(3)
    history.goto(1)
    with pytest.raises(HistoryError, match="as it was imported"):
        history.undo()


def test_crash_after_delta_before_head_is_finished_on_open(catalogue: Catalogue) -> None:
    history = catalogue.history("p")
    # Simulate: write the delta, then "crash" before the head and plot.
    head = history.head()
    plot = catalogue.read_plot("p")
    from debrief_stac.history import apply

    after = apply(plot, [record(2)], Changes(added=[note("b")]))
    from debrief_schemas import DocumentKind, dump_document

    delta = models.Delta(
        schema_version=plot.schema_version,
        seq=2,
        after=head.current,
        records=[record(2)],
        added=[note("b")],
        result_hash=text_hash(dump_document(DocumentKind.PLOT, after)),
    )
    catalogue.store.write_text_exclusive(
        "p/history/000002.json", dump_document(DocumentKind.DELTA, delta)
    )
    done = history.recover()
    assert any("interrupted" in line for line in done)
    assert names(catalogue) == ["a", "b"]  # nothing lost (NFR-10)


def test_plot_file_not_matching_history_is_rebuilt_and_kept_aside(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    plot_file = tmp_path / "cat" / "p" / "plot.geojson"
    tampered = json.loads(plot_file.read_text())
    tampered["features"] = []
    plot_file.write_text(json.dumps(tampered))
    done = catalogue.history("p").recover()
    assert any("kept as" in line for line in done)
    assert names(catalogue) == ["a"]
    assert list((tmp_path / "cat" / "p").glob("plot.geojson.kept-*"))


def test_plot_made_before_history_gets_a_baseline(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "cat2", "ex", "Exercise", "Test")
    catalogue.create_plot("old", "Old")
    # Remove its history, as a plot written by Phase 1 Debrief would be.
    import shutil

    shutil.rmtree(tmp_path / "cat2" / "old" / "history")
    plot_file = tmp_path / "cat2" / "old" / "plot.geojson"
    raw = json.loads(plot_file.read_text())
    raw["features"] = [
        json.loads(
            models.AnnotationFeature.model_validate(note("x").model_dump()).model_dump_json(
                exclude_none=True
            )
        )
        | {"geometry": None}
    ]
    raw["provenance"] = [json.loads(record(9).model_dump_json(exclude_none=True))]
    plot_file.write_text(json.dumps(raw))
    plot = catalogue.read_plot("old")
    assert [f.id for f in plot.features] == ["x"]
    (step,) = catalogue.history("old").steps()
    assert [r.id for r in step.records] == ["op-9"]


def test_change_against_an_old_head_is_a_conflict_and_can_merge_when_disjoint(
    catalogue: Catalogue,
) -> None:
    history = catalogue.history("p")
    base = history.base()
    catalogue.commit("p", [record(2)], Changes(added=[note("theirs")]))  # someone else
    with pytest.raises(Conflict) as conflict:
        catalogue.commit("p", [record(3)], Changes(added=[note("mine")]), base)
    assert conflict.value.mergeable
    catalogue.commit("p", [record(3)], Changes(added=[note("mine")]), base, merge=True)
    assert names(catalogue) == ["a", "theirs", "mine"]


def test_overlapping_changes_are_never_merged(catalogue: Catalogue) -> None:
    base = catalogue.history("p").base()
    catalogue.commit("p", [record(2)], Changes(modified=[note("a", "Theirs")]))
    with pytest.raises(Conflict) as conflict:
        catalogue.commit("p", [record(3)], Changes(modified=[note("a", "Mine")]), base, merge=True)
    assert not conflict.value.mergeable
    assert catalogue.read_plot("p").features[0].properties.name == "Theirs"


def test_save_as_new_keeps_both(catalogue: Catalogue, tmp_path: Path) -> None:
    source = tmp_path / "s.rep"
    source.write_text("x")
    catalogue.add_source("p", source)
    base = catalogue.history("p").base()
    catalogue.commit("p", [record(2)], Changes(modified=[note("a", "Theirs")]))
    new_id = catalogue.save_as_new("p", base, [record(3)], Changes(modified=[note("a", "Mine")]))
    assert catalogue.read_plot("p").features[0].properties.name == "Theirs"
    assert catalogue.read_plot(new_id).features[0].properties.name == "Mine"
    assert catalogue.read_item(new_id).properties.title == "Plot (your changes)"
    assert catalogue.verify_sources(new_id) == []
    assert [s.seq for s in catalogue.history(new_id).steps()] == [1, 2]


def test_two_writers_at_once_one_wins(catalogue: Catalogue) -> None:
    """The delta file is created exclusively: a second writer with the same number fails."""
    history = catalogue.history("p")
    catalogue.store.write_text_exclusive("p/history/000002.json", "{}")
    with pytest.raises(FileExistsError):
        catalogue.store.write_text_exclusive("p/history/000002.json", "{}")
    (Path(catalogue.store.root) / "p" / "history" / "000002.json").unlink()
    assert history.head().latest == 1


def test_a_change_that_does_not_fit_writes_nothing(catalogue: Catalogue) -> None:
    with pytest.raises(HistoryError, match="does not have"):
        catalogue.commit("p", [record(2)], Changes(deleted_ids=["nope"]))
    assert [s.seq for s in catalogue.history("p").steps()] == [1]
    assert Base(1, catalogue.history("p").head().plot_hash) == catalogue.history("p").base()
