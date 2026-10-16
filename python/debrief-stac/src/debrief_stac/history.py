"""A plot's history, kept inside its plot file: steps, replay, undo, integrity and conflicts.

One file, history included (decision 13 Oct). The plot file holds three things:

    content          the plot: features, named sets, provenance (SUB-05)
    the island       view state, on the whole-plot feature's view (SUB-22)
    history          every step, as the top-level member history (SUB-19)

so an analyst can pass the one file to a colleague and pass undo, redo, going
back to a step and every provenance record with it. Each step holds the
operation and its output, so replay applies outputs and never needs the tool
or the source files (decision 11 Oct): a source's first import is itself a
step whose output is Debrief GeoJSON. Undo moves the current step back; a
change made after undoing marks the undone steps abandoned, kept on record
(SUB-19, SUB-21). All history is kept, always: nothing caps or folds it.

Every change rewrites the whole file atomically, through a temporary file
renamed over it (NFR-11), so the file on disk is always the whole old plot or
the whole new one: a crash loses at most the change in progress (NFR-10).

Integrity. The history is a hash chain (debrief_schemas.chain): each step's
step_hash covers the step and the one before it, so a step altered, removed
or reordered is noticed, and the current step's result_hash must be the hash
of the content in the file. Content hashes leave out the island and the
history: the island because it is view state, the history because it records
content hashes. A history whose chain is broken is never trusted: the plot is
shown as its file holds it and nothing is written to it. Content that does
not match an intact history (an edit made outside Debrief) is never trusted
silently either: a writer keeps the file aside and rebuilds the plot from its
history, and says so; a reader shows the rebuilt plot and says so. The
checksums are not a signature: anyone can work them out again over a changed
step. So a plot rebuilt by replay (to undo, to repair, on adding a received
file) must be the plot its step recorded, and pass every rule, or nothing is
written: a forged history can make a plot read-only, never make Debrief write
a broken one.

Nobody locks a plot while an analyst has it open (SUB-29). A writer says
which state it read (its Base); if the plot has moved on since, the change
is refused as a Conflict, or merged when it touches different features from
the changes made meanwhile (SUB-28, SUB-29). Each write holds a short lock
(milliseconds) so that two processes cannot interleave their writes.

The island is written only by write_view, which refuses if it changed since
the writer read it, and never touches the content or the history. A change
of content keeps whatever island is on disk when it is written, read under
the lock.

A plot made before history lived in its plot file has a history folder
beside it (history/000001.json ..., history/head.json). The first writer to
open it moves that history into the plot file, checks the result replays to
the same content, and only then removes the folder. A reader that cannot
write folds it in memory.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import time as clock
from collections import OrderedDict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from debrief_kernel.time import format_utc
from debrief_schemas import (
    SCHEMA_VERSION,
    DebriefFeatureCollection,
    DocumentKind,
    DocumentValidationError,
    SchemaVersionError,
    dump_document,
    load_document,
    load_view,
    models,
)
from debrief_schemas.chain import (
    GENESIS_HASH,
    HISTORY_MEMBER,
    UNHASHED,
    content_of,
    pointer_problems,
    step_hash,
    text_hash,
)
from debrief_schemas.documents import dump_history_step, load_history_step
from debrief_schemas.island import (
    PLOT_KIND,
    dump_json,
    plot_feature,
    set_view_in,
    strip_feature_view,
    view_hash_text,
    view_in,
    with_view,
)
from debrief_stac.store import StoreBusy

if TYPE_CHECKING:
    from debrief_stac.catalogue import Catalogue

LOCK = ".lock"  # in the item's folder, beside the plot file
LEGACY_FOLDER = "history"
LEGACY_HEAD = "head.json"
LEGACY_DELTA = re.compile(r"^(\d{6})\.json$")

Feature = (
    models.TrackFeature
    | models.AnnotationFeature
    | models.SensorObservationsFeature
    | models.PlotFeature
)
View = dict  # a plot's island as JSON: the whole-plot feature's view

DAMAGED = (
    "This plot's history has been changed outside Debrief: {why}. Debrief shows the plot "
    "as its file holds it, but will not change it. Ask whoever sent it for a fresh copy."
)
INTERRUPTED = (
    "A save was interrupted before it finished, so the plot is as it was before that "
    "change. Nothing else was lost."
)
MISMATCH = (
    "This plot's history does not match its content: it may have been edited outside Debrief."
)
UNREBUILDABLE = "replaying its history does not give the plot it records at step {seq}"


class HistoryError(Exception):
    """The history cannot do what was asked. The message is for the analyst."""


class NoPlotDetails(HistoryError):
    """The plot has no whole-plot feature, so no island: nowhere to keep a view."""


class Conflict(HistoryError):
    """The plot changed since the writer read it (SUB-28)."""

    def __init__(self, message: str, mergeable: bool):
        super().__init__(message)
        self.mergeable = mergeable


@dataclass
class Changes:
    """What one operation does to a plot."""

    added: list[Feature] = field(default_factory=list)
    modified: list[Feature] = field(default_factory=list)
    deleted_ids: list[str] = field(default_factory=list)
    named_sets: list[models.NamedSet] = field(default_factory=list)
    deleted_named_set_ids: list[str] = field(default_factory=list)
    # Feature ids in the order the plot holds them after the change, when that
    # is not the natural order (features kept in place, added ones last).
    order: list[str] | None = None

    def touched(self) -> set[str]:
        """What this change touches, for merging (SUB-29): features, named sets,
        and the features a named set it writes refers to."""
        return (
            {f.id for f in self.added + self.modified}
            | set(self.deleted_ids)
            | {f"set:{s.id}" for s in self.named_sets}
            | {i for s in self.named_sets for i in s.feature_ids}
            | {f"set:{i}" for i in self.deleted_named_set_ids}
            | ({"order"} if self.order else set())
        )

    def changes_anything(self) -> bool:
        return bool(self.touched())

    @classmethod
    def of(cls, step: models.HistoryStep | models.Delta) -> Changes:
        return cls(
            list(step.added or []),
            list(step.modified or []),
            list(step.deleted_ids or []),
            list(step.named_sets or []),
            list(step.deleted_named_set_ids or []),
            list(step.order) if step.order else None,
        )


@dataclass(frozen=True)
class Base:
    """The state a writer read, so a change made meanwhile is never overwritten."""

    current: int
    plot_hash: str


@dataclass(frozen=True)
class Head:
    """Where a plot's history stands: its current step, its latest, and the content's hash."""

    current: int
    latest: int
    plot_hash: str


@dataclass(frozen=True)
class Step:
    seq: int
    records: list[models.ProvRecord]
    status: str  # "applied", "undone" (can be redone) or "abandoned"
    after: int = 0  # the step it was made after: what undoing it goes back to
    # It changes nothing but the plot's records, as the step recording that a plot file
    # was added does: undo and redo take it with the change before it.
    records_only: bool = False


# A UTF-16 surrogate written as an escape: legal JSON, but alone it is not text, and
# could not be hashed or written. Debrief never writes one.
_SURROGATE_ESCAPE = re.compile(r"\\u[dD][89a-fA-F]")


def _not_json(name: str) -> None:
    raise ValueError(f"{name} is not JSON")  # NaN and Infinity, which Python reads


def _finite(text: str) -> float:
    value = float(text)
    if not math.isfinite(value):
        raise ValueError(f"{text} is too large a number")
    return value


def _parsed(text: str) -> object | None:
    """The JSON in a plot file, or None if it is not JSON Debrief can read and write
    again: badly formed, nested too deeply to read, holding text that is not Unicode,
    or a number that is not finite."""
    try:
        # A number too large for a float, such as 1e999, is legal JSON but read as
        # infinity, which JSON cannot hold: the file could not be written again.
        document = json.loads(text, parse_constant=_not_json, parse_float=_finite)
        if _SURROGATE_ESCAPE.search(text):
            json.dumps(document, ensure_ascii=False).encode("utf-8")  # a lone one fails
    except (ValueError, RecursionError):  # UnicodeEncodeError is a ValueError
        return None
    return document


def _digest(text: str) -> bytes:
    return hashlib.sha256(text.encode("utf-8")).digest()


# --- A plot file's content and island, from its text ---------------------------

# The last plot files split, by the digest of their text: each one's content
# text and island. Splitting parses the whole file, slow for a large plot, and
# the same file is split several times a change.
_SPLIT: dict[bytes, tuple[str, View | None]] = {}
_SPLIT_KEPT = 2


def _remember(text: str, content: str, view: View | None, digest: bytes | None = None) -> None:
    while len(_SPLIT) >= _SPLIT_KEPT:
        _SPLIT.pop(next(iter(_SPLIT)))
    _SPLIT[digest or _digest(text)] = (content, copy.deepcopy(view))


def _split(text: str) -> tuple[str, View | None]:
    """A plot file's content text, and its island as found (not checked)."""
    if '"view"' not in text and f'"{HISTORY_MEMBER}"' not in text:
        return text, None  # neither island nor history: its own content
    found = _SPLIT.get(_digest(text))
    if found is None:
        document = _parsed(text)
        if not isinstance(document, dict):
            return text, None
        found = (dump_json(content_of(document)), view_in(document))
        _remember(text, *found)
    return found


