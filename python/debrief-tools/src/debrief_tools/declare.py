"""How a tool library declares its tools (TL-04, TL-06, CAP-24).

A tool is a Python function decorated with @tool. The decorator takes the
declaration Debrief shows on the tool's form; the function takes a
ToolContext and returns a ToolResult. Tools use Debrief data types only
(TL-09) and must run under Pyodide as well as CPython (CON-09): pure Python
plus the kernel, no file or network access of their own.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

from debrief_schemas import DebriefFeatureCollection, DocumentKind, load_document, models

Feature = models.TrackFeature | models.AnnotationFeature | models.SensorObservationsFeature


@dataclass
class ToolContext:
    """What a tool sees when it runs.

    parameters holds the values from the form, checked against the
    declaration: numbers, strings and booleans as Python values, quantities
    as debrief_kernel Quantity objects, times as epoch milliseconds.
    """

    plot: DebriefFeatureCollection
    selection: Sequence[Feature]
    parameters: dict[str, Any]
    _taken: set[str] = field(default_factory=set)

    def new_id(self, prefix: str) -> str:
        """A feature id not yet used in the plot or by this run."""
        if not self._taken:
            self._taken.update(f.id for f in self.plot.features)
        candidate, n = prefix, 2
        while candidate in self._taken:
            candidate, n = f"{prefix}-{n}", n + 1
        self._taken.add(candidate)
        return candidate


Run = Callable[[ToolContext], models.ToolResult]


@dataclass(frozen=True)
class Tool:
    declaration: models.ToolDeclaration
    run: Run

    @property
    def name(self) -> str:
        return self.declaration.name


def tool(**declaration: Any) -> Callable[[Run], Run]:
    """Declare a tool. The declaration is validated when the library loads.

    @tool(name="core.track_summary", version="0.0.1", title="Track summary",
          explanation="...", applies_to=["track"], outputs=["non_spatial"])
    def track_summary(context: ToolContext) -> models.ToolResult: ...
    """

    def decorate(run: Run) -> Run:
        run.debrief_tool = Tool(load_document(DocumentKind.TOOL_DECLARATION, declaration), run)  # type: ignore[attr-defined]
        return run

    return decorate


def tools_in(module: object) -> list[Tool]:
    """The tools a library module declares, in definition order."""
    return [value.debrief_tool for value in vars(module).values() if hasattr(value, "debrief_tool")]
