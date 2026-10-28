/**
 * What the Outline shows of TMA solutions and sensors, and what the Tools offer for its
 * selection (product owner, 27 Oct 2026), the same in VS Code's tree and the playground's,
 * free of either so it can be tested.
 *
 * - A TMA solution opens to its legs, each leg to its positions (fixes): time, course and
 *   speed. A sensor opens to its cuts: time, bearing (both of an ambiguous pair not yet
 *   resolved, marked ≈ as Bearings measures it by the nearer; or the side kept), its range if
 *   it has one, and whether it is hidden. Rows are keyed so a selection can name a leg or a
 *   fix, which are not features: the solution's id with #leg2 or #fix14.
 * - The Tools' entries for the selection: Split before and Split after a fix; Hide cuts and
 *   Show cuts; Delete cuts; Leave out of the solution and Count in it; Keep port, Keep
 *   starboard and Make ambiguous again; TMA solution from cuts. Each shown when the selection
 *   has what it acts on, and disabled with the reason when it cannot act.
 * - What Bearings shows for the selection: a solution (for it, a leg or a fix), or a sensor's
 *   coverage (for it or some of its cuts); something unrelated keeps what it shows.
 */
import { convert, DEFAULT_SETTINGS, fixed, formatRange, formatTime, UNIT_LABELS, type FormatSettings } from "@debrief/kernel";
import type { DebriefFeatureCollection, TmaRequest } from "@debrief/schemas";
import { bearingText, degrees, metres, placeOfCut, sensorsOf, sideOf, type CutFeature, type SensorEntry } from "./sensors.js";
import { legBounds, splitAtFix } from "./tma.js";

type PlotFeature = DebriefFeatureCollection["features"][number];
type Track = Extract<PlotFeature, { properties: { kind: "track" } }>;

// --- Keys: a leg and a fix are not features, so their rows are keyed by their solution ----------

export const legKey = (solution: string, leg: number): string => `${solution}#leg${leg}`;
export const fixKey = (solution: string, index: number): string => `${solution}#fix${index}`;

/** What a row of the Outline is. */
export type OutlinePick =
  | { kind: "feature"; id: string; feature: PlotFeature }
  | { kind: "cut"; id: string; cut: CutFeature; sensor: string }
  | { kind: "leg"; solution: string; leg: number }
  | { kind: "fix"; solution: string; index: number };

/** A solution's fixes and legs, read once. */
export interface SolutionIndex {
  track: Track;
  times: number[];
  legStarts: number[];
  /** Each leg's first fix, and the end: leg k (from 1) holds fixes bounds[k - 1] to bounds[k] - 1. */
  bounds: number[];
}

/** The plot as the Outline reads it: features by id, sensors with their cuts in time order, solutions with their legs. */
export interface OutlineIndex {
  plot: DebriefFeatureCollection;
  byId: Map<string, PlotFeature>;
  sensors: Map<string, SensorEntry>;
  /** Each cut's sensor and its place in the sensor's cuts. */
  cuts: Map<string, { sensor: string; index: number }>;
  solutions: Map<string, SolutionIndex>;
  /** Which solutions each cut is rooted in. */
  rootedIn: Map<string, string[]>;
}

const indices = new WeakMap<DebriefFeatureCollection, OutlineIndex>();

/** The plot's index, made once for each plot read (a step saved reads it again). */
export function outlineIndex(plot: DebriefFeatureCollection): OutlineIndex {
  let index = indices.get(plot);
  if (index) return index;
  const byId = new Map(plot.features.map((f) => [f.id, f]));
  const sensors = new Map(sensorsOf(plot).map((e) => [e.sensor.id, e]));
  const cuts = new Map<string, { sensor: string; index: number }>();
  for (const entry of sensors.values()) entry.cuts.forEach((c, i) => cuts.set(c.id, { sensor: entry.sensor.id, index: i }));
  const solutions = new Map<string, SolutionIndex>();
  const rootedIn = new Map<string, string[]>();
  for (const f of plot.features) {
    if (f.properties.kind !== "track" || !(f as Track).properties.tma) continue;
    const track = f as Track;
    const times = track.properties.times.map((t) => Date.parse(t));
    const legStarts = (track.properties.tma!.leg_starts ?? []).map((t) => Date.parse(t));
    solutions.set(track.id, { track, times, legStarts, bounds: legBounds(times, legStarts) });
    for (const id of track.properties.tma!.cut_ids) rootedIn.set(id, [...(rootedIn.get(id) ?? []), track.id]);
  }
  index = { plot, byId, sensors, cuts, solutions, rootedIn };
  indices.set(plot, index);
  return index;
}

