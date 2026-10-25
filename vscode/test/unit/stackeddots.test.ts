/**
 * The Bearings view's plot as legacy's Bearing Residuals (Stacked Dots) laid it out (product
 * owner, 25 Oct 2026): time up the left, the panes side by side; the time span the sensors'
 * whole coverage; the Error axis fitted every frame, or held and widened, never a dot pinned at
 * an edge; the pink and green cut-off; zoom; pointing at a dot; ownship's and the solution's
 * course and speed; which panes show.
 */
import { describe, expect, it } from "vitest";
import type { DebriefFeatureCollection, TmaResidualRow } from "@debrief/schemas";
import { DEFAULT_SETTINGS } from "@debrief/kernel";
import { contrast, parseColour, type Rgb } from "../../webview/contrast.js";
import { travel, type LonLat } from "../../webview/geodesic.js";
import {
  about,
  coverageSpan,
  cueMark,
  cueStyle,
  DEFAULT_PANES,
  describeCue,
  errorCue,
  errorExtent,
  fitErrors,
  fitRange,
  inside,
  isZoomed,
  legCourses,
  LEAST_SPAN_MS,
  localCourse,
  describeOffScale,
  offScale,
  nearestPoint,
  niceTicks,
  noZoom,
  panTime,
  readPanes,
  tickTime,
  timeTicks,
  timeToY,
  togglePane,
  valueToX,
  widen,
  xToValue,
  yToTime,
  zoomBox,
  zoomTime,
  zoomValues,
} from "../../webview/stackeddots.js";
import { coverageOf, keepsSolution, OWNSHIP_MOST, ownshipOf, tmaSolutionRows } from "../../webview/tma.js";

const row = (time: string, residual: number | undefined, more: Partial<TmaResidualRow> = {}): TmaResidualRow => ({
  id: `c-${time}`,
  sensor_id: "s",
  time,
  bearing: 45,
  ...(residual !== undefined && { residual, measured: 45, calculated: 45 - residual }),
  ...more,
});

describe("time runs up the left (legacy's PlotOrientation.HORIZONTAL)", () => {
  const span: [number, number] = [1000, 2000];
  it("puts the span's start at the bottom and its end at the top", () => {
    expect(timeToY(1000, span, 10, 100)).toBe(110);
    expect(timeToY(2000, span, 10, 100)).toBe(10);
    expect(timeToY(1500, span, 10, 100)).toBe(60);
    // Later is higher.
    expect(timeToY(1600, span, 10, 100)).toBeLessThan(timeToY(1400, span, 10, 100));
  });
  it("reads a height back as its time, and a place across a pane as its value", () => {
    for (const t of [1000, 1234, 2000]) expect(yToTime(timeToY(t, span, 10, 100), span, 10, 100)).toBeCloseTo(t, 9);
    expect(valueToX(-5, [-5, 5], 20, 100)).toBe(20);
    expect(valueToX(5, [-5, 5], 20, 100)).toBe(120);
    expect(xToValue(70, [-5, 5], 20, 100)).toBe(0);
  });
  it("ticks whole minutes or seconds, and writes them short", () => {
    const t0 = Date.parse("2026-10-25T09:00:10Z");
    const ticks = timeTicks(t0, t0 + 3600_000, 6);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.every((t) => t % 60_000 === 0)).toBe(true);
    expect(tickTime(Date.parse("2026-10-25T09:30:00Z"), false, DEFAULT_SETTINGS)).toBe("09:30Z");
    expect(tickTime(Date.parse("2026-10-25T09:30:15Z"), true, DEFAULT_SETTINGS)).toBe("09:30:15Z");
    expect(niceTicks(-0.4, 0.4, 4)).toEqual([-0.4, -0.2, 0, 0.2, 0.4]);
    expect(niceTicks(50, 300, 5)).toEqual([50, 100, 150, 200, 250, 300]);
  });
});

describe("the time span: the sensors' whole coverage (product owner, 25 Oct 2026)", () => {
  it("runs from the first cut shown to the last, rooted or not, and over the solution's period", () => {
    const coverage = [100_000, 200_000, 900_000];
    const rooted = [300_000, 400_000];
    expect(coverageSpan(coverage, rooted, [250_000, 450_000])).toEqual([100_000, 900_000]);
    // The solution's period alone, or the rooted cuts alone, where that is all there is.
    expect(coverageSpan([], rooted)).toEqual([300_000, 400_000]);
    expect(coverageSpan(undefined, [], undefined)).toBeUndefined();
    // A single time: a minute either side, so it has a height.
    expect(coverageSpan([500_000])).toEqual([440_000, 560_000]);
  });
  it("lists the solution's sensors' cuts shown on the map, rooted or not, not the hidden ones", () => {
    const plot = samplePlot();
    const coverage = coverageOf(plot, "solution");
    expect(coverage.map((c) => c.id)).toEqual(["cut-0", "cut-1", "cut-3", "cut-4"]);
    expect(coverage.every((c) => c.sensor === "Bow" && c.colour === "#1f77b4")).toBe(true);
    // Its ambiguous pair kept as listed.
    expect(coverage.find((c) => c.id === "cut-4")).toMatchObject({ bearing: 10, ambiguous_bearing: 100 });
  });
});

