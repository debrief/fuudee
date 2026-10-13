"""Annotations made from a description: shapes, labels and notes (CAP-03 to CAP-05).

The analyst's forms and agents describe an annotation the same way, as an
AnnotationSpec: its shape, name, positions, size, time and appearance. This
module makes that into an ordinary GeoJSON feature, reads a feature back into
a description for its properties form, and names each change in the words the
History view shows ("Circle 'Exclusion zone' added").

Circles and ellipses (GeoJSON has no curves). Their geometry is a polygon of
CURVE_SIDES sides that approximates them, built along geodesics, so that any
other GeoJSON tool sees the area they cover and a plot's extent includes them.
Their own properties (shape, centre, radius, or semi-axes and orientation)
say exactly what they are; Debrief draws and edits them from those, and makes
the polygon again whenever they change, so the two never disagree (a rule
checked on reading, in debrief_schemas).
"""

from __future__ import annotations

import re
from typing import Any

from debrief_kernel.formatting import PositionError, parse_position
from debrief_kernel.geodesy import CURVE_SIDES, Position, circle_ring, ellipse_ring
from debrief_kernel.time import parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import models

SHAPE_TITLES = {
    "line": "Line",
    "area": "Area",
    "circle": "Circle",
    "ellipse": "Ellipse",
    "label": "Label",
    "marker": "Marker",
    "note": "Note",
}
# How many positions each shape takes: (fewest, most).
POSITIONS = {
    "line": (2, None),
    "area": (3, None),
    "circle": (1, 1),
    "ellipse": (1, 1),
    "label": (1, 1),
    "marker": (1, 1),
    "note": (0, 0),
}
FILLED = ("area", "circle", "ellipse")
# The largest radius or semi-axis: a quarter of the way round the world. Beyond
# about half, a geodesic circle folds back on itself and is no longer a circle.
LARGEST_M = 10_000_000.0
NORTH_ARROW_ID = "furniture-north-arrow"


class AnnotationError(ValueError):
    """An annotation that cannot be made as described, said in plain words."""


def shape_of(feature: models.AnnotationFeature) -> str:
    """How an annotation is drawn: its own shape, or the one its geometry implies."""
    props = feature.properties
    if props.shape is not None:
        return str(props.shape)
    geometry = feature.geometry
    if geometry is None:
        return "note"
    if geometry.type == "LineString":
        return "line"
    if geometry.type == "Polygon":
        return "area"
    return "label" if str(props.style) == "label" else "marker"


def title_of(feature: models.AnnotationFeature) -> str:
    """What the History view calls it: "Circle 'Exclusion zone'"."""
    if feature.properties.furniture is not None:
        return "North arrow"
    return f"{SHAPE_TITLES[shape_of(feature)]} {feature.properties.name!r}"


def spec_from(value: models.AnnotationSpec | dict[str, Any]) -> models.AnnotationSpec:
    """A description from JSON, positions given as numbers or as text in any notation."""
    if isinstance(value, models.AnnotationSpec):
        return value
    if not isinstance(value, dict):
        raise AnnotationError("Describe the annotation: its shape and name at least.")
    raw = dict(value)
    positions = raw.get("positions")
    if isinstance(positions, list):
        raw["positions"] = [_position(p) for p in positions]
    try:
        return models.AnnotationSpec.model_validate(raw)
    except ValueError as error:
        raise AnnotationError(
            f"The annotation is not described properly: {_first(error)}"
        ) from None


def _position(value: Any) -> Any:
    if isinstance(value, str):
        try:
            p = parse_position(value)
        except PositionError as error:
            raise AnnotationError(f"{value!r}: {error}") from None
        return [p.longitude, p.latitude]
    return value


def _first(error: ValueError) -> str:
    errors = getattr(error, "errors", None)
    if callable(errors):
        first = errors()[0]
        where = ".".join(str(p) for p in first.get("loc", ()))
        return f"{where}: {first.get('msg')}" if where else str(first.get("msg"))
    return str(error)


