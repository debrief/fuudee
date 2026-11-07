"""Bump the data-file schema version (SUB-12) everywhere it is written.

    uv run python scripts/bump_schema.py X.Y.Z           # bump, then regenerate
    uv run python scripts/bump_schema.py X.Y.Z --dry-run
    uv run python scripts/bump_schema.py --check         # every carrier is found

A bump changes, in this order:

1. every committed file that records the current version as a file's schema
   version (``"schema_version": "X"``, ``"debrief:schema_version": "X"``,
   ``schema_version="X"``, ``schema_version: "X"``): the fixtures under
   schemas/fixtures and the tests that build plots by hand. A plot fixture
   carrying its history is sealed again: the version is part of the content,
   so each step's result_hash, the chain of step_hashes and the head_hash are
   worked out afresh, each only where it held before the bump (a fixture broken
   on purpose stays broken in the same place);
2. schemas/CHANGELOG.md, gaining a stub heading for the new version, to be
   filled in by hand;
3. the version in schemas/linkml/debrief.yaml, last, so a bump interrupted
   part way is finished by running it again;
4. the generated outputs, by running the generators (``--no-generate`` prints
   their commands instead).

Run again with the same version, it changes nothing but regenerating, which
changes nothing either: idempotent. Files that mention a version as history
(the CHANGELOG, docs/, site/) are never changed.

``--check`` fails if any tracked file names the current version where it is
neither rewritten by a bump, nor a generated output, nor history: a new kind of
carrier the patterns above would miss. A test runs it.

Whether to bump at all: file types bump the version; message and request types
do not (schemas/README.md).
"""

from __future__ import annotations

import argparse
import datetime
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "schemas" / "linkml" / "debrief.yaml"
CHANGELOG = ROOT / "schemas" / "CHANGELOG.md"

# Outputs the generators write: regenerated, never edited.
GENERATED = (
    "schemas/generated/debrief.schema.json",
    "python/debrief-schemas/src/debrief_schemas/generated/debrief.py",
    "python/debrief-schemas/src/debrief_schemas/generated/debrief.schema.json",
    "python/debrief-schemas/src/debrief_schemas/generated/schema_version.py",
    "ts/schemas/src/generated/debrief.schema.json",
    "ts/schemas/src/generated/debrief.ts",
    "ts/schemas/src/generated/schemaVersion.ts",
)
# Files and folders that mention versions as history, never rewritten.
HISTORY = ("schemas/CHANGELOG.md", "docs/", "site/")
# The source the version is bumped in, last.
SOURCE_PATH = "schemas/linkml/debrief.yaml"
# This script names versions in its own text.
SELF = "scripts/bump_schema.py"

GENERATE = (
    ["uv", "run", "python", "scripts/generate_schemas.py"],
    ["npm", "run", "--prefix", "ts/schemas", "generate"],
)

_VERSION = re.compile(r"^\d+\.\d+\.\d+$")
_SOURCE_LINE = re.compile(r"^version: (\d+\.\d+\.\d+)$", re.MULTILINE)


def _carrier(version: str) -> re.Pattern[str]:
    """A file's schema version as JSON, a Python keyword or a TypeScript member writes it."""
    return re.compile(
        r"""(?P<head>["']?(?:debrief:)?schema_version["']?\s*[:=]\s*(?P<q>["']))"""
        + re.escape(version)
        + r"(?P=q)"
    )


def _parse(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split("."))


def current_version() -> str:
    found = _SOURCE_LINE.search(SOURCE.read_text())
    if found is None:
        raise SystemExit(f"No 'version: X.Y.Z' line in {SOURCE.relative_to(ROOT)}")
    return found.group(1)


def tracked_files() -> list[Path]:
    """Every file under version control, as paths."""
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    ).stdout.decode()
    return [ROOT / name for name in out.split("\0") if name]


def _relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _excluded(name: str) -> bool:
    return name in GENERATED or name in (SOURCE_PATH, SELF) or name.startswith(HISTORY)


def _read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
        return None


def carriers(version: str) -> dict[Path, str]:
    """Files recording version as a file's schema version, and each one's text."""
    pattern = _carrier(version)
    found = {}
    for path in tracked_files():
        if _excluded(_relative(path)):
            continue
        text = _read(path)
        if text is not None and version in text and pattern.search(text):
            found[path] = text
    return found


def strays(version: str) -> list[str]:
    """Tracked files naming version that a bump would neither rewrite nor regenerate,
    and that are not history: each one a carrier the patterns miss."""
    pattern = _carrier(version)
    left = []
    for path in tracked_files():
        name = _relative(path)
        if _excluded(name):
            continue
        text = _read(path)
        if text is None or version not in text:
            continue
        if version in pattern.sub("", text):
            left.append(name)
    return left