describe("the Error axis: fitted every frame, or held and widened, never clamped", () => {
  const rows = [row("2026-10-25T09:00:00Z", 2), row("2026-10-25T09:01:00Z", -1), row("2026-10-25T09:02:00Z", 50, { hidden: true }), row("2026-10-25T09:03:00Z", 0.5, { other_residual: -8 })];
  const times = rows.map((r) => Date.parse(r.time));
  it("fits the errors counted, zero included, as legacy's charts fitted theirs", () => {
    const extent = errorExtent([...rows, row("2026-10-25T09:04:00Z", 30, { excluded: true })], [...times, Date.parse("2026-10-25T09:04:00Z")]);
    // Counted only (product owner, 25 Oct 2026): not hidden, not left out, not an unresolved pair's other bearing.
    expect(extent).toEqual({ lo: -1, hi: 2 });
    const range = fitErrors(extent);
    expect(range[0]).toBeLessThan(-1);
    expect(range[1]).toBeGreaterThan(2);
    // The other bearing and the cut left out, off that axis, said as such.
    const off = offScale([...rows, row("2026-10-25T09:04:00Z", 30, { excluded: true })], [...times, Date.parse("2026-10-25T09:04:00Z")], range);
    expect(off).toEqual({ others: 1, leftOut: 1 });
    expect(describeOffScale(off)).toBe("1 other bearing and 1 left out off scale");
    expect(describeOffScale({ others: 3, leftOut: 0 })).toBe("3 other bearings off scale");
    expect(describeOffScale({ others: 0, leftOut: 0 })).toBe("");
    // All positive: zero still shown, as legacy's 0 to 55.
    expect(fitRange(10, 55, { includeZero: true })[0]).toBeLessThan(0);
    // Within a period (a zoom): only its errors.
    expect(errorExtent(rows, times, [times[0], times[1]])).toEqual({ lo: -1, hi: 2 });
  });
  it("re-fits as the errors shrink: a fitted solution's errors fill the pane", () => {
    const early = fitErrors({ lo: 0, hi: 55 });
    const late = fitErrors({ lo: -0.4, hi: 0.4 });
    expect(late[1] - late[0]).toBeLessThan(1);
    expect(early[1] - early[0]).toBeGreaterThan(50);
  });
  it("held, stays put while every error is inside, and widens on the side one falls outside", () => {
    const held: [number, number] = [-2, 2];
    expect(widen(held, { lo: -1, hi: 1.5 })).toBe(held);
    const wider = widen(held, { lo: -1, hi: 5 });
    expect(wider[0]).toBe(-2);
    expect(wider[1]).toBeGreaterThan(5);
    const both = widen(held, { lo: -9, hi: 3 });
    expect(both[0]).toBeLessThan(-9);
    expect(both[1]).toBeGreaterThan(3);
    // Never clamped: every error inside the axis drawn.
    for (const v of [-9, 3, 0]) expect(inside(v, both)).toBe(true);
  });
});

