"""Vectorised geodesics for many points at once (SUB-03, NFR-04).

The same WGS84 geodesics as debrief_kernel.geodesy, computed by PROJ's C
implementation of Karney's algorithm over numpy arrays. Use it wherever a
calculation runs over hundreds or thousands of points, such as TMA bearing
residuals during a drag; the per-point functions are about fifty times
slower (docs/spikes/tote-latency.md). Results agree with the per-point
functions to well under a millimetre and a micro-degree; a test checks.

Arrays are float64. Longitudes and latitudes are in degrees, distances in
metres, bearings true in degrees in [0, 360).
"""

from __future__ import annotations

from typing import NamedTuple

import numpy as np
from numpy.typing import ArrayLike, NDArray
from pyproj import Geod

from debrief_kernel.geodesy import TrackPath

_WGS84 = Geod(ellps="WGS84")

Floats = NDArray[np.float64]


class RangesBearings(NamedTuple):
    range_m: Floats
    bearing_deg: Floats


class Positions(NamedTuple):
    longitude: Floats
    latitude: Floats


def _floats(values: ArrayLike) -> Floats:
    return np.asarray(values, dtype=np.float64)


def _wrap_bearing(degrees: Floats) -> Floats:
    wrapped = np.mod(degrees, 360.0)
    return np.where(wrapped >= 360.0, 0.0, wrapped)


def _wrap_longitude(degrees: Floats) -> Floats:
    return np.mod(degrees + 180.0, 360.0) - 180.0


def range_bearing(
    lon1: ArrayLike, lat1: ArrayLike, lon2: ArrayLike, lat2: ArrayLike
) -> RangesBearings:
    """Geodesic range and initial true bearing from each origin to its target."""
    # pyproj returns forward azimuth, back azimuth, distance; only the first is a bearing.
    forward, _back, distance = _WGS84.inv(
        _floats(lon1), _floats(lat1), _floats(lon2), _floats(lat2)
    )
    return RangesBearings(_floats(distance), _wrap_bearing(_floats(forward)))


def destination(
    lon: ArrayLike, lat: ArrayLike, bearing_deg: ArrayLike, distance_m: ArrayLike
) -> Positions:
    """Positions reached by following geodesics from each origin."""
    lon_out, lat_out, _back = _WGS84.fwd(
        _floats(lon), _floats(lat), _floats(bearing_deg), _floats(distance_m)
    )
    return Positions(_wrap_longitude(_floats(lon_out)), _floats(lat_out))


def positions_at(track: TrackPath, times_ms: ArrayLike) -> Positions:
    """A track's positions at many times, along geodesics between fixes.

    Times outside the track's span give NaN, as position_at gives None.
    """
    times = np.asarray(times_ms, dtype=np.int64)
    fix_times = np.asarray(track.times_ms, dtype=np.int64)
    lon = np.array([p.longitude for p in track.positions])
    lat = np.array([p.latitude for p in track.positions])

    inside = (times >= fix_times[0]) & (times <= fix_times[-1])
    out_lon = np.full(times.shape, np.nan)
    out_lat = np.full(times.shape, np.nan)
    if not inside.any() or len(fix_times) == 1:
        out_lon[inside], out_lat[inside] = lon[0], lat[0]
        return Positions(out_lon, out_lat)

    t = times[inside]
    start = np.clip(np.searchsorted(fix_times, t, side="right") - 1, 0, len(fix_times) - 2)
    t0, t1 = fix_times[start], fix_times[start + 1]
    span = (t1 - t0).astype(np.float64)
    fraction = np.divide((t - t0).astype(np.float64), span, out=np.ones_like(span), where=span > 0)

    leg = range_bearing(lon[start], lat[start], lon[start + 1], lat[start + 1])
    reached = destination(lon[start], lat[start], leg.bearing_deg, leg.range_m * fraction)
    # At the fixes themselves, use the fix exactly, as position_at does.
    at_end = fraction >= 1.0
    at_start = fraction <= 0.0
    out_lon[inside] = np.where(
        at_end, lon[start + 1], np.where(at_start, lon[start], reached.longitude)
    )
    out_lat[inside] = np.where(
        at_end, lat[start + 1], np.where(at_start, lat[start], reached.latitude)
    )
    return Positions(out_lon, out_lat)


def bearing_residuals(measured_deg: ArrayLike, calculated_deg: ArrayLike) -> Floats:
    """Measured minus calculated bearing, each in (-180, 180], handling wrap at 360 (NFR-04)."""
    diff = np.mod(_floats(measured_deg) - _floats(calculated_deg), 360.0)
    return np.where(diff > 180.0, diff - 360.0, diff)
