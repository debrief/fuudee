"""Word and PDF narrative read into an open plot as one step, or imported as a plot of
its own (CAP-19, CAP-20, EXT-04), on synthetic documents only (DEV-05)."""

from pathlib import Path

import pytest
from synthetic_docs import ASW, NARRATIVE, NARRATIVE_PDF, RIDER_TABLE, docx, pdf

from debrief_io import (
    AlreadyInPlotError,
    Choices,
    NoNarrativeError,
    import_document,
    import_narrative,
    import_rep,
    preview_narrative,
)
from debrief_schemas import models
from debrief_stac import Catalogue, Conflict

AGENT = models.AgentRef(kind="person", name="analyst")
DATA = Path(__file__).parent / "data"
# Two tracks over the narrative's first three weeks: 12 March 08:00 to 2 April 11:00.
PLOT = (
    '200312 080000.000 "BLUE ONE" @C 50 20 00.00 N 004 07 00.00 W 090.0 12.0 0\n'
    '200312 235900.000 "BLUE ONE" @C 50 21 00.00 N 004 07 00.00 W 090.0 12.0 0\n'
    '200401 070000.000 "RED TWO" @A 50 22 00.00 N 004 07 00.00 W 090.0 12.0 0\n'
    '200402 110000.000 "RED TWO" @A 50 23 00.00 N 004 07 00.00 W 090.0 12.0 0\n'
)


