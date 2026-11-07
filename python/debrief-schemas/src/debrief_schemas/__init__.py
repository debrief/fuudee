"""Debrief data-file schema: generated Pydantic models and document validation."""

from debrief_schemas.documents import (
    CONFIG_VERSION,
    DocumentKind,
    DocumentValidationError,
    SchemaVersionError,
    dump_document,
    dump_plot,
    load_document,
    load_plot,
    load_view,
)
from debrief_schemas.generated import debrief as models
from debrief_schemas.generated.debrief import DebriefFeatureCollection
from debrief_schemas.generated.schema_version import SCHEMA_VERSION
from debrief_schemas.migrations import MIGRATIONS, Migration, register_migration

__all__ = [
    "CONFIG_VERSION",
    "SCHEMA_VERSION",
    "DebriefFeatureCollection",
    "DocumentKind",
    "DocumentValidationError",
    "MIGRATIONS",
    "Migration",
    "SchemaVersionError",
    "dump_document",
    "dump_plot",
    "load_document",
    "load_plot",
    "load_view",
    "models",
    "register_migration",
]
