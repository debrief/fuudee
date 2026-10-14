"""Importing a legacy plot file into a catalogue, end to end, and the sweep of legacy samples."""

from collections import Counter
from pathlib import Path

import pytest

from debrief_io import DpfError, import_dpf
from debrief_io.dpf_import import IMPORTER
from debrief_io.rep import DEFAULT_COLOUR
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
    assert len(ring) == 73 and ring[0] == ring[-1]  # for other GeoJSON tools
    assert ellipse.properties.time == "1995-12-12T06:02:00.000Z"
    # Exactly what it is, and drawn as legacy drew it.
    props = ellipse.properties
    assert (str(props.shape), props.centre, props.orientation.value) == (
        "ellipse",
        [-21.5, 21.8],
        45.0,
    )
    assert props.semi_major.value == pytest.approx(0.0411447 * 60 * 1852, abs=0.001)
    assert props.semi_minor.value == pytest.approx(0.0246868 * 60 * 1852, abs=0.001)
    assert props.appearance.model_dump(exclude_none=True) == {
        "colour": "#ff9600",
        "line_style": "solid",
        "line_width": 2,
        "label_size": 12,
        "label_position": "left",
    }

    # Circles: centre and radius, line style, width and fill as legacy drew them.
    def look(name: str) -> dict:
        found = next(f for f in plot.features if f.properties.name == name)
        assert str(found.properties.shape) == "circle"
        return found.properties.appearance.model_dump(exclude_none=True)

    dot_dash = next(
        f for f in plot.features if f.properties.name == "dot-dash 2px semi-transparent"
    )
    assert dot_dash.properties.radius.value == pytest.approx(2000 * 1852 / 2025.371828, abs=0.001)
    assert look("dot-dash 2px semi-transparent") | {"label_size": 12} == {
        "colour": "#e01c3e",
        "line_style": "dashed",
        "line_width": 2,
        "fill_colour": "#e01c3e",
        "fill_opacity": 0.63,
        "label_size": 12,
        "label_position": "left",
    }
    assert look("dotted 1px solid fill")["line_style"] == "dotted"
    assert "fill_colour" not in look("dotted 1px solid fill")  # Filled="false"
    assert look("solid hairwidth solid fill")["fill_opacity"] == 1.0
    assert look("solid hairwidth no fill")["line_width"] == 1  # a hairline, as thin as v4 draws
    labels = [f for f in plot.features if str(getattr(f.properties, "shape", "")) == "label"]
    assert labels and all(f.geometry.type == "Point" for f in labels)

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
        "Track 'NEL_STYLE': 3 fix labels hidden in the legacy plot are imported and will be shown.",
        "14 text labels drawn with a symbol ('Carrier', 'Square'",
        "1 annotation drawn with dot-dash (such as 'dot-dash 2px semi-transparent'): drawn dashed",
        "1 annotation drawn with unconnected points (such as 'unconnected 4px semi transparent'): "
        "drawn dotted",
        "wheel 'test wheel' in layer 'Annotations' not imported",
        "Narrative entry types not imported: 'GenComment2' (1).",
        "Layer 'Annotations' (layer, shown): its settings are not imported",
        "kept as the named set 'Annotations'",
        "Display settings not imported: where fix labels go, fix symbols and arrows; track "
        "symbols, fonts and line styles.",
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
    track, details = plot.features
    assert details.properties.kind == "plot" and details.properties.title == "small"
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


def _fix(dtg: str, long: str = "-4.0", extra: str = "", depth: str = "0") -> str:
    return (
        f'<fix Course="90" Speed="12" Dtg="951212 {dtg}"{extra}><centre>'
        f'<shortLocation Depth="{depth}" Lat="50.0" Long="{long}"/></centre></fix>'
    )


def _plot_file(tmp_path: Path, layers: str, name: str = "made.dpf") -> Path:
    source = tmp_path / name
    source.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<plot xmlns="http://www.debrief.info/plot">\n'
        '<details Text="Saved with Debrief version dated today"/>\n'
        f"<session>\n<layers>\n{layers}\n</layers>\n</session>\n</plot>\n"
    )
    return source


