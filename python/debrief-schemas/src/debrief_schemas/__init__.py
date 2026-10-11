"""Debrief data-file schema: generated Pydantic models and plot validation."""

from debrief_schemas.generated.debrief import (
    AgentRef,
    DebriefFeatureCollection,
    LineStringGeometry,
    ProvRecord,
    SourceRef,
    ToolRef,
    TrackFeature,
    TrackProperties,
)
from debrief_schemas.generated.schema_version import SCHEMA_VERSION
from debrief_schemas.plot_io import (
    PlotValidationError,
    SchemaVersionError,
    dump_plot,
    load_plot,
)

__all__ = [
    "SCHEMA_VERSION",
    "AgentRef",
    "DebriefFeatureCollection",
    "LineStringGeometry",
    "PlotValidationError",
    "ProvRecord",
    "SchemaVersionError",
    "SourceRef",
    "ToolRef",
    "TrackFeature",
    "TrackProperties",
    "dump_plot",
    "load_plot",
]
