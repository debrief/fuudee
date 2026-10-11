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
from debrief_stac import Base, Catalogue, Changes, Conflict, HistoryError, NewerSchemaError
from debrief_tools import diagnostics
from debrief_tools.declare import Tool, ToolContext
from debrief_tools.parameters import ParameterError, bind
from debrief_tools.registry import Registry, applies


class ToolRunError(Exception):
    """The run did not happen, or failed; nothing was written. The message is for the analyst."""

    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message)
        # For logs: the failure as diagnostics.describe_exception gives it, with no
        # message text in it (NFR-14). Never shown as the main message.
        self.detail = detail


class ToolRunNewerSchema(ToolRunError):
    """Saving would write a newer schema into the catalogue (SUB-35): ask, then run again
    with allow_newer_schema."""


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
    state: models.SharedState | None = None,
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
    context = ToolContext(
        plot=copy,
        selection=selection,
        parameters=values,
        state=state.model_copy(deep=True) if state else None,
    )
    try:
        result = tool.run(context)
    except Exception as error:  # a failing tool fails its own run, nothing more (TL-03)
        raise ToolRunError(
            f"{declaration.title} failed: {error}", diagnostics.describe_exception(error)
        ) from None
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
    _check_state_change(result, plot, declaration.title)
    return result, recorded


def _check_state_change(
    result: models.ToolResult, plot: models.DebriefFeatureCollection, title: str
) -> None:
    """A selection a tool sets must name features the plot will have (TL-10)."""
    selection = result.state_change.selection if result.state_change else None
    if selection is None:
        return
    deleted = set(result.deleted_feature_ids or [])
    known = {f.id for f in plot.features if f.id not in deleted}
    known |= {f.id for f in result.new_features or []}
    unknown = [i for i in selection.feature_ids if i not in known]
    if unknown:
        raise ToolRunError(f"{title} selected a feature the plot does not have: {unknown[0]}")


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
    base: Base | None = None,
    state: models.SharedState | None = None,
    allow_newer_schema: bool = False,
) -> RunOutcome:
    """Run a tool on a plot and record what it changes.

    base is the plot the analyst was looking at when they ran the tool, so a
    change made elsewhere since then is detected (SUB-28). Without one, the
    run starts from the plot as it is now.
    """
    tool = registry.tools.get(tool_name)
    if tool is None:
        raise ToolRunError(f"There is no tool called {tool_name}.")
    declaration = tool.declaration
    if read_only and set(map(str, declaration.outputs)) - {"non_spatial", "state_change"}:
        raise ToolRunError(f"This store is read-only, and {declaration.title} changes the plot.")
    history = catalogue.history(item_id)
    try:
        if base is None:
            # The base is read before the plot: if the plot moves on in between,
            # the commit sees a stale base and reports a conflict rather than
            # overwriting. Keep this order.
            base = history.base()
            plot = history.plot()
        else:
            history.check_base(base)
            plot = history.replay(base.current)
    except HistoryError as error:
        raise ToolRunError(str(error)) from None
    started = _now()
    result, recorded = execute(tool, plot, selection_ids, supplied, state)

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
        catalogue.commit(
            item_id,
            [record],
            changes,
            base,
            merge=on_conflict == "merge",
            allow_newer_schema=allow_newer_schema,
        )
    except Conflict as conflict:
        if on_conflict == "new_plot":
            new_item = catalogue.save_as_new(item_id, base, [record], changes)
            return RunOutcome(result, changed=True, record=record, new_item=new_item)
        raise ToolRunConflict(str(conflict), conflict.mergeable) from None
    except NewerSchemaError as error:
        raise ToolRunNewerSchema(str(error)) from None
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
