"""The text of a Word or PDF document, for the narrative dialects (CAP-19, EXT-04).

Legacy Debrief read documents with Apache POI (.doc, .docx) and PDFBox (.pdf). Here:

- .docx: the standard library's zipfile and expat, as the .dpf reader reads XML,
  refusing document type declarations and entities, so a hostile file cannot expand
  entities or reach outside itself. Text in every run, hidden or not (narrative
  documents hide their comma-separated metadata), tabs and line breaks kept.
- .doc (Word 97 to 2003): olefile, pure Python, for the compound file; its text from
  the piece table, and which paragraphs end a table's cells and rows from the
  paragraph properties, read here.
- .pdf: pypdf, pure Python, a page at a time, a line of text a line.

All three run under Pyodide, so the playground reads them too (CON-09). A file is
known by its first bytes, not its name: legacy Debrief met .docx files named .doc.

Documents come from elsewhere, so each reader has hard limits, each refused with a
reason rather than left to exhaust memory or time (a host's service, or the
playground's browser tab, would otherwise hang): the file's size; a .docx's zip
directory, its text part's size and how deeply its XML nests; a .doc's text no longer
than its stream holds; a PDF's pages, each page's drawing, the operations read and the
time taken; and, for all, the paragraphs and characters of text a narrative could need.
"""

from __future__ import annotations

import io
import os
import re
import struct
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from xml.parsers import expat

# A document larger than this is refused before it is read (zip bombs, runaway PDFs).
MAX_BYTES = 200 * 1024 * 1024
# The text a narrative could need, at most: a thousand-page log is some 3 million
# characters in some 50,000 paragraphs. More is refused, not read for minutes.
MAX_PARAGRAPHS = 500_000
MAX_CHARS = 20_000_000
# A .docx: its zip directory (a million empty entries cost a gigabyte to list), the
# size of its text part unpacked, and how deeply its XML nests (Word's own tables nest
# 63 deep at most).
MAX_ZIP_DIRECTORY = 4 * 1024 * 1024
MAX_XML_BYTES = 64 * 1024 * 1024
MAX_XML_DEPTH = 1_000
# A PDF: pages, a page's drawing instructions once unpacked (a page of text is some
# kilobytes; one stream may unpack to MAX_PDF_STREAM, a font or a picture), and the
# operations read in all; and, as a last resort, the time it takes.
MAX_PDF_PAGES = 10_000
MAX_PDF_PAGE_BYTES = 4 * 1024 * 1024
MAX_PDF_STREAM = 32 * 1024 * 1024
MAX_PDF_OPERATIONS = 5_000_000
# Text shown on one page, in operations: a dense page of text shows some thousands;
# pypdf's time grows with the square of a page's text, so this keeps a page to a second.
MAX_PDF_PAGE_TEXTS = 20_000
MAX_SECONDS = 60.0


class DocumentError(ValueError):
    """A document whose text could not be read, said in words an analyst can act on."""


class DocumentTooLarge(DocumentError):
    """A document past one of the limits: refused, as reading it could exhaust the host."""


def _too_much(what: str) -> DocumentTooLarge:
    return DocumentTooLarge(
        f"The {what}: more than a narrative needs, so it is not read. If it is a narrative, "
        "save the part that is as a document of its own and import that."
    )


class _Text:
    """The paragraphs read so far, counted against MAX_PARAGRAPHS and MAX_CHARS."""

    def __init__(self, paragraphs: list[str], what: str) -> None:
        self.paragraphs = paragraphs
        self.what = what
        self.chars = 0

    def add(self, paragraph: str) -> None:
        self.chars += len(paragraph)
        if len(self.paragraphs) >= MAX_PARAGRAPHS or self.chars > MAX_CHARS:
            raise _too_much(
                f"{self.what} holds more than {MAX_PARAGRAPHS:,} paragraphs or "
                f"{MAX_CHARS // 1_000_000} million characters of text"
            )
        self.paragraphs.append(paragraph)


@dataclass
class Document:
    """A document's text: its paragraphs in reading order (table cells' paragraphs
    among them, as legacy Debrief read a .doc), and its tables, each a list of rows of
    cells, each cell's paragraphs joined by line breaks."""

    format: str  # "docx", "doc" or "pdf"
    paragraphs: list[str] = field(default_factory=list)
    tables: list[list[list[str]]] = field(default_factory=list)

    @property
    def described(self) -> str:
        return {
            "docx": "Word document",
            "doc": "Word 97-2003 document",
            "pdf": "PDF",
        }[self.format]


