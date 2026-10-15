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
"""

from __future__ import annotations

import io
import re
import struct
import zipfile
from dataclasses import dataclass, field
from xml.parsers import expat

# A document larger than this is refused before it is read (zip bombs, runaway PDFs).
MAX_BYTES = 200 * 1024 * 1024


class DocumentError(ValueError):
    """A document whose text could not be read, said in words an analyst can act on."""


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
    except Exception as error:  # a damaged file can fail its reader in many ways
        what = "PDF" if kind == "pdf" else "Word document"
        raise DocumentError(f"The {what} is damaged: {error}.") from None


# --- .docx ---------------------------------------------------------------------------

_W = (
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "http://purl.oclc.org/ooxml/wordprocessingml/main",  # Strict Open XML
)


class _DocxReader:
    """Paragraphs and tables of word/document.xml, by expat, one pass."""

    def __init__(self) -> None:
        self.doc = Document("docx")
        self.text: list[str] | None = None  # the paragraph being read
        self.tables: list[list[list[list[str]]]] = []  # open tables: rows of cells of paragraphs
        self.in_text = False
        self.skip = 0  # inside text Word does not show as the paragraph's: text boxes, deletions

    def start(self, tag: str, attrs: dict[str, str]) -> None:
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
            self.doc.paragraphs.append(paragraph)
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


def read_docx(data: bytes) -> Document:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise DocumentError("The Word document is damaged: it is not a readable .docx.") from None
    with archive:
        try:
            info = archive.getinfo("word/document.xml")
        except KeyError:
            raise DocumentError("This is a zip file, but not a Word document.") from None
        if info.file_size > MAX_BYTES:
            raise DocumentError("The Word document's text is too large to read.")
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
    for i in range(n):
        page_no = _u32(plc, 4 * (n + 1) + 4 * i)
        page = word[page_no * 512 : page_no * 512 + 512]
        if len(page) < 512:
            continue
        runs = page[511]
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
            doc.paragraphs.append(line)
            if ch == _CELL or state:
                cell.append(line)
                if ch == _CELL:
                    row.append("\n".join(cell))
                    cell.clear()
            else:
                finish_table()
    if paragraph:
        doc.paragraphs.append("".join(paragraph).translate(_DROP))
    finish_table()
    return doc


_SOFT_TO_LINE = {_SOFT: "\n", _PAGE: "\n", "\xa0": " "}


# --- .pdf ----------------------------------------------------------------------------


def read_pdf(data: bytes) -> Document:
    import logging

    from pypdf import PdfReader

    # pypdf says what it repairs in a damaged file through logging: not the analyst's concern.
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    doc = Document("pdf")
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted and not reader.decrypt(""):
            raise DocumentError("The PDF is password-protected: save it without and import that.")
        for page in reader.pages:
            text = page.extract_text() or ""
            doc.paragraphs.extend(_PDF_LINE_END.split(text))
    except DocumentError:
        raise
    except Exception as error:  # a damaged PDF can fail in pypdf in many ways: all are said
        raise DocumentError(f"The PDF is damaged: {error}.") from None
    while doc.paragraphs and not doc.paragraphs[-1].strip():
        doc.paragraphs.pop()
    return doc


_PDF_LINE_END = re.compile(r"\r\n|\n|\r")
