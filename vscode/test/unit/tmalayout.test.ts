// Where the Bearings plot puts everything (webview/tmalayout.ts), split out of TmaControl.drawPlot
// (review, 7 Nov 2026, finding 10): the panes' boxes, the span, each axis kept, held, fitted or
// zoomed, and the Course/Speed pane's lines.
import type { TmaCut, TmaResidualRow, TmaSolutionRow } from "@debrief/schemas";
import { describe, expect, it } from "vitest";
import { DEFAULT_PANES, noZoom } from "../../webview/stackeddots.js";
import { layoutPanes, plotGeometry, type PlotInput } from "../../webview/tmalayout.js";

const T0 = Date.parse("2023-06-15T09:00:00.000Z");
const iso = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function rows(residuals: number[], bearing = (i: number) => 40 + i): TmaResidualRow[] {
  return residuals.map((residual, i) => ({ id: `cut-${i}`, sensor_id: "s", time: iso(i * 2), bearing: bearing(i), measured: bearing(i), calculated: bearing(i) - residual, residual }));
}

const SOLUTION: TmaSolutionRow = { id: "sol", name: "Solution", contact: "RED", cuts: 10, period: { start: iso(0), end: iso(18) }, times: [iso(0), iso(9), iso(18)], courses: [90, 90, 90], speeds: [5, 5, 5], colour: "#d62728" };

function input(over: Partial<PlotInput> = {}): PlotInput {
  const r = over.rows ?? rows([0.4, -0.2, 0.1, 0.3, -0.5, 0.2, 0, -0.1, 0.3, -0.3]);
  return {
    mode: "solution",
    width: 500,
    height: 300,
    label: 44,
    panes: { ...DEFAULT_PANES },
    rows: r,
    times: r.map((x) => Date.parse(x.time)),
    coverage: { rows: [], times: [], whole: [T0, T0 + 18 * 60_000] },
    zoom: noZoom(),
    live: false,
    hold: false,
    solution: SOLUTION,
    fixTimes: (SOLUTION.times ?? []).map(Date.parse),
    ownship: [],
    muted: "#888",
    perSecond: 3600 / 1852,
    cutOff: 3,
    ...over,
  };
}

describe("the panes side by side", () => {
  it("share the width after the time labels, with a gap between", () => {
    const laid = layoutPanes({ bearing: true, error: true, course: false }, true, 44, 500, 300);
    expect(laid.left).toBe(52);
    expect(laid.top).toBe(28);
    expect(laid.height).toBe(266);
    expect(laid.panes.map((p) => p.pane)).toEqual(["bearing", "error"]);
    const [a, b] = laid.panes;
    expect(a.w).toBe(b.w);
    expect(b.x - (a.x + a.w)).toBe(8);
    expect(b.x + b.w).toBe(500 - 4);
  });
  it("leave room below for the speeds with the Course/Speed pane, and keep their least sizes", () => {
    expect(layoutPanes({ bearing: true, error: true, course: true }, true, 44, 500, 300).height).toBe(246);
    const tiny = layoutPanes({ bearing: true, error: true, course: true }, true, 44, 60, 50);
    expect(tiny.height).toBe(40);
    expect(tiny.panes.every((p) => p.w === 20)).toBe(true);
  });
  it("draw no Error pane without a solution", () => {
    expect(layoutPanes({ bearing: true, error: true, course: false }, false, 44, 500, 300).panes.map((p) => p.pane)).toEqual(["bearing"]);
  });
});

