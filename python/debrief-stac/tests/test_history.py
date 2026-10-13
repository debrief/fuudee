"""History in the plot file: steps, replay, undo and redo, crash safety, integrity,
conflicts, migration from a history folder, and plots passed between catalogues."""

import json
import os
import shutil
import time
from pathlib import Path

import pytest

import debrief_stac.history as history_module
import debrief_stac.store as store
from debrief_schemas import DocumentKind, dump_document, load_document, models
from debrief_schemas.chain import GENESIS_HASH, content_text_of, step_hash, text_hash
from debrief_stac import Base, Catalogue, Changes, Conflict, HistoryError
from debrief_stac.history import apply, content_hash, empty_plot

AGENT = models.AgentRef(kind="person", name="analyst")
WINDOW = {"time_window": {"start": "2026-10-11T09:30:00.000Z", "end": "2026-10-11T09:45:00.000Z"}}


def record(n: int, who: str = "analyst") -> models.ProvRecord:
    return models.ProvRecord(
        id=f"op-{n}",
        kind="edit",
        started_at="2026-10-11T10:00:00.000Z",
        agent=models.AgentRef(kind="person", name=who),
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


def details(title: str = "Serial 1") -> models.PlotFeature:
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
    catalogue.commit("p", [record(1)], Changes(added=[note("a")]))  # the origin, like an import
    return catalogue


def plot_file(catalogue: Catalogue, item: str = "p") -> Path:
    return Path(catalogue.store.root) / item / "plot.geojson"


def on_disk(catalogue: Catalogue, item: str = "p") -> dict:
    return json.loads(plot_file(catalogue, item).read_text())


def names(catalogue: Catalogue, item: str = "p") -> list[str]:
    return [f.id for f in catalogue.read_plot(item).features]


def statuses(catalogue: Catalogue, item: str = "p") -> list[str]:
    return [s.status for s in catalogue.history(item).steps()]


def forget_cache() -> None:
    """As a new process would: nothing read before is remembered."""
    history_module._FILES.clear()
    history_module._SPLIT.clear()


# --- Every change is a step, kept in the plot file --------------------------------


def test_every_change_is_a_step_and_the_plot_is_their_replay(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    catalogue.commit("p", [record(3)], Changes(modified=[note("a", "Edited")], deleted_ids=["b"]))
    history = catalogue.history("p")
    assert [s.seq for s in history.steps()] == [1, 2, 3]
    assert history.replay(3) == catalogue.read_plot("p")
    assert [r.id for r in catalogue.read_plot("p").provenance] == ["op-1", "op-2", "op-3"]
    assert names(catalogue) == ["a"]


def test_the_history_is_in_the_plot_file_and_nowhere_else(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    folder = Path(catalogue.store.root) / "p"
    assert not (folder / "history").exists()
    raw = on_disk(catalogue)
    assert list(raw)[-1] == "history"  # last, after the content
    assert raw["type"] == "FeatureCollection" and isinstance(raw["features"], list)  # GeoJSON
    history = raw["history"]
    assert history["current"] == 2
    assert [s["seq"] for s in history["steps"]] == [1, 2]
    assert [s["state"] for s in history["steps"]] == ["applied", "applied"]
    assert history["head_hash"] == history["steps"][-1]["step_hash"]
    # The whole file is a valid plot: every step, the chain and the content hash checked.
    load_document(DocumentKind.PLOT, plot_file(catalogue).read_text())


def test_the_file_is_the_content_as_written_then_one_line_a_step(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[details(), note("b")]))
    _, current = catalogue.read_view("p")
    catalogue.write_view("p", WINDOW, current)
    catalogue.history("p").undo()
    text = plot_file(catalogue).read_text()
    raw = json.loads(text)
    history = raw.pop("history")
    content = json.dumps(raw, indent=2, ensure_ascii=False)
    assert text.startswith(content[:-2] + ',\n  "history": {\n')
    lines = text.splitlines()
    for step in history["steps"]:
        compact = json.dumps(step, ensure_ascii=False, separators=(",", ":"))
        assert f"      {compact}," in lines or f"      {compact}" in lines


def test_undo_redo_and_undone_steps_kept_when_superseded(catalogue: Catalogue) -> None:
    history = catalogue.history("p")
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    catalogue.commit("p", [record(3)], Changes(added=[note("c")]))
    assert history.undo() == 2 and names(catalogue) == ["a", "b"]
    assert on_disk(catalogue)["history"]["steps"][2]["state"] == "undone"
    assert history.undo() == 1 and names(catalogue) == ["a"]
    assert history.redo() == 2 and names(catalogue) == ["a", "b"]
    # A new change after undoing: step 3 is abandoned, kept on record (SUB-19).
    catalogue.commit("p", [record(4)], Changes(added=[note("d")]))
    assert names(catalogue) == ["a", "b", "d"]
    assert statuses(catalogue) == ["applied", "applied", "abandoned", "applied"]
    assert [s["state"] for s in on_disk(catalogue)["history"]["steps"]] == statuses(catalogue)
    with pytest.raises(HistoryError, match="nothing to redo"):
        history.redo()
    with pytest.raises(HistoryError, match="cannot be returned to"):
        history.goto(3)
    history.goto(1)
    with pytest.raises(HistoryError, match="as it was imported"):
        history.undo()


def test_all_history_is_kept(catalogue: Catalogue) -> None:
    for n in range(2, 40):
        catalogue.commit("p", [record(n)], Changes(added=[note(f"n{n}")]))
        if n % 5 == 0:
            catalogue.history("p").undo()
    assert len(catalogue.history("p").steps()) == 39  # nothing capped, nothing folded


def test_the_content_hash_leaves_out_the_history_and_the_island(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[details()]))
    text = plot_file(catalogue).read_text()
    raw = json.loads(text)
    expected = text_hash(content_text_of(raw))
    assert content_hash(text) == expected == raw["history"]["steps"][-1]["result_hash"]
    content = {k: v for k, v in raw.items() if k != "history"}
    assert expected == text_hash(json.dumps(content, indent=2, ensure_ascii=False) + "\n")
    # Another history or another island: the same content hash.
    _, current = catalogue.read_view("p")
    catalogue.write_view("p", WINDOW, current)
    catalogue.commit("p", [record(3)], Changes(added=[note("b")]))
    catalogue.history("p").undo()
    assert content_hash(plot_file(catalogue).read_text()) == expected
    assert catalogue.history("p").base() == Base(2, expected)


def test_an_island_write_keeps_the_history_and_the_content(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[details()]))
    before = on_disk(catalogue)
    _, current = catalogue.read_view("p")
    catalogue.write_view("p", WINDOW, current)
    after = on_disk(catalogue)
    assert after["history"] == before["history"]
    assert content_text_of(after) == content_text_of(before)
    assert after["features"][1]["properties"]["view"] == WINDOW


