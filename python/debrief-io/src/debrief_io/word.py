"""Narrative from Word and PDF documents: legacy Debrief's dialects, ported (CAP-19, EXT-04).

Ported from legacy Debrief's Debrief.ReaderWriter.Word, with the cases of their tests
(on synthetic text here, never the legacy documents):

- **Narrative document** (``ImportNarrativeDocument``, and ``ImportWord_LEGACY`` before
  it): an entry a paragraph, ``DTG,day,month,year,platform,type,text``, the DTG of four
  (``HHMM``) or six (``DDHHMM``) figures; the metadata after the DTG is usually hidden
  text in Word, so a PDF of the same log has only ``DDHHMM text``. Short entries take
  the date and platform from the entry before; text alone continues the entry before,
  every line of it up to the next entry (legacy Debrief joined six, dropped the
  seventh and joined on: product owner, 15 Oct 2026, keep them all); a line
  ``dd MMM yy`` marks a new day; ``START OF RECORDS`` and ``END OF RECORDS FOR`` bound
  the entries in a longer document. Two corrections:
  a day that goes backwards with no new month or year (a mangled cut and paste) keeps
  the day before, said as a warning; and an entry at 23xx whose hidden day is one
  after its DTG's (written just after midnight about the evening before) takes the
  DTG's day. A six-figure DTG whose day goes backwards in a short entry is in the
  next month. A line that starts with four or six figures and no metadata is a short
  entry only if its time is in order with the entries around it (product owner, 15 Oct
  2026): otherwise, like "2000 yds, closing.", it is text of the entry before (see
  out_of_order). FCS entries (fire-control solutions: bearing, range, course, speed,
  classification) are read as legacy Debrief read them, and kept as narrative.
- **Rider's narrative** (``ImportRiderNarrativeDocument``): a table whose first cell is
  ``DTG Start``; its second row the start DTG (``220000Z JUL 09``) and the platform
  (fifth cell); from its fourth row, a row an entry: time of day, bearing (``273``,
  ``92/112`` ambiguous, ``096-112`` an arc, ``No B``), beam (``No Bm``) and text. Every
  entry has the type *Rider*; a bearing and beam are written before the text, as
  legacy Debrief wrote them.
- **ASW data** (``ImportASWDataDocument``): ``TMPOS/ddHHmmZMMM/source/position/course/
  speed/depth`` lines, positions of one platform: a track, not narrative. ``TIMPD``
  lines give the year.
- **Dated narrative** (``ImportWordDummy``): ``yyyy,MM,dd,HH:mm[:ss],type,platform,text``.

Legacy Debrief kept its parsers' state in static fields, read times in the machine's
time zone in places, and stopped a whole import at some bad lines; here each document
is read on its own, in UTC, and a line that cannot be read is listed with why.
"""

from __future__ import annotations

import copy
import re
from calendar import timegm
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime

from debrief_io.documents import Document
from debrief_io.rep import RepFix

NARRATIVE, RIDER, ASW, DATED = (
    "narrative-document",
    "rider-narrative",
    "asw-data",
    "dated-narrative",
)
DIALECTS = {
    NARRATIVE: "narrative log",
    RIDER: "Rider's narrative",
    ASW: "ASW data",
    DATED: "dated narrative",
}
# The type every Rider entry has, as legacy Debrief gave it.
RIDER_TYPE = "Rider"
# Legacy Debrief's type for a short entry it could not type; here an entry with no type.
NO_TYPE = "N/A"
# Prefixes skipped before matching a platform to a track, as legacy Debrief skipped them.
SKIP_NAMES = ("HMS", "Hms", "USS", "RNAS", "HNLMS")
START_OF_RECORDS = ("START OF RECORDS", "START RECORDS")
END_OF_RECORDS = ("END RECORDS FOR", "END OF RECORDS FOR")
# Lines joined to one entry, at most: a safety cap against a runaway document (a
# printed log's longest entries run to some dozens of lines); lines past it are counted.
MAX_CONTINUATION = 2_000
# How far before the entry before it a short entry may be and still be an entry: a late
# entry, written up within the hour (legacy Debrief's own late-entry rule is of an entry
# at 23xx written just after midnight). Also how far after the entry following it.
LATE_ENTRY_MS = 3_600_000
# A short entry's four-figure time more than this before the entry before it is after
# midnight: on the next day.
ROLLOVER_MS = 12 * 3_600_000
# The entries after a short entry that its time is checked against, at most, and the
# lines read to find them.
LOOKAHEAD_ENTRIES = 3
LOOKAHEAD_LINES = 500
DTG_MISSING = "[DTG missing. Re-using previous DTG]"

_MONTHS = {m: i for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(), 1)}


