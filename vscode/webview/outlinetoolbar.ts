/**
 * The Outline's toolbar (product owner, 28 Oct 2026): compact icon buttons above the tree, the
 * same in VS Code's view title bar and the playground. What each does to the Outline's selection,
 * and what its tooltip says, free of either host so it can be tested.
 *
 * - **Hidden on map**, three states: everything selected that can be hidden is shown (an eye;
 *   pressing hides them all), all hidden (a closed eye; pressing shows them all), or some of each
 *   (a half-closed eye, aria-pressed "mixed"; pressing shows them all, the common convention for a
 *   mixed toggle). Tracks, solutions, sensors, cuts, annotations and sensor observations can be
 *   hidden; a leg or a position cannot, and is left out, the tooltip saying so. One step, through
 *   debrief/set_hidden, as the Tools' Hide cuts and Show cuts.
 * - **Colour**: the selected that have a colour (tracks and solutions, sensors, cuts, annotations
 *   but chart furniture) take one colour, one step through debrief/set_colour.
 * - **Select all** (every row listed, as Ctrl+A in the tree), **Select children** (the selection
 *   replaced by the direct children of what is selected: a track's sensors, a sensor's cuts, a
 *   solution's legs, a leg's positions) and **Clear selection**.
 */
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { fixKey, legKey, type OutlineIndex, type OutlinePick } from "./outlinemodel.js";

type PlotFeature = DebriefFeatureCollection["features"][number];

/** The kinds of feature that can be hidden on the map: their own hidden property (SUB-22). */
export const HIDEABLE_KINDS: ReadonlySet<string> = new Set(["track", "annotation", "sensor", "sensor_cut", "sensor_observations"]);

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** What a row is called when counted, (one, many), in the order a count lists them. */
const NOUNS: [string, string, string][] = [
  ["track", "track", "tracks"],
  ["solution", "TMA solution", "TMA solutions"],
  ["leg", "leg", "legs"],
  ["fix", "position", "positions"],
  ["sensor", "sensor", "sensors"],
  ["cut", "cut", "cuts"],
  ["annotation", "annotation", "annotations"],
  ["sensor_observations", "set of sensor observations", "sets of sensor observations"],
];

/** The kind a pick is counted as: "track", "solution", "leg", "fix", "sensor", "cut", "annotation"… */
export function kindOfPick(index: OutlineIndex, pick: OutlinePick): string {
  if (pick.kind !== "feature") return pick.kind;
  const kind = pick.feature.properties.kind;
  return kind === "track" && index.solutions.has(pick.id) ? "solution" : kind;
}

