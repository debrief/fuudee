"""A plot's history: every change a delta, replay, undo, recovery and conflicts.

Layout, inside the plot's item folder:

    history/000001.json ...    one Delta per change, never rewritten (SUB-19)
    history/head.json          where the history stands (HistoryHead)
    plot.geojson               the plot as of head.current: a materialised view

A change is written ahead: the delta first, created exclusively so two
writers can never both claim the same number; then the head; then the plot.
A crash at any point loses at most that change, and opening the plot again
finishes or rebuilds it from the deltas (NFR-10). Each delta holds the
operation and its output, so replay applies outputs and never needs the tool
that made them (decision 11 Oct). Undo moves the head back; a change made
after undoing marks the undone deltas abandoned, kept on record (SUB-19, SUB-21).

The deltas are the record; the head and the plot file can be rebuilt from
them. The steps not abandoned always form one chain, ending at the latest,
so a lost or damaged head is rebuilt with the latest step current.

Nobody locks a plot while an analyst has it open (SUB-29). A writer says
which head it read (its Base); if the head has moved since, the change is
refused as a Conflict, or merged when it touches different features from
the changes made meanwhile (SUB-28, SUB-29). Each write holds a short lock
(milliseconds) so that two processes cannot interleave their head writes.
The plot file is never trusted over the history: if it does not match the
head it is rebuilt, and kept aside first if it holds content the history
never recorded (an edit made outside Debrief).
"""

from __future__ import annotations

import hashlib
import re
import time as clock
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from debrief_kernel.time import format_utc
from debrief_schemas import (
    SCHEMA_VERSION,
    DebriefFeatureCollection,
    DocumentKind,
    DocumentValidationError,
    dump_document,
    load_document,
    models,
)
from debrief_stac.store import StoreBusy

if TYPE_CHECKING:
    from debrief_stac.catalogue import Catalogue

HISTORY = "history"
HEAD = "head.json"
LOCK = ".lock"
DELTA_FILE = re.compile(r"^(\d{6})\.json$")

Feature = models.TrackFeature | models.AnnotationFeature | models.SensorObservationsFeature


class HistoryError(Exception):
    """The history cannot do what was asked. The message is for the analyst."""


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
    def of(cls, delta: models.Delta) -> Changes:
        return cls(
            list(delta.added or []),
            list(delta.modified or []),
            list(delta.deleted_ids or []),
            list(delta.named_sets or []),
            list(delta.deleted_named_set_ids or []),
            list(delta.order) if delta.order else None,
        )


@dataclass(frozen=True)
class Base:
    """The head a writer read, so a change made meanwhile is never overwritten."""

    current: int
    plot_hash: str


@dataclass(frozen=True)
class Step:
    seq: int
    records: list[models.ProvRecord]
    status: str  # "applied", "undone" (can be redone) or "abandoned"


def text_hash(text: str) -> str:
    return f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


def empty_plot() -> DebriefFeatureCollection:
    return DebriefFeatureCollection(
        type="FeatureCollection", schema_version=SCHEMA_VERSION, features=[], provenance=[]
    )


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
        }
    )