describe("the cut-off: green within, pink beyond (legacy's calculateErrorShadeFor)", () => {
  it("holds the largest error counted to the cut-off: left out, hidden and the other of a pair are not counted", () => {
    const rows = [row("t1", 1.2), row("t2", -2.9), row("t3", 40, { excluded: true }), row("t4", 30, { hidden: true }), row("t5", 0.1, { other_residual: 25 })];
    expect(errorCue(rows, 3)).toEqual({ state: "within", largest: -2.9, counted: 3, beyond: 0, cutOff: 3 });
    expect(errorCue(rows, 2)).toEqual({ state: "beyond", largest: -2.9, counted: 3, beyond: 1, cutOff: 2 });
    expect(errorCue(rows, 1)).toMatchObject({ state: "beyond", beyond: 2 });
    expect(errorCue([row("t", undefined)], 3).state).toBe("none");
  });
  it("says it in words and a mark, never colour alone", () => {
    expect(describeCue({ state: "within", largest: 1, cutOff: 3 })).toBe("Every error within 3.0°");
    expect(describeCue({ state: "beyond", largest: -4.44, counted: 60, beyond: 2, cutOff: 3 })).toBe("2 of 60 beyond 3.0°, the largest 4.4°");
    expect(cueMark({ state: "within", cutOff: 3 })).toBe("✓");
    expect(cueMark({ state: "beyond", cutOff: 3 })).toBe("✗");
  });
  // The cue in VS Code's themes and the playground's: shaded, with text reading on it; in a
  // high-contrast theme, which has no shade, a border in its passed or failed colour.
  const shade = (hex: string, background: Rgb): Rgb => {
    const rgb = parseColour(hex)!;
    const alpha = hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1;
    return rgb.map((c, i) => c * alpha + background[i] * (1 - alpha)) as Rgb;
  };
  const themes = {
    "Dark Modern": { background: "#1f1f1f", foreground: "#cccccc", tokens: { within: "#9ccc2c33", beyond: "#ff000033", withinEdge: "#73c991", beyondEdge: "#f14c4c", highContrast: false } },
    "Light Modern": { background: "#ffffff", foreground: "#3b3b3b", tokens: { within: "#9ccc2c40", beyond: "#ff000033", withinEdge: "#388a34", beyondEdge: "#e51400", highContrast: false } },
    "Dark High Contrast": { background: "#000000", foreground: "#ffffff", tokens: { within: "", beyond: "", withinEdge: "#73c991", beyondEdge: "#f14c4c", highContrast: true } },
  };
  for (const [name, theme] of Object.entries(themes)) {
    it(`reads in ${name}`, () => {
      for (const state of ["within", "beyond"] as const) {
        const style = cueStyle(state, theme.tokens);
        expect(style.fill || style.edge, `${name} ${state} is shown`).toBeTruthy();
        const under = style.fill ? shade(style.fill, parseColour(theme.background)!) : parseColour(theme.background)!;
        expect(contrast(parseColour(theme.foreground)!, under), `${name} ${state}: text on the shade`).toBeGreaterThanOrEqual(4.5);
        if (style.edge) expect(contrast(parseColour(style.edge)!, parseColour(theme.background)!), `${name} ${state}: the border`).toBeGreaterThanOrEqual(3);
      }
      expect(cueStyle("none", theme.tokens)).toEqual({});
    });
  }
  it("borders the pane in a high-contrast theme, shades it otherwise", () => {
    expect(cueStyle("within", themes["Dark High Contrast"].tokens)).toEqual({ edge: "#73c991" });
    expect(cueStyle("beyond", themes["Dark Modern"].tokens)).toEqual({ fill: "#ff000033" });
  });
});

describe("zoom", () => {
  const whole: [number, number] = [0, 1_000_000];
  it("zooms a box to its time and that pane's values, and Reset undoes it", () => {
    let zoom = noZoom();
    expect(isZoomed(zoom)).toBe(false);
    zoom = zoomBox(zoom, "error", [800_000, 200_000], [3, -1]);
    expect(zoom).toEqual({ time: [200_000, 800_000], values: { error: [-1, 3] } });
    zoom = zoomBox(zoom, "bearing", [300_000, 400_000], [40, 50]);
    expect(zoom.values).toEqual({ error: [-1, 3], bearing: [40, 50] });
    expect(isZoomed(zoom)).toBe(true);
    expect(isZoomed(noZoom())).toBe(false);
  });
  it("zooms time in and out about a time, within the whole span, and out past it unzoomed", () => {
    const zoom = zoomTime(noZoom(), whole, whole, 0.5, 900_000);
    expect(zoom.time).toEqual([500_000, 1_000_000]);
    // Never closer in than ten seconds.
    const t0 = 1_000_000_000;
    expect(zoomBox(noZoom(), "error", [t0, t0 + 2000], [0, 1]).time).toEqual([t0 - 4000, t0 + 6000]);
    const tight = zoomTime(noZoom(), [t0, t0 + 12_000], [t0 - 1e6, t0 + 1e6], 0.25, t0 + 6000);
    expect(tight.time![1] - tight.time![0]).toBe(LEAST_SPAN_MS);
    expect(zoomTime(zoom, zoom.time!, whole, 4).time).toBeUndefined();
    expect(panTime({ ...zoom, time: [100_000, 200_000] }, whole, 0.5).time).toEqual([150_000, 250_000]);
    expect(panTime({ ...zoom, time: [900_000, 1_000_000] }, whole, 0.5).time).toEqual([900_000, 1_000_000]);
    expect(zoomValues(noZoom(), "error", [-4, 4], 0.5).values.error).toEqual([-2, 2]);
  });
});

