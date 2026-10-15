"""REP narrative lines (;NARRATIVE: and ;NARRATIVE2:), ported from legacy Debrief's
ImportNarrative and ImportNarrative2 and their test cases, with synthetic lines; and a
narrative read into a plot already open, as one step (CAP-20)."""

from pathlib import Path

import pytest

from debrief_io import (
    NoNarrativeError,
    RepError,
    build_plot,
    import_narrative,
    import_rep,
    parse_narrative,
    parse_rep,
)
from debrief_kernel.time import format_utc
from debrief_schemas import models
from debrief_stac import Catalogue, CatalogueError, Conflict

AGENT = models.AgentRef(kind="person", name="analyst")
SOURCE = models.SourceRef(href="sources/x.rep", content_hash="sha256:" + "0" * 64)


def when(entry) -> str:
    return format_utc(entry.time_ms)


# --- One line at a time: the legacy cases --------------------------------------


def test_a_narrative_line_has_a_time_a_source_and_the_rest_as_text() -> None:
    entry = parse_narrative(";NARRATIVE:\t110621\t093015\tBLUE_ONE \tComment\tMarked range 1500 yd")
    assert when(entry) == "2011-06-21T09:30:15.000Z"
    assert entry.source == "BLUE_ONE"
    # No type on a ;NARRATIVE: line: what follows the source is all text, tabs kept.
    assert entry.entry_type is None
    assert entry.text == "Comment\tMarked range 1500 yd"


def test_a_quoted_source_may_hold_spaces_with_space_before_the_tab() -> None:
    entry = parse_narrative(';NARRATIVE:\t110621\t093015\t"BLUE ONE" \tComment\tMarked range')
    assert entry.source == "BLUE ONE"
    assert entry.text == "Comment\tMarked range"
    single = parse_narrative(';NARRATIVE: 110621 093015 "CONTROL" Serial started.')
    assert (single.source, single.text) == ("CONTROL", "Serial started.")


@pytest.mark.parametrize("lead", ["  ", "\t", ""])
def test_leading_whitespace_before_the_record_is_allowed(lead: str) -> None:
    entry = parse_narrative(f"{lead};NARRATIVE:\t110621\t093015\tBLUE_ONE \tLogged.")
    assert (entry.source, entry.text) == ("BLUE_ONE", "Logged.")


def test_an_unquoted_source_with_a_space_reads_as_legacy_read_it() -> None:
    # Legacy Debrief takes the first word as the source; the rest is text.
    entry = parse_narrative(";NARRATIVE:\t110621\t093015\tBLUE ONE\tPosn\tOn station.\t\t\t")
    assert entry.source == "BLUE"
    assert entry.text == "ONE\tPosn\tOn station."  # trailing tabs trimmed


def test_a_narrative2_line_has_a_type_quoted_or_not() -> None:
    entry = parse_narrative(';NARRATIVE2:\t110621\t093015\t"BLUE ONE" \tSonarLog\tContact on 045.')
    assert (entry.source, entry.entry_type, entry.text) == (
        "BLUE ONE",
        "SonarLog",
        "Contact on 045.",
    )
    entry = parse_narrative(';NARRATIVE2: 110621 093015 RED_ONE "Weapon Log" Tube 1 ready.')
    assert (entry.source, entry.entry_type, entry.text) == (
        "RED_ONE",
        "Weapon Log",
        "Tube 1 ready.",
    )


def test_times_as_legacy_reads_them() -> None:
    # Fractions of a second; a short time padded; a four-digit year.
    assert (
        when(parse_narrative(";NARRATIVE: 110621 093015.250 A text")) == "2011-06-21T09:30:15.250Z"
    )
    assert when(parse_narrative(";NARRATIVE: 110621 200 A text")) == "2011-06-21T00:02:00.000Z"
    assert when(parse_narrative(";NARRATIVE: 20110621 093015 A text")) == "2011-06-21T09:30:15.000Z"
    # Two-digit years in the fixed window 1950 to 2049.
    assert when(parse_narrative(";NARRATIVE: 500101 000000 A text")).startswith("1950")
    assert when(parse_narrative(";NARRATIVE: 491231 000000 A text")).startswith("2049")
    finer = parse_narrative(";NARRATIVE: 110621 093015.250750 A text")
    assert finer.time_truncated and when(finer) == "2011-06-21T09:30:15.250Z"


def test_quotes_glued_to_the_next_field_keep_it() -> None:
    # Legacy Debrief dropped text run on after the closing quote; v4 keeps it.
    entry = parse_narrative(';NARRATIVE2: 110621 093015 "BLUE ONE"Comment Logged.')
    assert (entry.source, entry.entry_type, entry.text) == ("BLUE ONE", "Comment", "Logged.")


@pytest.mark.parametrize(
    ("line", "said"),
    [
        (";NARRATIVE: 110621", "date and a time"),
        (";NARRATIVE: 110621 093015", "source"),
        (";NARRATIVE: 110621 093015 BLUE_ONE", "no text"),
        (";NARRATIVE: 110621 093015 BLUE_ONE    \t ", "no text"),
        (";NARRATIVE2: 110621 093015 BLUE_ONE Comment", "no text"),
        (';NARRATIVE: 110621 093015 "BLUE ONE Logged.', "no closing quote"),
        (";NARRATIVE: 110699 093015 BLUE_ONE Logged.", "110699"),
        (";NARRATIVE: 11o621 093015 BLUE_ONE Logged.", "not a date"),
    ],
)
def test_a_line_that_cannot_be_read_says_why(line: str, said: str) -> None:
    with pytest.raises(RepError, match=said):
        parse_narrative(line)


