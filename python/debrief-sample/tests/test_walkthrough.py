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
    TMA_LEG_MOVE,
    TMA_LEG_SHEAR,
    TMA_MOVE,
    TMA_PERIOD,
    TMA_RANGE,
    TMA_SENSOR,
    TMA_SHEAR,
    TMA_SPLIT,
    TOURS,
    WILD_AT,
    WILD_TURN,
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
        "Its bearings turned 40° off, still mirrored about the array's heading, "
        "for the walkthrough to leave out",
    ]
    original = {f.id: f for f in Catalogue.open(sample).read_plot(PLOT).features}
    changed = [
        f
        for f in target.read_plot(item).features
        if f.properties.kind == "sensor_cut" and f != original[f.id]
    ]
    assert [c.id for c in changed] == [wild_cut(target.read_plot(item)).id]
    (cut,) = changed
    was, now = original[cut.id].properties, cut.properties
    # A towed array's pair mirror each other about the array's heading: turned opposite ways,
    # they still do, about the same heading (half their sum, or that and 180°).
    assert round((was.bearing.value - now.bearing.value) % 360, 2) == WILD_TURN
    assert round((now.ambiguous_bearing.value - was.ambiguous_bearing.value) % 360, 2) == WILD_TURN

    def axis(a: float, b: float) -> float:
        return round(((a + b) / 2) % 180, 2)

    assert axis(now.bearing.value, now.ambiguous_bearing.value) == axis(
        was.bearing.value, was.ambiguous_bearing.value
    )


def _tma_steps() -> dict:
    tours = Path(__file__).resolve().parents[3] / "vscode" / "walkthroughs" / "tours.json"
    tour = next(t for t in json.loads(tours.read_text("utf-8"))["tours"] if t["id"] == "tma")
    return {s["id"]: s for s in tour["steps"]}


def test_bearings_and_tma_asks_what_the_walkthrough_plays() -> None:
    # The steps' buttons and words (tours.json) and the steps played here say the same.
    steps = _tma_steps()
    assert list(steps) == ["open", "resolve", "make", "range", "shear", "wild", "legs"]
    day = "2023-06-15T"
    resolve, make = steps["resolve"]["vscode"], steps["make"]["vscode"]
    assert resolve["args"] == [TMA_SENSOR, {"cut_time": f"{day}{TMA_FIRST_CUT}.000Z"}]
    assert make["args"][1]["period"] == {
        "start": f"{day}{TMA_PERIOD[0]}.000Z",
        "end": f"{day}{TMA_PERIOD[1]}.000Z",
    }
    assert steps["wild"]["vscode"]["args"] == ["$solution", {"cut_time": f"{day}{WILD_AT}.000Z"}]
    assert steps["legs"]["vscode"]["args"] == ["$solution", {"cut_time": f"{day}{TMA_SPLIT}.000Z"}]
    words = {k: s["text"] for k, s in steps.items()}
    keys = {k: s["keys"] for k, s in steps.items()}
    assert f"{TMA_RANGE:.2f} nmi from the towed array at {TMA_FIRST_CUT[:5]}Z" in words["range"]
    assert f"type `{TMA_MOVE[0]:.2f} nmi` and `{TMA_MOVE[1]:05.1f}`" in words["range"]
    assert f"about {TMA_SHEAR[0]:.0f}° at {TMA_SHEAR[1]:.1f} kn" in words["shear"]
    assert f"`{TMA_SHEAR[0]:.0f}` and `{TMA_SHEAR[1]:.1f} kn`" in keys["shear"]
    assert f"Split into legs at {TMA_SPLIT}Z" in words["legs"]
    assert f"about {TMA_LEG_MOVE[0]:.2f} nmi at {TMA_LEG_MOVE[1]:.0f}°" in words["legs"]
    assert f"`{TMA_LEG_MOVE[0]:.2f} nmi` and `{TMA_LEG_MOVE[1]:.0f}`" in keys["legs"]
    assert f"about {TMA_LEG_SHEAR[0]:.0f}° at {TMA_LEG_SHEAR[1]:.1f} kn" in words["legs"]
    assert f"`{TMA_LEG_SHEAR[0]:.0f}` and `{TMA_LEG_SHEAR[1]:.1f} kn`" in keys["legs"]
    assert f"the cut at {WILD_AT[:5]}Z" in words["wild"]
    # Each step its own event: the whole solution moved, then sheared; a leg once it is split.
    assert [s["event"] for s in steps.values()] == [
        "tmaOpened",
        "sideKept",
        "solutionMade",
        "solutionMoved",
        "solutionSheared",
        "cutLeftOut",
        "legDragged",
    ]


