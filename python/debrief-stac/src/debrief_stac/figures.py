"""Images exported from Debrief, and the IDs that trace them back to their plot (SUB-25).

An image ID names one plot, at the exact revision exported, and the export itself
(decision, product owner, 16 Oct 2026), so a figure in a report traces to exactly
what was on screen, even after the plot is changed. It is written in Crockford's
base 32 (digits and capital letters, no I, L, O or U, so it reads aloud and types
without confusion), with a check symbol so a mistyped ID is caught, not looked up:

    DBF1-PPPPPPPP-RRRRRRRRRRRRRRRR-EEEEEEEE-C      the ID in full, in the metadata
    DBF-PPPP-RRRR-RRRE-EC                          its short form, in the footer

P is the plot key: the first 40 bits of the SHA-256 of the catalogue's own id and
the item's id (never the analyst's name for the folder, so it means the same on
every analyst's machine, as collation names items). R is the revision: the first
80 bits of the plot's content hash (SUB-19), which names the step exported at. E
is 40 random bits, the export, so two exports of one view are two images. C is a
Luhn mod 32 check over the rest. The short form keeps 20 bits of the plot key, 35 of
the revision and 10 of the export, with a check of its own: enough to find the plot
and the step, and to tell apart two exports of one revision, whose time and view
differ (expert panel, 16 Oct 2026). Nothing else goes into the image: not the plot's
title, its catalogue's name nor who exported it, which stay in the plot's export
log (its island).

PNG images carry the ID in an iTXt chunk of its own (keyword debrief:figure) and in
XMP (dc:identifier); SVG images in their metadata element, as XMP. Reading accepts
any of these, and falls back to finding an ID anywhere in the bytes, so an image
converted by another program keeps its trace where the metadata does; a Word or
PowerPoint file is searched picture by picture.

Python and TypeScript hold the format to schemas/vectors/figure-ids.json.
"""

from __future__ import annotations

import hashlib
import io
import re
import secrets
import struct
import zipfile
import zlib
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from debrief_schemas import models

if TYPE_CHECKING:
    from debrief_stac.catalogue import Catalogue

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_INDEX = {c: i for i, c in enumerate(ALPHABET)}
PREFIX = "DBF"
VERSION = "1"
PLOT_SYMBOLS, REVISION_SYMBOLS, EXPORT_SYMBOLS = 8, 16, 8
SHORT_PLOT, SHORT_REVISION, SHORT_EXPORT = 4, 7, 2
# Read as the analyst might type them: O for 0, I and L for 1, any case, any spacing.
_TYPED = str.maketrans({"O": "0", "I": "1", "L": "1"})
_SEPARATORS = re.compile(r"[\s\-‐-―−._/:…]+")
FULL_PATTERN = re.compile(
    r"DBF1-([0-9A-HJKMNP-TV-Z]{8})-([0-9A-HJKMNP-TV-Z]{16})-([0-9A-HJKMNP-TV-Z]{8})-([0-9A-HJKMNP-TV-Z])"
)
NOT_AN_ID = (
    "That is not a Debrief image ID. One looks like DBF-PTET-KG8R-B9EM-69, as in an image's corner."
)
MISTYPED = "That image ID has a character wrong: check it against the image."

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ITXT_KEYWORD = "debrief:figure"
XMP_KEYWORD = "XML:com.adobe.xmp"
XMP_NAMESPACE = "https://debrief.info/schemas/debrief/figures/"
SOFTWARE = "Debrief"
# Reading: never more than this of one picture, nor of a Word or PowerPoint file's pictures.
MAX_PICTURE = 64 * 1024 * 1024
MAX_PICTURES = 256 * 1024 * 1024
# Where Word, PowerPoint and Excel (and LibreOffice) keep a document's pictures.
ODF_OR_OOXML_PICTURE = re.compile(r"^((word|ppt|xl)/media|Pictures)/")


class FigureIdError(ValueError):
    """Text that is not an image ID, or one mistyped. The message is for the analyst."""

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


