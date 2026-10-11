"""Checking the values on a tool's form against its declaration (TL-07).

Values arrive as JSON from the form, or from an agent. They are checked,
defaults filled in, and converted for the tool: quantities become kernel
Quantity objects and times epoch milliseconds. The values as supplied, with
defaults, are what provenance records, so a replay sees the same inputs
(SUB-19).
"""

from __future__ import annotations

from typing import Any

from debrief_kernel.time import TimeError, parse_utc
from debrief_kernel.units import FACTORS, Quantity
from debrief_schemas import models


class ParameterError(ValueError):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


def _default(param: models.ParameterDeclaration) -> Any:
    default = param.default
    if isinstance(default, models.Length | models.Speed | models.Angle | models.Duration):
        return default.model_dump(mode="json")
    return default


def _check(param: models.ParameterDeclaration, value: Any) -> tuple[Any, str | None]:
    """The value converted for the tool, or a problem in the analyst's words."""
    title, kind = param.title, str(param.kind)
    if kind == "boolean":
        return (value, None) if isinstance(value, bool) else (None, f"{title} must be yes or no")
    if kind in ("string", "choice"):
        if not isinstance(value, str):
            return None, f"{title} must be text"
        if kind == "choice" and value not in (param.choices or []):
            return None, f"{title} must be one of: {', '.join(param.choices or [])}"
        if param.required is not False and kind == "string" and not value.strip():
            return None, f"{title} is needed"
        return value, None
    if kind == "time":
        try:
            return parse_utc(value), None
        except (TimeError, TypeError, ValueError):
            return None, f"{title} must be a UTC time such as 2026-10-11T09:30:00.000Z"
    if kind == "quantity":
        if not (isinstance(value, dict) and set(value) == {"value", "unit"}):
            return None, f"{title} must be a number with a unit"
        number, unit = value["value"], value["unit"]
        units = FACTORS[str(param.quantity_kind)]
        if unit not in units and not any(unit in known for known in FACTORS.values()):
            return None, f"{title}: unknown unit {unit!r}; use one of {', '.join(units)}"
        try:
            quantity = Quantity(float(number), str(unit))
        except (TypeError, ValueError):
            return None, f"{title} must be a number with a unit"
        if isinstance(number, bool) or quantity.kind != str(param.quantity_kind):
            return None, f"{title} must be a {param.quantity_kind}, not {unit}"
        bound_unit = (
            str(param.default.unit)
            if isinstance(
                param.default, models.Length | models.Speed | models.Angle | models.Duration
            )
            else unit
        )
        magnitude = quantity.to(bound_unit).value
    else:  # number, integer
        if isinstance(value, bool) or not isinstance(value, int | float):
            return None, f"{title} must be a number"
        if kind == "integer" and not float(value).is_integer():
            return None, f"{title} must be a whole number"
        quantity, magnitude, bound_unit = None, float(value), ""
        value = int(value) if kind == "integer" else float(value)
    suffix = f" {bound_unit}" if bound_unit else ""
    if param.minimum is not None and magnitude < param.minimum:
        return None, f"{title} must be at least {param.minimum:g}{suffix}"
    if param.maximum is not None and magnitude > param.maximum:
        return None, f"{title} must be at most {param.maximum:g}{suffix}"
    return (quantity if kind == "quantity" else value), None


def bind(
    declaration: models.ToolDeclaration, supplied: dict[str, Any] | None
) -> tuple[dict[str, Any], list[models.ParameterValue]]:
    """Values for the tool, and the same values as provenance records them."""
    supplied = dict(supplied or {})
    declared = {p.name: p for p in declaration.parameters or []}
    problems = [
        f"{declaration.title} has no setting called {name!r}"
        for name in sorted(set(supplied) - set(declared))
    ]
    values: dict[str, Any] = {}
    recorded: list[models.ParameterValue] = []
    for name, param in declared.items():
        raw = supplied.get(name)
        if raw is None:
            raw = _default(param)
        if raw is None:
            if param.required is not False:
                problems.append(f"{param.title} is needed")
            else:
                values[name] = None
            continue
        value, problem = _check(param, raw)
        if problem:
            problems.append(problem)
            continue
        values[name] = value
        recorded.append(models.ParameterValue(name=name, value=raw))
    if problems:
        raise ParameterError(problems)
    return values, recorded
