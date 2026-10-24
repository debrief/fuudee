"""Sensor lines in REP and DSF files (CAP-22, EXT-01, EXT-03), ported from legacy
Debrief's ImportSensor, ImportSensor2 and ImportSensor3 tests and ImportReplay's
getLabel and getComment, with the quirks of the files legacy read; and read into a plot,
as a plot of their own with their tracks or into an open plot as one step."""

import os
from pathlib import Path

import pytest

from debrief_io import (
    HostNeeded,
    NoSensorDataError,
    RepError,
    SensorReadBefore,
    build_plot,
    import_rep,
    import_sensor,
    parse_rep,
    parse_sensor,
    preview_sensor,
)
from debrief_io.importer import NoTracksError
from debrief_io.rep import legacy_comment, legacy_label
from debrief_kernel.time import format_utc, parse_utc
from debrief_schemas import models
from debrief_stac import Catalogue
from debrief_stac import sensors as plot_sensors

AGENT = models.AgentRef(kind="person", name="analyst")
SOURCE = models.SourceRef(href="sources/x.rep", content_hash="sha256:" + "0" * 64)


def clock() -> int:
    return parse_utc("2026-10-24T09:00:00.000Z")


# --- ;SENSOR: (ImportSensor.TestImport) -----------------------------------------------


def test_sensor_values_as_legacy_reads_them() -> None:
    cut = parse_sensor(
        ';SENSOR: 100112 121314 T23 @A NULL 90.0 40503.2 "Plain Cookie" FisherOne held on '
        "Plain Cookie"
    )
    assert cut.record == ";SENSOR:"
    assert format_utc(cut.time_ms) == "2010-01-12T12:13:14.000Z"
    assert cut.track == "T23"
    assert cut.symbology == "@A"
    assert cut.origin is None
    assert cut.bearing == 90.0
    assert cut.range_yd == pytest.approx(40503.2)
    assert cut.sensor == "Plain Cookie"
    assert cut.label == "FisherOne held on Plain Cookie"
    assert cut.ambiguous is None and cut.frequency is None


@pytest.mark.parametrize("token", ["NAN", "NULL", "NaN"])
def test_a_null_or_nan_bearing_is_no_bearing(token: str) -> None:
    cut = parse_sensor(
        f';SENSOR: 100112 121314 T23 @A NULL {token} 40503.2 "Plain Cookie" FisherOne held'
    )
    assert cut.bearing is None
    assert cut.label == "FisherOne held"


def test_a_sensor_range_of_nothing_or_zero_is_no_range() -> None:
    assert parse_sensor(";SENSOR: 100112 121314 T23 @A NULL 90 NULL S1 x").range_yd is None
    assert parse_sensor(";SENSOR: 100112 121314 T23 @A NULL 90 0 S1 x").range_yd is None


def test_a_sensor_line_may_have_no_label() -> None:
    assert parse_sensor(";SENSOR: 100112 121314 T23 @A NULL 90 NULL S1").label is None
    assert parse_sensor(";SENSOR: 100112 121314 T23 @A NULL 90 NULL S1   ").label is None


def test_a_sensors_own_position_as_a_fixs_is_written() -> None:
    # As legacy's SATC sample: tabs between fields, the sensor's name unquoted.
    cut = parse_sensor(
        ";SENSOR:\t100112\t121314\tSENSOR\t@A\t0\t4\t0\tS\t30\t0\t10\tW\t2.4\t12000\tPlain\t"
        "Cookie\tSUBJECT\theld\ton\tPlain\tCookie"
    )
    assert cut.origin == pytest.approx((-(30 + 10 / 3600), -4 / 60))
    assert cut.bearing == 2.4
    assert cut.range_yd == 12000
    assert cut.sensor == "Plain"
    assert cut.label == "Cookie\tSUBJECT\theld\ton\tPlain\tCookie"


def test_a_hemisphere_run_into_the_longitude_degrees() -> None:
    cut = parse_sensor(";SENSOR: 100112 121314 T23 @A 50 30 00 N004 10 00 W 90 NULL S1 x")
    assert cut.origin == pytest.approx((-(4 + 10 / 60), 50.5))


def test_a_negative_bearing_is_read_as_written() -> None:
    # ALPHA_CUTS.dsf gives -150: read as written; the import reads it modulo 360.
    assert (
        parse_sensor(";SENSOR:\t700101\t004000\tALPHA\t@A\tNULL\t-150\tNULL\tA\tL").bearing == -150
    )