describe("pointing at a dot", () => {
  it("chooses the nearest within reach, or none", () => {
    const xs = [10, 20, 30];
    const ys = [10, 10, 40];
    expect(nearestPoint(xs, ys, 19, 12, 7)).toBe(1);
    expect(nearestPoint(xs, ys, 29, 37, 7)).toBe(2);
    expect(nearestPoint(xs, ys, 60, 60, 7)).toBe(-1);
  });
  it("keeps the solution shown when one of its sensors' cuts is selected, not another's", () => {
    const plot = samplePlot();
    expect(keepsSolution(plot, ["cut-0"], "solution")).toBe(true);
    expect(keepsSolution(plot, ["cut-0", "cut-3"], "solution")).toBe(true);
    expect(keepsSolution(plot, ["other-cut"], "solution")).toBe(false);
    expect(keepsSolution(plot, ["host"], "solution")).toBe(false);
    expect(keepsSolution(plot, ["cut-0"], undefined)).toBe(false);
  });
});

describe("the Course/Speed pane", () => {
  it("gives a solution's DR legs' course and speed at each fix, the last keeping the one before's", () => {
    const start: LonLat = [-4, 50];
    const fixes: LonLat[] = [start, travel(start, 90, 1852), travel(travel(start, 90, 1852), 0, 3704)];
    const times = [0, 3600_000, 7200_000];
    const { courses, speeds } = legCourses(fixes, times);
    expect(Math.abs(courses[0] - 90)).toBeLessThan(0.1);
    expect(about(courses[1], 0)).toBeCloseTo(0, 6);
    expect(courses[2]).toBe(courses[1]);
    expect(Math.abs(speeds[0] / (1852 / 3600) - 1)).toBeLessThan(0.0001);
    expect(Math.abs(speeds[1] / (3704 / 3600) - 1)).toBeLessThan(0.0001);
    // The first two fixes at one time: from the first to the next at a later time.
    const shared = legCourses([start, start, travel(start, 90, 1852)], [0, 0, 3600_000]);
    expect(Math.abs(shared.courses[0] - 90)).toBeLessThan(0.01);
    expect(Math.abs(shared.speeds[0] / (1852 / 3600) - 1)).toBeLessThan(0.0001);
  });
  it("matches the ellipsoid's geodesic (geographiclib) closely enough to draw, to the worst case said in localCourse", () => {
    let worstCourse = 0;
    let worstSpeed = 0;
    let worstFar = { course: 0, speed: 0 };
    for (const lat of [0, 15, 30, 45, 60, 70, 75]) {
      for (const bearing of [0, 30, 45, 90, 135, 200, 270, 315]) {
        for (const metres of [100, 1000, 5000, 10_000, 20_000]) {
          const a: LonLat = [-4, lat];
          const b = travel(a, bearing, metres);
          const got = localCourse(a, b, 1);
          const dc = Math.abs(about(got.course, bearing) - bearing);
          const ds = Math.abs(got.metresPerSecond / metres - 1);
          if (lat <= 70 && metres <= 10_000) {
            worstCourse = Math.max(worstCourse, dc);
            worstSpeed = Math.max(worstSpeed, ds);
          }
          worstFar = { course: Math.max(worstFar.course, dc), speed: Math.max(worstFar.speed, ds) };
        }
      }
    }
    console.log(`localCourse against geographiclib: to 10 km and 70°, ${worstCourse.toFixed(5)}° and ${(worstSpeed * 100).toFixed(5)}%; to 20 km and 75°, ${worstFar.course.toFixed(5)}° and ${(worstFar.speed * 100).toFixed(5)}%`);
    expect(worstCourse).toBeLessThan(0.0001);
    expect(worstSpeed).toBeLessThan(0.000001);
    expect(worstFar.course).toBeLessThan(0.0002);
    expect(worstFar.speed).toBeLessThan(0.000006);
  });
  it("reads the solution's courses and speeds from its track, in degrees and metres a second", () => {
    const [solution] = tmaSolutionRows(samplePlot());
    expect(solution.courses).toEqual([90, 90, 90]);
    expect(solution.speeds![0]).toBeCloseTo(8 * 0.514444, 4);
  });
  it("gives ownship's logged courses over the period, thinned past OWNSHIP_MOST, a turn's least and most kept", () => {
    const plot = samplePlot();
    const [own] = ownshipOf(plot, "solution", { start: "2026-10-25T09:00:00.000Z", end: "2026-10-25T09:02:00.000Z" });
    expect(own).toMatchObject({ id: "host", name: "HOST" });
    expect(own.times.length).toBe(own.courses.length);
    // A fix either side of the period, so the line reaches its ends.
    expect(own.times[0] <= "2026-10-25T09:00:00.000Z").toBe(true);
    const big = samplePlot(20_000);
    const [thin] = ownshipOf(big, "solution");
    expect(thin.times.length).toBeLessThanOrEqual(OWNSHIP_MOST);
    // Each turn through north keeps its extremes as angles (355° and 4.5°), not 0° and 359.5°.
    expect(thin.courses).toContain(355);
    expect(thin.courses).toContain(4.5);
    expect(thin.courses).not.toContain(359.5);
  });
  it("draws a course through north as one line", () => {
    expect(about(2, 358)).toBe(362);
    expect(about(350, 10)).toBe(-10);
  });
});