/** What a row's key names, if the plot still has it. */
export function pickOf(index: OutlineIndex, key: string): OutlinePick | undefined {
  const hash = key.lastIndexOf("#");
  if (hash > 0) {
    const solution = key.slice(0, hash);
    const s = index.solutions.get(solution);
    const m = /^#(leg|fix)(\d+)$/.exec(key.slice(hash));
    if (!s || !m) return undefined;
    const n = Number(m[2]);
    if (m[1] === "leg") return n >= 1 && n < s.bounds.length ? { kind: "leg", solution, leg: n } : undefined;
    return n >= 0 && n < s.times.length ? { kind: "fix", solution, index: n } : undefined;
  }
  const cut = index.cuts.get(key);
  if (cut) return { kind: "cut", id: key, cut: index.sensors.get(cut.sensor)!.cuts[cut.index], sensor: cut.sensor };
  const feature = index.byId.get(key);
  return feature ? { kind: "feature", id: key, feature } : undefined;
}

/** The features a selection of rows selects on the map: a cut itself; a leg or a fix, its solution. */
export function featureIdsOfPicks(picks: readonly OutlinePick[]): string[] {
  return [...new Set(picks.map((p) => (p.kind === "leg" || p.kind === "fix" ? p.solution : p.id)))];
}

/** The rows that show a selection of features made elsewhere (the map, Bearings): each feature's own row. */
export function keysOfFeatures(ids: readonly string[]): string[] {
  return [...ids];
}

/** The rows a cut's row is under, outermost first, so it can be brought into sight: its sensor's host track, then its sensor. */
export function ancestorsOf(index: OutlineIndex, key: string): string[] {
  const pick = pickOf(index, key);
  if (!pick) return [];
  if (pick.kind === "cut") {
    const host = index.sensors.get(pick.sensor)?.sensor.properties.host_track_id;
    return [...(host && index.byId.has(host) ? [host] : []), pick.sensor];
  }
  if (pick.kind === "leg") return [pick.solution];
  if (pick.kind === "fix") return [pick.solution, legKey(pick.solution, legOfFix(index.solutions.get(pick.solution)!, pick.index))];
  if (pick.kind === "feature" && pick.feature.properties.kind === "sensor") {
    const host = pick.feature.properties.host_track_id;
    return index.byId.has(host) ? [host] : [];
  }
  return [];
}

/** The leg, from 1, of a solution's fix. */
export function legOfFix(s: SolutionIndex, fix: number): number {
  let leg = 1;
  while (leg < s.bounds.length - 1 && s.bounds[leg] <= fix) leg++;
  return leg;
}

// --- What each row says -------------------------------------------------------------------------

const unitOf = (unit: string) => UNIT_LABELS[unit] ?? unit;

/** A fix's course and speed, as its solution's DR legs give them: "246.1°T 3.8 kn". */
export function courseSpeed(track: Track, i: number, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const c = track.properties.courses;
  const s = track.properties.speeds;
  const parts: string[] = [];
  if (c && c.values[i] !== undefined && c.values[i] !== null) {
    const deg = c.unit === "rad" ? (c.values[i] * 180) / Math.PI : c.values[i];
    parts.push(`${bearingText(deg)}T`);
  }
  if (s && s.values[i] !== undefined && s.values[i] !== null) {
    const speed = convert({ value: s.values[i], unit: s.unit }, settings.speed_unit);
    parts.push(`${fixed(speed.value, settings.speed_decimals)} ${unitOf(settings.speed_unit)}`);
  }
  return parts.join(" ");
}

