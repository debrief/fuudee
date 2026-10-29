"""One entry point per operation, for every front end (PAR-15, docs/panel-parity-srd.md).

The tool service (service.py, for VS Code and agents) and the playground's Python
(vscode/play/play.py) call these, so which tools are offered for a selection, which are
not available and why, and how undo, redo and go to a step check the plot the caller
started from are decided here once, never re-filtered or re-sequenced by a front end.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from debrief_schemas import models
from debrief_stac import Base, History
from debrief_tools.registry import Registry, applies

STEPS = ("undo", "redo", "goto")


def history_steps(history: History) -> list[dict[str, Any]]:
    """A plot's history as the History panel lists it (SUB-21): each step, what made it, when,
    by whom, its notes (which name an edit made without a tool, such as "Colour of BLUE ONE
    set to red"), what undoing it goes back to and whether undo takes it with the step before."""
    out = []
    for step in history.steps():
        first = step.records[0]
        out.append(
            {
                "seq": step.seq,
                "status": step.status,
                "kind": str(first.kind),
                "tool": first.tool.name if first.tool else None,
                "agent": ", ".join(dict.fromkeys(r.agent.name for r in step.records)),
                "at": first.ended_at or first.started_at,
                "records": len(step.records),
                "notes": list(first.notes or []),
                "after": step.after,
                "records_only": step.records_only,
            }
        )
    return out


def offered_tools(
    declarations: Mapping[str, models.ToolDeclaration], kinds: list[str]
) -> list[str]:
    """The tools offered for a selection of these kinds, by name, in the order declared (TL-08)."""
    return [name for name, declaration in declarations.items() if applies(declaration, kinds)]


def unavailable_tools(registry: Registry) -> list[dict[str, Any]]:
    """The libraries and tools found but not offered, and why (TL-03, TL-09), as tools/list
    says them."""
    return [dict(u.__dict__) for u in registry.unavailable]


def move(
    history: History,
    how: str,
    base: Base | None = None,
    step: int | None = None,
    *,
    allow_newer_schema: bool = False,
) -> int:
    """Undo, redo or go to a step (SUB-21): replay to it, refused (Conflict) when the plot
    is no longer the one the caller started from (base, SUB-28). Returns the step now current."""
    if how == "undo":
        return history.undo(base, allow_newer_schema=allow_newer_schema)
    if how == "redo":
        return history.redo(base, allow_newer_schema=allow_newer_schema)
    if how == "goto":
        if type(step) is not int:
            raise ValueError("goto needs the step to return to")
        history.goto(step, base, allow_newer_schema=allow_newer_schema)
        return step
    raise ValueError(f"{how!r} is not one of {', '.join(STEPS)}")