def test_an_infinite_depth_is_never_written(catalogue: Catalogue, tmp_path: Path) -> None:
    source = _plot_file(
        tmp_path,
        f'<track Name="T"><TrackSegment>\n{_fix("050000", depth="1e999")}\n'
        f"{_fix('050100', '-3.9', depth='12')}\n</TrackSegment></track>",
    )
    report = import_dpf(catalogue, source)
    track, _ = catalogue.read_plot("made").features
    assert track.properties.depths.values == [0.0, 12.0]
    plot_text = (catalogue.store.root / "made" / "plot.geojson").read_text()
    assert "Infinity" not in plot_text
    notes = "\n".join(report.omitted)
    assert "Track 'T': 1 fix had a depth that could not be read ('1e999' at line 7)" in notes


def test_an_invalid_plot_leaves_nothing_behind(
    catalogue: Catalogue, tmp_path: Path, monkeypatch
) -> None:
    from debrief_io import dpf_import
    from debrief_schemas import DocumentValidationError

    source = tmp_path / "small.dpf"
    source.write_bytes(SYNTHETIC)
    build = dpf_import.build_plot_from_dpf

    def out_of_order(*args, **kwargs):
        plot, report = build(*args, **kwargs)
        plot.features[0].properties.times.reverse()
        return plot, report

    monkeypatch.setattr(dpf_import, "build_plot_from_dpf", out_of_order)
    with pytest.raises(DocumentValidationError):
        import_dpf(catalogue, source)
    assert catalogue.item_ids() == []
    assert not (catalogue.store.root / "small").exists()


