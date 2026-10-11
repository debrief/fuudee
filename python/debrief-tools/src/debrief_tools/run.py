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
from debrief_tools.declare import ToolContext
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
    plot = catalogue.read_plot(item_id)
    by_id = {feature.id: feature for feature in plot.features}
    missing = [i for i in selection_ids if i not in by_id]
    if missing:
        raise ToolRunError(f"The plot has no feature {missing[0]!r}; refresh and select again.")
    selection = [by_id[i] for i in selection_ids]
    kinds = [str(f.properties.kind) for f in selection]
    if not applies(declaration, kinds):
        raise ToolRunError(f"{declaration.title} does not apply to this selection.")
    writes = set(map(str, declaration.outputs)) - {"non_spatial", "state_change"}
    if read_only and writes:
        raise ToolRunError(f"This store is read-only, and {declaration.title} changes the plot.")
    try:
        values, recorded = bind(declaration, supplied)
    except ParameterError as error:
        raise ToolRunError(str(error)) from None

    started = _now()
    context = ToolContext(plot=plot.model_copy(deep=True), selection=selection, parameters=values)
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

    changed_plot = _apply(plot, result, declaration.title)
    if changed_plot is None:
        return RunOutcome(result, changed=False, record=None)
    record = models.ProvRecord(
        id=f"tool-{started}-{tool_name}",
        kind="tool",
        started_at=started,
        ended_at=_now(),
        tool=models.ToolRef(name=tool_name, version=declaration.version),
        agent=agent,
        selected=selection_ids or None,
        parameters=recorded or None,
    )
    changed_plot.provenance = [*(changed_plot.provenance or []), record]
    try:
        catalogue.write_plot(item_id, changed_plot)
    except DocumentValidationError as error:
        raise ToolRunError(
            f"{declaration.title} produced a plot that is not valid, so nothing was saved: {error}"
        ) from None
    return RunOutcome(result, changed=True, record=record)


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
