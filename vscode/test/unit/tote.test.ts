/**
 * The Tote's view logic (CAP-06, CAP-07): positions as the map places them (held to the
 * vectors the kernel is), choosing tracks, formatting values with the analyst's settings,
 * and asking for values as current time moves without queueing (NFR-04).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@debrief/kernel";
import type { DebriefFeatureCollection, ToteResult } from "@debrief/schemas";
import { positionAt, type LonLat } from "../../webview/geodesic.js";
import {
  formatMeasure,
  latencySummary,
  mapLinesOn,
  sameTote,
  toteLines,
  toteMapLines,
  toteOf,
  ToteRequests,
  cellText,
  splitUnit,
  toteHeadings,
  toteTracks,
  withMapLines,
  withoutSecondary,
  withPrimary,
  withSecondaries,
} from "../../webview/totelogic.js";
import { checkMessage, toteViewProblems } from "../../src/messages.js";

const repo = path.resolve(__dirname, "../../..");
const read = (file: string) => JSON.parse(readFileSync(path.join(repo, file), "utf8"));

describe("the map places a track at current time where the Tote measures it (SUB-03)", () => {
  const { cases } = read("schemas/vectors/track-positions.json") as {
    cases: { name: string; coordinates: LonLat[]; times: string[]; samples: { at: string; expected: LonLat | null }[] }[];
  };
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const times = c.times.map(Date.parse);
    for (const sample of c.samples) {
      const found = positionAt(c.coordinates, times, Date.parse(sample.at));
      if (sample.expected === null) {
        expect(found, sample.at).toBeUndefined();
        continue;
      }
      // Longitude the same place on the globe: ±180 are one meridian.
      const dLon = ((found![0] - sample.expected[0] + 540) % 360) - 180;
      expect(Math.abs(dLon), sample.at).toBeLessThan(1e-9);
      expect(found![1]).toBeCloseTo(sample.expected[1], 9);
    }
  });
});

const plot = {
  type: "FeatureCollection",
  schema_version: "0.0.19",
  provenance: [],
  features: [
    { type: "Feature", id: "plot", geometry: null, properties: { kind: "plot", title: "P", view: { tote: { primary: "blue", secondaries: ["red"] } } } },
    { type: "Feature", id: "blue", geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] }, properties: { kind: "track", name: "BLUE ONE", times: ["2023-06-15T08:00:00.000Z", "2023-06-15T09:00:00.000Z"], style: { colour: "#0064bd" } } },
    { type: "Feature", id: "red", geometry: { type: "LineString", coordinates: [[0, 1], [1, 1]] }, properties: { kind: "track", name: "RED ONE", times: ["2023-06-15T08:00:00.000Z", "2023-06-15T09:00:00.000Z"] } },
    { type: "Feature", id: "note", geometry: null, properties: { kind: "annotation", name: "Note", time: "2023-06-15T08:00:00.000Z" } },
  ],
} as unknown as DebriefFeatureCollection;

describe("choosing the Tote's tracks: view state in the island", () => {
  it("lists the plot's tracks, and reads the choice from the island", () => {
    expect(toteTracks(plot)).toEqual([
      { id: "blue", name: "BLUE ONE", colour: "#0064bd" },
      { id: "red", name: "RED ONE" },
    ]);
    expect(toteOf(plot)).toEqual({ primary: "blue", secondaries: ["red"] });
    expect(toteOf(undefined)).toEqual({});
  });
  it("never has the primary among the secondaries, nor a secondary twice", () => {
    const view = { primary: "blue", secondaries: ["red", "green"] };
    expect(withPrimary(view, "red")).toEqual({ primary: "red", secondaries: ["green"] });
    expect(withPrimary(view, undefined)).toEqual({ secondaries: ["red", "green"] });
    expect(withSecondaries(view, ["red", "blue", "grey"])).toEqual({ primary: "blue", secondaries: ["red", "green", "grey"] });
    expect(withoutSecondary(view, "red")).toEqual({ primary: "blue", secondaries: ["green"] });
    expect(withoutSecondary({ primary: "blue", secondaries: ["red"] }, "red")).toEqual({ primary: "blue" });
    expect(toteViewProblems(withSecondaries(view, ["blue", "red"]))).toEqual([]);
  });
  it("refuses, as Python does, a primary that is a secondary or a secondary twice", () => {
    expect(toteViewProblems({ primary: "a", secondaries: ["a", "b", "b"] })).toEqual([
      "tote_view: the primary, a, is also a secondary",
      "tote_view: secondary b is chosen more than once",
    ]);
    const refused = read("schemas/fixtures/webview_message/invalid/semantic/tote-changed-primary-also-secondary.json");
    expect(() => checkMessage(refused)).toThrow(/also a secondary/);
    expect(() => checkMessage(read("schemas/fixtures/webview_message/invalid/semantic/tote-changed-without-view.json"))).toThrow();
    for (const name of ["show-tote", "show-tote-no-plot", "tote-changed", "set-tote"]) {
      const raw = read(`schemas/fixtures/webview_message/valid/${name}.json`);
      expect(checkMessage(raw)).toEqual(raw);
    }
  });
  it("keeps the map's lines on unless turned off, and saves only off (decision, 14 Oct 2026)", () => {
    const view = { primary: "blue", secondaries: ["red"] };
    expect(mapLinesOn(view)).toBe(true);
    const off = withMapLines(view, false);
    expect(off).toEqual({ primary: "blue", secondaries: ["red"], map_lines: false });
    expect(mapLinesOn(off)).toBe(false);
    expect(withMapLines(off, true)).toEqual(view);
    expect(withSecondaries(off, ["green"]).map_lines).toBe(false); // kept through other choices
    expect(sameTote(view, off)).toBe(false);
    expect(sameTote(view, { ...view, map_lines: true })).toBe(true);
  });
  it("draws a line from the primary to each secondary placed at that time, none when off", () => {
    const at: Record<string, [number, number]> = { blue: [0, 0], red: [0, 1], green: [1, 1] };
    const view = { primary: "blue", secondaries: ["red", "late", "green"] };
    expect(toteMapLines(view, (id) => at[id])).toEqual([
      { track: "red", from: [0, 0], to: [0, 1] },
      { track: "green", from: [0, 0], to: [1, 1] },
    ]);
    expect(toteMapLines(withMapLines(view, false), (id) => at[id])).toEqual([]);
    expect(toteMapLines({ secondaries: ["red"] }, (id) => at[id])).toEqual([]); // no primary
    expect(toteMapLines({ primary: "late", secondaries: ["red"] }, (id) => at[id])).toEqual([]); // primary not there now
  });
  it("tells one choice from another, the group left out meaning core", () => {
    expect(sameTote({ primary: "a", secondaries: ["b"] }, { primary: "a", secondaries: ["b"], measure_group: "core" })).toBe(true);
    expect(sameTote({ primary: "a", secondaries: ["b", "c"] }, { primary: "a", secondaries: ["c", "b"] })).toBe(false);
    expect(sameTote({ primary: "a" }, { primary: "b" })).toBe(false);
  });
});

describe("the Tote's values, written with the analyst's settings (SUB-04)", () => {
  const shown = read("schemas/fixtures/webview_message/valid/show-tote.json").tote as ToteResult;
  const definition = (id: string) => shown.measures.find((m) => m.id === id)!;
  it("writes each measure as it says it is shown", () => {
    expect(formatMeasure(definition("range"), { value: 1852, unit: "m" })).toBe("1.00 nmi");
    // Close range in yards, where lengths are in nautical miles (decision, 14 Oct 2026).
    expect(formatMeasure(definition("range"), { value: 54.864, unit: "m" })).toBe("60 yd");
    expect(formatMeasure(definition("range"), { value: 1851, unit: "m" })).toBe("2024 yd");
    expect(formatMeasure(definition("bearing"), { value: 200.5, unit: "deg" })).toBe("200.5°T");
    expect(formatMeasure(definition("relative_bearing"), { value: -24.5, unit: "deg" })).toBe("R024.5°");
    expect(formatMeasure(definition("relative_bearing"), { value: 24.5, unit: "deg" })).toBe("G024.5°");
    expect(formatMeasure(definition("speed"), { value: 5.144444, unit: "m/s" })).toBe("10.0 kn");
    expect(formatMeasure(definition("depth"), { value: 20, unit: "m" })).toBe("20.0 m");
    expect(formatMeasure(definition("aob"), { value: 135, unit: "deg" })).toBe("G135.0°");
    expect(formatMeasure(definition("aob"), { value: -30, unit: "deg" })).toBe("R030.0°");
    expect(formatMeasure(definition("bearing_rate"), { value: -0.75, unit: "deg/min" })).toBe("-0.8°/min");
    expect(formatMeasure(definition("bearing_rate"), { value: 2.5, unit: "deg/min" })).toBe("2.5°/min");
    expect(formatMeasure(definition("depth"), undefined)).toBe("—");
    expect(formatMeasure(definition("depth"), { value: null, unit: null } as never)).toBe("—");
  });
  it("follows the analyst's units and decimals", () => {
    const settings = { ...DEFAULT_SETTINGS, length_unit: "[yd_i]" as const, length_decimals: 0, angle_decimals: 0 };
    expect(formatMeasure(definition("range"), { value: 1852, unit: "m" }, settings)).toBe("2025 yd");
    expect(formatMeasure(definition("range"), { value: 500, unit: "m" }, { ...DEFAULT_SETTINGS, length_unit: "km" })).toBe("0.50 km");
    expect(formatMeasure(definition("bearing"), { value: 200.5, unit: "deg" }, settings)).toBe("201°T");
    expect(formatMeasure(definition("depth"), { value: 20, unit: "m" }, settings)).toBe("65.6 ft");
  });
  it("heads each row with its measure and the unit its values are in, as the analyst has set units (decision, 14 Oct 2026)", () => {
    const heads = (settings = DEFAULT_SETTINGS) => toteHeadings(shown.measures, settings).map((h) => `${h.label} ${h.unit}`.trim());
    expect(heads()).toEqual(["Range nmi", "Brg °T", "Rel °", "AOB °", "Brg rate °/min", "Crse °T", "Spd kn", "Depth m"]);
    const imperial = { ...DEFAULT_SETTINGS, length_unit: "[yd_i]" as const, speed_unit: "m/s" as const };
    expect(heads(imperial)).toEqual(["Range yd", "Brg °T", "Rel °", "AOB °", "Brg rate °/min", "Crse °T", "Spd m/s", "Depth ft"]);
    expect(heads({ ...DEFAULT_SETTINGS, length_unit: "km" as const, speed_unit: "km/h" as const })).toEqual([
      "Range km", "Brg °T", "Rel °", "AOB °", "Brg rate °/min", "Crse °T", "Spd km/h", "Depth m",
    ]);
  });
  it("shows figures alone under the heading's unit; a close range keeps its yards", () => {
    expect(splitUnit("R024.5°")).toEqual({ figures: "R024.5", unit: "°" });
    expect(splitUnit("-0.8°/min")).toEqual({ figures: "-0.8", unit: "°/min" });
    expect(splitUnit("—")).toEqual({ figures: "—", unit: "" });
    expect(cellText("1.35 nmi", "nmi")).toBe("1.35");
    expect(cellText("1070 yd", "nmi")).toBe("1070 yd");
    expect(cellText("000.0°", "°")).toBe("000.0");
    expect(cellText("—", "m")).toBe("—");
    expect(cellText("", "m")).toBe("");
  });
  it("lays out the primary with its own measures, then each secondary, saying why one has none", () => {
    const { primary, secondaries } = toteLines(shown);
    expect(primary!.cells.map((c) => c.shown)).toEqual(["", "", "", "", "", "225.0", "12.0", "—"]);
    expect(secondaries[0].cells.map((c) => c.text)).toEqual(["1350 yd", "200.5°T", "R024.5°", "G135.0°", "-0.8°/min", "230.0°T", "6.0 kn", "20.0 m"]);
    expect(secondaries[0].cells.map((c) => c.shown)).toEqual(["1350 yd", "200.5", "R024.5", "G135.0", "-0.8", "230.0", "6.0", "20.0"]);
    expect(secondaries[1]).toMatchObject({ track: "track-tug-01", ok: false, note: "Ended 10:35:00Z" });
    expect(secondaries[1].cells.every((c) => c.shown === "—")).toBe(true);
    expect(secondaries[2]).toMatchObject({ name: "track-gone", ok: false, note: "No longer in the plot" });
  });
});

describe("asking for values as current time moves (NFR-04)", () => {
  const deferred = () => {
    let resolve!: (r: ToteResult | undefined) => void;
    const promise = new Promise<ToteResult | undefined>((r) => (resolve = r));
    return { promise, resolve };
  };
  const result = (time: string) => ({ time }) as unknown as ToteResult;
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("sends one request at a time, then only the latest time", async () => {
    const asked: string[] = [];
    const shown: string[] = [];
    const pending: ReturnType<typeof deferred>[] = [];
    const requests = new ToteRequests<string>(
      (time) => {
        asked.push(time);
        const d = deferred();
        pending.push(d);
        return d.promise;
      },
      (r) => shown.push(r!.time),
    );
    requests.request("09:00");
    requests.request("09:01");
    requests.request("09:02");
    requests.request("09:03");
    expect(asked).toEqual(["09:00"]); // never queued
    pending[0].resolve(result("09:00"));
    await settle();
    expect(asked).toEqual(["09:00", "09:03"]); // the latest; those passed over are never asked
    pending[1].resolve(result("09:03"));
    await settle();
    expect(shown).toEqual(["09:00", "09:03"]);
    expect(requests.timings).toHaveLength(2);
  });
  it("drops an answer for a plot since closed", async () => {
    const shown: string[] = [];
    const d = deferred();
    const requests = new ToteRequests<string>(() => d.promise, (r) => shown.push(r!.time));
    requests.request("09:00");
    requests.reset();
    d.resolve(result("09:00"));
    await settle();
    expect(shown).toEqual([]);
  });
  it("goes on after a failure", async () => {
    const failures: string[] = [];
    let n = 0;
    const requests = new ToteRequests<string>(
      async (time) => {
        if (n++ === 0) throw new Error("service stopped");
        return result(time);
      },
      () => undefined,
      (e) => failures.push(e.message),
    );
    requests.request("09:00");
    await settle();
    requests.request("09:01");
    await settle();
    expect(failures).toEqual(["service stopped"]);
    expect(n).toBe(2);
  });
  it("summarises timings for the latency reports", () => {
    expect(latencySummary([5, 1, 3, 2, 4])).toEqual({ count: 5, p50: 3, p95: 5, max: 5 });
    expect(latencySummary([])).toEqual({ count: 0, p50: 0, p95: 0, max: 0 });
  });
});
