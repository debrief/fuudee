"""Checking form values against a declaration (TL-07)."""

import pytest

from debrief_kernel.units import Quantity
from debrief_tools import ParameterError, Registry, bind

RINGS = Registry.discover().tools["core.range_rings"].declaration
NOTE = Registry.discover().tools["core.add_note"].declaration


def test_defaults_fill_in_and_are_recorded() -> None:
    values, recorded = bind(RINGS, {})
    assert values == {"spacing": Quantity(2.0, "[nmi_i]"), "rings": 3, "at": None}
    assert [r.name for r in recorded] == ["spacing", "rings"]


def test_values_are_converted_for_the_tool() -> None:
    values, recorded = bind(
        RINGS,
        {"spacing": {"value": 1000, "unit": "m"}, "rings": 2.0, "at": "1995-12-12T05:10:00.000Z"},
    )
    assert values["spacing"] == Quantity(1000.0, "m")
    assert values["rings"] == 2 and isinstance(values["rings"], int)
    assert values["at"] == 818745000000
    assert recorded[0].value.model_dump() == {"value": 1000.0, "unit": "m"}


@pytest.mark.parametrize(
    ("supplied", "problem"),
    [
        ({"spacing": {"value": 5, "unit": "[kn_i]"}}, "Spacing must be a length, not [kn_i]"),
        ({"spacing": {"value": 300, "unit": "km"}}, "Spacing must be at most 100 [nmi_i]"),
        ({"spacing": 5}, "Spacing must be a number with a unit"),
        ({"rings": 2.5}, "Number of rings must be a whole number"),
        ({"rings": 0}, "Number of rings must be at least 1"),
        ({"rings": True}, "Number of rings must be a number"),
        ({"at": "12/12/95"}, "Time must be a UTC time"),
        ({"colour": "red"}, "Range rings has no setting called 'colour'"),
    ],
)
def test_problems_are_reported_in_the_analysts_words(supplied, problem) -> None:
    with pytest.raises(ParameterError) as error:
        bind(RINGS, supplied)
    assert any(problem in p for p in error.value.problems), error.value.problems


def test_required_values_without_defaults_are_needed() -> None:
    with pytest.raises(ParameterError) as error:
        bind(NOTE, {"text": "  "})
    assert set(error.value.problems) == {"Note is needed", "Time is needed"}