# --- Crash safety (NFR-10, NFR-11) ---------------------------------------------------


def test_a_failure_before_the_rename_leaves_the_old_file_whole(
    catalogue: Catalogue, monkeypatch
) -> None:
    before = plot_file(catalogue).read_bytes()

    def die(*args, **kwargs):
        raise OSError("the disk was pulled out")

    monkeypatch.setattr(store, "_replace", die)
    with pytest.raises(OSError):
        catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    monkeypatch.undo()
    assert plot_file(catalogue).read_bytes() == before  # the old plot, whole
    assert not list(plot_file(catalogue).parent.glob(".plot.geojson.*"))  # nothing left over
    forget_cache()
    assert names(catalogue) == ["a"] and len(catalogue.history("p").steps()) == 1
    assert catalogue.history("p").recover() == []
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))  # and it takes changes
    assert names(catalogue) == ["a", "b"]


def test_a_temporary_file_left_by_a_killed_process_is_cleared(catalogue: Catalogue) -> None:
    folder = plot_file(catalogue).parent
    before = plot_file(catalogue).read_bytes()
    (folder / ".plot.geojson.k1ll3d.tmp").write_text('{"half": ')
    forget_cache()
    assert catalogue.history("p").open() == [
        "A save was interrupted before it finished, so the plot is as it was before that "
        "change. Nothing else was lost."
    ]
    assert not list(folder.glob(".plot.geojson.*.tmp"))
    assert plot_file(catalogue).read_bytes() == before and names(catalogue) == ["a"]
    assert catalogue.history("p").open() == []