def symbols(data: bytes, count: int) -> str:
    """The first count symbols of data's bits, most significant first."""
    bits = int.from_bytes(data, "big")
    total = len(data) * 8
    out = []
    for n in range(count):
        shift = total - 5 * (n + 1)
        value = (bits >> shift) & 31 if shift >= 0 else (bits << -shift) & 31
        out.append(ALPHABET[value])
    return "".join(out)


def check_symbol(payload: str) -> str:
    """Luhn mod 32 over payload's symbols: catches any one symbol mistyped and most
    neighbours swapped."""
    factor, total = 2, 0
    for symbol in reversed(payload):
        addend = factor * _INDEX[symbol]
        factor = 1 if factor == 2 else 2
        total += addend // 32 + addend % 32
    return ALPHABET[(32 - total % 32) % 32]


def plot_key(catalogue_id: str, item_id: str) -> str:
    """The plot key: 8 symbols naming a plot by its catalogue's id and its item id."""
    digest = hashlib.sha256(f"{catalogue_id}/{item_id}".encode()).digest()
    return symbols(digest[:5], PLOT_SYMBOLS)


def revision_symbols(revision: str) -> str:
    """The 16 symbols naming a revision: the start of the plot's content hash."""
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", revision):
        raise ValueError(f"{revision!r} is not a content hash")
    return symbols(bytes.fromhex(revision[7:27]), REVISION_SYMBOLS)


@dataclass(frozen=True)
class FigureId:
    """An image ID: a plot, a revision of it, and one export."""

    plot: str
    revision: str
    export: str

    @property
    def text(self) -> str:
        payload = self.plot + self.revision + self.export
        return (
            f"{PREFIX}{VERSION}-{self.plot}-{self.revision}-{self.export}-{check_symbol(payload)}"
        )

    @property
    def short(self) -> str:
        return short_form(
            self.plot[:SHORT_PLOT] + self.revision[:SHORT_REVISION] + self.export[:SHORT_EXPORT]
        )

    def __str__(self) -> str:
        return self.text


def new_figure_id(
    catalogue_id: str, item_id: str, revision: str, export: bytes | None = None
) -> FigureId:
    """A fresh image ID for an export of a plot at a revision. export, 5 bytes, only
    for tests: otherwise random."""
    export = export if export is not None else secrets.token_bytes(5)
    return FigureId(
        plot_key(catalogue_id, item_id),
        revision_symbols(revision),
        symbols(export, EXPORT_SYMBOLS),
    )


def short_form(payload: str) -> str:
    """The short form of 13 symbols (plot 4, revision 7, export 2) and their check."""
    tail = payload[12:] + check_symbol(payload)
    return f"{PREFIX}-{payload[:4]}-{payload[4:8]}-{payload[8:12]}-{tail}"


@dataclass(frozen=True)
class FigureRef:
    """An image ID as read or typed: in full (all 8 export symbols), or its short form
    (the export's first 2)."""

    plot: str
    revision: str
    export: str

    @property
    def full(self) -> bool:
        return len(self.export) == EXPORT_SYMBOLS

    @property
    def text(self) -> str:
        """The ID as Debrief writes it: in full where known, else its short form."""
        if self.full:
            return FigureId(self.plot, self.revision, self.export).text
        return self.short

    @property
    def short(self) -> str:
        return short_form(
            self.plot[:SHORT_PLOT] + self.revision[:SHORT_REVISION] + self.export[:SHORT_EXPORT]
        )

    def names_plot(self, key: str) -> bool:
        return key.startswith(self.plot)

    def names_export(self, figure_id: str) -> bool:
        """Whether an image ID in full is this one (its short form, if this is short)."""
        try:
            other = parse_figure_id(figure_id)
        except FigureIdError:
            return False
        return (
            other.plot.startswith(self.plot)
            and other.revision.startswith(self.revision)
            and other.export.startswith(self.export)
        )

    def names_revision(self, revision: str) -> bool:
        try:
            return revision_symbols(revision).startswith(self.revision)
        except ValueError:
            return False