def resealed(text: str, old: str, new: str) -> str:
    """A plot fixture's text, its version already moved from old to new, with its
    history's hashes worked out again for the new version (see the module docstring).

    Each step is replayed as Debrief replays it, under the old version (the generated
    code is still the old version's while this runs); where the replay gives the
    step's recorded result_hash, it is recomputed with the new version. A step_hash
    is recomputed where it followed from the step before, and so head_hash where it
    was the last step's. Hashes are replaced in the text, so its layout is kept.
    """
    document = json.loads(text)
    history = document.get("history") if isinstance(document, dict) else None
    steps = history.get("steps") if isinstance(history, dict) else None
    if not isinstance(steps, list) or not steps:
        return text
    from debrief_schemas import DocumentKind, dump_document
    from debrief_schemas.chain import GENESIS_HASH, step_hash, text_hash
    from debrief_schemas.generated import debrief as models
    from debrief_stac.history import Changes, apply, empty_plot

    renamed: dict[str, str] = {}
    originals: dict[int, dict] = {}
    plots = {0: empty_plot()}
    old_member, new_member = f'"schema_version": "{old}"', f'"schema_version": "{new}"'
    for index, raw in enumerate(steps):
        if not isinstance(raw, dict):
            continue
        originals[index] = dict(raw)
        try:
            step = models.HistoryStep.model_validate(raw)
            plot = apply(plots[raw["after"]], step.records, Changes.of(step))
            replayed = dump_document(DocumentKind.PLOT, plot)
        except Exception:  # a step broken on purpose: left as it is
            continue
        plots[raw["seq"]] = plot
        if text_hash(replayed) == raw.get("result_hash"):
            new_hash = text_hash(replayed.replace(old_member, new_member, 1))
            renamed[raw["result_hash"]] = new_hash
            raw["result_hash"] = new_hash
    previous_old = previous_new = GENESIS_HASH
    for index, raw in enumerate(steps):
        recorded = raw.get("step_hash") if isinstance(raw, dict) else None
        if not isinstance(recorded, str):
            continue
        if step_hash(originals[index], previous_old) == recorded:
            raw["step_hash"] = renamed[recorded] = step_hash(raw, previous_new)
        previous_old, previous_new = recorded, raw["step_hash"]
    for before, after in renamed.items():
        text = text.replace(before, after)
    return text


def changelog_with_stub(text: str, version: str, today: str) -> str:
    """The CHANGELOG with a stub heading for version above the latest, unless it has one."""
    if re.search(rf"^## {re.escape(version)}\b", text, re.MULTILINE):
        return text
    first = re.search(r"^## ", text, re.MULTILINE)
    stub = (
        f"## {version} ({today})\n\n"
        "- TODO: what changed in the file types, and why (cite the SRD).\n"
        f"- Before 1.0.0 a file of an earlier version opens only through a registered "
        f"migration (SUB-13); without one, plots written as the earlier version must be "
        f"imported or built again.\n\n"
    )
    at = first.start() if first else len(text)
    return text[:at] + stub + text[at:]


def bump(new: str, dry_run: bool, generate: bool) -> int:
    if not _VERSION.match(new):
        raise SystemExit(f"{new!r} is not a semantic version X.Y.Z")
    old = current_version()
    if _parse(new) < _parse(old):
        raise SystemExit(f"{new} is before the current version, {old}")
    changes: list[tuple[Path, str]] = []
    if old != new:  # already new: a bump run before, perhaps interrupted; nothing to move
        pattern = _carrier(old)
        for path, text in sorted(carriers(old).items()):
            moved = pattern.sub(lambda m: m.group("head") + new + m.group("q"), text)
            if path.suffix == ".json" and '"history"' in moved:
                moved = resealed(moved, old, new)
            changes.append((path, moved))
    log = CHANGELOG.read_text()
    day = datetime.date.today()
    new_log = changelog_with_stub(log, new, f"{day.day} {day:%b %Y}")
    if new_log != log:
        changes.append((CHANGELOG, new_log))
    if old != new:
        source = SOURCE.read_text()
        changes.append((SOURCE, _SOURCE_LINE.sub(f"version: {new}", source, count=1)))

    for path, _ in changes:
        print(f"{'would change' if dry_run else 'changed'} {_relative(path)}")
    print(f"{len(changes)} files: {old} -> {new}")
    if dry_run:
        return 0
    for path, text in changes:
        path.write_text(text, encoding="utf-8")

    commands = [" ".join(c) for c in GENERATE]
    if not generate:
        print("Now regenerate:\n  " + "\n  ".join(commands))
        return 0
    for command in GENERATE:
        if command[0] == "npm" and not (ROOT / "ts" / "schemas" / "node_modules").exists():
            print("ts/schemas has no node_modules: run `npm ci --prefix ts/schemas`, then:")
            print("  " + " ".join(command))
            return 1
        if command[0] == "uv":  # this script's own interpreter, as uv run gave it
            command = [sys.executable, *command[3:]]
        elif shutil.which(command[0]) is None:
            print(f"{command[0]} not found; run:\n  " + " ".join(command))
            return 1
        subprocess.run(command, cwd=ROOT, check=True)
    print(f"Fill in the {new} entry in schemas/CHANGELOG.md.")
    return 0


def check() -> int:
    version = current_version()
    left = strays(version)
    found = carriers(version)
    if left:
        print(f"These files name schema {version} in a form bump_schema.py would not rewrite:")
        for name in left:
            print(f"  {name}")
        print("Write the version as a schema_version member, or derive it from SCHEMA_VERSION.")
        return 1
    print(f"{len(found)} files carry schema {version}; a bump rewrites them all.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("version", nargs="?", help="the new version, X.Y.Z")
    parser.add_argument("--dry-run", action="store_true", help="list the changes, make none")
    parser.add_argument(
        "--no-generate", action="store_true", help="print the generate commands, do not run them"
    )
    parser.add_argument(
        "--check", action="store_true", help="fail if a carrier of the version would be missed"
    )
    args = parser.parse_args()
    if args.check:
        return check()
    if not args.version:
        parser.error("give the new version, or --check")
    return bump(args.version, args.dry_run, not args.no_generate)


if __name__ == "__main__":
    sys.exit(main())