@dataclass
class DocEntry:
    """One narrative entry read from a document."""

    time_ms: int
    source: str | None  # None: the document names no platform
    entry_type: str | None
    text: str
    line: int  # the paragraph (or table row) it starts at, from 1
    # Read from an FCS entry, as legacy Debrief read it: kept as narrative until TMA
    # solutions are in the data model.
    fcs: Fcs | None = None
    # A Rider entry's bearing (and its ambiguous twin): a sensor cut, in legacy Debrief.
    bearing: int | None = None


@dataclass
class DocumentRead:
    """What a document holds, in one of the dialects."""

    dialect: str
    entries: list[DocEntry] = field(default_factory=list)
    fixes: list[RepFix] = field(default_factory=list)  # ASW data
    # Said to the analyst: lines not read, with why; corrections made.
    problems: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    # How many lines before the first entry were passed over (a title, a preamble).
    preamble: int = 0
    # How many lines followed an entry past MAX_CONTINUATION, and were not joined to it.
    overflow: int = 0
    # Lines starting with a number, read as text of the entry before rather than as
    # entries, their times being out of order: (line number, the line).
    as_text: list[tuple[int, str]] = field(default_factory=list)
    stopped_at: str | None = None  # the end-of-records line, if one ended the reading

    @property
    def dialect_title(self) -> str:
        return DIALECTS[self.dialect]

    def types(self) -> Counter[str]:
        """How many entries of each type, "" for none, as legacy Debrief asked."""
        return Counter(e.entry_type or "" for e in self.entries)


def gmt(year: int, month: int, day: int, hours: int = 0, minutes: int = 0, seconds: int = 0) -> int:
    """Epoch milliseconds of a UTC time; ValueError for a day or time that does not exist
    (legacy Debrief's lenient calendar rolled them on: 32 March was 1 April)."""
    return timegm(datetime(year, month, day, hours, minutes, seconds).timetuple()) * 1000


def _utc(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, UTC)


def remove_bad_chars(text: str) -> str:
    """Soft returns as line breaks; Word's control characters as spaces (legacy
    removeBadChars: they could be saved but not read back)."""
    text = text.replace("\x0b", "\n")
    return text.translate({c: " " for c in (1, 5, 8, 19, 20, 21, 31)})


def year_from(text: str) -> int:
    """A year of two or four figures: two after 80 are 19xx, others 20xx (legacy)."""
    if len(text) == 2:
        value = int(text)
        return 1900 + value if value > 80 else 2000 + value
    return int(text)


def _whitespace(text: str) -> int:
    return next((i for i, c in enumerate(text) if c.isspace()), -1)


# --- FCS entries ---------------------------------------------------------------------

_YARDS = {"KYDS": 1000.0, "YDS": 1.0, "M": 1.0 / 0.9144}


@dataclass(frozen=True)
class Fcs:
    """A fire-control solution, as legacy Debrief read one from an FCS entry."""

    bearing_deg: float | None
    range_yd: float | None
    course_deg: float
    speed_kn: float
    classification: str  # legacy: "N/A" when not given
    contact: str  # the track number: M01 (master) or 023
    solution_source: str  # LOP, SMCS, 1936, …, or the text before B-

    @property
    def complete(self) -> bool:
        """Enough for a TMA solution position: a bearing and a range."""
        return self.bearing_deg is not None and self.range_yd is not None


def fcs_element(identifier: str, text: str) -> float | None:
    """The number after B-, C-, R- or S- (getElement)."""
    found = re.search(re.escape(identifier) + r"-*([0-9]+\.?[0-9]*)", text)
    return float(found.group(1)) if found else None


def fcs_classified(text: str) -> str | None:
    found = re.search(r"Classified (.*$)", text)
    return found.group(1) if found else None


def fcs_range_yd(text: str) -> float | None:
    """The range after R-, in kiloyards, yards or metres, in yards (getRange)."""
    tidied = text.replace("\n", "").replace("\r", "")
    found = re.fullmatch(r".*R-(?P<range>[0-9]+\.?[0-9]?)(?:\s*)(?P<units>\w*?)(?:\.|\s).*", tidied)
    if not found:
        return None
    factor = _YARDS.get(found.group("units").upper())
    return None if factor is None else float(found.group("range")) * factor


def fcs_track(text: str) -> str | None:
    """The contact's track number: a master track (M01) first, then a three-figure one
    after up to four capitals (SR023 is 023) (parseTrack)."""
    found = re.search(r"(M[0-9]{2})", text)
    if found:
        return found.group(1)
    found = re.search(r"[A-Z]{1,4}([0-9]{3})", text)
    return found.group(1) if found else None


_KNOWN_SOURCES = ("LOP", "SMCS", "WECDIS", "1936", "1959", "CMD")


