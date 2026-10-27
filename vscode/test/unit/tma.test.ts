/**
 * TMA in the bearing view (CAP-21, NFR-04): residuals worked out while a solution is
 * dragged, held to the vectors debrief_kernel.tma is held to; the first guess's defaults
 * and two clicks taken onto their cuts' lines; and the cut list's rows in sight, period
 * chosen, and next and previous ambiguous cut. And the drag budget: 2,000 cuts measured.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TmaCut, TmaResiduals, TmaSolutionRow } from "@debrief/schemas";
import { DEFAULT_SETTINGS } from "@debrief/kernel";
import { travel, type LonLat } from "../../webview/geodesic.js";
import {
  across,
  cutBearings,
  DEFAULT_RANGE,
  DEFAULT_SPEED,
  describePeriod,
  describeRms,
  describeTwoClicks,
  FocusOnce,
  focusChoice,
  guessDefaults,
  legExtent,
  legOf,
  liveResiduals,
  nearestRow,
  nextAmbiguous,
  ontoLine,
  periodOf,
  residualNotes,
  residuals,
  residualText,
  rms,
  rowLabel,
  rowsInSight,
  scrollFor,
  sideOfRow,
  splitAllowed,
  keptLegs,
  legIndices,
  legNear,
  wrap,
  coverageOutside,
  type CutBearing,
} from "../../webview/tma.js";

const vectors = JSON.parse(readFileSync(path.resolve(__dirname, "../../../schemas/vectors/tma-residuals.json"), "utf8"));

const cutOf = (c: { time: string; origin?: LonLat | null; bearing: number; ambiguous_bearing?: number; resolved?: string }): CutBearing => ({
  time: Date.parse(c.time),
  origin: c.origin ?? null,
  bearing: c.bearing,
  ambiguous: c.ambiguous_bearing ?? null,
  resolved: c.resolved ?? null,
});

describe("residuals, as the shared vectors say", () => {
  for (const c of vectors.residual_cases) {
    it(c.name, () => {
      const times = c.solution.times.map((t: string) => Date.parse(t));
      const found = residuals(c.cuts.map(cutOf), c.solution.coordinates, times);
      found.forEach((got, i) => {
        const expected = c.expected.rows[i];
        if (expected === null) {
          expect(got.residual).toBeUndefined();
          return;
        }
        expect(got.calculated).toBeCloseTo(expected.calculated, 6);
        expect(got.measured).toBeCloseTo(expected.measured, 6);
        expect(got.residual).toBeCloseTo(expected.residual, 6);
        expect(got.used).toBe(expected.used);
        expect(got.nearer_side).toBe(expected.nearer_side);
        if (expected.other_residual === undefined) expect(got.other).toBeUndefined();
        else expect(got.other).toBeCloseTo(expected.other_residual, 6);
      });
      const counted = found.filter((_, i) => !c.cuts[i].excluded).map((r) => r.residual);
      const value = rms(counted);
      if (c.expected.rms === null) expect(value).toBeUndefined();
      else expect(value).toBeCloseTo(c.expected.rms, 6);
    });
  }
  it("wraps angles within ±180°", () => {
    for (const [angle, wrapped] of vectors.wrap) expect(wrap(angle)).toBeCloseTo(wrapped, 9);
  });
});

describe("the first guess", () => {
  it("takes a click onto its cut's line, as Python does", () => {
    for (const c of vectors.onto_line) {
      const on = ontoLine(c.origin, c.bearing, c.ambiguous_bearing, c.resolved, c.click);
      if (c.expected === null) {
        expect(on, c.name).toBeUndefined();
        continue;
      }
      expect(on!.used, c.name).toBe(c.expected.used);
      expect(on!.rangeM, c.name).toBeCloseTo(c.expected.range_m, 3);
      expect(on!.position[0], c.name).toBeCloseTo(c.expected.position[0], 8);
      expect(on!.position[1], c.name).toBeCloseTo(c.expected.position[1], 8);
    }
  });
  it("offers 10,000 yd, across the bearing, 8 kn, in the analyst's units", () => {
    expect(DEFAULT_RANGE).toEqual(vectors.first_guess.range);
    expect(DEFAULT_SPEED).toEqual(vectors.first_guess.speed);
    for (const [bearing, course] of vectors.first_guess.across) expect(across(bearing)).toBeCloseTo(course, 9);
    const first = { id: "c", sensor_id: "s", time: "2026-10-11T09:00:00.000Z", bearing: 45, ambiguous_bearing: 135 } as TmaCut;
    expect(guessDefaults(first, undefined)).toEqual({ range: "4.94 nmi", course: "135.0", speed: "8.0 kn", bearing: 45 });
    expect(guessDefaults(first, "ambiguous_bearing").course).toBe("225.0");
    const yards = { ...DEFAULT_SETTINGS, length_unit: "[yd_i]" as const, length_decimals: 0 };
    expect(guessDefaults(first, undefined, yards).range).toBe("10000 yd");
  });
  it("says the course and speed two clicks make", () => {
    const a: LonLat = [-4, 50];
    const b = travel(a, 135, 8 * 1852);
    expect(describeTwoClicks(a, b, 3600)).toBe("135.0°T 8.0 kn");
  });
});

describe("the cut list", () => {
  const rows = Array.from({ length: 2000 }, (_, i): TmaCut => ({
    id: `cut-${i}`,
    sensor_id: "s",
    sensor: "Towed array",
    time: new Date(Date.parse("2026-10-11T09:00:00.000Z") + i * 30_000).toISOString(),
    bearing: 45,
    ...(i % 7 === 3 ? { ambiguous_bearing: 135, side: "port" as const } : {}),
    ...(i === 3 ? { resolved: "bearing" as const } : {}),
  }));
  it("draws only the rows in sight, with a few either side", () => {
    expect(rowsInSight(0, 220, 22, rows.length)).toEqual({ first: 0, last: 18 });
    expect(rowsInSight(22 * 1000, 220, 22, rows.length)).toEqual({ first: 992, last: 1018 });
    expect(rowsInSight(22 * 1995, 220, 22, rows.length)).toEqual({ first: 1987, last: 1999 });
    expect(rowsInSight(0, 220, 22, 0)).toEqual({ first: 0, last: -1 });
  });
  it("scrolls only as far as needed to bring a row into sight", () => {
    expect(scrollFor(5, 0, 220, 22)).toBe(0);
    expect(scrollFor(20, 0, 220, 22)).toBe(22 * 21 - 220);
    expect(scrollFor(2, 100, 220, 22)).toBe(44);
  });
  it("finds the next and previous ambiguous cut, round the list, skipping resolved ones", () => {
    expect(nextAmbiguous(rows, 0, 1)).toBe(10);
    expect(nextAmbiguous(rows, 10, -1)).toBe(1998);
    expect(nextAmbiguous(rows.slice(0, 3), 0, 1)).toBeUndefined();
  });
  it("says the period chosen, either way round", () => {
    expect(periodOf(rows, 120, 2)).toEqual({ start: rows[2].time, end: rows[120].time });
    expect(describePeriod(rows, 0, 20)).toBe("21 cuts 09:00:00Z–09:10:00Z, 2 ambiguous");
  });
  it("finds the row nearest a time, and a time's leg", () => {
    expect(nearestRow(rows, Date.parse(rows[40].time) + 10_000)).toBe(40);
    expect(legOf(["2026-10-11T09:20:00.000Z"], rows[40].time)).toBe(2);
    expect(legOf(undefined, rows[40].time)).toBe(1);
  });
  it("writes bearings, sides and residuals as the analyst reads them", () => {
    expect(cutBearings(rows[10])).toBe("045.0° / 135.0°");
    expect(cutBearings(rows[3])).toBe("045.0° kept");
    expect(sideOfRow(rows[10], "ambiguous_bearing")).toBe("starboard");
    expect(residualText(-0.62)).toBe("−0.6°");
    expect(residualText(0.04)).toBe("+0.0°");
    expect(residualText(-0.04)).toBe("+0.0°");
    expect(residualText(undefined)).toBe("—");
    expect(rowLabel({ ...rows[10], residual: 1.24, nearer_side: true, other_residual: -88.8, leg: 2 } as never)).toBe(
      "09:05:00Z, 045.0° / 135.0°, 045.0° is to port, residual +1.2°, by the nearer bearing, the other bearing's residual −88.8°, leg 2",
    );
    // The sensor said only where the list has cuts of more than one; a hidden cut says so.
    expect(rowLabel(rows[0], DEFAULT_SETTINGS, true)).toMatch(/^09:00:00Z, Towed array, /);
    expect(rowLabel({ ...rows[0], hidden: true })).toMatch(/hidden on the map, left out$/);
  });
});

describe("residuals while a solution is dragged", () => {
  const start: LonLat = [-3.9, 50.05];
  const n = 2000;
  const coordinates: LonLat[] = [start];
  for (let i = 1; i < n; i++) coordinates.push(travel(coordinates[i - 1], 200, 150));
  const times = Array.from({ length: n }, (_, i) => new Date(Date.parse("2026-10-11T09:00:00.000Z") + i * 30_000).toISOString());
  const solution: TmaSolutionRow = { id: "s", name: "Contact 1 solution", contact: "Contact 1", period: { start: times[0], end: times[n - 1] }, times, cuts: n };
  const origin: LonLat = [-4, 50];
  const base: TmaResiduals = {
    solution_id: "s",
    rows: times.map((time, i) => ({ id: `c${i}`, sensor_id: "x", time, bearing: 30, ambiguous_bearing: 150, origin, ...(i === 5 ? { excluded: true } : {}), residual: 0 })),
    counted: n - 1,
    excluded: 1,
    without: 2,
  };
  it("works the residuals out again as the map draws the solution, counted as Python counts them", () => {
    const live = liveResiduals(base, solution, coordinates);
    expect(live.counted).toBe(n - 1);
    expect(live.without).toBe(2); // two rooted cuts no longer in the plot
    expect(live.nearer_side).toBe(n);
    expect(live.rows[5].excluded).toBe(true);
    expect(live.rms).toBeCloseTo(rms(live.rows.filter((r) => !r.excluded).map((r) => r.residual))!, 9);
    expect(describeRms(live)).toMatch(/^RMS \d+\.\d° over 1,999 cuts; 1 cut left out$/);
    expect(residualNotes(live)[0]).toBe("2,000 ambiguous cuts not yet resolved: each is measured by the bearing nearer the solution (marked ≈).");
    // A solution drawn with another number of fixes is not this one: the residuals stay.
    expect(liveResiduals(base, solution, coordinates.slice(1))).toBe(base);
  });
  it("keeps within a frame for 2,000 cuts (the drag budget, NFR-04)", () => {
    liveResiduals(base, solution, coordinates);
    const runs: number[] = [];
    for (let k = 0; k < 10; k++) {
      const moved = coordinates.map(([lon, lat]) => [lon + k * 1e-4, lat] as LonLat);
      const started = performance.now();
      liveResiduals(base, solution, moved);
      runs.push(performance.now() - started);
    }
    runs.sort((a, b) => a - b);
    console.log(`TMA live residuals, 2,000 cuts: median ${runs[5].toFixed(1)} ms, worst ${runs[9].toFixed(1)} ms`);
    expect(runs[5]).toBeLessThan(50);
  });
});


describe("hidden cuts while dragging (product owner, 25 Oct 2026)", () => {
  it("are left out of the RMS and the counts, as Python leaves them out, and counted once shown", () => {
    const origin: LonLat = [-4, 50];
    const coordinates: LonLat[] = [travel(origin, 30, 9000), travel(travel(origin, 30, 9000), 120, 900)];
    const times = ["2026-10-11T09:00:00.000Z", "2026-10-11T09:02:00.000Z"];
    const solution: TmaSolutionRow = { id: "s", name: "s", contact: "c", period: { start: times[0], end: times[1] }, times, cuts: 3 };
    const row = (i: number, bearing: number, more = {}) => ({ id: `c${i}`, sensor_id: "x", time: `2026-10-11T09:0${i}:00.000Z`, bearing, origin, residual: 0, ...more });
    const base: TmaResiduals = { solution_id: "s", rows: [row(0, 31), row(1, 80, { hidden: true }), row(2, 33)], counted: 2, excluded: 0, without: 0, hidden: 1 };
    const live = liveResiduals(base, solution, coordinates);
    expect(live.counted).toBe(2);
    expect(live.rows[1].residual).toBeDefined(); // worked out, shown in the list, not counted
    expect(live.rms).toBeCloseTo(rms([live.rows[0].residual, live.rows[2].residual])!, 9);
    expect(residualNotes(live)).toContain("1 hidden cut left out: it is hidden on the map, and counts again once shown.");
    const shown = liveResiduals({ ...base, rows: base.rows.map((r) => ({ ...r, hidden: undefined })), hidden: undefined }, solution, coordinates);
    expect(shown.counted).toBe(3);
  });
});

describe("legs on the map (product owner, 25 Oct 2026)", () => {
  const times = Array.from({ length: 10 }, (_, i) => i * 60_000);
  const starts = [4 * 60_000, 7 * 60_000];
  it("finds a leg by current time, or the one picked", () => {
    expect(legIndices(times, starts, 0)).toEqual({ indices: [0, 1, 2, 3], leg: 1, legs: 3 });
    expect(legIndices(times, starts, 4 * 60_000)).toEqual({ indices: [4, 5, 6], leg: 2, legs: 3 });
    expect(legIndices(times, starts, 99 * 60_000).leg).toBe(3); // after the end: the last
    expect(legIndices(times, starts, -5).leg).toBe(1); // before the start: the first
    expect(legIndices(times, starts, 0, 3)).toEqual({ indices: [7, 8, 9], leg: 3, legs: 3 });
    expect(legIndices(times, [], 5 * 60_000)).toEqual({ indices: times.map((_, i) => i), leg: 1, legs: 1 });
  });
  it("picks the leg of the fix nearest a click", () => {
    const positions: LonLat[] = times.map((_, i) => [i * 0.01, 50]);
    expect(legNear(positions, times, starts, [0.051, 50.001])).toBe(2);
    expect(legNear(positions, times, starts, [0.2, 50])).toBe(3);
  });
  it("keeps the legs not dragged where they were", () => {
    const before: LonLat[] = times.map((_, i) => [i, 0]);
    const after: LonLat[] = times.map((_, i) => [i, 1]);
    const kept = keptLegs(before, after, [4, 5, 6], times, starts);
    expect(kept.map((p) => p[1])).toEqual([0, 0, 0, 0, 1, 1, 1, 0, 0, 0]);
    expect(keptLegs(before, after, times.map((_, i) => i), times, starts)).toBe(after);
  });
  it("offers a split only where the leg keeps two fixes either side, as Python allows", () => {
    expect(splitAllowed(times, [], 2 * 60_000)).toBe(true);
    expect(splitAllowed(times, [], 1 * 60_000)).toBe(false); // one fix before
    expect(splitAllowed(times, [], 9 * 60_000)).toBe(false); // one fix from it on
    expect(splitAllowed(times, starts, 5 * 60_000)).toBe(false); // leg 2 has one fix before
    expect(splitAllowed(times, starts, 6 * 60_000)).toBe(false); // and one from it on
    expect(splitAllowed(times, starts, 4 * 60_000)).toBe(false); // a leg starts there already
    expect(splitAllowed(times, [7 * 60_000], 2 * 60_000)).toBe(true);
    expect(splitAllowed(times, [7 * 60_000], 6 * 60_000)).toBe(false); // leg 1 keeps one fix after
  });
});

describe("the coverage beside a solution", () => {
  it("plots the sensors' cuts not rooted in the solution, never one hidden on the map", () => {
    const cut = (id: string, hidden?: boolean): TmaCut => ({ id, sensor_id: "s", sensor: "Bow sonar", time: "2023-06-15T12:00:00Z", bearing: 10, ...(hidden && { hidden: true }) });
    const coverage = [cut("a"), cut("b"), cut("c", true), cut("d")];
    expect(coverageOutside(coverage, new Set(["b"])).map((c) => c.id)).toEqual(["a", "d"]);
    expect(coverageOutside(undefined, new Set())).toEqual([]);
  });
});

describe("what a command or a walkthrough step chooses in Bearings (TmaFocus, CAP-25)", () => {
  const day = "2023-06-15T";
  const row = (time: string, residual?: number, more: Record<string, unknown> = {}) => ({ id: `c-${time}`, sensor_id: "s", time: `${day}${time}.000Z`, bearing: 100, ...(residual !== undefined && { residual }), ...more }) as unknown as TmaCut;
  const cuts = ["09:46:00", "09:47:00", "09:48:00", "12:00:00", "12:01:00"].map((t) => row(t));

  it("chooses the cut at a time, or the nearest to it, in either list", () => {
    expect(focusChoice(cuts, { cut_time: `${day}09:47:00.000Z` }, "cuts")).toEqual({ row: 1 });
    expect(focusChoice(cuts, { cut_time: `${day}09:47:40.000Z` }, "cuts")).toEqual({ row: 2 });
    expect(focusChoice(cuts, { cut_time: `${day}13:00:00.000Z` }, "solution")).toEqual({ row: 4 });
    expect(focusChoice([], { cut_time: `${day}09:47:00.000Z` }, "cuts")).toBeUndefined();
  });

  it("chooses a period, its first and last cuts, and whether to open the first guess's form; only with a sensor's cuts listed", () => {
    const period = { start: `${day}09:46:00.000Z`, end: `${day}12:00:00.000Z` };
    expect(focusChoice(cuts, { period, make: true }, "cuts")).toEqual({ period: [0, 3], make: true });
    expect(focusChoice(cuts, { period }, "cuts")).toEqual({ period: [0, 3], make: false });
    expect(focusChoice(cuts, { period: { start: `${day}10:00:00.000Z`, end: `${day}11:00:00.000Z` } }, "cuts")).toEqual({ problem: "There are no cuts in that period." });
    // A solution shown: a period is no choice there (its cuts are the solution's).
    expect(focusChoice(cuts, { period, make: true }, "solution")).toBeUndefined();
  });

  it("chooses the counted cut with the largest residual, never one left out, hidden or without a residual; only with a solution shown", () => {
    const rows = [row("09:46:00", 2), row("09:47:00", -50, { excluded: true }), row("09:48:00", 60, { hidden: true }), row("12:00:00"), row("12:01:00", -7)];
    expect(focusChoice(rows, { largest: true }, "solution")).toEqual({ row: 4 });
    expect(focusChoice(rows, { largest: true }, "cuts")).toBeUndefined();
    expect(focusChoice([row("09:46:00", 1, { excluded: true }), row("09:47:00")], { largest: true }, "solution")).toBeUndefined();
  });

  it("is chosen once: taken with the next view, then forgotten, so a later refresh never chooses it again", () => {
    const once = new FocusOnce();
    expect(once.take()).toBeUndefined();
    once.ask({ largest: true });
    expect(once.take()).toEqual({ largest: true });
    expect(once.take()).toBeUndefined();
    once.ask({ cut_time: `${day}09:46:00.000Z` });
    once.ask(undefined); // asked again for nothing: the earlier ask is not kept
    expect(once.take()).toBeUndefined();
  });

  it("offers a solution's leg current time is in to the forms (This leg), only once it is split", () => {
    const times = ["09:46", "09:47", "09:48", "10:38", "10:39", "12:00"].map((t) => `${day}${t}:00.000Z`);
    const at = (t: string) => Date.parse(`${day}${t}:00.000Z`);
    expect(legExtent(times, [`${day}10:38:00.000Z`], at("10:40"))).toEqual({ period: { start: times[3], end: times[5] }, leg: 2, legs: 2 });
    expect(legExtent(times, [`${day}10:38:00.000Z`], at("09:50"))).toEqual({ period: { start: times[0], end: times[2] }, leg: 1, legs: 2 });
    expect(legExtent(times, [], at("09:50"))).toBeUndefined();
    expect(legExtent(times, null, at("09:50"))).toBeUndefined();
  });
});
