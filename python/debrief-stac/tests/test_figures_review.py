"""Exported images, after the expert panel's review and the product owner's answers (16 Oct 2026).

Each test here fails without the fix it holds: a footer naming one export, not every
export of a revision; every picture of a document read; compressed text capped; a
document's unreadable pictures skipped and said; the catalogue's items saying which
revisions their plots had; the analyst's own export log for a read-only catalogue; the
plot's export log capped; an export's time checked before anything is written; a plot
whose history is damaged still exported; the Tote of an earlier revision.
"""

import io
import json
import struct
import zipfile
import zlib
from pathlib import Path

import pytest

from debrief_config.exports import append_export, export_log_path, read_export_log
from debrief_schemas import models
from debrief_stac import Catalogue, Changes, figures
from debrief_stac import catalogue as catalogue_module
from debrief_stac.figures import (
    MAX_TEXT,
    _inflate,
    figure_for,
    figure_ids_in,
    find_sources,
    log_export,
    new_figure_id,
    parse_figure_id,
    prepare_export,
    stamp_png,
    stamp_svg,
)
from debrief_stac.tote import tote

REVISION = "sha256:" + "ab" * 32
AGENT = models.AgentRef(kind="person", name="analyst")


def png() -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        crc = struct.pack(">I", zlib.crc32(kind + data))
        return struct.pack(">I", len(data)) + kind + data + crc

    rows = b"".join(b"\0" + b"\x80\x80\x80" * 4 for _ in range(3))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 4, 3, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


def record(n: int) -> models.ProvRecord:
    return models.ProvRecord(
        id=f"op-{n}", kind="edit", started_at="2026-10-11T10:00:00.000Z", agent=AGENT
    )


def track(name: str, lon: float) -> models.TrackFeature:
    return models.TrackFeature(
        type="Feature",
        id=f"track-{name.lower()}",
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[lon, 50.0], [lon - 0.1, 50.1]]
        ),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=["2026-10-11T09:30:00.000Z", "2026-10-11T09:31:00.000Z"],
        ),
    )


def details() -> models.PlotFeature:
    return models.PlotFeature(
        type="Feature",
        id="plot",
        geometry=None,
        properties=models.PlotProperties(kind="plot", title="Serial 1"),
    )


def export_details(**given) -> dict:
    return {
        "format": "png",
        "footer": True,
        "file": "serial-1.png",
        "at": "2026-10-16T14:05:00.000Z",
        "by": "analyst",
        "time": {
            "current": "2026-10-11T09:30:30.000Z",
            "range": {"start": "2026-10-11T09:30:00.000Z", "end": "2026-10-11T09:31:00.000Z"},
        },
        **given,
    }


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Serial 1")
    catalogue.commit("p", [record(1)], Changes(added=[details(), track("BLUE", -4.0)]))
    return catalogue


# --- H1: the footer names one export, and several matching are listed, never picked ---


def test_two_exports_of_one_revision_have_different_footers() -> None:
    first = new_figure_id("ex", "p", REVISION, b"\x00\x00\x00\x00\x00")
    third = new_figure_id("ex", "p", REVISION, b"\xff\x00\x00\x00\x00")
    assert first.short != third.short
    assert parse_figure_id(first.short).names_export(first.text)
    assert not parse_figure_id(first.short).names_export(third.text)


def test_typing_a_footer_opens_its_own_export_not_the_last(catalogue: Catalogue) -> None:
    revision = catalogue.history("p").head().plot_hash
    first = new_figure_id("ex", "p", revision, b"\x10\x00\x00\x00\x00")
    third = new_figure_id("ex", "p", revision, b"\xf0\x00\x00\x00\x00")
    for figure, viewport in ((first, [-4.2, 49.9, -3.8, 50.2]), (third, [-5, 49, -3, 51])):
        _, entry = prepare_export(
            catalogue, "p", figure.text, png(), export_details(viewport={"bbox": viewport})
        )
        log_export(catalogue, "p", entry)
    found = find_sources([(None, None, catalogue)], parse_figure_id(first.short))
    assert [s.export.id for s in found] == [first.text]
    assert found[0].export.viewport.bbox == [-4.2, 49.9, -3.8, 50.2]


def test_a_footer_naming_several_exports_lists_them_all(catalogue: Catalogue) -> None:
    """Two exports whose IDs share their first ten export bits: both are offered."""
    revision = catalogue.history("p").head().plot_hash
    one = new_figure_id("ex", "p", revision, b"\x12\x30\x00\x00\x00")
    two = new_figure_id("ex", "p", revision, b"\x12\x3f\xff\xff\xff")
    assert one.short == two.short and one.text != two.text
    for figure, at in ((one, "2026-10-16T14:05:00.000Z"), (two, "2026-10-16T14:06:00.000Z")):
        _, entry = prepare_export(catalogue, "p", figure.text, png(), export_details(at=at))
        log_export(catalogue, "p", entry)
    found = find_sources([(None, None, catalogue)], parse_figure_id(one.short))
    assert sorted(s.export.id for s in found) == sorted([one.text, two.text])