def sniff(data: bytes) -> str | None:
    """Which kind of document the bytes are, by their first bytes: docx, doc, pdf, or None."""
    if data[:4] == b"PK\x03\x04":
        return "docx"
    if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return "doc"
    if b"%PDF-" in data[:1024]:
        return "pdf"
    return None


def read_document(name: str, data: bytes) -> Document:
    """The text of a .docx, .doc or .pdf file, known by its first bytes."""
    if len(data) > MAX_BYTES:
        raise DocumentError(f"{name} is larger than {MAX_BYTES // (1024 * 1024)} MB.")
    kind = sniff(data)
    readers = {"docx": read_docx, "doc": read_doc, "pdf": read_pdf}
    if kind is None:
        raise DocumentError(f"{name} is not a Word (.docx, .doc) or PDF document.")
    try:
        return readers[kind](data)
    except DocumentError:
        raise
    except MemoryError:
        what = "PDF" if kind == "pdf" else "Word document"
        raise _too_much(f"{what} needs more memory to read than there is") from None
    except Exception as error:  # a damaged file can fail its reader in many ways
        what = "PDF" if kind == "pdf" else "Word document"
        raise DocumentError(f"The {what} is damaged: {error}.") from None


def file_bytes(path: Path) -> bytes:
    """A file's bytes; DocumentTooLarge, before reading it into memory, for a document
    (known by its first bytes) larger than MAX_BYTES. Other files are read whole."""
    with path.open("rb") as stream:
        head = stream.read(1024)
        if sniff(head) is not None and os.fstat(stream.fileno()).st_size > MAX_BYTES:
            raise DocumentTooLarge(f"{path.name} is larger than {MAX_BYTES // (1024 * 1024)} MB.")
        return head + stream.read()


# --- .docx ---------------------------------------------------------------------------

_W = (
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "http://purl.oclc.org/ooxml/wordprocessingml/main",  # Strict Open XML
)


class _DocxReader:
    """Paragraphs and tables of word/document.xml, by expat, one pass."""

    def __init__(self) -> None:
        self.doc = Document("docx")
        self.out = _Text(self.doc.paragraphs, "Word document")
        self.text: list[str] | None = None  # the paragraph being read
        self.tables: list[list[list[list[str]]]] = []  # open tables: rows of cells of paragraphs
        self.in_text = False
        self.skip = 0  # inside text Word does not show as the paragraph's: text boxes, deletions
        self.depth = 0

    def start(self, tag: str, attrs: dict[str, str]) -> None:
        self.depth += 1
        if self.depth > MAX_XML_DEPTH:
            raise _too_much(f"Word document's XML nests more than {MAX_XML_DEPTH:,} deep")
        ns, _, local = tag.rpartition("}")
        if ns.lstrip("{") not in _W:
            return
        if local in ("txbxContent", "del", "instrText", "delText"):
            self.skip += 1
            return
        if self.skip:
            return
        if local == "p":
            self.text = []
        elif local == "t":
            self.in_text = True
        elif local == "tab" and self.text is not None:
            self.text.append("\t")
        elif local in ("br", "cr") and self.text is not None:
            self.text.append("\n")
        elif local == "noBreakHyphen" and self.text is not None:
            self.text.append("-")
        elif local == "tbl":
            self.tables.append([])
        elif local == "tr" and self.tables:
            self.tables[-1].append([])
        elif local == "tc" and self.tables and self.tables[-1]:
            self.tables[-1][-1].append([])

    def end(self, tag: str) -> None:
        self.depth -= 1
        ns, _, local = tag.rpartition("}")
        if ns.lstrip("{") not in _W:
            return
        if local in ("txbxContent", "del", "instrText", "delText"):
            self.skip -= 1
            return
        if self.skip:
            return
        if local == "t":
            self.in_text = False
        elif local == "p" and self.text is not None:
            paragraph = "".join(self.text)
            self.text = None
            self.out.add(paragraph)
            if self.tables and self.tables[-1] and self.tables[-1][-1]:
                self.tables[-1][-1][-1].append(paragraph)
        elif local == "tbl" and self.tables:
            table = self.tables.pop()
            rows = [["\n".join(cell) for cell in row] for row in table]
            if not self.tables:  # a table inside a table is read as its cell's text
                self.doc.tables.append(rows)

    def data(self, text: str) -> None:
        if self.in_text and not self.skip and self.text is not None:
            self.text.append(text)


