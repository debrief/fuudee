/**
 * The Outline as a tree, and the Tools' entries for its selection (product owner, 27 Oct 2026):
 * the rows of open branches with their place for a screen reader, kept while virtualised; the
 * keys and clicks of a WAI-ARIA tree; what a TMA solution's legs and fixes and a sensor's cuts
 * say; what Bearings shows for a selection; each Tools entry shown when it applies, or disabled
 * with its reason; and splitting before or after a fix held to schemas/vectors/tma-legs.json.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { flatten, rangeKeys, rowsInWindow, treeClick, treeKey, type TreeNode } from "../../webview/outlinetree.js";
import {
  ancestorsOf,
  bearingsFor,
  bearingsTitle,
  cutRow,
  exclusionTarget,
  featureIdsOfPicks,
  fixKey,
  fixRow,
  legKey,
  legRow,
  outlineChoice,
  outlineIndex,
  outlineOperations,
  pickOf,
  splitPlace,
  tmaRequestOf,
  type OutlinePick,
} from "../../webview/outlinemodel.js";
import { splitAtFix } from "../../webview/tma.js";
import { panesDrawn } from "../../webview/stackeddots.js";

// --- The tree ---------------------------------------------------------------------------------

const leaf = (key: string): TreeNode<string> => ({ key, data: key, branch: false });
const branch = (key: string, children: TreeNode<string>[]): TreeNode<string> => ({ key, data: key, branch: true, children: () => children });
const cuts = Array.from({ length: 5000 }, (_, i) => leaf(`cut-${i}`));
const roots = [branch("track", [branch("sensor", cuts)]), branch("solution", [branch("leg1", [leaf("f0"), leaf("f1")]), branch("leg2", [leaf("f2"), leaf("f3")])]), leaf("note")];

describe("the Outline's tree", () => {
  it("lists the rows of open branches only, each with its level, place and how many share it", () => {
    const closed = flatten(roots, new Set());
    expect(closed.map((r) => r.key)).toEqual(["track", "solution", "note"]);
    expect(closed.map((r) => [r.level, r.posinset, r.setsize])).toEqual([[1, 1, 3], [1, 2, 3], [1, 3, 3]]);
    const open = flatten(roots, new Set(["track", "sensor", "solution", "leg2"]));
    expect(open.length).toBe(3 + 1 + 5000 + 2 + 2);
    const cut = open.find((r) => r.key === "cut-4321")!;
    expect([cut.level, cut.posinset, cut.setsize]).toEqual([3, 4322, 5000]);
    expect(open[cut.parent].key).toBe("sensor");
    expect(open.find((r) => r.key === "f3")).toMatchObject({ level: 3, posinset: 2, setsize: 2 });
    expect(open.find((r) => r.key === "leg1")).toMatchObject({ expanded: false, level: 2 });
  });

  it("puts only the rows in sight in the page, and the row with the keyboard wherever it is", () => {
    expect(rowsInWindow(0, 220, 22, 400, 0)).toHaveLength(400); // a plot's features and a few hundred cuts: drawn whole
    const window = rowsInWindow(22 * 1000, 220, 22, 5000, 4900, 5);
    expect(window[0]).toBe(995);
    expect(window).toContain(1015);
    expect(window).not.toContain(1100);
    expect(window[window.length - 1]).toBe(4900);
    expect(window.length).toBeLessThan(40);
    expect(rowsInWindow(0, 400, 22, 0, -1)).toEqual([]);
  });

  it("moves with the arrows, opens and closes with Right and Left, and extends with Shift", () => {
    const rows = flatten(roots, new Set(["track", "sensor"]));
    expect(treeKey(rows, 0, 0, [], { key: "ArrowDown" })).toEqual({ focus: 1, anchor: 1 });
    expect(treeKey(rows, 0, 0, [], { key: "ArrowUp" })).toEqual({ focus: 0, anchor: 0 });
    // Right on an open branch goes into it; on a closed one opens it; Left goes back to the parent.
    expect(treeKey(rows, 0, 0, [], { key: "ArrowRight" })).toEqual({ focus: 1, anchor: 1 });
    const solution = rows.findIndex((r) => r.key === "solution");
    expect(treeKey(rows, solution, solution, [], { key: "ArrowRight" })).toMatchObject({ open: "solution" });
    expect(treeKey(rows, 0, 0, [], { key: "ArrowLeft" })).toMatchObject({ close: "track" });
    expect(treeKey(rows, 5, 5, [], { key: "ArrowLeft" })).toEqual({ focus: 1, anchor: 1 });
    // Shift with the arrows: the cuts from the anchor, a range.
    const extended = treeKey(rows, 4, 2, [], { key: "ArrowDown", shift: true })!;
    expect(extended.select).toEqual(["cut-0", "cut-1", "cut-2", "cut-3"]);
    expect(treeKey(rows, 2, 2, [], { key: "End" })!.focus).toBe(rows.length - 1);
    expect(treeKey(rows, 2, 2, [], { key: "PageDown" }, 10)!.focus).toBe(12);
    // Enter selects; Ctrl adds or takes away; Shift the range from the anchor.
    expect(treeKey(rows, 3, 3, ["cut-0"], { key: "Enter" })!.select).toEqual(["cut-1"]);
    expect(treeKey(rows, 3, 3, ["cut-0"], { key: " ", ctrl: true })!.select).toEqual(["cut-0", "cut-1"]);
    expect(treeKey(rows, 3, 3, ["cut-0", "cut-1"], { key: "Enter", ctrl: true })!.select).toEqual(["cut-0"]);
    expect(treeKey(rows, 5, 2, [], { key: "Enter", shift: true })!.select).toEqual(rangeKeys(rows, 2, 5));
    expect(treeKey(rows, 2, 2, [], { key: "a", ctrl: true })!.select!.length).toBe(rows.length);
    // Tab, and any other key, is the page's: the keyboard is never trapped.
    expect(treeKey(rows, 2, 2, [], { key: "Tab" })).toBeUndefined();
  });

  it("selects by click, adds with Ctrl, and takes a range with Shift", () => {
    const rows = flatten(roots, new Set(["track", "sensor"]));
    expect(treeClick(rows, 4, -1, [], {}).select).toEqual(["cut-2"]);
    expect(treeClick(rows, 6, 4, ["cut-2"], { shift: true }).select).toEqual(["cut-2", "cut-3", "cut-4"]);
    expect(treeClick(rows, 6, 4, ["cut-2"], { ctrl: true }).select).toEqual(["cut-2", "cut-4"]);
  });
});

// --- What the rows say, and what the Tools offer ------------------------------------------------

const T = (hhmm: string) => `2026-10-11T${hhmm}:00.000Z`;
const cut = (id: string, time: string, bearing: number, more: Record<string, unknown> = {}) => ({
  type: "Feature",
  id,
  geometry: null,
  properties: { kind: "sensor_cut", sensor_id: "sensor-ta", time, bearing: { value: bearing, unit: "deg" }, ...more },
});
const solutionTimes = ["09:00", "09:01", "09:02", "09:03", "09:04", "09:05", "09:06", "09:07"].map(T);
const plot = {
  type: "FeatureCollection",
  schema_version: "0.0.24",
  provenance: [],
  features: [
    { type: "Feature", id: "track-blue", geometry: { type: "LineString", coordinates: [[0, 0], [0.2, 0]] }, properties: { kind: "track", name: "BLUE ONE", times: [T("08:59"), T("09:10")], courses: { unit: "deg", values: [90, 90] } } },
    { type: "Feature", id: "sensor-ta", geometry: null, properties: { kind: "sensor", name: "Towed array", host_track_id: "track-blue", colour: "#8a3ffc" } },
    cut("cut-1", T("09:00"), 45, { ambiguous_bearing: { value: 135, unit: "deg" } }),
    cut("cut-2", T("09:01"), 46, { ambiguous_bearing: { value: 134, unit: "deg" }, resolved: "ambiguous_bearing" }),
    cut("cut-3", T("09:02"), 47, { range: { value: 2000, unit: "[yd_i]" } }),
    cut("cut-4", T("09:03"), 48, { hidden: true }),
    {
      type: "Feature",
      id: "track-contact-1",
      geometry: { type: "LineString", coordinates: solutionTimes.map((_, i) => [0.1 + i * 0.001, 0.1]) },
      properties: {
        kind: "track",
        name: "Contact 1 solution",
        times: solutionTimes,
        courses: { unit: "deg", values: solutionTimes.map(() => 90) },
        speeds: { unit: "[kn_i]", values: solutionTimes.map(() => 6) },
        tma: { contact: "Contact 1", sensor_ids: ["sensor-ta"], cut_ids: ["cut-1", "cut-2", "cut-3", "cut-4"], period: { start: T("09:00"), end: T("09:07") }, leg_starts: [T("09:04")], excluded_cut_ids: ["cut-3"] },
      },
    },
  ],
} as unknown as DebriefFeatureCollection;

const index = outlineIndex(plot);
const picks = (...keys: string[]) => keys.map((k) => pickOf(index, k)!);
const ops = (keys: string[], more: { shownSolution?: string; readOnly?: boolean } = {}) => outlineOperations({ index, picks: picks(...keys), window: { start: Date.parse(T("09:00")), end: Date.parse(T("09:02")) }, ...more });
const op = (keys: string[], id: string, more = {}) => ops(keys, more).find((o) => o.id === id);

describe("what the Outline's rows say", () => {
  it("a solution's legs and their positions: time, course and speed", () => {
    const s = index.solutions.get("track-contact-1")!;
    expect(s.bounds).toEqual([0, 4, 8]);
    expect(legRow(s, 2)).toMatchObject({ name: "Leg 2", detail: "09:04:00Z–09:07:00Z · 4 fixes · 090.0°T 6.0 kn", fixes: 4 });
    expect(legRow(s, 1).label).toBe("Leg 1 of 2, 09:00:00Z–09:03:00Z, 4 fixes, 090.0°T 6.0 kn");
    expect(fixRow(s, 5)).toEqual({ name: "09:05:00Z", detail: "090.0°T 6.0 kn", label: "Position at 09:05:00Z, 090.0°T 6.0 kn" });
  });

  it("a cut: its bearing with the other side, the side kept, its range, and whether it is hidden", () => {
    const entry = index.sensors.get("sensor-ta")!;
    const [first, second, third, fourth] = entry.cuts;
    expect(cutRow(entry, first)).toMatchObject({ name: "09:00:00Z", detail: "≈ 045.0° port / 135.0° stbd", ambiguous: true });
    expect(cutRow(entry, first).label).toBe("Cut at 09:00:00Z, 045.0° to port or 135.0° to starboard, not yet resolved");
    expect(cutRow(entry, second).detail).toBe("134.0° stbd kept");
    expect(cutRow(entry, third).detail).toBe("047.0° · 2000 yd");
    expect(cutRow(entry, fourth)).toMatchObject({ detail: "048.0° · hidden on map", hidden: true });
  });

  it("names legs and fixes by their solution, and finds the rows above a cut or a fix", () => {
    expect(pickOf(index, legKey("track-contact-1", 2))).toEqual({ kind: "leg", solution: "track-contact-1", leg: 2 });
    expect(pickOf(index, fixKey("track-contact-1", 9))).toBeUndefined();
    expect(pickOf(index, "nothing")).toBeUndefined();
    expect(featureIdsOfPicks(picks(fixKey("track-contact-1", 1), legKey("track-contact-1", 2), "cut-1"))).toEqual(["track-contact-1", "cut-1"]);
    expect(ancestorsOf(index, "cut-3")).toEqual(["track-blue", "sensor-ta"]);
    expect(ancestorsOf(index, fixKey("track-contact-1", 5))).toEqual(["track-contact-1", legKey("track-contact-1", 2)]);
  });
});

describe("Bearings follows the Outline's selection", () => {
  it("shows the solution for it, a leg or a fix; the sensor's coverage for it or its cuts; nothing new for the unrelated", () => {
    expect(bearingsFor(index, picks(fixKey("track-contact-1", 6)))).toEqual({ solution: "track-contact-1", fix: 6 });
    expect(bearingsFor(index, picks(legKey("track-contact-1", 1)))).toEqual({ solution: "track-contact-1", leg: 1 });
    expect(bearingsFor(index, picks("track-contact-1"))).toEqual({ solution: "track-contact-1" });
    expect(bearingsFor(index, picks("sensor-ta"))).toEqual({ sensor: "sensor-ta" });
    expect(bearingsFor(index, picks("cut-2", "cut-3"))).toEqual({ sensor: "sensor-ta" });
    // Cuts of the solution's sensors keep it shown, as a dot clicked in its plot does.
    expect(bearingsFor(index, picks("cut-2"), "track-contact-1")).toEqual({ solution: "track-contact-1" });
    expect(bearingsFor(index, picks("track-blue"))).toBeUndefined();
  });

  it("says what is shown in one line", () => {
    expect(bearingsTitle(index, { solution: "track-contact-1", fix: 5 })).toBe("Contact 1 solution · leg 2 of 2 · fix at 09:05:00Z");
    expect(bearingsTitle(index, { solution: "track-contact-1", leg: 1 })).toBe("Contact 1 solution · leg 1 of 2");
    expect(bearingsTitle(index, { solution: "track-contact-1" })).toBe("Contact 1 solution · 2 legs, 4 cuts");
    expect(bearingsTitle(index, { sensor: "sensor-ta" })).toBe("Towed array on BLUE ONE · 4 cuts, 1 ambiguous");
    expect(bearingsTitle(index, undefined)).toBe("");
  });

  it("draws no Error pane without a solution, and one pane at least", () => {
    expect(panesDrawn({ bearing: true, error: true, course: false }, false)).toEqual(["bearing"]);
    expect(panesDrawn({ bearing: false, error: true, course: false }, false)).toEqual(["bearing"]);
    expect(panesDrawn({ bearing: true, error: true, course: true }, true)).toEqual(["bearing", "error", "course"]);
  });
});

describe("the Tools' entries for the Outline's selection", () => {
  it("offers nothing for a selection they do not act on", () => {
    expect(ops(["track-blue"])).toEqual([]);
    expect(ops([])).toEqual([]);
  });

  it("splits before or after one position, or says why not", () => {
    expect(op([fixKey("track-contact-1", 2)], "split-before")).toMatchObject({ enabled: true, label: "Split before 09:02:00Z" });
    expect(op([fixKey("track-contact-1", 1)], "split-after")).toMatchObject({ enabled: true, label: "Split after 09:01:00Z" });
    expect(op([fixKey("track-contact-1", 4)], "split-before")).toMatchObject({ enabled: false, reason: "The fix at 09:04:00Z is already the first of leg 2." });
    expect(op([fixKey("track-contact-1", 3)], "split-after")).toMatchObject({ enabled: false, reason: "The fix at 09:03:00Z is already the last of leg 1." });
    expect(op([fixKey("track-contact-1", 7)], "split-after")?.reason).toBe("The fix at 09:07:00Z is the solution's last.");
    expect(op([fixKey("track-contact-1", 1)], "split-before")?.reason).toBe("Leg 1 would keep 1 fix before the split and 3 fixes after it: each leg needs two.");
    expect(op(["track-contact-1"], "split-before")?.reason).toMatch(/^Select one position/);
    expect(op([fixKey("track-contact-1", 1), fixKey("track-contact-1", 2)], "split-after")?.reason).toBe("Select one position only.");
  });

  it("splits the solution at a cut's time, as at its position then, or says why not", () => {
    expect(op(["cut-3"], "split-before")).toMatchObject({ enabled: true, label: "Split before this cut (09:02:00Z)" });
    expect(op(["cut-2"], "split-after")).toMatchObject({ enabled: true, label: "Split after this cut (09:01:00Z)" });
    expect(op(["cut-1"], "split-after")?.reason).toBe("Leg 1 would keep 1 fix before the split and 3 fixes after it: each leg needs two.");
    expect(op(["cut-1", "cut-2"], "split-before")?.reason).toBe("Select one position or one cut only.");
    // A cut between positions, in no solution: the solution Bearings shows, at the position after it (before) or before it (after).
    const between = { kind: "cut" as const, id: "cut-x", sensor: "sensor-ta", cut: cut("cut-x", "2026-10-11T09:02:30.000Z", 50) } as unknown as OutlinePick;
    expect(splitPlace({ index, picks: [between] }, "before")).toBe("Show the TMA solution to split in Bearings.");
    expect(splitPlace({ index, picks: [between], shownSolution: "track-contact-1" }, "before")).toEqual({ solution: "track-contact-1", index: 3 });
    expect(splitPlace({ index, picks: [between], shownSolution: "track-contact-1" }, "after")).toEqual({ solution: "track-contact-1", index: 2 });
  });

  it("keeps a side, leaves out, hides, shows and deletes cuts, each disabled with its reason when it cannot", () => {
    const ids = ops(["cut-1", "cut-2", "cut-3"]).map((o) => o.id);
    expect(ids).toEqual(["tma-from-cuts", "split-before", "split-after", "keep-port", "keep-starboard", "keep-ambiguous", "leave-out", "count-in", "hide-cuts", "show-cuts", "delete-cuts"]);
    expect(op(["cut-3"], "keep-port")).toMatchObject({ enabled: false, reason: "None of these cuts has two bearings." });
    expect(op(["cut-1"], "keep-ambiguous")?.reason).toBe("None of these cuts has a side kept.");
    expect(op(["cut-2"], "keep-ambiguous")?.enabled).toBe(true);
    expect(op(["cut-3"], "leave-out")).toMatchObject({ label: "Leave out of Contact 1 solution", enabled: false, reason: "They are left out of Contact 1 solution already." });
    expect(op(["cut-3"], "count-in")?.enabled).toBe(true);
    expect(op(["cut-4"], "hide-cuts")?.reason).toBe("They are hidden already.");
    expect(op(["cut-1"], "show-cuts")?.reason).toBe("None of them is hidden.");
    expect(op(["cut-1", "cut-2"], "delete-cuts")).toMatchObject({ label: "Delete 2 cuts", enabled: true });
    expect(op(["cut-1"], "delete-cuts", { readOnly: true })).toMatchObject({ enabled: false, reason: "An earlier revision is shown read-only." });
  });

  it("acts on the solution Bearings shows, else the only one, else asks", () => {
    const entry = index.sensors.get("sensor-ta")!;
    expect(exclusionTarget(index, [entry.cuts[0]])).toEqual({ solution: "track-contact-1", candidates: ["track-contact-1"] });
    expect(exclusionTarget(index, [entry.cuts[0]], "other")).toEqual({ solution: "track-contact-1", candidates: ["track-contact-1"] });
  });

  it("makes a solution of the cuts selected, or of the sensor's cuts in the time window", () => {
    const made = tmaRequestOf({ index, picks: picks("cut-3", "cut-1") });
    expect(typeof made !== "string" && made.request).toEqual({ cut_ids: ["cut-1", "cut-3"] });
    expect(typeof made !== "string" && made.what).toBe("2 cuts 09:00:00Z–09:02:00Z");
    const window = tmaRequestOf({ index, picks: picks("sensor-ta"), window: { start: Date.parse(T("09:00")), end: Date.parse(T("09:05")) } });
    expect(typeof window !== "string" && window.request).toEqual({ sensor_ids: ["sensor-ta"], period: { start: T("09:00"), end: T("09:05") } });
    expect(typeof window !== "string" && window.cuts.length).toBe(3); // the hidden one left out
    expect(tmaRequestOf({ index, picks: picks("cut-4") })).toBe("These cuts are all hidden on the map, so none would count: show them first.");
    expect(tmaRequestOf({ index, picks: picks("cut-1") })).toBe("Select cuts at two times or more: a solution needs two fixes.");
    expect(op(["sensor-ta"], "tma-from-cuts")?.label).toBe("TMA solution from 3 cuts of Towed array in the time window…");
  });

  it("chooses for a walkthrough's step: a cut at a time, a period's cuts, a position", () => {
    expect(outlineChoice(index, "sensor-ta", { cut_time: T("09:01") })).toEqual(["cut-2"]);
    expect(outlineChoice(index, "sensor-ta", { period: { start: T("09:01"), end: T("09:02") } })).toEqual(["cut-2", "cut-3"]);
    expect(outlineChoice(index, "track-contact-1", { fix_time: T("09:05") })).toEqual([fixKey("track-contact-1", 5)]);
    expect(outlineChoice(index, "track-contact-1", { cut_time: T("09:02") })).toEqual(["cut-3"]);
    expect(outlineChoice(index, "sensor-ta", { period: { start: T("10:00"), end: T("11:00") } })).toBe("There are no cuts in that period.");
    expect(outlineChoice(index, "nothing")).toBe("That is not in this plot.");
  });
});

describe("splitting before or after a fix, held to the shared vectors", () => {
  const vectors = JSON.parse(readFileSync(path.resolve(__dirname, "../../../schemas/vectors/tma-legs.json"), "utf8")) as {
    fixes: string[];
    cases: { name: string; leg_starts: string[]; index: number; side: "before" | "after"; leg_start?: string; refused?: string; leg: number; before?: number; after?: number }[];
  };
  const times = vectors.fixes.map((t) => Date.parse(t));
  for (const c of vectors.cases) {
    it(c.name, () => {
      const found = splitAtFix(times, c.leg_starts.map((t) => Date.parse(t)), c.index, c.side);
      expect(found.leg).toBe(c.leg);
      if (c.refused) expect("refused" in found && found.refused).toBe(c.refused);
      else expect("first" in found && new Date(times[found.first]).toISOString()).toBe(c.leg_start);
      if (c.before !== undefined) expect([found.before, found.after]).toEqual([c.before, c.after]);
    });
  }
});

export type { OutlinePick };
