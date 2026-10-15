"""The dialects held to legacy Debrief's own test expectations on its sample documents,
where a checkout of legacy Debrief is at hand: DEBRIEF_LEGACY names its root. Skipped
otherwise. Only counts and the form of entries are asserted: none of the documents or
their text is copied here (DEV-05).

    DEBRIEF_LEGACY=/path/to/debrief uv run pytest python/debrief-io/tests/test_word_legacy*
"""

import os
from pathlib import Path

import pytest

from debrief_io.documents import read_document
from debrief_io.rep import parse_rep
from debrief_io.word import ASW, RIDER, read_dialect

ROOT = os.environ.get("DEBRIEF_LEGACY")
pytestmark = pytest.mark.skipif(not ROOT, reason="DEBRIEF_LEGACY is not set")
SAMPLES = Path(ROOT or ".") / "org.mwc.cmap.combined.feature/root_installs/sample_data"
OTHER = SAMPLES / "other_formats"
TEST_DOCS = Path(ROOT or ".") / "org.mwc.debrief.legacy/src/Debrief/ReaderWriter/Word/test_docs"


def read(path: Path):
    return read_dialect(read_document(path.name, path.read_bytes()), track="T")


def period(rep: str) -> tuple[int, int]:
    fixes = parse_rep((SAMPLES / rep).read_text(errors="replace")).fixes
    return min(f.time_ms for f in fixes), max(f.time_ms for f in fixes)


def within(entries, rep: str) -> list:
    start, end = period(rep)
    return [e for e in entries if start <= e.time_ms <= end]


def test_the_dummy_narrative() -> None:
    # testImportAllNarrativeTypes, testImportSelectedNarrativeNonFCSTypes, testImportEmptyLayers
    entries = read(OTHER / "test_narrative.doc").entries
    assert len(entries) == 13
    assert sum(e.entry_type == "CAT COMMENT" for e in entries) == 5
    assert entries[9].text.count("\n") == 2  # a multi-line entry of three lines


def test_the_fcs_narrative() -> None:
    entries = read(OTHER / "FCS_narrative.doc").entries
    assert len(entries) == 371  # testSpanningYear: every entry
    assert len(within(entries, "boat1.rep")) == 364  # testAddFCSToTrack
    assert sum(e.entry_type == "FCS" for e in entries) == 18  # testImportSelectedNarrativeFCSTypes
    oow = [e for e in within(entries, "boattest.rep") if e.entry_type == "OOW COMMENT"]
    assert len(oow) == 285  # testImportSelectedTypesWithOuterPeriod


def test_the_fcs_narrative_without_metadata() -> None:
    entries = read(OTHER / "FCS_narrative_no_metadata.doc").entries
    assert len(within(entries, "boat1.rep")) == 350  # testNoMetadata
    pdf = read(OTHER / "FCS_narrative_no_metadata.pdf").entries
    assert len(within(pdf, "boat1.rep")) == 350


@pytest.mark.parametrize(
    "path",
    [
        OTHER / "RiderNarrative.docx",
        OTHER / "RiderNarrative2.docx",
        TEST_DOCS / "RiderNarrative.doc",
        TEST_DOCS / "RiderNarrative_WrongType.doc",  # a .docx named .doc
    ],
)
def test_riders_narratives(path: Path) -> None:
    got = read(path)
    assert got.dialect == RIDER and len(got.entries) == 15
    assert got.entries[0].source == "HMS Nonsuch"
    assert got.entries[4].text.startswith("[Beam:21] ")
    assert got.entries[5].text.startswith("[Brg:274] ")
    assert "\n" in got.entries[7].text
    assert got.entries[9].text.startswith("[Brg:92/112, Beam:12/13] ")
    assert got.entries[11].text.startswith("[Bearing represents arc (096-112). Not imported.]")
    assert got.entries[12].text.startswith("[DTG missing. Re-using previous DTG]")
    assert sum(e.bearing is not None for e in got.entries) == 7  # the cuts legacy Debrief made


def test_a_rider_document_with_a_bad_date_is_still_a_riders() -> None:
    assert read(TEST_DOCS / "BadDate1.docx").dialect == RIDER


def test_asw_data() -> None:
    got = read(OTHER / "ASW Data Format.docx")
    assert got.dialect == ASW and len(got.fixes) == 28  # testReadRealDocument