def _refuse_dtd(*_args: object) -> None:
    raise DocumentError("The document holds a document type declaration, which is refused.")


def zip_directory_size(data: bytes) -> int | None:
    """The size of a zip's central directory, as its end record says (zip64's, if it has
    one), read before zipfile lists every entry in it; None if no end record is found."""
    end = b"PK\x05\x06"
    at = len(data) - 22 if data[-22:-18] == end else data.rfind(end, max(0, len(data) - 65_557))
    if at < 0 or at + 22 > len(data):
        return None
    size = _u32(data, at + 12)
    locator = at - 20
    if size == 0xFFFFFFFF or _u16(data, at + 10) == 0xFFFF:
        if locator < 0 or data[locator : locator + 4] != b"PK\x06\x07":
            return None
        record = struct.unpack_from("<Q", data, locator + 8)[0]
        if record + 56 > len(data) or data[record : record + 4] != b"PK\x06\x06":
            return None
        size = struct.unpack_from("<Q", data, record + 40)[0]
    return size


def read_docx(data: bytes) -> Document:
    directory = zip_directory_size(data)
    if directory is None:
        raise DocumentError("The Word document is damaged: it is not a readable .docx.")
    if directory > MAX_ZIP_DIRECTORY:
        raise _too_much(
            f"Word document lists more parts than a document has ({directory // 1024:,} KB "
            "of zip directory)"
        )
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise DocumentError("The Word document is damaged: it is not a readable .docx.") from None
    with archive:
        try:
            info = archive.getinfo("word/document.xml")
        except KeyError:
            raise DocumentError("This is a zip file, but not a Word document.") from None
        # zipfile unpacks no more than this declared size: a part that unpacks to more
        # fails its check and is refused as damaged.
        if info.file_size > MAX_XML_BYTES:
            raise _too_much(
                f"Word document's text unpacks to {info.file_size // (1024 * 1024):,} MB"
            )
        xml = archive.read(info)
    reader = _DocxReader()
    parser = expat.ParserCreate(namespace_separator="}")
    parser.StartDoctypeDeclHandler = _refuse_dtd
    parser.EntityDeclHandler = _refuse_dtd
    parser.StartElementHandler = lambda tag, attrs: reader.start("{" + tag, attrs)
    parser.EndElementHandler = lambda tag: reader.end("{" + tag)
    parser.CharacterDataHandler = reader.data
    try:
        parser.Parse(xml, True)
    except expat.ExpatError as error:
        raise DocumentError(f"The Word document is damaged: {error}.") from None
    return reader.doc


# --- .doc (Word 97 to 2003) ----------------------------------------------------------

# Characters the text stream uses for structure, as MS-DOC defines them.
_CELL, _PARA, _SOFT, _PAGE = "\x07", "\r", "\x0b", "\x0c"
_FIELD_BEGIN, _FIELD_SEP, _FIELD_END = "\x13", "\x14", "\x15"
# Marks of objects with no text (a picture, a drawing, a comment, a footnote's mark),
# dropped; the hyphens Word draws, written as one.
_DROP = dict.fromkeys(map(ord, "\x01\x02\x03\x04\x05\x08\x1f"), None) | {0x1E: "-"}


def _u16(buf: bytes, at: int) -> int:
    return struct.unpack_from("<H", buf, at)[0]


def _u32(buf: bytes, at: int) -> int:
    return struct.unpack_from("<I", buf, at)[0]