def fcs_source(text: str) -> str | None:
    """Where the solution came from: the text between the track number and B-, or one
    of the names legacy Debrief looked for in it (parseSource)."""
    tidied = text.replace("\n", "").replace("\r", "").strip()
    found = re.fullmatch(r".*([A-Z]{1,4}[0-9]{3}|M[0-9]{2})(?P<source>.*)B-.*", tidied)
    if not found:
        return None
    source = found.group("source").strip()
    for name in _KNOWN_SOURCES:
        if name in source:
            return name
    if "TRIANGULATION" in source.upper():
        return "Triangulation"
    if "HDPR" in source:
        return "HDPR"
    return source


def parse_fcs(text: str) -> Fcs:
    return Fcs(
        bearing_deg=fcs_element("B-", text),
        range_yd=fcs_range_yd(text),
        course_deg=fcs_element("C-", text) or 0.0,
        speed_kn=fcs_element("S-", text) or 0.0,
        classification=fcs_classified(text) or "N/A",
        contact=fcs_track(text) or "N/A",
        solution_source=fcs_source(text) or "",
    )


# --- The narrative document ----------------------------------------------------------


class _LineError(ValueError):
    """A line that could not be read."""


@dataclass
class _Line:
    """A paragraph, read: an entry, text continuing the one before, or nothing."""

    time_ms: int | None = None
    entry_type: str | None = None
    platform: str | None = None
    text: str | None = None
    appended: bool = False
    day_marker: bool = False
    # A short entry: a time at the start of a line with no metadata, and so perhaps a
    # number in text ("2000 yds"), not a time at all.
    timed: bool = False
    # Dated by the late-entry rule: at 23xx, just after an entry past midnight.
    late: bool = False


_FOUR = re.compile(r"[0-9]{4}")
_SIX = re.compile(r"[0-9]{6}")
_DAY_MARKER = re.compile(r"([0-9]{1,2})\s+([A-Za-z]{3,9})\s+([0-9]{2,4})(?![0-9])")


def day_marker(text: str) -> int | None:
    """A new day's date, "12 Mar 20" or "31 Dec 1995", at the start of a line, as epoch
    milliseconds at its midnight; None if the line does not start so. As legacy
    Debrief's "dd MMM yy" did, text after the date is ignored; a month may be written
    in full; a year of four figures is that year, of two as for an entry."""
    found = _DAY_MARKER.match(text)
    if not found:
        return None
    month = _MONTHS.get(found.group(2)[:3].upper())
    if month is None or (len(found.group(2)) > 3 and not _full_month(found.group(2))):
        return None
    year = found.group(3)
    year_value = int(year) if len(year) != 2 else year_from(year)
    try:
        return gmt(year_value, month, int(found.group(1)))
    except ValueError:
        return None


def _full_month(word: str) -> bool:
    names = "JANUARY FEBRUARY MARCH APRIL MAY JUNE JULY AUGUST SEPTEMBER OCTOBER NOVEMBER DECEMBER"
    return word.upper() in names.split()


