"""Migrations between data-file schema versions (SUB-13), as a registry.

A file written against an older schema version opens only if a chain of
registered migrations leads from its version to the current one; otherwise it
is refused, with its version named, as before. The registry starts empty:
before 1.0.0 there is no migration guarantee, so today only the current
version opens. TypeScript holds the same registry (ts/schemas/src/index.ts).

A migration is a function from a file's JSON, as read, to its JSON at the next
version. It never sets the recorded version: the registry does, after each
step. Each migration applied to a plot is recorded in its provenance as an
activity of kind ``migration`` (SUB-13): one record a step, naming both
versions and what changed. A plot that carries its history also gains a step
holding those records, as any recorded change does, so its hash chain and its
current step's result_hash stay whole; the earlier steps are left as they
were, since rewriting them would break the chain. A migration that changes a
feature's shape must therefore also say how earlier steps are read: that is the
first such migration's to design, not this registry's.

Message and request types (webview messages, tool calls) carry no version and
are never migrated: only files are.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

# A file's JSON at one version, given its document kind ("plot", "stac_item", ...),
# returned at the next. It may change the dict it is given: the registry passes a copy.
MigrateFunction = Callable[[str, dict[str, Any]], dict[str, Any]]

# The software agent named in a migration's provenance record.
MIGRATION_AGENT = "debrief-schemas"


@dataclass(frozen=True)
class Migration:
    """One step: a file at from_version brought to to_version, and what changed."""

    from_version: str
    to_version: str
    migrate: MigrateFunction
    note: str


# Registered migrations, by the version they start from. Empty: none yet.
MIGRATIONS: dict[str, Migration] = {}


def parse_version(version: str) -> tuple[int, int, int]:
    """A semantic version's three numbers. Raises ValueError if it is not one."""
    parts = version.split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError(f"{version!r} is not a semantic version")
    major, minor, patch = (int(p) for p in parts)
    return major, minor, patch


def register_migration(
    from_version: str, to_version: str, migrate: MigrateFunction, note: str
) -> Migration:
    """Register a step from one version to a later one. One step from each version."""
    if parse_version(to_version) <= parse_version(from_version):
        raise ValueError(f"a migration goes forward, not from {from_version} to {to_version}")
    if from_version in MIGRATIONS:
        raise ValueError(f"a migration from {from_version} is already registered")
    if not note.strip():
        raise ValueError("a migration says what it changed")
    migration = Migration(from_version, to_version, migrate, note)
    MIGRATIONS[from_version] = migration
    return migration


def chain(found: str, current: str) -> list[Migration] | None:
    """The migrations leading from found to current, in order, or None if none do.

    Each step goes forward, so the walk ends; it fails if it stops short of the
    current version or passes it.
    """
    steps: list[Migration] = []
    version = found
    while version != current:
        step = MIGRATIONS.get(version)
        if step is None or parse_version(step.to_version) > parse_version(current):
            return None
        steps.append(step)
        version = step.to_version
    return steps


def now_utc() -> str:
    """The time now, as the schema writes it: UTC, three decimal places."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def migration_record(step: Migration, at: str) -> dict[str, Any]:
    """The provenance record of one migration applied, as JSON (a ProvRecord)."""
    return {
        "id": f"migration-{step.from_version}-to-{step.to_version}-{at}",
        "kind": "migration",
        "started_at": at,
        "ended_at": at,
        "agent": {"kind": "software_agent", "name": MIGRATION_AGENT},
        "notes": [
            f"Data-file schema {step.from_version} to {step.to_version}: {step.note}",
        ],
    }