def read_doc(data: bytes) -> Document:
    import olefile  # pure Python; imported here so a .docx or a PDF never needs it

    try:
        ole = olefile.OleFileIO(io.BytesIO(data))
    except OSError:
        raise DocumentError("The Word document is damaged: it is not a readable .doc.") from None
    with ole:
        if not ole.exists("WordDocument"):
            raise DocumentError("This is an Office file, but not a Word document.")
        word = ole.openstream("WordDocument").read()
        if len(word) < 0x1AA or _u16(word, 0) != 0xA5EC:
            raise DocumentError("The Word document is damaged: its header cannot be read.")
        if _u16(word, 2) < 101:
            raise DocumentError(
                "This is a Word 6 or Word 95 document, which cannot be read: save it from "
                "Word as a .docx and import that."
            )
        flags = _u16(word, 0x0A)
        if flags & 0x0100:
            raise DocumentError("The Word document is password-protected: save it without.")
        table_name = "1Table" if flags & 0x0200 else "0Table"
        if not ole.exists(table_name):
            raise DocumentError("The Word document is damaged: its table stream is missing.")
        table = ole.openstream(table_name).read()
    text_cps = _u32(word, 0x4C)  # ccpText: the main document's characters
    # Each character is stored in the stream, in one byte at least: more is a piece
    # table that reads the same bytes again and again.
    if text_cps > len(word):
        raise DocumentError("The Word document is damaged: it claims more text than it holds.")
    if text_cps > MAX_CHARS:
        raise _too_much(
            f"Word document holds more than {MAX_CHARS // 1_000_000} million characters"
        )
    pieces = _pieces(table, _u32(word, 0x1A2), _u32(word, 0x1A6))
    paras = _paragraph_properties(word, table, _u32(word, 0x102), _u32(word, 0x106))
    return _doc_text(word, pieces, paras, text_cps)


@dataclass(frozen=True)
class _Piece:
    cp: int  # first character
    cp_end: int
    fc: int  # its first byte in the WordDocument stream
    compressed: bool  # one byte a character (cp1252) rather than two (UTF-16)


def _pieces(table: bytes, fc_clx: int, lcb_clx: int) -> list[_Piece]:
    """The piece table: where each run of the document's characters is stored."""
    clx = table[fc_clx : fc_clx + lcb_clx]
    at = 0
    while at < len(clx) and clx[at] == 0x01:  # Prc: formatting, skipped
        at += 3 + _u16(clx, at + 1)
    if at >= len(clx) or clx[at] != 0x02:
        raise DocumentError("The Word document is damaged: its piece table cannot be read.")
    size = _u32(clx, at + 1)
    plc = clx[at + 5 : at + 5 + size]
    n = (len(plc) - 4) // 12
    cps = [_u32(plc, 4 * i) for i in range(n + 1)]
    if any(a > b for a, b in zip(cps, cps[1:], strict=False)):
        # Pieces in order, none overlapping: so no character is read twice.
        raise DocumentError("The Word document is damaged: its piece table is out of order.")
    pieces = []
    for i in range(n):
        raw = _u32(plc, 4 * (n + 1) + 8 * i + 2)
        compressed = bool(raw & 0x40000000)
        fc = (raw & 0x3FFFFFFF) // 2 if compressed else raw & 0x3FFFFFFF
        pieces.append(_Piece(cps[i], cps[i + 1], fc, compressed))
    return pieces


def _paragraph_properties(word: bytes, table: bytes, fc: int, lcb: int) -> list[tuple[int, int]]:
    """Where each paragraph ends (a byte offset in the WordDocument stream), and whether
    it is in a table (1) or ends a table's row (2), from the PAPX pages (MS-DOC 2.8.25)."""
    out: list[tuple[int, int]] = []
    if lcb < 4:
        return out
    plc = table[fc : fc + lcb]
    n = (len(plc) - 4) // 8
    pages: set[int] = set()
    for i in range(n):
        page_no = _u32(plc, 4 * (n + 1) + 4 * i)
        page = word[page_no * 512 : page_no * 512 + 512]
        if len(page) < 512 or page_no in pages:
            continue  # a page named twice is read once: its paragraphs are the same
        pages.add(page_no)
        runs = page[511]
        if runs > 0x1D:  # a page holds 29 paragraphs' ends at most (MS-DOC 2.9.175)
            raise DocumentError("The Word document is damaged: its paragraphs cannot be read.")
        for r in range(runs):
            end = _u32(page, 4 * (r + 1))
            offset = page[4 * (runs + 1) + 13 * r] * 2
            state = 0
            if offset:
                cb = page[offset]
                start = offset + 1
                if cb == 0:
                    cb = page[offset + 1]
                    start += 1
                    length = cb * 2
                else:
                    length = cb * 2 - 1
                state = _table_state(page[start + 2 : start + length])  # after the style
            out.append((end, state))
    out.sort()
    return out


