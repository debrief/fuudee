"""Debrief importers: legacy formats into validated plots with provenance."""

from debrief_io.dpf import DpfError, DpfFile, parse_dpf
from debrief_io.dpf_import import build_plot_from_dpf, import_dpf
from debrief_io.importer import IMPORTER, ImportReport, build_plot, import_rep
from debrief_io.rep import RepError, RepFile, RepFix, colour_for, parse_fix, parse_rep, parse_time

__all__ = [
    "IMPORTER",
    "DpfError",
    "DpfFile",
    "ImportReport",
    "RepError",
    "RepFile",
    "RepFix",
    "build_plot",
    "build_plot_from_dpf",
    "colour_for",
    "import_dpf",
    "import_rep",
    "parse_dpf",
    "parse_fix",
    "parse_rep",
    "parse_time",
]
