"""Discovery, isolation of broken libraries, offering by selection (TL-03, TL-05, TL-08, TL-09)."""

import types

import pytest

from debrief_tools import Registry, tool
from debrief_tools.registry import applies

CORE = {"core.track_summary", "core.closest_approach", "core.range_rings", "core.add_note"}


def _library(**declarations) -> types.ModuleType:
    module = types.ModuleType("scientist_library")
    for attribute, declaration in declarations.items():
        setattr(module, attribute, tool(**declaration)(lambda context: None))
    return module


def _declaration(name: str, applies_to: list[str]) -> dict:
    return {
        "name": name,
        "version": "1.0.0",
        "title": name,
        "explanation": "Test tool.",
        "applies_to": applies_to,
        "outputs": ["non_spatial"],
    }


def test_core_library_is_discovered_from_entry_points() -> None:
    registry = Registry.discover()
    assert CORE <= set(registry.tools)
    assert "core" in registry.libraries


def test_broken_library_is_reported_and_others_still_load() -> None:
    registry = Registry()

    def broken():
        raise ImportError("No module named 'scipy'")

    registry.add_library("broken", broken)
    registry.add_library("good", lambda: _library(a=_declaration("lab.good", ["track"])))
    assert set(registry.tools) == {"lab.good"}
    (problem,) = registry.unavailable
    assert problem.library == "broken" and "scipy" in problem.reason


def test_library_with_invalid_declaration_is_isolated() -> None:
    registry = Registry()
    registry.add_library("bad", lambda: _library(a={"name": "Not Dotted"}))
    assert registry.tools == {} and "could not be loaded" in registry.unavailable[0].reason


def test_tool_with_unknown_type_is_not_offered_and_says_why() -> None:
    registry = Registry()
    registry.add_library(
        "lab",
        lambda: _library(
            a=_declaration("lab.contacts", ["contact_report"]),
            b=_declaration("lab.fine", ["track"]),
        ),
    )
    assert set(registry.tools) == {"lab.fine"}
    (problem,) = registry.unavailable
    assert problem.tool == "lab.contacts"
    assert "contact_report, which is not a Debrief data type" in problem.reason


def test_duplicate_tool_name_keeps_the_first() -> None:
    registry = Registry()
    registry.add_library("one", lambda: _library(a=_declaration("lab.same", ["track"])))
    registry.add_library("two", lambda: _library(a=_declaration("lab.same", ["*"])))
    assert registry.tools["lab.same"].declaration.applies_to == ["track"]
    assert "already provides" in registry.unavailable[0].reason


@pytest.mark.parametrize(
    ("kinds", "expected"),
    [
        ([], {"core.add_note"}),
        (["track"], {"core.track_summary", "core.range_rings", "core.add_note"}),
        (["track", "track"], {"core.track_summary", "core.closest_approach", "core.add_note"}),
        (["track", "annotation"], {"core.add_note"}),
        (["annotation"], {"core.add_note"}),
    ],
)
def test_offered_tools_are_the_intersection_for_the_selection(kinds, expected) -> None:
    offered = {t.name for t in Registry.discover().for_selection(kinds)}
    assert offered & CORE == expected


def test_applies_honours_counts() -> None:
    declaration = Registry.discover().tools["core.closest_approach"].declaration
    assert not applies(declaration, ["track"] * 3)
    assert applies(declaration, ["track"] * 2)
