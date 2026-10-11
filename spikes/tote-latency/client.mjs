// Tote latency spike client (NFR-04). Stands in for the VS Code extension
// host, which is Node: sequential requests over a keep-alive connection,
// measuring round-trip latency and the server's own compute time.
//
//   node client.mjs PORT TOKEN LABEL
const [port, token, label] = process.argv.slice(2);
const base = `http://127.0.0.1:${port}`;
const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };

async function call(path, body) {
  const started = performance.now();
  const response = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return {
    totalMs: performance.now() - started,
    computeMs: Number(response.headers.get("x-compute-ms")),
    bytes: text.length,
  };
}

function summarise(name, samples, budgetMs) {
  const total = samples.map((s) => s.totalMs).sort((a, b) => a - b);
  const compute = samples.map((s) => s.computeMs).sort((a, b) => a - b);
  const pick = (xs, q) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
  const within = budgetMs ? total.filter((t) => t <= budgetMs).length / total.length : null;
  return {
    label,
    pattern: name,
    n: samples.length,
    p50_ms: +pick(total, 0.5).toFixed(2),
    p95_ms: +pick(total, 0.95).toFixed(2),
    p99_ms: +pick(total, 0.99).toFixed(2),
    max_ms: +total[total.length - 1].toFixed(2),
    compute_p50_ms: +pick(compute, 0.5).toFixed(2),
    overhead_p50_ms: +(pick(total, 0.5) - pick(compute, 0.5)).toFixed(2),
    bytes: samples[0].bytes,
    within_budget: within === null ? null : +(within * 100).toFixed(1),
  };
}

const results = [];
const health = await fetch(`${base}/health`, { headers });
const { bearings } = await health.json();

// Warm up the connection and any lazy initialisation.
for (let i = 0; i < 20; i++) await call("/tote", { time_ms: 3_600_000 + i * 1000 });

// Time slider: a drag across two hours, one request per slider event.
const slider = [];
for (let i = 0; i < 400; i++) slider.push(await call("/tote", { time_ms: 3_600_000 + i * 18_000 }));
results.push(summarise("time slider, per-call", slider, 100));

// Fallback: whole range once, client interpolates.
for (const [name, start, end, step] of [
  ["range, 24 h at 10 s", 0, 86_400_000, 10_000],
  ["range, 1 h at 1 s", 3_600_000, 7_200_000, 1_000],
]) {
  const samples = [];
  for (let i = 0; i < 10; i++) samples.push(await call("/tote_range", { start_ms: start, end_ms: end, step_ms: step }));
  results.push(summarise(name, samples, null));
}

// TMA drag: rotate a solution a little on each drag event.
for (const engine of ["pyproj", "geographiclib"]) {
  if (engine === "geographiclib" && bearings > 2_200) continue; // seconds per call; not worth sampling
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const solution = { lon: -4.3, lat: 50.1, course_deg: 100 + i * 0.5, speed_mps: 6, start_ms: 21_600_000 };
    samples.push(await call("/residuals", { engine, solution }));
  }
  results.push(summarise(`TMA drag, ${bearings} bearings, ${engine}`, samples, 100));
}

console.log(JSON.stringify(results));