# sprm operand sizes by spra (the top three bits of an sprm), MS-DOC 2.2.5.1.
_SPRA_SIZE = {0: 1, 1: 1, 2: 2, 3: 4, 4: 2, 5: 2, 7: 3}


def _table_state(grpprl: bytes) -> int:
    """1 in a table, 2 ending a table's row, 0 neither: from sprmPFInTable (0x2416),
    sprmPFTtp (0x2417) and sprmPItap (0x6649)."""
    in_table = ttp = False
    at = 0
    while at + 2 <= len(grpprl):
        sprm = _u16(grpprl, at)
        at += 2
        spra = sprm >> 13
        if spra == 6:  # variable length
            if sprm == 0xD608:  # sprmTDefTable: a two-byte length
                size = _u16(grpprl, at) + 1 if at + 2 <= len(grpprl) else 0
            else:
                size = (grpprl[at] if at < len(grpprl) else 0) + 1
        else:
            size = _SPRA_SIZE.get(spra, 1)
        value = grpprl[at] if at < len(grpprl) else 0
        if sprm == 0x2416:
            in_table = value == 1
        elif sprm == 0x2417:
            ttp = value == 1
        elif sprm == 0x6649 and at + 4 <= len(grpprl):
            in_table = in_table or _u32(grpprl, at) > 0
        at += size
    return 2 if ttp else 1 if in_table else 0


def _doc_text(
    word: bytes, pieces: list[_Piece], paras: list[tuple[int, int]], limit: int
) -> Document:
    doc = Document("doc")
    out = _Text(doc.paragraphs, "Word document")
    ends = [end for end, _ in paras]
    states = [state for _, state in paras]

    def state_at(fc_end: int) -> int:
        lo, hi = 0, len(ends)
        while lo < hi:  # the first run ending at or after this paragraph's end
            mid = (lo + hi) // 2
            if ends[mid] < fc_end:
                lo = mid + 1
            else:
                hi = mid
        return states[lo] if lo < len(states) else 0

    paragraph: list[str] = []
    row: list[str] = []
    cell: list[str] = []
    rows: list[list[str]] = []
    field: list[int] = []  # open fields: 0 in the code, 1 in the result

    def finish_table() -> None:
        if rows:
            doc.tables.append(list(rows))
            rows.clear()

    for piece in pieces:
        if piece.cp >= limit:
            break
        count = min(piece.cp_end, limit) - piece.cp
        width = 1 if piece.compressed else 2
        raw = word[piece.fc : piece.fc + count * width]
        text = (
            raw.decode("cp1252", "replace")
            if piece.compressed
            else raw.decode("utf-16-le", "replace")
        )
        for i, ch in enumerate(text):
            if ch == _FIELD_BEGIN:
                field.append(0)
                continue
            if ch == _FIELD_SEP:
                if field:
                    field[-1] = 1
                continue
            if ch == _FIELD_END:
                if field:
                    field.pop()
                continue
            if field and field[-1] == 0:
                continue  # a field's code, such as PAGE: its result is the text
            if ch not in (_PARA, _CELL):
                paragraph.append(_SOFT_TO_LINE.get(ch, ch))
                continue
            fc_end = piece.fc + (i + 1) * width
            state = state_at(fc_end)
            line = "".join(paragraph).translate(_DROP)
            paragraph.clear()
            if ch == _CELL and state == 2:  # the row's end mark: no text of its own
                rows.append(list(row))
                row.clear()
                continue
            out.add(line)
            if ch == _CELL or state:
                cell.append(line)
                if ch == _CELL:
                    row.append("\n".join(cell))
                    cell.clear()
            else:
                finish_table()
    if paragraph:
        out.add("".join(paragraph).translate(_DROP))
    finish_table()
    return doc


_SOFT_TO_LINE = {_SOFT: "\n", _PAGE: "\n", "\xa0": " "}


# --- .pdf ----------------------------------------------------------------------------


_PDF_TEXT_OPERATORS = frozenset((b"Tj", b"TJ", b"'", b'"'))


