/**
 * A DR track edited by its origin, courses and speeds, as the tool service does it
 * (debrief_stac.reckoning), held to the shared vectors (schemas/vectors/dead-reckoning.json).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { drFixMoved, drMoved, drSheared, drStretched, drTurned, rangeBearing, type LonLat } from "../src/index.js";

interface Vector {
  place: string;
  op: "fix" | "move" | "rotate" | "stretch" | "shear";
  positions: LonLat[];
  times: number[];
  courses: number[];
  speeds: number[];
  index?: number;
  indices?: number[];
  to?: LonLat;
  metres?: number;
  bearing?: number;
  pivot?: LonLat;
  degrees?: number;
  anchor?: "start" | "end";
  factor?: number;
  expected: { positions: LonLat[]; courses: number[]; speeds: number[] };
}

const VECTORS = (JSON.parse(readFileSync(path.resolve(__dirname, "../../../schemas/vectors/dead-reckoning.json"), "utf8")) as { cases: Vector[] }).cases;

function runVector(v: Vector) {
  const r = { courses: v.courses, speeds: v.speeds };
  if (v.op === "fix") return drFixMoved(v.positions, v.times, r, v.index!, v.to!);
  if (v.op === "move") return drMoved(v.positions, v.times, r, v.indices!, v.metres!, v.bearing!);
  if (v.op === "rotate") return drTurned(v.positions, v.times, r, v.indices!, v.pivot!, v.degrees!);
  if (v.op === "stretch") return drStretched(v.positions, v.times, r, v.indices!, v.anchor!, v.factor!);
  return drSheared(v.positions, v.times, r, v.indices!, v.anchor!, v.to!);
}

describe("a DR track edited by its origin, courses and speeds, as the tool service does it (debrief_stac.reckoning)", () => {
  it.each(VECTORS.map((v) => [`${v.op} ${v.anchor ?? ""} of ${v.indices?.length ?? `fix ${v.index}`} at ${v.place}`, v] as const))("%s: the shared vectors", (_, v) => {
    const made = runVector(v)!;
    v.expected.positions.forEach((p, i) => expect(rangeBearing(p, made.positions[i]).metres).toBeLessThan(1e-3));
    v.expected.courses.forEach((c, i) => expect(Math.abs(((made.courses[i] - c + 540) % 360) - 180)).toBeLessThan(1e-6));
    v.expected.speeds.forEach((s, i) => expect(made.speeds[i]).toBeCloseTo(s, 6));
  });
});
