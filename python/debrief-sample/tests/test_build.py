"""The sample catalogue: deterministic, valid, and carrying its own provenance (DEP-08, SUB-18)."""

from __future__ import annotations

import csv
import re
from dataclasses import replace
from pathlib import Path

import pytest

from debrief_kernel.time import parse_utc
from debrief_sample import DEFAULT_SEED, build
from debrief_sample import builder as sample_builder
from debrief_sample.builder import TOOL, extract_path
from debrief_sample.exercise import SERIALS, script_digest
from debrief_sample.payload import read_bearings
from debrief_schemas import DocumentKind, load_document
from debrief_stac import Catalogue
from debrief_stac.hashing import content_hash


def _files(root: Path) -> dict[str, bytes]:
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*") if p.is_file()}


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("sample") / "catalogue"
    build(root)
    return root


def test_builds_are_byte_identical(built: Path, tmp_path: Path) -> None:
    again = tmp_path / "again"
    build(again)
    first, second = _files(built), _files(again)
    assert sorted(first) == sorted(second)
    different = [name for name in first if first[name] != second[name]]
    assert different == []


def test_another_seed_changes_the_exercise_but_not_the_ais(built: Path, tmp_path: Path) -> None:
    other = tmp_path / "other"
    build(other, seed=DEFAULT_SEED + 1)
    first, second = _files(built), _files(other)
    assert first["serial-1/sources/red-one.rep"] != second["serial-1/sources/red-one.rep"]
    ais = "serial-1/sources/ais-2023-06-15-chesapeake-approaches.csv"
    assert first[ais] == second[ais]


def test_three_serials_each_a_valid_plot(built: Path) -> None:
    catalogue = Catalogue.open(built)
    assert sorted(catalogue.item_ids()) == [s.item_id for s in SERIALS]
    load_document(DocumentKind.STAC_CATALOG, (built / "catalog.json").read_text())
    for serial in SERIALS:
        item = catalogue.read_item(serial.item_id)  # validates
        hours = (serial.end_ms - serial.start_ms) / 3_600_000
        assert 4 <= hours <= 6
        plot = catalogue.read_plot(serial.item_id)  # validates
        kinds = [f.properties.kind for f in plot.features]
        assert kinds.count("sensor_observations") == 1
        names = {f.properties.name for f in plot.features if f.properties.kind == "track"}
        assert {"BLUE ONE", "RED ONE"} <= names
        background = [f for f in plot.features if f.id.startswith("track-ais-")]
        assert len(background) >= 5
        assert item.properties.start_datetime is not None


def test_sources_verify_and_payloads_match_their_hashes(built: Path) -> None:
    catalogue = Catalogue.open(built)
    for serial in SERIALS:
        assert catalogue.verify_sources(serial.item_id) == []
        plot = catalogue.read_plot(serial.item_id)
        (sensor,) = [f for f in plot.features if f.properties.kind == "sensor_observations"]
        envelope = sensor.properties.payload
        path = built / serial.item_id / envelope.href
        with path.open("rb") as stream:
            assert content_hash(stream) == envelope.content_hash
        bearings = read_bearings(path)
        assert len(bearings) == sensor.properties.observation_count > 100
        assert all(0 <= b.bearing_deg < 360 for b in bearings)


def test_provenance_is_a_worked_example(built: Path) -> None:
    """Every plot names its sources with hashes, and the builder with its version and seed."""
    catalogue = Catalogue.open(built)
    with extract_path().open("rb") as stream:
        ais_hash = content_hash(stream)
    for serial in SERIALS:
        plot = catalogue.read_plot(serial.item_id)
        assets = catalogue.assets(serial.item_id)
        hashes = {a.href.removeprefix("./"): a.debrief_content_hash for a in assets.values()}
        used = [ref for record in plot.provenance for ref in record.used or []]
        for ref in used:
            assert hashes[ref.href] == ref.content_hash, ref.href
        hrefs = {ref.href for ref in used}
        assert {
            "sources/blue-one.rep",
            "sources/red-one.rep",
            "sources/ais-2023-06-15-chesapeake-approaches.csv",
            "media/narrative.txt",
        } <= hrefs
        assert ais_hash in {ref.content_hash for ref in used}

        tools = {record.tool.name: record for record in plot.provenance}
        builder = tools[TOOL]
        assert builder.tool.version == "0.0.1"
        assert builder.seed == DEFAULT_SEED
        assert tools[f"{TOOL}.bearings"].seed == DEFAULT_SEED
        imports = [r for r in plot.provenance if r.tool.name == "debrief-io.rep"]
        assert len(imports) == 2
        for record in imports:
            assert record.notes is None  # nothing in the REP file was left out
        params = {p.name: p.value for p in builder.parameters}
        assert params["script_digest"] == script_digest(serial)
        assert params["rng"].startswith("random.Random(")
        sonar = {p.name for p in tools[f"{TOOL}.bearings"].parameters}
        assert {"detection_range", "baffle_half_angle", "sonar_off", "p_gain", "p_lose"} <= sonar
        assert f"{TOOL}.area" in tools and f"{TOOL}.named-sets" in tools
        assert not any("area" in note for note in builder.notes or [])
        ids = [record.id for record in plot.provenance]
        assert len(ids) == len(set(ids))