/** A leg's row: "Leg 2", "10:38:00Z–12:00:00Z · 44 fixes · 200.0°T 5.2 kn". */
export function legRow(s: SolutionIndex, leg: number, settings: FormatSettings = DEFAULT_SETTINGS): { name: string; detail: string; label: string; fixes: number } {
  const first = s.bounds[leg - 1];
  const last = s.bounds[leg] - 1;
  const fixes = last - first + 1;
  const span = `${formatTime(s.times[first], settings)}–${formatTime(s.times[last], settings)}`;
  const motion = courseSpeed(s.track, first, settings);
  const detail = [span, `${fixes} ${fixes === 1 ? "fix" : "fixes"}`, motion].filter(Boolean).join(" · ");
  const legs = s.bounds.length - 1;
  return { name: `Leg ${leg}`, detail, label: `Leg ${leg} of ${legs}, ${detail.replace(/ · /g, ", ")}`, fixes };
}

/** A fix's row: "10:38:00Z", "246.1°T 3.8 kn". */
export function fixRow(s: SolutionIndex, i: number, settings: FormatSettings = DEFAULT_SETTINGS): { name: string; detail: string; label: string } {
  const name = formatTime(s.times[i], settings);
  const detail = courseSpeed(s.track, i, settings);
  return { name, detail, label: `Position at ${name}${detail ? `, ${detail}` : ""}` };
}

const courses = new WeakMap<CutFeature, number | null>();
/** The course a cut's sides are told by, where its sensor was: worked out once a cut (only for the rows in sight). */
function courseOf(entry: SensorEntry, cut: CutFeature): number | undefined {
  if (!courses.has(cut)) courses.set(cut, placeOfCut(entry, cut)?.course ?? null);
  return courses.get(cut) ?? undefined;
}

const SHORT_SIDE = { port: "port", starboard: "stbd" } as const;

/**
 * A cut's row: its time; its bearing, with an ambiguous pair's other side (≈, not yet
 * resolved: Bearings measures it by the nearer) or the side kept; its range if it has one;
 * hidden on the map if it is. The label is what a screen reader hears.
 */
export function cutRow(entry: SensorEntry, cut: CutFeature, settings: FormatSettings = DEFAULT_SETTINGS): { name: string; detail: string; label: string; hidden: boolean; ambiguous: boolean } {
  const props = cut.properties;
  const name = formatTime(Date.parse(props.time), settings);
  const first = degrees(props.bearing);
  const course = props.ambiguous_bearing ? courseOf(entry, cut) : undefined;
  const side = (b: number) => (course === undefined ? undefined : sideOf(course, b));
  let shown: string;
  let said: string;
  const ambiguous = !!props.ambiguous_bearing && !props.resolved;
  if (props.ambiguous_bearing) {
    const twin = degrees(props.ambiguous_bearing);
    if (!props.resolved) {
      const s1 = side(first);
      const s2 = side(twin);
      shown = `≈ ${bearingText(first)}${s1 ? ` ${SHORT_SIDE[s1]}` : ""} / ${bearingText(twin)}${s2 ? ` ${SHORT_SIDE[s2]}` : ""}`;
      said = `${bearingText(first)}${s1 ? ` to ${s1}` : ""} or ${bearingText(twin)}${s2 ? ` to ${s2}` : ""}, not yet resolved`;
    } else {
      const kept = props.resolved === "bearing" ? first : twin;
      const s = side(kept);
      shown = `${bearingText(kept)}${s ? ` ${SHORT_SIDE[s]}` : ""} kept`;
      said = `${bearingText(kept)}${s ? ` to ${s}` : ""} kept`;
    }
  } else {
    shown = bearingText(first);
    said = shown;
  }
  const range = props.range ? formatRange({ value: metres(props.range), unit: "m" }, settings) : undefined;
  const hidden = !!props.hidden;
  const detail = [shown, range, hidden ? "hidden on map" : ""].filter(Boolean).join(" · ");
  const label = [`Cut at ${name}`, said, range ? `range ${range}` : "", hidden ? "hidden on the map" : ""].filter(Boolean).join(", ");
  return { name, detail, label, hidden, ambiguous };
}

// --- What Bearings shows for the selection -------------------------------------------------------

/** What Bearings shows: a solution, perhaps at one of its fixes or legs; or a sensor's coverage. */
export type BearingsShown = { solution: string; fix?: number; leg?: number } | { sensor: string };