# --- ;SENSOR2: (ImportSensor2.testMe) ---------------------------------------------------


@pytest.mark.parametrize(
    ("line", "sensor"),
    [
        (
            ";SENSOR2: 20090722 041434.000 NONSUCH @B NULL 59.3 300.8 49.96 NULL "
            "Contact_bearings 0414",
            "Contact_bearings",
        ),
        (
            ';SENSOR2: 20090722 041434.000 NONSUCH @B NULL 59.3 300.8 49.96 NULL "Contact '
            'bearings" 0414',
            "Contact bearings",
        ),
        (
            ";SENSOR2:\t20090722\t041434.000\tNONSUCH\t@B\tNULL\t59.3\t300.8\t49.96\tNULL\t"
            '"Contact '
            'bearings"\t0414',
            "Contact bearings",
        ),
        (
            ';SENSOR2: 20090722 041434.000 "NON SUCH" @B NULL 59.3 NULL NULL NULL "Contact '
            'bearings" 0414',
            "Contact bearings",
        ),
    ],
    ids=["plain", "quoted sensor", "tabs", "quoted track"],
)
def test_sensor2_lines_as_legacy_reads_them(line: str, sensor: str) -> None:
    cut = parse_sensor(line)
    assert cut.sensor == sensor
    assert cut.label == "0414"
    assert cut.bearing == 59.3


def test_sensor2_gives_the_ambiguous_bearing_and_a_frequency() -> None:
    cut = parse_sensor(
        ";SENSOR2: 20090722 041434.000 NONSUCH @B NULL 59.3 300.8 49.96 NULL Contact_bearings 0414"
    )
    assert cut.ambiguous == 300.8
    assert cut.frequency == 49.96
    assert cut.range_yd is None
    assert cut.track == "NONSUCH"
    quoted = parse_sensor(
        ';SENSOR2: 20090722 041434.000 "NON SUCH" @B NULL 59.3 NULL NULL NULL "C b" 0414'
    )
    assert quoted.track == "NON SUCH"
    assert quoted.ambiguous is None and quoted.frequency is None


def test_sensor2_with_a_date_that_does_not_exist_is_not_read() -> None:
    with pytest.raises(RepError):
        parse_sensor(";SENSOR2: 20090022 041434.000 NONSUCH @B NULL 59.3 300.8 49.96 NULL C_b 0414")


def test_sensor2_must_have_a_label_as_legacy_required() -> None:
    with pytest.raises(RepError, match="needs a label"):
        parse_sensor(";SENSOR2: 20090722 041434.000 NONSUCH @B NULL 59.3 300.8 49.96 NULL C_b")


def test_sensor2_range_of_zero_is_said() -> None:
    cut = parse_sensor(";SENSOR2: 20090722 041434.000 NONSUCH @B NULL 59.3 NULL NULL 0 C_b x")
    assert cut.range_yd is None and cut.zero_range


# --- ;SENSOR3: (ImportSensor3.testMe) ---------------------------------------------------


def test_sensor3_from_system_g_as_legacy_reads_it() -> None:
    cut = parse_sensor(
        ';SENSOR3: 20090722 041434.000 NULL @@ NULL 0.0 NULL 155.55 0.001 NULL "UNKNOWN" "UNKNOWN"'
    )
    assert cut.track == "NULL"
    assert cut.sensor == "UNKNOWN"
    assert cut.label == '"UNKNOWN"'
    assert cut.frequency == pytest.approx(155.55)
    # From a sensor named UNKNOWN with a frequency, legacy took a bearing of 0 as none.
    assert cut.bearing is None
    assert cut.ambiguous is None
    assert cut.bearing_accuracy is None
    assert cut.frequency_accuracy == "0.001"


def test_sensor3_keeps_its_bearing_accuracy_to_say_it_was_not_imported() -> None:
    cut = parse_sensor(";SENSOR3: 20090722 041434.000 NONSUCH @A NULL 45.0 1.5 NULL NULL 3000 TA x")
    assert cut.bearing == 45.0
    assert cut.bearing_accuracy == "1.5"
    assert cut.range_yd == 3000


# --- Label and comment (ImportReplay.testTrailingComment) ---------------------------------