class _PdfWork:
    """Counts what reading a PDF's text costs, and stops it past the limits: called by
    pypdf before each operation of a page's drawing, its forms' among them."""

    def __init__(self) -> None:
        self.operations = 0
        self.page = 0
        self.texts = 0  # on this page
        self.deadline = time.monotonic() + MAX_SECONDS
        self.stopped: DocumentTooLarge | None = None

    def new_page(self, number: int) -> None:
        self.page, self.texts = number, 0
        self.check_time()

    def __call__(self, operator: bytes, *_args: object) -> None:
        if self.stopped is not None:
            raise self.stopped  # again: pypdf passes over a form that fails
        self.operations += 1
        if operator in _PDF_TEXT_OPERATORS:
            self.texts += 1
            if self.texts > MAX_PDF_PAGE_TEXTS:
                self.stopped = _too_much(
                    f"PDF's page {self.page} shows text more than {MAX_PDF_PAGE_TEXTS:,} times"
                )
        if self.operations > MAX_PDF_OPERATIONS:
            self.stopped = _too_much(
                f"PDF draws more than {MAX_PDF_OPERATIONS:,} operations on its pages"
            )
        elif self.operations % 1_000 == 0:
            self.check_time()
        if self.stopped is not None:
            raise self.stopped

    def check_time(self) -> None:
        if self.stopped is None and time.monotonic() > self.deadline:
            self.stopped = _too_much(f"PDF took more than {MAX_SECONDS:.0f} seconds to read")
        if self.stopped is not None:
            raise self.stopped


def read_pdf(data: bytes) -> Document:
    import logging

    from pypdf import PdfReader, apply_configuration

    # pypdf says what it repairs in a damaged file through logging: not the analyst's concern.
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    doc = Document("pdf")
    out = _Text(doc.paragraphs, "PDF")
    work = _PdfWork()
    unpacked = {
        name: MAX_PDF_STREAM
        for name in (
            "maximum_declared_stream_length",
            "array_based_stream_maximum_output_length",
            "jbig2_maximum_output_length",
            "lzw_maximum_output_length",
            "run_length_maximum_output_length",
            "zlib_maximum_output_length",
            "brotli_maximum_output_length",
            "image_maximum_buffer_size",
        )
    }
    pages = 0
    try:
        with apply_configuration(
            **unpacked,
            stream_decoding_work_maximum_length=4 * MAX_PDF_STREAM,
            page_tree_maximum_entries=2 * MAX_PDF_PAGES + 100,  # pages and their nodes
            xform_maximum_invocations_per_extraction=500,
        ):
            reader = PdfReader(io.BytesIO(data), strict=False)
            if reader.is_encrypted and not reader.decrypt(""):
                raise DocumentError(
                    "The PDF is password-protected: save it without and import that."
                )
            pages = len(reader.pages)
            if pages > MAX_PDF_PAGES:
                raise _too_much(f"PDF has {pages:,} pages")
            for number, page in enumerate(reader.pages, start=1):
                work.new_page(number)
                contents = page.get_contents()
                drawn = len(contents.get_data()) if contents is not None else 0
                if drawn > MAX_PDF_PAGE_BYTES:
                    raise _too_much(
                        f"PDF's page {number} draws {drawn // (1024 * 1024):,} MB of instructions"
                    )
                text = page.extract_text(visitor_operand_before=work) or ""
                work.check_time()
                for line in _PDF_LINE_END.split(text):
                    out.add(line)
    except DocumentError:
        raise
    except MemoryError:
        raise _too_much("PDF needs more memory to read than there is") from None
    except Exception as error:  # a damaged PDF can fail in pypdf in many ways: all are said
        if type(error).__name__ == "LimitReachedError":
            raise _too_much(f"PDF is too large to read safely ({error})") from None
        raise DocumentError(f"The PDF is damaged: {error}.") from None
    while doc.paragraphs and not doc.paragraphs[-1].strip():
        doc.paragraphs.pop()
    if not doc.paragraphs and pages:
        raise DocumentError(
            "The PDF has no text to read: a scanned page is a picture, which needs text "
            "recognition first."
        )
    return doc


_PDF_LINE_END = re.compile(r"\r\n|\n|\r")
