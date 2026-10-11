"""Tote latency spike: a minimal per-user tool service (NFR-04).

Listens on loopback only (SEC-07) and requires a per-session token (SEC-08).
At start-up it synthesises a scenario: a primary and several secondary tracks
over a day at 10-second fixes, and a set of bearings from the primary's
sensor. Endpoints:

    POST /tote          {"time_ms"}                 relative geometry at one time
    POST /tote_range    {"start_ms","end_ms","step_ms"}  densely sampled values (fallback)
    POST /residuals     {"engine", "solution": {...}}    bearing residuals for a TMA leg

    python service.py PORT TOKEN SECONDARIES BEARINGS
"""

from __future__ import annotations

import random
import sys
import time

import numpy as np
import uvicorn
from pyproj import Geod
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from debrief_kernel.geodesy import Position, TrackPath, destination, range_bearing
from debrief_kernel.units import angle, bearing_difference, length

GEOD = Geod(ellps="WGS84")
DAY_MS = 86_400_000
FIX_MS = 10_000


def synthetic_track(rng: random.Random, start: Position) -> TrackPath:
    """A day of 10-second fixes with a course change every half hour."""
    times, positions = [0], [start]
    course, knots = rng.uniform(0, 360), rng.uniform(8, 18)
    for t in range(FIX_MS, DAY_MS + 1, FIX_MS):
        if t % 1_800_000 == 0:
            course = (course + rng.uniform(-60, 60)) % 360
        step = length(knots * 1852 / 3600 * FIX_MS / 1000)
        positions.append(destination(positions[-1], angle(course), step))
        times.append(t)
    return TrackPath(times, positions)


class Scenario:
    def __init__(self, secondaries: int, bearings: int, seed: int = 1):
        rng = random.Random(seed)
        origin = Position(-4.5, 50.0)
        self.primary = synthetic_track(rng, origin)
        self.secondaries = [
            synthetic_track(
                rng,
                destination(
                    origin, angle(rng.uniform(0, 360)), length(rng.uniform(5, 30), "[nmi_i]")
                ),
            )
            for _ in range(secondaries)
        ]
        # Bearings to the first secondary over a six-hour TMA window, evenly spaced.
        target = self.secondaries[0]
        window_start, window_end = 6 * 3_600_000, 12 * 3_600_000
        step = (window_end - window_start) / bearings
        self.bearing_times = np.array(
            [round(window_start + i * step) for i in range(bearings)], dtype=np.int64
        )
        own = [self.primary.position_at(int(t)) for t in self.bearing_times]
        self.own_lon = np.array([p.longitude for p in own])
        self.own_lat = np.array([p.latitude for p in own])
        tgt = [target.position_at(int(t)) for t in self.bearing_times]
        true_bearing, _, _ = GEOD.inv(
            self.own_lon, self.own_lat, [p.longitude for p in tgt], [p.latitude for p in tgt]
        )
        noise = np.array([rng.gauss(0, 0.5) for _ in range(bearings)])
        self.measured = np.mod(true_bearing + noise, 360.0)
        self.own_positions = own


def tote(scenario: Scenario, time_ms: int) -> list[dict]:
    primary = scenario.primary.position_at(time_ms)
    rows = []
    for index, track in enumerate(scenario.secondaries):
        position = track.position_at(time_ms)
        if primary is None or position is None:
            rows.append({"track": index, "range_m": None, "bearing_deg": None})
            continue
        rng, brg = range_bearing(primary, position)
        rows.append({"track": index, "range_m": rng.value, "bearing_deg": brg.value})
    return rows


def tote_range(scenario: Scenario, start_ms: int, end_ms: int, step_ms: int) -> dict:
    """Fallback: values sampled densely enough for the client only to interpolate (NFR-04)."""
    times = np.arange(start_ms, end_ms + 1, step_ms, dtype=np.int64)
    primary = _positions_at(scenario.primary, times)
    series = []
    for track in scenario.secondaries:
        other = _positions_at(track, times)
        brg, _, dist = GEOD.inv(primary[0], primary[1], other[0], other[1])
        series.append(
            {"range_m": dist.round(1).tolist(), "bearing_deg": np.mod(brg, 360).round(3).tolist()}
        )
    return {"times_ms": times.tolist(), "series": series}


