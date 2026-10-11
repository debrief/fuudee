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

from debrief_schemas import (
    DebriefFeatureCollection,
    DocumentKind,
    DocumentValidationError,
    load_document,
    models,
)

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
        try:
            checked = load_document(DocumentKind.TOOL_DECLARATION, declaration)
        except DocumentValidationError as error:
            name = declaration.get("name", run.__name__)
            problems = "\n".join(f"  - {_plain(p, declaration)}" for p in error.problems)
            raise DeclarationError(f"The declaration of {name} is not valid:\n{problems}") from None
        run.debrief_tool = Tool(checked, run)  # type: ignore[attr-defined]
        return run

    return decorate


class DeclarationError(ValueError):
    """A tool's declaration does not follow the schema; the message lists every problem."""


def _plain(problem: str, declaration: dict[str, Any]) -> str:
    """Name the parameter a JSON path points at, so the author can find it."""
    path, _, message = problem.partition(": ")
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "parameters" and parts[1].isdigit():
        params = declaration.get("parameters") or []
        index = int(parts[1])
        if index < len(params) and isinstance(params[index], dict):
            field = "/".join(parts[2:]) or "it"
            allowed = _ALLOWED.get(field)
            if allowed and "is not valid under any" in message:
                message = f"{message.split(' is not')[0]} is not one of {', '.join(allowed)}"
            return f"parameter {params[index].get('name', index)!r}, {field}: {message}"
    return problem


_ALLOWED = {
    "kind": [k.value for k in models.ParameterKindEnum],
    "quantity_kind": [k.value for k in models.QuantityKindEnum],
}


def tools_in(module: object) -> list[Tool]:
    """The tools a library module declares, in definition order."""
    return [value.debrief_tool for value in vars(module).values() if hasattr(value, "debrief_tool")]
