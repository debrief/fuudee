"""Importing a REP file into a catalogue, end to end."""

from pathlib import Path

import pytest

from debrief_io import IMPORTER, import_rep
from debrief_schemas import DocumentKind, load_document
from debrief_stac import Catalogue

REP = """\
;; A small synthetic serial
951212 050000.000 NELSON @C 50 20 00.00 N 004 07 00.00 W 090.0 12.0 0
951212 050100.000 NELSON @C 50 20 00.00 N 004 06 00.00 W 090.0 12.0 NaN
951212 050200.000 NELSON @C 50 20 00.00 N 004 05 00.00 W 090.0 12.0 0 Turned // after contact
951212 050000.000 "HMS BLUE" @A 50 22 00.00 N 004 07 00.00 W 180.0 8.0 0
951212 050200.000 "HMS BLUE" @A 50 21 00.00 N 004 07 00.00 W 180.0 8.0 15.5
951212 050100.000500 "HMS BLUE" @A 50 21 30.00 N 004 07 00.00 W 180.0 8.0 0
951212 050000.000 LONER @F 50 00 00.00 N 004 00 00.00 W 000.0 0.0 0
;SENSOR: 951212 050000 NELSON @A NULL 270.0 NULL NULL NULL NULL sonar
garbage line
"""


@pytest.fixture
def setup(tmp_path: Path) -> tuple[Catalogue, Path]:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    source = tmp_path / "serial-01.rep"
    source.write_text(REP)
    return catalogue, source


def test_import_creates_valid_plot(setup) -> None:
    catalogue, source = setup
    report = import_rep(catalogue, source, title="Serial 1")
    assert report.item_id == "serial-01"
    assert report.tracks == ["NELSON", "HMS BLUE"]
    assert report.fixes == 6
    plot = catalogue.read_plot("serial-01")
    tracks = {f.properties.name: f for f in plot.features}
    nelson, blue = tracks["NELSON"], tracks["HMS BLUE"]
    assert nelson.id == "track-nelson" and blue.id == "track-hms-blue"
    assert nelson.properties.style.colour == "#e01c3e"
    assert blue.properties.style.colour == "#0064bd"
    assert nelson.properties.speeds.unit == "[kn_i]"
    # Fixes out of order in the file are sorted by time.
    assert blue.properties.times == [
        "1995-12-12T05:00:00.000Z",
        "1995-12-12T05:01:00.000Z",
        "1995-12-12T05:02:00.000Z",
    ]
    # Depths follow the sorted fixes; a track with a gap in its depths has none.
    assert blue.properties.depths.unit == "m"
    assert blue.properties.depths.values == [0.0, 0.0, 15.5]
    assert nelson.properties.depths is None
    assert nelson.geometry.coordinates[0] == pytest.approx([-(4 + 7 / 60), 50 + 20 / 60])


def test_provenance_names_source_and_omissions(setup) -> None:
    catalogue, source = setup
    report = import_rep(catalogue, source)
    plot = catalogue.read_plot("serial-01")
    (record,) = plot.provenance
    assert record.kind == "import"
    assert record.tool.name == IMPORTER
    assert record.used[0].href == "sources/serial-01.rep"
    assert (
        record.used[0].content_hash
        == catalogue.assets("serial-01")["source-serial-01.rep"].debrief_content_hash
    )
    notes = " ".join(record.notes)
    assert notes == " ".join(report.omitted)
    for expected in [
        "'LONER' has only one fix",
        "1 fix times",
        "'NELSON' gives a depth for only 2 of 3 fixes",
        "1 fixes had a label",
        "1 ;SENSOR: line",
        "Line 10 could not be read",
    ]:
        assert expected in notes, expected
    assert catalogue.verify_sources("serial-01") == []


def test_item_is_searchable_by_extent(setup) -> None:
    catalogue, source = setup
    import_rep(catalogue, source)
    item = load_document(
        DocumentKind.STAC_ITEM, (catalogue.store.root / "serial-01" / "serial-01.json").read_text()
    )
    assert item.properties.start_datetime == "1995-12-12T05:00:00.000Z"
    assert item.properties.end_datetime == "1995-12-12T05:02:00.000Z"
    assert item.bbox[1] == pytest.approx(50 + 20 / 60)


def test_latin1_file_imports(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    source = tmp_path / "legacy.rep"
    source.write_bytes(
        "951212 050000 NELSON @C 50 20 0 N 4 7 0 W 90 12 0 caf\xe9\n"
        "951212 050100 NELSON @C 50 20 0 N 4 6 0 W 90 12 0\n".encode("latin-1")
    )
    assert import_rep(catalogue, source).fixes == 2