@pytest.fixture
def opened(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    plot = tmp_path / "serial.rep"
    plot.write_text(PLOT)
    import_rep(catalogue, plot, item_id="serial")
    return catalogue


def write(tmp_path: Path, name: str, data: bytes) -> Path:
    path = tmp_path / name
    path.write_bytes(data)
    return path


def test_a_word_narrative_is_read_into_the_plot_as_one_step(opened, tmp_path: Path) -> None:
    log = write(tmp_path, "blue-log.docx", docx(NARRATIVE))
    before = opened.history("serial").head().current
    done = import_narrative(opened, "serial", log, AGENT)
    assert done.step == before + 1 and done.entries == 9
    # Matched to a track, an entry is the track's by name (product owner, 15 Oct 2026);
    # the name as written is in the step's record.
    assert done.sources == ["BLUE ONE", "RED TWO"]
    step = opened.history("serial").delta(done.step)
    (record,) = step.records
    assert record.tool.name == "debrief-io.narrative"
    assert record.used[0].href == "sources/blue-log.docx"
    params = {p.name: p.value for p in record.parameters}
    assert params["format"] == "docx" and params["dialect"] == "narrative-document"
    assert record.notes[0] == "Narrative read from blue-log.docx"
    assert record.notes[1] == "Word document, read as a narrative log."
    # HMS BLUE ONE belongs to BLUE ONE's track, legacy Debrief's prefix skipped.
    tracks = {f.properties.source: f.properties.track_id for f in step.added}
    assert tracks == {"BLUE ONE": "track-blue-one", "RED TWO": "track-red-two"}
    assert any(
        n.endswith("written as from HMS BLUE ONE are BLUE ONE's: their source is the track's name.")
        for n in record.notes
    )
    # What was not read, and what was corrected, are said.
    assert "2 lines before the first entry (a title, a preamble) were not read." in done.omitted
    assert any("day went back" in n for n in done.notes)
    assert any("1 FCS entry give" in n for n in done.notes)
    # Undone as one step.
    opened.history("serial").undo()
    assert not [f for f in opened.read_plot("serial").features if f.properties.kind == "narrative"]


def test_the_analysts_choices_types_period_and_tracks(opened, tmp_path: Path) -> None:
    log = write(tmp_path, "blue-log.docx", docx(NARRATIVE))
    choices = Choices(
        types=["OOW COMMENT", "LOG", ""],
        within_period=True,
        tracks={"RED TWO": None},
    )
    done = import_narrative(opened, "serial", log, AGENT, choices=choices)
    added = opened.history("serial").delta(done.step).added
    # OOW COMMENT 3, LOG 1, no type 2 of which one (2 May) is after the plot's period.
    assert done.entries == 5
    assert {f.properties.entry_type for f in added} == {"OOW COMMENT", "LOG", None}
    assert any(o.startswith("3 entries of types not chosen") for o in done.omitted)
    assert any(o.startswith("1 entry outside the plot's period") for o in done.omitted)
    assert {f.properties.track_id for f in added if f.properties.source == "RED TWO"} == {None}
    (record,) = opened.history("serial").delta(done.step).records
    params = {p.name: p.value for p in record.parameters}
    assert params["types"] == "OOW COMMENT; LOG; (no type)" and params["within_period"] is True
    assert params["track_red_two"] == "none"


def test_a_printed_log_names_no_platform(opened, tmp_path: Path) -> None:
    log = write(tmp_path, "printed.pdf", pdf(NARRATIVE_PDF))
    preview = preview_narrative(log, opened.read_plot("serial"))
    assert preview["unnamed"] == 5 and preview["platform"] == "printed"
    done = import_narrative(opened, "serial", log, AGENT, choices=Choices(platform="BLUE ONE"))
    added = opened.history("serial").delta(done.step).added
    assert {(f.properties.source, f.properties.track_id) for f in added} == {
        ("BLUE ONE", "track-blue-one")
    }
    assert "5 entries name no platform: their source is BLUE ONE." in done.notes


def test_a_riders_narrative_from_word_97(opened, tmp_path: Path) -> None:
    log = write(tmp_path, "rider.doc", (DATA / "synthetic-rider.doc").read_bytes())
    done = import_narrative(opened, "serial", log, AGENT)
    assert done.entries == 10 and done.sources == ["BLUE ONE"]
    added = opened.history("serial").delta(done.step).added
    assert {f.properties.entry_type for f in added} == {"Rider"}
    assert {f.properties.track_id for f in added} == {"track-blue-one"}
    assert any("give a bearing" in n for n in done.notes)
    assert "Row 14 has 1 cell, not the four of an entry: not read." in done.omitted


def test_the_preview_says_what_there_is_to_ask_about(opened, tmp_path: Path) -> None:
    log = write(tmp_path, "blue-log.docx", docx(NARRATIVE))
    before = opened.history("serial").head()
    preview = preview_narrative(log, opened.read_plot("serial"))
    assert preview["dialect"] == "narrative-document" and preview["entries"] == 9
    assert preview["described"] == "Word document, read as a narrative log"
    assert preview["types"][0] == {"name": "OOW COMMENT", "count": 3}
    assert {"name": "", "count": 2} in preview["types"]
    assert preview["sources"] == [
        {"name": "RED TWO", "count": 5, "track_id": "track-red-two"},
        {"name": "HMS BLUE ONE", "count": 4, "track_id": "track-blue-one"},
    ]
    assert preview["outside"] == 2
    assert (preview["plot_start"], preview["plot_end"]) == (
        "2020-03-12T08:00:00.000Z",
        "2020-04-02T11:00:00.000Z",
    )
    # Nothing was changed.
    assert opened.history("serial").head() == before


def test_asw_data_is_not_narrative_but_is_a_plot(opened, tmp_path: Path) -> None:
    data = write(tmp_path, "asw.docx", docx(ASW))
    with pytest.raises(NoNarrativeError, match="ASW data: 5 positions"):
        import_narrative(opened, "serial", data, AGENT)
    report = import_document(opened, data, track_name="BLUE THREE")
    assert report.tracks == ["BLUE THREE"] and report.fixes == 5
    assert report.omitted == ["Line 7 could not be read: Badly formatted date:261a206ZAPR."]
    plot = opened.read_plot(report.item_id)
    (track,) = [f for f in plot.features if f.properties.kind == "track"]
    assert track.properties.times[0] == "2021-04-26T12:00:00.000Z"
    params = {p.name: p.value for p in plot.provenance[0].parameters}
    assert params == {"format": "docx", "dialect": "asw-data"}


def test_a_narrative_document_makes_a_plot_of_its_own(tmp_path: Path) -> None:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    log = write(tmp_path, "rider.docx", docx([], RIDER_TABLE))
    report = import_document(catalogue, log)
    assert report.narrative_entries == 10 and report.tracks == []
    plot = catalogue.read_plot(report.item_id)
    entries = [f for f in plot.features if f.properties.kind == "narrative"]
    assert len(entries) == 10 and entries[0].properties.track_id is None
    assert plot.provenance[0].tool.name == "debrief-io.document"
    assert catalogue.verify_sources(report.item_id) == []


def test_damaged_documents_and_stale_bases_change_nothing(opened, tmp_path: Path) -> None:
    broken = write(tmp_path, "broken.docx", b"PK\x03\x04broken")
    with pytest.raises(NoNarrativeError, match="could not be read: The Word document is damaged"):
        import_narrative(opened, "serial", broken, AGENT)
    preamble = write(tmp_path, "nothing.docx", docx(["A title", "and a preamble only"]))
    with pytest.raises(NoNarrativeError, match="No narrative entry could be read"):
        import_narrative(opened, "serial", preamble, AGENT)
    base = opened.history("serial").base()
    import_narrative(opened, "serial", write(tmp_path, "a.pdf", pdf(NARRATIVE_PDF)), AGENT)
    with pytest.raises(Conflict):
        import_narrative(opened, "serial", write(tmp_path, "b.docx", docx(NARRATIVE)), AGENT, base)
    assert "source-b.docx" not in opened.assets("serial")
    # Choices that leave nothing say so.
    with pytest.raises(NoNarrativeError, match="Nothing would be read"):
        import_narrative(
            opened,
            "serial",
            write(tmp_path, "c.docx", docx(NARRATIVE)),
            AGENT,
            choices=Choices(types=["NO SUCH TYPE"]),
        )


@pytest.mark.parametrize(
    "value",
    [
        {"types": "OOW"},
        {"tracks": {"A": 3}},
        {"platform": " "},
        {"within_period": "yes"},
        {"duplicates": "yes"},
    ],
)
def test_choices_are_checked(value: dict) -> None:
    with pytest.raises(ValueError):
        Choices.of(value)


# --- Read before (product owner, 15 Oct 2026) -------------------------------------------


def narrative_in(catalogue: Catalogue) -> list:
    plot = catalogue.read_plot("serial")
    return [f for f in plot.features if f.properties.kind == "narrative"]


def test_the_same_document_read_again_under_any_name_is_known(opened, tmp_path: Path) -> None:
    first = write(tmp_path, "blue-log.docx", docx(NARRATIVE))
    done = import_narrative(opened, "serial", first, AGENT)
    again = write(tmp_path, "copy of the log.docx", first.read_bytes())
    # The preview says when and how it was read in, and how many entries are there.
    preview = preview_narrative(again, catalogue=opened, item_id="serial")
    (earlier,) = preview["earlier"]
    assert earlier["step"] == done.step and earlier["name"] == "blue-log.docx"
    assert earlier["by"] == "analyst" and earlier["how"] == "Narrative read from blue-log.docx"
    assert preview["already"] == 9 and preview["content_hash"].startswith("sha256:")
    # Not read again until told: nothing changed.
    before = opened.history("serial").head()
    with pytest.raises(AlreadyInPlotError) as raised:
        import_narrative(opened, "serial", again, AGENT)
    said = str(raised.value)
    assert said.startswith("copy of the log.docx is already in the plot: read in on ")
    assert f"by analyst (step {done.step}, Narrative read from blue-log.docx)" in said
    assert "; all 9 entries to read are in the plot. Nothing was read." in said
    assert 'duplicates "skip"' in said and '"add"' in said
    assert opened.history("serial").head() == before
    # Skipping them all leaves nothing to read, and says so.
    with pytest.raises(NoNarrativeError, match="Nothing would be read.*9 entries already"):
        import_narrative(opened, "serial", again, AGENT, choices=Choices(duplicates="skip"))
    # Added again: twice, said, and the source already kept is used, not kept again.
    twice = import_narrative(opened, "serial", again, AGENT, choices=Choices(duplicates="add"))
    assert twice.entries == 9 and len(narrative_in(opened)) == 18
    assert any("read again, as chosen: the plot has them twice" in n for n in twice.notes)
    assert any(n.startswith("The same file (by its content) was read in on") for n in twice.notes)
    (record,) = opened.history("serial").delta(twice.step).records
    assert record.used[0].href == "sources/blue-log.docx"
    assert {p.name: p.value for p in record.parameters}["duplicates"] == "add"
    assert "source-copy of the log.docx" not in opened.assets("serial")
    assert opened.verify_sources("serial") == []


def test_only_the_entries_not_in_the_plot_are_read_when_skipping(opened, tmp_path: Path) -> None:
    log = write(tmp_path, "blue-log.docx", docx(NARRATIVE))
    import_narrative(opened, "serial", log, AGENT, choices=Choices(types=["OOW COMMENT"]))
    assert len(narrative_in(opened)) == 3
    done = import_narrative(opened, "serial", log, AGENT, choices=Choices(duplicates="skip"))
    assert done.entries == 6 and len(narrative_in(opened)) == 9
    assert (
        "3 entries already in the plot (the same time, source and text) not read again, "
        "as chosen." in done.omitted
    )


def test_some_entries_already_in_the_plot_from_another_file(opened, tmp_path: Path) -> None:
    # Not the same file (another entry at its end), but most of its entries are there.
    import_narrative(opened, "serial", write(tmp_path, "a.docx", docx(NARRATIVE)), AGENT)
    longer = write(tmp_path, "b.docx", docx([*NARRATIVE, "1300 One more entry after them."]))
    preview = preview_narrative(longer, catalogue=opened, item_id="serial")
    assert preview["earlier"] == [] and (preview["entries"], preview["already"]) == (10, 9)
    with pytest.raises(AlreadyInPlotError) as raised:
        import_narrative(opened, "serial", longer, AGENT)
    assert str(raised.value).startswith(
        "9 of the 10 entries to read from b.docx are already in the plot (the same time, "
        "source and text). Nothing was read."
    )
    done = import_narrative(opened, "serial", longer, AGENT, choices=Choices(duplicates="skip"))
    assert done.entries == 1 and len(narrative_in(opened)) == 10


def test_entries_match_by_time_source_and_text_as_the_importer_writes_them(
    opened, tmp_path: Path
) -> None:
    log = write(tmp_path, "blue-log.docx", docx(NARRATIVE))
    import_narrative(opened, "serial", log, AGENT)
    # HMS BLUE ONE's entries are BLUE ONE's in the plot: still the same entries.
    preview = preview_narrative(log, catalogue=opened, item_id="serial")
    assert preview["already"] == 9
    # An entry changed in the plot is no longer the same; one deleted is not there.
    entries = narrative_in(opened)
    opened.edit_narrative("serial", entries[0].id, {"text": "Came to 095, 12 kn."}, AGENT)
    opened.delete_narrative("serial", [entries[1].id], AGENT)
    assert preview_narrative(log, catalogue=opened, item_id="serial")["already"] == 7
    # Spacing and case in the text are not a difference.
    plain = narrative_in(opened)[0]
    opened.edit_narrative("serial", plain.id, {"text": plain.properties.text.upper()}, AGENT)
    assert preview_narrative(log, catalogue=opened, item_id="serial")["already"] == 7


def test_a_read_undone_is_not_in_the_plot(opened, tmp_path: Path) -> None:
    log = write(tmp_path, "blue-log.docx", docx(NARRATIVE))
    import_narrative(opened, "serial", log, AGENT)
    opened.history("serial").undo()
    preview = preview_narrative(log, catalogue=opened, item_id="serial")
    assert preview["earlier"] == [] and preview["already"] == 0
    # Read again without asking; the source of the same name and content is used again.
    done = import_narrative(opened, "serial", log, AGENT)
    assert done.entries == 9 and opened.verify_sources("serial") == []


def test_numbers_read_as_text_are_listed_in_the_record(opened, tmp_path: Path) -> None:
    # Product owner, 15 Oct 2026: a line out of order is text, and the step says so.
    lines = [*NARRATIVE_PDF[:3], "2000 yds, closing.", *NARRATIVE_PDF[3:]]
    log = write(tmp_path, "printed.pdf", pdf(lines))
    preview = preview_narrative(log, catalogue=opened, item_id="serial")
    said = (
        "1 line starting with a number was read as text of the entry before, not as an "
        "entry: its time would be out of order with the entries around it (line 4: "
        "“2000 yds, closing.”)."
    )
    assert preview["entries"] == 5 and said in preview["notes"]
    done = import_narrative(opened, "serial", log, AGENT, choices=Choices(platform="BLUE ONE"))
    (record,) = opened.history("serial").delta(done.step).records
    assert said in record.notes
    first = opened.history("serial").delta(done.step).added[0]
    assert first.properties.text == "Came to 090, 12 kn.\n2000 yds, closing."
