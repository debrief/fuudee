"""The service tests share one worker process (conftest.py; review, 7 Nov 2026, finding 10).

Sharing it must share nothing a test can see. Each run of the test below starts from the
plot conftest imports, changes it through the worker, and finds the change in its own
catalogue only: whichever order the runs take (pytest's own, reversed, shuffled), the
second would see the first's note if anything leaked between them. Between tests the worker
reads a configuration with no catalogues, so a test that forgot to point it at its own
cannot reach the one before.
"""

import pytest

from debrief_stac import Catalogue
from debrief_tools.worker import ToolWorker

AGENT = {"kind": "person", "name": "analyst"}


def notes(catalogue: Catalogue) -> list[str]:
    plot = catalogue.read_plot("serial")
    return [f.properties.name for f in plot.features if f.id.startswith("note")]


@pytest.mark.parametrize("run", ["one", "two", "three"])
def test_each_test_finds_its_own_plot_as_imported_and_changes_only_it(
    run: str, worker: ToolWorker, shared_worker: ToolWorker, catalogue: Catalogue
) -> None:
    assert worker is shared_worker
    assert notes(catalogue) == []
    assert len(catalogue.history("serial").steps()) == 1
    outcome = worker.call(
        "core.add_note",
        {
            "store": "exercise",
            "item": "serial",
            "selection": [],
            "agent": AGENT,
            "parameters": {"text": f"Run {run}", "at": "1995-12-12T05:10:00.000Z"},
        },
    )
    assert "error" not in outcome, outcome
    assert notes(catalogue) == [f"Run {run}"]


def test_between_tests_the_worker_reaches_no_catalogue(shared_worker: ToolWorker) -> None:
    outcome = shared_worker.call(
        "core.add_note",
        {
            "store": "exercise",
            "item": "serial",
            "selection": [],
            "agent": AGENT,
            "parameters": {"text": "Stray", "at": "1995-12-12T05:10:00.000Z"},
        },
    )
    assert "There is no store 'exercise'" in outcome["error"]