describe("which panes show", () => {
  it("are Bearing and Error by default, one at least always", () => {
    expect(DEFAULT_PANES).toEqual({ bearing: true, error: true, course: false });
    const one = togglePane({ bearing: true, error: false, course: false }, "bearing");
    expect(one).toEqual({ bearing: true, error: false, course: false });
    expect(togglePane(DEFAULT_PANES, "course")).toEqual({ bearing: true, error: true, course: true });
    expect(togglePane(DEFAULT_PANES, "error")).toEqual({ bearing: true, error: false, course: false });
  });
  it("are read back as remembered, or the default when what is remembered is not panes", () => {
    expect(readPanes({ bearing: false, error: true, course: true })).toEqual({ bearing: false, error: true, course: true });
    for (const bad of [undefined, null, "x", { bearing: "yes" }, { bearing: false, error: false, course: false }]) expect(readPanes(bad)).toEqual(DEFAULT_PANES);
  });
});

/** A plot: HOST carrying Bow (cuts 0 to 4, cut 2 hidden), another sensor's cut, and a solution rooted in cuts 1 and 3. */
function samplePlot(hostFixes = 5): DebriefFeatureCollection {
  const t0 = Date.parse("2026-10-25T09:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  const hostTimes = Array.from({ length: hostFixes }, (_, i) => iso(t0 + i * 30_000));
  const hostCourses = hostTimes.map((_, i) => (hostFixes > 100 ? (355 + (i % 20) * 0.5) % 360 : 45));
  const cut = (i: number, more: Record<string, unknown> = {}) => ({
    type: "Feature",
    id: `cut-${i}`,
    geometry: null,
    properties: { kind: "sensor_cut", sensor_id: "bow", time: iso(t0 + i * 30_000), bearing: { value: 10 + i, unit: "deg" }, ...more },
  });
  const features = [
    {
      type: "Feature",
      id: "host",
      geometry: { type: "LineString", coordinates: hostTimes.map((_, i) => [-4 + i * 0.001, 50]) },
      properties: { kind: "track", name: "HOST", times: hostTimes, courses: { unit: "deg", values: hostCourses }, speeds: { unit: "[kn_i]", values: hostTimes.map(() => 6) }, style: { colour: "#2ca02c" } },
    },
    { type: "Feature", id: "bow", geometry: null, properties: { kind: "sensor", name: "Bow", host_track_id: "host", colour: "#1f77b4" } },
    { type: "Feature", id: "tail", geometry: null, properties: { kind: "sensor", name: "Tail", host_track_id: "host", colour: "#ff7f0e" } },
    cut(0),
    cut(1),
    cut(2, { hidden: true }),
    cut(3),
    cut(4, { bearing: { value: 10, unit: "deg" }, ambiguous_bearing: { value: 100, unit: "deg" } }),
    { type: "Feature", id: "other-cut", geometry: null, properties: { kind: "sensor_cut", sensor_id: "tail", time: iso(t0), bearing: { value: 200, unit: "deg" } } },
    {
      type: "Feature",
      id: "solution",
      geometry: { type: "LineString", coordinates: [[-3.9, 50.1], [-3.89, 50.1], [-3.88, 50.1]] },
      properties: {
        kind: "track",
        name: "Contact 1 solution",
        times: [iso(t0 + 30_000), iso(t0 + 60_000), iso(t0 + 90_000)],
        courses: { unit: "deg", values: [90, 90, 90] },
        speeds: { unit: "[kn_i]", values: [8, 8, 8] },
        tma: { contact: "Contact 1", sensor_ids: ["bow"], cut_ids: ["cut-1", "cut-3"], period: { start: iso(t0 + 30_000), end: iso(t0 + 90_000) } },
      },
    },
  ];
  return { type: "FeatureCollection", features } as unknown as DebriefFeatureCollection;
}
