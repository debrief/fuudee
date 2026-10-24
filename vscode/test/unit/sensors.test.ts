/**
 * Sensors and their cuts (CAP-22): where the map draws a cut from and to, which side a
 * bearing is on and which bearing keeping port or starboard keeps, held to the vectors
 * debrief_kernel.sensors is held to; and what lists and tooltips say of them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { pointAt, rangeBearing, travel, type LonLat } from "../../webview/geodesic.js";
import {
  arrayPlace,
  cutClick,
  currentCut,
  cutChoices,
  cutNow,
  cutEnd,
  cutPlace,
  cutsInScope,
  KEEP_CHOICES,
  resolutionFor,
  scopeChoices,
  DEFAULT_LENGTH_CAP_M,
  defaultLengthM,
  describeCut,
  drawnBearings,
  featureName,
  hostCourse,
  inPeriod,
  keptFor,
  relativeBearing,
  sensorDetail,
  sensorsOf,
  sideOf,
  type Kept,
} from "../../webview/sensors.js";
import { describeSensorInFile, hostChoices, hostQuestion, hostsToAsk, sensorReadSummary, type SensorPreview } from "../../src/sensorimport.js";
import { describeStep, SENSOR_IMPORTER } from "../../src/wording.js";
import { arrayOffsetTitle, readArrayOffset } from "../../webview/trackedit.js";

const repo = path.resolve(__dirname, "../../..");
const vectors = JSON.parse(readFileSync(path.join(repo, "schemas/vectors/sensor-cuts.json"), "utf8")) as {
  relative: { course: number; bearing: number; relative: number; side: string }[];
  default_length: { width_m: number; height_m: number; expected_m: number }[];
  cases: {
    name: string;
    host: { coordinates: LonLat[]; times: string[]; courses?: number[] };
    sensor?: { array_offset_m: number; array_mode: "worm_in_hole" | "plain" };
    cuts: {
      time: string;
      bearing: number;
      ambiguous_bearing?: number;
      resolved?: string;
      range_m?: number;
      length_m?: number;
      origin?: LonLat;
      course?: number;
      expected: { origin: LonLat | null; course: number | null; side: string | null; lines?: { which: Kept; end: LonLat }[]; keep_port: Kept | null; keep_starboard: Kept | null };
    }[];
  }[];
};

function samePlace(found: LonLat | undefined, expected: LonLat | null, what: string): void {
  if (expected === null) {
    expect(found, what).toBeUndefined();
    return;
  }
  const dLon = ((found![0] - expected[0] + 540) % 360) - 180; // ±180 are one meridian
  expect(Math.abs(dLon), what).toBeLessThan(1e-9);
  expect(found![1], what).toBeCloseTo(expected[1], 9);
}

describe("sides as legacy Debrief's relBearing tells them, every case of its own test", () => {
  it.each(vectors.relative.map((c) => [`${c.course}/${c.bearing}`, c] as const))("%s", (_name, c) => {
    expect(relativeBearing(c.course, c.bearing)).toBeCloseTo(c.relative, 12);
    expect(sideOf(c.course, c.bearing)).toBe(c.side);
  });
  it("draws a cut without a range past the edge of the view, at most five degrees of arc", () => {
    for (const c of vectors.default_length) expect(defaultLengthM(c.width_m, c.height_m)).toBeCloseTo(c.expected_m, 6);
    expect(DEFAULT_LENGTH_CAP_M).toBe(555_600);
  });
});

describe("a cut's origin, its host's course, its lines and keeping a side (CAP-22)", () => {
  const cuts = vectors.cases.flatMap((c) => c.cuts.map((cut) => [`${c.name} ${cut.time.slice(11, 19)}`, c, cut] as const));
  it.each(cuts)("%s", (_name, c, cut) => {
    const host = { coordinates: c.host.coordinates, times: c.host.times.map(Date.parse), ...(c.host.courses && { courses: c.host.courses }) };
    const at = Date.parse(cut.time);
    const place = cutPlace(host, at, cut.origin, c.sensor?.array_offset_m ?? 0, c.sensor?.array_mode ?? "worm_in_hole", cut.course);
    const origin = place?.position;
    samePlace(origin, cut.expected.origin, "origin");
    const course = place?.course;
    if (cut.expected.course === null) expect(course).toBeUndefined();
    else {
      expect(course!).toBeCloseTo(cut.expected.course, 9);
      expect(sideOf(course!, cut.bearing)).toBe(cut.expected.side);
    }
    if (origin) {
      const lines = drawnBearings(cut.bearing, cut.ambiguous_bearing, cut.resolved);
      expect(lines.map((l) => l.which)).toEqual(cut.expected.lines!.map((l) => l.which));
      lines.forEach((line, i) => samePlace(cutEnd(origin, line.bearing, (cut.range_m ?? cut.length_m)!), cut.expected.lines![i].end, `end ${i}`));
    }
    expect(keptFor("port", cut.bearing, cut.ambiguous_bearing, course) ?? null).toBe(cut.expected.keep_port);
    expect(keptFor("starboard", cut.bearing, cut.ambiguous_bearing, course) ?? null).toBe(cut.expected.keep_starboard);
  });
});

const cut = (id: string, time: string, bearing: number, more: Record<string, unknown> = {}) => ({
  type: "Feature",
  id,
  geometry: null,
  properties: { kind: "sensor_cut", sensor_id: "sensor-ta", time, bearing: { value: bearing, unit: "deg" }, ...more },
});
const plot = {
  type: "FeatureCollection",
  schema_version: "0.0.23",
  provenance: [],
  features: [
    { type: "Feature", id: "track-blue", geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] }, properties: { kind: "track", name: "BLUE ONE", times: ["2026-10-11T09:00:00.000Z", "2026-10-11T10:00:00.000Z"] } },
    { type: "Feature", id: "sensor-ta", geometry: null, properties: { kind: "sensor", name: "Towed array", host_track_id: "track-blue", colour: "#8a3ffc" } },
    cut("cut-00003", "2026-10-11T09:30:00.000Z", 50, { ambiguous_bearing: { value: 130, unit: "deg" }, resolved: "ambiguous_bearing", range: { value: 2000, unit: "[yd_i]" } }),
    cut("cut-00001", "2026-10-11T09:10:00.000Z", 45, { ambiguous_bearing: { value: 135, unit: "deg" }, label: "0910" }),
    cut("cut-00002", "2026-10-11T09:20:00.000Z", 47),
  ],
} as unknown as DebriefFeatureCollection;

describe("what is drawn when, and what is said of it", () => {
  const [entry] = sensorsOf(plot);
  it("a sensor's cuts in time order, with its host", () => {
    expect(entry.cuts.map((c) => c.id)).toEqual(["cut-00001", "cut-00002", "cut-00003"]);
    expect(entry.host?.id).toBe("track-blue");
    expect(sensorDetail(entry)).toBe("3 cuts · 1 ambiguous · 1 resolved");
  });
  it("only the cuts in the window are drawn, and the one current time is at is emphasised", () => {
    const t = (hhmm: string) => Date.parse(`2026-10-11T${hhmm}:00.000Z`);
    expect(inPeriod(entry.times, t("09:10"), t("09:20"))).toEqual([0, 2]);
    expect(inPeriod(entry.times, t("09:11"), t("09:19"))).toEqual([1, 1]);
    expect(currentCut(entry.times, t("09:25"), t("09:00"), t("10:00"))).toBe(1);
    expect(currentCut(entry.times, t("09:30"), t("09:00"), t("10:00"))).toBe(2);
    expect(currentCut(entry.times, t("09:05"), t("09:00"), t("10:00"))).toBe(-1); // none heard yet
    expect(currentCut(entry.times, t("09:25"), t("09:21"), t("10:00"))).toBe(-1); // the last is before the window
  });
  it("says a cut's bearings, its sides and which was kept", () => {
    expect(describeCut(entry.cuts[0], "Towed array", 90)).toBe("Towed array cut at 09:10:00Z\nAmbiguous: 045.0° (port) or 135.0° (starboard)\nLabel: 0910");
    expect(describeCut(entry.cuts[2], "Towed array", 90)).toBe("Towed array cut at 09:30:00Z\nBearing 130.0° (starboard) kept; 050.0° discarded\nRange 2000 yd");
    expect(featureName(entry.cuts[1], plot)).toBe("Towed array cut at 09:20:00Z");
  });
});

describe("keeping a side for the cut at the current time, the time window, the selection or all (CAP-22)", () => {
  const [entry] = sensorsOf(plot);
  const t = (hhmm: string) => Date.parse(`2026-10-11T${hhmm}:00.000Z`);
  const context = { entries: [entry], selected: ["cut-00002"], window: { start: t("09:00"), end: t("09:25") }, at: t("09:12") };
  it("offers only the scopes that hold cuts, saying how many have two bearings", () => {
    expect(scopeChoices(context).map((c) => [c.scope, c.detail])).toEqual([
      ["current", "1 cut, 1 with two bearings"],
      ["window", "2 cuts, 1 with two bearings"],
      ["selected", "1 cut, 0 with two bearings"],
      ["all", "3 cuts, 2 with two bearings"],
    ]);
  });
  it("asks for the cuts named, or the sensor and the window, or the sensor", () => {
    expect(resolutionFor("current", "port", context)).toEqual({ keep: "port", cut_ids: ["cut-00001"] });
    expect(resolutionFor("window", "starboard", context)).toEqual({ keep: "starboard", sensor_ids: ["sensor-ta"], period: { start: "2026-10-11T09:00:00.000Z", end: "2026-10-11T09:25:00.000Z" } });
    expect(resolutionFor("all", "ambiguous", context)).toEqual({ keep: "ambiguous", sensor_ids: ["sensor-ta"] });
    expect(cutsInScope("selected", { ...context, selected: ["sensor-ta"] })).toHaveLength(0); // a sensor selected is All cuts
  });
  it("leaves hidden cuts, and a hidden sensor's, out of the window and all, as the service does", () => {
    const hiddenCut = { ...entry, cuts: entry.cuts.map((c, i) => (i === 0 ? { ...c, properties: { ...c.properties, hidden: true } } : c)) };
    expect(cutsInScope("all", { ...context, entries: [hiddenCut] }).map((c) => c.id)).toEqual(["cut-00002", "cut-00003"]);
    expect(cutsInScope("window", { ...context, entries: [hiddenCut] }).map((c) => c.id)).toEqual(["cut-00002"]);
    expect(cutsInScope("selected", { ...context, entries: [hiddenCut], selected: ["cut-00001"] }).map((c) => c.id)).toEqual(["cut-00001"]);
    const hiddenSensor = { ...entry, sensor: { ...entry.sensor, properties: { ...entry.sensor.properties, hidden: true } } };
    expect(cutsInScope("all", { ...context, entries: [hiddenSensor] })).toHaveLength(0);
  });
  it("says why when there is nothing to resolve", () => {
    expect(resolutionFor("selected", "port", context)).toBe("None of these cuts has two bearings.");
    expect(resolutionFor("selected", "port", { ...context, selected: [] })).toBe("Select cuts on the map first (click a line; Ctrl-click for more).");
    expect(resolutionFor("current", "port", { ...context, at: t("09:05") })).toBe("No cut is at the current time.");
  });
  it("a cut's own menu: the bearings not kept, with their sides; ambiguous again once resolved", () => {
    expect(cutChoices(entry.cuts[0], 90).map((c) => [c.label, c.keep])).toEqual([
      ["Keep 045.0° (port)", "bearing"],
      ["Keep 135.0° (starboard)", "ambiguous_bearing"],
    ]);
    expect(cutChoices(entry.cuts[2], 90).map((c) => c.keep)).toEqual(["bearing", "ambiguous"]);
    expect(cutChoices(entry.cuts[1], 90)).toEqual([]);
    expect(cutNow(entry, t("09:25"), { start: t("09:00"), end: t("10:00") })?.id).toBe("cut-00002");
    expect(cutNow(entry, t("09:25"))?.id).toBe("cut-00002");
    expect(cutNow(entry, t("09:05"))).toBeUndefined();
  });
  it("offers port, starboard and ambiguous again for every cut, as legacy did", () => {
    expect(KEEP_CHOICES.map((c) => c.keep)).toEqual(["port", "starboard", "ambiguous"]);
  });
});

describe("asking which track carries a file's sensors, as legacy asked", () => {
  const preview: SensorPreview = {
    name: "ALPHA_CUTS.dsf",
    sensors: [
      { track: "ALPHA", sensor: "Towed", name: "Towed", cuts: 600, ambiguous: 0, lines: 611, start: "", end: "", host_track_id: null, host: null },
      { track: "ALPHA", sensor: "Hull", name: "Hull", cuts: 1, ambiguous: 1, lines: 1, start: "", end: "", host_track_id: null, host: null },
      { track: "NELSON", sensor: "UNKNOWN", name: "ALPHA_CUTS.dsf", cuts: 3, ambiguous: 0, lines: 3, start: "", end: "", host_track_id: "track-nelson", host: "NELSON" },
    ],
    cuts: 604,
    fixes: 0,
    tracks: [{ id: "track-nelson", name: "NELSON" }],
    omitted: [],
    notes: [],
    content_hash: "",
    earlier: [],
  };
  it("asks once per track name the plot has no track for", () => {
    expect(hostsToAsk(preview).map((a) => [a.track, a.sensors.length])).toEqual([["ALPHA", 2]]);
    expect(describeSensorInFile(preview.sensors[1])).toBe("Hull on ALPHA: 1 cut, 1 ambiguous");
    expect(sensorReadSummary({ sensors: ["a", "b"], cuts: 1604 }, "ALPHA_CUTS.dsf")).toBe("1,604 cuts of 2 sensors read from ALPHA_CUTS.dsf.");
  });
  it("asks to confirm a track matched by its first six letters only, offering it first", () => {
    const prefixed: SensorPreview = {
      ...preview,
      sensors: [{ track: "NELSONX", sensor: "TA", name: "TA", cuts: 3, ambiguous: 3, lines: 3, start: "", end: "", host_track_id: "track-nelson", host: "NELSON", matched_by: "prefix" }, { ...preview.sensors[2], matched_by: "name" }],
      tracks: [{ id: "track-blue", name: "BLUE" }, { id: "track-nelson", name: "NELSON" }],
    };
    const [asked, ...more] = hostsToAsk(prefixed);
    expect(more).toEqual([]);
    expect(asked.matched).toEqual({ id: "track-nelson", name: "NELSON" });
    expect(hostChoices(prefixed, asked).map((t) => t.name)).toEqual(["NELSON", "BLUE"]);
    expect(hostQuestion(asked)).toBe("NELSONX matches NELSON by its first six letters only: which track carries NELSONX's sensors?");
    expect(hostQuestion({ track: "ALPHA" })).toBe("Which track carries ALPHA's sensors?");
  });
  it("names the step by its note in the History", () => {
    expect(describeStep({ kind: "import", tool: SENSOR_IMPORTER, status: "applied", notes: ["Sensor data read from ALPHA_CUTS.dsf"] }, () => undefined).label).toBe("Sensor data read from ALPHA_CUTS.dsf");
  });
});

describe("a click on a cut's line (product owner, 24 Oct 2026)", () => {
  const plain = { detail: 1, alt: false, add: false };
  it("selects on a plain click or a tap, even an ambiguous cut", () => {
    expect(cutClick(plain, true, false)).toBe("select");
    expect(cutClick(plain, false, false)).toBe("select");
  });
  it("keeps the line's bearing only with Alt, on an ambiguous cut, not read-only", () => {
    expect(cutClick({ ...plain, alt: true }, true, false)).toBe("keep");
    expect(cutClick({ ...plain, alt: true }, false, false)).toBe("select");
    expect(cutClick({ ...plain, alt: true }, true, true)).toBe("select");
  });
  it("adds with Ctrl, and ignores a double-click's second click", () => {
    expect(cutClick({ ...plain, add: true, alt: true }, true, false)).toBe("add");
    expect(cutClick({ ...plain, detail: 2 }, true, false)).toBe("ignore");
    expect(cutClick({ detail: 2, alt: true, add: false }, true, false)).toBe("ignore");
  });
});

describe("a worm on a dense track (M1)", () => {
  it("walks short legs on the local ellipsoid to within a millimetre of the geodesics", () => {
    const coordinates: LonLat[] = [];
    const times: number[] = [];
    for (let i = 0; i <= 2000; i++) {
      coordinates.push([-4 + 0.00007 * i, 50 + 0.00003 * (i % 40)]);
      times.push(i * 1000);
    }
    const at = 1_500_500;
    const place = arrayPlace({ coordinates, times }, at, 500)!;
    // The same walk, every leg a geodesic.
    let behind = pointAt(coordinates, times, at)!.position;
    let remaining = 500;
    for (let j = 1500; j >= 0; j--) {
      const leg = rangeBearing(behind, coordinates[j]);
      if (leg.metres >= remaining) {
        behind = travel(behind, leg.bearing, remaining);
        break;
      }
      remaining -= leg.metres;
      behind = coordinates[j];
    }
    expect(rangeBearing(place.position, behind).metres).toBeLessThan(1e-3);
  });
});

describe("a worm on a track that sat still (round 3, M-5)", () => {
  it("bisects the track's along-track distance rather than walking every still fix", () => {
    const n = 20000;
    const still = 15000;
    const coordinates: LonLat[] = [];
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      coordinates.push([-4, 50 + (Math.max(0, i - still) * 5) / 111000]);
      times.push(i * 1000);
    }
    const host = { coordinates, times, courses: new Array<number>(n).fill(0) };
    const at = (k: number) => Math.floor(((n - 1) * 1000 * k) / 600);
    const began = performance.now();
    const places = Array.from({ length: 600 }, (_, k) => arrayPlace(host, at(k), 500)!);
    // 3.2 s before (every still leg walked, and a course looked for behind each).
    expect(performance.now() - began).toBeLessThan(1000);
    for (const [k, place] of places.entries()) {
      if (at(k) <= (still + 101) * 1000) expect(place.position[1]).toBeLessThan(50 + 1e-9);
    }
  });
});

describe("an array offset as typed (round 3, M-4 and L-4)", () => {
  it("is metres unless a unit is given, whatever the display's unit", () => {
    expect(readArrayOffset("300")).toEqual({ value: 300, unit: "m" });
    expect(readArrayOffset("300 yd")).toEqual({ value: 300, unit: "[yd_i]" });
    expect(readArrayOffset("0")).toEqual({ value: 0, unit: "m" });
    expect(readArrayOffset("far")).toEqual({ problem: expect.stringContaining("such as 300 m") });
  });
  it("warns past 5 km, likely a unit mistyped", () => {
    expect(readArrayOffset("5000")).toEqual({ value: 5000, unit: "m" });
    expect(readArrayOffset("3 nmi")).toMatchObject({ value: 3, warning: expect.stringMatching(/^3\.00 nmi astern is longer than any towed array/) });
  });
  it("names the sensor and its host", () => {
    expect(arrayOffsetTitle("Towed array", "BLUE ONE")).toBe("Array offset: Towed array on BLUE ONE");
  });
});
