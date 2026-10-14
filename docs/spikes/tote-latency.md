# Spike: Tote and TMA latency (Phase 0)

**Question (delivery plan, Phase 0; NFR-04; SRD 12.2 milestone criterion).** Does a per-call REST request to the Python tool service keep Tote values and TMA bearing residuals within 100 ms of a time-slider move or a TMA drag? The answer fixes the Tote and residual architecture.

**Verdict: per-call REST meets the budget with a wide margin, for both patterns, provided residuals are computed with vectorised geodesics.** The dense-sampling fallback in NFR-04 is not needed.

## Method

`spikes/tote-latency/run.sh` starts a minimal tool service and drives it from a Node client standing in for the VS Code extension host.

- **Service:** Starlette and uvicorn, the stack the Python MCP SDK uses for HTTP. It listens on loopback only (SEC-07) and requires a per-session bearer token (SEC-08).
- **Client:** sequential requests over a keep-alive connection, with no concurrency.

Each scenario is synthesised at start-up: a primary and several secondary tracks over 24 hours at 10-second fixes, and a six-hour window of bearings from the primary to the first secondary. A self-check runs first and requires:

- the two residual engines to agree to 10⁻³ degrees (they agree exactly);
- the per-call and range endpoints to give the same Tote values.

The patterns timed:

- **Time slider:** 400 consecutive Tote requests across a two-hour drag, giving range and bearing from the primary to every secondary.
- **Fallback:** one request for a whole range, densely sampled, for the client to interpolate.
- **TMA drag:** 60 consecutive residual requests while rotating a straight-leg solution, computed two ways: per bearing with `geographiclib` (pure Python, the kernel today), and vectorised with `pyproj` (PROJ's C implementation of the same Karney algorithm).

## Results

Milliseconds, measured on the development container (Linux, Node 22, CPython 3.12). "Compute" is time inside the service; "overhead" is everything else (HTTP, JSON, event loop).

| Scenario | Pattern | p50 | p95 | p99 | max | compute p50 | overhead p50 | response KB | within 100 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 secondaries, 360 bearings | time slider, per-call | 2.0 | 2.5 | 3.6 | 5.6 | 0.7 | 1.3 | 0 | 100% |
| 5 secondaries, 360 bearings | range, 24 h at 10 s | 68.4 | 72.8 | 72.8 | 72.8 | 42.4 | 26.0 | 782 | |
| 5 secondaries, 360 bearings | TMA drag, pyproj | 1.8 | 2.3 | 2.4 | 2.4 | 0.5 | 1.4 | 3 | 100% |
| 5 secondaries, 360 bearings | TMA drag, geographiclib | 34.9 | 44.1 | 46.7 | 46.7 | 32.5 | 2.4 | 3 | 100% |
| 5 secondaries, 2160 bearings | TMA drag, pyproj | 4.5 | 6.2 | 8.6 | 8.6 | 2.3 | 2.2 | 17 | 100% |
| 5 secondaries, 2160 bearings | TMA drag, geographiclib | 194.1 | 227.3 | 249.5 | 249.5 | 191.5 | 2.6 | 17 | 0% |
| 5 secondaries, 21600 bearings | time slider, per-call | 1.8 | 2.5 | 3.4 | 4.3 | 0.7 | 1.2 | 0 | 100% |
| 5 secondaries, 21600 bearings | TMA drag, pyproj | 28.7 | 33.7 | 36.1 | 36.1 | 21.8 | 6.9 | 166 | 100% |
| 20 secondaries, 2160 bearings | time slider, per-call | 3.7 | 5.3 | 6.2 | 6.3 | 2.3 | 1.4 | 1 | 100% |
| 20 secondaries, 2160 bearings | range, 24 h at 10 s | 256.1 | 283.3 | 283.3 | 283.3 | 160.4 | 95.6 | 2889 | |

The full matrix, including 1-hour ranges at 1 s, comes from `run.sh`.

## Findings

1. **Per-call REST costs about 1.3–2 ms per request.** Time-slider updates complete in under 7 ms at p99, even with 20 secondaries: about fifteen times inside the budget, and fast enough to follow a slider at display rate.
2. **The fallback is worse, not better.** One densely sampled range request takes 65–280 ms and returns 0.8–2.9 MB. It would also need client-side interpolation, including bearing wrap-around. Not adopted.
3. **Residuals must be vectorised.** The kernel's per-point pure-Python geodesics take about 90 µs per bearing, so a drag over 2,160 bearings takes about 200 ms and fails. Vectorised pyproj does the same work in 2 ms; at 21,600 bearings (six hours at one a second) p99 is 36 ms. Both engines give identical residuals.
4. **Payload size grows with bearing count** (166 KB per drag event at 21,600 bearings). This is harmless on loopback. Restricting residuals to the display window (CAP-28), which TMA already uses (CAP-21), keeps it small.
5. **A bug the self-check caught:** pyproj's inverse returns forward azimuth, back azimuth and distance, in that order. Taking the wrong one gives plausible-looking bearings that are about 180° out. The kernel's vectorised API should hide this.

## Decisions (accepted 11 Oct)

- **Tote:** per-call REST, one request per time change. Drop the dense-sampling fallback from the design (it stays in NFR-04 as a contingency).
- **TMA residuals:** per-call REST on each drag event, computed with vectorised geodesics. Add a vectorised geodesy API to the kernel (pyproj and numpy, both in Pyodide 314.0.7), keeping `geographiclib` for single-point calls. pyproj becomes a kernel dependency.
- **Request coalescing:** the client sends the next request only when the previous one returns, always for the latest slider or drag position. This bounds staleness to one round trip and never queues.

## Measured in the built Tote (14 Oct)

The Tote was built on this architecture (CAP-06; see the [Tote interaction model](../../site/docs/guides/interaction-models/tote.md)): one `debrief/tote` request per change of current time, the next sent only when the last returns, for the latest time. Three checks report the numbers on every run, asserting only generously:

| Host | Measured from | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| Tool service in process, 9 secondaries, 400 slider positions (`test_tote_latency.py`) | request to reply | 4.8 ms | 6.5 ms | 16 ms |
| VS Code with the real service, 3 secondaries, current time moved 60 times a second (integration test) | asking to showing | 5.0 ms | 8.6 ms | 25 ms |
| Playground, Pyodide in Chromium, 4 secondaries, playing (`tote.mjs`) | asking to showing | 5.3 ms | 15 ms | 31 ms |

The plot's tracks are prepared once and kept while the plot file is unchanged, so a request reads no plot. The dense-sampling fallback remains unbuilt.

## Caveats

- Measured on a development container, not an analyst laptop. Windows laptops may be two to three times slower. That leaves the Tote and residuals at 2,160 bearings comfortably inside budget. Residuals at 21,600 bearings may approach 100 ms, which NFR-04 permits during a drag provided values are exact when it ends.
- The webview-to-extension-host message hop is not included; it is typically under a millisecond.
- The service ran one scenario at a time with no other load.

The SRD 12.2 milestone criterion "measure per-call REST against the 100 ms Tote budget" can be marked done in the live delivery plan.
