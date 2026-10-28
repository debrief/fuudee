/**
 * The Outline's toolbar (product owner, 28 Oct 2026): Hidden on map in three states (all shown,
 * all hidden, mixed: pressing shows all), rows that cannot be hidden left out and said; what can
 * be coloured and why not; Select children for each kind of row, a sensor's cuts whole though
 * VS Code pages them; the selection said for a screen reader; the toolbar's roving keys.
 */
import { describe, expect, it } from "vitest";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { fixKey, legKey, outlineIndex, pickOf } from "../../webview/outlinemodel.js";
import { childrenOf, colourOf, hexColour, kindsSaid, selectionChildren, selectionColour, selectionSaid, selectionVisibility, toolbarKey } from "../../webview/outlinetoolbar.js";

const T = (minutes: number) => new Date(Date.UTC(2026, 9, 11, 9, 0) + minutes * 60_000).toISOString();
const cut = (id: string, sensor: string, minutes: number, more: Record<string, unknown> = {}) => ({
  type: "Feature",
  id,
  geometry: null,
  properties: { kind: "sensor_cut", sensor_id: sensor, time: T(minutes), bearing: { value: 45, unit: "deg" }, ...more },
});
const track = (id: string, name: string, more: Record<string, unknown> = {}) => ({
  type: "Feature",
  id,
  geometry: { type: "LineString", coordinates: [[0, 0], [0.2, 0]] },
  properties: { kind: "track", name, times: [T(-1), T(2000)], ...more },
});
const solutionTimes = Array.from({ length: 8 }, (_, i) => T(i));
/** BLUE ONE carries a towed array of four cuts (one hidden) and a hull array of 1,200, which VS Code pages by 500. */
const plot = {
  type: "FeatureCollection",
  schema_version: "0.0.24",
  provenance: [],
  features: [
    track("track-blue", "BLUE ONE", { style: { colour: "#0064bd" } }),
    track("track-red", "RED ONE", { hidden: true, style: { colour: "#e01c3e" } }),
    { type: "Feature", id: "sensor-ta", geometry: null, properties: { kind: "sensor", name: "Towed array", host_track_id: "track-blue", colour: "#8a3ffc" } },
    { type: "Feature", id: "sensor-hull", geometry: null, properties: { kind: "sensor", name: "Hull array", host_track_id: "track-blue", colour: "#00a3a3" } },
    cut("cut-1", "sensor-ta", 0),
    cut("cut-2", "sensor-ta", 1, { colour: "#e01c3e" }),
    cut("cut-3", "sensor-ta", 2),
    cut("cut-4", "sensor-ta", 3, { hidden: true }),
    ...Array.from({ length: 1200 }, (_, i) => cut(`hull-${i}`, "sensor-hull", i)),
    {
      type: "Feature",
      id: "track-contact-1",
      geometry: { type: "LineString", coordinates: solutionTimes.map((_, i) => [0.1 + i * 0.001, 0.1]) },
      properties: { kind: "track", name: "Contact 1 solution", times: solutionTimes, tma: { contact: "Contact 1", sensor_ids: ["sensor-ta"], cut_ids: ["cut-1", "cut-2"], period: { start: T(0), end: T(7) }, leg_starts: [T(4)] } },
    },
    { type: "Feature", id: "zone", geometry: { type: "Point", coordinates: [0, 0] }, properties: { kind: "annotation", style: "marker", name: "Zone", appearance: { colour: "#c7820a" } } },
    { type: "Feature", id: "furniture-north-arrow", geometry: null, properties: { kind: "annotation", style: "note", name: "North arrow", furniture: "north_arrow" } },
  ],
} as unknown as DebriefFeatureCollection;

const index = outlineIndex(plot);
const picks = (...keys: string[]) => keys.map((k) => pickOf(index, k)!);