# --- A file -------------------------------------------------------------------------

LOG = """\
;; A synthetic exercise log: two platforms and control.
110621 093000 BLUE_ONE @A 50 20 00.00 N 004 07 00.00 W 090.0 12.0 0
110621 093500 BLUE_ONE @A 50 20 00.00 N 004 06 00.00 W 090.0 12.0 0
;NARRATIVE:\t110621\t093000\tBLUE_ONE\tOn task.
;NARRATIVE2:\t110621\t093000\tCONTROL\tOrder\tSerial started.
;NARRATIVE2:\t110621\t093100\t"RED ONE"\tCSD\tC/C 180, S 5 kn, D 40 m.
;NARRATIVE:\t110621\t093100\tblue_one\tContact gained, bearing 045.
;NARRATIVE: 110621 093100 BLUE_ONE
;SENSOR: 110621 093100 BLUE_ONE @A NULL 045.0 NULL NULL NULL NULL bow
"""


def test_a_file_reads_every_narrative_line_in_order_and_reports_the_bad_ones() -> None:
    parsed = parse_rep(LOG)
    assert [(n.source, n.entry_type, n.line) for n in parsed.narrative] == [
        ("BLUE_ONE", None, 4),
        ("CONTROL", "Order", 5),
        ("RED ONE", "CSD", 6),
        ("blue_one", None, 7),
    ]
    assert parsed.errors == [(8, "a narrative line has no text")]
    assert parsed.other_records == {";SENSOR:": 1}


def test_an_imported_plot_holds_the_narrative_each_entry_on_its_track() -> None:
    plot, report = build_plot(LOG, SOURCE, AGENT, clock=lambda: 0)
    entries = [f for f in plot.features if f.properties.kind == "narrative"]
    assert report.narrative_entries == 4
    assert [e.id for e in entries] == [f"narrative-000{i}" for i in range(1, 5)]
    # BLUE_ONE has a track: its entries belong to it, ignoring case; the others have none.
    assert [e.properties.track_id for e in entries] == [
        "track-blue-one",
        None,
        None,
        "track-blue-one",
    ]
    assert "4 narrative entries read, from BLUE_ONE, CONTROL, RED ONE, blue_one." in report.notes
    assert not any("NARRATIVE" in line for line in report.omitted)
    assert "Line 8 could not be read: a narrative line has no text." in report.omitted


def test_a_file_of_narrative_alone_makes_a_plot(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    log = tmp_path / "control-log.rep"
    log.write_text(";NARRATIVE2: 110621 093000 CONTROL Order Serial started.\n")
    report = import_rep(catalogue, log)
    assert (report.tracks, report.narrative_entries) == ([], 1)
    item = catalogue.read_item("control-log").properties
    assert item.start_datetime == "2011-06-21T09:30:00.000Z"


# --- Into a plot already open: one step --------------------------------------------


@pytest.fixture
def opened(tmp_path: Path) -> tuple[Catalogue, Path]:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    plot = tmp_path / "serial.rep"
    plot.write_text(LOG)
    import_rep(catalogue, plot, item_id="serial")
    red = tmp_path / "red-log.rep"
    red.write_text(
        ";NARRATIVE2: 110621 093000 BLUE_ONE Sonar Same second as BLUE_ONE's own.\n"
        ';NARRATIVE2: 110621 093200 "RED ONE" CSD Went deep.\n'
        "110621 093000 RED_ONE @C 50 20 00.00 N 004 07 00.00 W 090.0 12.0 0\n"
    )
    return catalogue, red


def test_a_second_log_joins_the_plot_as_one_step_with_its_source(opened) -> None:
    catalogue, red = opened
    before = catalogue.history("serial").head().current
    done = import_narrative(catalogue, "serial", red, AGENT)
    assert done.step == before + 1 and done.entries == 2
    assert done.sources == ["BLUE_ONE", "RED ONE"]
    assert done.omitted == ["1 fix lines not read: import the file as a plot for its tracks."]
    step = catalogue.history("serial").delta(done.step)
    (record,) = step.records
    assert (
        record.tool.name == "debrief-io.narrative" and record.used[0].href == "sources/red-log.rep"
    )
    assert [f.id for f in step.added] == ["narrative-0005", "narrative-0006"]
    assert step.added[0].properties.track_id == "track-blue-one"
    assert catalogue.verify_sources("serial") == []
    # Undone like any step.
    catalogue.history("serial").undo()
    ids = {f.id for f in catalogue.read_plot("serial").features}
    assert "narrative-0005" not in ids


def test_a_log_with_no_narrative_or_on_an_old_base_changes_nothing(opened, tmp_path: Path) -> None:
    catalogue, red = opened
    empty = tmp_path / "empty.rep"
    empty.write_text(";; nothing\n")
    with pytest.raises(NoNarrativeError):
        import_narrative(catalogue, "serial", empty, AGENT)
    base = catalogue.history("serial").base()
    import_narrative(catalogue, "serial", red, AGENT)
    again = tmp_path / "again.rep"
    again.write_text(red.read_text())
    with pytest.raises(Conflict):
        import_narrative(catalogue, "serial", again, AGENT, base)
    assert "source-again.rep" not in catalogue.assets("serial")
    with pytest.raises(CatalogueError, match="already has a source named red-log.rep"):
        import_narrative(catalogue, "serial", red, AGENT)