/**
 * What Bearings shows for a selection in the Outline (product owner, 27 Oct 2026): a solution
 * for it, one of its legs or fixes; a sensor's coverage for it or some of its cuts (but cuts of
 * the sensors the solution shown is rooted in keep the solution shown, as a dot clicked in its
 * plot does); undefined for something unrelated, which keeps what is shown.
 */
export function bearingsFor(index: OutlineIndex, picks: readonly OutlinePick[], shownSolution?: string): BearingsShown | undefined {
  for (const p of picks) {
    if (p.kind === "fix") return { solution: p.solution, fix: p.index };
    if (p.kind === "leg") return { solution: p.solution, leg: p.leg };
    if (p.kind === "feature" && index.solutions.has(p.id)) return { solution: p.id };
  }
  const cuts = picks.filter((p): p is Extract<OutlinePick, { kind: "cut" }> => p.kind === "cut");
  if (cuts.length) {
    const shown = shownSolution ? index.solutions.get(shownSolution) : undefined;
    if (shown) {
      const sensors = solutionSensors(index, shown);
      if (cuts.every((c) => sensors.has(c.sensor))) return { solution: shownSolution! };
    }
    return { sensor: cuts[0].sensor };
  }
  const sensor = picks.find((p) => p.kind === "feature" && p.feature.properties.kind === "sensor");
  return sensor && sensor.kind === "feature" ? { sensor: sensor.id } : undefined;
}

/** The sensors whose cuts a solution is rooted in, and those it names. */
function solutionSensors(index: OutlineIndex, s: SolutionIndex): Set<string> {
  const out = new Set(s.track.properties.tma!.sensor_ids);
  for (const id of s.track.properties.tma!.cut_ids) {
    const c = index.cuts.get(id);
    if (c) out.add(c.sensor);
  }
  return out;
}

/** Bearings' one-line title (product owner, 27 Oct 2026): "Contact 1 solution · leg 2 of 3 · fix at 10:38:00Z"; "Towed array on BLUE ONE · 102 cuts, 40 ambiguous". */
export function bearingsTitle(index: OutlineIndex, shown: BearingsShown | undefined, settings: FormatSettings = DEFAULT_SETTINGS): string {
  if (!shown) return "";
  if ("solution" in shown) {
    const s = index.solutions.get(shown.solution);
    if (!s) return "";
    const legs = s.bounds.length - 1;
    const parts = [s.track.properties.name];
    if (shown.fix !== undefined && shown.fix < s.times.length) {
      if (legs > 1) parts.push(`leg ${legOfFix(s, shown.fix)} of ${legs}`);
      parts.push(`fix at ${formatTime(s.times[shown.fix], settings)}`);
    } else if (shown.leg !== undefined && legs > 1) parts.push(`leg ${shown.leg} of ${legs}`);
    else parts.push(`${legs} ${legs === 1 ? "leg" : "legs"}, ${s.track.properties.tma!.cut_ids.length} cuts`);
    return parts.join(" · ");
  }
  const entry = index.sensors.get(shown.sensor);
  if (!entry) return "";
  const ambiguous = entry.cuts.filter((c) => !!c.properties.ambiguous_bearing && !c.properties.resolved).length;
  const host = entry.host ? ` on ${entry.host.properties.name}` : "";
  return `${entry.sensor.properties.name}${host} · ${entry.cuts.length.toLocaleString("en-GB")} cuts${ambiguous ? `, ${ambiguous} ambiguous` : ""}`;
}

// --- The Tools' entries for the selection ---------------------------------------------------------

export type OperationId =
  | "split-before"
  | "split-after"
  | "hide-cuts"
  | "show-cuts"
  | "delete-cuts"
  | "leave-out"
  | "count-in"
  | "keep-port"
  | "keep-starboard"
  | "keep-ambiguous"
  | "tma-from-cuts";

/** The order the Tools list them in. */
export const OPERATIONS: OperationId[] = ["tma-from-cuts", "split-before", "split-after", "keep-port", "keep-starboard", "keep-ambiguous", "leave-out", "count-in", "hide-cuts", "show-cuts", "delete-cuts"];