# --- H2: each picture of a document read on its own ---------------------------------


def test_every_figure_in_a_word_file_is_found() -> None:
    """Word keeps an SVG with a PNG to fall back on: a PNG with no ID, SVG A, a PNG of
    its own (C) and SVG B. All three IDs are found."""
    a = new_figure_id("ex", "p", REVISION, b"\x0a" * 5)
    b = new_figure_id("ex", "p", REVISION, b"\x0b" * 5)
    c = new_figure_id("ex", "p", REVISION, b"\x0c" * 5)
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"></svg>'
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", "<w:document/>")
        archive.writestr("word/media/image1.png", png())
        archive.writestr("word/media/image2.svg", stamp_svg(svg, a))
        archive.writestr("word/media/image3.png", stamp_png(png(), c))
        archive.writestr("word/media/image4.svg", stamp_svg(svg, b))
    found = figure_ids_in(out.getvalue(), "report.docx").ids
    assert [(t, w.split(": ")[1]) for t, w in found] == [
        (a.text, "word/media/image2.svg"),
        (c.text, "word/media/image3.png"),
        (b.text, "word/media/image4.svg"),
    ]


# --- M3: compressed text capped, and reading stops at the first ID ------------------


def test_compressed_text_is_inflated_to_64_kb_at_most() -> None:
    assert len(_inflate(zlib.compress(b"0" * 10_000_000))) == MAX_TEXT == 64 * 1024


def test_a_png_is_read_to_its_first_id_only() -> None:
    one = new_figure_id("ex", "p", REVISION, b"\x01" * 5)
    two = new_figure_id("ex", "p", REVISION, b"\x02" * 5)
    first = stamp_png(png(), one)
    # A second, later iTXt chunk with another ID, as a program appending its own might add.
    body = b"debrief:other\0\0\0\0\0" + two.text.encode()
    chunk = (
        struct.pack(">I", len(body))
        + b"iTXt"
        + body
        + struct.pack(">I", zlib.crc32(b"iTXt" + body))
    )
    data = first[:-12] + chunk + first[-12:]
    assert [t for t, _ in figure_ids_in(data).ids] == [one.text]


# --- M4: a document's unreadable pictures skipped, and said -------------------------


def _patched(data: bytes, name: bytes, flag: int | None = None, method: int | None = None) -> bytes:
    """A zip with one member's encryption flag or compression method changed in both
    its local and its central header."""
    data = bytearray(data)
    for signature, flag_at, method_at, name_at in (
        (b"PK\x03\x04", 6, 8, 30),
        (b"PK\x01\x02", 8, 10, 46),
    ):
        at = 0
        while (at := data.find(signature, at)) >= 0:
            if data[at + name_at : at + name_at + len(name)] == name:
                if flag is not None:
                    data[at + flag_at] |= flag
                if method is not None:
                    data[at + method_at : at + method_at + 2] = struct.pack("<H", method)
            at += 4
    return bytes(data)


def test_encrypted_and_unreadable_pictures_are_skipped_and_said() -> None:
    a = new_figure_id("ex", "p", REVISION, b"\x0a" * 5)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as archive:
        archive.writestr("ppt/media/image1.png", stamp_png(png(), a))
        archive.writestr("ppt/media/image2.png", png())
        archive.writestr("ppt/media/image3.png", png())
    data = _patched(out.getvalue(), b"ppt/media/image2.png", flag=1)
    data = _patched(data, b"ppt/media/image3.png", method=99)
    found = figure_ids_in(data, "brief.pptx")
    assert [t for t, _ in found.ids] == [a.text]
    assert found.skipped == [
        ("brief.pptx: ppt/media/image2.png", "the picture is encrypted"),
        (
            "brief.pptx: ppt/media/image3.png",
            "the picture is compressed in a way Debrief cannot read",
        ),
    ]
    assert figure_ids_in(b"PK\x03\x04 not a zip", "x.docx").skipped[0][0] == "x.docx"


# --- M6: items say which revisions their plots had; others are never read ----------


def test_an_item_lists_its_revisions_and_others_are_not_read(
    catalogue: Catalogue, monkeypatch: pytest.MonkeyPatch
) -> None:
    catalogue.create_plot("q", "Serial 2")
    catalogue.commit("q", [record(1)], Changes(added=[details(), track("RED", -3.0)]))
    figure = figure_for(catalogue, "p")
    listed = catalogue.read_item("p").properties.debrief_revisions
    assert listed == [parse_figure_id(figure.text).revision]
    real = Catalogue.history

    def history(self: Catalogue, item_id: str):
        assert item_id != "q", "a plot whose item says it never had the revision was read"
        return real(self, item_id)

    monkeypatch.setattr(Catalogue, "history", history)
    # By its revision alone (a copy): every item is looked at, only p's plot is read.
    copy = new_figure_id("other", "p", catalogue.read_item("p").properties.debrief_revision)
    assert [
        s.item for s in find_sources([(None, None, catalogue)], parse_figure_id(copy.text))
    ] == ["p"]