def _positions_at(track: TrackPath, times: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Positions at many times. Linear in latitude and longitude between fixes 10 s
    apart, which differs from the geodesic by well under a millimetre."""
    fix_times = np.array(track.times_ms, dtype=np.int64)
    lon = np.array([p.longitude for p in track.positions])
    lat = np.array([p.latitude for p in track.positions])
    return np.interp(times, fix_times, lon), np.interp(times, fix_times, lat)


def residuals(scenario: Scenario, solution: dict, engine: str) -> list[float]:
    """Measured minus calculated bearing for a straight-leg TMA solution at each bearing time."""
    start_ms = solution["start_ms"]
    course, speed = solution["course_deg"], solution["speed_mps"]
    distances = (scenario.bearing_times - start_ms) / 1000.0 * speed

    if engine == "pyproj":
        n = len(distances)
        sol_lon, sol_lat, _ = GEOD.fwd(
            np.full(n, solution["lon"]), np.full(n, solution["lat"]), np.full(n, course), distances
        )
        calculated, _, _ = GEOD.inv(scenario.own_lon, scenario.own_lat, sol_lon, sol_lat)
        diff = np.mod(scenario.measured - calculated + 180.0, 360.0) - 180.0
        return diff.round(4).tolist()

    start = Position(solution["lon"], solution["lat"])
    out = []
    for own, measured, distance in zip(
        scenario.own_positions, scenario.measured, distances, strict=True
    ):
        target = destination(start, angle(course), length(float(distance)))
        _, calc = range_bearing(own, target)
        out.append(round(bearing_difference(float(measured), calc.value), 4))
    return out


def build_app(token: str, scenario: Scenario) -> Starlette:
    def authorised(request: Request) -> bool:
        return request.headers.get("authorization") == f"Bearer {token}"

    async def handle(request: Request) -> Response:
        if not authorised(request):
            return Response(status_code=401)
        body = await request.json()
        path = request.url.path
        started = time.perf_counter()
        if path == "/tote":
            result = tote(scenario, int(body["time_ms"]))
        elif path == "/tote_range":
            result = tote_range(scenario, body["start_ms"], body["end_ms"], body["step_ms"])
        else:
            result = residuals(scenario, body["solution"], body.get("engine", "pyproj"))
        compute_ms = (time.perf_counter() - started) * 1000
        return JSONResponse(result, headers={"x-compute-ms": f"{compute_ms:.3f}"})

    async def health(request: Request) -> Response:
        return (
            JSONResponse({"bearings": len(scenario.bearing_times)})
            if authorised(request)
            else Response(status_code=401)
        )

    routes = [Route(p, handle, methods=["POST"]) for p in ("/tote", "/tote_range", "/residuals")]
    return Starlette(routes=[*routes, Route("/health", health)])


def self_check() -> None:
    """The two residual engines and the two Tote endpoints must agree before timing them."""
    scenario = Scenario(5, 500)
    solution = {"lon": -4.3, "lat": 50.1, "course_deg": 100, "speed_mps": 6, "start_ms": 21_600_000}
    fast = np.array(residuals(scenario, solution, "pyproj"))
    exact = np.array(residuals(scenario, solution, "geographiclib"))
    assert np.abs(fast - exact).max() < 1e-3, "residual engines disagree"
    sampled = tote_range(scenario, 3_600_000, 3_610_000, 10_000)
    single = tote(scenario, 3_610_000)
    for row, series in zip(single, sampled["series"], strict=True):
        assert abs(row["range_m"] - series["range_m"][-1]) < 0.1, "Tote endpoints disagree on range"
        assert abs(row["bearing_deg"] - series["bearing_deg"][-1]) < 1e-3, (
            "Tote endpoints disagree on bearing"
        )
    print("self-check passed", file=sys.stderr)


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        self_check()
        sys.exit(0)
    port, token, secondaries, bearings = (
        int(sys.argv[1]),
        sys.argv[2],
        int(sys.argv[3]),
        int(sys.argv[4]),
    )
    scenario = Scenario(secondaries, bearings)
    # Loopback only (SEC-07).
    uvicorn.run(build_app(token, scenario), host="127.0.0.1", port=port, log_level="warning")
