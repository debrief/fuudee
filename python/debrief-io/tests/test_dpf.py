"""Reading legacy plot files, ported from legacy Debrief's XML handlers and their tests."""

import pytest

from debrief_io import DpfError, parse_dpf
from debrief_io.dpf import (
    from_xml,
    parse_xml,
    read_bool,
    read_colour,
    read_distance_m,
    read_fix,
    read_location,
    read_number,
    read_time,
)
from debrief_kernel.time import format_utc


def _node(xml: str):
    return parse_xml(xml.encode())


def _plot(layers: str, extra: str = "") -> bytes:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<plot xmlns="http://www.debrief.info/plot" Name="Debrief Plot">\n'
        '<details Text="Saved with Debrief version dated today"/>\n'
        f"<session>\n<layers>\n{layers}\n</layers>\n{extra}</session>\n</plot>\n"
    ).encode()


# --- Values: MWCXMLReaderTest, DebriefFormatDateTime tests -------------------------


@pytest.mark.parametrize(
    ("text", "value"),
    [
        ("12.5", 12.5),
        (" 12.5 ", 12.5),
        ("-0.5", -0.5),
        ("12", 12),
        (".5", 0.5),
        ("1.2E1", 12),
        ("9.0E1", 90),
        ("1e5", 100000),
        ("22,5", 22.5),
        ("239,9", 239.9),
        ("1,2345", 1.2345),
        ("1234,5", 1234.5),
    ],
)
def test_numbers(text: str, value: float) -> None:
    assert read_number(text, "x") == pytest.approx(value)


@pytest.mark.parametrize(
    "text",
    ["12abc", "12.5abc", "22 10", "1.2.3", "", "   ", "x", "NaN", "nan", "Infinity", "1,234",
     "-12,500", "1,234,567", None],
)  # fmt: skip
def test_numbers_rejected(text: str | None) -> None:
    with pytest.raises(DpfError):
        read_number(text, "x")


@pytest.mark.parametrize(
    ("text", "expected", "truncated"),
    [
        ("951212 050000", "1995-12-12T05:00:00.000Z", False),
        ("951212 050000.5", "1995-12-12T05:00:00.500Z", False),
        ("080101 010000.005", "2008-01-01T01:00:00.005Z", False),
        ("500101 000000", "1950-01-01T00:00:00.000Z", False),
        ("491231 000000", "2049-12-31T00:00:00.000Z", False),
        ("19450101 000000.000500", "1945-01-01T00:00:00.000Z", True),
        ("20500630 000000.250", "2050-06-30T00:00:00.250Z", False),
        ("651231 120000.250999", "1965-12-31T12:00:00.250Z", True),
    ],
)
def test_times(text: str, expected: str, truncated: bool) -> None:
    epoch_ms, was_truncated = read_time(text)
    assert (format_utc(epoch_ms), was_truncated) == (expected, truncated)


def test_null_date_reads_as_no_time() -> None:
    assert read_time("691231 235959.999") is None
    assert read_time("691231 235959") is None


@pytest.mark.parametrize(
    "text", ["700001 010000", "700100 010000", "951212", "951212 050000.1234567", "x y"]
)
def test_malformed_times(text: str) -> None:
    with pytest.raises(DpfError):
        read_time(text)


def test_booleans_as_java() -> None:
    assert read_bool("true", False) and read_bool("TRUE", False)
    assert not read_bool("yes", True)
    assert read_bool(None, True)


def test_line_breaks_in_labels() -> None:
    assert from_xml("test\\npolyline") == "test\npolyline"


@pytest.mark.parametrize(
    ("xml", "colour"),
    [
        ('<colour Value="RED"/>', "#e01c3e"),
        ('<colour Value="DARK_BLUE"/>', "#6595cc"),
        ('<colour Value="GREY"/>', "#808080"),
        ('<colour CustomBlue="112" CustomGreen="0" CustomRed="78" Value="custom"/>', "#4e0070"),
        ('<colour Value="UNHEARD_OF"/>', "#000000"),  # as legacy: black
    ],
)
def test_colours(xml: str, colour: str) -> None:
    assert read_colour(_node(xml)) == colour


def test_short_location() -> None:
    loc = read_location(
        _node('<centre><shortLocation Lat="5.0E1" Long="-1,5" Depth="12"/></centre>')
    )
    assert (loc.latitude, loc.longitude, loc.depth_m) == (50, -1.5, 12)


