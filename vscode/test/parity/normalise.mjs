// The cross-host parity check's projection of a plot's file (content, island and history), and
// its comparison. What legitimately differs between the hosts goes, and only that:
//
// - when: each record's id (it carries the time) and its start and end times;
// - who: the agent's name ("you, in the browser" against VS Code's), its kind kept;
// - hashes: the history's head hash and every step's, which follow from the times.
//
// Everything else is kept, so a command that changes the plot differently in one host, or saves a
// different step (its kind, tool, parameters, notes), or a different view, shows as a difference.

/** Keys whose values are hashes: they follow from the records' times, so differ by host. */
const HASH = /(^|_)hash$/;

/** A provenance record without when it was made, or by whom by name. */
function record(r) {
  const { id: _id, started_at: _start, ended_at: _end, agent, ...rest } = r;
  return { ...rest, ...(agent && { agent: { kind: agent.kind } }) };
}

/** Every hash dropped, at any depth. */
function unhashed(value) {
  if (Array.isArray(value)) return value.map(unhashed);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !HASH.test(k))
      .map(([k, v]) => [k, unhashed(v)]),
  );
}

/** A plot's file, as saved, projected: its content, the plot's own details and view (its island), its named sets, and its history's steps. */
export function normalise(text) {
  const doc = JSON.parse(text);
  const plot = doc.features.find((f) => f.properties.kind === "plot");
  const { view, ...details } = plot?.properties ?? {};
  const history = doc.history ?? {};
  return unhashed({
    schema_version: doc.schema_version,
    features: doc.features.filter((f) => f !== plot),
    plot: details,
    view: view ?? null,
    named_sets: doc.named_sets ?? [],
    provenance: (doc.provenance ?? []).map(record),
    history: {
      current: history.current,
      steps: (history.steps ?? []).map((s) => ({ ...s, records: (s.records ?? []).map(record) })),
    },
  });
}

/**
 * Two numbers the same but for the last bits: VS Code's service runs Python on the machine's maths
 * library and the playground on Pyodide's (WebAssembly), so a geodesic sum may round differently in
 * its sixteenth figure (a moved track's positions, say: some nanometres, about 2 parts in 10^15).
 * Every number is held to one part in 10^12 (STRICT), but for what is worked out by differencing
 * neighbouring positions: a course or speed from two such positions a few hundred metres apart
 * differs by the difference divided by the distance, about 2 parts in 10^10 for a sheared or
 * stretched track's courses and speeds. Those (DIFFERENCED) are held to one part in 10^9, still far
 * below anything Debrief shows (a speed to a tenth of a knot) or a command could mean.
 */
export const STRICT = 1e-12;
export const LOOSE = 1e-9;
/** The paths of values worked out by differencing neighbouring positions: a track's courses and speeds. */
export const DIFFERENCED = /\.properties\.(courses|speeds)\.values\[\d+\]$/;
const close = (x, y, tolerance) => x === y || Math.abs(x - y) <= tolerance * Math.max(1, Math.abs(x), Math.abs(y));

/** Where two projections differ: each path, with both values (cut short), at most limit of them. */
export function differences(a, b, limit = 40) {
  const found = [];
  const short = (v) => {
    const s = JSON.stringify(v);
    return s === undefined ? "(absent)" : s.length > 300 ? `${s.slice(0, 300)}…` : s;
  };
  const walk = (x, y, path) => {
    if (found.length >= limit) return;
    if (x && y && typeof x === "object" && typeof y === "object" && Array.isArray(x) === Array.isArray(y)) {
      if (Array.isArray(x)) {
        // Features by id, so one added or lost shows as that, not as every one after it moved.
        const keyed = x.every((e) => e && typeof e.id === "string") && y.every((e) => e && typeof e.id === "string");
        if (keyed) {
          const ys = new Map(y.map((e) => [e.id, e]));
          const xs = new Map(x.map((e) => [e.id, e]));
          for (const e of x) walk(e, ys.get(e.id), `${path}[${e.id}]`);
          for (const e of y) if (!xs.has(e.id)) walk(undefined, e, `${path}[${e.id}]`);
          if (!found.length && x.map((e) => e.id).join() !== y.map((e) => e.id).join()) found.push({ path: `${path} (order)`, a: short(x.map((e) => e.id)), b: short(y.map((e) => e.id)) });
          return;
        }
        for (let i = 0; i < Math.max(x.length, y.length); i++) walk(x[i], y[i], `${path}[${i}]`);
        return;
      }
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], path ? `${path}.${k}` : k);
      return;
    }
    if (typeof x === "number" && typeof y === "number" && close(x, y, DIFFERENCED.test(path) ? LOOSE : STRICT)) return;
    if (JSON.stringify(x) !== JSON.stringify(y)) found.push({ path: path || "(whole)", a: short(x), b: short(y) });
  };
  walk(a, b, "");
  return found;
}

/** A projection with the paths named left out (a known difference: sequence.mjs's KNOWN_DIFFERENCES). */
export function without(projection, paths) {
  const copy = structuredClone(projection);
  for (const path of paths) {
    const keys = path.split(".");
    const last = keys.pop();
    const parent = keys.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), copy);
    if (parent && typeof parent === "object") delete parent[last];
  }
  return copy;
}
