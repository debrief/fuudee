"""Importing a legacy plot file into a catalogue, end to end, and the sweep of legacy samples."""

from collections import Counter
from pathlib import Path

import pytest

from debrief_io import DpfError, import_dpf
from debrief_io.dpf_import import IMPORTER
from debrief_schemas import DocumentKind, load_document
from debrief_stac import Catalogue

DATA = Path(__file__).parent / "data"
# legacy Debrief's sample data, where a checkout of it is to hand
LEGACY = Path("/home/user/debrief/debrief")

SYNTHETIC = b"""\
<?xml version="1.0" encoding="UTF-8"?>
<plot xmlns="http://www.debrief.info/plot">
<session>
<layers>
<track Name="NELSON"><colour Value="BLUE"/>
<TrackSegment Name="one">
<fix Course="90" Speed="12" Dtg="951212 050000.000250"><centre>
<shortLocation Depth="0" Lat="50.0" Long="-4.0"/></centre></fix>
<fix Course="90" Speed="12" Dtg="951212 050100"><centre>
<shortLocation Depth="10" Lat="50.0" Long="-3.9"/></centre></fix>
</TrackSegment>
</track>
<track Name="LONER"><TrackSegment>
<fix Course="0" Speed="0" Dtg="951212 050000"><centre>
<shortLocation Lat="50" Long="-4"/></centre></fix>
</TrackSegment></track>
<layer Name="Misc" Visible="true">
<polygon Label="Two points" Closed="true"><WorldPath>
<Point><shortLocation Lat="50" Long="-4"/></Point>
<Point><shortLocation Lat="50" Long="-4"/></Point>
</WorldPath></polygon>
</layer>
</layers>
</session>
</plot>
"""


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    return Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")


def test_shapes_sample_imports(catalogue: Catalogue) -> None:
    report = import_dpf(catalogue, DATA / "shapes.dpf", title="Shapes")
    assert report.item_id == "shapes"
    assert report.tracks == ["NEL_STYLE", "NEL_STYLE2", "NEL_STYLE3", "NEL_STYLE4"]
    assert (report.fixes, report.annotations, report.narrative_entries) == (34, 64, 2)
    plot = catalogue.read_plot("shapes")  # validated on read
    by_id = {f.id: f for f in plot.features}

    track = by_id["track-nel-style"]
    assert track.properties.style.colour == "#e01c3e"
    assert track.properties.speeds.unit == "[kn_i]"
    assert track.properties.depths.unit == "m"
    assert track.properties.times == sorted(track.properties.times)

    kinds = Counter(
        (f.properties.style, f.geometry.type if f.geometry else None)
        for f in plot.features
        if f.properties.kind == "annotation"
    )
    assert kinds[("note", None)] == 2
    assert kinds[("label", "Point")] > 0
    assert kinds[("shape", "Polygon")] > 0
    assert kinds[("shape", "LineString")] > 0

    ellipse = next(f for f in plot.features if f.properties.name == "test ellipse")
    ring = ellipse.geometry.coordinates[0]
    assert len(ring) == 73 and ring[0] == ring[-1]
    assert ellipse.properties.time == "1995-12-12T06:02:00.000Z"

    poly = next(f for f in plot.features if f.properties.name == "test poly")
    assert poly.properties.text == "test\npoly"

    sets = {s.name: s for s in plot.named_sets}
    assert set(sets) >= {"Annotations", "Narratives", "Dynamic A", "Dynamic B", "Buoys"}
    assert all(i in by_id for s in sets.values() for i in s.feature_ids)


def test_provenance_names_source_and_every_omission(catalogue: Catalogue) -> None:
    report = import_dpf(catalogue, DATA / "shapes.dpf")
    (record,) = catalogue.read_plot("shapes").provenance
    assert record.kind == "import"
    assert record.tool.name == IMPORTER
    assert record.used[0].href == "sources/shapes.dpf"
    assets = catalogue.assets("shapes")
    assert assets["source-shapes.dpf"].type == "application/xml"
    assert record.used[0].content_hash == assets["source-shapes.dpf"].debrief_content_hash
    assert record.notes == report.omitted
    notes = "\n".join(record.notes)
    for expected in [
        "sensor 'Plain' (sensor, 1 cut) not imported",
        "sensor 'SENSOR' (sensor, 4 cuts) not imported",
        "TMA solution set 'TARGET' (tma, 4 solutions) not imported",
        "Track 'NEL_STYLE': 2 fix comments not imported.",
        "14 circles drawn as polygons of 72 sides",
        "1 ellipse drawn as a polygon of 72 sides",
        "wheel 'test wheel' in layer 'Annotations' not imported",
        "Narrative entry types not imported: 'GenComment2' (1).",
        "Layer 'Annotations' (layer, shown): its settings are not imported",
        "kept as the named set 'Annotations'",
        "Display settings not imported",
        "View settings not imported: the map projection",
    ]:
        assert expected in notes, expected
    assert catalogue.verify_sources("shapes") == []


