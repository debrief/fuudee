"""Debrief catalogues: plots and their sources in static, file-based STAC catalogues."""

from debrief_stac.catalogue import (
    STAC_VERSION,
    Catalogue,
    CatalogueError,
    Extent,
    ItemSummary,
    NewerSchemaError,
    plot_extent,
)
from debrief_stac.composite import CompositeCatalogue
from debrief_stac.store import FileStore, Store, StoreError

__all__ = [
    "STAC_VERSION",
    "Catalogue",
    "CatalogueError",
    "CompositeCatalogue",
    "Extent",
    "FileStore",
    "ItemSummary",
    "NewerSchemaError",
    "Store",
    "StoreError",
    "plot_extent",
]