def parse_figure_id(text: str) -> FigureRef:
    """Read an image ID, in full or its short form, as typed or read from an image.
    Case, spaces and dashes do not matter; O is read as 0, I and L as 1. Raises
    FigureIdError, its message for the analyst."""
    plain = _SEPARATORS.sub("", text.strip().upper()).translate(_TYPED)
    if not plain or any(c not in _INDEX for c in plain):
        raise FigureIdError(NOT_AN_ID, "not_an_id")
    if plain.startswith(PREFIX + VERSION) and len(plain) == 4 + 33:
        payload, check = plain[4:36], plain[36]
        if check_symbol(payload) != check:
            raise FigureIdError(MISTYPED, "mistyped")
        return FigureRef(payload[:8], payload[8:24], payload[24:32])
    if plain.startswith(PREFIX) and len(plain) == 3 + 14:
        plain = plain[3:]
    elif plain.startswith(PREFIX):
        raise FigureIdError(NOT_AN_ID, "not_an_id")  # DBF and the wrong number of symbols
    if len(plain) == 14:
        payload, check = plain[:13], plain[13]
        if check_symbol(payload) != check:
            raise FigureIdError(MISTYPED, "mistyped")
        return FigureRef(payload[:4], payload[4:11], payload[11:13])
    raise FigureIdError(NOT_AN_ID, "not_an_id")


# --- Writing the ID into an image ------------------------------------------------


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def _itxt(keyword: str, text: str) -> bytes:
    # keyword, null, compression flag 0, method 0, no language tag, no translated keyword.
    return _chunk(b"iTXt", keyword.encode("latin-1") + b"\0\0\0\0\0" + text.encode("utf-8"))


def xmp_packet(figure: FigureId, created: str | None = None) -> str:
    """The XMP Debrief writes into an image: its ID, its short form and the software."""
    created_at = f"\n   <xmp:CreateDate>{created}</xmp:CreateDate>" if created else ""
    return (
        '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
        ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
        '  <rdf:Description rdf:about=""\n'
        '    xmlns:dc="http://purl.org/dc/elements/1.1/"\n'
        '    xmlns:xmp="http://ns.adobe.com/xap/1.0/"\n'
        f'    xmlns:debrief="{XMP_NAMESPACE}">\n'
        f"   <dc:identifier>{figure.text}</dc:identifier>\n"
        f"   <debrief:figure>{figure.text}</debrief:figure>\n"
        f"   <debrief:short>{figure.short}</debrief:short>\n"
        f"   <xmp:CreatorTool>{SOFTWARE}</xmp:CreatorTool>{created_at}\n"
        "  </rdf:Description>\n"
        " </rdf:RDF>\n"
        "</x:xmpmeta>\n"
        '<?xpacket end="w"?>'
    )


def _png_chunks(data: bytes) -> Iterable[tuple[bytes, bytes, int, int]]:
    """Each chunk of a PNG: its kind, its data, and where it starts and ends."""
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("not a PNG image")
    at = len(PNG_SIGNATURE)
    while at + 12 <= len(data):
        (length,) = struct.unpack(">I", data[at : at + 4])
        kind = data[at + 4 : at + 8]
        end = at + 12 + length
        if end > len(data):
            raise ValueError("a PNG image cut short")
        yield kind, data[at + 8 : at + 8 + length], at, end
        at = end
        if kind == b"IEND":
            return
    raise ValueError("a PNG image with no end")


def stamp_png(data: bytes, figure: FigureId, created: str | None = None) -> bytes:
    """The PNG with its ID in an iTXt chunk and in XMP, right after its header (where
    readers that stop at the image data still find them). Any ID it carried before
    is replaced."""
    chunks = list(_png_chunks(data))
    if not chunks or chunks[0][0] != b"IHDR":
        raise ValueError("a PNG image with no header")
    kept = []
    for kind, body, start, end in chunks:
        if kind in (b"iTXt", b"tEXt") and body.split(b"\0", 1)[0] in (
            ITXT_KEYWORD.encode(),
            XMP_KEYWORD.encode(),
            b"Software",
        ):
            continue
        kept.append(data[start:end])
    ours = (
        _itxt(ITXT_KEYWORD, figure.text)
        + _itxt(XMP_KEYWORD, xmp_packet(figure, created))
        + _chunk(b"tEXt", b"Software\0" + SOFTWARE.encode())
    )
    return PNG_SIGNATURE + kept[0] + ours + b"".join(kept[1:])


