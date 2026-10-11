"""Finding tools at runtime and offering them for a selection (TL-03, TL-05, TL-08, TL-09)."""

from __future__ import annotations

import importlib
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from importlib.metadata import entry_points
from types import ModuleType

from debrief_schemas import models
from debrief_tools.declare import Tool, tools_in

ENTRY_POINT_GROUP = "debrief.tools"
KNOWN_KINDS = frozenset(k.value for k in models.FeatureKindEnum)


@dataclass(frozen=True)
class Unavailable:
    """A library or tool Debrief found but will not offer, and why (TL-03, TL-09)."""

    library: str
    tool: str | None
    reason: str


class Registry:
    def __init__(self) -> None:
        self.tools: dict[str, Tool] = {}
        self.libraries: list[str] = []
        self.unavailable: list[Unavailable] = []

    @classmethod
    def discover(cls, extra_modules: Iterable[str] = ()) -> Registry:
        """Every library registered under the debrief.tools entry point, plus any
        modules named directly (for a scientist's library under development)."""
        registry = cls()
        for point in sorted(entry_points(group=ENTRY_POINT_GROUP), key=lambda p: p.name):
            registry.add_library(point.name, point.load)
        for module in extra_modules:
            registry.add_library(module, lambda module=module: importlib.import_module(module))
        return registry

    def add_library(self, name: str, load: Callable[[], ModuleType]) -> None:
        """Load one library. Whatever goes wrong stays with that library (TL-03)."""
        try:
            tools = tools_in(load())
        except Exception as error:  # a broken library must not stop the others
            self.unavailable.append(
                Unavailable(name, None, f"The library could not be loaded: {error}")
            )
            return
        self.libraries.append(name)
        for tool in tools:
            reason = self._refusal(tool)
            if reason:
                self.unavailable.append(Unavailable(name, tool.name, reason))
            else:
                self.tools[tool.name] = tool

    def _refusal(self, tool: Tool) -> str | None:
        if tool.name in self.tools:
            return f"Another library already provides a tool called {tool.name}."
        unknown = sorted(set(tool.declaration.applies_to) - KNOWN_KINDS - {"*"})
        if unknown:
            kinds = ", ".join(unknown)
            return (
                f"It applies to {kinds}, which is not a Debrief data type. "
                f"Debrief knows: {', '.join(sorted(KNOWN_KINDS))}."
            )
        return None

    def for_selection(self, kinds: list[str]) -> list[Tool]:
        """Tools that apply to every selected item, and to this many of them (TL-08)."""
        return [tool for tool in self.tools.values() if applies(tool.declaration, kinds)]


def applies(declaration: models.ToolDeclaration, kinds: list[str]) -> bool:
    count = len(kinds)
    minimum = 1 if declaration.min_selected is None else declaration.min_selected
    if count < minimum or (
        declaration.max_selected is not None and count > declaration.max_selected
    ):
        return False
    accepted = set(declaration.applies_to)
    return "*" in accepted or all(kind in accepted for kind in kinds)