#: The analyst's error cut-off unless they set another (debrief_config), as Bearings' cue counts.
CUT_OFF = 3.0


def _cue(report: dict) -> tuple[int, int, float]:
    """How many errors are counted, how many are beyond the cut-off, and the largest: the cue."""
    counted = [
        r["residual"]
        for r in report["rows"]
        if r.get("residual") is not None and not r.get("excluded") and not r.get("hidden")
    ]
    return len(counted), sum(abs(v) > CUT_OFF for v in counted), max(abs(v) for v in counted)


def _rms(values: list[float]) -> float:
    return (sum(v * v for v in values) / len(values)) ** 0.5


def _off(a: float, b: float) -> float:
    return (a - b + 180) % 360 - 180


def test_bearings_and_tma_gives_on_the_sample_what_its_steps_promise(
    sample: Path, tmp_path: Path
) -> None:
    from debrief_config import DEFAULT_TMA_ERROR_CUT_OFF
    from debrief_kernel.geodesy import Position, range_bearing
    from debrief_stac import tma

    assert DEFAULT_TMA_ERROR_CUT_OFF == CUT_OFF
    steps = _tma_steps()
    words = {k: s["text"] for k, s in steps.items()}
    target = Catalogue.create(tmp_path / "work", "work", "Work", "A catalogue to work in")
    item = copy_for_tour(target, sample, "tma")
    plot = target.read_plot(item)

    def cut_at(sensor: str, clock: str):
        return next(
            f
            for f in plot.features
            if f.properties.kind == "sensor_cut"
            and f.properties.sensor_id == sensor
            and f.properties.time.endswith(f"T{clock}.000Z")
        )

    first = cut_at(TMA_SENSOR, TMA_FIRST_CUT)
    first_info = tma.cut_infos(plot, [first])[0]
    row = tma.cut_row(first_info)
    bow = cut_at("sensor-blue-one-bow-sonar", TMA_FIRST_CUT)
    stages = play_tma(target, item)
    red = next(f for f in plot.features if f.properties.name == "RED ONE")

    def truth(clock: str) -> Position:
        at = red.properties.times.index(f"2023-06-15T{clock}.000Z")
        return Position(*red.geometry.coordinates[at][:2])

    def fix(stage: str, clock: str) -> Position:
        st = stages[stage]
        return Position(*st["coordinates"][st["times"].index(f"2023-06-15T{clock}.000Z")][:2])

    # Step 2: the Bow sonar's bearing then, as said; the side it agrees with is the one named,
    # and the other side's button is the one the keys go back past.
    assert f"it bore {bow.properties.bearing.value:.1f}°" in words["resolve"]
    kept = stages["first"]["kept"]
    other = "ambiguous_bearing" if kept == "bearing" else "bearing"
    flipped = {"port": "starboard", "starboard": "port"}
    side = {"bearing": row["side"], "ambiguous_bearing": flipped[row["side"]]}
    assert f"**Keep {row[kept]:.1f}° ({side[kept]})**" in words["resolve"]
    assert f"past **Keep {row[other]:.1f}° ({side[other]})**" in steps["resolve"]["keys"]
    cue = {name: _cue(stage["residuals"]) for name, stage in stages.items()}
    rms = {name: stage["residuals"]["rms"] for name, stage in stages.items()}
    # Step 3: Debrief's first guess is far off, as said: its RMS and its cue.
    counted, beyond, _ = cue["first"]
    assert f"towed array's {counted} cuts from {TMA_PERIOD[0][:5]}Z" in words["make"]
    assert (
        f"An RMS of {rms['first']:.0f}° and ✗ *{beyond} of {counted} beyond 3.0°*"
        in (words["make"])
    )
    # Step 4: moved along the first bearing to the range said, which is RED ONE's then: the
    # first guess's range less the move, the start still on its bearing; the RMS up, as said.
    origin = first_info.origin
    was_range, was_bearing = range_bearing(origin, fix("first", TMA_FIRST_CUT))
    now_range, now_bearing = range_bearing(origin, fix("range", TMA_FIRST_CUT))
    true_range, _ = range_bearing(origin, truth(TMA_FIRST_CUT))
    assert abs(now_range.value / 1852 - TMA_RANGE) < 0.01
    assert abs(true_range.value / 1852 - TMA_RANGE) < 0.01
    assert abs(was_range.value / 1852 - TMA_MOVE[0] - TMA_RANGE) < 0.01
    assert abs(_off(now_bearing.value, was_bearing.value)) < 0.2
    assert round((was_bearing.value + 180) % 360, 1) == TMA_MOVE[1]
    assert f"The RMS goes up, to {rms['range']:.0f}°" in words["range"]
    assert rms["range"] > rms["first"]
    # Step 5: the shear fits the first leg (its 40 cuts to 10:32Z) near the bearings' accuracy,
    # and the errors run away after RED ONE's turn; the cue and the RMS as said.
    rows = stages["shear"]["residuals"]["rows"]
    leg1 = [r["residual"] for r in rows if r["time"][11:19] <= "10:32:00"]
    assert len(leg1) == 40 and _rms(leg1) < 2.0
    assert f"all but {sum(abs(v) > CUT_OFF for v in leg1)} of the 40" in words["shear"]
    assert f"an RMS of {_rms(leg1):.1f}° there" in words["shear"]
    last = next(r["residual"] for r in rows if r["time"][11:19] == TMA_PERIOD[1])
    assert last < -50 and f"to −{abs(last):.0f}° by {TMA_PERIOD[1][:5]}Z" in words["shear"]
    counted, beyond, _ = cue["shear"]
    assert (
        f"✗ *{beyond} of {counted} beyond 3.0°*, and the RMS is {rms['shear']:.0f}°"
        in (words["shear"])
    )
    # Step 6: the wild bearing sits some 40° left of (below) its neighbours, and is left out.
    wild = wild_cut(target.read_plot(item))
    at = {r["time"][11:19]: r for r in rows}
    neighbours = (at["11:11:00"]["residual"] + at["11:13:00"]["residual"]) / 2
    assert at[WILD_AT]["id"] == wild.id and 35 < neighbours - at[WILD_AT]["residual"] < 45
    assert stages["wild"]["residuals"]["excluded"] == 1
    # Step 7: split at 10:38Z; the second leg's start pinned on its first bearing (its error
    # there near zero), then sheared; the first leg never moves; the RMS near the bearings' own
    # accuracy; the cue as said.
    split = stages["split"]
    assert split["leg_starts"] == [f"2023-06-15T{TMA_SPLIT}.000Z"]
    later = next(i for i, t in enumerate(split["times"]) if t >= split["leg_starts"][0])
    for name in ("pin", "legs"):
        assert stages[name]["coordinates"][:later] == split["coordinates"][:later]
    pinned = next(r for r in stages["pin"]["residuals"]["rows"] if r["time"][11:19] == TMA_SPLIT)
    assert abs(pinned["residual"]) < 0.5
    counted, beyond, largest = cue["legs"]
    assert rms["legs"] < 2.0 and beyond <= 12
    assert f"The RMS comes down to {rms['legs']:.1f}°" in words["legs"]
    assert f"✗ *{beyond} of {counted} beyond 3.0°, the largest {largest:.1f}°*" in words["legs"]
    # What RED ONE's true track would leave, as said: the bearings' own errors. And the sides
    # the ≈ cuts were measured by: once the solution is near, the nearer is the true side.
    final = stages["legs"]["residuals"]["rows"]
    now = target.read_plot(item)
    infos = {
        i.cut.id: i
        for i in tma.cut_infos(now, [f for f in now.features if f.id in {r["id"] for r in final}])
    }
    true_errors, wrong_side = [], 0
    for r in final:
        if r.get("excluded"):
            continue
        _, true_bearing = range_bearing(infos[r["id"]].origin, truth(r["time"][11:19]))
        options = [r["bearing"], *([r["ambiguous_bearing"]] if r.get("ambiguous_bearing") else [])]
        true_errors.append(min((_off(b, true_bearing.value) for b in options), key=abs))
        wrong_side += abs(_off(r["measured"], true_bearing.value)) > 10
    true_beyond = sum(abs(e) > CUT_OFF for e in true_errors)
    assert f"RED ONE's true track would leave {true_beyond}:" in words["legs"]
    assert _rms(true_errors) < 2.0 and rms["legs"] < _rms(true_errors) + 0.3
    assert wrong_side <= 1
