"""A static, file-based STAC catalogue of plots (SUB-05 to SUB-09, SUB-15, SUB-23, SUB-35).

Layout on disk:

    catalog.json                    the catalogue (StacCatalog)
    <item>/<item>.json              one STAC item per plot
    <item>/plot.geojson             the plot (SUB-05): its content, its island (view
                                    state) and its whole history (SUB-19); the one
                                    file an analyst passes to a colleague
    <item>/sources/<file>           immutable imported sources, kept for audit (SUB-10);
                                    nothing in the plot file needs them
    <item>/media/<file>             supporting files (SUB-06)
    <item>/payloads/<file>          opaque observation payloads (CON-02)

Items are found by walking the folders and checking each item's parent link;
the catalogue's child links are written as a hint but never trusted (SUB-23).
The item is catalogue metadata derived from the plot (title, period, bbox):
the plot file alone is enough to make it again (add_plot_file).
"""

from __future__ import annotations

import json
import re
import time as clock
import uuid
from collections import OrderedDict
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field, replace
from importlib.metadata import version
from pathlib import Path, PurePosixPath

from debrief_kernel.formatting import DEFAULT_SETTINGS, format_position, format_time
from debrief_kernel.geodesy import Position, destination, range_bearing
from debrief_kernel.time import IntervalError, format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import (
    SCHEMA_VERSION,
    DebriefFeatureCollection,
    DocumentKind,
    dump_document,
    load_document,
    models,
)
from debrief_schemas.documents import track_edit_problems
from debrief_schemas.island import PLOT_FEATURE_ID, plot_feature
from debrief_stac import (
    annotations,
    collation,
    fixes,
    frequencies,
    narrative,
    reckoning,
    tracks,
)
from debrief_stac.hashing import content_hash
from debrief_stac.history import (
    LOCK,
    Base,
    Changes,
    Conflict,
    History,
    HistoryError,
    NoPlotDetails,
    apply,
    baseline_record,
    empty_plot,
    view_hash,
)
from debrief_stac.history import content_hash as history_content_hash
from debrief_stac.store import FileStore, Store

STAC_VERSION = "1.1.0"
CATALOGUE_FILE = "catalog.json"
PLOT_ASSET = "plot"
PLOT_FILE = "plot.geojson"
# Retired (decision 12 Oct): colours and hiding are content now. A plot that
# still has one is migrated on opening (see migrate_presentation).
LEGACY_PRESENTATION_FILE = "presentation.json"
_COLOUR = re.compile(r"^#[0-9a-f]{6}$")
# Asset kinds whose content hashes replay checks (SUB-11).
VERIFIED_KINDS = ("source", "payload")

_ITEM_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")


class CatalogueError(Exception):
    """A catalogue operation could not be completed."""


class NewerSchemaError(CatalogueError):
    """Writing would put a newer-schema file where other users may not open it (SUB-35)."""


class ConfirmationNeeded(CatalogueError):
    """The change would lose something the analyst made, so it waits for them to confirm:
    a track changed while plotted by dead reckoning, plotted over the ground again
    (discard_dr_changes). The message says what would be lost."""


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in text.split("."))


def _check_item_id(item_id: str) -> None:
    if not _ITEM_ID.fullmatch(item_id):
        raise CatalogueError(
            f"{item_id!r} cannot be an item id: use letters, digits, '.', '_' or '-', "
            "starting with a letter or digit"
        )


@dataclass(frozen=True)
class Extent:
    """Where and when a plot's content lies, for the item and for catalogue search."""

    bbox: tuple[float, float, float, float] | None
    start_ms: int | None
    end_ms: int | None


def plot_extent(plot: DebriefFeatureCollection) -> Extent:
    """Bounding box and time span of everything in a plot.

    The bbox is a simple longitude and latitude range, so a plot that crosses
    the antimeridian gets a box spanning the globe; acceptable for search.
    """
    lons: list[float] = []
    lats: list[float] = []
    times: list[int] = []
    # Times of single instants, as written: UTC to the millisecond in one fixed form
    # (UtcTimestamp), so the earliest and latest as text are the earliest and latest
    # in time, and only those two are read. A plot may hold tens of thousands of
    # narrative entries (NFR-06).
    instants: list[str] = []
    for feature in plot.features:
        props = feature.properties
        if props.kind == "narrative":
            instants.append(props.time)
            continue
        geometry = feature.geometry
        if geometry is not None:
            coordinates = geometry.coordinates
            if geometry.type == "Point":
                points = [coordinates]
            elif geometry.type == "LineString":
                points = coordinates
            else:
                points = [p for ring in coordinates for p in ring]
            lons += [p[0] for p in points]
            lats += [p[1] for p in points]
        if props.kind == "track":
            times += [parse_utc(props.times[0]), parse_utc(props.times[-1])]
        time = getattr(props, "time", None)
        if time:
            instants.append(time)
        if getattr(props, "time_range", None):
            times += [parse_utc(props.time_range.start), parse_utc(props.time_range.end)]
    if instants:
        times += [parse_utc(min(instants)), parse_utc(max(instants))]
    bbox = (min(lons), min(lats), max(lons), max(lats)) if lons else None
    return Extent(bbox, min(times) if times else None, max(times) if times else None)


def with_plot_details(
    plot: DebriefFeatureCollection, title: str, description: str | None = None
) -> DebriefFeatureCollection:
    """The plot with a whole-plot feature holding its title, last, unless it has one."""
    if plot_feature(plot) is not None:
        return plot
    taken = {f.id for f in plot.features}
    feature_id, n = PLOT_FEATURE_ID, 2
    while feature_id in taken:
        feature_id, n = f"{PLOT_FEATURE_ID}-{n}", n + 1
    feature = models.PlotFeature(
        type="Feature",
        id=feature_id,
        geometry=None,
        properties=models.PlotProperties(kind="plot", title=title, description=description),
    )
    return plot.model_copy(update={"features": [*plot.features, feature]})


def period_view(plot: DebriefFeatureCollection) -> dict | None:
    """A view whose time window is the plot's whole period: where a new plot starts."""
    extent = plot_extent(plot)
    if extent.start_ms is None:
        return None
    window = {"start": format_utc(extent.start_ms), "end": format_utc(extent.end_ms)}
    return {"time_window": window}


@dataclass(frozen=True)
class ItemSummary:
    catalogue_id: str
    item_id: str
    title: str | None
    extent: Extent


