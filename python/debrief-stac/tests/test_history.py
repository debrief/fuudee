"""History: deltas, replay, undo and redo, recovery after a crash, and conflicts."""

import json
import os
import shutil
from pathlib import Path

import pytest

import debrief_stac.store as store
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


# --- Found by the review panel ------------------------------------------------


def head_file(catalogue: Catalogue) -> Path:
    return catalogue.store.root / "p" / "history" / "head.json"


def test_a_stale_head_never_hides_a_later_change(catalogue: Catalogue) -> None:
    """An undo that wrote its head from a stale read must not wedge the plot."""
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    stale = head_file(catalogue).read_text()  # current 2, latest 2
    catalogue.commit("p", [record(3)], Changes(added=[note("c")]))
    undone = json.loads(stale) | {"current": 1}
    head_file(catalogue).write_text(json.dumps(undone))  # the undo's late, stale write
    assert names(catalogue) == ["a", "b", "c"]  # step 3 rolled forward: the undo is lost
    catalogue.commit(
        "p", [record(4)], Changes(added=[note("d")])
    )  # and the plot still takes changes
    assert names(catalogue) == ["a", "b", "c", "d"]


@pytest.mark.parametrize("damage", ["delete", "corrupt"])
def test_a_lost_head_is_rebuilt_from_the_deltas(catalogue: Catalogue, damage: str) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    catalogue.commit("p", [record(3)], Changes(added=[note("c")]))
    history = catalogue.history("p")
    history.undo()
    history.undo()
    catalogue.commit("p", [record(4)], Changes(added=[note("d")]))  # 2 and 3 abandoned
    if damage == "delete":
        head_file(catalogue).unlink()
    else:
        head_file(catalogue).write_text("{not json")
    notes = catalogue.history("p").recover()
    assert "rebuilt from the recorded changes" in notes[0]
    assert [s.status for s in catalogue.history("p").steps()] == [
        "applied",
        "abandoned",
        "abandoned",
        "applied",
    ]
    assert names(catalogue) == ["a", "d"]


def test_a_crash_during_the_first_baseline_is_finished(catalogue: Catalogue) -> None:
    root = catalogue.store.root / "p"
    shutil.rmtree(root / "history")  # a plot from before history
    (root / "history").mkdir()
    real = catalogue.store.write_text_atomic

    def crash(path: str, text: str) -> None:
        if path.endswith("head.json"):
            raise KeyboardInterrupt  # the process dies after the baseline delta
        real(path, text)

    catalogue.store.write_text_atomic = crash  # type: ignore[method-assign]
    with pytest.raises(KeyboardInterrupt):
        catalogue.read_plot("p")
    catalogue.store.write_text_atomic = real  # type: ignore[method-assign]
    assert names(catalogue) == ["a"]
    assert len(catalogue.history("p").steps()) == 1


def test_a_half_written_delta_is_set_aside(catalogue: Catalogue) -> None:
    folder = catalogue.store.root / "p" / "history"
    (folder / "000002.json").write_text('{"schema_version": "0.0.10", "seq": 2, "aft')
    notes = catalogue.history("p").recover()
    assert "interrupted before it was saved (step 2)" in notes[0]
    assert (folder / ".000002.partial").exists() and not (folder / "000002.json").exists()
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    assert names(catalogue) == ["a", "b"]


def test_a_plot_file_left_by_a_crash_is_rebuilt_not_kept(catalogue: Catalogue) -> None:
    plot_file = catalogue.store.root / "p" / "plot.geojson"
    earlier = plot_file.read_text()
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    plot_file.write_text(earlier)  # a crash between head and plot: the old plot remains
    assert catalogue.history("p").recover() == []
    assert names(catalogue) == ["a", "b"]
    assert not list(plot_file.parent.glob("plot.geojson.kept-*"))


