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

Nobody locks the plot (SUB-29). A writer says which head it read (its Base);
if the head has moved since, the change is refused as a Conflict, or merged
when it touches different features from the changes made meanwhile (SUB-28,
SUB-29). The plot file itself is never trusted over the history: if it does
not match the head, it is kept aside under another name and rebuilt.
"""

from __future__ import annotations

import hashlib
import time as clock
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from debrief_kernel.time import format_utc
from debrief_schemas import (
    SCHEMA_VERSION,
    DebriefFeatureCollection,
    DocumentKind,
    dump_document,
    load_document,
    models,
)

if TYPE_CHECKING:
    from debrief_stac.catalogue import Catalogue

HISTORY = "history"
HEAD = "head.json"

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

    def touched(self) -> set[str]:
        """Feature and named-set ids this change touches, for merging (SUB-29)."""
        return (
            {f.id for f in self.added + self.modified}
            | set(self.deleted_ids)
            | {f"set:{s.id}" for s in self.named_sets}
            | {f"set:{i}" for i in self.deleted_named_set_ids}
        )

    @classmethod
    def of(cls, delta: models.Delta) -> Changes:
        return cls(
            list(delta.added or []),
            list(delta.modified or []),
            list(delta.deleted_ids or []),
            list(delta.named_sets or []),
            list(delta.deleted_named_set_ids or []),
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
    """The history of one plot in a catalogue."""

    def __init__(self, catalogue: Catalogue, item_id: str):
        self.catalogue = catalogue
        self.item_id = item_id
        self.store = catalogue.store
        self._folder = f"{item_id}/{HISTORY}"
        self._plot_path = catalogue.plot_path(item_id)

    # --- Reading ----------------------------------------------------------------

    def _delta_path(self, seq: int) -> str:
        return f"{self._folder}/{seq:06d}.json"

    def delta(self, seq: int) -> models.Delta:
        try:
            return load_document(DocumentKind.DELTA, self.store.read_text(self._delta_path(seq)))
        except FileNotFoundError:
            raise HistoryError(f"Step {seq} of the plot's history is missing.") from None

    def _read_head(self) -> models.HistoryHead | None:
        path = f"{self._folder}/{HEAD}"
        if not self.store.exists(path):
            return None
        return load_document(DocumentKind.HISTORY_HEAD, self.store.read_text(path))

    def head(self) -> models.HistoryHead:
        """The head, after making the history whole (see recover)."""
        self.recover()
        head = self._read_head()
        assert head is not None
        return head

    def base(self) -> Base:
        head = self.head()
        return Base(head.current, head.plot_hash)

    def chain(self, upto: int) -> list[int]:
        """The deltas replayed to reach a step: follow each delta's after link back."""
        seqs = []
        seq = upto
        while seq:
            seqs.append(seq)
            seq = self.delta(seq).after
        return seqs[::-1]

    def steps(self) -> list[Step]:
        """Every recorded change, newest last, and whether it is in the plot now."""
        head = self.head()
        applied = set(self.chain(head.current))
        abandoned = set(head.abandoned or [])
        out = []
        for seq in range(1, head.latest + 1):
            status = "applied" if seq in applied else "abandoned" if seq in abandoned else "undone"
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

    def _write_head(
        self, current: int, latest: int, abandoned: Iterable[int], plot_hash: str
    ) -> None:
        head = models.HistoryHead(
            schema_version=SCHEMA_VERSION,
            current=current,
            latest=latest,
            abandoned=sorted(set(abandoned)) or None,
            plot_hash=plot_hash,
        )
        self.store.write_text_atomic(
            f"{self._folder}/{HEAD}", dump_document(DocumentKind.HISTORY_HEAD, head)
        )

    def _write_plot(self, plot: DebriefFeatureCollection) -> str:
        text = dump_document(DocumentKind.PLOT, plot)
        self.catalogue.store_plot_text(self.item_id, plot, text)
        return text_hash(text)

    def _undone(self, head: models.HistoryHead) -> list[int]:
        """Deltas after current that are not in its chain: undone, redoable until a new change."""
        applied = set(self.chain(head.current))
        abandoned = set(head.abandoned or [])
        return [s for s in range(1, head.latest + 1) if s not in applied and s not in abandoned]

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
        meanwhile touch different features (SUB-29).
        """
        head = self.head()
        if base is not None and (base.current, base.plot_hash) != (head.current, head.plot_hash):
            self._check_merge(base, head, changes, merge)
        plot = self._read_plot() if self._plot_matches(head) else self.replay(head.current)
        return self._append(head, plot, records, changes)

    def _append(
        self,
        head: models.HistoryHead,
        plot: DebriefFeatureCollection,
        records: list[models.ProvRecord],
        changes: Changes,
    ) -> int:
        """Write a delta, then the head, then the plot (write-ahead, NFR-10)."""
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
            result_hash=text_hash(text),
        )
        try:
            self.store.write_text_exclusive(
                self._delta_path(seq), dump_document(DocumentKind.DELTA, delta)
            )
        except FileExistsError:
            raise Conflict(
                "Someone else changed the plot at the same moment. Nothing was saved; "
                "open the plot again to see their change.",
                mergeable=False,
            ) from None
        abandoned = [*(head.abandoned or []), *self._undone(head)]
        self._write_head(seq, seq, abandoned, text_hash(text))
        self._write_plot(new_plot)
        return seq

    def _check_merge(
        self, base: Base, head: models.HistoryHead, changes: Changes, merge: bool
    ) -> None:
        theirs = self.chain(head.current)
        if base.current not in [0, *theirs] or (
            base.current == head.current and base.plot_hash != head.plot_hash
        ):
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

    def goto(self, seq: int, base: Base | None = None) -> None:
        """Undo or redo to a step (SUB-21): replay to it and move the head there."""
        head = self.head()
        if base is not None and (base.current, base.plot_hash) != (head.current, head.plot_hash):
            raise Conflict(
                "The plot was changed elsewhere since you opened it. Open it again first.",
                mergeable=False,
            )
        if seq != 0 and (seq > head.latest or seq in (head.abandoned or [])):
            raise HistoryError(f"Step {seq} cannot be returned to.")
        plot = self.replay(seq)
        text = dump_document(DocumentKind.PLOT, plot)
        self._write_head(seq, head.latest, head.abandoned or [], text_hash(text))
        self._write_plot(plot)

    def undo(self, base: Base | None = None) -> int:
        """Go back one step. Returns the step now current."""
        head = self.head()
        if head.current == 0:
            raise HistoryError("There is nothing to undo.")
        previous = self.delta(head.current).after
        if self._is_origin(head.current):
            raise HistoryError("There is nothing to undo: the plot is as it was imported.")
        self.goto(previous, base)
        return previous

    def redo(self, base: Base | None = None) -> int:
        """Go forward one undone step, if no change has been made since undoing."""
        head = self.head()
        later = [s for s in self._undone(head) if self.delta(s).after == head.current]
        if not later:
            raise HistoryError("There is nothing to redo.")
        self.goto(later[-1], base)
        return later[-1]

    def _is_origin(self, seq: int) -> bool:
        """The first delta of a plot, its import or baseline, which undo never removes."""
        return self.delta(seq).after == 0

    # --- Opening: making the history whole -----------------------------------

    def _read_plot(self) -> DebriefFeatureCollection:
        return load_document(DocumentKind.PLOT, self.store.read_text(self._plot_path))

    def _plot_matches(self, head: models.HistoryHead) -> bool:
        return (
            self.store.exists(self._plot_path)
            and text_hash(self.store.read_text(self._plot_path)) == head.plot_hash
        )

    def recover(self) -> list[str]:
        """Make the history and the plot agree. Returns what was done, for the analyst.

        - A plot with no history yet gets a baseline delta holding its content
          and all its earlier records.
        - A delta written but not completed (a crash between the delta and
          the head) is completed: at most the change in progress is lost
          (NFR-10), and here not even that.
        - A plot file that does not match the head (a crash between the head
          and the plot, or a change made outside Debrief) is kept aside under
          another name and rebuilt from the history, never silently lost.
        """
        done = []
        head = self._read_head()
        if head is None:
            plot = self._read_plot() if self.store.exists(self._plot_path) else empty_plot()
            changes = Changes(list(plot.features), named_sets=list(plot.named_sets or []))
            records = list(plot.provenance or [])
            if not records:
                records = [_baseline_record()]
            empty_hash = text_hash(dump_document(DocumentKind.PLOT, empty_plot()))
            if plot.features or plot.named_sets or plot.provenance:
                start = models.HistoryHead(
                    schema_version=SCHEMA_VERSION, current=0, latest=0, plot_hash=empty_hash
                )
                self._append(start, empty_plot(), records, changes)
                done.append("Started this plot's history from its saved content.")
            else:
                self._write_head(0, 0, [], empty_hash)
                self._write_plot(empty_plot())
            return done
        # Finish any change whose delta was written but whose head was not.
        while self.store.exists(self._delta_path(head.latest + 1)):
            delta = self.delta(head.latest + 1)
            if delta.after != head.current:
                break
            abandoned = [*(head.abandoned or []), *self._undone(head)]
            self._write_head(delta.seq, delta.seq, abandoned, delta.result_hash)
            head = self._read_head()
            assert head is not None
            done.append(f"Finished saving a change that was interrupted (step {delta.seq}).")
        if not self._plot_matches(head):
            if self.store.exists(self._plot_path):
                stamp = format_utc(int(clock.time() * 1000)).replace(":", "")
                kept = f"{self._plot_path}.kept-{stamp}"
                self.store.rename(self._plot_path, kept)
                done.append(
                    "The plot file did not match its history, so it was rebuilt; the file "
                    f"as found is kept as {kept.split('/')[-1]}."
                )
            plot = self.replay(head.current)
            plot_hash = self._write_plot(plot)
            if plot_hash != head.plot_hash:
                self._write_head(head.current, head.latest, head.abandoned or [], plot_hash)
        return done


def _baseline_record() -> models.ProvRecord:
    now = format_utc(int(clock.time() * 1000))
    return models.ProvRecord(
        id=f"baseline-{now}",
        kind="edit",
        started_at=now,
        ended_at=now,
        agent=models.AgentRef(kind="software_agent", name="debrief-stac"),
        notes=["The plot had content but no record of how it was made."],
    )