# --- Q2: a read-only catalogue's exports in the analyst's own log -------------------


def test_a_read_only_catalogues_export_is_in_the_analysts_own_log(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    log = export_log_path(tmp_path / "config" / "config.json")
    log.parent.mkdir()
    figure = figure_for(catalogue, "p")
    _, entry = prepare_export(catalogue, "p", figure.text, png(), export_details())
    logged = log_export(
        catalogue,
        "p",
        entry,
        read_only="Exercise is read-only",
        user_log=lambda e: append_export(e, log),
    )
    assert logged.where == "user" and "your own export log" in logged.note
    view, _ = catalogue.read_view("p")
    assert view is None or not view.exports, "the plot's island is not written"
    own = read_export_log(log)
    assert [(e.catalogue, e.item, e.export.id) for e in own] == [("ex", "p", figure.text)]
    found = find_sources([(None, None, catalogue)], parse_figure_id(figure.short), own)
    assert found[0].export is not None and found[0].export.id == figure.text


# --- Q7: the export logs are capped -----------------------------------------------------


def test_the_plots_export_log_keeps_the_newest(
    catalogue: Catalogue, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(catalogue_module, "PLOT_LOG_LIMIT", 3)
    ids = []
    for _ in range(5):
        figure = figure_for(catalogue, "p")
        _, entry = prepare_export(catalogue, "p", figure.text, png(), export_details())
        log_export(catalogue, "p", entry)
        ids.append(figure.text)
    view, _ = catalogue.read_view("p")
    assert [e.id for e in view.exports] == ids[-3:]
    assert figures.PLOT_LOG_LIMIT == 500


def test_the_analysts_own_log_keeps_the_newest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from debrief_config import exports

    monkeypatch.setattr(exports, "EXPORT_LOG_LIMIT", 2)
    log = tmp_path / "exports.json"
    for n in range(4):
        figure = new_figure_id("ex", "p", REVISION, bytes([n]) * 5)
        entry = models.ImageExport(
            id=figure.text,
            revision=REVISION,
            at="2026-10-16T14:05:00.000Z",
            format="png",
            footer=True,
        )
        append_export(models.LoggedExport(catalogue="ex", item="p", export=entry), log)
    assert [e.export.id[-3:] for e in read_export_log(log)] == [
        new_figure_id("ex", "p", REVISION, bytes([n]) * 5).text[-3:] for n in (2, 3)
    ]


# --- An export's time and area checked before anything is written ------------------


def test_an_export_whose_time_is_outside_its_window_is_refused(catalogue: Catalogue) -> None:
    figure = figure_for(catalogue, "p")
    bad = {
        "current": "2026-10-11T12:00:00.000Z",
        "range": {"start": "2026-10-11T09:30:00.000Z", "end": "2026-10-11T09:31:00.000Z"},
    }
    with pytest.raises(ValueError, match="current time is outside the range"):
        prepare_export(catalogue, "p", figure.text, png(), export_details(time=bad))


# --- A plot whose history is damaged still exports, named by its content ------------


def test_a_plot_whose_history_is_damaged_is_exported_and_traced(catalogue: Catalogue) -> None:
    path = Path(catalogue.store.root) / "p" / "plot.geojson"
    document = json.loads(path.read_text())
    document["history"]["steps"][0]["step_hash"] = "sha256:" + "0" * 64  # its chain broken
    path.write_text(json.dumps(document))
    history = catalogue.history("p")
    assert history.problem() is not None
    figure = figure_for(catalogue, "p")
    assert parse_figure_id(figure.text).names_revision(history.head().plot_hash)
    _, entry = prepare_export(catalogue, "p", figure.text, png(), export_details())
    shown, _ = catalogue.revision_shown("p", entry.revision)
    assert {f.id for f in shown.features} >= {"track-blue"}
    found = find_sources([(None, None, catalogue)], parse_figure_id(figure.text))
    assert [s.item for s in found] == ["p"]


# --- Q6: the Tote of an earlier revision --------------------------------------------


def test_the_tote_of_an_earlier_revision_is_of_the_plot_then(catalogue: Catalogue) -> None:
    catalogue.commit("p", [record(2)], Changes(added=[track("RED", -3.9)]))
    then = catalogue.history("p").head().plot_hash
    moved = track("RED", -2.0)
    catalogue.commit("p", [record(3)], Changes(modified=[moved]))
    view = {"primary": "track-blue", "secondaries": ["track-red"]}
    at = "2026-10-11T09:30:30.000Z"
    now = tote(catalogue, "p", at, view)
    earlier = tote(catalogue, "p", at, view, revision=then)
    range_now = now["rows"][0]["values"][0]["value"]
    range_then = earlier["rows"][0]["values"][0]["value"]
    assert range_then < range_now