def test_narrative_is_a_supporting_file_read_into_narrative_entries(built: Path) -> None:
    catalogue = Catalogue.open(built)
    for serial in SERIALS:
        text = (built / serial.item_id / "media" / "narrative.txt").read_text(encoding="utf-8")
        lines = [line for line in text.splitlines() if not line.startswith("#")]
        assert 20 <= len(lines) <= 60
        assert all(re.match(r"\d{2} Jun 2023 \d{2}:\d{2}:\d{2}Z  ", line) for line in lines)
        plot = catalogue.read_plot(serial.item_id)
        entries = [f for f in plot.features if f.properties.kind == "narrative"]
        assert len(entries) == len(lines)
        assert all(e.geometry is None for e in entries)
        # No time-only note annotations are left: the log is narrative (CAP-20).
        assert not any(
            f.properties.kind == "annotation" and f.properties.style == "note"
            for f in plot.features
        )
        # Each platform's entries belong to its track; control's to none.
        tracks = {f.id: f.properties.name for f in plot.features if f.properties.kind == "track"}
        for entry in entries:
            props = entry.properties
            assert props.entry_type in {"Course", "Sonar", "CPA", "Log", "Intention", "Weather"}
            if props.source in ("BLUE ONE", "RED ONE"):
                assert tracks[props.track_id] == props.source
            else:
                assert props.track_id is None
        assert "color" not in text.lower()  # British English


def test_ais_extract_is_small_and_anonymised() -> None:
    path = extract_path()
    assert path.stat().st_size < 1_000_000
    with path.open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    vessels = {row["vessel"] for row in rows}
    assert 10 <= len(vessels) <= 20
    assert all(re.fullmatch(r"[A-Z][a-z]+( [a-z]+)? \d{2}", name) for name in vessels)
    # No MMSI, IMO number or call sign anywhere in the file.
    text = path.read_text(encoding="utf-8")
    assert re.search(r"\b\d{9}\b", text) is None
    assert "IMO" not in text


def test_a_serial_without_bearings_still_builds(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(sample_builder, "SONAR", replace(sample_builder.SONAR, p_gain=0.0))
    build(tmp_path / "quiet")
    catalogue = Catalogue.open(tmp_path / "quiet")
    for serial in SERIALS:
        plot = catalogue.read_plot(serial.item_id)
        assert not any(f.properties.kind == "sensor_observations" for f in plot.features)
        record = next(r for r in plot.provenance if r.tool.name == f"{TOOL}.bearings")
        assert any("no bearings" in note for note in record.notes)
        texts = [f.properties.text for f in plot.features if f.id.startswith("narrative-")]
        assert not any("RED ONE bearing" in text or "simulate an attack" in text for text in texts)


def test_exercise_set_holds_the_exercise(built: Path) -> None:
    plot = Catalogue.open(built).read_plot("serial-1")
    exercise = next(s for s in plot.named_sets if s.id == "set-exercise")
    assert "annotation-exercise-area" in exercise.feature_ids
    assert "narrative-0001" in exercise.feature_ids
    assert not any(i.startswith("track-ais-") for i in exercise.feature_ids)


def test_each_plot_has_its_details_and_a_window_over_its_serial(built: Path) -> None:
    catalogue = Catalogue.open(built)
    for serial in SERIALS:
        plot = catalogue.read_plot(serial.item_id)
        (details,) = [f for f in plot.features if f.properties.kind == "plot"]
        assert details.properties.title == serial.title
        view, _ = catalogue.read_view(serial.item_id)
        window = view.time_window
        assert (parse_utc(window.start), parse_utc(window.end)) == (serial.start_ms, serial.end_ms)
        # The window is view state: in the plot file, never in its history (SUB-22).
        history = catalogue.history(serial.item_id)
        assert all(
            f.properties.view is None
            for s in history.steps()
            for f in history.delta(s.seq).added or []
            if f.properties.kind == "plot"
        )