describe("Hidden on map, in three states", () => {
  it("hides all when all are shown", () => {
    const v = selectionVisibility(index, picks("track-blue", "cut-1", "cut-2"));
    expect(v).toMatchObject({ state: "visible", action: "hide", pressed: "false", hidden: 0, ignored: 0, ids: ["track-blue", "cut-1", "cut-2"] });
    expect(v.title).toBe("Shown on the map: hide 1 track and 2 cuts.");
    expect(v.done).toBe("Hid 1 track and 2 cuts");
  });

  it("shows all when all are hidden", () => {
    const v = selectionVisibility(index, picks("track-red", "cut-4"));
    expect(v).toMatchObject({ state: "hidden", action: "show", pressed: "true", hidden: 2 });
    expect(v.title).toBe("Hidden on the map: show 1 track and 1 cut.");
    expect(v.done).toBe("Showed 1 track and 1 cut");
  });

  it("is mixed when some are hidden, and shows them all", () => {
    const v = selectionVisibility(index, picks("track-blue", "track-red", "cut-3", "cut-4"));
    expect(v).toMatchObject({ state: "mixed", action: "show", pressed: "mixed", hidden: 2, ids: ["track-blue", "track-red", "cut-3", "cut-4"] });
    expect(v.title).toBe("2 of 4 (2 tracks and 2 cuts) hidden on the map: show them all.");
  });

  it("leaves out what cannot be hidden, and says so", () => {
    const v = selectionVisibility(index, picks("track-contact-1", legKey("track-contact-1", 1), fixKey("track-contact-1", 5)));
    expect(v).toMatchObject({ state: "visible", ids: ["track-contact-1"], ignored: 2 });
    expect(v.title).toBe("Shown on the map: hide 1 TMA solution. 1 leg and 1 position cannot be hidden and are left as they are.");
    const none = selectionVisibility(index, picks(legKey("track-contact-1", 2)));
    expect(none).toMatchObject({ state: "none", ids: [], pressed: "false" });
    expect(none.action).toBeUndefined();
    expect(none.title).toMatch(/1 leg cannot be hidden/);
    expect(selectionVisibility(index, []).title).toBe("Hide or show on the map: select what to hide or show first.");
  });

  it("hides sensors, annotations and chart furniture as any feature", () => {
    expect(selectionVisibility(index, picks("sensor-ta", "zone", "furniture-north-arrow")).ids).toEqual(["sensor-ta", "zone", "furniture-north-arrow"]);
  });

  it("cannot act on an earlier revision shown read-only", () => {
    const v = selectionVisibility(index, picks("track-blue"), true);
    expect(v.action).toBeUndefined();
    expect(v.title).toMatch(/read-only/);
  });
});

describe("Colour", () => {
  it("colours tracks, solutions, sensors, cuts and annotations, leaving out what has no colour", () => {
    const c = selectionColour(index, picks("track-blue", "track-contact-1", "sensor-ta", "cut-1", "zone", "furniture-north-arrow", legKey("track-contact-1", 1)));
    expect(c.enabled).toBe(true);
    expect(c.ids).toEqual(["track-blue", "track-contact-1", "sensor-ta", "cut-1", "zone"]);
    expect(c.what).toBe("1 track, 1 TMA solution, 1 sensor, 1 cut and 1 annotation");
    expect(c.title).toBe("Colour 1 track, 1 TMA solution, 1 sensor, 1 cut and 1 annotation… 1 leg and 1 annotation have no colour and are left as they are.");
  });

  it("is disabled, with the reason, when nothing selected has a colour", () => {
    expect(selectionColour(index, [])).toMatchObject({ enabled: false, reason: "Select something with a colour first: tracks, solutions, sensors, cuts or annotations." });
    const c = selectionColour(index, picks("furniture-north-arrow", fixKey("track-contact-1", 0)));
    expect(c.enabled).toBe(false);
    expect(c.reason).toBe("Nothing selected has a colour: 1 position and 1 annotation have none. Select tracks, solutions, sensors, cuts or annotations.");
    expect(c.title).toBe(`Colour: ${c.reason}`);
    expect(selectionColour(index, picks("track-blue"), true)).toMatchObject({ enabled: false, reason: "An earlier revision is shown read-only." });
  });

  it("knows the colour they share, a cut's own or else its sensor's", () => {
    expect(colourOf(index, pickOf(index, "cut-1")!)).toBe("#8a3ffc");
    expect(colourOf(index, pickOf(index, "cut-2")!)).toBe("#e01c3e");
    expect(selectionColour(index, picks("track-red", "cut-2")).current).toBe("#e01c3e");
    expect(selectionColour(index, picks("track-red", "track-blue")).current).toBeUndefined();
    expect(colourOf(index, pickOf(index, "zone")!)).toBe("#c7820a");
  });

  it("reads a typed colour as the service wants it", () => {
    expect(hexColour("#E01C3E")).toBe("#e01c3e");
    expect(hexColour(" 0064bd ")).toBe("#0064bd");
    expect(hexColour("#abc")).toBe("#aabbcc");
    expect(hexColour("red")).toBeUndefined();
    expect(hexColour("#12345")).toBeUndefined();
  });
});

