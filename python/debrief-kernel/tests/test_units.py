import math

import pytest

from debrief_kernel.units import (
    FACTORS,
    IncompatibleUnitsError,
    Quantity,
    angle,
    bearing_difference,
    duration,
    length,
    normalise_bearing,
    series_values,
    speed,
)
from debrief_schemas.generated import debrief as schema


def test_factor_table_matches_schema_unit_enums() -> None:
    enums = {
        "length": schema.LengthUnitEnum,
        "speed": schema.SpeedUnitEnum,
        "angle": schema.AngleUnitEnum,
        "duration": schema.DurationUnitEnum,
    }
    for kind, enum in enums.items():
        assert set(FACTORS[kind]) == {u.value for u in enum}, kind


def test_conversions() -> None:
    assert length(1, "[nmi_i]").to("m").value == 1852
    assert speed(10, "[kn_i]").to("m/s").isclose(speed(5.144444444, "m/s"), rel_tol=1e-9)
    assert angle(math.pi, "rad").to("deg").isclose(angle(180))
    assert duration(90, "min").to("h").value == 1.5


def test_addition_keeps_left_unit() -> None:
    total = length(1, "[nmi_i]") + length(148, "m")
    assert total.unit == "[nmi_i]"
    assert total.to("m").isclose(length(2000))


def test_incompatible_kinds_refused() -> None:
    with pytest.raises(IncompatibleUnitsError):
        length(1) + speed(1)
    with pytest.raises(IncompatibleUnitsError):
        _ = length(1) < duration(1)
    with pytest.raises(IncompatibleUnitsError):
        length(1).to("s")
    with pytest.raises(IncompatibleUnitsError):
        length(1, "m/s")


def test_unknown_unit_refused() -> None:
    with pytest.raises(ValueError):
        Quantity(1, "furlong")


def test_derived_kinds() -> None:
    assert (speed(10, "[kn_i]") * duration(1, "h")).to("[nmi_i]").isclose(length(10, "[nmi_i]"))
    assert (length(10, "[nmi_i]") / duration(2, "h")).to("[kn_i]").isclose(speed(5, "[kn_i]"))
    assert (length(10, "[nmi_i]") / speed(5, "[kn_i]")).to("h").isclose(duration(2, "h"))
    assert length(2, "km") / length(500, "m") == pytest.approx(4)
    with pytest.raises(IncompatibleUnitsError):
        angle(1) * length(1)


def test_scalar_arithmetic_and_ordering() -> None:
    assert (2 * speed(3, "[kn_i]")).value == 6
    assert (speed(6, "[kn_i]") / 2).value == 3
    assert length(1, "km") > length(999, "m")
    assert -length(1) == length(-1)


def test_model_round_trip() -> None:
    model = schema.Length(value=500.0, unit="m")
    quantity = Quantity.from_model(model)
    assert quantity == length(500)
    assert quantity.to_model() == model


def test_series_values() -> None:
    series = schema.SpeedSeries(unit="[kn_i]", values=[10.0, 20.0])
    assert series_values(series, "m/s") == pytest.approx([5.144444, 10.288889], rel=1e-6)
    with pytest.raises(IncompatibleUnitsError):
        series_values(series, "deg")


@pytest.mark.parametrize(
    ("given", "expected"), [(0, 0), (360, 0), (-10, 350), (725, 5), (359.9999, 359.9999)]
)
def test_normalise_bearing(given: float, expected: float) -> None:
    assert normalise_bearing(given) == pytest.approx(expected)


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [(10, 350, 20), (350, 10, -20), (180, 0, 180), (0, 180, 180), (90, 90, 0)],
)
def test_bearing_difference_wraps(a: float, b: float, expected: float) -> None:
    assert bearing_difference(a, b) == pytest.approx(expected)