def stamp_svg(text: str, figure: FigureId, created: str | None = None) -> str:
    """The SVG with its ID in a metadata element, as XMP, first inside its root. Any
    Debrief metadata it carried before is replaced."""
    text = re.sub(r'<metadata id="debrief-figure">.*?</metadata>', "", text, flags=re.S)
    root = re.search(r"<svg\b[^>]*>", text)
    if root is None:
        raise ValueError("not an SVG image")
    packet = xmp_packet(figure, created)
    packet = packet.split("\n", 1)[1].rsplit("\n", 1)[0]  # no xpacket instructions in SVG
    metadata = f'<metadata id="debrief-figure">{packet}</metadata>'
    return text[: root.end()] + metadata + text[root.end() :]


def stamp(data: bytes, image_format: str, figure: FigureId, created: str | None = None) -> bytes:
    """The image with its ID in its metadata (SUB-25)."""
    if image_format == "png":
        return stamp_png(data, figure, created)
    if image_format == "svg":
        return stamp_svg(data.decode("utf-8"), figure, created).encode("utf-8")
    raise ValueError(f"Debrief writes PNG and SVG images, not {image_format}")


def image_format_of(data: bytes) -> str | None:
    """png or svg, by the image's first bytes; None for anything else."""
    if data.startswith(PNG_SIGNATURE):
        return "png"
    head = data[:4096].lstrip(b"\xef\xbb\xbf \t\r\n").lower()
    if head.startswith((b"<svg", b"<?xml", b"<!doctype svg", b"<!--")) and b"<svg" in head:
        return "svg"
    return None


# --- Reading it back ----------------------------------------------------------------

# Reading: a PNG's compressed text is inflated to at most this (an ID and its XMP are a
# few hundred bytes), so a crafted chunk cannot swell (expert panel, 16 Oct 2026).
MAX_TEXT = 64 * 1024


@dataclass
class Found:
    """The image IDs read from a file, each with where it was found; and the pictures
    that could not be read, each with why."""

    ids: list[tuple[str, str]] = field(default_factory=list)  # (ID text, where)
    skipped: list[tuple[str, str]] = field(default_factory=list)  # (where, why)

    def add(self, text: str, where: str) -> None:
        if all(text != t for t, _ in self.ids):
            self.ids.append((text, where))


def _ids_in(text: str) -> list[str]:
    found = []
    for match in FULL_PATTERN.finditer(text):
        try:
            found.append(parse_figure_id(match.group(0)).text)
        except FigureIdError:
            continue
    return found


def _png_texts(data: bytes) -> Iterable[tuple[str, str]]:
    """Each text chunk of a PNG: its keyword and its text, compressed text inflated to
    MAX_TEXT at most."""
    for kind, body, _, _ in _png_chunks(data):
        if kind == b"tEXt":
            keyword, _, text = body.partition(b"\0")
            yield keyword.decode("latin-1"), text.decode("latin-1")
        elif kind == b"zTXt":
            keyword, _, rest = body.partition(b"\0")
            yield keyword.decode("latin-1"), _inflate(rest[1:]).decode("latin-1")
        elif kind == b"iTXt":
            keyword, _, rest = body.partition(b"\0")
            compressed = rest[:1] == b"\1"
            rest = rest[2:]
            _, _, rest = rest.partition(b"\0")  # language tag
            _, _, text = rest.partition(b"\0")  # translated keyword
            text = _inflate(text) if compressed else text
            yield keyword.decode("latin-1"), text.decode("utf-8", "replace")


def _inflate(data: bytes) -> bytes:
    """At most MAX_TEXT of compressed text: never all of a chunk built to swell."""
    return zlib.decompressobj().decompress(data, MAX_TEXT)


