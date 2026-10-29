"""One entry point per operation (PAR-15): the tool service and the playground's Python call the
same functions for the tools offered, the tools not available, and undo, redo and go to with a
base, so neither re-filters or re-sequences them."""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

from debrief_sample.walkthrough import copy_for_tour
from debrief_stac import Base, Catalogue, Conflict
from debrief_tools import Registry
from debrief_tools.entries import move, offered_tools, unavailable_tools

PLAY = Path(__file__).resolve().parents[3] / "vscode" / "play" / "play.py"


def _play():
    spec = importlib.util.spec_from_file_location("play", PLAY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def plot(tmp_path):
    """A catalogue holding a copy of serial 1, as a walkthrough makes it."""
    catalogue = Catalogue.create(tmp_path / "cat", "c", "C", "Test")
    subprocess.run(
        [sys.executable, "-m", "debrief_sample", "build", str(tmp_path / "sample")],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    item = copy_for_tour(catalogue, tmp_path / "sample", "explore")
    return catalogue, item


def test_offered_tools_are_the_registrys_rule_in_declared_order():
    registry = Registry.discover(["debrief_tools.core"])
    declarations = {n: t.declaration for n, t in registry.tools.items()}
    offered = offered_tools(declarations, ["track", "track"])
    assert offered == [t.name for t in registry.for_selection(["track", "track"])]
    assert "core.closest_approach" in offered
    assert offered_tools(declarations, []) == [t.name for t in registry.for_selection([])]


def test_unavailable_tools_say_library_tool_and_reason():
    registry = Registry()
    registry.add_library("broken", lambda: (_ for _ in ()).throw(ImportError("no numpy")))
    assert unavailable_tools(registry) == [
        {
            "library": "broken",
            "tool": None,
            "reason": "The library could not be loaded: no numpy",
        }
    ]


def test_move_refuses_a_stale_base_and_goto_needs_a_step(plot):
    catalogue, item = plot
    history = catalogue.history(item)
    head = history.head()
    stale = Base(head.current, "not-the-hash")
    with pytest.raises(Conflict):
        move(history, "undo", stale)
    with pytest.raises(ValueError, match="goto needs the step"):
        move(history, "goto", None, None)
    with pytest.raises(ValueError, match="not one of"):
        move(history, "sideways")


def test_the_playground_calls_the_same_entries(plot, monkeypatch):
    play = _play()
    catalogue, item = plot
    monkeypatch.setattr(play, "catalogue", catalogue)
    listed = json.loads(play.tools())
    names = [t["name"] for t in listed["tools"]]
    assert listed["unavailable"] == unavailable_tools(play.registry)
    declarations = {n: t.declaration for n, t in play.registry.tools.items()}
    for kinds in ([], ["track"], ["track", "track"], ["annotation"]):
        offered = json.loads(play.offered(json.dumps(kinds)))
        assert offered == offered_tools(declarations, kinds)
        assert set(offered) <= set(names)
    head = catalogue.history(item).head()
    # A base that is no longer the plot's: refused, as debrief/undo refuses it.
    stale = json.loads(
        play.move(
            item, json.dumps({"how": "undo", "base": {"current": head.current, "plot_hash": "x"}})
        )
    )
    assert stale["conflict"] is True
    assert json.loads(play.move(item, json.dumps({"how": "redo"})))["error"] == (
        "There is nothing to redo."
    )
