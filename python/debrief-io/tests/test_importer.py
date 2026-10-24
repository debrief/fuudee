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
;CIRCLE: @A 50 20 00 N 004 07 00 W 2000 exercise area
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
    tracks = {f.properties.name: f for f in plot.features if f.properties.kind == "track"}
    # The plot's own details come with it, and a time window over its whole period,
    # kept in the plot's island, outside its history (SUB-22).
    details = plot.features[-1]
    assert details.properties.kind == "plot" and details.properties.title == "Serial 1"
    window = details.properties.view.time_window
    item = catalogue.read_item("serial-01").properties
    assert (window.start, window.end) == (item.start_datetime, item.end_datetime)
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
        "1 ;CIRCLE: line",
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


def test_file_with_no_tracks_is_refused_and_says_why(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    source = tmp_path / "junk.rep"
    source.write_text("this is junk\nmore\n")
    with pytest.raises(ValueError, match="no tracks could be read") as refused:
        import_rep(catalogue, source)
    assert "Line 1 could not be read: 'this is' is not a date and time." in str(refused.value)
    assert catalogue.item_ids() == []  # nothing written


def test_clock_makes_provenance_repeatable(setup) -> None:
    catalogue, source = setup
    ticks = iter([1_000, 2_000])
    import_rep(catalogue, source, clock=lambda: next(ticks))
    (record,) = catalogue.read_plot("serial-01").provenance
    assert record.started_at == "1970-01-01T00:00:01.000Z"
    assert record.ended_at == "1970-01-01T00:00:02.000Z"


def test_an_invalid_plot_leaves_nothing_behind(setup, monkeypatch) -> None:
    """The plot is built and validated before anything is written."""
    from debrief_io import importer
    from debrief_schemas import DocumentValidationError

    catalogue, source = setup
    build = importer.build_plot

    def out_of_range(*args, **kwargs):
        plot, report = build(*args, **kwargs)
        plot.features[0].geometry.coordinates[0] = [200.0, 50.0]
        return plot, report

    monkeypatch.setattr(importer, "build_plot", out_of_range)
    with pytest.raises(DocumentValidationError):
        import_rep(catalogue, source)
    assert catalogue.item_ids() == []
    assert not (catalogue.store.root / "serial-01").exists()


def test_a_failed_write_removes_the_new_item(setup, monkeypatch) -> None:
    catalogue, source = setup

    def fail(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(catalogue, "write_plot", fail)
    with pytest.raises(OSError, match="disk full"):
        import_rep(catalogue, source)
    assert catalogue.item_ids() == []
    assert not (catalogue.store.root / "serial-01").exists()
    reopened = Catalogue.open(catalogue.store.root)
    assert not [link for link in reopened.model.links if link.rel == "child"]


def _by_name(catalogue: Catalogue, item: str) -> dict:
    return {
        f.properties.name: f
        for f in catalogue.read_plot(item).features
        if f.properties.kind == "track"
    }


def test_each_track_is_plotted_as_the_host_says_and_the_notes_say_so(setup) -> None:
    """OTG or DR for each track (decision, product owner, 14 Oct 2026): the host asks the
    analyst, or uses their remembered choice, and passes the answer; the importer never
    reads user settings itself. The mode is kept on the track."""
    from debrief_io.importer import rep_track_names

    catalogue, source = setup
    names = rep_track_names(source)
    assert names == ["NELSON", "HMS BLUE"]
    report = import_rep(catalogue, source, item_id="asked", modes={names[0]: "dr", names[1]: "otg"})
    assert report.notes == [
        f"Track {names[0]!r} plotted by dead reckoning (DR).",
        f"Track {names[1]!r} plotted over the ground (OTG).",
    ]
    tracks = _by_name(catalogue, "asked")
    dr, otg = tracks[names[0]], tracks[names[1]]
    assert dr.properties.plotting_mode == "dr"
    assert dr.properties.logged_positions is not None
    assert otg.properties.plotting_mode == "otg" and otg.properties.logged_positions is None
    assert dr.geometry.coordinates[0] == dr.properties.logged_positions.coordinates[0]
    # In the provenance too, so the choice travels with the plot.
    record = catalogue.read_plot("asked").provenance[0]
    assert record.notes[:2] == report.notes
    # The remembered choice: the notes say it was used, and how to change it.
    remembered = import_rep(
        catalogue, source, item_id="remembered", modes="dr", remembered="Clear it to be asked."
    )
    assert remembered.notes[-1] == (
        "Tracks were plotted by dead reckoning (DR) as you chose for future imports. "
        "Clear it to be asked."
    )
    # No mode given (an agent, the sample data): over the ground, as logged, and unsaid.
    plain = import_rep(catalogue, source, item_id="plain")
    assert plain.notes == []
    assert all(t.properties.plotting_mode is None for t in _by_name(catalogue, "plain").values())
    with pytest.raises(ValueError, match="not a way to plot a track"):
        import_rep(catalogue, source, item_id="bad", modes="sideways")