def figure_ids_in(data: bytes, name: str = "the image") -> Found:
    """Every image ID in a file: a PNG's chunks, an SVG's metadata, each picture in a
    Word, PowerPoint or LibreOffice file (each picture read on its own, so a document's
    second SVG is found as its first is); anywhere else in an image's bytes as a last
    resort (an image another program wrote may keep its XMP where its chunks are gone).
    A picture that cannot be read is skipped, and said why."""
    found = Found()
    if data.startswith(b"PK\x03\x04"):
        _read_office(data, name, found)
    else:
        for text_id in _ids_in_picture(data):
            found.add(text_id, name)
    return found


def _ids_in_picture(data: bytes) -> list[str]:
    """The IDs in one picture: a PNG's text chunks, stopping at the first that has one;
    otherwise (an SVG, a picture another program wrote) anywhere in its bytes."""
    if data.startswith(PNG_SIGNATURE):
        try:
            for keyword, text in _png_texts(data):
                if keyword in (ITXT_KEYWORD, XMP_KEYWORD) or "DBF1-" in text:
                    ids = _ids_in(text)
                    if ids:
                        return ids
        except (ValueError, zlib.error):
            pass
    return _ids_in(data.decode("latin-1"))


def _read_office(data: bytes, name: str, found: Found) -> None:
    """The pictures in a Word, PowerPoint, Excel or OpenDocument file (each a zip of
    parts), each on its own. A picture that is encrypted, compressed in a way Python
    cannot read, or damaged is skipped, and said why; the others are still read."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except (zipfile.BadZipFile, ValueError):
        found.skipped.append(
            (name, "it is not a Word, PowerPoint or LibreOffice file Debrief can read")
        )
        return
    budget = MAX_PICTURES
    for info in archive.infolist():
        if not ODF_OR_OOXML_PICTURE.match(info.filename):
            continue
        where = f"{name}: {info.filename}"
        if info.file_size > MAX_PICTURE:
            found.skipped.append((where, "the picture is too large to read"))
            continue
        budget -= info.file_size
        if budget < 0:
            found.skipped.append((where, "the file's pictures are too large to read them all"))
            break
        try:
            with archive.open(info) as stream:
                picture = stream.read(MAX_PICTURE + 1)
        except NotImplementedError:  # before RuntimeError, which it is a kind of
            found.skipped.append((where, "the picture is compressed in a way Debrief cannot read"))
            continue
        except RuntimeError:
            found.skipped.append((where, "the picture is encrypted"))
            continue
        except (zipfile.BadZipFile, zlib.error, OSError, EOFError):
            found.skipped.append((where, "the picture is damaged"))
            continue
        for text_id in _ids_in_picture(picture):
            found.add(text_id, where)


# --- Exporting: an ID for the plot shown, then the image stamped and logged ------------

NOT_LOGGED = (
    "The image traces to the plot by its ID, but this export is not in the plot's export "
    "log: {why}."
)
IN_USER_LOG = (
    "This export is in your own export log rather than the plot's, because {why}: Find "
    "source of image still finds it."
)
# The most images a plot's export log keeps (decision, product owner, 16 Oct 2026): the
# oldest are dropped first. An image whose entry is gone still traces by its ID; only its
# view and time are not restored.
PLOT_LOG_LIMIT = 500


def _revisions_or_content(catalogue: Catalogue, item_id: str) -> list[tuple[int, str]]:
    """Each step and the revision after it; for a plot whose history is damaged (shown
    as its file holds it, never changed), its content's hash as its only revision, so it
    can still be exported and traced (expert panel, 16 Oct 2026)."""
    from debrief_stac.history import HistoryError

    history = catalogue.history(item_id)
    try:
        return history.revisions()
    except HistoryError:
        head = history.head()
        return [(head.current, head.plot_hash)]


def figure_for(catalogue: Catalogue, item_id: str, revision: str | None = None) -> FigureId:
    """A fresh image ID for an export of a plot: at its current revision, or at the one
    given (an earlier revision shown read-only), which its history must have. A plot
    whose history is damaged is exported at its content's hash."""
    from debrief_stac.history import HistoryError

    revisions = _revisions_or_content(catalogue, item_id)
    if not revisions:
        raise HistoryError("This plot has nothing in it yet, so there is nothing to export.")
    if revision is None:
        revision = catalogue.history(item_id).head().plot_hash
    if all(r != revision for _, r in revisions):
        raise HistoryError("The plot's history has no step at that revision.")
    return new_figure_id(catalogue.id, item_id, revision)