def test_unreadable_depth_reads_as_zero() -> None:
    loc = read_location(_node('<centre><shortLocation Lat="50" Long="-1" Depth="deep"/></centre>'))
    assert loc.depth_m == 0


def test_bad_latitude_is_an_error() -> None:
    # ShortLocationTest.testBadLatitudeSkipped: no position at 0, 0.
    with pytest.raises(DpfError):
        read_location(_node('<centre><shortLocation Lat="N50.5" Long="-1.2"/></centre>'))


def test_long_location() -> None:
    loc = read_location(
        _node(
            '<centre><longLocation LatDeg="22" LatMin="10.5" LatSec="0" LatHem="S" '
            'LongDeg="21" LongMin="45" LongSec="14.2" LongHem="W" Depth="3"/></centre>'
        )
    )
    assert loc.latitude == pytest.approx(-(22 + 10.5 / 60))
    assert loc.longitude == pytest.approx(-(21 + 45 / 60 + 14.2 / 3600))
    assert loc.depth_m == 3


@pytest.mark.parametrize(
    ("xml", "metres"),
    [
        ('<Radius Units="yds" Value="2000"/>', 2000 * 0.914399),
        ('<Radius Units="nm" Value="2"/>', 3704),
        ('<Radius Units="degs" Value="1"/>', 60 * 1852),
        ('<Radius Units="km" Value="1.5"/>', 1500),
        ('<Radius Value="1"/>', 1852),  # nautical miles by default
    ],
)
def test_distances(xml: str, metres: float) -> None:
    assert read_distance_m(_node(xml)) == pytest.approx(metres, rel=1e-5)


# --- XML safety -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "xml",
    [
        '<!DOCTYPE plot [<!ENTITY a "aaaa">]><plot>&a;</plot>',
        '<!DOCTYPE plot SYSTEM "http://example.invalid/plot.dtd"><plot/>',
        '<?xml version="1.0"?><!DOCTYPE p [<!ENTITY x SYSTEM "file:///etc/passwd">]><p>&x;</p>',
    ],
)
def test_document_types_and_entities_are_refused(xml: str) -> None:
    with pytest.raises(DpfError, match="document type"):
        parse_xml(xml.encode())


def test_malformed_xml_is_an_error() -> None:
    with pytest.raises(DpfError, match="not well-formed"):
        parse_dpf(b"<plot><session></plot>")


def test_not_a_plot() -> None:
    with pytest.raises(DpfError, match="not a Debrief plot"):
        parse_dpf(b"<gpx/>")


# --- Elements -------------------------------------------------------------------------


FIX = (
    '<fix Course="-90" Speed="12.5" Dtg="951212 050000" Label="0500" Comment="turned" '
    'Visible="true"><colour Value="BLUE"/>'
    '<centre><shortLocation Depth="15" Lat="50.5" Long="-4.25"/></centre></fix>'
)


def test_fix() -> None:
    fix, truncated = read_fix(_node(FIX))
    assert not truncated
    assert format_utc(fix.time_ms) == "1995-12-12T05:00:00.000Z"
    assert fix.course_deg == 270  # a negative course is brought into 0 to 360
    assert (fix.speed_kn, fix.depth_m) == (12.5, 15)
    assert (fix.latitude, fix.longitude) == (50.5, -4.25)
    assert (fix.label, fix.comment, fix.colour) == ("0500", "turned", "#0064bd")


@pytest.mark.parametrize(
    "xml",
    [
        '<fix Course="0" Speed="1"><centre><shortLocation Lat="1" Long="1"/></centre></fix>',
        '<fix Course="0" Speed="1" Dtg="691231 235959.999">'
        '<centre><shortLocation Lat="1" Long="1"/></centre></fix>',
        '<fix Course="0" Speed="1" Dtg="951212 050000"/>',
        '<fix Course="0" Speed="12kts" Dtg="951212 050000">'
        '<centre><shortLocation Lat="1" Long="1"/></centre></fix>',
    ],
)
def test_unreadable_fixes(xml: str) -> None:
    with pytest.raises(DpfError):
        read_fix(_node(xml))


TRACK = f"""\
<track Name="NELSON" Visible="false">
<colour Value="RED"/>
<sensor Name="hull" Visible="true"><sensor_contact Dtg="951212 050000" Bearing="10"/></sensor>
<TrackSegment Name="leg 2" Visible="true">
{FIX.replace("050000", "050200")}
</TrackSegment>
<RelativeTMASegment Name="Positions" HostTrack="BLUE">
{FIX.replace("050000", "050100.000750")}
</RelativeTMASegment>
<TrackSegment Name="leg 1" Visible="true">
{FIX}
<fix Course="0" Speed="1" Dtg="951212 999999">
<centre><shortLocation Lat="1" Long="1"/></centre></fix>
</TrackSegment>
</track>"""