/** An entry of the Tools for the Outline's selection: what it says, and whether it can act or why not. */
export interface Operation {
  id: OperationId;
  label: string;
  /** What it does, for a tooltip. */
  detail: string;
  enabled: boolean;
  /** Why it cannot act, when disabled. */
  reason?: string;
}

/** What the Tools' entries act on: the Outline's selection, what Bearings shows, the time window. */
export interface OperationContext {
  index: OutlineIndex;
  picks: readonly OutlinePick[];
  /** The solution Bearings shows, if any: Leave out and Count in act on it when the cuts are rooted in it. */
  shownSolution?: string;
  window?: { start: number; end: number };
  readOnly?: boolean;
  settings?: FormatSettings;
}

const plural = (n: number, noun: string, many = `${noun}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? noun : many}`;

/** The cuts picked, in time order. */
export function pickedCuts(picks: readonly OutlinePick[]): CutFeature[] {
  return picks
    .filter((p): p is Extract<OutlinePick, { kind: "cut" }> => p.kind === "cut")
    .map((p) => p.cut)
    .sort((a, b) => (a.properties.time < b.properties.time ? -1 : a.properties.time > b.properties.time ? 1 : 0));
}

/** The solutions the cuts are rooted in, and which one Leave out and Count in act on: the one Bearings shows, else the only one; none chosen when several are and Bearings shows none of them. */
export function exclusionTarget(index: OutlineIndex, cuts: readonly CutFeature[], shownSolution?: string): { solution?: string; candidates: string[] } {
  const candidates = [...new Set(cuts.flatMap((c) => index.rootedIn.get(c.id) ?? []))];
  if (shownSolution && candidates.includes(shownSolution)) return { solution: shownSolution, candidates };
  return { ...(candidates.length === 1 && { solution: candidates[0] }), candidates };
}

/** The cuts of a sensor shown on the map within the time window, in time order. */
export function cutsInWindow(entry: SensorEntry, window: { start: number; end: number } | undefined): CutFeature[] {
  if (!window) return entry.cuts.filter((c) => !c.properties.hidden);
  return entry.cuts.filter((c, i) => entry.times[i] >= window.start && entry.times[i] <= window.end && !c.properties.hidden);
}

/**
 * The solution TMA solution from cuts… makes (product owner, 27 Oct 2026): with cuts selected,
 * rooted in exactly those; with only a sensor selected, in its cuts in the time window. A string
 * says why there is none.
 */
export function tmaRequestOf(context: OperationContext): { request: TmaRequest; cuts: CutFeature[]; what: string } | string {
  const { index, picks, window } = context;
  const settings = context.settings ?? DEFAULT_SETTINGS;
  const cuts = pickedCuts(picks);
  if (cuts.length) {
    const shown = cuts.filter((c) => !c.properties.hidden);
    if (!shown.length) return "These cuts are all hidden on the map, so none would count: show them first.";
    if (new Set(shown.map((c) => c.properties.time)).size < 2) return "Select cuts at two times or more: a solution needs two fixes.";
    const what = `${plural(cuts.length, "cut")} ${formatTime(Date.parse(cuts[0].properties.time), settings)}–${formatTime(Date.parse(cuts[cuts.length - 1].properties.time), settings)}`;
    return { request: { cut_ids: cuts.map((c) => c.id) }, cuts, what };
  }
  const sensor = picks.find((p) => p.kind === "feature" && p.feature.properties.kind === "sensor");
  const entry = sensor && sensor.kind === "feature" ? index.sensors.get(sensor.id) : undefined;
  if (!entry) return "Select a sensor, or a run of its cuts, in the Outline.";
  const inWindow = cutsInWindow(entry, window);
  if (new Set(inWindow.map((c) => c.properties.time)).size < 2) return `${entry.sensor.properties.name} has no two cuts at different times in the time window: select a run of its cuts instead.`;
  const iso = (t: number) => new Date(t).toISOString();
  const period = window ? { start: iso(window.start), end: iso(window.end) } : { start: inWindow[0].properties.time, end: inWindow[inWindow.length - 1].properties.time };
  const what = `${plural(inWindow.length, "cut")} of ${entry.sensor.properties.name} in the time window`;
  return { request: { sensor_ids: [entry.sensor.id], period }, cuts: inWindow, what };
}

/**
 * The Tools' entries for the Outline's selection (product owner, 27 Oct 2026), in OPERATIONS'
 * order: those for what is selected (a fix or a solution: the splits; cuts: keeping a side,
 * leaving out, hiding, deleting and a solution from them; a sensor: a solution from its cuts),
 * each enabled or disabled with the reason. None for a selection with none of these.
 */
export function outlineOperations(context: OperationContext): Operation[] {
  const { index, picks } = context;
  const settings = context.settings ?? DEFAULT_SETTINGS;
  const out: Operation[] = [];
  const add = (id: OperationId, label: string, detail: string, reason?: string) => out.push({ id, label, detail, enabled: !reason && !context.readOnly, ...((reason || context.readOnly) && { reason: context.readOnly ? "An earlier revision is shown read-only." : reason }) });
  const fixes = picks.filter((p): p is Extract<OutlinePick, { kind: "fix" }> => p.kind === "fix");
  const solutionPicked = picks.some((p) => p.kind === "leg" || p.kind === "fix" || (p.kind === "feature" && index.solutions.has(p.id)));
  const cuts = pickedCuts(picks);
  const sensorPicked = picks.some((p) => p.kind === "feature" && p.feature.properties.kind === "sensor");

  if (cuts.length || sensorPicked) {
    const made = tmaRequestOf(context);
    add("tma-from-cuts", typeof made === "string" ? "TMA solution from cuts…" : `TMA solution from ${made.what}…`, "Make a TMA solution rooted in these cuts, from a first guess: the form in Bearings, or two clicks on the map", typeof made === "string" ? made : undefined);
  }
  if (solutionPicked) {
    for (const side of ["before", "after"] as const) {
      const label = side === "before" ? "Split before" : "Split after";
      const detail = side === "before" ? "Split the leg here: this position becomes the first fix of a new leg; the other legs stay where they are" : "Split the leg here: this position becomes the last fix of the earlier leg; the other legs stay where they are";
      if (fixes.length !== 1) {
        add(`split-${side}`, label, detail, fixes.length ? "Select one position only." : "Select one position (fix) of a leg: expand the solution and its leg.");
        continue;
      }
      const s = index.solutions.get(fixes[0].solution)!;
      const found = splitAtFix(s.times, s.legStarts, fixes[0].index, side);
      const at = formatTime(s.times[fixes[0].index], settings);
      let reason: string | undefined;
      if ("refused" in found) {
        reason =
          found.refused === "first"
            ? `The fix at ${at} is already the first of leg ${found.leg}.`
            : found.refused === "last"
              ? fixes[0].index === s.times.length - 1
                ? `The fix at ${at} is the solution's last.`
                : `The fix at ${at} is already the last of leg ${found.leg}.`
              : `Leg ${found.leg} would keep ${plural(found.before ?? 0, "fix", "fixes")} before the split and ${plural(found.after ?? 0, "fix", "fixes")} after it: each leg needs two.`;
      }
      add(`split-${side}`, `${label} ${at}`, detail, reason);
    }
  }
  if (!cuts.length) return order(out);
  const what = cuts.length === 1 ? "this cut" : `${plural(cuts.length, "cut")}`;
  const twins = cuts.filter((c) => !!c.properties.ambiguous_bearing);
  const noTwins = "None of these cuts has two bearings.";
  add("keep-port", `Keep port: ${what}`, "Keep the bearing to port of the host's course; the other is no longer drawn", twins.length ? undefined : noTwins);
  add("keep-starboard", `Keep starboard: ${what}`, "Keep the bearing to starboard of the host's course; the other is no longer drawn", twins.length ? undefined : noTwins);
  add("keep-ambiguous", `Make ambiguous again: ${what}`, "Draw both bearings again, as they were read in", twins.some((c) => !!c.properties.resolved) ? undefined : twins.length ? "None of these cuts has a side kept." : noTwins);
  const target = exclusionTarget(index, cuts, context.shownSolution);
  const name = target.solution ? index.solutions.get(target.solution)!.track.properties.name : undefined;
  const rooted = target.solution ? cuts.filter((c) => (index.rootedIn.get(c.id) ?? []).includes(target.solution!)) : cuts;
  const out_ = new Set(target.solution ? (index.solutions.get(target.solution)!.track.properties.tma!.excluded_cut_ids ?? []) : []);
  const none = target.candidates.length ? undefined : "None of these cuts is rooted in a TMA solution.";
  const which = target.solution ? ` of ${name}` : target.candidates.length > 1 ? " of a solution…" : "";
  add("leave-out", `Leave out${which}`, "Leave these cuts out of the solution's RMS error, such as wild bearings; they stay drawn", none ?? (target.solution && rooted.every((c) => out_.has(c.id)) ? `They are left out of ${name} already.` : undefined));
  add("count-in", `Count in${which}`, "Count these cuts in the solution's RMS error again", none ?? (target.solution && !rooted.some((c) => out_.has(c.id)) ? `They are counted in ${name} already.` : undefined));
  const hidden = cuts.filter((c) => !!c.properties.hidden).length;
  add("hide-cuts", `Hide ${what}`, "Hide these cuts on the map: they are left out of every solution's residuals until shown again, as legacy's Visible=false", hidden === cuts.length ? "They are hidden already." : undefined);
  add("show-cuts", `Show ${what}`, "Show these cuts on the map again: they count in the solutions rooted in them again", hidden ? undefined : "None of them is hidden.");
  add("delete-cuts", `Delete ${what}`, "Delete these cuts from the plot as one step (Undo brings them back); solutions rooted in them drop them");
  return order(out);
}

const order = (ops: Operation[]) => ops.sort((a, b) => OPERATIONS.indexOf(a.id) - OPERATIONS.indexOf(b.id));

// --- Choosing in the Outline for the analyst (a walkthrough's step, a command) --------------------

/** What to choose under a sensor's or a solution's row: the cut at a time, the cuts of a period (and their first guess's form), or the solution's position at a time. */
export interface OutlineFocus {
  cut_time?: string;
  period?: { start: string; end: string };
  make?: boolean;
  fix_time?: string;
}

/** The index of the time nearest at, the first of ties; -1 for none. */
function nearest(times: readonly number[], at: number): number {
  let best = -1;
  let gap = Infinity;
  times.forEach((t, i) => {
    const d = Math.abs(t - at);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

/**
 * The Outline's rows a focus chooses under a sensor or a solution (the walkthrough's steps):
 * a sensor's cut at or nearest a time, or its cuts in a period; a solution's position (fix) at
 * or nearest a time, or the cut it is rooted in nearest a time; else the row itself. A string
 * says why there is nothing to choose.
 */
export function outlineChoice(index: OutlineIndex, id: string, focus: OutlineFocus = {}): string[] | string {
  const entry = index.sensors.get(id);
  if (entry) {
    if (focus.period) {
      const start = Date.parse(focus.period.start);
      const end = Date.parse(focus.period.end);
      const keys = entry.cuts.filter((_, i) => entry.times[i] >= start && entry.times[i] <= end).map((c) => c.id);
      return keys.length ? keys : "There are no cuts in that period.";
    }
    if (focus.cut_time) {
      const i = nearest(entry.times, Date.parse(focus.cut_time));
      return i >= 0 ? [entry.cuts[i].id] : `${entry.sensor.properties.name} has no cuts.`;
    }
    return [id];
  }
  const s = index.solutions.get(id);
  if (s) {
    if (focus.fix_time) {
      const i = nearest(s.times, Date.parse(focus.fix_time));
      return i >= 0 ? [fixKey(id, i)] : "The solution has no positions.";
    }
    if (focus.cut_time) {
      const rooted = s.track.properties.tma!.cut_ids.filter((c) => index.cuts.has(c));
      const times = rooted.map((c) => {
        const at = index.cuts.get(c)!;
        return index.sensors.get(at.sensor)!.times[at.index];
      });
      const i = nearest(times, Date.parse(focus.cut_time));
      return i >= 0 ? [rooted[i]] : "The solution is rooted in no cut.";
    }
    return [id];
  }
  return index.byId.has(id) ? [id] : "That is not in this plot.";
}