def test_omissions_and_truncation(catalogue: Catalogue, tmp_path: Path) -> None:
    source = tmp_path / "small.dpf"
    source.write_bytes(SYNTHETIC)
    report = import_dpf(catalogue, source)
    assert report.tracks == ["NELSON"]
    plot = catalogue.read_plot("small")
    (track,) = plot.features
    assert track.properties.times[0] == "1995-12-12T05:00:00.000Z"
    assert track.properties.style.colour == "#0064bd"
    assert track.properties.depths.values == [0.0, 10.0]
    notes = "\n".join(report.omitted)
    assert "1 time had more than millisecond precision and was truncated" in notes
    assert "Track 'LONER' has 1 fix, so it was not imported as a track." in notes
    assert "polygon 'Two points' in layer 'Misc' not imported: it has 1 distinct point" in notes
    assert "Layer 'Misc' (layer, shown): its settings are not imported" in notes
    assert "it holds nothing that was imported" in notes
    assert plot.named_sets is None


def test_unreadable_file_leaves_catalogue_unchanged(catalogue: Catalogue, tmp_path: Path) -> None:
    source = tmp_path / "broken.dpf"
    source.write_bytes(b"<plot><session></plot>")
    with pytest.raises(DpfError):
        import_dpf(catalogue, source)
    assert catalogue.item_ids() == []


def test_clock_makes_provenance_repeatable(catalogue: Catalogue) -> None:
    ticks = iter([1_000, 2_000])
    import_dpf(catalogue, DATA / "shapes.dpf", clock=lambda: next(ticks))
    (record,) = catalogue.read_plot("shapes").provenance
    assert record.started_at == "1970-01-01T00:00:01.000Z"
    assert record.ended_at == "1970-01-01T00:00:02.000Z"


def test_item_is_searchable_by_extent(catalogue: Catalogue) -> None:
    import_dpf(catalogue, DATA / "shapes.dpf")
    item = load_document(
        DocumentKind.STAC_ITEM, (catalogue.store.root / "shapes" / "shapes.json").read_text()
    )
    assert item.properties.start_datetime.startswith("1995-12-12")
    assert item.bbox is not None


@pytest.mark.skipif(not LEGACY.exists(), reason="legacy Debrief sample data is not available")
def test_sweep_of_legacy_samples(tmp_path: Path) -> None:
    """Every .dpf file in legacy Debrief's sample data, as for REP (EXT-14)."""
    catalogue = Catalogue.create(tmp_path / "cat", "sweep", "Sweep", "Legacy samples")
    files = sorted(LEGACY.rglob("*.dpf"))
    tracks = fixes = 0
    errors = []
    omitted: Counter[str] = Counter()
    for index, path in enumerate(files):
        try:
            report = import_dpf(catalogue, path, item_id=f"plot-{index}")
        except DpfError as error:
            errors.append(f"{path.name}: {error}")
            continue
        tracks += len(report.tracks)
        fixes += report.fixes
        for note in report.omitted:
            if note.startswith("Line "):
                errors.append(f"{path.name}: {note}")
            elif "(sensor, " in note:
                omitted["sensor"] += 1
            elif " not imported: " in note and not note.startswith("Track"):
                omitted[note.split(" ")[0 if not note.startswith("An unnamed") else 2]] += 1
    assert len(files) == 46
    assert (tracks, fixes) == (99, 27942)
    # The only failure is BAD_sample.dpf, a file broken on purpose.
    assert errors == [
        "BAD_sample.dpf: the file is not well-formed XML: mismatched tag: line 6, column 2"
    ]
    assert omitted["sensor"] == 63
    assert omitted["satc_solution"] == 10