def revision_named(catalogue: Catalogue, item_id: str, figure: FigureRef) -> str:
    """The plot's revision an image ID in full names, checked to be this plot's."""
    if not figure.full:
        raise FigureIdError("An export needs the image's ID in full.", "not_an_id")
    if plot_key(catalogue.id, item_id) != figure.plot:
        raise FigureIdError("That image ID is for another plot.", "other_plot")
    for _, revision in _revisions_or_content(catalogue, item_id):
        if revision_symbols(revision) == figure.revision:
            return revision
    raise FigureIdError("That image ID names a revision this plot never had.", "other_plot")


def prepare_export(
    catalogue: Catalogue, item_id: str, figure_text: str, data: bytes, export: dict
) -> tuple[bytes, models.ImageExport]:
    """The image with its ID in its metadata, and the plot's export log entry for it.
    export holds the entry's other members (format, footer, file, preset, theme, width,
    height, viewport, time, tote, by, at). The ID must be this plot's, in full, at a
    revision its history has; the image must be the format said; the entry must keep the
    log's rules (its time within its window, its area on the globe), checked here, before
    anything is written, whoever gave it."""
    from debrief_schemas.documents import export_log_problems

    figure = parse_figure_id(figure_text)
    revision = revision_named(catalogue, item_id, figure)
    image_format = export.get("format")
    if image_format_of(data) != image_format:
        raise ValueError(f"The image is not the {str(image_format).upper()} it was said to be.")
    given = {**export, "id": figure.text, "revision": revision}
    entry = models.ImageExport.model_validate({k: v for k, v in given.items() if v is not None})
    problems = export_log_problems([entry], "export")
    if problems:
        raise ValueError("; ".join(problems))
    full = FigureId(figure.plot, figure.revision, figure.export)
    return stamp(data, str(image_format), full, entry.at), entry


@dataclass(frozen=True)
class Logged:
    """Where an export was recorded: the plot's export log, the analyst's own (a
    read-only catalogue, a plot with nowhere to keep one), or neither; and what to say."""

    where: str | None  # "plot", "user" or None
    note: str | None = None


def log_export(
    catalogue: Catalogue,
    item_id: str,
    entry: models.ImageExport,
    *,
    read_only: str | None = None,
    user_log: Callable[[models.LoggedExport], None] | None = None,
    allow_newer_schema: bool = False,
) -> Logged:
    """Record an export, once its image is written: in the plot's export log (its island,
    never a step); where that cannot be written (read_only names why, a read-only
    catalogue, say), in the analyst's own export log beside their Debrief configuration,
    which Find source of image reads too, so every export stays traceable (decision,
    product owner, 16 Oct 2026). The image traces to the plot by its ID either way."""
    from debrief_stac.catalogue import NewerSchemaError
    from debrief_stac.history import Conflict, HistoryError

    why = read_only
    if why is None:
        try:
            if catalogue.record_export(item_id, entry, allow_newer_schema=allow_newer_schema):
                return Logged("plot")
            why = "the plot has nowhere to keep one"
        except NewerSchemaError:
            why = "writing the plot's would put a newer schema into a shared catalogue"
        except (Conflict, HistoryError, OSError) as error:
            why = str(error).rstrip(".")
    if user_log is not None:
        # The analyst's own log (debrief_config.exports.append_export, given by the caller).
        try:
            user_log(models.LoggedExport(catalogue=catalogue.id, item=item_id, export=entry))
            return Logged("user", IN_USER_LOG.format(why=why))
        except (OSError, ValueError) as error:
            why = f"{why}, and your own export log could not be written: {error}"
    return Logged(None, NOT_LOGGED.format(why=why))


# --- Finding the plot an image came from --------------------------------------------