def content_text(text: str) -> str:
    """A plot file's content: its text without its island and its history, as Debrief
    writes it. What every content hash is taken over."""
    return _split(text)[0]


def content_hash(text: str) -> str:
    """The hash the history records for a plot file: its content's."""
    return text_hash(content_text(text))


def view_hash(view: View | None) -> str:
    """The hash of an island, to pass back to write_view; the same for any layout."""
    return text_hash(view_hash_text(view))


def island_of(text: str | None) -> View | None:
    """The island in a plot file, or None. One that is not valid is left out."""
    view = _split(text)[1] if text is not None else None
    return _valid_view(view)


def _valid_view(view: View | None) -> View | None:
    if view is None:
        return None
    try:
        load_view(view)
    except (DocumentValidationError, ValueError):
        return None
    return copy.deepcopy(view)


def with_island(text: str, view: View | None) -> str:
    """A plot's content text with an island put in. A plot with no whole-plot
    feature has nowhere to keep one, so its text is returned as it is."""
    if view is None:
        return text
    document = json.loads(text)
    if not set_view_in(document, view):
        return text
    return dump_json(document)


def _with_island_fast(text: str, plot: DebriefFeatureCollection, view: View | None) -> str:
    """with_island without parsing the whole plot: the whole-plot feature is found in
    the text as dump_document wrote it, and replaced. Falls back to parsing."""
    feature = plot_feature(plot) if view is not None else None
    if feature is None:
        return with_island(text, view)
    raw = feature.model_dump(mode="json", by_alias=True, exclude_none=True)
    raw.setdefault("geometry", None)
    indent = "\n    "  # a feature in the plot's features list
    before = json.dumps(raw, indent=2, ensure_ascii=False).replace("\n", indent)
    raw["properties"]["view"] = view
    after = json.dumps(raw, indent=2, ensure_ascii=False).replace("\n", indent)
    at = text.find(f"{indent}{before},") if f"{indent}{before}," in text else -1
    if at < 0:
        at = text.find(f"{indent}{before}\n")
    if at < 0:
        return with_island(text, view)
    start = at + len(indent)
    return text[:start] + after + text[start + len(before) :]


def empty_plot() -> DebriefFeatureCollection:
    return DebriefFeatureCollection(
        type="FeatureCollection", schema_version=SCHEMA_VERSION, features=[], provenance=[]
    )


_EMPTY: list[str] = []


def _empty_hash() -> str:
    if not _EMPTY:
        _EMPTY.append(text_hash(dump_document(DocumentKind.PLOT, empty_plot())))
    return _EMPTY[0]


def apply(
    plot: DebriefFeatureCollection, records: Iterable[models.ProvRecord], changes: Changes
) -> DebriefFeatureCollection:
    """The plot with one change applied. Refuses a change that does not fit the plot."""
    ids = [f.id for f in plot.features]
    modified = {f.id: f for f in changes.modified}
    deleted = set(changes.deleted_ids)
    missing = (set(modified) | deleted) - set(ids)
    if missing:
        raise HistoryError(
            f"The change refers to a feature the plot does not have: {sorted(missing)[0]}"
        )
    clash = {f.id for f in changes.added} & (set(ids) - deleted)
    if clash:
        raise HistoryError(
            f"The change adds a feature whose id is already used: {sorted(clash)[0]}"
        )
    if any(
        f.properties.kind == PLOT_KIND
        and (f.id in deleted or (f.id in modified and modified[f.id].properties.kind != PLOT_KIND))
        for f in plot.features
    ):
        # Deleted, or replaced by a feature of another kind: either way the plot
        # would lose its details, and the island with them.
        raise HistoryError("The plot's own details cannot be deleted.")
    features = [modified.get(f.id, f) for f in plot.features if f.id not in deleted]
    features += changes.added
    if changes.order:
        by_id = {f.id: f for f in features}
        if sorted(changes.order) != sorted(by_id):
            raise HistoryError("The change's feature order does not match the plot's features.")
        features = [by_id[i] for i in changes.order]
    sets = {s.id: s for s in plot.named_sets or []}
    for set_id in changes.deleted_named_set_ids:
        sets.pop(set_id, None)
    sets.update({s.id: s for s in changes.named_sets})
    return plot.model_copy(
        update={
            "features": features,
            "named_sets": list(sets.values()) or None,
            "provenance": [*(plot.provenance or []), *records],
            "history": None,
        }
    )


