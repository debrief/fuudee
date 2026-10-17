"""Walkthrough copies (CAP-25): fresh, complete, titled, and never touching the sample."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from debrief_io import import_rep
from debrief_sample import build
from debrief_sample.walkthrough import (
    LOG_FILE,
    PLOT,
    TOURS,
    copy_for_tour,
    log_track,
    navigation_log,
    prepare,
)
from debrief_stac import Catalogue


def _files(root: Path) -> dict[str, bytes]:
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*") if p.is_file()}


@pytest.fixture(scope="module")
def sample(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("sample") / "catalogue"
    build(root)
    return root


def test_a_copy_leaves_the_sample_alone(sample: Path, tmp_path: Path) -> None:
    before = _files(sample)
    target = Catalogue.create(tmp_path / "work", "work", "Work", "A catalogue to work in")
    for tour in TOURS:
        copy_for_tour(target, sample, tour)
    assert _files(sample) == before


def test_each_copy_is_serial_1_titled_after_its_walkthrough(sample: Path, tmp_path: Path) -> None:
    target = Catalogue.create(tmp_path / "work", "work", "Work", "A catalogue to work in")
    original = Catalogue.open(sample).read_plot(PLOT)
    for tour, title in TOURS.items():
        item = copy_for_tour(target, sample, tour)
        assert item == f"{PLOT}-{tour}"
        assert target.read_item(item).properties.title == f"Serial 1: {title}"
        copy = target.read_plot(item)
        tracks = {f.properties.name for f in copy.features if f.properties.kind == "track"}
        assert tracks == {
            f.properties.name for f in original.features if f.properties.kind == "track"
        }
        # Its sources, payloads and supporting files came with it.
        kinds = sorted(a.debrief_asset_kind for a in target.assets(item).values())
        assert kinds.count("source") == 3 and "payload" in kinds and "supporting_file" in kinds
        notes = [n for r in copy.provenance for n in (r.notes or [])]
        assert f"Copied from Serial 1 of the sample for the walkthrough {title}" in notes
    # Another copy of the same walkthrough is another plot, never over the first.
    assert copy_for_tour(target, sample, "explore") == f"{PLOT}-explore-2"


def test_tidy_a_track_has_three_glitches_to_remove(sample: Path, tmp_path: Path) -> None:
    target = Catalogue.create(tmp_path / "work", "work", "Work", "A catalogue to work in")
    item = copy_for_tour(target, sample, "tidy")
    red = next(f for f in target.read_plot(item).features if f.properties.name == "RED ONE")
    _, _, jumps = target.find_jumps(item, red.id)
    assert len(jumps) == 3
    last = target.read_plot(item).provenance[-1]
    assert last.notes == [
        "GPS glitches put into RED ONE",
        "Three fixes moved off the track, for the walkthrough",
    ]
    # The sample's own RED ONE has none.
    assert Catalogue.open(sample).find_jumps(PLOT, red.id)[2] == []


def test_the_navigation_log_is_new_data_for_the_copy(tmp_path: Path) -> None:
    made = prepare(tmp_path / "collate", "collate")
    assert made["item"] == f"{PLOT}-collate" and Path(made["log"]).name == LOG_FILE
    # Outside the catalogue: a file waiting to be imported, not an item.
    assert Path(made["log"]).parent == Path(made["catalogue"]).parent
    catalogue = Catalogue.open(Path(made["catalogue"]))
    text = Path(made["log"]).read_text(encoding="utf-8")
    assert text == navigation_log(log_track(catalogue, made["item"]))
    assert "Blue One" in text and "WATCHER" in text
    import_rep(catalogue, Path(made["log"]), item_id="blue-one-nav-log", modes="otg")
    report = catalogue.coverage(made["item"])
    marked = [i for i in report.items if i.new_data]
    assert [i.item for i in marked] == ["blue-one-nav-log"]


def test_the_command_line_prepares_a_walkthrough(tmp_path: Path) -> None:
    out = subprocess.run(
        [sys.executable, "-m", "debrief_sample", "walkthrough", str(tmp_path / "w"), "explore"],
        check=True,
        capture_output=True,
        text=True,
    )
    made = json.loads(out.stdout)
    assert (
        made["item"] == "serial-1-explore"
        and made["title"] == "Serial 1: Open and explore a serial"
    )
    assert "log" not in made


def test_the_walkthrough_module_runs_without_pyarrow() -> None:
    # The playground imports it under Pyodide, where pyarrow is not installed.
    code = (
        "import sys; sys.modules['pyarrow'] = None; import debrief_sample.walkthrough; print('ok')"
    )
    out = subprocess.run([sys.executable, "-c", code], check=True, capture_output=True, text=True)
    assert out.stdout.strip() == "ok"


def test_the_walkthrough_pictures_are_drawn_from_the_sample() -> None:
    # VS Code's Get Started page and the playground show these: made by
    # python -m debrief_sample media vscode/media/walkthroughs, and kept up to date.
    from debrief_sample.media import write_media

    media = Path(__file__).resolve().parents[3] / "vscode" / "media" / "walkthroughs"
    assert write_media(media, check=True) == []
    tours = json.loads((media.parents[1] / "walkthroughs" / "tours.json").read_text("utf-8"))
    named = {s["media"] for t in tours["tours"] for s in t["steps"]}
    assert named == {p.name for p in media.glob("*.svg")}
    for picture in media.glob("*.svg"):
        text = picture.read_text("utf-8")
        assert "<script" not in text and "var(--vscode-" in text
