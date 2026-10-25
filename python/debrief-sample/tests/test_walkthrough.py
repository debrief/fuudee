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
    TMA_FIRST_CUT,
    TMA_LEG_SHEAR,
    TMA_PERIOD,
    TMA_SENSOR,
    TMA_SHEAR,
    TMA_SPLIT,
    TOURS,
    WILD_AT,
    copy_for_tour,
    log_track,
    navigation_log,
    play_tma,
    prepare,
    wild_cut,
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
        # Its sources and supporting files came with it; its sensors are in the plot.
        kinds = sorted(a.debrief_asset_kind for a in target.assets(item).values())
        assert kinds.count("source") == 3 and "supporting_file" in kinds
        assert sum(f.properties.kind == "sensor" for f in copy.features) == 2
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


def test_the_walkthrough_module_does_not_import_the_builder() -> None:
    # The playground imports it under Pyodide; the builder is never needed there.
    code = (
        "import sys; import debrief_sample.walkthrough; "
        "print('ok' if 'debrief_sample.builder' not in sys.modules else 'builder')"
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


def test_bearings_and_tma_has_one_wild_bearing_as_a_step(sample: Path, tmp_path: Path) -> None:
    target = Catalogue.create(tmp_path / "work", "work", "Work", "A catalogue to work in")
    item = copy_for_tour(target, sample, "tma")
    assert target.read_plot(item).provenance[-1].notes == [
        "A wild bearing put into Towed array cut at 11:12:00Z",
        "Its bearings turned 40° off, for the walkthrough to leave out",
    ]
    original = {f.id: f for f in Catalogue.open(sample).read_plot(PLOT).features}
    changed = [
        f
        for f in target.read_plot(item).features
        if f.properties.kind == "sensor_cut" and f != original[f.id]
    ]
    assert [c.id for c in changed] == [wild_cut(target.read_plot(item)).id]
    (cut,) = changed
    for field in ("bearing", "ambiguous_bearing"):
        was = getattr(original[cut.id].properties, field).value
        now = getattr(cut.properties, field).value
        assert round((was - now) % 360, 2) == 40.0


def _tma_steps() -> dict:
    tours = Path(__file__).resolve().parents[3] / "vscode" / "walkthroughs" / "tours.json"
    tour = next(t for t in json.loads(tours.read_text("utf-8"))["tours"] if t["id"] == "tma")
    return {s["id"]: s for s in tour["steps"]}


def test_bearings_and_tma_asks_what_the_walkthrough_plays() -> None:
    # The steps' buttons and words (tours.json) and the steps played here say the same.
    steps = _tma_steps()
    day = "2023-06-15T"
    resolve, make = steps["resolve"]["vscode"], steps["make"]["vscode"]
    assert resolve["args"] == [TMA_SENSOR, {"cut_time": f"{day}{TMA_FIRST_CUT}.000Z"}]
    assert make["args"][1]["period"] == {
        "start": f"{day}{TMA_PERIOD[0]}.000Z",
        "end": f"{day}{TMA_PERIOD[1]}.000Z",
    }
    assert steps["legs"]["vscode"]["args"] == ["$solution", {"cut_time": f"{day}{TMA_SPLIT}.000Z"}]
    assert f"about {TMA_SHEAR[0]:.0f}° at {TMA_SHEAR[1]:.0f} kn" in steps["drag"]["text"]
    assert f"about {TMA_LEG_SHEAR[0]:.0f}° at {TMA_LEG_SHEAR[1]:.0f} kn" in steps["legs"]["text"]
    assert f"{WILD_AT[:5]}Z" in steps["wild"]["text"]


def test_bearings_and_tma_gives_on_the_sample_what_its_steps_promise(
    sample: Path, tmp_path: Path
) -> None:
    from debrief_stac import tma

    steps = _tma_steps()
    target = Catalogue.create(tmp_path / "work", "work", "Work", "A catalogue to work in")
    item = copy_for_tour(target, sample, "tma")
    plot = target.read_plot(item)
    first = next(
        f
        for f in plot.features
        if f.properties.kind == "sensor_cut"
        and f.properties.sensor_id == TMA_SENSOR
        and f.properties.time.endswith(f"T{TMA_FIRST_CUT}.000Z")
    )
    row = tma.cut_row(tma.cut_infos(plot, [first])[0])
    stages = play_tma(target, item)
    # Step 2: the side the Bow sonar agrees with is the one the step names.
    kept = stages["first"]["kept"]
    flipped = {"port": "starboard", "starboard": "port"}[row["side"]]
    side = row["side"] if kept == "bearing" else flipped
    assert f"**Keep {row[kept]:.1f}° ({side})**" in steps["resolve"]["text"]
    rms = {name: stage["residuals"]["rms"] for name, stage in stages.items()}
    # Step 3: Debrief's first guess is far off, as said.
    assert rms["first"] > 50
    # Step 4: the shear named fits visibly better, to about the RMS said.
    assert rms["drag"] < 15 and "to about 14°" in steps["drag"]["text"]
    # Step 5: the largest residual is the wild bearing's; leaving it out lowers the RMS.
    counted = [r for r in stages["drag"]["residuals"]["rows"] if r.get("residual") is not None]
    largest = max(counted, key=lambda r: abs(r["residual"]))
    assert largest["id"] == wild_cut(target.read_plot(item)).id
    assert abs(largest["residual"]) > 30
    assert rms["wild"] < rms["drag"]
    # Step 6: the residuals climb until the turn and fall after it; split there, the first
    # leg's shear brings its residuals down and the second leg stays where it is.
    rows = stages["wild"]["residuals"]["rows"]

    def at(clock: str) -> float:
        return next(r["residual"] for r in rows if r["time"][11:19] == clock)

    assert at("10:32:00") > at("09:46:00") + 20 and at("10:32:00") > at("11:04:00") + 20
    split = stages["split"]

    def leg_rms(stage: dict, leg: int) -> float:
        values = [
            r["residual"]
            for r in stage["residuals"]["rows"]
            if r["leg"] == leg and r.get("residual") is not None and not r.get("excluded")
        ]
        return (sum(v * v for v in values) / len(values)) ** 0.5

    assert split["leg_starts"] == [f"2023-06-15T{TMA_SPLIT}.000Z"]
    assert leg_rms(split, 1) > 15 and leg_rms(stages["legs"], 1) < 6
    later = next(i for i, t in enumerate(split["times"]) if t >= split["leg_starts"][0])
    assert stages["legs"]["coordinates"][later:] == split["coordinates"][later:]
    assert rms["legs"] < rms["wild"] / 2