class History:
    """The history of one plot in a catalogue.

    Deltas never change once written, so each History caches those it reads;
    make a new one (Catalogue.history) for each operation.
    """

    def __init__(self, catalogue: Catalogue, item_id: str):
        self.catalogue = catalogue
        self.item_id = item_id
        self.store = catalogue.store
        self._folder = f"{item_id}/{HISTORY}"
        self._plot_path = catalogue.plot_path(item_id)
        self._deltas: dict[int, models.Delta] = {}

    # --- Reading ----------------------------------------------------------------

    def _delta_path(self, seq: int) -> str:
        return f"{self._folder}/{seq:06d}.json"

    def delta(self, seq: int) -> models.Delta:
        if seq not in self._deltas:
            try:
                delta = load_document(
                    DocumentKind.DELTA, self.store.read_text(self._delta_path(seq))
                )
            except FileNotFoundError:
                raise HistoryError(f"Step {seq} of the plot's history is missing.") from None
            except (DocumentValidationError, ValueError) as error:
                raise HistoryError(
                    f"Step {seq} of the plot's history is damaged: {error}"
                ) from None
            if delta.seq != seq:
                raise HistoryError(f"Step {seq} of the plot's history holds step {delta.seq}.")
            self._deltas[seq] = delta
        return self._deltas[seq]

    def _read_head(self) -> models.HistoryHead | None:
        """The head as stored, or None if there is none or it is damaged."""
        try:
            return load_document(
                DocumentKind.HISTORY_HEAD, self.store.read_text(f"{self._folder}/{HEAD}")
            )
        except FileNotFoundError:
            return None
        except (DocumentValidationError, ValueError):
            return None  # rebuilt from the deltas by recover

    def _read_plot_text(self) -> str | None:
        try:
            return self.store.read_text(self._plot_path)
        except FileNotFoundError:
            return None

    def head(self) -> models.HistoryHead:
        """The head, after making the history whole (see recover).

        Where the store cannot be written (a read-only share), or another
        process is saving, the history is made whole in memory only.
        """
        try:
            self.recover()
        except (OSError, StoreBusy):
            head, _, _ = self._settled()
            if head is not None:
                return head
            raise
        head = self._read_head()
        assert head is not None
        return head

    def base(self) -> Base:
        head = self.head()
        return Base(head.current, head.plot_hash)

    def plot(self) -> DebriefFeatureCollection:
        """The plot as of the head: the plot file if it matches, else replayed."""
        head = self.head()
        text = self._read_plot_text()
        if text is not None and text_hash(text) == head.plot_hash:
            return load_document(DocumentKind.PLOT, text)
        return self.replay(head.current)

    def chain(self, upto: int) -> list[int]:
        """The deltas replayed to reach a step: follow each delta's after link back."""
        seqs = []
        seq = upto
        while seq:
            seqs.append(seq)
            seq = self.delta(seq).after
        return seqs[::-1]

    def steps(self) -> list[Step]:
        """Every recorded change, oldest first, and whether it is in the plot now."""
        head = self.head()
        applied = set(self.chain(head.current))
        live = set(self.chain(head.latest))
        out = []
        for seq in range(1, head.latest + 1):
            status = "applied" if seq in applied else "undone" if seq in live else "abandoned"
            out.append(Step(seq, list(self.delta(seq).records), status))
        return out

    def replay(self, upto: int) -> DebriefFeatureCollection:
        """The plot as it was after a step, rebuilt from the recorded deltas (SUB-19)."""
        plot = empty_plot()
        for seq in self.chain(upto):
            delta = self.delta(seq)
            plot = apply(plot, delta.records, Changes.of(delta))
        return plot

    # --- Writing ----------------------------------------------------------------

    def _locked(self):
        return self.store.locked(f"{self._folder}/{LOCK}")

    def _new_head(self, current: int, latest: int, plot_hash: str) -> models.HistoryHead:
        """A head; the abandoned steps are those off the chain to the latest."""
        live = set(self.chain(latest))
        return models.HistoryHead(
            schema_version=SCHEMA_VERSION,
            current=current,
            latest=latest,
            abandoned=[s for s in range(1, latest + 1) if s not in live] or None,
            plot_hash=plot_hash,
        )

    def _write_head(self, head: models.HistoryHead) -> None:
        self.store.write_text_atomic(
            f"{self._folder}/{HEAD}", dump_document(DocumentKind.HISTORY_HEAD, head)
        )

    def _write_plot(self, plot: DebriefFeatureCollection) -> str:
        text = dump_document(DocumentKind.PLOT, plot)
        self.catalogue.store_plot_text(self.item_id, plot, text)
        return text_hash(text)

    def _current_plot(self, head: models.HistoryHead) -> DebriefFeatureCollection:
        text = self._read_plot_text()
        if text is not None and text_hash(text) == head.plot_hash:
            return load_document(DocumentKind.PLOT, text)
        return self.replay(head.current)

    def commit(
        self,
        records: list[models.ProvRecord],
        changes: Changes,
        base: Base | None = None,
        *,
        merge: bool = False,
    ) -> int:
        """Record a change and apply it to the plot. Returns the new step's number.

        base is the head the change was made against; if the plot has changed
        since, Conflict is raised, unless merge is set and the changes made
        meanwhile touch different features (SUB-29). Once this returns, or
        fails after the delta is written, the change is saved: a later step
        that fails is finished when the plot is next opened.
        """
        if not records:
            raise HistoryError("A change needs a record of what made it and who (SUB-24).")
        with self._locked():
            self._repair()
            head = self._read_head()
            assert head is not None
            if base is not None and (base.current, base.plot_hash) != (
                head.current,
                head.plot_hash,
            ):
                self._check_merge(base, head, changes, merge)
            return self._append(head, self._current_plot(head), records, changes)

    def _append(
        self,
        head: models.HistoryHead,
        plot: DebriefFeatureCollection,
        records: list[models.ProvRecord],
        changes: Changes,
    ) -> int:
        """Write a delta, then the head, then the plot (write-ahead, NFR-10). Hold the lock."""
        new_plot = apply(plot, records, changes)
        text = dump_document(DocumentKind.PLOT, new_plot)
        seq = head.latest + 1
        delta = models.Delta(
            schema_version=SCHEMA_VERSION,
            seq=seq,
            after=head.current,
            records=records,
            added=changes.added or None,
            modified=changes.modified or None,
            deleted_ids=changes.deleted_ids or None,
            named_sets=changes.named_sets or None,
            deleted_named_set_ids=changes.deleted_named_set_ids or None,
            order=changes.order or None,
            result_hash=text_hash(text),
        )
        try:
            self.store.write_text_exclusive(
                self._delta_path(seq), dump_document(DocumentKind.DELTA, delta)
            )
        except FileExistsError:  # a writer that did not take the lock
            raise Conflict(
                "Someone else changed the plot at the same moment. Nothing was saved; "
                "open the plot again to see their change.",
                mergeable=False,
            ) from None
        self._deltas[seq] = delta
        self._write_head(self._new_head(seq, seq, text_hash(text)))
        self._write_plot(new_plot)
        return seq

    def _check_merge(
        self, base: Base, head: models.HistoryHead, changes: Changes, merge: bool
    ) -> None:
        theirs = self.chain(head.current)
        known = base.current == 0 or (
            base.current in theirs and self.delta(base.current).result_hash == base.plot_hash
        )
        if not known or base.current == head.current:
            raise Conflict(
                "The plot was changed elsewhere since you opened it, in a way that cannot be "
                "combined with your change. Save your work as a new plot.",
                mergeable=False,
            )
        since = theirs[theirs.index(base.current) + 1 :] if base.current else theirs
        touched = set().union(*(Changes.of(self.delta(s)).touched() for s in since))
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
        head = self.head()
        if base.current == 0 or base.current > head.latest:
            ok = base.current == 0
        else:
            ok = self.delta(base.current).result_hash == base.plot_hash
        if not ok:
            raise HistoryError("The plot you started from is not one this plot's history holds.")

    def goto(self, seq: int, base: Base | None = None) -> None:
        """Undo or redo to a step (SUB-21): replay to it and move the head there.

        Only steps on the chain to the latest can be returned to: abandoned
        steps cannot, and neither can the state before the plot's first step.
        """
        self._move(lambda head: seq, base)

    def undo(self, base: Base | None = None) -> int:
        """Go back one step. Returns the step now current."""

        def previous(head: models.HistoryHead) -> int:
            if head.current == 0 or self.delta(head.current).after == 0:
                raise HistoryError("There is nothing to undo: the plot is as it was imported.")
            return self.delta(head.current).after

        return self._move(previous, base)

    def redo(self, base: Base | None = None) -> int:
        """Go forward one undone step. Nothing is redoable once a new change is made."""

        def following(head: models.HistoryHead) -> int:
            if head.current == head.latest:
                raise HistoryError("There is nothing to redo.")
            live = self.chain(head.latest)
            return live[live.index(head.current) + 1] if head.current else live[0]

        return self._move(following, base)

    def _move(self, choose, base: Base | None) -> int:
        """Choose a step from the head and move there, all under the lock."""
        with self._locked():
            self._repair()
            head = self._read_head()
            assert head is not None
            if base is not None and (base.current, base.plot_hash) != (
                head.current,
                head.plot_hash,
            ):
                raise Conflict(
                    "The plot was changed elsewhere since you opened it. Open it again first.",
                    mergeable=False,
                )
            seq = choose(head)
            if seq not in self.chain(head.latest):
                raise HistoryError(f"Step {seq} cannot be returned to.")
            plot = self.replay(seq)
            text = dump_document(DocumentKind.PLOT, plot)
            self._write_head(self._new_head(seq, head.latest, text_hash(text)))
            self._write_plot(plot)
            return seq

    # --- Opening: making the history whole -----------------------------------

    def _delta_seqs(self) -> list[int]:
        found = []
        for name in self.store.files(self._folder):
            match = DELTA_FILE.match(name)
            if match:
                found.append(int(match.group(1)))
        return sorted(found)

    def _settled(self) -> tuple[models.HistoryHead | None, list[str], int | None]:
        """Where the history stands, worked out without writing anything.

        Returns the head (None for a plot with no history yet), what was
        found, and the number of a last delta that is unreadable (a crash part
        way through writing it, where the filesystem could not write it whole).
        """
        notes: list[str] = []
        head = self._read_head()
        if head is None:
            seqs = set(self._delta_seqs())
            latest = 0
            while latest + 1 in seqs:
                latest += 1
            if not latest:
                return None, notes, None
            try:
                self.delta(latest)
            except HistoryError:
                latest -= 1  # the last one is unreadable: set aside by _repair
                if not latest:
                    return None, notes, 1
            head = self._new_head(latest, latest, self.delta(latest).result_hash)
            notes.append(
                "The plot's history had lost its record of the current step, so it was "
                "rebuilt from the recorded changes with the latest change current."
            )
        # Finish any change whose delta was written but whose head was not,
        # whatever head was written meanwhile: the delta is the record.
        while self.store.exists(self._delta_path(head.latest + 1)):
            seq = head.latest + 1
            try:
                delta = self.delta(seq)
            except HistoryError:
                return head, notes, seq
            head = self._new_head(seq, seq, delta.result_hash)
            notes.append(f"Finished saving a change that was interrupted (step {seq}).")
        return head, notes, None

    def _repair(self) -> list[str]:
        """Make the history and the plot agree. Hold the lock."""
        stored = self._read_head()
        head, notes, partial = self._settled()
        if partial is not None:
            self.store.rename(self._delta_path(partial), f"{self._folder}/.{partial:06d}.partial")
            notes.append(
                f"A change was interrupted before it was saved (step {partial}); it is lost."
            )
        if head is None:
            return notes + self._start()
        if head != stored:
            self._write_head(head)
        text = self._read_plot_text()
        if text is None or text_hash(text) != head.plot_hash:
            if text is not None and text_hash(text) not in self._recorded_hashes():
                kept = self._keep_aside()
                notes.append(
                    "The plot file had been changed outside Debrief, so it was rebuilt from "
                    f"its history; the file as found is kept as {kept}."
                )
            plot = self.replay(head.current)
            plot_hash = self._write_plot(plot)
            if head.current and not self._replays_as_recorded(plot, head.current):
                notes.append(
                    f"Replaying the history gave a different plot from the one recorded at "
                    f"step {head.current}; check the plot."
                )
            if plot_hash != head.plot_hash:
                head = head.model_copy(update={"plot_hash": plot_hash})
                self._write_head(head)
        return notes

    def _start(self) -> list[str]:
        """Start the history of a plot that has none: a baseline holding its content."""
        text = self._read_plot_text()
        plot = load_document(DocumentKind.PLOT, text) if text is not None else empty_plot()
        empty_hash = text_hash(dump_document(DocumentKind.PLOT, empty_plot()))
        start = models.HistoryHead(
            schema_version=SCHEMA_VERSION, current=0, latest=0, plot_hash=empty_hash
        )
        if not (plot.features or plot.named_sets or plot.provenance):
            self._write_head(start)
            self._write_plot(empty_plot())
            return []
        records = list(plot.provenance or []) or [baseline_record()]
        changes = Changes(list(plot.features), named_sets=list(plot.named_sets or []))
        self._append(start, empty_plot(), records, changes)
        return ["Started this plot's history from its saved content."]

    def _recorded_hashes(self) -> set[str]:
        return {self.delta(s).result_hash for s in self._delta_seqs()}

    def _replays_as_recorded(self, plot: DebriefFeatureCollection, seq: int) -> bool:
        delta = self.delta(seq)
        # The plot is stamped with the schema it was written under.
        as_written = plot.model_copy(update={"schema_version": delta.schema_version})
        return text_hash(dump_document(DocumentKind.PLOT, as_written)) == delta.result_hash

    def _keep_aside(self) -> str:
        stamp = format_utc(int(clock.time() * 1000)).replace(":", "")
        kept, n = f"{self._plot_path}.kept-{stamp}", 2
        while self.store.exists(kept):
            kept, n = f"{self._plot_path}.kept-{stamp}-{n}", n + 1
        self.store.rename(self._plot_path, kept)
        return kept.split("/")[-1]

    def _whole(self) -> bool:
        head = self._read_head()
        if head is None or self.store.exists(self._delta_path(head.latest + 1)):
            return False
        text = self._read_plot_text()
        return text is not None and text_hash(text) == head.plot_hash

    def recover(self) -> list[str]:
        """Make the history and the plot agree. Returns what was done, for the analyst.

        - A plot with no history yet gets a baseline delta holding its content
          and all its earlier records.
        - A lost or damaged head is rebuilt from the deltas.
        - A delta written but not completed (a crash between the delta and
          the head) is completed: at most the change in progress is lost
          (NFR-10), and here not even that. A delta written only in part is
          set aside.
        - A plot file that does not match the head (a crash between the head
          and the plot) is rebuilt from the history. If it holds content the
          history never recorded, it is kept aside under another name first.
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
            return (
                []
                if self._whole()
                else [
                    "This plot needs repairing, but its folder cannot be changed, so it is "
                    "shown as its history records it and left as it is."
                ]
            )


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
