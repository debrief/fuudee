"""Images exported from Debrief carry an ID tracing them to their plot (SUB-25, EXT-05, OUT-04).

The ID names the plot and the exact revision exported (decision, product owner, 16 Oct
2026); these tests hold the format to the vectors both languages share, read the ID back
from the PNG and SVG written (and from a Word file the PNG is put into), find the plot by
the ID read from an image and by its short form typed from a footer, show an earlier
revision exactly as it was, and keep the export log out of the history.
"""

import io
import json
import struct
import zlib
from pathlib import Path
from xml.etree import ElementTree

import pytest

from debrief_schemas import DocumentKind, dump_document, models
from debrief_stac import Catalogue, Changes
from debrief_stac.figures import (
    ITXT_KEYWORD,
    XMP_KEYWORD,
    FigureIdError,
    figure_for,
    figure_ids_in,
    find_sources,
    log_export,
    new_figure_id,
    parse_figure_id,
    plot_key,
    prepare_export,
    stamp_png,
    stamp_svg,
)
from debrief_stac.history import text_hash

ROOT = Path(__file__).resolve().parents[3]
VECTORS = json.loads((ROOT / "schemas" / "vectors" / "figure-ids.json").read_text())
AGENT = models.AgentRef(kind="person", name="analyst")


# --- The format, held to the shared vectors ---------------------------------------------


@pytest.mark.parametrize("case", VECTORS["encode"], ids=lambda c: c["item"])
def test_ids_are_encoded_as_the_vectors_say(case: dict) -> None:
    figure = new_figure_id(
        case["catalogue"], case["item"], case["revision"], bytes.fromhex(case["export_hex"])
    )
    assert plot_key(case["catalogue"], case["item"]) == case["plot_key"]
    assert figure.text == case["id"]
    assert figure.short == case["short"]
    # Read back, in full and short, it names the same plot and revision.
    assert parse_figure_id(figure.text).text == figure.text
    short = parse_figure_id(figure.short)
    assert short.names_plot(case["plot_key"]) and short.names_revision(case["revision"])


@pytest.mark.parametrize("case", VECTORS["parse"], ids=lambda c: repr(c["typed"]))
def test_ids_are_read_as_typed_as_the_vectors_say(case: dict) -> None:
    if "problem" in case:
        with pytest.raises(FigureIdError) as raised:
            parse_figure_id(case["typed"])
        assert raised.value.code == case["problem"]
        return
    ref = parse_figure_id(case["typed"])
    assert ("full" if ref.full else "short") == case["kind"]
    assert ref.text == case["id"]
    assert ref.short == case["short"]


def test_every_single_symbol_mistyped_is_caught() -> None:
    """Luhn mod 32: any one symbol of the short form typed wrong is never another ID."""
    short = VECTORS["encode"][2]["short"].replace("-", "")[3:]
    alphabet = VECTORS["alphabet"]
    for at in range(len(short)):
        for symbol in alphabet:
            if symbol == short[at]:
                continue
            with pytest.raises(FigureIdError):
                parse_figure_id(short[:at] + symbol + short[at + 1 :])


# --- Writing the ID into images, and reading it back ----------------------------------


