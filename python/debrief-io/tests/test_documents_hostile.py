"""Documents from elsewhere: each reader refuses a hostile or runaway file, in words, and
quickly, rather than exhausting the host's memory or time. Every case is made here, small;
the limits are lowered where a real attack would need a large file."""

import io
import shutil
import struct
import time
import zipfile
import zlib
from pathlib import Path

import olefile
import pytest
from synthetic_docs import _pdf_file, pdf

import debrief_io.documents as documents
from debrief_io.documents import DocumentError, DocumentTooLarge, file_bytes, read_document

DATA = Path(__file__).parent / "data"
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def docx_of(xml: str | bytes, *extra: tuple[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", xml)
        for name, data in extra:
            archive.writestr(name, data)
    return out.getvalue()


def paragraphs(n: int) -> bytes:
    unit = b"<w:p><w:r><w:t>entry</w:t></w:r></w:p>"
    return b"<w:document " + W.encode() + b"><w:body>" + unit * n + b"</w:body></w:document>"


# --- .docx ---------------------------------------------------------------------------


def test_a_docx_whose_text_unpacks_too_large_is_refused_before_unpacking(monkeypatch) -> None:
    monkeypatch.setattr(documents, "MAX_XML_BYTES", 100_000)
    data = docx_of(paragraphs(10_000))  # 390 KB of XML in some 3 KB
    assert len(data) < 10_000
    with pytest.raises(DocumentTooLarge, match="unpacks to"):
        read_document("bomb.docx", data)


def test_a_docx_that_lies_about_its_unpacked_size_is_refused_as_damaged() -> None:
    data = bytearray(docx_of(paragraphs(10_000)))
    # Every record of word/document.xml says it unpacks to 100 bytes.
    for signature, at in ((b"PK\x03\x04", 22), (b"PK\x01\x02", 24)):
        start = data.find(signature)
        struct.pack_into("<I", data, start + at, 100)
    with pytest.raises(DocumentError, match="damaged"):
        read_document("liar.docx", bytes(data))


def test_a_docx_listing_a_great_many_parts_is_refused_before_they_are_listed(
    monkeypatch,
) -> None:
    monkeypatch.setattr(documents, "MAX_ZIP_DIRECTORY", 10_000)
    many = [(f"x/{i}", b"") for i in range(1_000)]
    with pytest.raises(DocumentTooLarge, match="zip directory"):
        read_document("parts.docx", docx_of(paragraphs(1), *many))


def test_zip_directory_size_reads_the_end_record() -> None:
    data = docx_of(paragraphs(1), ("a", b""), ("b", b""))
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        listed = sum(
            46 + len(i.filename) + len(i.extra) + len(i.comment) for i in archive.infolist()
        )
    assert documents.zip_directory_size(data) == listed
    assert documents.zip_directory_size(b"PK\x03\x04 no end record") is None


def test_deeply_nested_xml_is_refused_quickly() -> None:
    depth = 100_000
    xml = (
        f"<w:document {W}><w:body>"
        + "<w:tbl><w:tr><w:tc>" * depth
        + "<w:p/>"
        + "</w:tc></w:tr></w:tbl>" * depth
        + "</w:body></w:document>"
    )
    started = time.monotonic()
    with pytest.raises(DocumentTooLarge, match="nests more than"):
        read_document("deep.docx", docx_of(xml))
    assert time.monotonic() - started < 2


def test_too_many_paragraphs_are_refused(monkeypatch) -> None:
    monkeypatch.setattr(documents, "MAX_PARAGRAPHS", 1_000)
    with pytest.raises(DocumentTooLarge, match="1,000 paragraphs"):
        read_document("long.docx", docx_of(paragraphs(1_001)))
    assert len(read_document("ok.docx", docx_of(paragraphs(999))).paragraphs) == 999


def test_external_entities_and_zip_paths_reach_nothing_outside() -> None:
    with pytest.raises(DocumentError, match="document type declaration"):
        read_document(
            "xxe.docx",
            docx_of(
                f'<?xml version="1.0"?><!DOCTYPE d SYSTEM "file:///etc/passwd"><w:document {W}/>'
            ),
        )
    # Parts named outside the archive are never opened, let alone written anywhere.
    doc = read_document(
        "paths.docx", docx_of(paragraphs(1), ("../../evil", b"x"), ("/etc/evil", b"x"))
    )
    assert doc.paragraphs == ["entry"]


# --- .doc ----------------------------------------------------------------------------


def rewritten_doc(tmp_path: Path, change) -> bytes:
    """The synthetic .doc with its WordDocument and table streams changed in place."""
    path = tmp_path / "changed.doc"
    shutil.copy(DATA / "synthetic-narrative.doc", path)
    with olefile.OleFileIO(str(path), write_mode=True) as ole:
        word = bytearray(ole.openstream("WordDocument").read())
        name = "1Table" if struct.unpack_from("<H", word, 0x0A)[0] & 0x200 else "0Table"
        table = bytearray(ole.openstream(name).read())
        change(word, table)
        ole.write_stream("WordDocument", bytes(word))
        ole.write_stream(name, bytes(table))
    return path.read_bytes()


def piece_table(word: bytearray, table: bytearray, text_cps: int) -> None:
    """A piece table filling the table stream, every piece the whole WordDocument stream
    again: before the limits, a 20 KB file read as millions of characters."""
    n = (len(table) - 9) // 12
    clx = bytearray(b"\x02" + struct.pack("<I", 4 + 12 * n))
    clx += b"".join(struct.pack("<I", i * len(word)) for i in range(n + 1))
    clx += (b"\0\0" + struct.pack("<I", 0x40000000) + b"\0\0") * n
    table[: len(clx)] = clx
    struct.pack_into("<II", word, 0x1A2, 0, len(clx))
    struct.pack_into("<I", word, 0x4C, text_cps)
    struct.pack_into("<II", word, 0x102, 0, 0)


def test_a_doc_whose_pieces_read_its_text_again_and_again_is_refused(tmp_path) -> None:
    data = rewritten_doc(tmp_path, lambda w, t: piece_table(w, t, 0xFFFFFFF0))
    with pytest.raises(DocumentError, match="claims more text than it holds"):
        read_document("pieces.doc", data)


def test_a_doc_reads_no_more_characters_than_its_stream_holds(tmp_path) -> None:
    holds = []
    data = rewritten_doc(tmp_path, lambda w, t: (piece_table(w, t, len(w)), holds.append(len(w))))
    doc = read_document("pieces.doc", data)
    assert sum(map(len, doc.paragraphs)) <= holds[0]


def test_a_doc_whose_piece_table_is_out_of_order_is_damaged(tmp_path) -> None:
    def backwards(word: bytearray, table: bytearray) -> None:
        clx = b"\x02" + struct.pack("<I", 4 + 12 * 2) + struct.pack("<III", 0, 50, 10)
        clx += (b"\0\0" + struct.pack("<I", 0x40000000) + b"\0\0") * 2
        table[: len(clx)] = clx
        struct.pack_into("<II", word, 0x1A2, 0, len(clx))

    with pytest.raises(DocumentError, match="out of order"):
        read_document("backwards.doc", rewritten_doc(tmp_path, backwards))


def test_a_doc_naming_a_paragraph_page_many_times_reads_it_once(tmp_path) -> None:
    def repeated(word: bytearray, table: bytearray) -> None:
        clx_at, clx_len = struct.unpack_from("<II", word, 0x1A2)
        papx_at, papx_len = struct.unpack_from("<II", word, 0x102)
        first_page = struct.unpack_from("<I", table, papx_at + 8)[0]
        clx = bytes(table[clx_at : clx_at + clx_len])
        n = (len(table) - len(clx) - 4) // 8
        plc = b"".join(struct.pack("<I", i) for i in range(n + 1))
        plc += struct.pack("<I", first_page) * n
        table[: len(clx) + len(plc)] = clx + plc
        struct.pack_into("<II", word, 0x1A2, 0, len(clx))
        struct.pack_into("<II", word, 0x102, len(clx), len(plc))

    original = read_document("log.doc", (DATA / "synthetic-narrative.doc").read_bytes())
    doc = read_document("repeated.doc", rewritten_doc(tmp_path, repeated))
    assert doc.paragraphs == original.paragraphs


def test_damaged_docs_fail_cleanly_in_words() -> None:
    import random

    base = (DATA / "synthetic-narrative.doc").read_bytes()
    for seed in range(200):
        rng = random.Random(seed)
        data = bytearray(base)
        for _ in range(rng.randrange(1, 60)):
            data[rng.randrange(len(data))] = rng.randrange(256)
        started = time.monotonic()
        try:
            read_document("fuzzed.doc", bytes(data))
        except DocumentError:
            pass
        assert time.monotonic() - started < 2, seed


# --- PDF -----------------------------------------------------------------------------

FONT = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"


def flate(data: bytes) -> bytes:
    body = zlib.compress(data, 9)
    return (
        f"<< /Length {len(body)} /Filter /FlateDecode >>\nstream\n".encode()
        + body
        + (b"\nendstream")
    )


def pages_sharing(content: bytes, pages: int) -> bytes:
    """A PDF of so many pages, all drawing one content stream (object 4)."""
    kids = " ".join(f"{5 + i} 0 R" for i in range(pages))
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {pages} >>".encode(),
        FONT,
        flate(content),
    ]
    page = (
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>"
    )
    return _pdf_file(objects + [page] * pages)


def text_ops(n: int) -> bytes:
    return b"BT /F1 10 Tf 12 TL 40 800 Td\n" + b"(aaaa) Tj T*\n" * n + b"ET"


def test_a_page_showing_text_a_great_many_times_is_refused_quickly() -> None:
    # 3 MB of drawing packed in 8 KB: once some 30 seconds for pypdf, its time the
    # square of the page's text.
    data = pages_sharing(text_ops(250_000), 1)
    assert len(data) < 20_000
    started = time.monotonic()
    with pytest.raises(DocumentTooLarge, match="shows text more than 20,000 times"):
        read_document("dense.pdf", data)
    assert time.monotonic() - started < 10


def test_a_page_drawing_too_much_is_refused_before_it_is_read(monkeypatch) -> None:
    monkeypatch.setattr(documents, "MAX_PDF_PAGE_BYTES", 100_000)
    with pytest.raises(DocumentTooLarge, match="page 1 draws"):
        read_document("drawing.pdf", pages_sharing(b"0 0 1 1 re f\n" * 20_000, 1))


def test_a_stream_unpacking_past_the_limit_is_refused(monkeypatch) -> None:
    monkeypatch.setattr(documents, "MAX_PDF_STREAM", 1_000_000)
    with pytest.raises(DocumentTooLarge, match="too large to read safely"):
        read_document("bomb.pdf", pages_sharing(b" " * 5_000_000, 1))


def test_many_pages_sharing_one_drawing_stop_at_the_operations_limit(monkeypatch) -> None:
    monkeypatch.setattr(documents, "MAX_PDF_OPERATIONS", 50_000)
    with pytest.raises(DocumentTooLarge, match="50,000 operations"):
        read_document("shared.pdf", pages_sharing(text_ops(10_000), 50))


def test_too_many_pages_are_refused(monkeypatch) -> None:
    monkeypatch.setattr(documents, "MAX_PDF_PAGES", 10)
    with pytest.raises(DocumentTooLarge, match="PDF has 11 pages"):
        read_document("pages.pdf", pdf([f"line {i}" for i in range(11)], per_page=1))


def test_reading_stops_when_it_takes_too_long(monkeypatch) -> None:
    monkeypatch.setattr(documents, "MAX_SECONDS", 0.0)
    with pytest.raises(DocumentTooLarge, match="seconds to read"):
        read_document("slow.pdf", pdf(["0800 a line"] * 3, per_page=1))


def test_a_form_drawing_itself_returns() -> None:
    form = b"BT /F1 10 Tf (x) Tj ET /X0 Do /X0 Do"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
        FONT,
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font "
        b"<< /F1 3 0 R >> /XObject << /X0 6 0 R >> >> /Contents 5 0 R >>",
        b"<< /Length 13 >>\nstream\n/X0 Do /X0 Do\nendstream",
        b"<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /Font << /F1 3 0 R >> "
        b"/XObject << /X0 6 0 R >> >> /Length "
        + str(len(form)).encode()
        + b" >>\nstream\n"
        + form
        + b"\nendstream",
    ]
    started = time.monotonic()
    try:
        read_document("forms.pdf", _pdf_file(objects))
    except DocumentError:
        pass
    assert time.monotonic() - started < 5


# --- Any document ---------------------------------------------------------------------


def test_a_document_too_large_is_refused_before_it_is_read_into_memory(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(documents, "MAX_BYTES", 1_000)
    big = tmp_path / "big.pdf"
    big.write_bytes(pdf(["0800 line"] * 200))
    with pytest.raises(DocumentTooLarge, match="larger than"):
        file_bytes(big)
    rep = tmp_path / "big.rep"
    rep.write_bytes(b";NARRATIVE: " * 200)
    assert file_bytes(rep) == rep.read_bytes()  # not a document: read as before
