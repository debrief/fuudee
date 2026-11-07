"""Every domain module's refusals share one base, DomainError, and any of them raised
in a change made by hand reaches the caller as a CatalogueError with its message: a
new module needs listing nowhere for its refusals to reach the analyst."""

import importlib
import inspect
import pkgutil
from pathlib import Path

import pytest

import debrief_stac
from debrief_schemas import models
from debrief_stac import Catalogue, CatalogueError, DomainError

# The catalogue's own machinery, whose errors are not the analyst's refusals of a
# change: every other module in debrief_stac is a domain module, new ones included.
INFRASTRUCTURE = {"catalogue", "composite", "errors", "hashing", "history", "store"}
AGENT = models.AgentRef(kind="person", name="analyst")


def domain_modules():
    names = sorted(m.name for m in pkgutil.iter_modules(debrief_stac.__path__))
    return [importlib.import_module(f"debrief_stac.{n}") for n in names if n not in INFRASTRUCTURE]


def test_the_domain_modules_are_found() -> None:
    found = {m.__name__.rsplit(".", 1)[1] for m in domain_modules()}
    assert {"annotations", "narrative", "tracks", "sensors", "tma", "collation"} <= found


@pytest.mark.parametrize("module", domain_modules(), ids=lambda m: m.__name__)
def test_every_error_a_domain_module_defines_is_a_domain_error(module) -> None:
    errors = [
        cls
        for _, cls in inspect.getmembers(module, inspect.isclass)
        if cls.__module__ == module.__name__ and issubclass(cls, BaseException)
    ]
    assert [e.__name__ for e in errors if not issubclass(e, DomainError)] == []


def test_a_domain_error_in_a_change_reaches_the_caller_as_a_catalogue_error(
    tmp_path: Path,
) -> None:
    class NewDomainError(DomainError):
        """A module added later, its error listed nowhere."""

    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    steps = len(catalogue.history("p").steps())

    def change(plot):
        raise NewDomainError("Nothing to do with this plot.")

    with pytest.raises(CatalogueError, match=r"^Nothing to do with this plot\.$") as caught:
        catalogue._change("p", change, AGENT, None, False)
    assert not isinstance(caught.value, DomainError)
    assert len(catalogue.history("p").steps()) == steps  # nothing recorded