def test_a_writer_that_did_not_take_the_lock_is_never_overwritten(
    catalogue: Catalogue, monkeypatch
) -> None:
    real = history_module.History._writable

    def and_meanwhile(self):
        file = real(self)
        path = plot_file(catalogue)
        path.write_text(path.read_text())  # someone rewrites the file, lock or no lock
        os.utime(path, ns=(time.time_ns(), time.time_ns() + 10_000_000))
        return file

    monkeypatch.setattr(history_module.History, "_writable", and_meanwhile)
    with pytest.raises(Conflict, match="at the same moment"):
        catalogue.commit("p", [record(2)], Changes(added=[note("b")]))


# --- Conflicts and merging (SUB-28, SUB-29) ---------------------------------------


def test_change_against_an_old_base_is_a_conflict_and_can_merge_when_disjoint(
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
    assert [worker.wait(120) for worker in workers] == [0, 0]
    forget_cache()
    history = catalogue.history("p")
    head = history.head()
    assert head.latest == 25  # every change recorded, none lost to the other process
    assert history.replay(head.current) == catalogue.read_plot("p")
    applied = {s.seq for s in history.steps() if s.status == "applied"}
    assert applied == set(history.chain(head.current))
    load_document(DocumentKind.PLOT, plot_file(catalogue).read_text())  # chain whole


@pytest.mark.skipif(os.name != "posix", reason="process liveness is checked on POSIX only")
def test_a_lock_left_by_a_killed_process_is_taken_over_at_once(catalogue: Catalogue) -> None:
    import socket
    import subprocess
    import sys

    dead = subprocess.run(
        [sys.executable, "-c", "import os; print(os.getpid())"], capture_output=True
    )
    lock = Path(catalogue.store.root) / "p" / ".lock"
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


def test_a_reader_while_a_writer_holds_the_lock_still_reads(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    store.LOCK_WAIT_S, wait = 0.1, store.LOCK_WAIT_S
    try:
        with catalogue.store.locked("p/.lock"):
            forget_cache()
            assert names(catalogue) == ["a", "b"]
            assert catalogue.history("p").open() == []
    finally:
        store.LOCK_WAIT_S = wait


# --- Rules ------------------------------------------------------------------------


def test_a_change_that_does_not_fit_writes_nothing(catalogue: Catalogue) -> None:
    before = plot_file(catalogue).read_bytes()
    with pytest.raises(HistoryError, match="does not have"):
        catalogue.commit("p", [record(2)], Changes(deleted_ids=["nope"]))
    assert plot_file(catalogue).read_bytes() == before


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


def test_the_first_step_cannot_be_undone_by_any_route(catalogue: Catalogue) -> None:
    with pytest.raises(HistoryError):
        catalogue.history("p").goto(0)
    with pytest.raises(HistoryError):
        catalogue.history("p").undo()


def test_a_plot_created_with_content_but_no_record_gets_a_baseline(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "c", "c", "C", "")
    plot = models.DebriefFeatureCollection(
        type="FeatureCollection", schema_version="0.0.11", features=[note("a")], provenance=[]
    )
    catalogue.create_plot("p", "Plot", plot)
    assert catalogue.read_plot("p").provenance[0].agent.name == "debrief-stac"


def test_a_plot_made_outside_debrief_gets_a_first_step(catalogue: Catalogue) -> None:
    raw = on_disk(catalogue)
    del raw["history"]  # as a GIS tool that keeps only GeoJSON might write it
    raw["provenance"] = [json.loads(record(9).model_dump_json(exclude_none=True))]
    plot_file(catalogue).write_text(json.dumps(raw))
    notes = catalogue.history("p").recover()
    assert notes == ["Started this plot's history from its saved content."]
    (step,) = catalogue.history("p").steps()
    assert [r.id for r in step.records] == ["op-9"] and names(catalogue) == ["a"]


# --- Integrity: the hash chain -----------------------------------------------------


@pytest.fixture
def three(catalogue: Catalogue) -> Catalogue:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    catalogue.commit("p", [record(3)], Changes(added=[note("c")]))
    return catalogue


def tamper(catalogue: Catalogue, change) -> None:
    raw = on_disk(catalogue)
    change(raw)
    plot_file(catalogue).write_text(json.dumps(raw, indent=2) + "\n")


def refused_everywhere(catalogue: Catalogue, why: str) -> None:
    before = plot_file(catalogue).read_bytes()
    notes = catalogue.history("p").open()
    assert "changed outside Debrief" in notes[0] and why in notes[0]
    with pytest.raises(HistoryError, match=why):
        catalogue.commit("p", [record(9)], Changes(added=[note("z")]))
    with pytest.raises(HistoryError, match=why):
        catalogue.history("p").undo()
    with pytest.raises(HistoryError, match=why):
        catalogue.write_view("p", None, catalogue.read_view("p")[1])
    with pytest.raises(HistoryError, match=why):
        catalogue.history("p").steps()
    assert catalogue.history("p").problem() is not None
    assert plot_file(catalogue).read_bytes() == before  # never written
    assert names(catalogue) == ["a", "b", "c"]  # shown as its file holds it


def test_a_tampered_step_is_noticed(three: Catalogue) -> None:
    def change(raw):
        raw["history"]["steps"][1]["records"][0]["agent"]["name"] = "someone else"

    tamper(three, change)
    refused_everywhere(three, "step 2 of its history is not as Debrief recorded it")


def test_a_removed_step_is_noticed(three: Catalogue) -> None:
    def remove_last(raw):
        raw["history"]["steps"].pop()
        raw["history"]["current"] = 2

    original = plot_file(three).read_text()
    tamper(three, remove_last)
    refused_everywhere(three, "the last step of its history is missing or was changed")
    plot_file(three).write_text(original)

    def remove_middle(raw):
        raw["history"]["steps"].pop(1)

    tamper(three, remove_middle)
    refused_everywhere(three, "step 2 of its history is not as Debrief recorded it")


def test_reordered_steps_are_noticed(three: Catalogue) -> None:
    def swap(raw):
        steps = raw["history"]["steps"]
        steps[1], steps[2] = steps[2], steps[1]

    tamper(three, swap)
    refused_everywhere(three, "step 2 of its history is not as Debrief recorded it")


def test_a_rehashed_but_renumbered_history_is_still_noticed(three: Catalogue) -> None:
    def renumber(raw):
        raw["history"]["steps"][2]["seq"] = 7  # and its checksum made to match
        previous = raw["history"]["steps"][1]["step_hash"]
        raw["history"]["steps"][2]["step_hash"] = step_hash(raw["history"]["steps"][2], previous)
        raw["history"]["head_hash"] = raw["history"]["steps"][2]["step_hash"]

    tamper(three, renumber)
    refused_everywhere(three, "not numbered")


def test_content_edited_outside_debrief_is_kept_aside_and_rebuilt(three: Catalogue) -> None:
    def rename(raw):
        raw["features"][0]["properties"]["name"] = "Changed outside Debrief"

    tamper(three, rename)
    notes = three.history("p").recover()
    assert notes[0].startswith(
        "This plot's history does not match its content: it may have been edited outside Debrief."
    )
    assert "kept as plot.geojson.kept-" in notes[0]
    assert three.read_plot("p").features[0].properties.name == "Note"
    kept = list(plot_file(three).parent.glob("plot.geojson.kept-*"))
    assert json.loads(kept[0].read_text())["features"][0]["properties"]["name"] == (
        "Changed outside Debrief"
    )
    assert three.history("p").recover() == []


def test_content_edited_outside_debrief_on_a_read_only_store(three: Catalogue) -> None:
    def rename(raw):
        raw["features"][0]["properties"]["name"] = "Changed outside Debrief"

    tamper(three, rename)
    read_only(three)
    notes = three.history("p").open()
    assert "does not match its content" in notes[0] and "left as it is" in notes[0]
    assert three.read_plot("p").features[0].properties.name == "Note"  # as recorded


def test_an_island_only_edit_is_accepted(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[details()]))

    def move_window(raw):
        raw["features"][1]["properties"]["view"] = WINDOW

    tamper(catalogue, move_window)
    assert catalogue.history("p").recover() == []
    assert catalogue.read_view("p")[0].time_window.start == WINDOW["time_window"]["start"]
    assert not list(plot_file(catalogue).parent.glob("plot.geojson.kept-*"))


def test_a_state_marked_wrongly_is_noticed(three: Catalogue) -> None:
    def mark(raw):
        raw["history"]["steps"][2]["state"] = "abandoned"

    tamper(three, mark)
    refused_everywhere(three, "step 3 is marked replaced by a later change but is in the plot")


# --- Save as new, and plots passed to a colleague ------------------------------------


def test_save_as_new_keeps_the_history_and_its_checksums(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    source = tmp_path / "s.rep"
    source.write_text("x")
    catalogue.add_source("p", source)
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    catalogue.history("p").undo()
    catalogue.commit("p", [record(3)], Changes(added=[note("c")]))  # 2 abandoned
    base = catalogue.history("p").base()
    catalogue.commit("p", [record(4)], Changes(modified=[note("a", "Theirs")]))
    new_id = catalogue.save_as_new("p", base, [record(5)], Changes(modified=[note("a", "Mine")]))
    assert catalogue.read_plot("p").features[0].properties.name == "Theirs"
    assert catalogue.read_plot(new_id).features[0].properties.name == "Mine"
    assert catalogue.read_item(new_id).properties.title == "Plot (your changes)"
    assert catalogue.verify_sources(new_id) == []
    assert statuses(catalogue, new_id) == ["applied", "abandoned", "applied", "applied"]
    old, new = (
        on_disk(catalogue)["history"]["steps"],
        on_disk(catalogue, new_id)["history"]["steps"],
    )
    assert [s["step_hash"] for s in new[:3]] == [s["step_hash"] for s in old[:3]]


def test_save_as_new_with_a_bad_base_leaves_nothing_behind(catalogue: Catalogue) -> None:
    with pytest.raises(HistoryError):
        catalogue.save_as_new("p", Base(7, text_hash("x")), [record(2)], Changes())
    assert catalogue.item_ids() == ["p"]
    real = catalogue.history("p").base()
    with pytest.raises(HistoryError):
        catalogue.save_as_new("p", real, [record(2)], Changes(deleted_ids=["nothing"]))
    assert catalogue.item_ids() == ["p"]
    assert not (catalogue.store.root / "p-copy").exists()


def sent(catalogue: Catalogue, tmp_path: Path) -> Path:
    """The sender's plot file, copied out as an analyst would e-mail it: alone."""
    catalogue.commit("p", [record(2, "sender")], Changes(added=[details("Serial 1")]))
    catalogue.commit("p", [record(3, "sender")], Changes(added=[note("b", "Sender's note")]))
    catalogue.history("p").undo()
    catalogue.commit("p", [record(4, "sender")], Changes(added=[note("c", "Sender's other")]))
    _, current = catalogue.read_view("p")
    catalogue.write_view("p", WINDOW, current)
    out = tmp_path / "outbox" / "serial-1.geojson"
    out.parent.mkdir()
    shutil.copyfile(plot_file(catalogue), out)
    return out


def test_a_received_plot_file_brings_its_whole_history(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    received = sent(catalogue, tmp_path)
    colleague = Catalogue.create(tmp_path / "colleague", "theirs", "Colleague's", "")
    item = colleague.add_plot_file(received, AGENT)
    assert item == "serial-1"
    assert colleague.read_item(item).properties.title == "Serial 1"
    steps = colleague.history(item).steps()
    assert [s.status for s in steps] == ["applied", "applied", "abandoned", "applied", "applied"]
    assert [r.agent.name for s in steps for r in s.records] == [
        "analyst",
        "sender",
        "sender",
        "sender",
        "analyst",
    ]
    assert steps[-1].records[0].kind == "import"
    assert steps[-1].records[0].notes == [
        "Added from the plot file serial-1.geojson",
        "Added to the catalogue Colleague's",
    ]
    # Earlier steps unchanged, checksums and all.
    theirs = on_disk(colleague, item)["history"]["steps"]
    assert [s["step_hash"] for s in theirs[:4]] == [
        s["step_hash"] for s in json.loads(received.read_text())["history"]["steps"]
    ]
    assert colleague.read_view(item)[0].time_window.start == WINDOW["time_window"]["start"]
    # Undo, redo and going back to a step work as they did for the sender.
    history = colleague.history(item)
    history.undo()  # the "added" step
    history.undo()  # the sender's last note
    assert [f.id for f in colleague.read_plot(item).features] == ["a", "plot"]
    history.redo()
    history.goto(1)
    assert [f.id for f in colleague.read_plot(item).features] == ["a"]
    # A file named plot.geojson, as a catalogue keeps it, is named after the plot's title.
    renamed = received.with_name("plot.geojson")
    shutil.copyfile(received, renamed)
    assert colleague.add_plot_file(renamed, AGENT) == "serial-1-2"
    # No sources needed: nothing was copied but the plot file.
    assert sorted(p.name for p in (tmp_path / "colleague" / item).iterdir()) == [
        "plot.geojson",
        f"{item}.json",
    ]


def test_a_received_file_with_a_broken_history_is_refused(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    received = sent(catalogue, tmp_path)
    raw = json.loads(received.read_text())
    raw["history"]["steps"][1]["records"][0]["agent"]["name"] = "someone else"
    received.write_text(json.dumps(raw))
    colleague = Catalogue.create(tmp_path / "colleague", "theirs", "Colleague's", "")
    with pytest.raises(HistoryError, match="was not added: its history has been changed"):
        colleague.add_plot_file(received, AGENT)
    assert colleague.item_ids() == []
    raw = json.loads(received.read_text().replace("someone else", "sender"))
    raw["features"][0]["properties"]["name"] = "Edited"
    received.write_text(json.dumps(raw))
    with pytest.raises(HistoryError, match="does not match its content"):
        colleague.add_plot_file(received, AGENT)
    assert colleague.item_ids() == []


def test_a_received_plot_file_without_history_gets_a_first_step(tmp_path: Path) -> None:
    plain = tmp_path / "from-gis.geojson"
    plain.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "schema_version": "0.0.11",
                "features": [json.loads(note("a").model_dump_json(exclude_none=True))],
                "provenance": [],
            }
        ).replace('"properties"', '"geometry": null, "properties"')
    )
    colleague = Catalogue.create(tmp_path / "colleague", "theirs", "Colleague's", "")
    item = colleague.add_plot_file(plain, AGENT)
    assert [len(s.records) for s in colleague.history(item).steps()] == [1, 1]


# --- Moving a history folder into the plot file -------------------------------------


def legacy(catalogue: Catalogue, item: str, script: list) -> list[models.Delta]:
    """Lay a plot out as the earlier layout did: a delta file per change in a history
    folder, a head, and a plot file with no history in it. script is a list of
    ("change", records, Changes) and ("undo",) entries."""
    folder = Path(catalogue.store.root) / item / "history"
    deltas: list[models.Delta] = []
    current = 0

    def replay(upto):
        chain = []
        while upto:
            chain.append(upto)
            upto = deltas[upto - 1].after
        plot = empty_plot()
        for seq in reversed(chain):
            d = deltas[seq - 1]
            plot = apply(plot, d.records, Changes.of(d))
        return plot

    for entry in script:
        if entry[0] == "undo":
            current = deltas[current - 1].after
            continue
        _, records, changes = entry
        plot = apply(replay(current), records, changes)
        delta = models.Delta(
            schema_version="0.0.11",
            seq=len(deltas) + 1,
            after=current,
            records=records,
            added=changes.added or None,
            modified=changes.modified or None,
            deleted_ids=changes.deleted_ids or None,
            result_hash=text_hash(dump_document(DocumentKind.PLOT, plot)),
        )
        deltas.append(delta)
        current = delta.seq
    folder.mkdir(exist_ok=True)
    for delta in deltas:
        (folder / f"{delta.seq:06d}.json").write_text(dump_document(DocumentKind.DELTA, delta))
    live, seq = set(), len(deltas)
    while seq:
        live.add(seq)
        seq = deltas[seq - 1].after
    head = models.HistoryHead(
        schema_version="0.0.11",
        current=current,
        latest=len(deltas),
        abandoned=[s for s in range(1, len(deltas) + 1) if s not in live] or None,
        plot_hash=deltas[current - 1].result_hash,
    )
    (folder / "head.json").write_text(dump_document(DocumentKind.HISTORY_HEAD, head))
    text = dump_document(DocumentKind.PLOT, replay(current))
    raw = json.loads(text)
    for feature in raw["features"]:
        if feature["properties"]["kind"] == "plot":
            feature["properties"]["view"] = WINDOW
    plot_file(catalogue, item).write_text(json.dumps(raw, indent=2) + "\n")
    return deltas


SCRIPT = [
    ("change", [record(1)], Changes(added=[note("a"), details()])),
    ("change", [record(2)], Changes(added=[note("b")])),
    ("change", [record(3)], Changes(added=[note("c")])),
    ("undo",),
    ("change", [record(4)], Changes(modified=[note("a", "Edited")])),
    ("change", [record(5)], Changes(deleted_ids=["b"])),
    ("undo",),
]


@pytest.fixture
def old(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "old", "old", "Old", "")
    catalogue.create_plot("p", "Plot")
    forget_cache()
    return catalogue


def test_a_history_folder_is_moved_into_the_plot_file(old: Catalogue) -> None:
    deltas = legacy(old, "p", SCRIPT)
    forget_cache()
    notes = old.history("p").open()
    assert notes == [
        "This plot's history was moved into its plot file, so the one file now carries it."
    ]
    assert not (Path(old.store.root) / "p" / "history").exists()
    history = old.history("p")
    assert [s.status for s in history.steps()] == [
        "applied",
        "applied",
        "abandoned",
        "applied",
        "undone",
    ]
    assert history.head().current == 4
    for seq in (1, 2, 4, 5):  # every reachable step replays to what the folder recorded
        text = dump_document(DocumentKind.PLOT, history.replay(seq))
        assert text_hash(text) == deltas[seq - 1].result_hash
    assert [s.records for s in history.steps()] == [d.records for d in deltas]
    assert old.read_view("p")[0].time_window.end == WINDOW["time_window"]["end"]  # island kept
    load_document(DocumentKind.PLOT, plot_file(old).read_text())  # a valid chain
    history.redo()
    assert names(old) == ["a", "plot"]


def test_moving_a_history_folder_finishes_an_interrupted_change(old: Catalogue) -> None:
    legacy(old, "p", SCRIPT[:3])
    folder = Path(old.store.root) / "p" / "history"
    head = json.loads((folder / "head.json").read_text())
    head.update(current=2, latest=2)  # the crash: delta 3 written, head not
    (folder / "head.json").write_text(json.dumps(head))
    notes = old.history("p").recover()
    assert "Finished saving a change that was interrupted (step 3)." in notes
    assert names(old) == ["a", "plot", "b", "c"]


@pytest.mark.parametrize("damage", ["delete", "corrupt"])
def test_moving_a_history_folder_with_a_lost_head(old: Catalogue, damage: str) -> None:
    legacy(old, "p", SCRIPT)
    head = Path(old.store.root) / "p" / "history" / "head.json"
    head.unlink() if damage == "delete" else head.write_text("{not json")
    notes = old.history("p").recover()
    assert "rebuilt from the recorded changes" in notes[0]
    assert old.history("p").head().current == 5  # the latest, as the earlier layout did


def test_moving_a_history_folder_leaves_out_a_half_written_delta(old: Catalogue) -> None:
    legacy(old, "p", SCRIPT[:2])
    folder = Path(old.store.root) / "p" / "history"
    (folder / "000003.json").write_text('{"schema_version": "0.0.11", "seq": 3, "aft')
    notes = old.history("p").recover()
    assert "interrupted before it was saved (step 3)" in notes[0]
    assert len(old.history("p").steps()) == 2


def test_a_history_folder_on_a_read_only_store_is_folded_in_memory(old: Catalogue) -> None:
    legacy(old, "p", SCRIPT)
    folder = Path(old.store.root) / "p"
    before = {p: p.read_bytes() for p in folder.rglob("*") if p.is_file()}
    read_only(old)
    assert names(old) == ["a", "plot", "b"]
    assert [s.status for s in old.history("p").steps()][2] == "abandoned"
    assert "cannot be changed" not in " ".join(old.history("p").open())
    assert {p: p.read_bytes() for p in folder.rglob("*") if p.is_file()} == before


def test_a_history_folder_that_does_not_replay_is_left_alone(old: Catalogue) -> None:
    deltas = legacy(old, "p", SCRIPT[:2])
    folder = Path(old.store.root) / "p" / "history"
    wrong = deltas[1].model_copy(update={"result_hash": text_hash("not this")})
    (folder / "000002.json").write_text(dump_document(DocumentKind.DELTA, wrong))
    notes = old.history("p").recover()
    assert "could not be moved into its plot file" in notes[0]
    assert folder.exists()
    with pytest.raises(HistoryError, match="could not be moved"):
        old.commit("p", [record(9)], Changes(added=[note("z")]))


def read_only(catalogue: Catalogue) -> None:
    def refuse(*args, **kwargs):
        raise PermissionError("read-only")

    for name in ("write_text_atomic", "write_text_exclusive", "rename", "locked", "delete"):
        setattr(catalogue.store, name, refuse)


def test_a_read_only_store_is_read_without_writing(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    read_only(catalogue)
    forget_cache()
    assert names(catalogue) == ["a", "b"]
    assert catalogue.history("p").base().current == 2
    assert catalogue.history("p").open() == []


def test_saving_works_where_there_are_no_hard_links(catalogue: Catalogue, monkeypatch) -> None:
    """Pyodide's os has no link at all (CON-09)."""
    monkeypatch.delattr(os, "link")
    catalogue.commit("p", [record(2)], Changes(added=[note("b")]))
    assert names(catalogue) == ["a", "b"]


# --- Large plots: checked once, not on every change -----------------------------------


def track(i: int, n: int) -> models.TrackFeature:
    from debrief_kernel.time import format_utc

    return models.TrackFeature(
        type="Feature",
        id=f"t{i}",
        geometry=models.LineStringGeometry(
            type="LineString",
            coordinates=[[-4.0 + 0.0001 * k, 50.0 + 0.0001 * k + 0.01 * i] for k in range(n)],
        ),
        properties=models.TrackProperties(
            kind="track",
            name=f"T{i}",
            times=[format_utc(1_700_000_000_000 + 1000 * k) for k in range(n)],
        ),
    )


def test_a_large_plot_checks_only_new_steps(tmp_path: Path, monkeypatch) -> None:
    catalogue = Catalogue.create(tmp_path / "big", "big", "Big", "")
    catalogue.create_plot("p", "Big")
    catalogue.commit("p", [record(1)], Changes(added=[track(i, 1000) for i in range(10)]))
    for n in range(2, 30):
        catalogue.commit("p", [record(n)], Changes(added=[note(f"n{n}")]))
    checked = []
    real = history_module.load_history_step
    monkeypatch.setattr(
        history_module, "load_history_step", lambda raw: checked.append(raw["seq"]) or real(raw)
    )
    started = time.perf_counter()
    catalogue.commit("p", [record(30)], Changes(added=[note("n30")]))
    catalogue.history("p").undo()
    catalogue.read_plot("p")
    assert time.perf_counter() - started < 20  # generous: a smoke test, not a benchmark
    assert checked == []  # this process wrote it: nothing checked again
    # Another process adds a step: only that step is checked here.
    known = history_module._FILES[catalogue.history("p")._key]
    catalogue.commit("p", [record(31)], Changes(added=[note("n31")]))
    history_module._FILES[catalogue.history("p")._key] = known
    history_module._SPLIT.clear()
    assert len(catalogue.history("p").steps()) == 31
    assert checked == [31]
    # A new process checks every step once.
    forget_cache()
    checked.clear()
    catalogue.history("p").steps()
    assert checked == list(range(1, 32))


def test_the_empty_history_starts_from_the_genesis_hash(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "c", "c", "C", "")
    catalogue.create_plot("p", "Empty")
    history = on_disk(catalogue)["history"]
    assert history == {"current": 0, "head_hash": GENESIS_HASH, "steps": []}
