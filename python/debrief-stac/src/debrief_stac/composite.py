"""Several catalogues seen as one, each item showing where it comes from (SUB-17).

Combining data from several catalogues is the analyst's responsibility;
Debrief does not warn about it (SEC-04).
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator

from debrief_schemas import DebriefFeatureCollection
from debrief_stac.catalogue import Catalogue, CatalogueError, ItemSummary


class CompositeCatalogue:
    def __init__(self, catalogues: Iterable[Catalogue]):
        self.catalogues: dict[str, Catalogue] = {}
        for catalogue in catalogues:
            if catalogue.id in self.catalogues:
                raise CatalogueError(f"two catalogues share the id {catalogue.id!r}")
            self.catalogues[catalogue.id] = catalogue

    def summaries(self) -> Iterator[ItemSummary]:
        for catalogue in self.catalogues.values():
            yield from catalogue.summaries()

    def read_plot(self, catalogue_id: str, item_id: str) -> DebriefFeatureCollection:
        if catalogue_id not in self.catalogues:
            raise CatalogueError(f"no catalogue {catalogue_id!r} in this view")
        return self.catalogues[catalogue_id].read_plot(item_id)
