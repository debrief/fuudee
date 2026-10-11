"""Tool code runs here, in a worker process, never in the service itself (TL-02, TL-03).

The service starts one worker, which imports the tool libraries and runs
each call. A tool that hangs is stopped when its time is up; one that exits
or crashes the interpreter takes only the worker with it. Either way the
service reports the failure, starts a fresh worker and carries on. Libraries
are imported only in the worker, so even a library that misbehaves on import
cannot stop the service.

Everything crossing between the two processes is plain JSON-shaped data.
"""

from __future__ import annotations

import json
import logging
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from concurrent.futures.process import BrokenProcessPool
from typing import Any

from debrief_config import load_config
from debrief_schemas import DocumentKind, dump_document, models
from debrief_stac import Catalogue
from debrief_tools.registry import Registry
from debrief_tools.run import ToolRunConflict, ToolRunError, run_tool

log = logging.getLogger("debrief_tools")
_registry: Registry | None = None


def _initialise(libraries: list[str]) -> None:
    global _registry
    _registry = Registry.discover(libraries)


def _describe() -> dict[str, Any]:
    assert _registry is not None
    return {
        "tools": [
            json.loads(dump_document(DocumentKind.TOOL_DECLARATION, t.declaration))
            for t in _registry.tools.values()
        ],
        "unavailable": [u.__dict__ for u in _registry.unavailable],
    }


def _call(name: str, arguments: dict[str, Any], config_path: str | None) -> dict[str, Any]:
    """Run one tool call. Returns {"result", "changed", "new_item"} or {"error"}.

    A run that meets a change made meanwhile also returns {"conflict": {"mergeable"}}.
    """
    assert _registry is not None
    try:
        config = load_config(config_path) if config_path else load_config()
        store = next((s for s in config.stores if s.id == arguments.get("store")), None)
        if store is None:
            raise ToolRunError(
                f"There is no store {arguments.get('store')!r} in your Debrief configuration."
            )
        outcome = run_tool(
            _registry,
            Catalogue.open(store.location),
            str(arguments.get("item")),
            name,
            list(arguments.get("selection") or []),
            arguments.get("parameters"),
            models.AgentRef(**arguments["agent"]),
            read_only=bool(store.read_only),
            on_conflict=str(arguments.get("on_conflict") or "refuse"),
        )
    except ToolRunConflict as conflict:
        return {"error": str(conflict), "conflict": {"mergeable": conflict.mergeable}}
    except ToolRunError as error:
        if error.detail:
            log.warning("%s\n%s", error, error.detail)
        return {"error": str(error)}
    except Exception as error:  # noqa: BLE001 - reported as this call's failure
        log.exception("tools/call %s", name)
        return {"error": f"The tool could not run: {error}"}
    return {
        "result": json.loads(dump_document(DocumentKind.TOOL_RESULT, outcome.result)),
        "changed": outcome.changed,
        "new_item": outcome.new_item,
    }


class ToolWorker:
    """One worker process, replaced whenever a call kills or outlives it."""

    def __init__(self, libraries: list[str], config_path: str | None, timeout_s: float):
        self.libraries, self.config_path, self.timeout_s = libraries, config_path, timeout_s
        self._pool = self._start()

    def _start(self) -> ProcessPoolExecutor:
        return ProcessPoolExecutor(
            max_workers=1,
            mp_context=multiprocessing.get_context("spawn"),
            initializer=_initialise,
            initargs=(self.libraries,),
        )

    def _restart(self) -> None:
        for process in list(getattr(self._pool, "_processes", {}).values()):
            process.kill()
        self._pool.shutdown(wait=False, cancel_futures=True)
        self._pool = self._start()

    def describe(self) -> dict[str, Any]:
        try:
            return self._pool.submit(_describe).result(timeout=self.timeout_s)
        except (BrokenProcessPool, FutureTimeout) as error:
            self._restart()
            reason = "took too long to load" if isinstance(error, FutureTimeout) else "stopped"
            return {
                "tools": [],
                "unavailable": [
                    {"library": "*", "tool": None, "reason": f"The tool libraries {reason}."}
                ],
            }

    def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        future = self._pool.submit(_call, name, arguments, self.config_path)
        try:
            return future.result(timeout=self.timeout_s)
        except FutureTimeout:
            self._restart()
            return {
                "error": f"The tool took longer than {self.timeout_s:g} seconds and was stopped. "
                "Nothing was saved."
            }
        except (BrokenProcessPool, SystemExit, Exception):  # noqa: BLE001 - incl. sys.exit in a tool
            self._restart()
            return {"error": "The tool stopped unexpectedly. Nothing was saved."}

    def close(self) -> None:
        self._restart()
        self._pool.shutdown(wait=False)