# --- Steps and plot files in memory --------------------------------------------


class _Step:
    """One step of a history: as JSON without its state and hash, its hash, and,
    built when first needed, its model and its text in the file for each state."""

    __slots__ = ("raw", "hash", "_model", "_texts")

    def __init__(self, raw: dict[str, Any], hash_: str, model: Any = None):
        self.raw = raw
        self.hash = hash_
        self._model = model
        self._texts: dict[str, str] = {}

    @property
    def seq(self) -> int:
        return self.raw["seq"]

    @property
    def after(self) -> int:
        return self.raw["after"]

    @property
    def result_hash(self) -> str:
        return self.raw["result_hash"]

    def model(self) -> models.HistoryStep:
        if self._model is None:
            self._model = models.HistoryStep.model_validate(self.as_json("applied"))
        return self._model

    def records_only(self) -> bool:
        """Whether it changes nothing on the plot, only its records."""
        return not any(self.raw.get(name) for name in _CHANGES)

    def records(self) -> list[models.ProvRecord]:
        if self._model is not None:
            return list(self._model.records)
        return [models.ProvRecord.model_validate(r) for r in self.raw["records"]]

    def as_json(self, state: str) -> dict[str, Any]:
        rest = {k: v for k, v in self.raw.items() if k != "seq"}
        return {"seq": self.seq, "state": state, **rest, "step_hash": self.hash}

    def text(self, state: str) -> str:
        """The step as it is written in the plot file: one line, compact. Indenting a
        step's coordinates as the content is indented would make the history several
        times the size of the plot; one line a step keeps it readable and diffable."""
        if state not in self._texts:
            self._texts[state] = json.dumps(
                self.as_json(state), ensure_ascii=False, separators=(",", ":"), allow_nan=False
            )
        return self._texts[state]


# The members of a step that change the plot's features or named sets.
_CHANGES = ("added", "modified", "deleted_ids", "named_sets", "deleted_named_set_ids", "order")


def _stripped(raw: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in raw.items() if k not in UNHASHED}


def _states(steps: list[_Step], current: int) -> list[str]:
    _, states = pointer_problems([(s.seq, s.after, None) for s in steps], current)
    return states


@dataclass
class _File:
    """A plot file as read: content text, island, history; and what is wrong with it."""

    content: str
    view: View | None
    current: int
    steps: list[_Step]
    has_history: bool = True
    problem: str | None = None  # why the history cannot be trusted, for the analyst
    digest: bytes = b""
    stat: tuple[int, ...] | None = None
    # The content as a model, when this process made it: kept with the very text it
    # was dumped to, so a plot read for the next change is not built again.
    model: tuple[str, DebriefFeatureCollection] | None = field(default=None, repr=False)

    @property
    def latest(self) -> int:
        return len(self.steps)

    # The content's hash, kept with the very text it was taken over: a large plot's
    # content is tens of megabytes, and its hash is asked for several times a change.
    _hashed: tuple[str, str] | None = field(default=None, repr=False, compare=False)

    @property
    def plot_hash(self) -> str:
        if self._hashed is None or self._hashed[0] is not self.content:
            self._hashed = (self.content, text_hash(self.content))
        return self._hashed[1]

    @property
    def expected_hash(self) -> str:
        return self.steps[self.current - 1].result_hash if self.current else _empty_hash()

    def matches(self) -> bool:
        """Whether the content is what the history says it is."""
        return self.plot_hash == self.expected_hash

    def head(self) -> Head:
        return Head(self.current, self.latest, self.plot_hash)

    def chain(self, upto: int) -> list[int]:
        seqs = []
        while upto:
            seqs.append(upto)
            upto = self.steps[upto - 1].after
        return seqs[::-1]

    def history_text(self) -> str:
        """The history member as it is written, at its place in the file."""
        states = _states(self.steps, self.current)
        head = self.steps[-1].hash if self.steps else GENESIS_HASH
        if self.steps:
            body = ",\n      ".join(
                s.text(state) for s, state in zip(self.steps, states, strict=True)
            )
            steps = f"[\n      {body}\n    ]"
        else:
            steps = "[]"
        return (
            f'{{\n    "current": {self.current},\n    "head_hash": "{head}",\n'
            f'    "steps": {steps}\n  }}'
        )


def compose(content_and_island: str, history: _File) -> str:
    """The whole plot file: content with its island, as dump_document writes it, then
    the history, last, one step a line. Built from text already made, never by
    dumping the whole document again."""
    if not content_and_island.endswith("\n}\n"):
        raise HistoryError("The plot could not be written: its content is not as expected.")
    return f'{content_and_island[:-3]},\n  "{HISTORY_MEMBER}": {history.history_text()}\n}}\n'


# The plot files last read or written, by path: each one as read, with its
# steps, so a file read again unchanged is not parsed again, and a file another
# process changed has only its new steps checked.
_FILES: OrderedDict[str, _File] = OrderedDict()
_FILES_KEPT = 4


def _keep(key: str, file: _File) -> None:
    _FILES[key] = file
    _FILES.move_to_end(key)
    while len(_FILES) > _FILES_KEPT:
        _FILES.popitem(last=False)


