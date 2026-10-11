"""Running a tool on a plot and writing the result back (TL-03, TL-07, SUB-18, SUB-19).

The service, not the tool, reads and writes the plot: a tool sees a copy and
returns a ToolResult. The result is validated before anything is written, so a
misbehaving tool can fail a run but cannot damage a plot. A run that changes
features is written atomically with one provenance record naming the tool, its
version, who ran it, the selection and the parameter values. A run that only
returns a number, table or graph changes nothing and records nothing.
"""

from __future__ import annotations

import time
import traceback
import uuid
from dataclasses import dataclass
from typing import Any

from debrief_kernel.time import format_utc
from debrief_schemas import (
    DocumentKind,
    DocumentValidationError,
    dump_document,
    load_document,
    models,
)
from debrief_stac import Catalogue, Changes, Conflict, HistoryError
from debrief_tools.declare import Tool, ToolContext
from debrief_tools.parameters import ParameterError, bind
from debrief_tools.registry import Registry, applies


class ToolRunError(Exception):
    """The run did not happen, or failed; nothing was written. The message is for the analyst."""

    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message)
        self.detail = detail  # for logs, never shown as the main message


class ToolRunConflict(ToolRunError):
    """The plot changed while the tool ran (SUB-28).

    mergeable: the changes touch different features, so they can be combined.
    """

    def __init__(self, message: str, mergeable: bool):
        super().__init__(message)
        self.mergeable = mergeable


@dataclass(frozen=True)
class RunOutcome:
    result: models.ToolResult
    changed: bool
    record: models.ProvRecord | None
    new_item: str | None = None  # set when the change was saved as a new plot (SUB-29)


def _now() -> str:
    return format_utc(int(time.time() * 1000))


def execute(
    tool: Tool,
    plot: models.DebriefFeatureCollection,
    selection_ids: list[str],
    supplied: dict[str, Any] | None,
) -> tuple[models.ToolResult, list[models.ParameterValue]]:
    """Run a tool on a copy of the plot exactly as Debrief does, without saving anything.

    Returns the checked result and the parameter values as provenance records
    them. Raises ToolRunError, with a message for the analyst, if the selection
    or values are wrong, the tool fails, or its result is not one Debrief can use.
    debrief_tools.testing uses this, so a tool's own tests see what Debrief sees.
    """
    declaration = tool.declaration
    if len(set(selection_ids)) != len(selection_ids):
        raise ToolRunError("The selection names a feature more than once.")
    # The tool sees a copy: whatever it does to it, only its result can change the plot.
    copy = plot.model_copy(deep=True)
    by_id = {feature.id: feature for feature in copy.features}
    missing = [i for i in selection_ids if i not in by_id]
    if missing:
        raise ToolRunError(f"The plot has no feature {missing[0]!r}; refresh and select again.")
    selection = [by_id[i] for i in selection_ids]
    kinds = [str(f.properties.kind) for f in selection]
    if not applies(declaration, kinds):
        raise ToolRunError(f"{declaration.title} does not apply to this selection.")
    try:
        values, recorded = bind(declaration, supplied)
    except ParameterError as error:
        raise ToolRunError(str(error)) from None
    context = ToolContext(plot=copy, selection=selection, parameters=values)
    try:
        result = tool.run(context)
    except Exception as error:  # a failing tool fails its own run, nothing more (TL-03)
        raise ToolRunError(f"{declaration.title} failed: {error}", traceback.format_exc()) from None
    try:
        result = load_document(
            DocumentKind.TOOL_RESULT, dump_document(DocumentKind.TOOL_RESULT, result)
        )
    except Exception as error:  # noqa: BLE001 - anything a tool returns that is not a result
        raise ToolRunError(
            f"{declaration.title} returned a result Debrief cannot use: {error}"
        ) from None
    undeclared = sorted(_returned(result) - set(map(str, declaration.outputs)))
    if undeclared:
        raise ToolRunError(
            f"{declaration.title} returned {', '.join(undeclared)}, which it does not declare, "
            "so nothing was saved."
        )
    return result, recorded


def run_tool(
    registry: Registry,
    catalogue: Catalogue,
    item_id: str,
    tool_name: str,
    selection_ids: list[str],
    supplied: dict[str, Any] | None,
    agent: models.AgentRef,
    *,
    read_only: bool = False,
    on_conflict: str = "refuse",
) -> RunOutcome:
    tool = registry.tools.get(tool_name)
    if tool is None:
        raise ToolRunError(f"There is no tool called {tool_name}.")
    declaration = tool.declaration
    if read_only and set(map(str, declaration.outputs)) - {"non_spatial", "state_change"}:
        raise ToolRunError(f"This store is read-only, and {declaration.title} changes the plot.")
    history = catalogue.history(item_id)
    base = history.base()  # the head this run starts from (SUB-28)
    plot = catalogue.read_plot(item_id)
    started = _now()
    result, recorded = execute(tool, plot, selection_ids, supplied)

    changes = _changes(plot, result, declaration.title)
    if changes is None:
        return RunOutcome(result, changed=False, record=None)
    if read_only:
        raise ToolRunError(f"This store is read-only, and {declaration.title} changes the plot.")
    record = models.ProvRecord(
        id=f"tool-{uuid.uuid4()}",
        kind="tool",
        started_at=started,
        ended_at=_now(),
        tool=models.ToolRef(name=tool_name, version=declaration.version),
        agent=agent,
        selected=selection_ids or None,
        parameters=recorded or None,
    )
    # The delta holds the operation and its output, so replay never re-runs the tool.
    try:
        catalogue.commit(item_id, [record], changes, base, merge=on_conflict == "merge")
    except Conflict as conflict:
        if on_conflict == "new_plot":
            new_item = catalogue.save_as_new(item_id, base, [record], changes)
            return RunOutcome(result, changed=True, record=record, new_item=new_item)
        raise ToolRunConflict(str(conflict), conflict.mergeable) from None
    except (HistoryError, DocumentValidationError) as error:
        raise ToolRunError(
            f"{declaration.title} produced a change that does not fit the plot, "
            f"so nothing was saved: {error}"
        ) from None
    return RunOutcome(result, changed=True, record=record)


_OUTPUT_FIELDS = {
    "new_features": "new_features",
    "modified_features": "modified_features",
    "deleted_feature_ids": "deleted_features",
    "non_spatial": "non_spatial",
    "named_sets": "named_sets",
    "state_change": "state_change",
}


def _returned(result: models.ToolResult) -> set[str]:
    return {output for field, output in _OUTPUT_FIELDS.items() if getattr(result, field)}


def _changes(
    plot: models.DebriefFeatureCollection, result: models.ToolResult, title: str
) -> Changes | None:
    """The change a result makes to the plot, or None for a result that changes nothing."""
    changes = Changes(
        added=list(result.new_features or []),
        modified=list(result.modified_features or []),
        deleted_ids=list(result.deleted_feature_ids or []),
        named_sets=list(result.named_sets or []),
    )
    if not changes.touched():
        return None
    ids = {f.id for f in plot.features}
    unknown = ({f.id for f in changes.modified} | set(changes.deleted_ids)) - ids
    if unknown:
        raise ToolRunError(
            f"{title} changed a feature the plot does not have: {sorted(unknown)[0]}"
        )
    clash = {f.id for f in changes.added} & ids
    if clash:
        raise ToolRunError(f"{title} added a feature whose id is already used: {sorted(clash)[0]}")
    return changes