def build(
    spec: models.AnnotationSpec,
    feature_id: str,
    previous: models.AnnotationFeature | None = None,
) -> models.AnnotationFeature:
    """The annotation feature a description makes. previous is the feature it
    replaces, when changing one: whether it is hidden, and its provenance, carry over."""
    shape = str(spec.shape)
    name = " ".join((spec.name or "").split())
    if not name:
        raise AnnotationError("Give the annotation a name.")
    positions = [Position(lon, lat) for lon, lat in spec.positions or []]
    fewest, most = POSITIONS[shape]
    title = SHAPE_TITLES[shape]
    if len(positions) < fewest or (most is not None and len(positions) > most):
        raise AnnotationError(_positions_needed(shape, fewest, most))
    for p in positions:
        if not (-180 <= p.longitude <= 180 and -90 <= p.latitude <= 90):
            raise AnnotationError(f"{title} {name!r}: a position is off the globe.")
    if spec.time is not None and spec.time_range is not None:
        raise AnnotationError(f"{title} {name!r}: give a time or a period, not both.")
    if spec.time_range is not None and parse_utc(spec.time_range.start) > parse_utc(
        spec.time_range.end
    ):
        raise AnnotationError(f"{title} {name!r}: its period ends before it starts.")
    if shape == "note" and spec.time is None and spec.time_range is None:
        raise AnnotationError(f"Note {name!r} has no position, so it needs a time or a period.")
    text = (spec.text or "").strip() or None

    appearance = _appearance(spec.appearance, shape, f"{title} {name!r}")
    extra: dict[str, Any] = {}
    geometry: Any = None
    if shape == "line":
        geometry = models.LineStringGeometry(
            type="LineString", coordinates=[[p.longitude, p.latitude] for p in positions]
        )
        _distinct(positions, 2, title, name)
    elif shape == "area":
        _distinct(positions, 3, title, name)
        ring = [[p.longitude, p.latitude] for p in positions]
        if ring[0] != ring[-1]:
            ring.append(list(ring[0]))
        geometry = models.PolygonGeometry(type="Polygon", coordinates=[ring])
    elif shape in ("circle", "ellipse"):
        centre = positions[0]
        extra["centre"] = [centre.longitude, centre.latitude]
        if shape == "circle":
            radius = _size(spec.radius, "radius", title, name)
            ring = circle_ring(centre, _quantity(radius))
            extra["radius"] = radius
        else:
            major = _size(spec.semi_major, "semi-major axis", title, name)
            minor = _size(spec.semi_minor, "semi-minor axis", title, name)
            if _quantity(minor).to("m").value > _quantity(major).to("m").value:
                raise AnnotationError(
                    f"Ellipse {name!r}: the semi-minor axis must be no longer than the semi-major."
                )
            if spec.orientation is None:
                raise AnnotationError(f"Ellipse {name!r}: give the direction of its longer axis.")
            orientation = models.Angle(
                value=_quantity(spec.orientation).to("deg").value % 360.0, unit="deg"
            )
            ring = ellipse_ring(centre, _quantity(major), _quantity(minor), _quantity(orientation))
            extra.update(semi_major=major, semi_minor=minor, orientation=orientation)
        geometry = models.PolygonGeometry(
            type="Polygon", coordinates=[[[p.longitude, p.latitude] for p in ring]]
        )
    elif shape in ("label", "marker"):
        geometry = models.PointGeometry(
            type="Point", coordinates=[positions[0].longitude, positions[0].latitude]
        )
    return models.AnnotationFeature(
        type="Feature",
        id=feature_id,
        geometry=geometry,
        properties=models.AnnotationProperties(
            kind="annotation",
            style=_style(shape, previous),
            shape=shape,
            name=name,
            text=text,
            time=spec.time,
            time_range=spec.time_range,
            appearance=appearance,
            hidden=previous.properties.hidden if previous is not None else None,
            provenance=previous.properties.provenance if previous is not None else None,
            **extra,
        ),
    )


def _style(shape: str, previous: models.AnnotationFeature | None) -> str:
    """What it depicts: kept from the feature it replaces when the shape is the same
    (a period of interest stays one), else the shape's own."""
    if previous is not None and shape_of(previous) == shape:
        return str(previous.properties.style)
    return {"label": "label", "note": "note"}.get(shape, "shape")