def test_a_failed_write_removes_the_new_item(
    catalogue: Catalogue, tmp_path: Path, monkeypatch
) -> None:
    source = tmp_path / "small.dpf"
    source.write_bytes(SYNTHETIC)

    def fail(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(catalogue, "write_plot", fail)
    with pytest.raises(OSError, match="disk full"):
        import_dpf(catalogue, source)
    assert catalogue.item_ids() == []
    assert not (catalogue.store.root / "small").exists()
    reopened = Catalogue.open(catalogue.store.root)
    assert not [link for link in reopened.model.links if link.rel == "child"]


def test_fix_labels_hidden_fixes_and_unknown_leg_content_are_reported(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    hidden = _fix("050000", extra=' Label="Turn here" Visible="false"')
    labelled = _fix("050100", "-3.9", extra=' Label="0501"')
    source = _plot_file(
        tmp_path,
        f'<track Name="T"><TrackSegment Name="one">{hidden}{labelled}'
        '<waypoint Name="W1"/></TrackSegment></track>',
    )
    report = import_dpf(catalogue, source)
    notes = "\n".join(report.omitted)
    assert "Track 'T': 1 fix label that only gives the fix's time is not imported" in notes
    assert (
        "Track 'T': 1 fix label hidden in the legacy plot is imported and will be shown." in notes
    )
    assert "Track 'T': 1 fix hidden in the legacy plot is imported and will be shown." in notes
    assert "waypoint 'W1' not imported: in track 'T', leg 'one'" in notes
    assert "fix comment" not in notes and "colour of their own" not in notes
    (track,) = [f for f in catalogue.read_plot("made").features if f.properties.kind == "track"]
    (mark,) = track.properties.fix_marks
    assert (mark.time, mark.label) == ("1995-12-12T05:00:00.000Z", "Turn here")


def test_a_leg_plotted_by_dead_reckoning_is_imported_as_plotted_and_said_so(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    """Legacy Debrief saves a DR leg's worked-out positions (PlotRelative="true"): they are
    imported as saved, and the import says the leg was DR and is not worked out again."""
    fixes = _fix("050000") + _fix("050100", "-3.9") + _fix("050200", "-3.8")
    source = _plot_file(
        tmp_path,
        f'<track Name="T"><TrackSegment Name="Positions" PlotRelative="true">{fixes}'
        "</TrackSegment></track>"
        f'<track Name="U"><TrackSegment Name="Over" PlotRelative="false">{fixes}'
        "</TrackSegment></track>",
    )
    report = import_dpf(catalogue, source)
    notes = "\n".join(report.omitted)
    assert (
        "Track 'T': leg 'Positions' is plotted by dead reckoning (DR) in the legacy plot. "
        "Its 3 fixes are imported where legacy Debrief plotted them, from the leg's first fix "
        "by each fix's course and speed; the legacy plot does not hold its positions as "
        "logged, so it cannot be plotted over the ground." in notes
    )
    assert "Track 'U'" not in notes
    plotted = catalogue.read_plot("made").features
    by_name = {f.properties.name: f for f in plotted if f.properties.kind == "track"}
    t = by_name["T"]
    assert t.geometry.coordinates == [[-4.0, 50.0], [-3.9, 50.0], [-3.8, 50.0]]
    # The mode is kept on the track: no need to ask, the legacy plot says.
    assert t.properties.plotting_mode == "dr" and t.properties.logged_positions is None
    assert by_name["U"].properties.plotting_mode == "otg"


def test_fix_colours_labels_and_comments_become_marked_fixes(catalogue: Catalogue) -> None:
    """The .dpf gap closed (EXT-14): each fix's own colour, label and comment, found by time."""
    report = import_dpf(catalogue, DATA / "shapes.dpf")
    plot = catalogue.read_plot("shapes")
    track = next(f for f in plot.features if f.properties.name == "NEL_STYLE")
    marks = {m.time[11:19]: m for m in track.properties.fix_marks}
    assert set(track.properties.times) >= {f"1995-12-12T{t}.000Z" for t in marks}
    own = track.properties.style.colour
    assert marks["05:01:00"].label == "Override label 1"
    assert marks["05:01:00"].colour == "#ffd700"  # YELLOW
    assert marks["05:03:00"].comment == "comment 3"
    assert marks["05:03:00"].label == "Override label 3"
    assert marks["05:04:00"].comment == "comment 4"
    assert marks["05:04:00"].label is None, "0504 only gives the fix's time"
    assert all(m.colour != own for m in marks.values())
    assert "05:00:00" not in marks  # labelled "120500", its own time, in the track's colour
    notes = "\n".join(report.omitted)
    assert "fix comment" not in notes
    assert "a v4 track has one colour" not in notes
    assert "that only give the fix's time are not imported" in notes


def test_a_time_label_is_told_from_a_label_of_numbers(catalogue: Catalogue, tmp_path: Path) -> None:
    time_only = _fix("050000", extra=' Label="12 0500.00"')
    numbers = _fix("050100", "-3.9", extra=' Label="1234" LabelShowing="true"')
    source = _plot_file(
        tmp_path,
        f'<track Name="T"><TrackSegment Name="one">{time_only}{numbers}</TrackSegment></track>',
    )
    report = import_dpf(catalogue, source)
    (track,) = [f for f in catalogue.read_plot("made").features if f.properties.kind == "track"]
    assert [(m.time[11:19], m.label) for m in track.properties.fix_marks] == [("05:01:00", "1234")]
    notes = "\n".join(report.omitted)
    assert "hidden in the legacy plot" not in notes  # shown in the legacy plot: shown here


def test_fixes_sharing_a_time_keep_the_first_mark(catalogue: Catalogue, tmp_path: Path) -> None:
    first = _fix("050000", extra=' Comment="first"')
    second = _fix("050000", "-3.9", extra=' Comment="second"')
    last = _fix("050100", "-3.8")
    source = _plot_file(
        tmp_path, f'<track Name="T"><TrackSegment>{first}{second}{last}</TrackSegment></track>'
    )
    report = import_dpf(catalogue, source)
    (track,) = [f for f in catalogue.read_plot("made").features if f.properties.kind == "track"]
    assert [m.comment for m in track.properties.fix_marks] == ["first"]
    assert any("share a time with the fix before; only the first" in n for n in report.omitted)


def test_overlapping_legs_become_separate_tracks(catalogue: Catalogue, tmp_path: Path) -> None:
    source = _plot_file(
        tmp_path,
        '<track Name="T">'
        f'<TrackSegment Name="north">{_fix("050000")}{_fix("050200", "-3.8")}</TrackSegment>'
        f'<TrackSegment Name="south">{_fix("050100", "-3.9")}{_fix("050300", "-3.7")}'
        "</TrackSegment></track>"
        '<track Name="U"><TrackSegment Name="a">'
        f"{_fix('050000')}{_fix('050100', '-3.9')}</TrackSegment>"
        f'<TrackSegment Name="b">{_fix("050100", "-3.8")}{_fix("050200", "-3.7")}'
        "</TrackSegment></track>",
    )
    report = import_dpf(catalogue, source)
    assert report.tracks == ["T (north)", "T (south)", "U"]
    plot = catalogue.read_plot("made")
    north = plot.features[0]
    assert north.properties.name == "T (north)"
    assert north.geometry.coordinates == [[-4.0, 50.0], [-3.8, 50.0]]
    notes = "\n".join(report.omitted)
    assert (
        "Track 'T' has legs that overlap in time, so each leg is imported as a track of its "
        "own: 'T (north)', 'T (south)'." in notes
    )
    assert "Track 'T' has 2 legs; they are joined" not in notes
    # legs that only touch are joined; the shared time is reported
    assert "Track 'U': 1 fix has the same time as the fix before" in notes
    assert "1995-12-12T05:01:00.000Z" in notes


def test_shapes_read_in_part_import_with_notes(catalogue: Catalogue, tmp_path: Path) -> None:
    source = _plot_file(
        tmp_path,
        '<track Name="T"><colour Value="custom" CustomRed="300"/><TrackSegment>'
        f"{_fix('050000')}{_fix('050100', '-3.9')}</TrackSegment></track>\n"
        '<layer Name="L"><ellipse Label="old" Maxima="2" Minima="1" Orient="45">'
        '<centre><shortLocation Lat="50" Long="-4"/></centre></ellipse>\n'
        '<textlabel Label="back"><centre><shortLocation Lat="50" Long="-4"/></centre>'
        '<timeRange Start="951212 060000" End="951212 050000"/></textlabel>\n'
        '<circle Label="bad"><centre><shortLocation Lat="50" Long="-4"/></centre>'
        '<Radius Units="furlongs" Value="1"/></circle></layer>',
    )
    report = import_dpf(catalogue, source)
    assert report.tracks == ["T"] and report.annotations == 2
    plot = catalogue.read_plot("made")
    track = plot.features[0]
    assert track.properties.style.colour == DEFAULT_COLOUR
    notes = report.omitted
    assert (
        "Line 6: the colour of track 'T': colour values must be 0 to 255; the default is used."
        in notes
    )
    assert any("'back': its time range ends before it starts" in n for n in notes)
    (bad,) = [n for n in notes if "could not be read" in n]
    assert bad.startswith("Line 9 could not be read: circle bad:")
    assert "line" not in bad[len("Line 9") :].lower()
    assert (
        "The plot file was saved by legacy Debrief: 'Saved with Debrief version dated today'."
        in notes
    )


def test_a_file_too_large_is_refused(catalogue: Catalogue, tmp_path: Path, monkeypatch) -> None:
    from debrief_io import dpf_import

    source = tmp_path / "small.dpf"
    source.write_bytes(SYNTHETIC)
    monkeypatch.setattr(dpf_import, "MAX_FILE_BYTES", 100)
    with pytest.raises(DpfError, match="larger than"):
        import_dpf(catalogue, source)
    assert catalogue.item_ids() == []