describe("the plot's geometry", () => {
  it("spans the whole coverage unzoomed, with ticks up the left", () => {
    const g = plotGeometry(input());
    expect(g.span).toEqual([T0, T0 + 18 * 60_000]);
    expect(g.ticks.length).toBeGreaterThan(1);
    expect(g.ticks.every((t) => t >= g.span[0] && t <= g.span[1])).toBe(true);
    expect(g.seconds).toBe(false);
  });
  it("fits the Error axis about zero and the Bearing axis about the calculated bearings", () => {
    const g = plotGeometry(input());
    const axis = (p: string) => g.panes.find((q) => q.pane === p)!.range;
    expect(axis("error")[0]).toBeLessThanOrEqual(-0.5);
    expect(axis("error")[1]).toBeGreaterThanOrEqual(0.4);
    expect(axis("bearing")[0]).toBeLessThan(40);
    expect(axis("bearing")[1]).toBeGreaterThan(49);
    expect(g.reference).toBeCloseTo(45 - 0.2, 6); // the middle row's calculated bearing
    expect(g.cue.state).toBe("within");
    expect(g.off).toEqual({ others: 0, leftOut: 0 });
  });
  it("keeps the Bearing axis a drag began with, widened and never narrowed", () => {
    const first = plotGeometry(input({ live: true }));
    expect(first.frozen?.bearing).toEqual(first.ranges.bearing);
    // The drag moves the calculated bearings well to the right: the axis widens that side.
    const moved = rows([0, 0, 0, 0, 0, 0, 0, 0, 0, -30]);
    const second = plotGeometry(input({ live: true, frozen: first.frozen, rows: moved }));
    expect(second.ranges.bearing[0]).toBe(first.ranges.bearing[0]);
    expect(second.ranges.bearing[1]).toBeGreaterThan(79);
    expect(second.reference).toBe(first.reference);
    // Not dragging: fitted again, and the frozen axis left as it was for the caller.
    const after = plotGeometry(input({ frozen: second.frozen, rows: moved }));
    expect(after.frozen).toBe(second.frozen);
    expect(after.ranges.bearing).not.toEqual(second.ranges.bearing);
  });
  it("holds the Error axis with Hold scale, widened when an error falls outside it", () => {
    const held = plotGeometry(input({ hold: true }));
    expect(held.heldError).toEqual(held.ranges.error);
    const wider = plotGeometry(input({ hold: true, heldError: held.heldError, rows: rows([0, 0, 0, 0, 2, 0, 0, 0, 0, 0]) }));
    expect(wider.ranges.error[0]).toBe(held.ranges.error[0]);
    expect(wider.ranges.error[1]).toBeGreaterThan(2);
    const smaller = plotGeometry(input({ hold: true, heldError: wider.heldError, rows: rows([0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }));
    expect(smaller.ranges.error).toEqual(wider.ranges.error);
  });
  it("lets a zoom win over each axis, the speeds zoomed with the courses they share a pane with", () => {
    const panes = { bearing: true, error: true, course: true };
    const ownship = [{ id: "own", name: "BLUE ONE", colour: "#1f77b4", times: [T0, T0 + 18 * 60_000], courses: [10, 30], speeds: [4, 6] }];
    const whole = plotGeometry(input({ panes, ownship }));
    const course = whole.ranges.course;
    const half: [number, number] = [course[0], (course[0] + course[1]) / 2];
    expect(plotGeometry(input({ zoom: { time: [T0, T0 + 6 * 60_000], values: {} } })).span).toEqual([T0, T0 + 6 * 60_000]);
    const zoomed = plotGeometry(input({ panes, ownship, zoom: { values: { error: [-0.1, 0.1], course: half } } }));
    expect(zoomed.ranges.error).toEqual([-0.1, 0.1]);
    expect(zoomed.ranges.course).toEqual(half);
    expect(zoomed.speed[0]).toBeCloseTo(whole.speed[0], 9);
    expect(zoomed.speed[1]).toBeCloseTo((whole.speed[0] + whole.speed[1]) / 2, 9);
  });
  it("lists the Course/Speed pane's lines, ownship's and the solution's, each over the span", () => {
    const ownship = [{ id: "own", name: "BLUE ONE", colour: "#1f77b4", times: [T0, T0 + 18 * 60_000], courses: [10, 30], speeds: [4, 6] }];
    const g = plotGeometry(input({ panes: { bearing: true, error: true, course: true }, ownship }));
    expect(g.nothingToPlot).toBe(false);
    expect(g.courseShown?.series.map((s) => [s.name, s.role])).toEqual([
      ["BLUE ONE", "ownship"],
      ["Solution", "target"],
    ]);
    expect(g.courseShown?.series[0].courses).toEqual([10, 30]);
    expect(g.courseShown?.series[1].courses).toEqual([90, 90]);
    expect(g.series).toHaveLength(2);
  });
  it("says there is nothing to plot when no track has a course or speed", () => {
    const g = plotGeometry(input({ panes: { bearing: true, error: false, course: true }, solution: undefined }));
    expect(g.nothingToPlot).toBe(true);
    expect(g.courseShown).toEqual({ nothing: true, series: [] });
    expect(plotGeometry(input()).courseShown).toBeUndefined();
  });
  it("works the solution's courses out again from a drag's fixes", () => {
    const panes = { bearing: true, error: true, course: true };
    // Due north, a minute of latitude each nine minutes.
    const pending: [number, number][] = [
      [-4, 50],
      [-4, 50 + 1 / 60],
      [-4, 50 + 2 / 60],
    ];
    const g = plotGeometry(input({ panes, live: true, pending }));
    const [lo, hi] = g.courseShown!.series[0].courses!;
    expect(Math.abs(lo)).toBeLessThan(0.5);
    expect(Math.abs(hi)).toBeLessThan(0.5);
  });
  it("plots a sensor's cuts with no solution as coverage, about the first bearing", () => {
    const cuts: TmaCut[] = [0, 1, 2].map((i) => ({ id: `c${i}`, sensor_id: "s", time: iso(i), bearing: 350 + i * 10, ambiguous_bearing: i === 1 ? 200 : undefined }));
    const g = plotGeometry(input({ mode: "cuts", rows: [], times: [], solution: undefined, coverage: { rows: cuts, times: cuts.map((c) => Date.parse(c.time)), whole: [T0, T0 + 2 * 60_000] } }));
    expect(g.panes.map((p) => p.pane)).toEqual(["bearing"]);
    expect(g.reference).toBe(350);
    // 350° to 10° unwrapped about 350, and the ambiguous cut's other bearing taken in.
    expect(g.ranges.bearing[0]).toBeLessThan(200);
    expect(g.ranges.bearing[1]).toBeGreaterThan(370);
  });
});
