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
  guessDefaults,
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
  wrap,
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
    const yards = { ...DEFAULT_SETTINGS, length_unit: "[yd_i]", length_decimals: 0 };
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
    expect(rowLabel({ ...rows[10], residual: 1.24, nearer_side: true, leg: 2 } as never)).toBe(
      "09:05:00Z, Towed array, 045.0° / 135.0°, 045.0° is to port, residual +1.2°, by the nearer bearing, leg 2",
    );
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
