"""Physical quantities with units (SUB-02).

A Quantity knows its kind (length, speed, angle, duration, angular rate) from its unit, so
arithmetic across incompatible kinds raises rather than silently mixing
metres and knots. Units are the UCUM codes the schema uses; the factor table
below is checked against the schema's unit enums by the tests.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Self

from debrief_schemas.generated import debrief as schema

# Factor to the kind's base unit: metres, metres per second, degrees, seconds.
FACTORS: dict[str, dict[str, float]] = {
    "length": {"m": 1.0, "km": 1000.0, "[nmi_i]": 1852.0, "[yd_i]": 0.9144, "[ft_i]": 0.3048},
    "speed": {"m/s": 1.0, "[kn_i]": 1852.0 / 3600.0, "km/h": 1000.0 / 3600.0},
    "angle": {"deg": 1.0, "rad": 180.0 / math.pi},
    "duration": {"ms": 0.001, "s": 1.0, "min": 60.0, "h": 3600.0},
    "angular_rate": {"deg/min": 1.0, "deg/s": 60.0, "rad/s": 60.0 * 180.0 / math.pi},
}
BASE_UNITS = {
    "length": "m",
    "speed": "m/s",
    "angle": "deg",
    "duration": "s",
    "angular_rate": "deg/min",
}

_KIND_OF_UNIT = {unit: kind for kind, units in FACTORS.items() for unit in units}

_MODEL_CLASSES = {
    "length": schema.Length,
    "speed": schema.Speed,
    "angle": schema.Angle,
    "duration": schema.Duration,
    "angular_rate": schema.AngularRate,
}


class IncompatibleUnitsError(TypeError):
    """An operation mixed quantities of different kinds."""


def kind_of(unit: str) -> str:
    try:
        return _KIND_OF_UNIT[unit]
    except KeyError:
        raise ValueError(f"unknown unit {unit!r}") from None


@dataclass(frozen=True, slots=True)
class Quantity:
    value: float
    unit: str

    def __post_init__(self) -> None:
        kind_of(self.unit)

    @property
    def kind(self) -> str:
        return _KIND_OF_UNIT[self.unit]

    def to(self, unit: str) -> Quantity:
        if kind_of(unit) != self.kind:
            raise IncompatibleUnitsError(f"cannot convert {self.kind} to {kind_of(unit)}")
        base = self.value * FACTORS[self.kind][self.unit]
        return Quantity(base / FACTORS[self.kind][unit], unit)

    @property
    def base(self) -> float:
        """The value in the kind's base unit."""
        return self.value * FACTORS[self.kind][self.unit]

    def _same_kind(self, other: object, op: str) -> Quantity:
        if not isinstance(other, Quantity):
            raise TypeError(f"cannot {op} a quantity and {type(other).__name__}")
        if other.kind != self.kind:
            raise IncompatibleUnitsError(f"cannot {op} {self.kind} and {other.kind}")
        return other.to(self.unit)

    def __add__(self, other: Quantity) -> Quantity:
        return Quantity(self.value + self._same_kind(other, "add").value, self.unit)

    def __sub__(self, other: Quantity) -> Quantity:
        return Quantity(self.value - self._same_kind(other, "subtract").value, self.unit)

    def __neg__(self) -> Quantity:
        return Quantity(-self.value, self.unit)

    def __mul__(self, other: float | Quantity) -> Quantity:
        if isinstance(other, Quantity):
            pair = {self.kind, other.kind}
            if pair == {"speed", "duration"}:
                return Quantity(self.base * other.base, "m")
            if pair == {"angular_rate", "duration"}:
                return Quantity(self.base * other.base / 60.0, "deg")
            raise IncompatibleUnitsError(f"cannot multiply {self.kind} by {other.kind}")
        return Quantity(self.value * other, self.unit)

    __rmul__ = __mul__

    def __truediv__(self, other: float | Quantity) -> Quantity | float:
        if isinstance(other, Quantity):
            if other.kind == self.kind:
                return self.base / other.base
            if (self.kind, other.kind) == ("length", "duration"):
                return Quantity(self.base / other.base, "m/s")
            if (self.kind, other.kind) == ("length", "speed"):
                return Quantity(self.base / other.base, "s")
            if (self.kind, other.kind) == ("angle", "duration"):
                return Quantity(self.base / other.base * 60.0, "deg/min")
            raise IncompatibleUnitsError(f"cannot divide {self.kind} by {other.kind}")
        return Quantity(self.value / other, self.unit)

    def __lt__(self, other: Quantity) -> bool:
        return self.value < self._same_kind(other, "compare").value

    def __le__(self, other: Quantity) -> bool:
        return self.value <= self._same_kind(other, "compare").value

    def __gt__(self, other: Quantity) -> bool:
        return self.value > self._same_kind(other, "compare").value

    def __ge__(self, other: Quantity) -> bool:
        return self.value >= self._same_kind(other, "compare").value

    def isclose(self, other: Quantity, rel_tol: float = 1e-9, abs_tol: float = 0.0) -> bool:
        return math.isclose(
            self.value, self._same_kind(other, "compare").value, rel_tol=rel_tol, abs_tol=abs_tol
        )

    @classmethod
    def from_model(
        cls, model: schema.Length | schema.Speed | schema.Angle | schema.Duration
    ) -> Self:
        return cls(model.value, str(model.unit))

    def to_model(self) -> schema.Length | schema.Speed | schema.Angle | schema.Duration:
        return _MODEL_CLASSES[self.kind](value=self.value, unit=self.unit)


def length(value: float, unit: str = "m") -> Quantity:
    return _checked(value, unit, "length")


def speed(value: float, unit: str = "m/s") -> Quantity:
    return _checked(value, unit, "speed")


def angle(value: float, unit: str = "deg") -> Quantity:
    return _checked(value, unit, "angle")


def duration(value: float, unit: str = "s") -> Quantity:
    return _checked(value, unit, "duration")


def angular_rate(value: float, unit: str = "deg/min") -> Quantity:
    return _checked(value, unit, "angular_rate")


def _checked(value: float, unit: str, kind: str) -> Quantity:
    if kind_of(unit) != kind:
        raise IncompatibleUnitsError(f"{unit!r} is not a {kind} unit")
    return Quantity(value, unit)


def series_values(series: schema.SpeedSeries | schema.AngleSeries, unit: str) -> list[float]:
    """A schema series' values converted to the given unit."""
    source = str(series.unit)
    kind = kind_of(source)
    if kind_of(unit) != kind:
        raise IncompatibleUnitsError(f"cannot convert {kind} to {kind_of(unit)}")
    factor = FACTORS[kind][source] / FACTORS[kind][unit]
    return [v * factor for v in series.values]


def normalise_bearing(degrees: float) -> float:
    """Wrap to [0, 360)."""
    wrapped = math.fmod(degrees, 360.0)
    if wrapped < 0:
        wrapped += 360.0
    return 0.0 if wrapped == 360.0 else wrapped


def bearing_difference(a_degrees: float, b_degrees: float) -> float:
    """Signed smallest difference a - b, in (-180, 180], handling wrap at 360 (NFR-04)."""
    diff = math.fmod(a_degrees - b_degrees, 360.0)
    if diff <= -180.0:
        diff += 360.0
    elif diff > 180.0:
        diff -= 360.0
    return diff