def png(width: int = 4, height: int = 3) -> bytes:
    """A small, valid PNG: grey pixels."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    rows = b"".join(b"\0" + b"\x80\x80\x80" * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


def chunks(data: bytes) -> list[tuple[bytes, bytes]]:
    """Each chunk of a PNG, its CRC checked."""
    out, at = [], 8
    while at < len(data):
        (length,) = struct.unpack(">I", data[at : at + 4])
        kind, body = data[at + 4 : at + 8], data[at + 8 : at + 8 + length]
        (crc,) = struct.unpack(">I", data[at + 8 + length : at + 12 + length])
        assert crc == zlib.crc32(kind + body), kind
        out.append((kind, body))
        at += 12 + length
    return out


FIGURE = new_figure_id("ex", "p", "sha256:" + "ab" * 32, b"\x01\x02\x03\x04\x05")


def test_a_png_carries_its_id_in_itxt_and_in_xmp() -> None:
    stamped = stamp_png(png(), FIGURE, "2026-10-16T14:05:00.000Z")
    kinds = [k for k, _ in chunks(stamped)]
    assert kinds[0] == b"IHDR" and kinds[-1] == b"IEND" and b"IDAT" in kinds
    texts = {
        body.split(b"\0", 1)[0].decode(): body for kind, body in chunks(stamped) if kind == b"iTXt"
    }
    assert texts[ITXT_KEYWORD].endswith(FIGURE.text.encode())
    xmp = texts[XMP_KEYWORD].split(b"\0", 5)[-1].decode()
    assert f"<dc:identifier>{FIGURE.text}</dc:identifier>" in xmp
    assert f"<debrief:short>{FIGURE.short}</debrief:short>" in xmp
    # Before the image data, so readers that stop there still find them.
    assert kinds.index(b"iTXt") < kinds.index(b"IDAT")
    assert figure_ids_in(stamped).ids == [(FIGURE.text, "the image")]
    # Stamped again (exported once more), the old ID is replaced, not added to.
    again = new_figure_id("ex", "p", "sha256:" + "ab" * 32, b"\x09" * 5)
    restamped = stamp_png(stamped, again)
    assert [t for t, _ in figure_ids_in(restamped).ids] == [again.text]
    assert sum(1 for k, _ in chunks(restamped) if k == b"iTXt") == 2


def test_the_id_is_found_where_only_the_xmp_survives() -> None:
    """An office program that keeps XMP but drops other chunks: still traced."""
    stamped = stamp_png(png(), FIGURE)
    kept = [
        (k, b)
        for k, b in chunks(stamped)
        if not (k == b"iTXt" and b.startswith(ITXT_KEYWORD.encode()))
    ]
    rebuilt = b"\x89PNG\r\n\x1a\n" + b"".join(
        struct.pack(">I", len(b)) + k + b + struct.pack(">I", zlib.crc32(k + b)) for k, b in kept
    )
    assert [t for t, _ in figure_ids_in(rebuilt).ids] == [FIGURE.text]
    # And with no metadata at all, nothing is found.
    assert figure_ids_in(png()).ids == []


def test_an_svg_carries_its_id_in_its_metadata() -> None:
    svg = (
        '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'
        '<rect width="10" height="10"/></svg>'
    )
    stamped = stamp_svg(svg, FIGURE)
    root = ElementTree.fromstring(stamped)  # still well-formed XML
    metadata = root.find("{http://www.w3.org/2000/svg}metadata")
    assert metadata is not None and metadata.get("id") == "debrief-figure"
    identifier = metadata.find(".//{http://purl.org/dc/elements/1.1/}identifier")
    assert identifier is not None and identifier.text == FIGURE.text
    assert figure_ids_in(stamped.encode()).ids == [(FIGURE.text, "the image")]
    # Stamped again: one metadata element, the new ID.
    again = new_figure_id("ex", "p", "sha256:" + "ab" * 32, b"\x09" * 5)
    restamped = stamp_svg(stamped, again)
    assert restamped.count('<metadata id="debrief-figure">') == 1
    assert [t for t, _ in figure_ids_in(restamped.encode()).ids] == [again.text]


def test_a_png_put_into_a_word_file_still_traces() -> None:
    """python-docx keeps a picture's bytes as they are: the ID is found picture by picture."""
    docx = pytest.importorskip("docx")
    document = docx.Document()
    document.add_paragraph("Figure 1. The closest approach.")
    document.add_picture(io.BytesIO(stamp_png(png(), FIGURE)))
    saved = io.BytesIO()
    document.save(saved)
    found = figure_ids_in(saved.getvalue(), "report.docx").ids
    assert len(found) == 1 and found[0][0] == FIGURE.text
    assert found[0][1].startswith("report.docx: word/media/")


def test_pictures_in_an_opendocument_or_pptx_file_are_read_too() -> None:
    """LibreOffice keeps pictures under Pictures/; PowerPoint under ppt/media/. Compressed
    in the zip, the ID is found only by reading each picture."""
    import zipfile

    for name in ("Pictures/1000.png", "ppt/media/image1.png"):
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("content.xml", "<office/>")
            archive.writestr(name, stamp_png(png(), FIGURE))
        found = figure_ids_in(out.getvalue(), "brief").ids
        assert found == [(FIGURE.text, f"brief: {name}")]


# --- Plots, revisions and the export log -----------------------------------------------


