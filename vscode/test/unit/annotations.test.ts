/**
 * The annotation form's reading of what the analyst types, the map's drawing
 * decisions, the Timeline, and the messages between them (CAP-03 to CAP-05).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import geodesic from "geographiclib-geodesic";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { draftOf, echoPositions, newDraft, readPositions, replacing, specOf, type AnnotationDraft } from "../../webview/annotationdraft.js";
import { labelPlacement, labelText, lookOf, shapeOf, specOfFeature } from "../../webview/annotationlook.js";
import { circleRing, ellipseRing } from "../../webview/geodesic.js";
import { DATA_COLOURS } from "../../webview/palette.js";
import { checkMessage } from "../../src/messages.js";
import { currentEntry, timelineEntries } from "../../src/timeline.js";

const repo = path.resolve(__dirname, "../../..");
const fixture = (name: string) => JSON.parse(readFileSync(path.join(repo, "schemas", "fixtures", name), "utf8"));
const RANGE = { start: "2026-10-11T09:00:00.000Z", end: "2026-10-11T12:00:00.000Z" };
const draft = (change: Partial<AnnotationDraft>): AnnotationDraft => ({ ...newDraft(), ...change });

describe("the annotation form reads what the analyst types", () => {
  it("makes a circle from a centre in degrees and minutes and a radius with its unit", () => {
    const { spec, problems } = specOf(draft({ name: " Exclusion  zone ", positions: "50°19.800'N 004°07.200'W", radius: "2", unit: "[nmi_i]" }), RANGE);
    expect(problems).toEqual({});
    expect(spec).toMatchObject({ shape: "circle", name: "Exclusion zone", radius: { value: 2, unit: "[nmi_i]" } });
    expect(spec!.positions![0][0]).toBeCloseTo(-4.12, 9);
    expect(spec!.positions![0][1]).toBeCloseTo(50.33, 9);
  });

  it("makes an ellipse, its orientation in degrees true within a turn", () => {
    const { spec } = specOf(draft({ shape: "ellipse", name: "Search", positions: "50 20 N 4 7 W", semiMajor: "3000", semiMinor: "1000", unit: "[yd_i]", orientation: "405" }));
    expect(spec).toMatchObject({ semi_major: { value: 3000, unit: "[yd_i]" }, semi_minor: { value: 1000, unit: "[yd_i]" }, orientation: { value: 45, unit: "deg" } });
  });

  it("reads a line's positions one per line, in any notation, and says what each means", () => {
    const positions = "50 20.0 N 4 7.0 W\n50.40, -4.0\n\nN50 25 W3 55";
    const { spec } = specOf(draft({ shape: "line", name: "Transit", positions }));
    expect(spec!.positions).toHaveLength(3);
    expect(echoPositions(positions)[0]).toBe("Means 50°20.000'N 004°07.000'W");
    expect(readPositions("near the buoy")[0]).toHaveProperty("problem");
  });

  it.each([
    [{ name: "" }, "name"],
    [{ positions: "somewhere" }, "positions"],
    [{ radius: "0" }, "radius"],
    [{ radius: "two" }, "radius"],
    [{ colour: "blue" }, "colour"],
    [{ lineWidth: "11" }, "lineWidth"],
    [{ fillOpacity: "150" }, "fillOpacity"],
    [{ labelSize: "4" }, "labelSize"],
    [{ when: "time" as const, time: "half past nine" }, "time"],
    [{ when: "period" as const, start: "10:00Z", end: "09:00Z" }, "end"],
  ])("refuses %o, saying so beside %s", (change, field) => {
    const { spec, problems } = specOf(draft({ name: "Zone", positions: "50 20 N 4 7 W", radius: "2", ...change }), RANGE);
    expect(spec).toBeUndefined();
    expect(Object.keys(problems)).toEqual([field]);
  });

  it("needs two positions for a line and three corners for an area", () => {
    expect(specOf(draft({ shape: "line", name: "L", positions: "50 20 N 4 7 W" })).problems.positions).toMatch(/at least 2 positions/);
    expect(specOf(draft({ shape: "area", name: "A", positions: "50 20 N 4 7 W\n50 21 N 4 7 W" })).problems.positions).toMatch(/at least 3 corners/);
  });

  it("gives a note a time, never a position, and reads times as the tool form does", () => {
    const { spec } = specOf(draft({ shape: "note", name: "Contact", text: "Gained on the array", positions: "50 20 N 4 7 W", when: "none", time: "09:50Z" }), RANGE);
    expect(spec).toEqual({ shape: "note", name: "Contact", text: "Gained on the array", time: "2026-10-11T09:50:00.000Z" });
    expect(specOf(draft({ shape: "note", name: "N", when: "none" }), RANGE).problems.time).toBe("A note needs a time.");
  });

  it("keeps the style it was given, fill only for what has an inside", () => {
    const styled = { colour: "#0064BD", lineStyle: "dotted" as const, lineWidth: "3", fillColour: "#00a000", fillOpacity: "20", labelSize: "14", labelPosition: "below" as const };
    expect(specOf(draft({ name: "Z", positions: "50 20 N 4 7 W", radius: "1", ...styled })).spec!.appearance).toEqual({
      colour: "#0064bd",
      line_style: "dotted",
      line_width: 3,
      fill_colour: "#00a000",
      fill_opacity: 0.2,
      label_size: 14,
      label_position: "below",
    });
    const line = specOf(draft({ shape: "line", name: "L", positions: "50 20 N 4 7 W\n50 21 N 4 7 W", ...styled })).spec!;
    expect(line.appearance).not.toHaveProperty("fill_colour");
  });

  it("shows an annotation as it was described, and saves it unchanged", () => {
    const plot = fixture("plot/valid/annotations-every-shape.json") as DebriefFeatureCollection;
    for (const feature of plot.features) {
      if (feature.properties.kind !== "annotation" || feature.properties.furniture) continue;
      const described = specOfFeature(feature as never);
      const { spec, problems } = specOf(draftOf(described), RANGE);
      expect(problems, feature.id).toEqual({});
      expect(spec!.shape).toBe(described.shape);
      expect(spec!.appearance).toEqual(described.appearance);
      expect(spec!.time ?? spec!.time_range).toEqual(described.time ?? described.time_range);
      // Exactly, though the form shows positions to a thousandth of a minute: saved unchanged, nothing changes.
      expect(spec!.positions).toEqual(described.positions);
    }
  });

  it("keeps the exact value of every field left as shown, and reads every field changed", () => {
    const described = {
      shape: "ellipse" as const,
      name: "Imported",
      positions: [[-4.123456789, 50.333333333]] as [[number, number]],
      semi_major: { value: 1234.5678912, unit: "m" as const },
      semi_minor: { value: 987.6543219, unit: "m" as const },
      orientation: { value: 37.123456789, unit: "deg" as const },
      time_range: { start: "2026-10-11T09:30:12.345Z", end: "2026-10-11T10:00:00.999Z" },
      appearance: { fill_opacity: 0.6274 },
    };
    const shown = draftOf(described);
    expect(specOf(shown, RANGE).spec).toEqual(described);
    const changed = specOf({ ...shown, positions: "50 20 N 4 7 W", end: "11:00Z" }, RANGE).spec!;
    expect(changed.positions![0][1]).toBeCloseTo(50 + 20 / 60, 12);
    expect(changed.time_range).toEqual({ start: "2026-10-11T09:30:12.345Z", end: "2026-10-11T11:00:00.000Z" });
    expect(changed.semi_major).toEqual(described.semi_major);
    expect(specOf({ ...shown, unit: "km" }, RANGE).spec!.semi_major).toEqual({ value: 1234.567891, unit: "km" }); // the number as typed, in the unit chosen
  });

  it("sends a change as the whole description, clearing what the form leaves empty", () => {
    const shown = draftOf({ shape: "label", name: "Buoy", text: "D7", positions: [[-4, 50]], time: "2026-10-11T09:30:00.000Z", appearance: { colour: "#0064bd" } });
    const { spec } = specOf({ ...shown, text: "", when: "none", colour: "" }, RANGE);
    expect(replacing(spec!)).toMatchObject({ text: null, time: null, time_range: null, appearance: null, name: "Buoy" });
  });
});

describe("the map draws an annotation by its look", () => {
  it("draws Debrief's default: amber, dashed, an area faintly tinted", () => {
    expect(lookOf("line")).toMatchObject({ colour: DATA_COLOURS.annotation, weight: 2, dashArray: "6 5", fillOpacity: 0, labelPosition: "centre" });
    expect(lookOf("area")).toMatchObject({ weight: 1.5, fillColour: DATA_COLOURS.annotation, fillOpacity: 0.05, labelPosition: "above" });
    expect(lookOf("marker").labelPosition).toBe("right");
  });

  it("draws the analyst's style", () => {
    const look = lookOf("circle", { colour: "#0064bd", line_style: "solid", line_width: 4, fill_colour: "#00a000", label_size: 16, label_position: "none" });
    expect(look).toMatchObject({ colour: "#0064bd", weight: 4, dashArray: undefined, fillColour: "#00a000", fillOpacity: 0.25, labelSize: 16, labelPosition: "none" });
    expect(lookOf("line", { line_style: "dotted" })).toMatchObject({ dashArray: "1 4", lineCap: "round" });
    expect(lookOf("area", { colour: "#0064bd", fill_opacity: 0.5 }).fillColour).toBe("#0064bd");
    expect(lookOf("line", { fill_opacity: 0.5 }).fillOpacity).toBe(0);
  });

  it("places labels where they are asked for, and none when not shown", () => {
    expect(labelPlacement("above")?.direction).toBe("top");
    expect(labelPlacement("centre")?.direction).toBe("center");
    expect(labelPlacement("none")).toBeUndefined();
    expect(labelText("label", { name: "Buoy", text: "Buoy 7" })).toBe("Buoy 7");
    expect(labelText("marker", { name: "Datum", text: "ignored" })).toBe("Datum");
  });

  it("knows each shape, said or implied by its geometry", () => {
    expect(shapeOf({ shape: "circle", style: "shape" }, "Polygon")).toBe("circle");
    expect(shapeOf({ style: "shape" }, "Polygon")).toBe("area");
    expect(shapeOf({ style: "label" }, "Point")).toBe("label");
    expect(shapeOf({ style: "shape" }, "Point")).toBe("marker");
    expect(shapeOf({ style: "note" }, undefined)).toBe("note");
  });

  it("draws circles and ellipses along geodesics from their centre and size", () => {
    const WGS84 = geodesic.Geodesic.WGS84;
    const centre: [number, number] = [-4.12, 50.33];
    const ring = circleRing(centre, 3704);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lon, lat] of ring) expect(WGS84.Inverse(50.33, -4.12, lat, lon).s12!).toBeCloseTo(3704, 6);
    const ellipse = ellipseRing(centre, 3000, 1000, 45, 8);
    const end = WGS84.Inverse(50.33, -4.12, ellipse[0][1], ellipse[0][0]);
    expect(end.s12!).toBeCloseTo(3000, 6);
    expect(end.azi1!).toBeCloseTo(45, 9);
    expect(WGS84.Inverse(50.33, -4.12, ellipse[2][1], ellipse[2][0]).s12!).toBeCloseTo(1000, 6);
  });
});

describe("the Timeline", () => {
  const plot = {
    type: "FeatureCollection",
    schema_version: "0.0.13",
    provenance: [],
    features: [
      { type: "Feature", id: "b", geometry: null, properties: { kind: "annotation", style: "note", name: "Contact", text: "Gained on the array", time: "2026-10-11T09:50:00.000Z" } },
      { type: "Feature", id: "a", geometry: null, properties: { kind: "annotation", style: "time_period", name: "Serial", time_range: { start: "2026-10-11T09:30:00.000Z", end: "2026-10-11T10:30:00.000Z" } } },
      { type: "Feature", id: "zone", geometry: { type: "Point", coordinates: [0, 0] }, properties: { kind: "annotation", style: "shape", name: "Datum", time: "2026-10-11T09:00:00.000Z" } },
      { type: "Feature", id: "arrow", geometry: null, properties: { kind: "annotation", style: "chart_furniture", name: "North arrow", furniture: "north_arrow" } },
      { type: "Feature", id: "c", geometry: null, properties: { kind: "annotation", style: "note", name: "Hidden note", time: "2026-10-11T11:00:00.000Z", hidden: true } },
    ],
  } as DebriefFeatureCollection;

  it("lists time-only annotations in time order, with what they say", () => {
    const entries = timelineEntries(plot);
    expect(entries.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(entries[0]).toMatchObject({ name: "Serial", when: "09:30:00Z – 10:30:00Z" });
    expect(entries[1]).toMatchObject({ name: "Contact", text: "Gained on the array", when: "09:50:00Z" });
    expect(entries[2].hidden).toBe(true);
  });

  it("marks the entry current time is at", () => {
    const entries = timelineEntries(plot);
    const at = (iso: string) => currentEntry(entries, Date.parse(iso));
    expect(at("2026-10-11T09:00:00.000Z")).toBe(-1);
    expect(at("2026-10-11T09:30:00.000Z")).toBe(0);
    expect(at("2026-10-11T09:55:00.000Z")).toBe(1);
    expect(at("2026-10-11T23:00:00.000Z")).toBe(2);
  });
});

describe("annotation messages are boundary types (CON-08)", () => {
  it.each(["show-annotation-form", "show-annotation-form-to-add", "save-annotation", "delete-annotation", "edit-annotation"])("accepts %s", (name) => {
    const raw = fixture(`webview_message/valid/${name}.json`);
    expect(checkMessage(raw)).toEqual(raw);
  });
  it.each(["save-annotation-without-annotation", "delete-annotation-without-feature"])("refuses %s", (name) => {
    expect(() => checkMessage(fixture(`webview_message/invalid/semantic/${name}.json`))).toThrow();
  });
});