class NarrativeDocumentParser:
    """Legacy Debrief's NarrEntry, its static fields made this parser's own."""

    def __init__(self) -> None:
        self.last_ms: int | None = None
        self.last_platform: str | None = None
        self.has_entry = False
        # Whether last_ms is a day marker's midnight rather than an entry's time.
        self.after_marker = False
        self.last_day: str | None = None
        self.last_month: str | None = None
        self.last_year: str | None = None
        self.warnings: list[str] = []

    def line(self, raw: str) -> _Line:
        """One paragraph. _LineError if it looks like an entry but cannot be read."""
        trimmed = raw.strip()
        parts = trimmed.split(",")
        long_enough = len(parts) > 5
        six = long_enough and _SIX.fullmatch(parts[0]) is not None
        four = long_enough and _FOUR.fullmatch(parts[0]) is not None
        if six or four:
            return self._full(parts, six)
        return self._short(raw, trimmed)

    def _full(self, parts: list[str], six: bool) -> _Line:
        dtg = parts[0][2:6] if six else parts[0]
        day, month, year = parts[1].strip(), parts[2].strip(), parts[3].strip()
        if not (day.isdigit() and month.isdigit() and year.isdigit()):
            raise _LineError("its day, month and year are not numbers")
        platform = parts[4].strip()
        type_field = parts[5].strip()
        if six:
            day = self._late_entry_day(parts[0], day)
        day = self._day_sequence(dtg, day, month, year)
        entry_type, rest = type_field, ""
        # On occasion the comma after the type is missing: legacy Debrief kept the type's
        # first word (and cut its last letter, a slip not kept here).
        if len(type_field) > 20 and _whitespace(type_field) > 0:
            cut = _whitespace(type_field)
            entry_type, rest = type_field[:cut], type_field[cut:].strip()
        try:
            when = gmt(year_from(year), int(month), int(day), int(dtg[:2]), int(dtg[2:4]))
        except ValueError:
            raise _LineError(f"{dtg} on {day}/{month}/{year} is not a time that exists") from None
        text = ",".join([rest, *parts[6:]] if rest else parts[6:]).strip()
        self._remember(when, platform)
        if not text:
            raise _LineError("it has no text")
        return _Line(when, entry_type, platform, text)

    @staticmethod
    def _late_entry_day(six: str, day: str) -> str:
        """An entry at 23xx logged just after midnight carries the next day in its hidden
        date: the DTG's day is the one meant (correctLateEntryDay)."""
        dtg_day, hours = int(six[:2]), int(six[2:4])
        if hours == 23 and int(day) == dtg_day + 1:
            return str(dtg_day)
        return day

    def _day_sequence(self, dtg: str, day: str, month: str, year: str) -> str:
        """A day earlier than the last with no new month or year is taken for a mangled cut
        and paste: the last day is kept, and said (checkDaySequence)."""
        decreased = self.last_day is not None and int(day) < int(self.last_day)
        new_month = self.last_month is not None and int(month) > int(self.last_month)
        new_year = self.last_year is not None and int(year) > int(self.last_year)
        if decreased and not new_month and not new_year:
            self.warnings.append(
                f"The day went back at {dtg} ({day}/{month}/{year}) with no new month: read "
                f"as day {self.last_day}, as the entry before may be a mangled cut and paste."
            )
            return self.last_day  # type: ignore[return-value]
        self.last_day, self.last_month, self.last_year = day, month, year
        return day

    def _short(self, raw: str, trimmed: str) -> _Line:
        first = _whitespace(trimmed)
        word = trimmed[:first] if first > 0 else trimmed
        has_content = len(raw) > 8
        if (_FOUR.fullmatch(word) or _SIX.fullmatch(word)) and has_content:
            if self.last_ms is None or self.last_platform is None:
                raise _LineError("it has a time but no date or platform before it")
            return self._timed(trimmed, word)
        return self._text_or_day(trimmed)

    def _timed(self, trimmed: str, word: str) -> _Line:
        """A time and text, taking the date and platform from the entry before; a
        six-figure DTG's day earlier than the last is in the next month.

        Two corrections, new here, for a log with no metadata: an entry at 23xx just
        after an entry past midnight (00xx) is a late entry, on the evening before, as
        legacy Debrief corrected a full entry's day (correctLateEntryDay); and a
        four-figure time more than twelve hours before the entry before it is past
        midnight, on the next day (legacy Debrief kept the day, so the entry went back
        almost a day)."""
        last = _utc(self.last_ms)  # type: ignore[arg-type]
        day, month, year = last.day, last.month, last.year
        clock = word
        # Only after an entry, not a day marker's midnight.
        just_past_midnight = not self.after_marker and last.hour == 0 and word[-4:-2] == "23"
        late = False
        if len(word) == 6:
            days = int(word[:2])
            if days == day - 1 and just_past_midnight:
                late = True
            elif days < day:
                month, year = (1, year + 1) if month == 12 else (month + 1, year)
            day, clock = days, word[2:]
        try:
            when = gmt(year, month, day, int(clock[:2]), int(clock[2:4]))
        except ValueError:
            raise _LineError(f"{word} is not a time that exists") from None
        if len(word) == 4 and just_past_midnight:
            when -= 86_400_000
            late = True
        elif len(word) == 4 and not self.after_marker and when < self.last_ms - ROLLOVER_MS:  # type: ignore[operator]
            when += 86_400_000
            self.warnings.append(
                f"{word} is more than twelve hours before the entry before it: read as "
                f"past midnight, on {_utc(when).strftime('%d/%m/%Y')}."
            )
        text = trimmed[len(word) :].strip()
        if not text:
            raise _LineError("it has a time but no text")
        start = text[: min(20, len(text) - 1)]
        entry_type = "FCS" if fcs_track(start) is not None else NO_TYPE
        platform = self.last_platform
        self._remember(when, platform)  # type: ignore[arg-type]
        return _Line(when, entry_type, platform, text.replace("\r", "\n"), timed=True, late=late)

    def _text_or_day(self, trimmed: str) -> _Line:
        marker = day_marker(trimmed)
        if marker is not None:
            self.last_ms = marker
            self.after_marker = True
            if self.last_platform is None:
                self.last_platform = ""  # a document with no metadata names no platform
            return _Line(day_marker=True)
        if self.has_entry:
            return _Line(text=trimmed, appended=True)
        return _Line()

    def _remember(self, when: int, platform: str) -> None:
        self.last_ms = when
        self.last_platform = platform
        self.has_entry = True
        self.after_marker = False

    def copy(self) -> NarrativeDocumentParser:
        """The parser as it stands, to go back to or to read ahead with."""
        twin = copy.copy(self)
        twin.warnings = list(self.warnings)
        return twin


def index_of_start(lines: list[str]) -> int:
    """The line of START OF RECORDS or START RECORDS, or 0 (indexOfStart)."""
    for i, line in enumerate(lines):
        if line.strip().startswith(START_OF_RECORDS):
            return i
    return 0