/** Picks counted by kind, as the service names a step of several kinds: "3 tracks and 12 cuts", "2 tracks, 1 sensor and 40 cuts". */
export function kindsSaid(index: OutlineIndex, picks: readonly OutlinePick[]): string {
  const counts = new Map<string, number>();
  for (const p of picks) {
    const kind = kindOfPick(index, p);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [kind, one, many] of NOUNS) if (counts.get(kind)) parts.push(count(counts.get(kind)!, one, many));
  for (const [kind, n] of counts) if (!NOUNS.some(([k]) => k === kind)) parts.push(count(n, kind.replace(/_/g, " ")));
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** What a screen reader hears when the selection changes (the hint line's count, product owner, 28 Oct 2026): "3 tracks and 12 cuts selected". */
export function selectionSaid(index: OutlineIndex | undefined, picks: readonly OutlinePick[]): string {
  if (!index || !picks.length) return "Nothing selected";
  return `${kindsSaid(index, picks)} selected`;
}

// --- Hidden on map: three states ---------------------------------------------------------------

export type Visibility = "visible" | "hidden" | "mixed" | "none";

/** The hide button for the selection: its state, what pressing it does and to which features, and its tooltip. */
export interface VisibilityButton {
  state: Visibility;
  /** What pressing it does: hide all (all shown), show all (all hidden, or some of each); none when nothing selected can be hidden. */
  action?: "hide" | "show";
  /** The features it acts on: those selected that can be hidden. */
  ids: string[];
  /** How many of them are hidden now. */
  hidden: number;
  /** The rows left out, as they cannot be hidden (legs, positions). */
  ignored: number;
  /** aria-pressed: hidden on the map is pressed. */
  pressed: "true" | "false" | "mixed";
  /** The tooltip, and its reason when it cannot act. */
  title: string;
  /** The words a step and a toast use: "Hid 3 tracks and 12 cuts". */
  done?: string;
}

/** Whether a picked feature can be hidden: a cut, or a feature of a hideable kind. */
function hideable(p: OutlinePick): p is Extract<OutlinePick, { kind: "feature" | "cut" }> {
  if (p.kind === "cut") return true;
  return p.kind === "feature" && HIDEABLE_KINDS.has(p.feature.properties.kind);
}

const isHiddenFeature = (p: Extract<OutlinePick, { kind: "feature" | "cut" }>) => (p.kind === "cut" ? !!p.cut.properties.hidden : !!(p.feature.properties as { hidden?: boolean | null }).hidden);

/**
 * The hide button for the selection (product owner, 28 Oct 2026): all shown, all hidden, or
 * mixed; pressed when all are hidden, "mixed" when some are; pressing hides all when all are
 * shown and shows all otherwise. Rows that cannot be hidden are left out and the tooltip says so.
 */
export function selectionVisibility(index: OutlineIndex, picks: readonly OutlinePick[], readOnly = false): VisibilityButton {
  const can = picks.filter(hideable);
  const ignored = picks.length - can.length;
  const left = ignored ? ` ${kindsSaid(index, picks.filter((p) => !hideable(p)))} cannot be hidden and ${ignored === 1 ? "is" : "are"} left as ${ignored === 1 ? "it is" : "they are"}.` : "";
  if (!can.length) {
    const title = picks.length ? `Hide or show on the map: ${kindsSaid(index, picks)} cannot be hidden. Select tracks, solutions, sensors, cuts or annotations.` : "Hide or show on the map: select what to hide or show first.";
    return { state: "none", ids: [], hidden: 0, ignored, pressed: "false", title };
  }
  const ids = can.map((p) => p.id);
  const hidden = can.filter(isHiddenFeature).length;
  const what = kindsSaid(index, can);
  const ro = readOnly ? " An earlier revision is shown read-only." : "";
  if (hidden === 0) return { state: "visible", action: readOnly ? undefined : "hide", ids, hidden, ignored, pressed: "false", title: `Shown on the map: hide ${what}.${left}${ro}`, done: `Hid ${what}` };
  if (hidden === can.length) return { state: "hidden", action: readOnly ? undefined : "show", ids, hidden, ignored, pressed: "true", title: `Hidden on the map: show ${what}.${left}${ro}`, done: `Showed ${what}` };
  return {
    state: "mixed",
    action: readOnly ? undefined : "show",
    ids,
    hidden,
    ignored,
    pressed: "mixed",
    title: `${hidden.toLocaleString("en-GB")} of ${what} hidden on the map: show them all.${left}${ro}`,
    done: `Showed ${what}`,
  };
}

// --- Colour ----------------------------------------------------------------------------------------

/** Whether a picked row has a colour to set: a track or solution, a sensor, a cut, an annotation but chart furniture. */
function colourable(p: OutlinePick): p is Extract<OutlinePick, { kind: "feature" | "cut" }> {
  if (p.kind === "cut") return true;
  if (p.kind !== "feature") return false;
  const props = p.feature.properties as { kind: string; furniture?: unknown };
  return props.kind === "track" || props.kind === "sensor" || (props.kind === "annotation" && !props.furniture);
}

/** A row's colour now, as drawn: a track's style, a sensor's or a cut's own (else its sensor's), an annotation's appearance. */
export function colourOf(index: OutlineIndex, p: OutlinePick): string | undefined {
  if (p.kind === "cut") return p.cut.properties.colour ?? (index.sensors.get(p.sensor)?.sensor.properties.colour as string | undefined);
  if (p.kind !== "feature") return undefined;
  const props = p.feature.properties as { kind: string; colour?: string; style?: { colour?: string } | null; appearance?: { colour?: string } | null };
  if (props.kind === "track") return props.style?.colour ?? undefined;
  if (props.kind === "sensor") return props.colour;
  if (props.kind === "annotation") return props.appearance?.colour ?? undefined;
  return undefined;
}

/** The colour button for the selection: the features it colours, the colour they share (if they do), its tooltip, and why not. */
export interface ColourButton {
  ids: string[];
  enabled: boolean;
  /** The colour all of them have, if they share one. */
  current?: string;
  /** What it colours, counted: "3 tracks and 12 cuts". */
  what?: string;
  title: string;
  reason?: string;
}

export function selectionColour(index: OutlineIndex, picks: readonly OutlinePick[], readOnly = false): ColourButton {
  const can = picks.filter(colourable);
  if (!can.length) {
    const reason = picks.length ? `Nothing selected has a colour: ${kindsSaid(index, picks)} ${picks.length === 1 ? "has" : "have"} none. Select tracks, solutions, sensors, cuts or annotations.` : "Select something with a colour first: tracks, solutions, sensors, cuts or annotations.";
    return { ids: [], enabled: false, title: `Colour: ${reason}`, reason };
  }
  if (readOnly) return { ids: can.map((p) => p.id), enabled: false, title: "Colour: an earlier revision is shown read-only.", reason: "An earlier revision is shown read-only." };
  const colours = new Set(can.map((p) => colourOf(index, p)));
  const current = colours.size === 1 ? [...colours][0] : undefined;
  const ignored = picks.length - can.length;
  const left = ignored ? ` ${kindsSaid(index, picks.filter((p) => !colourable(p)))} ${ignored === 1 ? "has" : "have"} no colour and ${ignored === 1 ? "is" : "are"} left as ${ignored === 1 ? "it is" : "they are"}.` : "";
  const what = kindsSaid(index, can);
  return { ids: can.map((p) => p.id), enabled: true, ...(current && { current }), what, title: `Colour ${what}…${left}` };
}

/** A colour as typed: "#E01C3E", "e01c3e" or "#e1c" as the service wants it, lower-case #rrggbb; undefined if it is not one. */
export function hexColour(text: string): string | undefined {
  const t = text.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`;
  if (/^[0-9a-f]{3}$/.test(t)) return `#${[...t].map((c) => c + c).join("")}`;
  return undefined;
}

// --- Select all, select children, clear --------------------------------------------------------------

/** The direct children of a row, as the Outline lists them (a sensor's cuts whole, though VS Code pages them): keys, in order. */
export function childrenOf(index: OutlineIndex, p: OutlinePick): string[] {
  if (p.kind === "leg") {
    const s = index.solutions.get(p.solution);
    if (!s) return [];
    const out: string[] = [];
    for (let i = s.bounds[p.leg - 1]; i < s.bounds[p.leg]; i++) out.push(fixKey(p.solution, i));
    return out;
  }
  if (p.kind !== "feature") return [];
  const s = index.solutions.get(p.id);
  if (s) return Array.from({ length: s.bounds.length - 1 }, (_, k) => legKey(p.id, k + 1));
  const kind = p.feature.properties.kind;
  if (kind === "sensor") return (index.sensors.get(p.id)?.cuts ?? []).map((c) => c.id);
  if (kind === "track") return [...index.sensors.values()].filter((e) => e.sensor.properties.host_track_id === p.id).map((e) => e.sensor.id);
  return [];
}

/** Select children for the selection: the direct children of every row selected, in order; and the rows to open so they are listed. */
export function selectionChildren(index: OutlineIndex, picks: readonly OutlinePick[]): { keys: string[]; parents: string[]; title: string; reason?: string } {
  const keys: string[] = [];
  const seen = new Set<string>();
  const parents: string[] = [];
  for (const p of picks) {
    const children = childrenOf(index, p);
    if (!children.length) continue;
    parents.push(p.kind === "feature" ? p.id : p.kind === "leg" ? legKey(p.solution, p.leg) : "");
    for (const k of children) if (!seen.has(k)) seen.add(k), keys.push(k);
  }
  if (!keys.length) {
    const reason = picks.length ? `${kindsSaid(index, picks)} ${picks.length === 1 ? "has" : "have"} no children. A track opens to its sensors, a sensor to its cuts, a solution to its legs and a leg to its positions.` : "Select a track, a sensor, a solution or a leg first.";
    return { keys, parents, title: `Select children: ${reason}`, reason };
  }
  const children = keys.map((k) => pickOfKey(index, k)).filter((x): x is OutlinePick => !!x);
  return { keys, parents: parents.filter(Boolean), title: `Select children: ${kindsSaid(index, children)}, in place of what is selected` };
}

/** A key's pick, for counting children (cuts, sensors, legs and positions). */
function pickOfKey(index: OutlineIndex, key: string): OutlinePick | undefined {
  const hash = key.lastIndexOf("#");
  if (hash > 0) {
    const m = /^#(leg|fix)(\d+)$/.exec(key.slice(hash));
    if (!m) return undefined;
    const solution = key.slice(0, hash);
    return m[1] === "leg" ? { kind: "leg", solution, leg: Number(m[2]) } : { kind: "fix", solution, index: Number(m[2]) };
  }
  const cut = index.cuts.get(key);
  if (cut) return { kind: "cut", id: key, cut: index.sensors.get(cut.sensor)!.cuts[cut.index], sensor: cut.sensor };
  const feature = index.byId.get(key) as PlotFeature | undefined;
  return feature ? ({ kind: "feature", id: key, feature } as OutlinePick) : undefined;
}

/** The toolbar's buttons, in order (the playground's toolbar, VS Code's title bar). */
export type ToolbarId = "visibility" | "colour" | "select-all" | "select-children" | "clear-selection";
export const TOOLBAR: ToolbarId[] = ["visibility", "colour", "select-all", "select-children", "clear-selection"];

/** A toolbar's roving focus: the button the keyboard goes to from one, for a key; undefined for a key the toolbar leaves alone. */
export function toolbarKey(at: number, length: number, key: string): number | undefined {
  if (length <= 0) return undefined;
  if (key === "ArrowRight" || key === "ArrowDown") return (at + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (at - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return undefined;
}