@pytest.mark.parametrize(
    ("text", "label", "comment"),
    [
        (" LABEL // COMMENT", "LABEL", "COMMENT"),
        (" LABEL", "LABEL", None),
        (" LABEL//", "LABEL", None),
        ("//COMMENT", None, "COMMENT"),
        ("", None, None),
        (None, None, None),
    ],
)
def test_label_and_comment_as_legacy_splits_them(text, label, comment) -> None:
    assert legacy_label(text) == label
    assert legacy_comment(text) == comment


def test_a_sensor_lines_comment_after_two_slashes() -> None:
    cut = parse_sensor(";SENSOR: 100112 121314 T23 @A NULL 90 NULL S1 held // faint")
    assert (cut.label, cut.comment) == ("held", "faint")


# --- A REP file with tracks and sensors ----------------------------------------------------

REP = """\
100112 120000 NELSON @C 50 00 00.00 N 004 00 00.00 W 090.0 10.0 0.0
100112 121000 NELSON @C 50 00 00.00 N 003 55 00.00 W 090.0 10.0 0.0
100112 122000 NELSON @C 50 00 00.00 N 003 50 00.00 W 090.0 10.0 0.0
;SENSOR2: 100112 120500 NELSON @A NULL 45.0 135.0 NULL NULL "Towed array" 1205
;SENSOR2: 100112 120600 NELSON @A NULL 46.0 134.0 150.5 NULL "Towed array" 1206 // held
;SENSOR: 100112 120700 NELSON @B NULL -150 4000 Hull held
;SENSOR: 100112 120800 NELSON CB NULL NULL 4000 Hull none
;SENSOR: 100112 120800 GHOST @A NULL 10 NULL Hull lost
;SENSOR: 100112 130000 NELSON @B NULL 20 NULL Hull late
"""


def test_a_rep_file_with_sensor_lines_makes_sensors_on_its_tracks() -> None:
    plot, report = build_plot(REP, SOURCE, AGENT, clock=clock)
    sensors = {s.properties.name: s for s in plot_sensors.sensors(plot)}
    assert set(sensors) == {"Towed array", "Hull"}
    towed = sensors["Towed array"]
    assert towed.properties.host_track_id == "track-nelson"
    assert towed.properties.colour == "#0064bd"
    assert towed.properties.legacy_symbology == "@A"
    cuts = plot_sensors.cuts(plot, towed.id)
    assert [c.properties.ambiguous_bearing.value for c in cuts] == [135.0, 134.0]
    assert cuts[1].properties.label == "1206"
    assert cuts[1].properties.comment == "held"
    hull = plot_sensors.cuts(plot, sensors["Hull"].id)
    assert hull[0].properties.bearing.value == 210.0  # -150, modulo 360
    assert hull[0].properties.range.value == pytest.approx(4000 * 0.9144)
    assert report.sensor_cuts == 4
    said = " ".join(report.omitted + report.notes)
    assert "1 cut gave a frequency: not imported" in said
    assert "1 line gave no bearing" in said
    assert (
        "Line styles not imported, cuts drawn solid: long dashes (1)" not in said
    )  # none had a bearing
    assert "1 bearing outside 0 to 360° read modulo 360" in said
    assert "1 cut of Hull not imported: the file has no track 'GHOST'" in said
    assert "1 cut of Hull falls outside NELSON's fixes" in said
    assert (
        "Sensor data read: Towed array on NELSON (2 cuts, 2 ambiguous); Hull on NELSON (2 cuts)."
        in said
    )


def test_a_dsf_file_alone_is_not_a_plot(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "cat", "c", "C", "D")
    dsf = tmp_path / "cuts.dsf"
    dsf.write_text(";SENSOR: 100112 120700 NELSON @A NULL 40 NULL Hull held\n")
    with pytest.raises(NoTracksError, match="sensor data only"):
        import_rep(catalogue, dsf)


# --- A DSF file read into an open plot ------------------------------------------------------