def read_narrative_document(lines: list[str]) -> DocumentRead:
    """Every entry of a narrative document, in its order (collectEntries).

    A line starting with four or six figures and no metadata is a short entry in legacy
    Debrief, so "2000 yds, closing." was an entry at 20:00. Product owner, 15 Oct 2026:
    such a line is text of the entry before when its time is out of order with the
    entries around it (see out_of_order); the lines so read are listed in as_text."""
    out = DocumentRead(NARRATIVE)
    parser = NarrativeDocumentParser()
    start = index_of_start(lines)
    last: DocEntry | None = None
    appended = 0
    for number, raw in enumerate(lines, start=1):
        if number <= start or not raw.strip():
            continue
        text = remove_bad_chars(raw)
        before = parser.copy()
        try:
            read = parser.line(text)
        except _LineError as error:
            out.problems.append(f"Line {number} could not be read: {error}.")
            continue
        except (ValueError, IndexError) as error:
            out.problems.append(f"Line {number} could not be read: {error}.")
            continue
        if read.day_marker:
            continue
        if read.text is None:
            out.preamble += 1
            continue
        if read.text.startswith(END_OF_RECORDS):
            out.stopped_at = read.text
            break
        if read.timed and last is not None and out_of_order(read, before, lines[number:]):
            parser = before  # as if the line had never been read as an entry
            read = _Line(text=text.strip(), appended=True)
            out.as_text.append((number, text.strip()))
        if read.appended:
            if appended < MAX_CONTINUATION and last is not None:
                last.text += "\n" + read.text  # type: ignore[operator]
                appended += 1
            else:
                out.overflow += 1
            continue
        appended = 0
        entry_type = None if read.entry_type in (NO_TYPE, "") else read.entry_type
        last = DocEntry(read.time_ms, read.platform or None, entry_type, read.text, number)  # type: ignore[arg-type]
        out.entries.append(last)
    for entry in out.entries:
        if entry.entry_type == "FCS":
            entry.fcs = parse_fcs(entry.text)
    out.warnings = parser.warnings
    return out


def out_of_order(read: _Line, before: NarrativeDocumentParser, following: list[str]) -> bool:
    """Whether a short entry's time is out of order with the entries around it, so that
    the line is more likely text that starts with a number ("2000 yds, closing.") than
    an entry (product owner, 15 Oct 2026). before is the parser as it was before the
    line; following, the lines after it. The entries after are the next
    LOOKAHEAD_ENTRIES (three), read as if this line were text. Out of order is either:

    - behind: more than LATE_ENTRY_MS (an hour) before the entry before it (or a day
      marker after that entry), as a late entry is written up within the hour. Not if
      the entry was dated by the late-entry rule (23xx just after midnight); nor if the
      entries after it, two at least, are all with it (none more than an hour before
      it) and all more than an hour before the entry before: then it was the entry
      before that was out of order, and the log goes on from here, so a run of numbers
      read as entries does not take the rest of the log with it.
    - ahead: more than an hour after the entry after it, that being the earliest of
      the entries after that are in order with the entry before (not more than an hour
      before it; others are text themselves). The earliest, so that numbers in a row
      ("2000 yds", "2100 yds") do not vouch for each other; a late entry after it,
      within the hour, does not count against it.

    The times compared are after the day corrections: a six-figure DTG's day back is in
    the next month; a four-figure time more than twelve hours back is past midnight. So
    a day rolling over is in order. The last entry of a document, with nothing after
    it, is checked against the entry before only."""
    previous = before.last_ms
    when = read.time_ms
    if previous is None or when is None:
        return False
    after = following_times(before, following)
    if not read.late and when < previous - LATE_ENTRY_MS:
        agree = [t for t in after if when - LATE_ENTRY_MS <= t < previous - LATE_ENTRY_MS]
        return not (len(after) >= 2 and len(agree) == len(after))
    in_order = [t for t in after if t >= previous - LATE_ENTRY_MS]
    return bool(in_order) and when > min(in_order) + LATE_ENTRY_MS


def following_times(before: NarrativeDocumentParser, following: list[str]) -> list[int]:
    """The times of the next LOOKAHEAD_ENTRIES entries in these lines, read ahead from
    the parser as it was before the line in question (as if that line were text)."""
    ahead = before.copy()
    times: list[int] = []
    for raw in following[:LOOKAHEAD_LINES]:
        if not raw.strip():
            continue
        try:
            read = ahead.line(remove_bad_chars(raw))
        except (ValueError, IndexError):
            continue
        if read.text is not None and read.text.startswith(END_OF_RECORDS):
            break
        if read.time_ms is not None and not read.appended:
            times.append(read.time_ms)
            if len(times) == LOOKAHEAD_ENTRIES:
                break
    return times


# --- Rider's narrative ---------------------------------------------------------------


