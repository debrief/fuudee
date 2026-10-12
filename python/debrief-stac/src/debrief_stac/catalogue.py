"""A static, file-based STAC catalogue of plots (SUB-05 to SUB-09, SUB-15, SUB-23, SUB-35).

Layout on disk:

    catalog.json                    the catalogue (StacCatalog)
    <item>/<item>.json              one STAC item per plot
    <item>/plot.geojson             the plot (SUB-05), as of its history's head, with
                                    its island (view state, outside the history)
    <item>/history/                 every change to the plot as a delta (SUB-19)
    <item>/sources/<file>           immutable imported sources (SUB-10)
    <item>/media/<file>             supporting files (SUB-06)
    <item>/payloads/<file>          opaque observation payloads (CON-02)

Items are found by walking the folders and checking each item's parent link;
the catalogue's child links are written as a hint but never trusted (SUB-23).
"""

from __future__ import annotations

import json
import re
import time as clock
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from debrief_kernel.time import format_utc, parse_utc
from debrief_schemas import (
    SCHEMA_VERSION,
    DebriefFeatureCollection,
    DocumentKind,
    dump_document,
    load_document,
    models,
)
from debrief_schemas.island import PLOT_FEATURE_ID, plot_feature
from debrief_stac.hashing import content_hash
from debrief_stac.history import (
    LOCK,
    Base,
    Changes,
    Conflict,
    History,
    apply,
    baseline_record,
    empty_plot,
    view_hash,
)
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
    for feature in plot.features:
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
        props = feature.properties
        if props.kind == "track":
            times += [parse_utc(props.times[0]), parse_utc(props.times[-1])]
        if getattr(props, "time", None):
            times.append(parse_utc(props.time))
        if getattr(props, "time_range", None):
            times += [parse_utc(props.time_range.start), parse_utc(props.time_range.end)]
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
    ) -> models.StacItem:
        """A new STAC item holding a plot (SUB-05). An empty plot if none is given."""
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
                title=title, debrief_schema_version=SCHEMA_VERSION
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

    def store_plot_text(self, item_id: str, plot: DebriefFeatureCollection, text: str) -> None:
        """Write the materialised plot atomically and refresh the item's extent (NFR-11).

        Only the history calls this: every change goes through a delta first.
        """
        self.store.write_text_atomic(self.plot_path(item_id), text)
        # Read the item as late as possible, so a source added meanwhile by
        # another process is kept. A narrow window remains; the extent is only
        # a search hint, and the next save writes it again.
        item = self.read_item(item_id)
        self._apply_extent(item, plot_extent(plot))
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

        The new plot has the history the change was made against, the same
        sources and files, and then the change. The original is untouched.
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
                self.create_plot(new_id, title)
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
            for seq in old.chain(base.current):
                delta = old.delta(seq)
                new.commit(list(delta.records), Changes.of(delta))
            new.commit(records, changes)
            view, _ = old.view()  # view state goes with the copy, outside its history
            if view is not None and plot_feature(new.plot()) is not None:
                new.write_view(view, view_hash(None))
        except BaseException:
            # Never leave half a copy that looks like a plot.
            self.discard_plot(new_id)
            raise
        return new_id

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
        if view is not None and plot_feature(history.plot()) is None:
            if expected_hash != view_hash(None):
                raise Conflict(
                    "The plot's view was changed elsewhere. Debrief is showing the latest.",
                    mergeable=False,
                )
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
        with self.store.locked(f"{item_id}/history/{LOCK}"):
            if self.legacy_presentation(item_id) is None:  # migrated meanwhile
                return False
            history._repair()
            head = history._read_head()
            assert head is not None
            plot = history._current_plot(head)
            changes = presentation_changes(plot, entries)
            if changes.touched():
                record = _edit_record(agent, _migration_note(entries))
                history._append(head, plot, [record], changes, history._disk_view())
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


def _edit_record(agent: models.AgentRef, note: str) -> models.ProvRecord:
    """The record of an edit made by hand, such as a colour change. The note names it."""
    now = format_utc(int(clock.time() * 1000))
    return models.ProvRecord(
        id=f"edit-{uuid.uuid4()}",
        kind="edit",
        started_at=now,
        ended_at=now,
        agent=agent,
        notes=[note],
    )


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
