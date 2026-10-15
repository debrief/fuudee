"""Debrief importers: legacy formats into validated plots with provenance."""

from debrief_io.document_import import import_document
from debrief_io.documents import Document, DocumentError, read_document
from debrief_io.dpf import DpfError, DpfFile, parse_dpf
from debrief_io.dpf_import import build_plot_from_dpf, import_dpf
from debrief_io.importer import IMPORTER, ImportReport, build_plot, import_rep
from debrief_io.narrative import (
    Choices,
    NarrativeImport,
    NoNarrativeError,
    import_narrative,
    preview_narrative,
)
from debrief_io.rep import (
    RepError,
    RepFile,
    RepFix,
    RepNarrative,
    colour_for,
    parse_fix,
    parse_narrative,
    parse_rep,
    parse_time,
)

__all__ = [
    "IMPORTER",
    "Choices",
    "Document",
    "DocumentError",
    "DpfError",
    "DpfFile",
    "ImportReport",
    "NarrativeImport",
    "NoNarrativeError",
    "RepError",
    "RepFile",
    "RepFix",
    "RepNarrative",
    "build_plot",
    "build_plot_from_dpf",
    "colour_for",
    "import_document",
    "import_dpf",
    "import_narrative",
    "import_rep",
    "parse_dpf",
    "parse_fix",
    "parse_narrative",
    "parse_rep",
    "parse_time",
    "preview_narrative",
    "read_document",
]