DSF = """\
;; From the acoustic replay application
;SENSOR2: 100112 120500 nelson @A NULL 45.0 135.0 NULL NULL TA 1205
;SENSOR2: 100112 121500 nelson @A NULL 47.0 133.0 NULL NULL TA 1215
;SENSOR: 100112 121000 NELSON_GB EA NULL 90 NULL UNKNOWN x
;SENSOR: 100112 121000 FRIGATE @A NULL 90 NULL Hull x
;TA_COG_ABS: 100112 121000 NELSON 1 2 3
"""


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "c", "C", "D")
    rep = tmp_path / "nelson.rep"
    rep.write_text(REP)
    import_rep(catalogue, rep, item_id="p")
    return catalogue


def test_preview_says_each_sensor_and_the_track_it_would_have(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    dsf = tmp_path / "s2046.dsf"
    dsf.write_text(DSF)
    seen = preview_sensor(dsf, catalogue=catalogue, item_id="p")
    by_track = {s["track"]: s for s in seen["sensors"]}
    assert by_track["nelson"]["host_track_id"] == "track-nelson"  # case ignored
    assert by_track["NELSON_GB"]["host_track_id"] == "track-nelson"  # first six letters
    assert by_track["NELSON_GB"]["name"] == "s2046"  # UNKNOWN, named after the file
    assert by_track["FRIGATE"]["host_track_id"] is None
    assert by_track["nelson"]["ambiguous"] == 2
    assert seen["tracks"] == [{"id": "track-nelson", "name": "NELSON"}]
    assert "1 ;TA_COG_ABS: line not read." in seen["omitted"]


def test_a_dsf_file_is_read_into_the_plot_as_one_step(catalogue: Catalogue, tmp_path: Path) -> None:
    dsf = tmp_path / "s2046.dsf"
    dsf.write_text(DSF)
    with pytest.raises(HostNeeded, match="Say which track carries the sensors of 'FRIGATE'"):
        import_sensor(catalogue, "p", dsf, AGENT)
    done = import_sensor(catalogue, "p", dsf, AGENT, hosts={"FRIGATE": "track-nelson"})
    plot = catalogue.read_plot("p")
    assert {s.properties.name for s in plot_sensors.sensors(plot)} >= {"TA", "s2046", "Hull"}
    assert done.cuts == 4
    record = catalogue.history("p").steps()[-1].records[0]
    assert record.notes[0] == "Sensor data read from s2046.dsf"
    assert record.used[0].href.endswith("s2046.dsf")
    assert {p.name: p.value for p in record.parameters} == {"host_frigate": "track-nelson"}
    assert "Line styles not imported, cuts drawn solid: unconnected (1)." in record.notes
    # Read again: refused unless said.
    with pytest.raises(SensorReadBefore):
        import_sensor(catalogue, "p", dsf, AGENT, hosts={"FRIGATE": None})
    import_sensor(catalogue, "p", dsf, AGENT, hosts={"FRIGATE": None}, again=True)
    # Undo takes the whole read back.
    catalogue.history("p").undo()
    catalogue.history("p").undo()
    assert {s.properties.name for s in plot_sensors.sensors(catalogue.read_plot("p"))} == {
        "Towed array",
        "Hull",
    }


def test_a_file_with_no_bearing_reads_nothing(catalogue: Catalogue, tmp_path: Path) -> None:
    dsf = tmp_path / "freq.dsf"
    dsf.write_text(
        ';SENSOR3: 100112 120500 NELSON @A NULL 0.0 NULL 150.911 0.004 NULL "UNKNOWN" "UNKNOWN"\n'
    )
    with pytest.raises(NoSensorDataError, match="gave a frequency"):
        import_sensor(catalogue, "p", dsf, AGENT)


# --- Legacy Debrief's own sample files, where a checkout is at hand ------------------------

LEGACY = os.environ.get("DEBRIEF_LEGACY")


@pytest.mark.skipif(not LEGACY, reason="DEBRIEF_LEGACY is not set")
def test_every_legacy_dsf_sample_reads_without_a_line_it_cannot() -> None:
    files = sorted(Path(LEGACY).rglob("*.dsf"))
    assert files
    for path in files:
        text = path.read_bytes().decode("latin-1")
        parsed = parse_rep(text)
        lines = text.splitlines()
        # Towed-array shape lines (;TA_...) are another record type, listed as not read; an
        # ASSET file's CSV heading is not a line legacy could read either.
        bad = [(n, p) for n, p in parsed.errors if lines[n - 1].lstrip().startswith(";SENSOR")]
        assert not bad, (path.name, bad[:3])
        assert parsed.sensor_cuts or parsed.other_records, path.name
