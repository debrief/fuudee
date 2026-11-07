"""The JSON-RPC plumbing the tool service's method modules share: the error a method
raises, the codes it carries, and who is making a change (SUB-24).

service.py and the modules it hands methods to (figures.py) import from here, never
from each other, so a new module copies this shape rather than reaching into the service.
"""

from __future__ import annotations

from typing import Any

from debrief_schemas import models
from debrief_stac import CatalogueError, Conflict, HistoryError, NewerSchemaError, StoreBusy


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
# The store is busy (another process is saving the plot) or could not be read or written
# (StoreBusy, OSError): nothing was changed; the same request may succeed if sent again.
RETRY = -32004
# The plot's history refused the request or cannot be trusted (HistoryError): damaged, or
# not where the caller thought (nothing to undo, a step it does not hold). Open the plot
# again to see where it stands before asking again.
REOPEN = -32005

# The errors a method's work raises that are the analyst's to read, each mapped by
# rpc_error; anything else is an internal error.
MAPPED = (CatalogueError, HistoryError, StoreBusy, OSError, ValueError)


def rpc_error(error: Exception, message: str | None = None) -> RpcError:
    """The JSON-RPC error for what a method's work raised, so a caller can tell whether to
    send it again (RETRY), open the plot again (REOPEN, CONFLICT), ask the analyst
    (NEWER_SCHEMA) or correct the request (INVALID_PARAMS). The message is the error's own
    unless one is given; it is the same whatever the code."""
    text = str(error) if message is None else message
    if isinstance(error, Conflict):
        return RpcError(CONFLICT, text)
    if isinstance(error, HistoryError):
        return RpcError(REOPEN, text)
    if isinstance(error, NewerSchemaError):
        return RpcError(NEWER_SCHEMA, text)
    # A file that is not there will not appear by asking again: the request named it.
    if isinstance(error, StoreBusy) or (
        isinstance(error, OSError) and not isinstance(error, FileNotFoundError)
    ):
        return RpcError(RETRY, text)
    return RpcError(INVALID_PARAMS, text)


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