def record(n: int, note: str = "edit") -> models.ProvRecord:
    return models.ProvRecord(
        id=f"op-{n}",
        kind="edit",
        started_at="2026-10-11T10:00:00.000Z",
        agent=AGENT,
        notes=[note],
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


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Serial 1")
    catalogue.commit("p", [record(1)], Changes(added=[details(), track("BLUE", -4.0)]))
    return catalogue


def export_details(**given) -> dict:
    return {
        "format": "png",
        "footer": True,
        "file": "serial-1.png",
        "preset": "slide",
        "theme": "light",
        "width": 4,
        "height": 3,
        "at": "2026-10-16T14:05:00.000Z",
        "by": "analyst",
        "viewport": {"bbox": [-4.2, 49.9, -3.8, 50.2]},
        "time": {
            "current": "2026-10-11T09:30:30.000Z",
            "range": {"start": "2026-10-11T09:30:00.000Z", "end": "2026-10-11T09:31:00.000Z"},
        },
        **given,
    }


def test_an_export_is_logged_in_the_island_and_is_never_a_step(catalogue: Catalogue) -> None:
    history = catalogue.history("p")
    head = history.head()
    figure = figure_for(catalogue, "p")
    stamped, entry = prepare_export(catalogue, "p", figure.text, png(), export_details())
    assert figure_ids_in(stamped).ids[0][0] == figure.text
    assert entry.revision == head.plot_hash
    assert log_export(catalogue, "p", entry).where == "plot"
    # The log is in the island: the revision, the steps and the content hash are as they were.
    assert history.head() == head
    assert len(history.steps()) == 1
    view, _ = catalogue.read_view("p")
    assert [e.id for e in view.exports] == [figure.text]
    assert view.exports[0].viewport.bbox == [-4.2, 49.9, -3.8, 50.2]
    # The item's revision (what flags products for review) is unchanged too.
    assert catalogue.read_item("p").properties.debrief_revision in (None, head.plot_hash)
    # Undo cannot take an export back: there is nothing in the history to undo.
    assert all("export" not in " ".join(r.notes or []) for s in history.steps() for r in s.records)


def test_an_export_is_refused_for_another_plot_or_the_wrong_format(catalogue: Catalogue) -> None:
    other = new_figure_id("ex", "q", catalogue.history("p").head().plot_hash)
    with pytest.raises(FigureIdError, match="another plot"):
        prepare_export(catalogue, "p", other.text, png(), export_details())
    figure = figure_for(catalogue, "p")
    with pytest.raises(ValueError, match="not the SVG"):
        prepare_export(catalogue, "p", figure.text, png(), export_details(format="svg"))
    with pytest.raises(FigureIdError, match="in full"):
        prepare_export(catalogue, "p", figure.short, png(), export_details())


def test_an_image_traces_to_its_revision_after_the_plot_changes(catalogue: Catalogue) -> None:
    exported_at = catalogue.history("p").head()
    figure = figure_for(catalogue, "p")
    _, entry = prepare_export(catalogue, "p", figure.text, png(), export_details())
    log_export(catalogue, "p", entry)
    # The analyst carries on: two more steps.
    plot = catalogue.read_plot("p")
    catalogue.commit("p", [record(2, "RED added")], Changes(added=[track("RED", -3.0)]))
    catalogue.commit("p", [record(3, "GREEN added")], Changes(added=[track("GREEN", -2.0)]))
    stores = [("exercise", "Exercise", catalogue)]
    # By the ID read from the image...
    found = find_sources(stores, parse_figure_id(figure_ids_in(stamp_png(png(), figure)).ids[0][0]))
    assert len(found) == 1
    source = found[0]
    assert (source.item, source.revision, source.step, source.current) == (
        "p",
        exported_at.plot_hash,
        1,
        3,
    )
    assert not source.copied and source.export is not None and source.export.id == figure.text
    # ...and by its short form, typed from the footer: the same plot and step.
    typed = find_sources(stores, parse_figure_id(figure.short.lower().replace("-", " ")))
    assert [(s.item, s.step) for s in typed] == [("p", 1)]
    assert typed[0].export is not None and typed[0].export.id == figure.text
    # Shown as it was: rebuilt by replay, exactly the content then.
    shown, step = catalogue.revision_shown("p", source.revision)
    assert step == 1
    assert text_hash(dump_document(DocumentKind.PLOT, shown)) == exported_at.plot_hash
    assert [f.id for f in shown.features] == [f.id for f in plot.features]
    assert {f.id for f in catalogue.read_plot("p").features} > {f.id for f in shown.features}


def test_a_copy_in_another_catalogue_is_found_by_its_revision(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    figure = figure_for(catalogue, "p")
    other = Catalogue.create(tmp_path / "other", "colleague", "Colleague", "Test")
    text = (Path(catalogue.store.root) / "p" / "plot.geojson").read_text()
    copy_path = tmp_path / "sent.geojson"
    copy_path.write_text(text)
    other.add_plot_file(copy_path, AGENT)
    found = find_sources([(None, None, other)], parse_figure_id(figure.short))
    assert len(found) == 1 and found[0].copied
    # Where the plot itself is there too, it is the one found, not the copy.
    both = find_sources(
        [(None, None, other), (None, None, catalogue)], parse_figure_id(figure.text)
    )
    assert [(s.catalogue.id, s.copied) for s in both] == [("ex", False)]


def test_an_id_naming_no_plot_finds_nothing(catalogue: Catalogue) -> None:
    stranger = new_figure_id("ex", "p", "sha256:" + "cd" * 32)
    assert find_sources([(None, None, catalogue)], parse_figure_id(stranger.text)) == []


def test_exporting_an_earlier_revision_names_that_revision(catalogue: Catalogue) -> None:
    first = catalogue.history("p").head().plot_hash
    catalogue.commit("p", [record(2, "RED added")], Changes(added=[track("RED", -3.0)]))
    figure = figure_for(catalogue, "p", first)
    assert parse_figure_id(figure.text).names_revision(first)
    with pytest.raises(Exception, match="no step at that revision"):
        figure_for(catalogue, "p", "sha256:" + "ee" * 32)
