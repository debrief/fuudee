"""The plot's island: view state kept in the plot file, outside its history (SUB-22).

A plot may hold one whole-plot feature (properties.kind "plot"). Its
properties.view is the island: view state, such as the plot's time window,
that travels with the plot file but is not content. The rule is simple:
content goes into history (recorded, undoable, with provenance); view state
goes into the island (decision 12 Oct). These helpers find, strip and set
the island, on models and on the JSON text of a plot file, so the history
can hash and replay content alone.
"""

from __future__ import annotations

import json
from typing import Any

from debrief_schemas.generated import debrief as g

PLOT_KIND = "plot"
PLOT_FEATURE_ID = "plot"


def plot_feature(plot: g.DebriefFeatureCollection) -> g.PlotFeature | None:
    """The plot's whole-plot feature, if it has one (at most one, by the schema's rules)."""
    return next((f for f in plot.features if f.properties.kind == PLOT_KIND), None)


def view_of(plot: g.DebriefFeatureCollection) -> g.PlotView | None:
    feature = plot_feature(plot)
    return feature.properties.view if feature is not None else None


def with_view(
    plot: g.DebriefFeatureCollection, view: g.PlotView | None
) -> g.DebriefFeatureCollection:
    """The plot with its island replaced. A plot with no whole-plot feature has nowhere
    to keep one, so it is returned as it is."""
    feature = plot_feature(plot)
    if feature is None or feature.properties.view == view:
        return plot
    properties = feature.properties.model_copy(update={"view": view})
    replaced = feature.model_copy(update={"properties": properties})
    return plot.model_copy(
        update={"features": [replaced if f is feature else f for f in plot.features]}
    )


def without_view(plot: g.DebriefFeatureCollection) -> g.DebriefFeatureCollection:
    """The plot's content: the plot with its island left out."""
    return with_view(plot, None)


def strip_feature_view(feature: Any) -> Any:
    """A feature as history records it: a whole-plot feature never carries its view."""
    if feature.properties.kind != PLOT_KIND or feature.properties.view is None:
        return feature
    properties = feature.properties.model_copy(update={"view": None})
    return feature.model_copy(update={"properties": properties})


# --- On the JSON of a plot file ---------------------------------------------------


def _plot_properties(document: Any) -> dict[str, Any] | None:
    features = document.get("features") if isinstance(document, dict) else None
    for feature in features if isinstance(features, list) else []:
        properties = feature.get("properties") if isinstance(feature, dict) else None
        if isinstance(properties, dict) and properties.get("kind") == PLOT_KIND:
            return properties
    return None


def view_in(document: Any) -> dict[str, Any] | None:
    """The island in a parsed plot file, as JSON, or None."""
    properties = _plot_properties(document)
    view = properties.get("view") if properties is not None else None
    return view if isinstance(view, dict) else None


def set_view_in(document: Any, view: dict[str, Any] | None) -> bool:
    """Replace the island in a parsed plot file, in place. False if the plot has no
    whole-plot feature to hold it (and a view was given)."""
    properties = _plot_properties(document)
    if properties is None:
        return view is None
    properties.pop("view", None)
    if view is not None:
        properties["view"] = view  # last, where dump_document puts it
    return True


def dump_json(document: Any) -> str:
    """JSON text exactly as dump_document writes it. Never NaN or Infinity, which
    Python would write but are not JSON: a value that holds one is refused."""
    return json.dumps(document, indent=2, ensure_ascii=False, allow_nan=False) + "\n"


def view_hash_text(view: dict[str, Any] | None) -> str:
    """A canonical text of an island, for comparing islands whatever their layout."""
    return json.dumps(view, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
