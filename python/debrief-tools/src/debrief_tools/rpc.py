"""The JSON-RPC plumbing the tool service's method modules share: the error a method
raises, the codes it carries, and who is making a change (SUB-24).

service.py and the modules it hands methods to (figures.py) import from here, never
from each other, so a new module copies this shape rather than reaching into the service.
"""

from __future__ import annotations

from typing import Any

from debrief_schemas import models


class RpcError(Exception):
    """A request refused with a JSON-RPC error: its code, and a message for the analyst."""

    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


PARSE_ERROR = -32700
INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL = -32600, -32601, -32602, -32603
CONFLICT = -32001  # the plot changed since the caller's base: open it again (SUB-28)
NEWER_SCHEMA = -32002  # would write a newer schema into the catalogue: ask, then allow (SUB-35)
# would lose what the analyst made: ask, then send again confirming (a track changed while
# plotted by dead reckoning, plotted over the ground: discard_dr_changes); or would read a
# narrative file into a plot it was read into before, or entries the plot has already:
# ask, then send again with duplicates "skip" or "add" (product owner, 15 Oct 2026)
NEEDS_CONFIRMATION = -32003


def agent_ref(params: dict[str, Any], method: str | None = None) -> models.AgentRef:
    """Who is making a change, for its provenance record (SUB-24). Required: a change
    with no agent is refused, never attributed to anyone by default, so a record never
    names the analyst for what an agent did."""
    agent = params.get("agent")
    if agent is None:
        raise RpcError(INVALID_PARAMS, f"{method or 'This change'} {AGENT_NEEDED}")
    if not isinstance(agent, dict):
        raise RpcError(INVALID_PARAMS, "agent must be {kind, name}")
    try:
        return models.AgentRef(**agent)
    except ValueError:
        raise RpcError(INVALID_PARAMS, "agent must be {kind, name}") from None


AGENT_NEEDED = (
    "needs agent: say who is making the change, with kind (person or software_agent) "
    "and a name, which provenance records (SUB-24)."
)