describe("Select children", () => {
  it("gives a track its sensors, a sensor its cuts, a solution its legs and a leg its positions", () => {
    expect(childrenOf(index, pickOf(index, "track-blue")!)).toEqual(["sensor-ta", "sensor-hull"]);
    expect(childrenOf(index, pickOf(index, "sensor-ta")!)).toEqual(["cut-1", "cut-2", "cut-3", "cut-4"]);
    expect(childrenOf(index, pickOf(index, "track-contact-1")!)).toEqual([legKey("track-contact-1", 1), legKey("track-contact-1", 2)]);
    expect(childrenOf(index, pickOf(index, legKey("track-contact-1", 2))!)).toEqual([4, 5, 6, 7].map((i) => fixKey("track-contact-1", i)));
    for (const leaf of ["cut-1", fixKey("track-contact-1", 0), "zone", "track-red"]) expect(childrenOf(index, pickOf(index, leaf)!)).toEqual([]);
  });

  it("gives a sensor of more cuts than VS Code's page all of them, in time order", () => {
    const hull = childrenOf(index, pickOf(index, "sensor-hull")!);
    expect(hull).toHaveLength(1200);
    expect(hull[0]).toBe("hull-0");
    expect(hull[500]).toBe("hull-500");
    expect(hull[1199]).toBe("hull-1199");
  });

  it("replaces the selection with the children of every row selected, and opens their branches", () => {
    const c = selectionChildren(index, picks("sensor-ta", legKey("track-contact-1", 1), "cut-1"));
    expect(c.keys).toEqual(["cut-1", "cut-2", "cut-3", "cut-4", ...[0, 1, 2, 3].map((i) => fixKey("track-contact-1", i))]);
    expect(c.parents).toEqual(["sensor-ta", legKey("track-contact-1", 1)]);
    expect(c.reason).toBeUndefined();
    expect(c.title).toBe("Select children: 4 positions and 4 cuts, in place of what is selected");
  });

  it("is disabled, with the reason, when the selection has no children", () => {
    expect(selectionChildren(index, picks("cut-1", "cut-2")).reason).toBe("2 cuts have no children. A track opens to its sensors, a sensor to its cuts, a solution to its legs and a leg to its positions.");
    expect(selectionChildren(index, []).reason).toBe("Select a track, a sensor, a solution or a leg first.");
  });
});

describe("the selection, said", () => {
  it("counts each kind, for a screen reader", () => {
    expect(selectionSaid(index, [])).toBe("Nothing selected");
    expect(selectionSaid(undefined, picks("track-blue"))).toBe("Nothing selected");
    expect(selectionSaid(index, picks("track-blue", "track-red", "cut-1"))).toBe("2 tracks and 1 cut selected");
    expect(kindsSaid(index, picks("track-blue", "sensor-ta", "cut-1", "cut-2", "zone"))).toBe("1 track, 1 sensor, 2 cuts and 1 annotation");
  });
});

describe("the toolbar's keys", () => {
  it("moves along the row with the arrows, wrapping, and to its ends with Home and End", () => {
    expect(toolbarKey(0, 5, "ArrowRight")).toBe(1);
    expect(toolbarKey(4, 5, "ArrowRight")).toBe(0);
    expect(toolbarKey(0, 5, "ArrowLeft")).toBe(4);
    expect(toolbarKey(2, 5, "Home")).toBe(0);
    expect(toolbarKey(2, 5, "End")).toBe(4);
    expect(toolbarKey(2, 5, "Tab")).toBeUndefined();
    expect(toolbarKey(0, 0, "ArrowRight")).toBeUndefined();
  });
});