@dataclass
class Source:
    """A plot an image came from, at the revision it was exported at, with the export log
    entry for the image where a log has it."""

    store: str | None
    store_title: str | None
    catalogue: Catalogue
    item: str
    title: str
    revision: str
    step: int
    current: int
    copied: bool
    export: models.ImageExport | None

    def model(self) -> models.FigureSource:
        return models.FigureSource(
            store=self.store,
            store_title=self.store_title,
            catalogue=self.catalogue.id,
            item=self.item,
            title=self.title,
            revision=self.revision,
            step=self.step,
            current=self.current,
            copied=self.copied or None,
            export=self.export,
        )


def find_sources(
    catalogues: Iterable[tuple[str | None, str | None, Catalogue]],
    ref: FigureRef,
    user_log: Iterable[models.LoggedExport] = (),
) -> list[Source]:
    """The plots an image ID names, in the catalogues given (store id, title,
    catalogue): the plot its key names, at the step whose revision it names. Where no
    plot of that key has the revision (the plot was copied to another catalogue, or
    sent to a colleague), any plot with that revision, said to be a copy.

    One source for each export log entry the ID names (the plot's, or the analyst's own
    user_log): a footer's short form can name more than one export of a revision, and
    each was of its own view and time, so the analyst is shown them all to choose from,
    never the last of them silently (expert panel, 16 Oct 2026). With no entry, one
    source with none.

    Each item's metadata lists the revisions its history has had (`debrief:revisions`),
    so a plot is read only when it has the revision; an item from before items kept that
    list is read whole. A plot whose history cannot be read is passed over, unless it is
    damaged and its content is the revision named."""
    listed = list(catalogues)
    logged = list(user_log)
    sources = _search(listed, ref, logged, by_key=True)
    return sources or _search(listed, ref, logged, by_key=False)


def _search(
    catalogues: list[tuple[str | None, str | None, Catalogue]],
    ref: FigureRef,
    logged: list[models.LoggedExport],
    by_key: bool,
) -> list[Source]:
    from debrief_stac.history import HistoryError

    out = []
    for store, store_title, catalogue in catalogues:
        try:
            item_ids = catalogue.item_ids()
        except (OSError, ValueError):
            continue
        for item_id in item_ids:
            if by_key and not ref.names_plot(plot_key(catalogue.id, item_id)):
                continue
            try:
                item = catalogue.read_item(item_id)
            except (OSError, ValueError):
                continue
            listed = item.properties.debrief_revisions
            if listed is not None and not any(r.startswith(ref.revision) for r in listed):
                continue  # the item says its plot never had the revision: not read
            try:
                found = _at_revision(catalogue, item_id, ref, logged)
            except (HistoryError, OSError, ValueError):
                continue
            if found is None:
                continue
            revision, step, current, exports = found
            title = item.properties.title or item_id
            for export in exports or [None]:
                out.append(
                    Source(
                        store,
                        store_title,
                        catalogue,
                        item_id,
                        title,
                        revision,
                        step,
                        current,
                        not by_key,
                        export,
                    )
                )
    return out


def _at_revision(
    catalogue: Catalogue,
    item_id: str,
    ref: FigureRef,
    logged: list[models.LoggedExport],
) -> tuple[str, int, int, list[models.ImageExport]] | None:
    """The revision ref names in a plot's history, the step at it (the current step
    where that is it, else the latest), the current step, and every export log entry,
    the plot's or the analyst's own, that ref names: the one image for an ID in full;
    for a footer's short form, each export of that revision whose ID starts so."""
    history = catalogue.history(item_id)
    revisions = _revisions_or_content(catalogue, item_id)
    current = history.head().current
    matching = [(seq, r) for seq, r in revisions if ref.names_revision(r)]
    if not matching:
        return None
    step, revision = next(((s, r) for s, r in matching if s == current), matching[-1])
    view, _ = history.view()
    entries = list(view.exports or []) if view is not None else []
    entries += [e.export for e in logged if e.catalogue == catalogue.id and e.item == item_id]
    exports: dict[str, models.ImageExport] = {}
    for entry in entries:
        if entry.revision == revision and ref.names_export(entry.id):
            exports.setdefault(entry.id, entry)
    return revision, step, current, sorted(exports.values(), key=lambda e: e.at)