def _positions_needed(shape: str, fewest: int, most: int | None) -> str:
    title = SHAPE_TITLES[shape]
    if shape == "note":
        return "A note has no position: give it a time instead."
    if most == 1:
        where = "centre" if shape in ("circle", "ellipse") else "position"
        return f"A {shape} needs its {where}: one position."
    noun = "corners" if shape == "area" else "positions"
    return f"{title}s need at least {fewest} {noun}."


def _distinct(positions: list[Position], count: int, title: str, name: str) -> None:
    if len({(p.longitude, p.latitude) for p in positions}) < count:
        raise AnnotationError(f"{title} {name!r} needs {count} different positions.")


def _quantity(value: Any) -> Quantity:
    return Quantity(value.value, str(value.unit))


def _size(value: models.Length | None, what: str, title: str, name: str) -> models.Length:
    if value is None or value.value <= 0:
        raise AnnotationError(f"{title} {name!r}: give its {what}, more than zero.")
    if _quantity(value).to("m").value > LARGEST_M:
        raise AnnotationError(f"{title} {name!r}: give its {what} as at most 10,000 km.")
    return value


def _appearance(
    appearance: models.AnnotationAppearance | None, shape: str, what: str
) -> models.AnnotationAppearance | None:
    if appearance is None:
        return None
    if shape not in FILLED and (
        appearance.fill_colour is not None or appearance.fill_opacity is not None
    ):
        raise AnnotationError(f"{what}: only areas, circles and ellipses can be filled.")
    kept = appearance.model_dump(exclude_none=True)
    return models.AnnotationAppearance(**kept) if kept else None


def spec_of(feature: models.AnnotationFeature) -> models.AnnotationSpec:
    """A feature read back into the description its properties form shows."""
    props = feature.properties
    shape = shape_of(feature)
    geometry = feature.geometry
    positions: list[list[float]] | None = None
    if shape in ("circle", "ellipse") and props.centre is not None:
        positions = [list(props.centre)]
    elif geometry is not None and geometry.type == "LineString":
        positions = [list(p) for p in geometry.coordinates]
    elif geometry is not None and geometry.type == "Polygon":
        ring = [list(p) for p in geometry.coordinates[0]]
        positions = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    elif geometry is not None and geometry.type == "Point":
        positions = [list(geometry.coordinates)]
    return models.AnnotationSpec(
        shape=shape,
        name=props.name,
        text=props.text,
        positions=positions or None,
        radius=props.radius,
        semi_major=props.semi_major,
        semi_minor=props.semi_minor,
        orientation=props.orientation,
        time=props.time,
        time_range=props.time_range,
        appearance=props.appearance,
    )


def describe_change(
    before: models.AnnotationFeature, after: models.AnnotationFeature
) -> str | None:
    """The note naming a change to an annotation, or None if nothing changed."""
    old, new = spec_of(before), spec_of(after)
    if old == new:
        return None
    changed = {
        name
        for name in models.AnnotationSpec.model_fields
        if getattr(old, name) != getattr(new, name)
    }
    if changed == {"appearance"}:
        return f"Style of {title_of(after)} changed"
    if changed <= {"time", "time_range"}:
        return f"Time of {title_of(after)} changed"
    if changed == {"name"}:
        return f"{title_of(before)} renamed {after.properties.name!r}"
    return f"{title_of(after)} changed"


def new_id(name: str, taken: set[str]) -> str:
    """An id for a new annotation, from its name, not used in the plot."""
    base = "annotation-" + (re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "unnamed")
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    return candidate


def north_arrow() -> models.AnnotationFeature:
    """The north arrow: chart furniture, with no geometry and no time (CAP-03)."""
    return models.AnnotationFeature(
        type="Feature",
        id=NORTH_ARROW_ID,
        geometry=None,
        properties=models.AnnotationProperties(
            kind="annotation",
            style="chart_furniture",
            name="North arrow",
            furniture="north_arrow",
        ),
    )


__all__ = [
    "CURVE_SIDES",
    "NORTH_ARROW_ID",
    "AnnotationError",
    "build",
    "describe_change",
    "new_id",
    "north_arrow",
    "shape_of",
    "spec_from",
    "spec_of",
    "title_of",
]