@dataclass
class Catalogue:
    store: Store
    model: models.StacCatalog
    # Sources verified this session: path -> (size, mtime_ns, hash) (SUB-11).
    _verified: dict[str, tuple[int, int, str]] = field(default_factory=dict, repr=False)

    # --- Creating and opening --------------------------------------------

    @classmethod
    def create(cls, root: Path, catalogue_id: str, title: str, description: str) -> Catalogue:
        store = FileStore(root)
        if store.exists(CATALOGUE_FILE):
            raise CatalogueError(f"{root} already holds a catalogue")
        model = models.StacCatalog(
            type="Catalog",
            stac_version=STAC_VERSION,
            id=catalogue_id,
            title=title,
            description=description,
            links=[
                models.StacLink(rel="root", href=f"./{CATALOGUE_FILE}", type="application/json")
            ],
            debrief_schema_version=SCHEMA_VERSION,
        )
        catalogue = cls(store, model)
        catalogue._save_catalogue()
        return catalogue

    @classmethod
    def open(cls, root: Path) -> Catalogue:
        store = FileStore(root)
        if not store.exists(CATALOGUE_FILE):
            raise CatalogueError(f"{root} does not hold a catalogue ({CATALOGUE_FILE} missing)")
        model = load_document(DocumentKind.STAC_CATALOG, store.read_text(CATALOGUE_FILE))
        return cls(store, model)

    @property
    def id(self) -> str:
        return self.model.id

    @property
    def schema_version(self) -> str:
        return self.model.debrief_schema_version

    def _save_catalogue(self) -> None:
        self.store.write_text_atomic(
            CATALOGUE_FILE, dump_document(DocumentKind.STAC_CATALOG, self.model)
        )

    def _check_schema(self, allow_newer_schema: bool) -> None:
        """Warn before writing a newer schema into a shared catalogue (SUB-35)."""
        if _version(SCHEMA_VERSION) <= _version(self.schema_version):
            return
        if not allow_newer_schema:
            raise NewerSchemaError(
                f"This catalogue holds data-file schema {self.schema_version}; saving here writes "
                f"schema {SCHEMA_VERSION}, which other users of the catalogue may not be able to "
                "open. Save anyway to update the catalogue's declared version."
            )
        self.model.debrief_schema_version = SCHEMA_VERSION
        self._save_catalogue()

    # --- Items -------------------------------------------------------------

    @staticmethod
    def _item_path(item_id: str) -> str:
        return f"{item_id}/{item_id}.json"

    def item_ids(self) -> list[str]:
        """Items found by walking the catalogue, never from its child links (SUB-23)."""
        found = []
        for folder in self.store.subfolders(""):
            path = self._item_path(folder)
            if not self.store.exists(path):
                continue
            raw = json.loads(self.store.read_text(path))
            parents = [link for link in raw.get("links", []) if link.get("rel") == "parent"]
            if any(link.get("href") == f"../{CATALOGUE_FILE}" for link in parents):
                found.append(folder)
        return found

    def read_item(self, item_id: str) -> models.StacItem:
        _check_item_id(item_id)
        if not self.store.exists(self._item_path(item_id)):
            raise CatalogueError(f"no item {item_id!r} in catalogue {self.id!r}")
        return load_document(DocumentKind.STAC_ITEM, self.store.read_text(self._item_path(item_id)))

    def summaries(self) -> Iterator[ItemSummary]:
        for item_id in self.item_ids():
            item = self.read_item(item_id)
            props = item.properties
            start = props.start_datetime or props.datetime
            end = props.end_datetime or props.datetime
            yield ItemSummary(
                self.id,
                item_id,
                props.title,
                Extent(
                    tuple(item.bbox) if item.bbox else None,
                    parse_utc(start) if start else None,
                    parse_utc(end) if end else None,
                ),
            )

    def _write_item(self, item: models.StacItem) -> None:
        self.store.write_text_atomic(
            self._item_path(item.id), dump_document(DocumentKind.STAC_ITEM, item)
        )

    def _apply_extent(self, item: models.StacItem, extent: Extent) -> None:
        props = item.properties
        if extent.bbox is None:
            item.geometry, item.bbox = None, None
        else:
            west, south, east, north = extent.bbox
            item.bbox = list(extent.bbox)
            ring = [[west, south], [east, south], [east, north], [west, north], [west, south]]
            if west == east or south == north:
                item.geometry = models.PointGeometry(type="Point", coordinates=[west, south])
            else:
                item.geometry = models.PolygonGeometry(type="Polygon", coordinates=[ring])
        if extent.start_ms is None:
            props.start_datetime = props.end_datetime = None
            props.datetime = props.datetime or format_utc(int(clock.time() * 1000))
        else:
            props.datetime = None
            props.start_datetime = format_utc(extent.start_ms)
            props.end_datetime = format_utc(extent.end_ms)
        props.debrief_schema_version = SCHEMA_VERSION

    def create_plot(
        self,
        item_id: str,
        title: str,
        plot: DebriefFeatureCollection | None = None,
        *,
        allow_newer_schema: bool = False,
        created: str | None = None,
    ) -> models.StacItem:
        """A new STAC item holding a plot (SUB-05). An empty plot if none is given.
        created is when it came into the catalogue (now, unless a builder that must
        make the same catalogue every run says), which new-data marks go by (CAP-10)."""
        _check_item_id(item_id)
        if self.store.exists(item_id):
            raise CatalogueError(f"{item_id!r} already exists in catalogue {self.id!r}")
        self._check_schema(allow_newer_schema)
        plot = plot or DebriefFeatureCollection(
            type="FeatureCollection", schema_version=SCHEMA_VERSION, features=[], provenance=[]
        )
        item = models.StacItem(
            type="Feature",
            stac_version=STAC_VERSION,
            id=item_id,
            properties=models.StacItemProperties(
                title=title,
                debrief_schema_version=SCHEMA_VERSION,
                created=created or format_utc(int(clock.time() * 1000)),
            ),
            links=[
                models.StacLink(rel="parent", href=f"../{CATALOGUE_FILE}", type="application/json"),
                models.StacLink(rel="root", href=f"../{CATALOGUE_FILE}", type="application/json"),
            ],
            assets={
                PLOT_ASSET: models.StacAsset(
                    key=PLOT_ASSET,
                    href=f"./{PLOT_FILE}",
                    type="application/geo+json",
                    roles=["data"],
                    debrief_asset_kind="plot",
                )
            },
        )
        self._apply_extent(item, plot_extent(empty_plot()))
        try:  # exclusive, so two processes creating the same plot cannot both succeed
            self.store.write_text_exclusive(
                self._item_path(item_id), dump_document(DocumentKind.STAC_ITEM, item)
            )
        except FileExistsError:
            raise CatalogueError(f"{item_id!r} already exists in catalogue {self.id!r}") from None
        # The history starts empty; a plot given here becomes its first change.
        self.history(item_id).recover()
        if plot.features or plot.named_sets or plot.provenance:
            if not plot.provenance:  # content with no record of how it was made
                plot = plot.model_copy(update={"provenance": [baseline_record()]})
            self.write_plot(item_id, plot, allow_newer_schema=allow_newer_schema)
        # The child link is a convenience hint only (SUB-23).
        self.model.links.append(
            models.StacLink(
                rel="child",
                href=f"./{self._item_path(item_id)}",
                type="application/json",
                title=title,
            )
        )
        self._save_catalogue()
        return self.read_item(item_id)

    def plot_path(self, item_id: str) -> str:
        return self._asset_path(self.read_item(item_id), PLOT_ASSET)

    def history(self, item_id: str) -> History:
        """The plot's history: deltas, undo and replay (SUB-19 to SUB-21)."""
        return History(self, item_id)

    def read_plot(self, item_id: str) -> DebriefFeatureCollection:
        """The plot as of its history's head, recovering an interrupted change first (NFR-10).

        In a folder that cannot be written, the plot is rebuilt in memory instead.
        A retired presentation.json not yet migrated (a read-only store, say) is
        applied in memory.
        """
        plot = self.history(item_id).plot()
        entries = self.legacy_presentation(item_id)
        if entries:
            changes = presentation_changes(plot, entries)
            if changes.touched():
                plot = apply(plot, [], changes)
        return plot

    def store_plot_text(
        self,
        item_id: str,
        plot: DebriefFeatureCollection,
        text: str,
        *,
        revision: str | None = None,
        origin: str | None = None,
    ) -> None:
        """Write the materialised plot atomically and refresh the item's extent (NFR-11),
        and what collation reads of it (CAP-08 to CAP-12): its revision (the content's
        hash), each track's coverage, the items its tracks take data from, whether it
        came in by importing files, its history's first step, and, for an item from
        before items kept it, when it came in (its first step's time).

        Only the history calls this: every change goes through a delta first.
        """
        self.store.write_text_atomic(self.plot_path(item_id), text)
        # Read the item as late as possible, so a source added meanwhile by
        # another process is kept. A narrow window remains; the extent is only
        # a search hint, and the next save writes it again.
        item = self.read_item(item_id)
        self._apply_extent(item, plot_extent(plot))
        props = item.properties
        props.debrief_revision = revision or history_content_hash(text)
        props.debrief_coverage = collation.plot_coverage(plot) or None
        props.debrief_drawn_from = collation.drawn_from(plot) or None
        props.debrief_imported = collation.imported(plot)
        props.debrief_origin = origin or props.debrief_origin
        props.created = props.created or collation.first_recorded_at(plot)
        self._write_item(item)

    def commit(
        self,
        item_id: str,
        records: list[models.ProvRecord],
        changes: Changes,
        base: Base | None = None,
        *,
        merge: bool = False,
        allow_newer_schema: bool = False,
    ) -> int:
        """Record a change to a plot and apply it (SUB-19). See History.commit."""
        self._check_schema(allow_newer_schema)
        return self.history(item_id).commit(records, changes, base, merge=merge)

    def save_as_new(
        self,
        item_id: str,
        base: Base,
        records: list[models.ProvRecord],
        changes: Changes,
    ) -> str:
        """Save a change that conflicts as a new plot (SUB-29). Returns the new item's id.

        The new plot has the history the change was made against (every step
        up to it, unchanged, checksums and all), the same sources and files,
        and then the change. The original is untouched.
        """
        item = self.read_item(item_id)
        old = self.history(item_id)
        old.check_base(base)
        title = f"{item.properties.title or item_id} (your changes)"
        n = 1
        while True:
            new_id = f"{item_id}-copy" if n == 1 else f"{item_id}-copy-{n}"
            n += 1
            if self.store.exists(new_id):
                continue
            try:
                # A copy of the plot, not new data for it (CAP-10): it came in when the plot did.
                self.create_plot(new_id, title, created=item.properties.created)
            except CatalogueError:  # taken meanwhile by another process
                if self.store.exists(self._item_path(new_id)):
                    continue
                raise
            break
        try:
            new_item = self.read_item(new_id)
            for key, asset in item.assets.items():
                if key == PLOT_ASSET:
                    continue
                relative = self._asset_path(item, key).split("/", 1)[1]
                self.store.copy(f"{item_id}/{relative}", f"{new_id}/{relative}")
                new_item.assets[key] = asset.model_copy()
            self._write_item(new_item)
            new = self.history(new_id)
            old.fork_into(new, base.current)
            new.commit(records, changes)
            view, _ = old.view()  # view state goes with the copy, outside its history
            if view is not None and plot_feature(new.plot()) is not None:
                new.write_view(view, view_hash(None))
        except BaseException:
            # Never leave half a copy that looks like a plot.
            self.discard_plot(new_id)
            raise
        return new_id

    def add_plot_file(
        self,
        path: Path,
        agent: models.AgentRef,
        *,
        item_id: str | None = None,
        allow_newer_schema: bool = False,
    ) -> str:
        """Add a plot file received from a colleague, with its whole history (decision 13 Oct).

        The file is one plot.geojson: content, island and history. Its history's
        checksums are checked first, and a file whose history does not match is
        refused. Every step comes across unchanged, so undo, redo and going back
        to a step work as they did for the sender, and every provenance record
        comes with them; one more step records that the plot was added from the
        file, and by whom. Sources are not needed: replay uses the recorded
        outputs. Returns the new item's id.
        """
        self._check_schema(allow_newer_schema)
        path = Path(path)
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise CatalogueError(f"{path.name} was not added: it is not a plot file.") from None
        stem = re.sub(r"[^A-Za-z0-9._-]+", "-", path.stem).strip("-.") or "plot"
        if stem == "plot":  # a plot file as a catalogue keeps it: named after its title
            stem = _slug(_title_in(text)) or stem
        taken, n = set(self.item_ids()), 2
        item_id = item_id or stem
        base_id = item_id
        while item_id in taken or self.store.exists(item_id):
            item_id, n = f"{base_id}-{n}", n + 1
        now = format_utc(int(clock.time() * 1000))
        record = models.ProvRecord(
            id=f"added-{uuid.uuid4()}",
            kind="import",
            started_at=now,
            ended_at=now,
            agent=agent,
            notes=[
                f"Added from the plot file {path.name}",
                f"Added to the catalogue {self.model.title or self.id}",
            ],
        )
        self.create_plot(item_id, path.stem, allow_newer_schema=allow_newer_schema)
        try:
            self.history(item_id).adopt(text, [record], path.name)
            details = plot_feature(self.read_plot(item_id))
            title = (details.properties.title if details is not None else None) or path.stem
            # The same plot added twice, or a plot already here sent back with changes:
            # two plots listed under one title could not be told apart.
            titles = {s.title for s in self.summaries() if s.item_id != item_id}
            if title in titles:
                origin = f"{title} (from {path.name}"
                title, n = f"{origin})", 2
                while title in titles:
                    title, n = f"{origin}, {n})", n + 1
            if title != path.stem:
                item = self.read_item(item_id)
                item.properties.title = title
                self._write_item(item)
                for link in self.model.links:
                    if link.href == f"./{self._item_path(item_id)}":
                        link.title = title
                self._save_catalogue()
        except BaseException:
            self.discard_plot(item_id)
            raise
        return item_id

    def discard_plot(self, item_id: str) -> None:
        """Remove a plot this process has just created and could not finish.

        For cleaning up after a failed import or copy, so nothing half-made
        is left that looks like a plot: the item's folder and its child link.
        """
        _check_item_id(item_id)
        self.store.delete_folder(item_id)
        self.model.links = [
            link for link in self.model.links if link.href != f"./{self._item_path(item_id)}"
        ]
        self._save_catalogue()

    def write_plot(
        self, item_id: str, plot: DebriefFeatureCollection, *, allow_newer_schema: bool = False
    ) -> None:
        """Save a whole plot, recorded as one change: the difference from the saved plot.

        The new plot's provenance must extend the saved plot's; the records it
        adds describe the change. For callers that build a plot whole, such as
        importers and the sample builder; tools commit their changes directly.
        """
        before = self.read_plot(item_id)
        old, new = list(before.provenance or []), list(plot.provenance or [])
        if new[: len(old)] != old:
            raise CatalogueError(
                "The plot's history cannot be rewritten; add records, don't replace them."
            )
        records = new[len(old) :]
        changes = diff(before, plot)
        if not records:
            if changes.touched():
                raise CatalogueError(
                    "A change to a plot needs a provenance record saying what made it (SUB-18)."
                )
            return
        self.commit(item_id, records, changes, allow_newer_schema=allow_newer_schema)

    # --- Assets --------------------------------------------------------------

    def _asset_path(self, item: models.StacItem, key: str) -> str:
        if key not in item.assets:
            raise CatalogueError(f"item {item.id!r} has no asset {key!r}")
        href = PurePosixPath(item.id, item.assets[key].href)
        parts = [p for p in href.parts if p != "."]
        return PurePosixPath(*parts).as_posix()

    def assets(self, item_id: str) -> dict[str, models.StacAsset]:
        return dict(self.read_item(item_id).assets)

    def add_source(
        self, item_id: str, source: Path, *, key: str | None = None, media_type: str = "text/plain"
    ) -> models.SourceRef:
        """Copy a source into the item, read-only, and record its content hash (SUB-10, SUB-11).

        Returns the reference an import's provenance record uses.
        """
        return self._add_file(item_id, Path(source), "sources", "source", key, media_type)

    def add_supporting_file(
        self, item_id: str, path: Path, *, key: str | None = None, media_type: str
    ) -> models.SourceRef:
        """Video, imagery, acoustic files and the like (SUB-06)."""
        return self._add_file(item_id, Path(path), "media", "supporting_file", key, media_type)

    def add_payload(
        self, item_id: str, path: Path, *, key: str | None = None, media_type: str
    ) -> models.SourceRef:
        """An opaque observation payload, such as a Parquet file of bearings (CON-02).

        Copied in read-only and hashed like a source. The returned href and
        hash go into the feature's payload envelope; the href is relative to
        the item, as the plot file is.
        """
        return self._add_file(item_id, Path(path), "payloads", "payload", key, media_type)

    # --- Colour and hiding: content, recorded like any change (SUB-22) -------

    def set_colour(
        self,
        item_id: str,
        feature_ids: list[str],
        colour: str,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        colour_name: str | None = None,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Change the colour of tracks: a recorded, undoable step (decision 12 Oct).

        The step's note names it, such as "Colour of BLUE ONE set to red". base
        is the plot the analyst was looking at: if it has changed since,
        Conflict is raised and nothing is written (SUB-28). Returns the new
        step's number, or None if nothing needed to change.
        """
        if not _COLOUR.match(colour):
            raise CatalogueError(f"{colour!r} is not a colour: give lower-case hex, like #e01c3e.")

        def recolour(feature):
            props = feature.properties
            if props.kind != "track":
                raise CatalogueError(f"Only tracks have a colour; {props.name} is not a track.")
            if props.style is not None and props.style.colour == colour:
                return None
            style = (props.style or models.TrackStyle(colour=colour)).model_copy(
                update={"colour": colour}
            )
            return props.model_copy(update={"style": style})

        return self._edit_features(
            item_id,
            feature_ids,
            recolour,
            lambda who: f"Colour of {who} set to {colour_name or colour}",
            agent,
            base,
            allow_newer_schema,
        )

    def set_hidden(
        self,
        item_id: str,
        feature_ids: list[str],
        hidden: bool,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Hide features on the map, or show them again: a recorded, undoable step
        (decision 12 Oct). See set_colour."""

        def rehide(feature):
            props = feature.properties
            if bool(props.hidden) == hidden:
                return None
            return props.model_copy(update={"hidden": True if hidden else None})

        return self._edit_features(
            item_id,
            feature_ids,
            rehide,
            lambda who: f"{who} {'hidden on' if hidden else 'shown on'} the map",
            agent,
            base,
            allow_newer_schema,
        )

    def set_track_frequencies(
        self,
        item_id: str,
        feature_ids: list[str],
        changes: dict[str, object],
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """How often tracks' fixes are labelled, marked with a symbol and given a direction
        arrow (CAP-32): one recorded, undoable step for every track at once, like colour.

        changes holds any of label_interval, symbol_interval and arrow_interval, each a
        Duration (or {value, unit}, seconds, or text such as "10 min"), "off", or None
        for Debrief's default; one left out stays as each track has it. The step is named
        like "Labels every 10 min on 3 tracks". None if nothing needed to change.
        """
        unknown = sorted(set(changes) - set(frequencies.FIELDS))
        if unknown:
            raise CatalogueError(
                f"{', '.join(unknown)}: give label_interval, symbol_interval or arrow_interval."
            )
        if not changes:
            raise CatalogueError("Say which to change: labels, symbols or arrows.")
        try:
            wanted = {f: frequencies.interval_from(v, f) for f, v in changes.items()}
        except IntervalError as error:
            raise CatalogueError(str(error)) from None

        def retime(feature):
            props = feature.properties
            if props.kind != "track":
                raise CatalogueError(
                    f"Only tracks have labels, symbols and arrows; {props.name} is not a track."
                )
            update = {f: v for f, v in wanted.items() if not frequencies.same(getattr(props, f), v)}
            return props.model_copy(update=update) if update else None

        if not feature_ids:
            raise CatalogueError("Choose the tracks to change.")
        history = self.history(item_id)
        if base is None:
            base = history.base()
            plot = history.plot()
        else:
            history.check_base(base)
            plot = history.replay(base.current)
        by_id = {f.id: f for f in plot.features}
        modified, names = [], []
        for feature_id in dict.fromkeys(feature_ids):
            feature = by_id.get(feature_id)
            if feature is None or feature.properties.kind == "plot":
                raise CatalogueError(f"The plot has no feature {feature_id!r}.")
            names.append(feature.properties.name)
            props = retime(feature)
            if props is not None:
                modified.append(feature.model_copy(update={"properties": props}))
        if not modified:
            return None

        # What was asked, exactly, beside the name: an interval, "off", "all" or "default".
        def said(value: object) -> object:
            if isinstance(value, models.Duration):
                return value
            return "default" if value is None else str(getattr(value, "value", value))

        asked = [
            models.ParameterValue(name=f, value=said(wanted[f]))
            for f in frequencies.FIELDS
            if f in wanted
        ]
        record = _edit_record(
            agent,
            frequencies.step_name(wanted, names),
            parameters=asked,
            selected=list(dict.fromkeys(feature_ids)),
        )
        return self.commit(
            item_id,
            [record],
            Changes(modified=modified),
            base,
            allow_newer_schema=allow_newer_schema,
        )

    def _edit_features(
        self, item_id, feature_ids, change, describe, agent, base, allow_newer_schema
    ) -> int | None:
        if not feature_ids:
            raise CatalogueError("Choose the features to change.")
        history = self.history(item_id)
        if base is None:
            base = history.base()  # read before the plot, as run_tool does
            plot = history.plot()
        else:
            history.check_base(base)
            plot = history.replay(base.current)
        by_id = {f.id: f for f in plot.features}
        modified, names = [], []
        for feature_id in dict.fromkeys(feature_ids):
            feature = by_id.get(feature_id)
            if feature is None or feature.properties.kind == "plot":
                raise CatalogueError(f"The plot has no feature {feature_id!r}.")
            names.append(feature.properties.name)
            props = change(feature)
            if props is not None:
                modified.append(feature.model_copy(update={"properties": props}))
        if not modified:
            return None
        record = _edit_record(agent, describe(_who(names)))
        return self.commit(
            item_id,
            [record],
            Changes(modified=modified),
            base,
            allow_newer_schema=allow_newer_schema,
        )

    # --- Annotations: made, changed and deleted by hand (CAP-03 to CAP-05) ------

    def add_annotation(
        self,
        item_id: str,
        spec: models.AnnotationSpec | dict,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> tuple[int, str]:
        """Add an annotation described by spec: one recorded, undoable step, named
        like "Circle 'Exclusion zone' added". Returns the step and the new feature's id.
        AnnotationError says, in plain words, what is wrong with the description."""
        described = annotations.spec_from(spec)

        def change(plot: DebriefFeatureCollection):
            feature_id = annotations.new_id(described.name, {f.id for f in plot.features})
            feature = annotations.build(described, feature_id)
            return Changes(added=[feature]), f"{annotations.title_of(feature)} added", feature_id

        return self._change(item_id, change, agent, base, allow_newer_schema)

    def edit_annotation(
        self,
        item_id: str,
        feature_id: str,
        spec: models.AnnotationSpec | dict,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Change an annotation to the description given, as one step: its position,
        size, time, name and appearance at once ("Style of 'Exclusion zone' changed",
        say). A dict may give only what changes; the rest is kept, and a member given
        as None is cleared. A time given replaces a period, and a period a time.
        None if nothing changed."""

        def change(plot: DebriefFeatureCollection):
            before = self._annotation(plot, feature_id)
            if before.properties.furniture is not None:
                raise CatalogueError(
                    f"The {before.properties.name.lower()} is chart furniture: it can be "
                    "shown or removed, but has nothing to change."
                )
            if isinstance(spec, dict):
                merged = annotations.spec_of(before).model_dump(mode="json", exclude_none=True)
                merged.update(spec)
                # A time given replaces a period, and a period a time; a note has no position.
                if spec.get("time") is not None and "time_range" not in spec:
                    merged.pop("time_range", None)
                if spec.get("time_range") is not None and "time" not in spec:
                    merged.pop("time", None)
                if merged.get("shape") == "note" and "positions" not in spec:
                    merged.pop("positions", None)
                described = annotations.spec_from(merged)
            else:
                described = spec
            after = annotations.build(described, feature_id, previous=before)
            note = annotations.describe_change(before, after)
            if note is None:
                return None
            return Changes(modified=[after]), note, None

        result = self._change(item_id, change, agent, base, allow_newer_schema)
        return None if result is None else result[0]

    def delete_annotations(
        self,
        item_id: str,
        feature_ids: list[str],
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> int:
        """Delete annotations as one step. Named sets keep the rest of their members;
        a set left empty goes too. Undo brings them all back."""
        if not feature_ids:
            raise CatalogueError("Choose the annotations to delete.")

        def change(plot: DebriefFeatureCollection):
            gone = [self._annotation(plot, i) for i in dict.fromkeys(feature_ids)]
            ids = {f.id for f in gone}
            sets, emptied = [], []
            for named in plot.named_sets or []:
                if ids & set(named.feature_ids):
                    kept = [i for i in named.feature_ids if i not in ids]
                    if kept:
                        sets.append(named.model_copy(update={"feature_ids": kept}))
                    else:
                        emptied.append(named.id)
            note = (
                f"{annotations.title_of(gone[0])} deleted"
                if len(gone) == 1
                else f"{len(gone)} annotations deleted"
            )
            changes = Changes(
                deleted_ids=[f.id for f in gone], named_sets=sets, deleted_named_set_ids=emptied
            )
            return changes, note, None

        return self._change(item_id, change, agent, base, allow_newer_schema)[0]

    def set_north_arrow(
        self,
        item_id: str,
        shown: bool,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Add the north arrow to the plot, or remove it: chart furniture is content,
        so either is a recorded, undoable step (CAP-03). None if already so."""

        def change(plot: DebriefFeatureCollection):
            present = [
                f.id
                for f in plot.features
                if f.properties.kind == "annotation"
                and str(f.properties.furniture or "") == "north_arrow"
            ]
            if shown and not present:
                arrow = annotations.north_arrow()
                if arrow.id in {f.id for f in plot.features}:
                    arrow.id = annotations.new_id("north arrow", {f.id for f in plot.features})
                return Changes(added=[arrow]), "North arrow added", None
            if not shown and present:
                return Changes(deleted_ids=present), "North arrow removed", None
            return None

        result = self._change(item_id, change, agent, base, allow_newer_schema)
        return None if result is None else result[0]

    # --- Narrative entries: added, changed and deleted by hand (CAP-20) --------

    def add_narrative(
        self,
        item_id: str,
        spec: models.NarrativeSpec | dict,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> tuple[int, str]:
        """Add a narrative entry described by spec: one recorded, undoable step, named
        like "Narrative entry by BLUE ONE at 08:40:00Z added". Returns the step and the
        new entry's id. Left out, the track it belongs to is the one named as its source.
        NarrativeError says, in plain words, what is wrong with the description."""
        described = narrative.spec_from(spec)

        def change(plot: DebriefFeatureCollection):
            names = narrative.track_names(plot)
            if (
                described.track_id is None
                and described.source
                and not (isinstance(spec, dict) and "track_id" in spec)
            ):
                found = narrative.track_for(described.source, names)
                chosen = described.model_copy(update={"track_id": found})
            else:
                chosen = described
            (feature_id,) = narrative.new_ids({f.id for f in plot.features})
            feature = narrative.build(chosen, feature_id, set(names.values()))
            return Changes(added=[feature]), f"{narrative.title_of(feature)} added", feature_id

        return self._change(item_id, change, agent, base, allow_newer_schema)

    def edit_narrative(
        self,
        item_id: str,
        feature_id: str,
        spec: models.NarrativeSpec | dict,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Change a narrative entry, as one step. A dict may give only what changes; the
        rest is kept, and a member given as None is cleared. None if nothing changed."""

        def change(plot: DebriefFeatureCollection):
            before = self._narrative(plot, feature_id)
            if isinstance(spec, dict):
                merged = narrative.spec_of(before).model_dump(mode="json", exclude_none=True)
                merged.update(spec)
                described = narrative.spec_from({k: v for k, v in merged.items() if v is not None})
            else:
                described = spec
            tracks_now = set(narrative.track_names(plot).values())
            after = narrative.build(described, feature_id, tracks_now, previous=before)
            note = narrative.describe_change(before, after)
            if note is None:
                return None
            return Changes(modified=[after]), note, None

        result = self._change(item_id, change, agent, base, allow_newer_schema)
        return None if result is None else result[0]

    def delete_narrative(
        self,
        item_id: str,
        feature_ids: list[str],
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> int:
        """Delete narrative entries as one step. Named sets keep the rest of their
        members; a set left empty goes too. Undo brings them all back."""
        if not feature_ids:
            raise CatalogueError("Choose the narrative entries to delete.")

        def change(plot: DebriefFeatureCollection):
            gone = [self._narrative(plot, i) for i in dict.fromkeys(feature_ids)]
            note = (
                f"{narrative.title_of(gone[0])} deleted"
                if len(gone) == 1
                else f"{len(gone)} narrative entries deleted"
            )
            return self._deleted(plot, [f.id for f in gone]), note, None

        return self._change(item_id, change, agent, base, allow_newer_schema)[0]

    def add_narrative_entries(
        self,
        item_id: str,
        features: list[models.NarrativeFeature],
        record: models.ProvRecord,
        base: Base | None = None,
        *,
        allow_newer_schema: bool = False,
    ) -> int:
        """Add entries read from a source (an importer's) to the plot, as one step with
        the importer's record. Their ids are given new ones the plot does not use."""
        history = self.history(item_id)
        if base is None:
            base = history.base()
            plot = history.plot()
        else:
            history.check_base(base)
            plot = history.replay(base.current)
        ids = narrative.new_ids({f.id for f in plot.features}, len(features))
        added = [f.model_copy(update={"id": i}) for f, i in zip(features, ids, strict=True)]
        return self.commit(
            item_id, [record], Changes(added=added), base, allow_newer_schema=allow_newer_schema
        )

    @staticmethod
    def _deleted(plot: DebriefFeatureCollection, ids_list: list[str]) -> Changes:
        """Features deleted; named sets keep the rest of their members, and a set left
        empty goes too."""
        ids = set(ids_list)
        sets, emptied = [], []
        for named in plot.named_sets or []:
            if ids & set(named.feature_ids):
                kept = [i for i in named.feature_ids if i not in ids]
                if kept:
                    sets.append(named.model_copy(update={"feature_ids": kept}))
                else:
                    emptied.append(named.id)
        return Changes(deleted_ids=ids_list, named_sets=sets, deleted_named_set_ids=emptied)

    # --- Tracks: moved, rotated, split and merged by hand (CAP-01, CAP-02) ------

    def edit_track(
        self,
        item_id: str,
        feature_id: str,
        edit: models.TrackEdit | dict,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        current_time: str | None = None,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Move, rotate, shear or stretch a track, or the fixes of one period of it;
        move one fix; or plot it over the ground or by dead reckoning, as one recorded,
        undoable step:
        "BLUE ONE moved 1.20 nmi 045.0°T", "BLUE ONE part rotated 12.0° clockwise",
        "BLUE ONE sheared: 087.2°T 12.4 kn", "BLUE ONE stretched: 12.4 kn", "RED ONE
        fix at 09:31:00Z moved 0.42 nmi 045.0°T", "RED ONE plotted by dead reckoning".
        Geodesic (see debrief_stac.tracks). A rotation with no
        pivot turns about the fix nearest current_time in the period, or else its first
        fix. A shear holds one end of the period (anchor) and drags the other a distance
        along a bearing, or to where the period makes good a course and a speed; a
        stretch holds one end and gives the period a speed made good, keeping its
        courses. The record holds what was asked, and for a shear or a stretch what it
        made: the held end and its time, the dragged end's time and displacement, and
        the course and speed made good. None if nothing would move."""
        try:
            if not isinstance(edit, models.TrackEdit):
                edit = models.TrackEdit(**edit)
        except (TypeError, ValueError):
            raise CatalogueError(
                "Say how to change the track: move, with a distance and a bearing; "
                "rotate, with an angle; shear, holding the start or the end, with a "
                "distance and a bearing or a course and a speed; or stretch, holding "
                "the start or the end, with a speed; move_fix, with the fix's time and a "
                "distance and a bearing or a position; or set_plotting_mode, otg or dr."
            ) from None
        problems = track_edit_problems(edit, "The track change")
        if problems:
            raise CatalogueError(problems[0])
        period = (parse_utc(edit.period.start), parse_utc(edit.period.end)) if edit.period else None
        current = parse_utc(current_time) if current_time else None

        def change(plot: DebriefFeatureCollection):
            track = self._track(plot, feature_id)
            indices = tracks.period_indices(track, period)
            part = len(indices) < len(track.properties.times)
            name = track.properties.name
            # A track plotted by dead reckoning is edited by its origin, courses and speeds,
            # its positions worked out from them (debrief_stac.reckoning).
            dr = reckoning.reckoned(track)
            label = reckoning.dr_name(name) if dr else name
            notes: list[str] = []
            if str(edit.action) == "move":
                distance = Quantity.from_model(edit.distance)
                bearing = Quantity.from_model(edit.bearing)
                if dr:
                    made = reckoning.dr_moved(track, distance, bearing, indices)
                    after = made[0] if made else None
                    if made:
                        notes += _dr_moved_notes(made[0], made[1], indices)
                else:
                    after = tracks.moved(track, distance, bearing, indices)
                note = tracks.describe_move(label, distance, bearing, part)
                parameters = [
                    models.ParameterValue(name="distance", value=edit.distance),
                    models.ParameterValue(name="bearing", value=edit.bearing),
                ]
            elif str(edit.action) == "move_fix":
                result = self._fix_move(track, edit)
                if result is None:
                    return None
                after, note, more, parameters = result
                notes += more
            elif str(edit.action) == "set_plotting_mode":
                mode = str(getattr(edit.plotting_mode, "value", edit.plotting_mode))
                # Over the ground again loses a change made while plotted by dead reckoning:
                # refused, saying so, until the analyst confirms (product owner, 14 Oct 2026).
                lost = tracks.changed_while_dr(track) if mode == "otg" else None
                if lost and not edit.discard_dr_changes:
                    raise ConfirmationNeeded(tracks.describe_dr_changes(track, lost))
                after = tracks.plotted_as(track, mode)
                if after is None:
                    return None
                if lost:
                    notes.append("Changes made while plotted by dead reckoning discarded")
                note = tracks.describe_plotting(name, mode)
                index, metres = tracks.largest_shift(track, after, indices)
                notes += [
                    tracks.describe_plotting_how(track, mode),
                    tracks.describe_largest_shift(track, index, metres),
                ]
                parameters = [models.ParameterValue(name="plotting_mode", value=mode)]
            elif str(edit.action) in ("shear", "stretch"):
                result = self._shear_or_stretch(track, indices, edit, part, dr)
                if result is None:
                    return None
                after, note, more, parameters = result
                notes += more
            else:
                angle = Quantity.from_model(edit.angle)
                pivot = (
                    Position(*edit.pivot)
                    if edit.pivot
                    else tracks.default_pivot(track, indices, current)
                )
                if dr:
                    pivot = reckoning.dr_pivot(track, indices, pivot)
                    after = reckoning.dr_rotated(track, pivot, angle, indices)
                else:
                    after = tracks.rotated(track, pivot, angle, indices)
                note = tracks.describe_rotation(label, angle, part)
                notes.append(tracks.describe_pivot(pivot))
                if dr:
                    notes.append(reckoning.describe_courses_turned(angle, part))
                    if indices[0] > 0:
                        notes.append(reckoning.START_TURNS)
                    if indices[-1] < len(track.properties.times) - 1:
                        notes.append(reckoning.FOLLOW_ON)
                parameters = [
                    models.ParameterValue(name="angle", value=edit.angle),
                    models.ParameterValue(name="pivot_longitude", value=pivot.longitude),
                    models.ParameterValue(name="pivot_latitude", value=pivot.latitude),
                ]
            if after is None:
                return None
            if edit.period:
                notes.append(tracks.describe_period(period))
                parameters += [
                    models.ParameterValue(name="period_start", value=edit.period.start),
                    models.ParameterValue(name="period_end", value=edit.period.end),
                ]
            record = {"notes": notes, "parameters": parameters, "selected": [feature_id]}
            return Changes(modified=[after]), note, None, record

        result = self._change(item_id, change, agent, base, allow_newer_schema)
        return None if result is None else result[0]

    @staticmethod
    def _fix_move(
        track: models.TrackFeature, edit: models.TrackEdit
    ) -> tuple[models.TrackFeature, str, list[str], list[models.ParameterValue]] | None:
        """One fix moved, by a distance and a bearing or to a position: the track, its
        step's name ("RED ONE fix at 09:31:00Z moved 0.42 nmi 045.0°T"), notes saying
        where it now is and the speeds the positions now imply to reach it and to go on
        from it (and what they were), and the parameters; None if it would not move.
        Its recorded course and speed are kept (see debrief_stac.tracks)."""
        index = tracks.fix_index(track, edit.fix_time)
        at = tracks.times_of(track)[index]
        here = Position(*track.geometry.coordinates[index])
        if edit.position is not None:
            to = Position(*edit.position)
            shift, towards = range_bearing(here, to)
            distance = shift.to(DEFAULT_SETTINGS.length_unit)
            bearing = towards
            asked = [
                models.ParameterValue(name="distance", value=_quantity(distance, 3)),
                models.ParameterValue(name="bearing", value=_quantity(bearing, 2)),
            ]
        else:
            distance = Quantity.from_model(edit.distance)
            bearing = Quantity.from_model(edit.bearing)
            to = destination(here, bearing, distance)
            asked = [
                models.ParameterValue(name="distance", value=edit.distance),
                models.ParameterValue(name="bearing", value=edit.bearing),
            ]
        name = track.properties.name
        parameters = [
            models.ParameterValue(name="fix_time", value=track.properties.times[index]),
            *asked,
            models.ParameterValue(name="longitude", value=to.longitude),
            models.ParameterValue(name="latitude", value=to.latitude),
        ]
        if reckoning.reckoned(track):
            # On a DR track the leg into the fix changes, so dead reckoning puts it where it
            # was dropped; every later fix follows (decision, product owner, 14 Oct 2026).
            made = reckoning.dr_fix_moved(track, index, to)
            if made is None:
                return None
            after, leg = made
            moved = tracks.describe_fix_move(name, at, distance, bearing).removeprefix(f"{name} ")
            if leg is None:
                note = f"{reckoning.dr_name(name)} {moved}"
                notes = [f"Now at {format_position(to)}", reckoning.ORIGIN_FIX]
            else:
                note = reckoning.describe_leg(name, leg, at)
                notes = [
                    f"{moved[0].upper()}{moved[1:]}, to {format_position(to)}",
                    reckoning.describe_leg_was(leg),
                    reckoning.FOLLOW,
                ]
                speed = Quantity(leg.speed, "m/s").to(DEFAULT_SETTINGS.speed_unit)
                parameters += [
                    models.ParameterValue(
                        name="course", value=_quantity(Quantity(leg.course, "deg"), 2)
                    ),
                    models.ParameterValue(name="speed", value=_quantity(speed, 3)),
                ]
            return after, note, notes, parameters
        after = tracks.fix_moved(track, index, to)
        if after is None:
            return None
        note = tracks.describe_fix_move(name, at, distance, bearing)
        notes = [
            f"Now at {format_position(to)}",
            *tracks.describe_implied(
                track, tracks.implied_speeds(track, index), tracks.implied_speeds(after, index)
            ),
            "Its recorded course and speed are kept",
        ]
        return after, note, notes, parameters

    @staticmethod
    def _shear_or_stretch(
        track: models.TrackFeature,
        indices: list[int],
        edit: models.TrackEdit,
        part: bool,
        dr: bool = False,
    ) -> tuple[models.TrackFeature, str, list[str], list[models.ParameterValue]] | None:
        """A shear or a stretch of the fixes at indices, its step's name, further notes
        and parameters; None if nothing would move."""
        anchor = str(edit.anchor)
        held, dragged = tracks.ends(track, indices, anchor)
        before = tracks.leg_of(track, indices)
        times = track.properties.times
        end = Position(*track.geometry.coordinates[dragged])
        if str(edit.action) == "shear":
            if edit.distance is not None:
                distance = Quantity.from_model(edit.distance)
                bearing = Quantity.from_model(edit.bearing)
                to = destination(end, bearing, distance)
            else:
                course, speed = Quantity.from_model(edit.course), Quantity.from_model(edit.speed)
                to = tracks.shear_target(track, indices, anchor, course, speed)
            if dr:
                made_dr = reckoning.dr_sheared(track, indices, anchor, to)
                after = made_dr[0] if made_dr else None
                how = reckoning.describe_set(made_dr[1], part) if made_dr else ""
            else:
                after = tracks.sheared(track, indices, anchor, to)
        else:
            speed = Quantity.from_model(edit.speed)
            if before.metres == 0:
                raise tracks.TrackError(
                    f"{track.properties.name} ends where it starts there, so it cannot be "
                    "stretched: shear it instead."
                )
            factor = speed.to("m/s").value / before.speed
            if dr:
                after = reckoning.dr_stretched(track, indices, anchor, factor)
                how = reckoning.describe_speeds_scaled(factor, part)
            else:
                after = tracks.stretched(track, indices, anchor, factor)
        if after is None:
            return None
        made = tracks.leg_of(after, indices)
        moved_end = Position(*after.geometry.coordinates[dragged])
        shift, towards = range_bearing(end, moved_end)
        shear = str(edit.action) == "shear"
        name = reckoning.dr_name(track.properties.name) if dr else track.properties.name
        note = (tracks.describe_shear if shear else tracks.describe_stretch)(name, made, part)
        held_at = tracks.times_of(track)[held]
        notes = [tracks.describe_anchor(anchor, held_at), tracks.describe_was(before, not shear)]
        if dr:
            notes.append(how)
            if indices[-1] < len(times) - 1:
                notes.append(reckoning.FOLLOW_ON)
        speed_unit = str(edit.speed.unit) if edit.speed is not None else DEFAULT_SETTINGS.speed_unit
        length_unit = (
            str(edit.distance.unit) if edit.distance is not None else DEFAULT_SETTINGS.length_unit
        )
        parameters = [
            models.ParameterValue(name="anchor", value=anchor),
            models.ParameterValue(name="anchor_time", value=times[held]),
            models.ParameterValue(name="dragged_time", value=times[dragged]),
            *(
                [
                    models.ParameterValue(name="distance", value=edit.distance),
                    models.ParameterValue(name="bearing", value=edit.bearing),
                ]
                if edit.distance is not None
                else [
                    models.ParameterValue(
                        name="distance",
                        value=_quantity(shift.to(length_unit), 3),
                    ),
                    models.ParameterValue(name="bearing", value=_quantity(towards, 2)),
                ]
            ),
            models.ParameterValue(
                name="course",
                value=edit.course
                if edit.course is not None
                else _quantity(Quantity(made.course, "deg"), 2),
            ),
            models.ParameterValue(
                name="speed",
                value=edit.speed
                if edit.speed is not None
                else _quantity(Quantity(made.speed, "m/s").to(speed_unit), 3),
            ),
        ]
        return after, note, notes, parameters

    def split_track(
        self,
        item_id: str,
        feature_id: str,
        at: str,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        names: tuple[str, str] | list[str] | None = None,
        allow_newer_schema: bool = False,
    ) -> tuple[int, list[str]]:
        """Split a track at a time into two tracks, as one step: "BLUE ONE split at
        09:30:00Z". The fixes before the time keep the track's id; those from it on
        are a new track, listed straight after it. Each part keeps the track's style,
        hiding and provenance, and is named as given, or "BLUE ONE (1)" and "BLUE ONE
        (2)". Sensor observations that start at or after the time move to the second
        part; those running across it stay with the first, and the step's notes say
        so; named sets holding the track hold both. Returns the step and the two
        parts' ids."""
        at_ms = parse_utc(at)

        def change(plot: DebriefFeatureCollection):
            track = self._track(plot, feature_id)
            name = track.properties.name
            chosen = tuple(names) if names else (f"{name} (1)", f"{name} (2)")
            if len(chosen) != 2:
                raise tracks.TrackError("Give the two parts of the split track a name each.")
            second_id = tracks.new_track_id(chosen[1], {f.id for f in plot.features})
            first, second = tracks.split(track, at_ms, chosen, second_id)
            modified: list = [first]
            across: list[str] = []
            for feature in plot.features:
                props = feature.properties
                if props.kind != "sensor_observations" or props.host_track_id != feature_id:
                    continue
                if parse_utc(props.time_range.start) >= at_ms:
                    hosted = props.model_copy(update={"host_track_id": second_id})
                    modified.append(feature.model_copy(update={"properties": hosted}))
                elif parse_utc(props.time_range.end) >= at_ms:
                    across.append(props.name)
            sets = [
                s.model_copy(update={"feature_ids": _after(s.feature_ids, feature_id, second_id)})
                for s in plot.named_sets or []
                if feature_id in s.feature_ids
            ]
            # The second part goes straight after the first, not at the end of the plot.
            order = _after([f.id for f in plot.features], feature_id, second_id)
            note = f"{name} split at {format_time(at_ms, DEFAULT_SETTINGS)}"
            record = {
                "notes": [
                    f"Into {first.properties.name} and {second.properties.name}",
                    # Their observations are not split: those from the time on keep a host
                    # that ends before them. Said, so it is not found out later.
                    *(
                        f"{n} runs past the split and stays with {first.properties.name}"
                        for n in across
                    ),
                ],
                "parameters": [
                    models.ParameterValue(name="at", value=at),
                    models.ParameterValue(name="first_name", value=first.properties.name),
                    models.ParameterValue(name="second_name", value=second.properties.name),
                ],
                "selected": [feature_id],
            }
            changes = Changes(added=[second], modified=modified, named_sets=sets, order=order)
            return changes, note, [feature_id, second_id], record

        return self._change(item_id, change, agent, base, allow_newer_schema)

    def merge_tracks(
        self,
        item_id: str,
        feature_ids: list[str],
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        name: str | None = None,
        allow_newer_schema: bool = False,
    ) -> tuple[int, str, list[str]]:
        """Merge two or more tracks into one, in time order, as one step: "BLUE ONE and
        BLUE TWO merged". The merged track keeps the earliest's id, style and name
        (unless one is given; parts of one split track, "BLUE ONE (1)" and "BLUE ONE
        (2)", are "BLUE ONE" again); the others go. Tracks that overlap in time are not
        merged, and the message says where they overlap. Sensor observations and
        named sets that referred to the others refer to the merged track. Returns
        the step, the merged track's id and what was not kept ("Courses not kept:
        BLUE TWO had none"), which the step's notes say too."""
        chosen = list(dict.fromkeys(feature_ids))

        def change(plot: DebriefFeatureCollection):
            members = [self._track(plot, i) for i in chosen]
            merged, lost = tracks.merge(members, name)
            gone = [t.id for t in members if t.id != merged.id]
            modified: list = [merged]
            for feature in plot.features:
                props = feature.properties
                if props.kind == "sensor_observations" and props.host_track_id in gone:
                    hosted = props.model_copy(update={"host_track_id": merged.id})
                    modified.append(feature.model_copy(update={"properties": hosted}))
            sets = []
            for s in plot.named_sets or []:
                if set(gone) & set(s.feature_ids):
                    ids = [merged.id if i in gone else i for i in s.feature_ids]
                    sets.append(s.model_copy(update={"feature_ids": list(dict.fromkeys(ids))}))
            in_order = sorted(members, key=lambda t: tracks.times_of(t)[0])
            names = [t.properties.name for t in in_order]
            note = f"{_who(names) if len(names) < 3 else f'{len(names)} tracks'} merged"
            record = {
                "notes": [f"Into {merged.properties.name}", *lost],
                "parameters": [models.ParameterValue(name="name", value=merged.properties.name)],
                "selected": chosen,
            }
            changes = Changes(modified=modified, deleted_ids=gone, named_sets=sets)
            return changes, note, (merged.id, lost), record

        step, (merged_id, lost) = self._change(item_id, change, agent, base, allow_newer_schema)
        return step, merged_id, lost

    # --- Cleaning tracks: jumps, smoothing and marked fixes (CAP-01, EXT-14) ------

    def _plot_at(self, item_id: str, base: Base | None) -> DebriefFeatureCollection:
        """The plot as the analyst sees it: at base, if given, else as it is now."""
        history = self.history(item_id)
        if base is None:
            return history.plot()
        history.check_base(base)
        return history.replay(base.current)

    def find_jumps(
        self,
        item_id: str,
        feature_id: str,
        *,
        threshold: Quantity | None = None,
        period: tuple[str, str] | None = None,
        base: Base | None = None,
    ) -> tuple[Quantity, Quantity | None, list[fixes.Jump]]:
        """The fixes of a track that are jumps (see debrief_stac.fixes), to show the
        analyst before anything is removed: the threshold used (the default one unless
        given), the track's median speed between fixes, and the jumps. Changes nothing."""
        track = self._track(self._plot_at(item_id, base), feature_id)
        span = (parse_utc(period[0]), parse_utc(period[1])) if period else None
        find = reckoning.find_dr_jumps if reckoning.reckoned(track) else fixes.find_jumps
        try:
            used, jumps = find(track, threshold, span)
        except tracks.TrackError as error:
            raise CatalogueError(str(error)) from None
        return used, fixes.median_speed(track), jumps

    def remove_jumps(
        self,
        item_id: str,
        feature_id: str,
        times: list[str],
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        threshold: Quantity | None = None,
        allow_newer_schema: bool = False,
    ) -> int:
        """Remove the fixes at times, the jumps the analyst confirmed, as one recorded,
        undoable step: "BLUE ONE: 3 jumps removed". Every series and marked fix stays in
        step with the fixes kept. The record holds the times and the threshold they were
        found at; its notes say when they were, and any marked fixes that went too."""
        if not times:
            raise CatalogueError("Choose the jumps to remove.")

        def change(plot: DebriefFeatureCollection):
            track = self._track(plot, feature_id)
            exact = sorted({fixes.fix_at(track, t) for t in times})
            dr = reckoning.reckoned(track)
            remove = reckoning.dr_without_fixes if dr else fixes.without_fixes
            after, lost = remove(track, exact, threshold)
            notes = [f"At {fixes.describe_times(exact)}"]
            parameters = [models.ParameterValue(name="fix_times", value=" ".join(exact))]
            if dr:
                notes.append(reckoning.JUMPS_JOINED)
            if threshold is not None:
                knots = threshold.to("[kn_i]").value
                said = fixes.describe_speed(knots)
                notes.append(
                    f"Each logged faster than {said}" if dr else f"Each faster than {said} to reach"
                )
                parameters.append(
                    models.ParameterValue(name="threshold", value=threshold.to_model())
                )
            if lost:
                notes.append(f"{lost} marked fix{'' if lost == 1 else 'es'} removed with them")
            record = {"notes": notes, "parameters": parameters, "selected": [feature_id]}
            name = reckoning.dr_name(track.properties.name) if dr else track.properties.name
            note = fixes.describe_jumps(name, len(exact))
            return Changes(modified=[after]), note, None, record

        return self._change(item_id, change, agent, base, allow_newer_schema)[0]

    def smoothing_preview(
        self,
        item_id: str,
        feature_id: str,
        window: int,
        *,
        period: tuple[str, str] | None = None,
        base: Base | None = None,
    ) -> tuple[models.TrackFeature, fixes.Smoothing]:
        """The track as smoothing would leave it, and how far it would move the fixes,
        to show the analyst before it is applied. Changes nothing."""
        track = self._track(self._plot_at(item_id, base), feature_id)
        span = (parse_utc(period[0]), parse_utc(period[1])) if period else None
        smooth = reckoning.dr_smoothed if reckoning.reckoned(track) else fixes.smoothed
        try:
            return smooth(track, window, tracks.period_indices(track, span))
        except tracks.TrackError as error:
            raise CatalogueError(str(error)) from None

    def smooth_track(
        self,
        item_id: str,
        feature_id: str,
        window: int,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        period: tuple[str, str] | None = None,
        allow_newer_schema: bool = False,
    ) -> tuple[int, fixes.Smoothing] | None:
        """Smooth a track, or the fixes of one period of it, by a moving average over
        window fixes, as one recorded, undoable step: "BLUE ONE smoothed over 5 fixes".
        The period's first and last fixes stay where they are. Its notes say how many
        fixes moved and the most any moved. None if no fix would move."""
        span = (parse_utc(period[0]), parse_utc(period[1])) if period else None

        def change(plot: DebriefFeatureCollection):
            track = self._track(plot, feature_id)
            indices = tracks.period_indices(track, span)
            dr = reckoning.reckoned(track)
            after, smoothing = (reckoning.dr_smoothed if dr else fixes.smoothed)(
                track, window, indices
            )
            if not smoothing.moved:
                return None
            part = len(indices) < len(track.properties.times)
            notes = [fixes.describe_largest(smoothing)]
            if dr:
                notes.insert(0, reckoning.DR_SMOOTHING)
            parameters = [models.ParameterValue(name="window", value=float(window))]
            if period:
                notes.append(tracks.describe_period(span))
                parameters += [
                    models.ParameterValue(name="period_start", value=period[0]),
                    models.ParameterValue(name="period_end", value=period[1]),
                ]
            record = {"notes": notes, "parameters": parameters, "selected": [feature_id]}
            name = reckoning.dr_name(track.properties.name) if dr else track.properties.name
            note = fixes.describe_smoothing(name, window, part)
            return Changes(modified=[after]), note, smoothing, record

        return self._change(item_id, change, agent, base, allow_newer_schema)

    def mark_fix(
        self,
        item_id: str,
        feature_id: str,
        time: str,
        changes: dict,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        colour_name: str | None = None,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Give one fix of a track a colour, a label or a comment of its own, or take
        one away (a member given as None or empty), as one recorded, undoable step:
        "BLUE ONE fix at 09:31:00Z labelled 'Turn'". None if nothing changes."""

        def change(plot: DebriefFeatureCollection):
            track = self._track(plot, feature_id)
            made = fixes.marked(track, time, changes, colour_name)
            if made is None:
                return None
            after, note = made
            parameters = [models.ParameterValue(name="fix_time", value=fixes.fix_at(track, time))]
            parameters += [
                models.ParameterValue(name=member, value=value or "")
                for member, value in changes.items()
            ]
            record = {"parameters": parameters, "selected": [feature_id]}
            return Changes(modified=[after]), note, None, record

        result = self._change(item_id, change, agent, base, allow_newer_schema)
        return None if result is None else result[0]

    @staticmethod
    def _track(plot: DebriefFeatureCollection, feature_id: str) -> models.TrackFeature:
        feature = next((f for f in plot.features if f.id == feature_id), None)
        if feature is None:
            raise CatalogueError(f"The plot has no feature {feature_id!r}.")
        if feature.properties.kind != "track":
            raise CatalogueError(f"{feature.properties.name} is not a track.")
        return feature

    @staticmethod
    def _annotation(plot: DebriefFeatureCollection, feature_id: str) -> models.AnnotationFeature:
        feature = next((f for f in plot.features if f.id == feature_id), None)
        if feature is None:
            raise CatalogueError(f"The plot has no feature {feature_id!r}.")
        if feature.properties.kind != "annotation":
            raise CatalogueError(f"{feature.properties.name} is not an annotation.")
        return feature

    @staticmethod
    def _narrative(plot: DebriefFeatureCollection, feature_id: str) -> models.NarrativeFeature:
        feature = next((f for f in plot.features if f.id == feature_id), None)
        if feature is None:
            raise CatalogueError(f"The plot has no narrative entry {feature_id!r}.")
        if feature.properties.kind != "narrative":
            raise CatalogueError(f"{feature_id} is not a narrative entry.")
        return feature

    def _change(self, item_id, change, agent, base, allow_newer_schema):
        """Make one change by hand: change(plot) gives the changes, the note naming
        them and a value to return with the step, or None if nothing changes. base is
        the plot the analyst was looking at: changed since, Conflict is raised (SUB-28)."""
        history = self.history(item_id)
        if base is None:
            base = history.base()  # read before the plot, as run_tool does
            plot = history.plot()
        else:
            history.check_base(base)
            plot = history.replay(base.current)
        try:
            made = change(plot)
        except (
            annotations.AnnotationError,
            narrative.NarrativeError,
            tracks.TrackError,
            collation.CollationError,
        ) as error:
            raise CatalogueError(str(error)) from None
        if made is None:
            return None
        # A change may say more for its record: further notes, its parameters, what it chose.
        changes, note, value, *more = made
        step = self.commit(
            item_id,
            [_edit_record(agent, note, **(more[0] if more else {}))],
            changes,
            base,
            allow_newer_schema=allow_newer_schema,
        )
        return step, value

    # --- Collation: coverage, sources, new data, revisions (CAP-08 to CAP-12) --------

    def _collated(self, others: Iterable[Catalogue] | None) -> collation.Catalogues:
        """The catalogues collation looks in: this one, and any others the analyst has."""
        return collation.Catalogues([self, *(others or [])])

    def coverage(
        self, item_id: str, others: Iterable[Catalogue] | None = None
    ) -> models.CoverageReport:
        """The plot's coverage, for the catalogue browser (CAP-08 to CAP-12): see
        debrief_stac.collation.coverage. others are the analyst's other catalogues, where
        items the plot drew from may be."""
        _check_item_id(item_id)
        history = self.history(item_id)
        plot = history.plot()  # with its island
        details = plot_feature(plot)
        view = details.properties.view if details is not None else None
        shared: set[str] | None = None

        def adds_data(info: collation.ItemInfo) -> bool:
            # A copy of this plot: whether it has steps since they parted that add data.
            nonlocal shared
            if shared is None:
                shared = set(history.step_hashes())
            try:
                return info.catalogue.history(info.item).adds_data_after(shared)
            except (HistoryError, OSError, ValueError):
                return False

        return collation.coverage(
            self._collated(others), self, item_id, plot, view, history.first_recorded, adds_data
        )

    def _me(self, item_id: str, plot: DebriefFeatureCollection) -> collation.Plot:
        details = plot_feature(plot)
        title = (details.properties.title if details else None) or (
            self.read_item(item_id).properties.title or item_id
        )
        return collation.Plot(self.id, item_id, title)

    def _references(
        self, item_id: str, plot: DebriefFeatureCollection, catalogues: collation.Catalogues
    ):
        """Where each source puts a track's fixes, by time, as the plot took them: the
        plot's own as it first recorded them, another item's at the revision each period
        was read at (its history replayed to it, where it has moved on since)."""
        me = self._me(item_id, plot)
        history = self.history(item_id)
        found: dict[tuple, dict[int, collation.Fix]] = {}

        def reference(
            key: collation.Key, revision: str | None, units: collation.Units
        ) -> dict[int, collation.Fix]:
            if (key, revision, units) in found:
                return found[(key, revision, units)]
            track = None
            if me.is_own(key):
                track = history.first_recorded(key[2])
            else:
                other = catalogues.find(key[0])
                if other is not None and key[1] in catalogues.item_ids(other):
                    source = other._plot_at_revision(key[1], revision)
                    track = _track_in(source, key[2]) if source is not None else None
            fixes_ = collation.fixes_of(track, key, units) if track is not None else []
            found[(key, revision, units)] = {f.ms: f for f in fixes_}
            return found[(key, revision, units)]

        return me, reference

    def _plot_at_revision(
        self, item_id: str, revision: str | None
    ) -> DebriefFeatureCollection | None:
        """An item's plot at a revision, or as it is now where that cannot be found. A
        plot at a revision never changes, so it is kept once replayed."""
        cache_key = (_where_of(self), item_id, revision)
        if revision is not None and cache_key in _AT_REVISION:
            _AT_REVISION.move_to_end(cache_key)
            return _AT_REVISION[cache_key]
        history = self.history(item_id)
        try:
            plot, now = history.plot_and_revision()
            if revision is not None and now != revision:
                earlier = history.at_revision(revision)
                if earlier is None:
                    return plot
                plot = earlier
        except (HistoryError, OSError, ValueError):
            return None
        if revision is not None:
            _AT_REVISION[cache_key] = plot
            while len(_AT_REVISION) > _AT_REVISION_KEPT:
                _AT_REVISION.popitem(last=False)
        return plot

    def take_new_data(
        self,
        item_id: str,
        source_catalogue: str,
        source_item: str,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        others: Iterable[Catalogue] | None = None,
        revision: str | None = None,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Take a catalogue item's data into the plot, as one recorded step naming the
        item (CAP-11): see debrief_stac.collation. revision, when given, is the revision
        the analyst saw: if the item has changed since, nothing is taken and they are
        told. Returns the step; None if the plot has the item's data as it is now already
        (taken before, or a revision that changed nothing the plot took), when no step is
        made and the plot is marked as reviewed against that revision instead."""
        catalogues = self._collated(others)
        info = catalogues.info(source_catalogue, source_item)
        if info is None:
            raise CatalogueError(
                f"There is no item {source_item!r} in a catalogue of yours with the id "
                f"{source_catalogue!r}."
            )
        if (source_catalogue, source_item) == (self.id, item_id):
            raise CatalogueError("A plot cannot take data from itself.")
        # The source and its revision read together: the revision recorded is the data read.
        source, now = info.catalogue.history(source_item).plot_and_revision()
        if revision is not None and now != revision:
            raise CatalogueError(
                f"{info.title} has changed since you saw it. Look at its coverage again, "
                "then take it."
            )
        info = replace(info, revision=now)
        unchanged = False

        def change(plot: DebriefFeatureCollection):
            nonlocal unchanged
            me, reference = self._references(item_id, plot, catalogues)
            taken = collation.take(plot, me, source, info, reference)
            if taken.unchanged:
                unchanged = True
                return None
            record = {
                "notes": taken.notes,
                "kind": "tool",
                "tool": _collation_tool(),
                "drawn_from": [
                    models.ItemRef(
                        catalogue=info.catalogue_id,
                        item=info.item,
                        title=info.title,
                        revision=now,
                    )
                ],
            }
            return taken.changes, taken.note, None, record

        result = self._change(item_id, change, agent, base, allow_newer_schema)
        if result is None:
            if unchanged:
                # Nothing to take: the plot is as it would be, so reviewed against it.
                self._mark_reviewed(item_id, [(info.catalogue_id, info.item, now)], agent)
            return None
        return result[0]

    def set_source_preference(
        self,
        item_id: str,
        feature_id: str,
        period: models.TimeRange | dict,
        source: models.SourceTrackRef | dict,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        others: Iterable[Catalogue] | None = None,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Choose which item supplies a period of a track (CAP-09): its fixes in the
        period replaced by that item's, the analyst's edits carried to them, as one
        recorded step naming the item and the period ("BLUE ONE 09:00:00Z to
        09:30:00Z from Nav log"). None if that item supplies it already."""
        try:
            period = period if isinstance(period, models.TimeRange) else models.TimeRange(**period)
            source = (
                source
                if isinstance(source, models.SourceTrackRef)
                else models.SourceTrackRef(**source)
            )
        except (TypeError, ValueError):
            raise CatalogueError(
                "Say which period (start and end) and which source (catalogue, item, track "
                "and name)."
            ) from None
        start, end = parse_utc(period.start), parse_utc(period.end)
        catalogues = self._collated(others)
        key = (source.catalogue, source.item, source.track)

        def change(plot: DebriefFeatureCollection):
            me, reference = self._references(item_id, plot, catalogues)
            if me.is_own(key):
                track = self.history(item_id).first_recorded(source.track)
                chosen = collation.Source(key, me.title, None, track)
            else:
                info = catalogues.info(source.catalogue, source.item)
                if info is None:
                    raise collation.CollationError(
                        f"There is no item {source.item!r} in a catalogue of yours with the id "
                        f"{source.catalogue!r}."
                    )
                theirs, now = info.catalogue.history(source.item).plot_and_revision()
                chosen = collation.Source(key, info.title, now, _track_in(theirs, source.track))
            done = collation.prefer(plot, me, feature_id, (start, end), chosen, reference)
            if done is None:
                return None
            record = {
                "notes": done.notes,
                "parameters": [
                    models.ParameterValue(name="period_start", value=period.start),
                    models.ParameterValue(name="period_end", value=period.end),
                    models.ParameterValue(name="source_item", value=source.item),
                    models.ParameterValue(name="source_track", value=source.track),
                ],
                "selected": [feature_id],
                "kind": "tool",
                "tool": _collation_tool(),
                "drawn_from": [done.drawn] if done.drawn else None,
            }
            return Changes(modified=[done.track]), done.note, None, record

        result = self._change(item_id, change, agent, base, allow_newer_schema)
        return None if result is None else result[0]

    def link_tracks(
        self,
        item_id: str,
        feature_id: str,
        source: models.SourceTrackRef | dict,
        linked: bool,
        agent: models.AgentRef,
        base: Base | None = None,
        *,
        others: Iterable[Catalogue] | None = None,
        allow_newer_schema: bool = False,
    ) -> int | None:
        """Confirm or link (linked true), or refuse or unlink (linked false), a track in
        another item as the platform of the plot's track, as one recorded step (CAP-09;
        decision, product owner, 16 Oct 2026). None if it already is so."""
        try:
            source = (
                source
                if isinstance(source, models.SourceTrackRef)
                else models.SourceTrackRef(**source)
            )
        except (TypeError, ValueError):
            raise CatalogueError(
                "Say which track: its catalogue, item, track id and name."
            ) from None
        catalogues = self._collated(others)
        info = catalogues.info(source.catalogue, source.item)
        title = info.title if info is not None else source.item

        def change(plot: DebriefFeatureCollection):
            track = self._track(plot, feature_id)
            done = collation.relink(track, source, linked, title)
            if done is None:
                return None
            after, note = done
            record = {"selected": [feature_id], "tool": _collation_tool()}
            return Changes(modified=[after]), note, None, record

        result = self._change(item_id, change, agent, base, allow_newer_schema)
        return None if result is None else result[0]

    def _collation_view(
        self, item_id: str, change: Callable[[models.CollationView], models.CollationView]
    ) -> None:
        """Change what the analyst said of collation's marks, in the plot's island:
        view state, never a step (SUB-22). Read and written under the island's hash, so
        a colleague's change meanwhile is never lost: read again, and tried once more."""
        for attempt in range(2):
            view, hash_ = self.read_view(item_id)
            view = view or models.PlotView()
            before = view.collation or models.CollationView()
            after = change(before.model_copy(deep=True))
            new = view.model_copy(update={"collation": after})
            try:
                self.write_view(item_id, new, hash_)
                return
            except Conflict:
                if attempt:
                    raise

    def dismiss_new_data(
        self,
        item_id: str,
        source_catalogue: str,
        source_item: str,
        revision: str,
        agent: models.AgentRef | None = None,
    ) -> None:
        """Set an item's new data aside for the plot (Not now): its mark clears until the
        item is revised (CAP-10). View state in the plot's island, never a step; who set
        it aside and when are kept with it."""
        mark = _answer(source_catalogue, source_item, revision, agent)

        def change(view: models.CollationView) -> models.CollationView:
            kept = [
                r
                for r in view.dismissed or []
                if (r.catalogue, r.item) != (source_catalogue, source_item)
            ]
            return view.model_copy(update={"dismissed": [*kept, mark]})

        self._collation_view(item_id, change)

    def clear_review_flag(
        self,
        item_id: str,
        others: Iterable[Catalogue] | None = None,
        agent: models.AgentRef | None = None,
    ) -> int:
        """The analyst reviewed the plot against the items revised since it drew from them
        (CAP-12): its flag clears until one is revised again. View state in the plot's
        island, never a step (decision, product owner, 16 Oct 2026); who cleared it and
        when are kept with it, a light audit trail. Returns how many revisions were
        reviewed."""
        report = self.coverage(item_id, others)
        if report.review is None:
            return 0
        revised = [(r.catalogue, r.item, r.revision) for r in report.review.revised]
        self._mark_reviewed(item_id, revised, agent)
        return len(revised)

    def _mark_reviewed(
        self,
        item_id: str,
        revisions: list[tuple[str, str, str]],
        agent: models.AgentRef | None,
    ) -> None:
        answers = [_answer(c, i, r, agent) for c, i, r in revisions]

        def change(view: models.CollationView) -> models.CollationView:
            done = {(r.catalogue, r.item) for r in answers}
            kept = [r for r in view.reviewed or [] if (r.catalogue, r.item) not in done]
            return view.model_copy(update={"reviewed": [*kept, *answers]})

        self._collation_view(item_id, change)

    def reviewed(self, item_id: str) -> set[tuple[str, str, str]]:
        """The revisions the analyst reviewed the plot against (CAP-12)."""
        try:
            view, _ = self.read_view(item_id)
        except (HistoryError, OSError, ValueError):
            return set()
        collated = view.collation if view is not None else None
        return (
            {(r.catalogue, r.item, r.revision) for r in (collated.reviewed or [])}
            if collated
            else set()
        )

    # --- The plot's island: its view (SUB-22) ---------------------------------

    def read_view(self, item_id: str) -> tuple[models.PlotView | None, str]:
        """The plot's view (its island), and the hash to pass back when changing it."""
        return self.history(item_id).view()

    def write_view(
        self,
        item_id: str,
        view: models.PlotView | dict | None,
        expected_hash: str,
        *,
        agent: models.AgentRef | None = None,
        allow_newer_schema: bool = False,
    ) -> str:
        """Change the plot's view: never recorded, never undone (SUB-22). Returns the new hash.

        If the view changed since expected_hash was read, Conflict is raised
        and nothing is written (SUB-28). A plot made before plots had a
        whole-plot feature gets one first, as a recorded change by agent: its
        title is content, and the view needs somewhere to live.
        """
        self._check_schema(allow_newer_schema)
        history = self.history(item_id)
        try:
            return history.write_view(view, expected_hash)
        except NoPlotDetails:  # only once the view is known not to have changed meanwhile
            self._add_plot_feature(item_id, agent)
        return history.write_view(view, expected_hash)

    def _add_plot_feature(self, item_id: str, agent: models.AgentRef | None) -> None:
        plot = self.read_plot(item_id)
        title = self.read_item(item_id).properties.title or item_id
        feature = plot_feature(with_plot_details(plot, title))
        record = _edit_record(
            agent or models.AgentRef(kind="software_agent", name="debrief-stac"),
            "Plot details added",
        )
        self.commit(item_id, [record], Changes(added=[feature]))

    # --- Retired presentation.json: migrated on opening (decision 12 Oct) ------

    def legacy_presentation(self, item_id: str) -> list[dict] | None:
        """The entries of a retired presentation.json beside the plot, or None if there is none.

        Read leniently, field by field: the format is retired, so its schema
        is gone. Entries that make no sense are left out.
        """
        path = f"{item_id}/{LEGACY_PRESENTATION_FILE}"
        if not self.store.exists(path):
            return None
        try:
            raw = json.loads(self.store.read_text(path))
        except (ValueError, OSError):
            return []
        entries = raw.get("features") if isinstance(raw, dict) else None
        out = []
        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
                continue
            colour = entry.get("colour")
            out.append(
                {
                    "id": entry["id"],
                    "colour": colour if isinstance(colour, str) and _COLOUR.match(colour) else None,
                    "hidden": entry.get("hidden") is True,
                }
            )
        return out

    def migrate_presentation(self, item_id: str, agent: models.AgentRef) -> bool:
        """Turn a retired presentation.json into content: one recorded step, then delete it.

        The step applies its colours and hidden features to the features
        themselves, recorded as an edit by agent (the analyst opening the
        plot), so they are undoable like any change. A presentation that
        changes nothing is deleted with no step. Returns whether there was
        one. Raises OSError on a store that cannot be written: read_plot
        applies it in memory there.
        """
        entries = self.legacy_presentation(item_id)
        if entries is None:
            return False
        history = self.history(item_id)
        with self.store.locked(f"{item_id}/{LOCK}"):
            if self.legacy_presentation(item_id) is None:  # migrated meanwhile
                return False
            file = history._writable()
            changes = presentation_changes(history._content(file), entries)
            if changes.touched():
                record = _edit_record(agent, _migration_note(entries))
                history._commit_locked(file, [record], changes)
            self.store.delete(f"{item_id}/{LEGACY_PRESENTATION_FILE}")
        return True

    def _add_file(
        self, item_id: str, path: Path, folder: str, kind: str, key: str | None, media_type: str
    ) -> models.SourceRef:
        item = self.read_item(item_id)
        key = key or f"{kind}-{path.name}"
        if key in item.assets:
            raise CatalogueError(f"item {item_id!r} already has an asset {key!r}")
        relative = f"{folder}/{path.name}"
        stored = f"{item_id}/{relative}"
        self.store.import_file(path, stored)
        with self.store.open_binary(stored) as stream:
            digest = content_hash(stream)
        self._verified[stored] = (*self.store.size_and_mtime(stored), digest)
        item.assets[key] = models.StacAsset(
            key=key,
            href=f"./{relative}",
            type=media_type,
            roles={"source": ["source"], "payload": ["data"]}.get(kind, ["metadata"]),
            debrief_asset_kind=kind,
            debrief_content_hash=digest,
        )
        self._write_item(item)
        return models.SourceRef(href=relative, content_hash=digest)

    def verify_sources(self, item_id: str, hrefs: list[str] | None = None) -> list[str]:
        """Check that sources and payloads still match their recorded hashes (SUB-11).

        Payloads are checked too: a plot's sensor observations are read from
        them, so replay depends on them as it does on sources. Only the
        given hrefs (relative to the item) are checked, or every source and
        payload when none are given: replay verifies only what it reads. A
        source whose size and modification time match its last verification
        this session is not re-hashed. Returns problems; empty means all well.
        """
        item = self.read_item(item_id)
        problems = []
        for key, asset in item.assets.items():
            if asset.debrief_asset_kind not in VERIFIED_KINDS:
                continue
            relative = PurePosixPath(
                *[p for p in PurePosixPath(asset.href).parts if p != "."]
            ).as_posix()
            if hrefs is not None and relative not in hrefs:
                continue
            stored = f"{item_id}/{relative}"
            if not self.store.exists(stored):
                problems.append(f"{asset.debrief_asset_kind} {key} ({relative}) is missing")
                continue
            size, mtime = self.store.size_and_mtime(stored)
            cached = self._verified.get(stored)
            if cached and cached[:2] == (size, mtime):
                digest = cached[2]
            else:
                with self.store.open_binary(stored) as stream:
                    digest = content_hash(stream)
                self._verified[stored] = (size, mtime, digest)
            if digest != asset.debrief_content_hash:
                kind = asset.debrief_asset_kind
                problems.append(f"{kind} {key} ({relative}) has changed since it was imported")
        return problems


def diff(before: DebriefFeatureCollection, after: DebriefFeatureCollection) -> Changes:
    """The change that turns one plot into another, feature by feature."""
    old = {f.id: f for f in before.features}
    new = {f.id: f for f in after.features}
    old_sets = {s.id: s for s in before.named_sets or []}
    new_sets = {s.id: s for s in after.named_sets or []}
    changes = Changes(
        added=[f for i, f in new.items() if i not in old],
        modified=[f for i, f in new.items() if i in old and old[i] != f],
        deleted_ids=[i for i in old if i not in new],
        named_sets=[s for i, s in new_sets.items() if old_sets.get(i) != s],
        deleted_named_set_ids=[i for i in old_sets if i not in new_sets],
    )
    natural = [i for i in old if i in new] + [f.id for f in changes.added]
    if list(new) != natural:
        changes.order = list(new)
    return changes


def _edit_record(
    agent: models.AgentRef,
    note: str,
    *,
    notes: list[str] | None = None,
    parameters: list[models.ParameterValue] | None = None,
    selected: list[str] | None = None,
    kind: str = "edit",
    drawn_from: list[models.ItemRef] | None = None,
    tool: models.ToolRef | None = None,
) -> models.ProvRecord:
    """The record of an edit made by hand, such as a colour change. The first note
    names it; further notes, the parameters and the features it chose say exactly
    what was asked, so a track moved by hand is as traceable as a tool's run (SUB-24).
    Data taken from catalogue items names them, each at the revision read (CAP-12)."""
    now = format_utc(int(clock.time() * 1000))
    return models.ProvRecord(
        id=f"{kind}-{uuid.uuid4()}",
        kind=kind,
        started_at=now,
        ended_at=now,
        tool=tool,
        agent=agent,
        notes=[note, *(notes or [])],
        parameters=parameters or None,
        selected=selected or None,
        drawn_from=drawn_from or None,
    )


def _dr_moved_notes(
    after: models.TrackFeature, leg: reckoning.LegChange | None, indices: list[int]
) -> list[str]:
    """What a move of a DR track says: where dead reckoning now starts, or the leg into the
    period's first fix as it now is, and that the fixes after follow."""
    if leg is None:
        return [reckoning.describe_origin(after.geometry.coordinates[0])]
    at = tracks.times_of(after)[indices[0]]
    return [reckoning.describe_leg_into(leg, at), reckoning.FOLLOW_FROM]


def _quantity(quantity: Quantity, decimals: int):
    """A quantity worked out, as a step's parameters record it: rounded, with its unit."""
    return Quantity(round(quantity.value, decimals), quantity.unit).to_model()


def _after(ids: list[str], existing: str, added: str) -> list[str]:
    """ids with added straight after existing."""
    return [i for x in ids for i in ([x, added] if x == existing else [x])]


def _title_in(text: str) -> str | None:
    """The title in a plot file's whole-plot feature, if it has one."""
    try:
        document = json.loads(text)
    except (ValueError, RecursionError):
        return None
    features = document.get("features") if isinstance(document, dict) else None
    for feature in features if isinstance(features, list) else []:
        properties = feature.get("properties") if isinstance(feature, dict) else None
        if isinstance(properties, dict) and properties.get("kind") == "plot":
            title = properties.get("title")
            return title if isinstance(title, str) else None
    return None


def _slug(title: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")


def _who(names: list[str]) -> str:
    """The features a note names: by name for one or two, by count for more."""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{len(names)} features"


def presentation_changes(plot: DebriefFeatureCollection, entries: list[dict]) -> Changes:
    """What a retired presentation.json does to a plot's features: colours on tracks,
    hidden on any feature. Features the plot no longer has are left out."""
    by_id = {e["id"]: e for e in entries}
    modified = []
    for feature in plot.features:
        entry = by_id.get(feature.id)
        if entry is None or feature.properties.kind == "plot":
            continue
        props = feature.properties
        update: dict = {}
        if entry["colour"] and props.kind == "track":
            style = props.style or models.TrackStyle(colour=entry["colour"])
            if style.colour != entry["colour"] or props.style is None:
                update["style"] = style.model_copy(update={"colour": entry["colour"]})
        if entry["hidden"] and not props.hidden:
            update["hidden"] = True
        if update:
            modified.append(
                feature.model_copy(update={"properties": props.model_copy(update=update)})
            )
    return Changes(modified=modified)


def _migration_note(entries: list[dict]) -> str:
    colours = sum(1 for e in entries if e["colour"])
    hidden = sum(1 for e in entries if e["hidden"])
    parts = []
    if colours:
        parts.append("colours")
    if hidden:
        parts.append("hidden features")
    return f"{' and '.join(parts).capitalize() or 'Presentation'} kept from presentation.json"


def _track_in(plot: DebriefFeatureCollection, track_id: str) -> models.TrackFeature | None:
    return next(
        (f for f in plot.features if f.id == track_id and f.properties.kind == "track"), None
    )


def _collation_tool() -> models.ToolRef:
    return models.ToolRef(name=collation.TOOL, version=version("debrief-stac"))


def _answer(
    catalogue_id: str, item: str, revision: str, agent: models.AgentRef | None
) -> models.ItemRevision:
    """An answer the analyst gave to a collation mark, for one revision of an item: who
    gave it and when, a light audit trail in the island (decision, product owner, 16 Oct
    2026)."""
    return models.ItemRevision(
        catalogue=catalogue_id,
        item=item,
        revision=revision,
        by=agent.name if agent is not None else None,
        at=format_utc(int(clock.time() * 1000)),
    )


# Plots replayed to an earlier revision, by catalogue folder, item and revision: a plot
# at a revision never changes, and carrying edits reads it at each choice (NFR-01).
_AT_REVISION: OrderedDict[tuple[str, str, str | None], DebriefFeatureCollection] = OrderedDict()
_AT_REVISION_KEPT = 16


def _where_of(catalogue: Catalogue) -> str:
    return str(getattr(catalogue.store, "root", id(catalogue)))


def review_flags(catalogues: Iterable[Catalogue]) -> list[models.ReviewFlag]:
    """Every product in these catalogues that drew from an item since revised, so may
    need review (CAP-12): see debrief_stac.collation.review_flags."""
    return collation.review_flags(
        collation.Catalogues(catalogues), lambda catalogue, item: catalogue.reviewed(item)
    )