def is_rider(doc: Document) -> bool:
    """The first table's first cell says DTG Start (canImport)."""
    if not doc.tables or not doc.tables[0] or not doc.tables[0][0]:
        return False
    return re.sub(r"\s", "", doc.tables[0][0][0]).upper() == "DTGSTART"


_RIDER_DATE = re.compile(r"([0-9]{2})([0-9]{2})([0-9]{2})Z\s*([A-Za-z]{3})\s*([0-9]{2,4})")
_RIDER_TIME = re.compile(r"([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})")


def rider_start(text: str) -> int:
    """The start DTG, "220000Z JUL 09", to the hour: its minutes and seconds set to
    zero, as legacy tidyDate did."""
    found = _RIDER_DATE.fullmatch(text.strip())
    month = _MONTHS.get(found.group(4).upper()) if found else None
    if not found or month is None:
        raise ValueError(f"the start DTG {text.strip()!r} is not like 220000Z JUL 09")
    day, hours = int(found.group(1)), int(found.group(2))
    return gmt(year_from(found.group(5)), month, day, hours)


def rider_time(text: str) -> int:
    """A time of day, HH:mm:ss, in milliseconds."""
    found = _RIDER_TIME.fullmatch(text.strip())
    if not found:
        raise ValueError(f"{text.strip()!r} is not a time like 04:10:12")
    hours, minutes, seconds = (int(g) for g in found.groups())
    if hours > 23 or minutes > 59 or seconds > 59:
        raise ValueError(f"{text.strip()!r} is not a time that exists")
    return ((hours * 60 + minutes) * 60 + seconds) * 1000


def rider_text(text: str, bearing: int | None, ambiguous: int | None, beam: str | None) -> str:
    """An entry's text as legacy Debrief wrote it: [Brg:92/112, Beam:12/13] text."""
    brg = (
        "" if bearing is None else f"Brg:{bearing}" + ("" if ambiguous is None else f"/{ambiguous}")
    )
    bm = "" if beam is None else f"Beam:{beam}"
    if not brg and not bm:
        return text
    return f"[{brg}{', ' if brg and bm else ''}{bm}] {text}"


def read_rider(doc: Document) -> DocumentRead:
    """A Rider's narrative: its first table (entriesFor). The start DTG's day and hour
    plus each row's time of day; a time earlier than the row before's, by more than
    twelve hours, is on the next day (legacy Debrief kept the first day)."""
    out = DocumentRead(RIDER)
    table = doc.tables[0]
    if len(table) < 2 or len(table[1]) < 5:
        out.problems.append(
            "The table's second row should give the start DTG and, fifth, the platform."
        )
        return out
    try:
        start = rider_start(table[1][0])
    except ValueError as error:
        out.problems.append(f"The start could not be read: {error}.")
        return out
    platform = table[1][4].strip() or None
    if len(doc.tables) > 1:
        out.warnings.append(f"Only the first of the document's {len(doc.tables)} tables was read.")
    day = 0
    last_ms: int | None = None
    last_tod: int | None = None
    for number, row in enumerate(table[3:], start=4):
        if len(row) < 4:
            cells = "1 cell" if len(row) == 1 else f"{len(row)} cells"
            out.problems.append(f"Row {number} has {cells}, not the four of an entry: not read.")
            continue
        time_text, bearing_text, beam_text, text = (c.strip() for c in row[:4])
        prefix = ""
        if time_text:
            try:
                tod = rider_time(time_text)
            except ValueError as error:
                out.problems.append(f"Row {number} could not be read: {error}.")
                continue
            if last_tod is not None and tod < last_tod - 12 * 3_600_000:
                day += 1
                out.warnings.append(
                    f"Row {number}, at {time_text}, passed midnight: read as the next day."
                )
            last_tod = tod
            when = start + day * 86_400_000 + tod
            last_ms = when
        elif last_ms is not None:
            when = last_ms + 1
            last_ms = when
            prefix += DTG_MISSING
        else:
            out.problems.append(f"Row {number} has no time, and no row before it has one.")
            continue
        bearing = ambiguous = None
        if bearing_text and bearing_text.upper() != "NO B":
            if "/" in bearing_text:
                items = [i.strip() for i in bearing_text.split("/")]
                if len(items) == 2 and all(i.isdigit() for i in items):
                    bearing, ambiguous = int(items[0]), int(items[1])
                else:
                    out.problems.append(
                        f"Row {number}: the bearing {bearing_text!r} is not two bearings."
                    )
            elif "-" in bearing_text:
                prefix += f"[Bearing represents arc ({bearing_text}). Not imported.]"
            elif bearing_text.isdigit():
                bearing = int(bearing_text)
            else:
                out.problems.append(f"Row {number}: {bearing_text!r} is not a bearing.")
        beam = None if not beam_text or beam_text.upper() == "NO BM" else beam_text
        written = rider_text(remove_bad_chars(prefix + text), bearing, ambiguous, beam)
        out.entries.append(DocEntry(when, platform, RIDER_TYPE, written, number, bearing=bearing))
    return out