def test_track_legs_sensors_and_errors() -> None:
    parsed = parse_dpf(_plot(TRACK))
    (track,) = parsed.tracks
    assert (track.name, track.colour, track.visible) == ("NELSON", "#e01c3e", False)
    assert [leg.kind for leg in track.legs] == [
        "TrackSegment",
        "RelativeTMASegment",
        "TrackSegment",
    ]
    assert [len(leg.fixes) for leg in track.legs] == [1, 1, 1]
    assert [(c.kind, c.name, c.count) for c in track.carried] == [("sensor", "hull", 1)]
    assert parsed.truncated_times == 1
    ((line, problem),) = parsed.errors
    assert line == 17 and "NELSON" in problem
    assert parsed.saved_by == "Saved with Debrief version dated today"


SHAPES = """\
<layer Name="Misc" Visible="false">
<textlabel Label="Wreck" Visible="true"><centre><shortLocation Lat="50" Long="-4"/></centre>
<timeRange Start="951212 050000" End="951212 050000"/></textlabel>
<circle Label="Stovepipe" Visible="true"><colour Value="RED"/>
<centre><shortLocation Lat="50" Long="-4"/></centre><Radius Units="nm" Value="2"/></circle>
<circle Label="Old" Radius="2"><centre><shortLocation Lat="50" Long="-4"/></centre></circle>
<polygon Label="test\\npoly" Closed="true"><WorldPath>
<Point><shortLocation Lat="50" Long="-4"/></Point>
<Point><shortLocation Lat="51" Long="-4"/></Point>
<Point><shortLocation Lat="51" Long="-3"/></Point>
</WorldPath><timeRange Start="951212 050000" End="951212 060000"/></polygon>
<grid Visible="true"/>
<wheel Label="test wheel"/>
<mystery Name="what is this"/>
<circle Label="no centre"><Radius Value="1"/></circle>
</layer>
<narrative Name="Narratives">
<narrative_entry Dtg="951212 050100" Entry="CONTACT GAINED" Track="NELSON" Type="NEW_CONTACT"/>
<narrative_entry Dtg="nonsense" Entry="lost" Track="NELSON"/>
</narrative>
<composite_track Name="PLANNED"><planning_segment Name="Leg one"/></composite_track>
<externalDatafile DataType="GeoTiff" LayerName="Chart" LayerPath="/charts/a.tif"/>"""


def test_layers_shapes_and_narrative() -> None:
    parsed = parse_dpf(
        _plot(SHAPES, '<gui><tote><primary Name="NELSON"/></tote></gui><projection/>')
    )
    assert [(layer.name, layer.visible) for layer in parsed.layers] == [
        ("Misc", False),
        ("Narratives", True),
    ]
    label, circle, old, polygon = parsed.shapes
    assert (label.kind, label.label, label.points) == ("textlabel", "Wreck", [(-4.0, 50.0)])
    assert label.end_ms is None  # an end equal to the start is no end
    assert circle.radius_m == pytest.approx(3704)
    assert circle.colour == "#e01c3e"
    assert old.radius_m == pytest.approx(2000 * 0.914399, rel=1e-5)  # kiloyards
    assert polygon.label == "test\npoly" and polygon.closed and len(polygon.points) == 3
    assert polygon.end_ms - polygon.time_ms == 3_600_000
    (entry,) = parsed.narrative
    assert (entry.track, entry.entry_type, entry.text) == (
        "NELSON",
        "NEW_CONTACT",
        "CONTACT GAINED",
    )
    skipped = {(s.element, s.name, s.layer) for s in parsed.skipped}
    assert skipped == {
        ("grid", None, "Misc"),
        ("wheel", "test wheel", "Misc"),
        ("mystery", "what is this", "Misc"),
        ("composite_track", "PLANNED", None),
        ("externalDatafile", "Chart", None),
    }
    assert [problem.split(":")[0] for _, problem in parsed.errors] == [
        "circle no centre",
        "a narrative entry",
    ]
    assert parsed.view_settings == [
        "the primary and secondary tracks (NELSON)",
        "the map projection and area shown",
    ]
