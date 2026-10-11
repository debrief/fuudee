"""Running a tool on a plot and writing the result back (TL-03, TL-07, SUB-18, SUB-19).

The service, not the tool, reads and writes the plot: a tool sees a copy and
returns a ToolResult. The result is validated before anything is written, so a
misbehaving tool can fail a run but cannot damage a plot. A run that changes
features is written atomically with one provenance record naming the tool, its
version, who ran it, the selection and the parameter values. A run that only
returns a number, table or graph changes nothing and records nothing.
"""

from __future__ import annotations

import hashlib
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
from debrief_stac import Catalogue
from debrief_tools.declare import Tool, ToolContext
from debrief_tools.parameters import ParameterError, bind
from debrief_tools.registry import Registry, applies


class ToolRunError(Exception):
    """The run did not happen, or failed; nothing was written. The message is for the analyst."""

    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message)
        self.detail = detail  # for logs, never shown as the main message


@dataclass(frozen=True)
class RunOutcome:
    result: models.ToolResult
    changed: bool
    record: models.ProvRecord | None


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
) -> RunOutcome:
    tool = registry.tools.get(tool_name)
    if tool is None:
        raise ToolRunError(f"There is no tool called {tool_name}.")
    declaration = tool.declaration
    if read_only and set(map(str, declaration.outputs)) - {"non_spatial", "state_change"}:
        raise ToolRunError(f"This store is read-only, and {declaration.title} changes the plot.")
    plot = catalogue.read_plot(item_id)
    read_hash = _plot_hash(catalogue, item_id)
    started = _now()
    result, recorded = execute(tool, plot, selection_ids, supplied)

    changed_plot = _apply(plot, result, declaration.title)
    if changed_plot is None:
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
    changed_plot.provenance = [*(changed_plot.provenance or []), record]
    # Refuse to overwrite a change saved while the tool ran (SUB-28 completes this in Phase 2).
    if _plot_hash(catalogue, item_id) != read_hash:
        raise ToolRunError(
            "The plot changed while the tool was running, so its result was not saved. "
            "Run it again."
        )
    try:
        catalogue.write_plot(item_id, changed_plot)
    except DocumentValidationError as error:
        raise ToolRunError(
            f"{declaration.title} produced a plot that is not valid, so nothing was saved: {error}"
        ) from None
    return RunOutcome(result, changed=True, record=record)


def _plot_hash(catalogue: Catalogue, item_id: str) -> str:
    item = catalogue.read_item(item_id)
    href = item.assets["plot"].href.removeprefix("./")
    text = catalogue.store.read_text(f"{item_id}/{href}")
    return hashlib.sha256(text.encode()).hexdigest()


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


def _apply(
    plot: models.DebriefFeatureCollection, result: models.ToolResult, title: str
) -> models.DebriefFeatureCollection | None:
    new = list(result.new_features or [])
    modified = {f.id: f for f in result.modified_features or []}
    deleted = set(result.deleted_feature_ids or [])
    named_sets = list(result.named_sets or [])
    if not (new or modified or deleted or named_sets):
        return None
    ids = {f.id for f in plot.features}
    unknown = (set(modified) | deleted) - ids
    if unknown:
        raise ToolRunError(
            f"{title} changed a feature the plot does not have: {sorted(unknown)[0]}"
        )
    clash = {f.id for f in new} & ids
    if clash:
        raise ToolRunError(f"{title} added a feature whose id is already used: {sorted(clash)[0]}")
    features = [modified.get(f.id, f) for f in plot.features if f.id not in deleted] + new
    sets = {s.id: s for s in plot.named_sets or []}
    sets.update({s.id: s for s in named_sets})
    return plot.model_copy(update={"features": features, "named_sets": list(sets.values()) or None})
