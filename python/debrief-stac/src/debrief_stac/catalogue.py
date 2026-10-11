"""A static, file-based STAC catalogue of plots (SUB-05 to SUB-09, SUB-15, SUB-23, SUB-35).

Layout on disk:

    catalog.json                    the catalogue (StacCatalog)
    <item>/<item>.json              one STAC item per plot
    <item>/plot.geojson             the plot (SUB-05), as of its history's head
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
from debrief_stac.hashing import content_hash
from debrief_stac.history import Base, Changes, History, baseline_record, empty_plot
from debrief_stac.store import FileStore, Store

STAC_VERSION = "1.1.0"
CATALOGUE_FILE = "catalog.json"
PLOT_ASSET = "plot"
PLOT_FILE = "plot.geojson"
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
        """
        return self.history(item_id).plot()

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
        except BaseException:
            # Never leave half a copy that looks like a plot.
            self.store.delete_folder(new_id)
            self.model.links = [
                link for link in self.model.links if link.href != f"./{self._item_path(new_id)}"
            ]
            self._save_catalogue()
            raise
        return new_id

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