def _read_steps(raw_history: Any, previous: _File | None) -> tuple[list[_Step], int, str | None]:
    """Check a history as read: every step valid and on the chain, the numbers and
    pointers sound. Steps already checked, unchanged, are not checked again."""
    if not (
        isinstance(raw_history, dict)
        and type(raw_history.get("current")) is int
        and isinstance(raw_history.get("steps"), list)
    ):
        return [], 0, "its history cannot be read"
    known = previous.steps if previous is not None and previous.problem is None else []
    steps: list[_Step] = []
    hash_ = GENESIS_HASH
    for index, raw in enumerate(raw_history["steps"]):
        if not isinstance(raw, dict):
            return steps, 0, f"step {index + 1} of its history cannot be read"
        stripped = _stripped(raw)
        given = raw.get("step_hash")
        if index < len(known) and known[index].hash == given and known[index].raw == stripped:
            steps.append(known[index])
            hash_ = given
            continue
        try:
            model = load_history_step(raw)
        except (DocumentValidationError, ValueError) as error:
            return steps, 0, f"step {index + 1} of its history cannot be read ({error})"
        if step_hash(raw, hash_) != given:
            return steps, 0, f"step {index + 1} of its history is not as Debrief recorded it"
        steps.append(_Step(stripped, given, model))
        hash_ = given
    if raw_history.get("head_hash") != hash_:
        return steps, 0, "the last step of its history is missing or was changed"
    current = raw_history["current"]
    problems, _ = pointer_problems(
        [
            (s.seq, s.after, raw.get("state"))
            for s, raw in zip(steps, raw_history["steps"], strict=True)
        ],
        current,
    )
    if problems:
        return steps, 0, problems[0]
    return steps, current, None