def test_a_read_only_folder_is_read_without_writing(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    plot_file = catalogue.store.root / "p" / "plot.geojson"
    plot_file.unlink()  # needs a rebuild

    def refuse(*args, **kwargs):
        raise PermissionError("read-only")

    for name in ("write_text_atomic", "write_text_exclusive", "rename", "locked"):
        setattr(catalogue.store, name, refuse)
    assert names(catalogue) == ["a", "b"]
    assert catalogue.history("p").base().current == 2
    assert "cannot be changed" in catalogue.history("p").open()[0]
    assert not plot_file.exists()


def test_a_reader_while_a_writer_holds_the_lock_still_reads(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    (catalogue.store.root / "p" / "plot.geojson").unlink()
    store.LOCK_WAIT_S, wait = 0.1, store.LOCK_WAIT_S
    try:
        with catalogue.store.locked("p/history/.lock"):
            assert names(catalogue) == ["a", "b"]
    finally:
        store.LOCK_WAIT_S = wait


def test_named_set_references_make_changes_overlap(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    base = catalogue.history("p").base()
    catalogue.commit("p", [record(3)], Changes(deleted_ids=["b"]))  # theirs
    mine = Changes(named_sets=[models.NamedSet(id="s", name="S", feature_ids=["b"])])
    with pytest.raises(Conflict) as raised:
        catalogue.commit("p", [record(4)], mine, base, merge=True)
    assert raised.value.mergeable is False


def test_a_base_with_a_wrong_hash_never_merges(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    real = catalogue.history("p").base()
    catalogue.commit("p", [record(3)], Changes(added=[note("c")]))
    bogus = Base(real.current, text_hash("something else"))
    with pytest.raises(Conflict) as raised:
        catalogue.commit("p", [record(4)], Changes(added=[note("d")]), bogus, merge=True)
    assert raised.value.mergeable is False


def test_a_change_needs_a_record(catalogue: Catalogue) -> None:
    with pytest.raises(HistoryError, match="who"):
        catalogue.commit("p", [], Changes(added=[note("b")]))


def test_feature_order_survives_saving_and_replay(catalogue: Catalogue) -> None:
    plot = catalogue.read_plot("p")
    reordered = plot.model_copy(
        update={
            "features": [note("z"), *plot.features],
            "provenance": [*plot.provenance, record(2)],
        }
    )
    catalogue.write_plot("p", reordered)
    assert names(catalogue) == ["z", "a"]
    assert [f.id for f in catalogue.history("p").replay(2).features] == ["z", "a"]


def test_save_as_new_with_a_bad_base_leaves_nothing_behind(catalogue: Catalogue) -> None:
    with pytest.raises(HistoryError):
        catalogue.save_as_new("p", Base(7, text_hash("x")), [record(2)], Changes())
    assert catalogue.item_ids() == ["p"]
    real = catalogue.history("p").base()

    with pytest.raises(HistoryError):
        catalogue.save_as_new("p", real, [record(2)], Changes(deleted_ids=["nothing"]))
    assert catalogue.item_ids() == ["p"]
    assert not (catalogue.store.root / "p-copy").exists()


def test_the_first_step_cannot_be_undone_by_any_route(catalogue: Catalogue) -> None:
    with pytest.raises(HistoryError):
        catalogue.history("p").goto(0)
    with pytest.raises(HistoryError):
        catalogue.history("p").undo()


def test_a_plot_created_with_content_but_no_record_gets_a_baseline(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "c", "c", "C", "")
    plot = models.DebriefFeatureCollection(
        type="FeatureCollection", schema_version="0.0.10", features=[note("a")], provenance=[]
    )
    catalogue.create_plot("p", "Plot", plot)
    assert catalogue.read_plot("p").provenance[0].agent.name == "debrief-stac"


WRITER = """
import sys
from pathlib import Path
from debrief_schemas import models
from debrief_stac import Catalogue, Changes, HistoryError
root, prefix = sys.argv[1], sys.argv[2]
agent = models.AgentRef(kind="person", name=prefix)
catalogue = Catalogue.open(Path(root))
for n in range(12):
    record = models.ProvRecord(
        id=f"{prefix}-{n}", kind="edit", started_at="2026-10-11T10:00:00.000Z", agent=agent
    )
    note = models.AnnotationFeature(
        type="Feature", id=f"{prefix}{n}", geometry=None,
        properties=models.AnnotationProperties(
            kind="annotation", style="note", name="N", time="2026-10-11T09:30:00.000Z"
        ),
    )
    catalogue.commit("p", [record], Changes(added=[note]))
    if prefix == "u" and n % 3 == 2:
        try:
            catalogue.history("p").undo()
        except HistoryError:
            pass
"""


def test_two_processes_changing_and_undoing_at_once_keep_the_history_whole(
    catalogue: Catalogue,
) -> None:
    import subprocess
    import sys

    root = str(catalogue.store.root)
    workers = [
        subprocess.Popen([sys.executable, "-c", WRITER, root, prefix]) for prefix in ("w", "u")
    ]
    assert [worker.wait(60) for worker in workers] == [0, 0]
    history = catalogue.history("p")
    head = history.head()
    assert head.latest == 25  # every change recorded, none lost to the other process
    assert history.replay(head.current) == catalogue.read_plot("p")
    applied = {s.seq for s in history.steps() if s.status == "applied"}
    assert applied == set(history.chain(head.current))


@pytest.mark.skipif(os.name != "posix", reason="process liveness is checked on POSIX only")
def test_a_lock_left_by_a_killed_process_is_taken_over_at_once(catalogue: Catalogue) -> None:
    import socket
    import subprocess
    import sys

    dead = subprocess.run(
        [sys.executable, "-c", "import os; print(os.getpid())"], capture_output=True
    )
    lock = catalogue.store.root / "p" / "history" / ".lock"
    lock.write_text(f"{socket.gethostname()} {int(dead.stdout)}\n")
    store.LOCK_WAIT_S, wait = 0.5, store.LOCK_WAIT_S
    try:
        catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    finally:
        store.LOCK_WAIT_S = wait
    assert names(catalogue) == ["a", "b"] and not lock.exists()
    lock.write_text(f"{socket.gethostname()} {os.getpid()}\n")  # alive: never taken
    store.LOCK_WAIT_S = 0.2
    try:
        with pytest.raises(store.StoreBusy):
            catalogue.commit("p", [record(3)], Changes(added=[note("c")]))
    finally:
        store.LOCK_WAIT_S = wait


def test_saving_works_where_there_are_no_hard_links(catalogue: Catalogue, monkeypatch) -> None:
    """Pyodide's os has no link at all (CON-09): the exclusive create is used instead."""
    monkeypatch.delattr(os, "link")
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    assert names(catalogue) == ["a", "b"]
    with pytest.raises(FileExistsError):
        catalogue.store.write_text_exclusive("p/history/000002.json", "{}")
