"""Debrief sample data: open AIS with a synthesised exercise on top (DEP-08).

The builder is imported only when asked for, so debrief_sample.walkthrough stays
small in the browser (CON-09), where the playground imports it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from debrief_sample.builder import DEFAULT_SEED, RECORDED_AT, BuildReport, build

__all__ = ["DEFAULT_SEED", "RECORDED_AT", "BuildReport", "build"]


def __getattr__(name: str) -> Any:
    if name in __all__:
        from debrief_sample import builder

        return getattr(builder, name)
    raise AttributeError(f"module 'debrief_sample' has no attribute {name!r}")