class History:
    """The history of one plot in a catalogue. Make a new one (Catalogue.history)
    for each operation; what it reads is shared through a cache of plot files."""

    def __init__(self, catalogue: Catalogue, item_id: str):
        self.catalogue = catalogue
        self.item_id = item_id
        self.store = catalogue.store
        self._legacy_folder = f"{item_id}/{LEGACY_FOLDER}"
        self._plot_path = catalogue.plot_path(item_id)
        self._key = f"{getattr(self.store, 'root', id(self.store))}/{self._plot_path}"

    # --- Reading the file -------------------------------------------------------

    def _read_plot_text(self) -> str | None:
        try:
            return self.store.read_text(self._plot_path)
        except FileNotFoundError:
            return None
        except UnicodeDecodeError:
            raise HistoryError("The plot file cannot be read: it is not a plot.") from None

    def _read(self, *, for_reading: bool = False) -> _File | None:
        """The plot file as it is now, checked; None if there is none.

        for_reading: only to show the plot, never to change it. A file whose size,
        modification time and file number are as this process last saw it is then taken as
        unchanged, without reading it again (a large plot is tens of megabytes).
        A writer always reads it, under the lock: a filesystem that keeps
        modification times coarsely could otherwise hide another's change.
        """
        try:
            stat = self.store.version(self._plot_path)
        except FileNotFoundError:
            stat = None
        cached = _FILES.get(self._key)
        if for_reading and cached is not None and stat is not None and cached.stat == stat:
            return cached
        text = self._read_plot_text()
        if text is None:
            return None
        digest = _digest(text)
        if cached is not None and cached.digest == digest:
            cached.stat = stat
            return cached
        document = _parsed(text)
        if not isinstance(document, dict):
            raise HistoryError("The plot file cannot be read: it is not a plot.")
        found = document.get("schema_version")
        if found != SCHEMA_VERSION:
            raise SchemaVersionError(found if isinstance(found, str) else None)
        content = dump_json(content_of(document))
        view = view_in(document)
        if HISTORY_MEMBER not in document:
            file = _File(content, view, 0, [], has_history=False)
        else:
            steps, current, problem = _read_steps(document[HISTORY_MEMBER], cached)
            file = _File(content, view, current, steps, problem=problem)
        file.digest, file.stat = digest, stat
        _keep(self._key, file)
        return file

    def _write(
        self,
        file: _File,
        plot: DebriefFeatureCollection | None,
        content_and_island: str,
        before: _File | None,
    ) -> None:
        """Write the whole plot file atomically (NFR-11). Hold the lock.

        before is the file as read under the lock: if it has changed since (a
        writer that did not take the lock), nothing is written.
        """
        if before is not None and before.stat is not None:
            try:
                now = self.store.version(self._plot_path)
            except FileNotFoundError:
                now = None
            if now != before.stat:
                raise Conflict(
                    "Someone else changed the plot at the same moment. Nothing was saved; "
                    "open the plot again to see their change.",
                    mergeable=False,
                )
        text = compose(content_and_island, file)
        if plot is not None:
            self.catalogue.store_plot_text(
                self.item_id,
                plot,
                text,
                revision=file.plot_hash,
                origin=file.steps[0].hash if file.steps else None,
            )
        else:
            self.store.write_text_atomic(self._plot_path, text)
        file.digest = _digest(text)
        try:
            file.stat = self.store.version(self._plot_path)
        except OSError:
            file.stat = None
        _keep(self._key, file)
        _remember(text, file.content, file.view, file.digest)

    def _write_content(
        self,
        file: _File,
        plot: DebriefFeatureCollection,
        text: str,
        before: _File | None,
    ) -> None:
        """Write content (text, already dumped and validated) with the island in file."""
        file.content = text
        file.model = (text, plot)
        self._write(file, plot, _with_island_fast(text, plot, _valid_view(file.view)), before)

    # --- Making the history whole ---------------------------------------------

    def _legacy_exists(self) -> bool:
        return self.store.exists(self._legacy_folder)

    def _settled(self) -> tuple[_File, list[str]]:
        """What the plot is, worked out without writing anything, and what was found."""
        file = self._read(for_reading=True)
        if file is not None and file.has_history:
            if file.problem is not None:
                return file, [DAMAGED.format(why=file.problem)]
            if not file.matches():
                try:
                    _, text = self._rebuilt(file, file.current)
                except HistoryError as error:
                    damaged = _File(file.content, file.view, file.current, file.steps)
                    damaged.problem = str(error)
                    return damaged, [DAMAGED.format(why=damaged.problem)]
                rebuilt = _File(text, file.view, file.current, file.steps)
                return rebuilt, [
                    f"{MISMATCH} It is shown as its history records it, and left as it is."
                ]
            return file, []
        if self._legacy_exists():
            folded, notes = self._fold_legacy(file)
            if folded is not None:
                return folded, notes
        return self._baseline(file)

    def _baseline(self, file: _File | None) -> tuple[_File, list[str]]:
        """A history for a plot that has none: one step holding its content."""
        view = file.view if file is not None else None
        plot = load_document(DocumentKind.PLOT, file.content) if file is not None else empty_plot()
        start = _File(dump_document(DocumentKind.PLOT, empty_plot()), view, 0, [])
        if not (plot.features or plot.named_sets or plot.provenance):
            return start, []
        records = list(plot.provenance or []) or [baseline_record()]
        changes = Changes(list(plot.features), named_sets=list(plot.named_sets or []))
        new, _, text = self._step(start, empty_plot(), records, changes)
        new.content = text
        return new, ["Started this plot's history from its saved content."]

    def _repair(self) -> list[str]:
        """Make the plot file whole, writing it if need be. Hold the lock."""
        file = self._read()
        if file is not None and file.has_history:
            if file.problem is not None:
                return [DAMAGED.format(why=file.problem)]
            notes = []
            if not file.matches():
                try:
                    plot, text = self._rebuilt(file, file.current)
                except HistoryError as error:  # nothing to rebuild it from: left as it is
                    return [DAMAGED.format(why=error)]
                kept = self._keep_aside()
                rebuilt = _File(text, file.view, file.current, file.steps)
                self._write_content(rebuilt, plot, text, None)
                notes.append(
                    f"{MISMATCH} It was rebuilt from its history; the file as found is kept "
                    f"as {kept}."
                )
            if self._legacy_exists():  # a move into the plot file, interrupted at the end
                self.store.delete_folder(self._legacy_folder)
            if self._discard_leftovers():
                notes.append(INTERRUPTED)
            return notes
        if self._legacy_exists():
            folded, notes = self._fold_legacy(file)
            if folded is not None:
                self._write_folded(folded, file)
                return notes
            return notes  # cannot be moved: left as it is, read in memory
        new, notes = self._baseline(file)
        plot = load_document(DocumentKind.PLOT, new.content)
        self._write_content(new, plot, new.content, None)
        return notes

    def _discard_leftovers(self) -> int:
        """Clear what a save killed before its rename left beside the plot file. Hold
        the lock. The plot file is the one before that save: nothing else is lost."""
        try:
            return self.store.discard_leftovers(self._plot_path)
        except OSError:
            return 0

    def _whole(self) -> bool:
        file = self._read(for_reading=True)
        return (
            file is not None
            and file.has_history
            and file.problem is None
            and file.matches()
            and not self._legacy_exists()
            and not self.store.leftovers(self._plot_path)
        )

    def recover(self) -> list[str]:
        """Make the plot file whole. Returns what was done, for the analyst.

        - A plot with no history yet (made outside Debrief) gets a first step
          holding its content and all its earlier records.
        - A plot whose history is still in a history folder beside it has it
          moved into the plot file, checked, and the folder removed.
        - A plot whose content does not match its intact history (edited
          outside Debrief) is rebuilt from its history, and the file as found
          is kept aside under another name first. Only content is compared:
          a file that differs in its island alone matches.
        - A plot whose history's chain is broken is left as it is, and the
          analyst is told: nothing will be written to it.
        """
        if self._whole():
            return []
        with self._locked():
            return self._repair()

    def open(self) -> list[str]:
        """recover, for a reader: on a store that cannot be written, says so instead."""
        try:
            return self.recover()
        except StoreBusy:
            return []  # another process is saving; it leaves the plot whole
        except OSError:
            if self._whole():
                return []
            _, notes = self._settled()
            return notes or [
                "This plot needs repairing, but its folder cannot be changed, so it is "
                "shown as its history records it and left as it is."
            ]

    def _state(self) -> _File:
        """The plot as it stands, made whole first where it can be."""
        try:
            self.recover()
        except (OSError, StoreBusy):
            pass
        file, _ = self._settled()
        return file

    def _writable(self) -> _File:
        """The plot file, whole, for a change. Hold the lock."""
        file = self._read()
        # Read once when it is whole, as it nearly always is; repaired and read again if
        # not. A large plot file is tens of megabytes, read and hashed each time.
        if not (
            file is not None
            and file.has_history
            and file.problem is None
            and file.matches()
            and not self._legacy_exists()
            and not self.store.leftovers(self._plot_path)
        ):
            self._repair()
            file = self._read()
        if file is None or not file.has_history:  # its history folder could not be moved in
            raise HistoryError(
                "This plot's history could not be moved into its plot file, so it cannot "
                "be changed."
            )
        if file.problem is not None:
            raise HistoryError(DAMAGED.format(why=file.problem))
        if not file.matches():  # _repair could not rebuild it
            raise HistoryError(DAMAGED.format(why=UNREBUILDABLE.format(seq=file.current)))
        return file

    # --- Reading ----------------------------------------------------------------

    def head(self) -> Head:
        """Where the history stands: current step, latest step, content hash."""
        return self._state().head()

    def base(self) -> Base:
        head = self.head()
        return Base(head.current, head.plot_hash)

    def problem(self) -> str | None:
        """Why the plot cannot be changed, for the analyst, or None."""
        file = self._state()
        return DAMAGED.format(why=file.problem) if file.problem else None

    def plot(self) -> DebriefFeatureCollection:
        """The plot's content as of its current step, with its island."""
        file = self._state()
        plot = self._content(file)
        view = _valid_view(file.view)
        return with_view(plot, load_view(view)) if view is not None else plot

    def plot_and_revision(self) -> tuple[DebriefFeatureCollection, str]:
        """The plot's content and its revision (content hash), read together, so a
        revision recorded as taken is the one whose data was read (CAP-12)."""
        file = self._state()
        return self._content(file), file.plot_hash

    def origin(self) -> str | None:
        """The step_hash of the history's first step: plots that share it are copies of
        one plot (CAP-10). None for a plot with no steps."""
        file = self._state()
        return file.steps[0].hash if file.steps else None

    def step_hashes(self) -> list[str]:
        """The step_hash of each step on the line to the current step, oldest first."""
        file = self._trusted()
        return [file.steps[seq - 1].hash for seq in file.chain(file.current)]

    def adds_data_after(self, shared: set[str]) -> bool:
        """Whether a step on the line to the current step, not among shared (steps of
        another plot this one was copied from), adds data: imports files, takes data
        from an item, or adds a track or a narrative entry."""
        file = self._trusted()
        for seq in file.chain(file.current):
            step = file.steps[seq - 1]
            if step.hash in shared:
                continue
            for record in step.raw.get("records") or []:
                if isinstance(record, dict) and (record.get("used") or record.get("drawn_from")):
                    return True
            for raw in step.raw.get("added") or []:
                kind = (
                    ((raw or {}).get("properties") or {}).get("kind")
                    if isinstance(raw, dict)
                    else None
                )
                if kind in ("track", "narrative"):
                    return True
        return False

    def view(self) -> tuple[models.PlotView | None, str]:
        """The plot's island, and the hash to pass back to write_view when changing it."""
        view = island_of(self._read_plot_text())
        return load_view(view), view_hash(view)

    def _trusted(self) -> _File:
        file = self._state()
        if file.problem is not None:
            raise HistoryError(DAMAGED.format(why=file.problem))
        return file

    def delta(self, seq: int) -> models.HistoryStep:
        """One step, by its number."""
        file = self._trusted()
        if not 1 <= seq <= file.latest:
            raise HistoryError(f"Step {seq} is not in the plot's history.")
        return file.steps[seq - 1].model()

    step = delta

    def chain(self, upto: int) -> list[int]:
        """The steps replayed to reach a step: follow each step's after link back."""
        return self._trusted().chain(upto)

    def steps(self) -> list[Step]:
        """Every recorded change, oldest first, and whether it is in the plot now."""
        file = self._trusted()
        states = _states(file.steps, file.current)
        return [
            Step(s.seq, s.records(), state, s.after, s.records_only())
            for s, state in zip(file.steps, states, strict=True)
        ]

    def replay(self, upto: int) -> DebriefFeatureCollection:
        """The plot's content as it was after a step, rebuilt from the recorded steps
        (SUB-19). Never needs a source file. Content only: no island, no history."""
        return self._replay(self._trusted(), upto)

    def first_recorded(self, feature_id: str) -> models.TrackFeature | None:
        """A track as the plot first recorded it, in the earliest step on its current
        line that added it: an import's track as imported, before any edit (collation
        carries edits to new fixes from it). None if no step added a track of that id."""
        file = self._trusted()
        for seq in file.chain(file.current):
            for raw in file.steps[seq - 1].raw.get("added") or []:
                if isinstance(raw, dict) and raw.get("id") == feature_id:
                    properties = raw.get("properties") or {}
                    if properties.get("kind") != "track":
                        return None
                    return models.TrackFeature.model_validate(raw)
        return None

    def at_revision(self, revision: str) -> DebriefFeatureCollection | None:
        """The plot's content as it was when its content hash was revision (an earlier
        revision of a catalogue item), replayed; None if no step recorded it."""
        file = self._trusted()
        for step in reversed(file.steps):
            if step.result_hash == revision:
                return self._replay(file, step.seq)
        return None

    @staticmethod
    def _replay(file: _File, upto: int) -> DebriefFeatureCollection:
        plot = empty_plot()
        for seq in file.chain(upto):
            step = file.steps[seq - 1].model()
            plot = apply(plot, step.records, Changes.of(step))
        return plot

    @classmethod
    def _rebuilt(cls, file: _File, upto: int) -> tuple[DebriefFeatureCollection, str]:
        """The plot as of a step, replayed, and its text: refused unless it is the plot
        that step recorded. Only a history put together outside Debrief fails this: its
        checksums can be worked out again, so they cannot vouch for it."""
        try:
            plot = cls._replay(file, upto)
            text = dump_document(DocumentKind.PLOT, plot)
        except (HistoryError, DocumentValidationError):
            raise HistoryError(UNREBUILDABLE.format(seq=upto)) from None
        expected = file.steps[upto - 1].result_hash if upto else _empty_hash()
        if text_hash(text) != expected:
            raise HistoryError(UNREBUILDABLE.format(seq=upto))
        return plot, text

    def _content(self, file: _File) -> DebriefFeatureCollection:
        """The content as a model, to apply a change to. Never changed in place."""
        if file.model is not None and file.model[0] is file.content:
            return file.model[1]
        # Kept with the file, so the plot is built once while the file is unchanged: a
        # plot of sixty thousand narrative entries takes a second to build (NFR-06).
        plot = load_document(DocumentKind.PLOT, file.content)
        file.model = (file.content, plot)
        return plot

    # --- Writing ----------------------------------------------------------------

    def _locked(self):
        return self.store.locked(f"{self.item_id}/{LOCK}")

    def _step(
        self,
        file: _File,
        plot: DebriefFeatureCollection,
        records: list[models.ProvRecord],
        changes: Changes,
    ) -> tuple[_File, DebriefFeatureCollection, str]:
        """The file with one more step, and the new content and its text (not yet in it)."""
        changes = Changes(
            [strip_feature_view(f) for f in changes.added],
            [strip_feature_view(f) for f in changes.modified],
            changes.deleted_ids,
            changes.named_sets,
            changes.deleted_named_set_ids,
            changes.order,
        )
        new_plot = apply(plot, records, changes)
        text = dump_document(DocumentKind.PLOT, new_plot)
        seq = file.latest + 1
        model = models.HistoryStep(
            seq=seq,
            state="applied",
            after=file.current,
            records=records,
            added=changes.added or None,
            modified=changes.modified or None,
            deleted_ids=changes.deleted_ids or None,
            named_sets=changes.named_sets or None,
            deleted_named_set_ids=changes.deleted_named_set_ids or None,
            order=changes.order or None,
            result_hash=text_hash(text),
            step_hash=GENESIS_HASH,
        )
        # Its features are the new content's, checked as it was dumped just now, so only
        # the rest of the step is checked against JSON Schema.
        raw = _stripped(dump_history_step(model))
        previous = file.steps[-1].hash if file.steps else GENESIS_HASH
        hash_ = step_hash(raw, previous)
        step = _Step(raw, hash_, model.model_copy(update={"step_hash": hash_}))
        return _File(file.content, file.view, seq, [*file.steps, step]), new_plot, text

    def commit(
        self,
        records: list[models.ProvRecord],
        changes: Changes,
        base: Base | None = None,
        *,
        merge: bool = False,
    ) -> int:
        """Record a change and apply it to the plot. Returns the new step's number.

        base is the state the change was made against; if the plot has changed
        since, Conflict is raised, unless merge is set and the changes made
        meanwhile touch different features (SUB-29). The plot file is rewritten
        whole and atomically: once this returns, the change is saved; if it
        fails, the file is as it was (NFR-11).
        """
        if not records:
            raise HistoryError("A change needs a record of what made it and who (SUB-24).")
        with self._locked():
            file = self._writable()
            if base is not None and (base.current, base.plot_hash) != (
                file.current,
                file.plot_hash,
            ):
                self._check_merge(file, base, changes, merge)
            return self._commit_locked(file, records, changes)

    def _commit_locked(
        self, file: _File, records: list[models.ProvRecord], changes: Changes
    ) -> int:
        """Record a change and write the plot with it. Hold the lock."""
        new, new_plot, text = self._step(file, self._content(file), records, changes)
        self._write_content(new, new_plot, text, file)
        return new.current

    def _check_merge(self, file: _File, base: Base, changes: Changes, merge: bool) -> None:
        theirs = file.chain(file.current)
        known = base.current == 0 or (
            base.current in theirs and file.steps[base.current - 1].result_hash == base.plot_hash
        )
        if not known or base.current == file.current:
            raise Conflict(
                "The plot was changed elsewhere since you opened it, in a way that cannot be "
                "combined with your change. Save your work as a new plot.",
                mergeable=False,
            )
        since = theirs[theirs.index(base.current) + 1 :] if base.current else theirs
        touched = set().union(*(Changes.of(file.steps[s - 1].model()).touched() for s in since))
        overlap = touched & changes.touched()
        if overlap or not merge:
            raise Conflict(
                f"The plot was changed elsewhere since you opened it ({len(since)} "
                f"change{'s' if len(since) != 1 else ''}). "
                + (
                    "Both changes touch the same features, so they cannot be combined. "
                    "Save your work as a new plot."
                    if overlap
                    else "The changes touch different features: combine them, or save your "
                    "work as a new plot."
                ),
                mergeable=not overlap,
            )

    def check_base(self, base: Base) -> None:
        """Refuse a base that names no recorded state of this plot."""
        file = self._trusted()
        if base.current == 0 or base.current > file.latest:
            ok = base.current == 0
        else:
            ok = file.steps[base.current - 1].result_hash == base.plot_hash
        if not ok:
            raise HistoryError("The plot you started from is not one this plot's history holds.")

    def goto(self, seq: int, base: Base | None = None, *, allow_newer_schema: bool = False) -> None:
        """Undo or redo to a step (SUB-21): replay to it and make it current.

        Only steps on the chain to the latest can be returned to: abandoned
        steps cannot, and neither can the state before the plot's first step.
        """
        self._move(lambda file: seq, base, allow_newer_schema)

    def undo(self, base: Base | None = None, *, allow_newer_schema: bool = False) -> int:
        """Go back one change. Returns the step now current.

        A step that changes only the plot's records, such as the one recording that a
        plot file was added, shows nothing on the plot: it is undone together with the
        change before it, so Undo never seems to do nothing.
        """

        def previous(file: _File) -> int:
            seq = file.current
            while seq and file.steps[seq - 1].records_only() and file.steps[seq - 1].after:
                seq = file.steps[seq - 1].after
            if seq == 0 or file.steps[seq - 1].after == 0:
                raise HistoryError("There is nothing to undo: the plot is as it was imported.")
            return file.steps[seq - 1].after

        return self._move(previous, base, allow_newer_schema)

    def redo(self, base: Base | None = None, *, allow_newer_schema: bool = False) -> int:
        """Go forward one undone change, and any steps after it that change only the
        plot's records. Nothing is redoable once a new change is made."""

        def following(file: _File) -> int:
            if file.current == file.latest:
                raise HistoryError("There is nothing to redo.")
            live = file.chain(file.latest)
            at = live.index(file.current) + 1 if file.current else 0
            while at + 1 < len(live) and file.steps[live[at + 1] - 1].records_only():
                at += 1
            return live[at]

        return self._move(following, base, allow_newer_schema)

    def _move(
        self, choose: Callable[[_File], int], base: Base | None, allow_newer_schema: bool
    ) -> int:
        """Choose a step and make it current, all under the lock."""
        # Undo rewrites the plot file in this version's schema (SUB-35).
        self.catalogue._check_schema(allow_newer_schema)
        with self._locked():
            file = self._writable()
            if base is not None and (base.current, base.plot_hash) != (
                file.current,
                file.plot_hash,
            ):
                raise Conflict(
                    "The plot was changed elsewhere since you opened it. Open it again first.",
                    mergeable=False,
                )
            seq = choose(file)
            if seq < 1 or seq > file.latest or seq not in file.chain(file.latest):
                raise HistoryError(f"Step {seq} cannot be returned to.")
            try:
                # Its features were all checked in the steps that made them, so this is quick.
                plot, text = self._rebuilt(file, seq)
            except HistoryError as error:
                raise HistoryError(f"Step {seq} cannot be returned to: {error}.") from None
            moved = _File(text, file.view, seq, file.steps)
            self._write_content(moved, plot, text, file)
            return seq

    def write_view(self, view: models.PlotView | View | None, expected_hash: str) -> str:
        """Replace the plot's island, and nothing else (SUB-22). Returns its new hash.

        expected_hash is the hash view() gave: if the island has changed since,
        Conflict is raised and nothing is written, so two people changing the
        window never silently overwrite each other (SUB-28). The island is
        never recorded: no step, no provenance, no undo. The plot file is
        rewritten whole and atomically, under the lock, with its content and
        history exactly as they were.
        """
        if isinstance(view, models.PlotView):
            view = view.model_dump(mode="json", exclude_none=True)
        load_view(view)  # validates
        with self._locked():
            file = self._writable()
            current = _valid_view(file.view)
            if view_hash(current) != expected_hash:
                raise Conflict(
                    "The plot's view was changed elsewhere. Debrief is showing the latest.",
                    mergeable=False,
                )
            if view == current:
                return expected_hash
            document = json.loads(file.content)
            if not set_view_in(document, view):
                raise NoPlotDetails("This plot has nowhere to keep its time window.")
            whole = dump_json(document)
            moved = _File(file.content, view, file.current, file.steps)
            self._write(moved, None, whole, file)
        return view_hash(view)

    # --- Copies and received files --------------------------------------------

    def fork_into(self, other: History, upto: int) -> None:
        """Start another plot's history as a copy of this one's first steps, up to and
        including upto, with upto current: the steps and their checksums unchanged."""
        file = self._trusted()
        if not 0 <= upto <= file.latest:
            raise HistoryError(f"Step {upto} is not in the plot's history.")
        steps = file.steps[:upto]
        start = _File("", None, upto, steps)
        plot, text = self._rebuilt(start, upto)
        start.content = text
        with other._locked():
            other._write_content(start, plot, text, None)

    def adopt(self, text: str, records: list[models.ProvRecord] | None, name: str) -> list[str]:
        """Make this (new, empty) plot the plot file received as text, with its whole
        history, then record where it came from as one more step, so earlier steps
        are never rewritten. Refuses a file whose history cannot be trusted."""
        received = _File("", None, 0, [])
        document = _parsed(text)
        if not isinstance(document, dict):
            raise HistoryError(f"{name} is not a plot file.")
        found = document.get("schema_version")
        if found != SCHEMA_VERSION:
            raise SchemaVersionError(found if isinstance(found, str) else None)
        received.content = dump_json(content_of(document))
        received.view = _valid_view(view_in(document))
        plot = load_document(DocumentKind.PLOT, received.content)  # checks the content
        notes = []
        if HISTORY_MEMBER in document:
            steps, current, problem = _read_steps(document[HISTORY_MEMBER], None)
            if problem is not None:
                raise HistoryError(
                    f"{name} was not added: its history has been changed outside Debrief "
                    f"({problem})."
                )
            received.steps, received.current = steps, current
            if not received.matches():
                raise HistoryError(f"{name} was not added. {MISMATCH}")
            try:  # its checksums can be worked out again by anyone, so replay it too
                self._rebuilt(received, current)
            except HistoryError as error:
                raise HistoryError(
                    f"{name} was not added: its history has been changed outside Debrief ({error})."
                ) from None
        else:
            received, notes = self._baseline(received)
            plot = load_document(DocumentKind.PLOT, received.content)
        with self._locked():
            self._write_content(received, plot, received.content, None)
            if records:
                file = self._writable()
                self._commit_locked(file, records, Changes())
        return notes

    # --- The history folder of the earlier layout ------------------------------

    def _fold_legacy(self, file: _File | None) -> tuple[_File | None, list[str]]:
        """The plot with the history in its history folder moved into it, in memory,
        checked: replaying it gives the content its head recorded."""
        deltas, current, notes = self._legacy_deltas()
        if not deltas:
            return None, notes
        steps: list[_Step] = []
        previous = GENESIS_HASH
        for delta in deltas:
            raw = delta.model_dump(mode="json", by_alias=True, exclude_none=True)
            raw.pop("schema_version", None)
            model = models.HistoryStep.model_validate(
                {**raw, "state": "applied", "step_hash": GENESIS_HASH}
            )
            stripped = _stripped(dump_history_step(model))
            hash_ = step_hash(stripped, previous)
            step = _Step(stripped, hash_, model.model_copy(update={"step_hash": hash_}))
            steps.append(step)
            previous = step.hash
        folded = _File("", file.view if file is not None else None, current, steps)
        plot = self._replay(folded, current)
        text = dump_document(DocumentKind.PLOT, plot)
        if text_hash(text) != folded.expected_hash:
            return None, [
                "This plot's history could not be moved into its plot file: replaying it "
                f"does not give the plot it recorded at step {current}. It is left as it is."
            ]
        folded.content = text
        return folded, notes + [
            "This plot's history was moved into its plot file, so the one file now carries it."
        ]

    def _write_folded(self, folded: _File, file: _File | None) -> None:
        plot = load_document(DocumentKind.PLOT, folded.content)
        self._write_content(folded, plot, folded.content, None)
        _FILES.pop(self._key, None)  # read it back from disk, as anyone else would
        check = self._read()
        if (
            check is None
            or check.problem is not None
            or not check.matches()
            or [s.hash for s in check.steps] != [s.hash for s in folded.steps]
            or check.current != folded.current
        ):
            raise HistoryError(
                "This plot's history could not be moved into its plot file; the history "
                "folder is kept."
            )
        self.store.delete_folder(self._legacy_folder)

    def _legacy_deltas(self) -> tuple[list[models.Delta], int, list[str]]:
        """The deltas of a history folder that form its history, and its current step.

        As the earlier layout's recovery did: a lost or damaged head is rebuilt
        with the latest delta current; a delta written but not made current (a
        crash between the two) is finished; a last delta written only in part
        is left out (NFR-10).
        """
        folder = self._legacy_folder
        notes: list[str] = []
        try:
            head = load_document(
                DocumentKind.HISTORY_HEAD, self.store.read_text(f"{folder}/{LEGACY_HEAD}")
            )
        except (FileNotFoundError, DocumentValidationError, ValueError):
            head = None
        seqs = set()
        for name in self.store.files(folder):
            match = LEGACY_DELTA.match(name)
            if match:
                seqs.add(int(match.group(1)))
        deltas: list[models.Delta] = []
        while len(deltas) + 1 in seqs:
            seq = len(deltas) + 1
            try:
                delta = load_document(
                    DocumentKind.DELTA, self.store.read_text(f"{folder}/{seq:06d}.json")
                )
            except (DocumentValidationError, ValueError):
                notes.append(
                    f"A change was interrupted before it was saved (step {seq}); it is lost."
                )
                break
            if delta.seq != seq:
                break
            deltas.append(delta)
        if head is None:
            if deltas:
                notes.append(
                    "The plot's history had lost its record of the current step, so it was "
                    "rebuilt from the recorded changes with the latest change current."
                )
            return deltas, len(deltas), notes
        if len(deltas) < head.latest:
            raise HistoryError(f"Step {len(deltas) + 1} of the plot's history is missing.")
        current = head.current
        for delta in deltas[head.latest :]:
            notes.append(f"Finished saving a change that was interrupted (step {delta.seq}).")
            current = delta.seq
        return deltas, current, notes

    def _keep_aside(self) -> str:
        stamp = format_utc(int(clock.time() * 1000)).replace(":", "")
        kept, n = f"{self._plot_path}.kept-{stamp}", 2
        while self.store.exists(kept):
            kept, n = f"{self._plot_path}.kept-{stamp}-{n}", n + 1
        self.store.copy(self._plot_path, kept)
        return kept.split("/")[-1]


def baseline_record() -> models.ProvRecord:
    now = format_utc(int(clock.time() * 1000))
    return models.ProvRecord(
        id=f"baseline-{now}",
        kind="edit",
        started_at=now,
        ended_at=now,
        agent=models.AgentRef(kind="software_agent", name="debrief-stac"),
        notes=["The plot had content but no record of how it was made."],
    )