# --- ASW data ------------------------------------------------------------------------


def is_asw_line(line: str) -> bool:
    return line.startswith(("TMPOS", "TIMPOS"))


def is_asw(lines: list[str]) -> bool:
    """Five position lines within the first hundred (canImport)."""
    matches = 0
    for count, line in enumerate(lines, start=1):
        matches += is_asw_line(line)
        if matches >= 5:
            return True
        if count > 100:
            break
    return False


def clean(text: str) -> str:
    """O and o read as nought, a decimal comma as a point, upper case (clean)."""
    return text.replace("O", "0").replace("o", "0").replace(",", ".").strip().upper()


LOCATION_FORMAT_WRONG = "Presumed location format was dd.mm.ss, but it looks like dd.mm.mm: "


def asw_degrees(text: str, decimal_minutes: bool) -> float:
    """Degrees from dd.mm.ss, dd.mm.mm (decimal minutes), dd.mm, or ddmm (getDegreesFor)."""
    try:
        if "." in text:
            parts = text.split(".")
            if len(parts) == 3:
                degs = float(clean(parts[0]))
                if decimal_minutes:
                    return degs + float(clean(parts[1]) + "." + clean(parts[2])) / 60
                mins, secs = float(clean(parts[1])), float(clean(parts[2]))
                if secs >= 60:
                    raise ValueError(LOCATION_FORMAT_WRONG + text)
                return degs + mins / 60 + secs / 3600
            if len(parts) == 2:
                return float(clean(parts[0])) + float(clean(parts[1])) / 60
            raise ValueError(f"Badly formatted location:{text}")
        digits = _value_and_units(text)[0]
        return float(digits[:-2]) + float(digits[-2:]) / 60
    except (ValueError, IndexError) as error:
        if str(error).startswith((LOCATION_FORMAT_WRONG, "Badly")):
            raise
        raise ValueError(f"Couldn't extract location form:{text}") from None


def asw_hemisphere(text: str) -> float:
    cleaned = clean(text)
    last = cleaned[-1:]
    if last in ("N", "E"):
        return 1.0
    if last in ("S", "W"):
        return -1.0
    raise ValueError(f"Not a valid hemisphere:{last} from:{cleaned}")


def asw_location(text: str, depth: str | None) -> tuple[float, float]:
    """Latitude and longitude (locationFor). A depth in feet means the minutes are
    decimal, dd.mm.mm, as legacy Debrief took it."""
    decimal_minutes = depth is not None and "FT" in depth.upper()
    if "-" in text:
        parts = text.split("-")
    elif "/" in text:
        parts = text.split("/")
    else:
        raise ValueError("Location separator not found")
    lat_text, lon_text = parts[0], parts[1]
    lat = asw_hemisphere(lat_text) * asw_degrees(clean(lat_text)[:-1], decimal_minutes)
    if abs(lat) > 90:
        raise ValueError(f"Latitude out of limits:{lat_text}")
    lon = asw_hemisphere(lon_text) * asw_degrees(clean(lon_text)[:-1], decimal_minutes)
    if abs(lon) > 180:
        raise ValueError(f"Longitude out of limits:{lon_text}")
    return lat, lon


def _value_and_units(text: str) -> list[str]:
    cleaned = clean(text)
    return [p for p in re.split(r"[^A-Z.0-9]+|(?<=[A-Z])(?=[0-9])|(?<=[0-9])(?=[A-Z])", cleaned)]


def asw_course(text: str | None) -> float:
    if not text:
        return 0.0
    at = text.find("T")
    if at == -1:
        raise ValueError(f"Course not formatted correctly (expect 123T):{text}")
    return float(clean(text[:at]))


def asw_speed_kn(text: str | None) -> float:
    if not text:
        return 0.0
    parts = _value_and_units(text)
    if len(parts) != 2:
        raise ValueError(f"Speed not formatted correctly (expected 23KTS):{text}")
    value, units = float(parts[0]), parts[1]
    if units == "KTS":
        return value
    if units == "MS":
        return value * 3600 / 1852
    raise ValueError(f"Speed units not recognised:{text}")


def asw_depth_m(text: str | None) -> float:
    if not text:
        return 0.0
    parts = _value_and_units(text)
    if len(parts) != 2:
        raise ValueError(f"Depth not formatted correctly (expected 23M or 12FT):{text}")
    value, units = float(clean(parts[0])), parts[1]
    if units == "M":
        return value
    if units == "FT":
        return value * 0.3048
    raise ValueError(f"Depth units not recognised:{text}")


_ASW_DATE = re.compile(r"([0-9]{2})([0-9]{2})([0-9]{2})Z([A-Za-z]{3})")


