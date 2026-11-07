"""scripts/bump_schema.py: a bump finds every file that carries the schema version,
and seals a plot's history again for the new one. The bump itself is not run here:
it rewrites the repository."""

import importlib.util
import json
from pathlib import Path

import pytest

from debrief_schemas import SCHEMA_VERSION
from debrief_schemas.chain import chain_problem, content_text_of, text_hash

ROOT = Path(__file__).resolve().parents[3]
_spec = importlib.util.spec_from_file_location("bump_schema", ROOT / "scripts/bump_schema.py")
bump = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bump)

FIXTURES = ROOT / "schemas" / "fixtures"
NEW = "0.99.0"  # a version the schema will not reach soon


def test_every_file_naming_the_version_is_rewritten_by_a_bump() -> None:
    """--check: no tracked file names the current version in a form a bump would miss."""
    assert bump.current_version() == SCHEMA_VERSION
    assert bump.strays(SCHEMA_VERSION) == []
    assert bump.check() == 0


def test_every_fixture_carrying_a_version_is_found() -> None:
    found = {p.relative_to(ROOT).as_posix() for p in bump.carriers(SCHEMA_VERSION)}
    fixtures = {
        p.relative_to(ROOT).as_posix()
        for p in FIXTURES.rglob("*.json")
        if f'"{SCHEMA_VERSION}"' in p.read_text()
    }
    assert fixtures and fixtures <= found


@pytest.mark.parametrize(
    "line",
    [
        '  "schema_version": "{v}",',
        '"debrief:schema_version":"{v}"',
        '        schema_version="{v}",',
        "  schema_version: '{v}',",
        '    (folder / "3.json").write_text(\'{{"schema_version": "{v}", "seq": 3\')',
    ],
)
def test_each_way_a_version_is_written_is_rewritten(line: str) -> None:
    old = line.format(v=SCHEMA_VERSION)
    moved = bump._carrier(SCHEMA_VERSION).sub(lambda m: m.group("head") + NEW + m.group("q"), old)
    assert moved == line.format(v=NEW)


def test_the_changelog_stub_is_added_once() -> None:
    log = "# Changelog\n\nIntro.\n\n## 0.0.2 (1 Jan 2026)\n\n- Thing.\n"
    once = bump.changelog_with_stub(log, "0.0.3", "7 Nov 2026")
    assert once.index("## 0.0.3 (7 Nov 2026)") < once.index("## 0.0.2")
    assert bump.changelog_with_stub(once, "0.0.3", "8 Nov 2026") == once


def test_a_plot_history_is_sealed_again_for_the_new_version() -> None:
    path = FIXTURES / "plot" / "valid" / "history-undone-and-abandoned.json"
    text = path.read_text()
    moved = text.replace(f'"schema_version": "{SCHEMA_VERSION}"', f'"schema_version": "{NEW}"')

    sealed = json.loads(bump.resealed(moved, SCHEMA_VERSION, NEW))

    history = sealed["history"]
    assert chain_problem(history["steps"], history["head_hash"]) is None
    current = history["steps"][history["current"] - 1]
    assert current["result_hash"] == text_hash(content_text_of(sealed))
    before = json.loads(text)["history"]["steps"]
    assert all(
        a["result_hash"] != b["result_hash"] and a["step_hash"] != b["step_hash"]
        for a, b in zip(history["steps"], before, strict=True)
    )
    # Sealed for the version it has, nothing changes.
    assert bump.resealed(text, SCHEMA_VERSION, SCHEMA_VERSION) == text


def test_a_history_broken_on_purpose_stays_broken_where_it_was() -> None:
    path = FIXTURES / "plot" / "invalid" / "semantic" / "history-step-tampered.json"
    text = path.read_text()
    moved = text.replace(f'"schema_version": "{SCHEMA_VERSION}"', f'"schema_version": "{NEW}"')
    sealed = json.loads(bump.resealed(moved, SCHEMA_VERSION, NEW))
    history = sealed["history"]
    assert chain_problem(history["steps"], history["head_hash"]) == chain_problem(
        json.loads(text)["history"]["steps"], json.loads(text)["history"]["head_hash"]
    )


def test_a_version_before_the_current_one_is_refused() -> None:
    with pytest.raises(SystemExit, match="before the current version"):
        bump.bump("0.0.1", dry_run=True, generate=False)