def asw_time(text: str, year: int) -> int:
    """ddHHmmZMMM, in the year given (dateFor)."""
    if "Z" not in text:
        raise ValueError(f"Wrongly formatted date (expected 123245ZJAN):{text}")
    found = _ASW_DATE.fullmatch(text.strip())
    month = _MONTHS.get(found.group(4).upper()) if found else None
    if not found or month is None:
        raise ValueError(f"Badly formatted date:{text}")
    day, hours, minutes = (int(found.group(i)) for i in (1, 2, 3))
    try:
        return gmt(year, month, day, hours, minutes)
    except ValueError:
        raise ValueError(f"Badly formatted date:{text}") from None


def asw_year(line: str) -> int | None:
    """The year a TIMPD line gives: a four-figure token from 2016 to 2029 (yearFor)."""
    if not line.startswith("TIMPD"):
        return None
    for token in line.split("/"):
        token = token.strip()
        if len(token) == 4 and token.isdigit() and 2015 < int(token) < 2030:
            return int(token)
    raise ValueError(f"Failed to extract year from TIMPD:{line}")


def asw_fix(line: str, year: int, track: str) -> RepFix:
    """A TMPOS line as a fix (fixFor)."""
    if not is_asw_line(line):
        raise ValueError("Not a position line")
    tokens = line.split("/")
    if len(tokens) < 5:
        raise ValueError(f"Insufficient token in string (expected 5):{line}")
    when = asw_time(tokens[1], year)
    position, at = tokens[3], 4
    if "-" not in position:
        position, at = position + "/" + tokens[4], 5
    rest = [clean(t) for t in tokens[at : at + 3]] + [None, None, None]
    course, speed, depth = rest[0], rest[1], rest[2]
    lat, lon = asw_location(position, depth)
    return RepFix(
        time_ms=when,
        time_truncated=False,
        track=track,
        symbology="@E",  # yellow, as legacy Debrief drew an ASW track
        latitude=lat,
        longitude=lon,
        course_deg=asw_course(course),
        speed_kn=asw_speed_kn(speed),
        depth_m=asw_depth_m(depth),
    )


def read_asw(lines: list[str], track: str, default_year: int) -> DocumentRead:
    """Every position line, as fixes of one track; TIMPD lines give the year, which is
    otherwise the year given (legacy Debrief used the current year)."""
    out = DocumentRead(ASW)
    year: int | None = None
    for number, line in enumerate(lines, start=1):
        try:
            if line.startswith("TIMPD"):
                year = asw_year(line)
            elif is_asw_line(line):
                out.fixes.append(asw_fix(line, year or default_year, track))
        except ValueError as error:
            out.problems.append(f"Line {number} could not be read: {error}.")
    if out.fixes and year is None:
        out.warnings.append(f"No TIMPD line gives the year: {default_year} was taken.")
    out.fixes.sort(key=lambda f: f.time_ms)
    return out


# --- Dated narrative -----------------------------------------------------------------

_DATED = re.compile(r"\s*[0-9]{4},[0-9]{1,2},[0-9]{1,2},[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?,")


def is_dated(lines: list[str]) -> bool:
    return any(_DATED.match(line) for line in lines[:200])


def read_dated(lines: list[str]) -> DocumentRead:
    """yyyy,MM,dd,HH:mm[:ss],type,platform,text lines (ImportWordDummy)."""
    out = DocumentRead(DATED)
    for number, raw in enumerate(lines, start=1):
        line = remove_bad_chars(raw).strip()
        if not line:
            continue
        parts = line.split(",")
        if len(parts) <= 5 or not _DATED.match(line):
            if out.entries:
                out.problems.append(f"Line {number} is not an entry: it was not read.")
            else:
                out.preamble += 1
            continue
        clock = [int(p) for p in parts[3].strip().split(":")] + [0]
        try:
            when = gmt(int(parts[0]), int(parts[1]), int(parts[2]), clock[0], clock[1], clock[2])
        except ValueError:
            out.problems.append(
                f"Line {number} could not be read: its date is not one that exists."
            )
            continue
        entry_type, platform = parts[4].strip() or None, parts[5].strip() or None
        text = ",".join(parts[6:]).strip()
        if not text:
            out.problems.append(f"Line {number} could not be read: it has no text.")
            continue
        out.entries.append(DocEntry(when, platform, entry_type, text, number))
    return out


# --- Which dialect -------------------------------------------------------------------


def read_dialect(
    doc: Document, *, track: str = "ASW track", default_year: int = 2026
) -> DocumentRead:
    """The document read in its dialect, chosen as legacy Debrief chose: a Rider's
    table first, then ASW data, then (new here) dated lines, then a narrative document."""
    if is_rider(doc):
        return read_rider(doc)
    lines = doc.paragraphs
    if is_asw(lines):
        return read_asw(lines, track, default_year)
    if is_dated(lines):
        return read_dated(lines)
    return read_narrative_document(lines)
