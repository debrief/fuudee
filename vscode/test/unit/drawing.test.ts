/**
 * Drawing and editing annotations on the map (CAP-03, NFR-13): what each click
 * makes, what the map says while drawing, and what dragging or nudging a handle
 * does. The Leaflet side is played in the playground test.
 */
import { describe, expect, it } from "vitest";
import geodesic from "geographiclib-geodesic";
import { DEFAULT_SETTINGS } from "@debrief/kernel";
import type { AnnotationSpec } from "@debrief/schemas";
import { drawnDraft, specOf } from "../../webview/annotationdraft.js";
import {
  dragTo,
  dropRepeats,
  editReadout,
  finishProblem,
  formatArea,
  handleAfter,
  handlesOf,
  hint,
  isComplete,
  lengthIn,
  placePoint,
  readout,
  removeLast,
  removeVertex,
  sameGeometry,
  specOfDrawing,
  startDrawing,
  type Drawing,
} from "../../webview/drawing.js";
import { rangeBearing, travel, type LonLat } from "../../webview/geodesic.js";
import { checkMessage } from "../../src/messages.js";

const WGS84 = geodesic.Geodesic.WGS84;
const CENTRE: LonLat = [-75.5, 37];
const NMI = 1852;
const place = (drawing: Drawing, ...points: LonLat[]) => points.reduce(placePoint, drawing);
const at = (bearing: number, nmi: number, from = CENTRE) => travel(from, bearing, nmi * NMI);

describe("drawing a line or an area", () => {
  it("adds a vertex per click, removes the last with Backspace, and is finished by the analyst", () => {
    let area = place(startDrawing("area"), CENTRE, at(90, 2));
    expect(area.points).toHaveLength(2);
    expect(isComplete(area)).toBe(false);
    expect(finishProblem(area)).toBe("An area needs at least 3 different corners.");
    area = place(area, at(45, 3));
    expect(finishProblem(area)).toBeUndefined();
    area = removeLast(area);
    expect(area.points).toHaveLength(2);
    expect(finishProblem(area)).toBeDefined();
    expect(removeLast(removeLast(removeLast(area))).points).toEqual([]);
  });

  it("a double-click places one point, not two", () => {
    const line = place(startDrawing("line"), CENTRE, at(90, 2), at(90, 2));
    const same = (a: LonLat, b: LonLat) => a[0] === b[0] && a[1] === b[1];
    expect(dropRepeats(line, same).points).toHaveLength(2);
    expect(finishProblem(place(startDrawing("line"), CENTRE, CENTRE))).toBe("A line needs at least 2 different positions.");
  });

  it("makes the description the form shows, its name left to the analyst", () => {
    const corners = [CENTRE, at(90, 2), at(45, 3)];
    const spec = specOfDrawing(place(startDrawing("area"), ...corners));
    expect(spec).toEqual({ shape: "area", name: "", positions: corners });
    // The form reads it back; it needs only a name to be added.
    const draft = drawnDraft(spec);
    expect(draft.shown).toBeUndefined();
    expect(draft.name).toBe("");
    expect(specOf(draft).problems).toEqual({ name: "Give the annotation a name." });
    const named = specOf({ ...draft, name: "Transit lane" }).spec!;
    expect(named.positions).toHaveLength(3);
    // Read back from the form's text: within a thousandth of a minute of where it was drawn.
    named.positions!.forEach((p, i) => expect(rangeBearing(p as LonLat, corners[i]).metres).toBeLessThan(2));
  });

  it("says the leg, the range and bearing from the start, and the area, in the analyst's units", () => {
    const area = place(startDrawing("area"), CENTRE, at(90, 2));
    const said = readout(area, at(0, 3, at(90, 2)));
    expect(said).toBe("2 corners placed · leg 3.00 nmi 000.0°T · from start 3.60 nmi 033.7°T · area 3.00 nmi²");
    const line = place(startDrawing("line"), CENTRE);
    expect(readout(line, at(270, 1.5))).toBe("1 position placed · leg 1.50 nmi 270.0°T · from start 1.50 nmi 270.0°T · length 1.50 nmi");
    // In yards, if the analyst reads lengths in yards.
    const yards = { ...DEFAULT_SETTINGS, length_unit: "[yd_i]" as const, length_decimals: 0 };
    expect(readout(line, at(270, 1), yards)).toContain("leg 2025 yd 270.0°T");
  });

  it("the pointer where the last point was placed adds nothing", () => {
    const line = place(startDrawing("line"), CENTRE, at(90, 2));
    expect(readout(line, at(90, 2))).toBe("2 positions placed · leg 2.00 nmi 090.0°T · from start 2.00 nmi 090.0°T · length 2.00 nmi");
  });

  it("measures an area along geodesics", () => {
    // A square of 10 nmi a side near the equator: 100 nmi², within a fraction of a percent.
    const sw: LonLat = [0, 0];
    const corners = [sw, at(90, 10, sw), at(0, 10, at(90, 10, sw)), at(0, 10, sw)];
    const said = readout(place(startDrawing("area"), ...corners), undefined);
    const area = Number(/area (\d+\.\d+) nmi²/.exec(said)![1]);
    expect(area).toBeGreaterThan(99.5);
    expect(area).toBeLessThan(100.5);
    expect(formatArea(NMI * NMI * 2.346)).toBe("2.35 nmi²");
  });
});

describe("drawing a circle or an ellipse", () => {
  it("a circle is its centre, then a click (or the end of a drag) at its radius", () => {
    let circle = placePoint(startDrawing("circle"), CENTRE);
    expect(isComplete(circle)).toBe(false);
    expect(hint(circle)).toMatch(/set the radius/);
    expect(readout(circle, at(60, 2.346))).toMatch(/^Radius 2\.35 nmi · bearing 060\.0°T · area 17\.\d\d nmi²$/);
    circle = placePoint(circle, at(60, 2.346));
    expect(isComplete(circle)).toBe(true);
    // The radius kept is the one the map said: in the analyst's unit, to their decimals.
    expect(specOfDrawing(circle)).toEqual({ shape: "circle", name: "", positions: [CENTRE], radius: { value: 2.35, unit: "[nmi_i]" } });
    expect(finishProblem(circle)).toBeUndefined();
    // A further click changes nothing.
    expect(placePoint(circle, CENTRE)).toBe(circle);
  });

  it("a circle with no radius is not finished", () => {
    expect(finishProblem(place(startDrawing("circle"), CENTRE, CENTRE))).toBe("Give the circle a radius: click away from its centre.");
  });

  it("an ellipse is its centre, the end of its longer axis (its orientation), then its side", () => {
    let ellipse = place(startDrawing("ellipse"), CENTRE, at(45, 4));
    expect(readout(ellipse, undefined)).toBe("Semi-major 4.00 nmi · orientation 045.0°T");
    // Anywhere along a line at right angles to the axis gives the same width.
    const side = at(135, 1.5);
    expect(readout(ellipse, side)).toMatch(/^Semi-major 4\.00 nmi · semi-minor 1\.50 nmi · orientation 045\.0°T · area 18\.\d\d nmi²$/);
    ellipse = placePoint(ellipse, side);
    expect(isComplete(ellipse)).toBe(true);
    expect(specOfDrawing(ellipse)).toEqual({
      shape: "ellipse",
      name: "",
      positions: [CENTRE],
      semi_major: { value: 4, unit: "[nmi_i]" },
      semi_minor: { value: 1.5, unit: "[nmi_i]" },
      orientation: { value: 45, unit: "deg" },
    });
    // The side can never make the shorter axis the longer.
    const wide = specOfDrawing(place(startDrawing("ellipse"), CENTRE, at(0, 1), at(90, 3)));
    expect(wide.semi_minor).toEqual({ value: 1, unit: "[nmi_i]" });
    expect(finishProblem(place(startDrawing("ellipse"), CENTRE, at(0, 1), at(0, 0.5)))).toBe("Give the ellipse a width: click to one side of its longer axis.");
  });

  it("a label or a marker is one click", () => {
    const label = placePoint(startDrawing("label"), CENTRE);
    expect(isComplete(label)).toBe(true);
    expect(specOfDrawing(label)).toEqual({ shape: "label", name: "", positions: [CENTRE] });
  });

  it("keeps lengths to the decimals the analyst reads, or three figures if smaller", () => {
    expect(lengthIn(4 * NMI, "[nmi_i]")).toEqual({ value: 4, unit: "[nmi_i]" });
    expect(lengthIn(3, "[nmi_i]")).toEqual({ value: 0.00162, unit: "[nmi_i]" });
    expect(lengthIn(1234.5678, "m")).toEqual({ value: 1234.57, unit: "m" });
  });
});

const AREA: AnnotationSpec = { shape: "area", name: "Transit lane", positions: [CENTRE, at(90, 2), at(45, 3)], appearance: { colour: "#00a000" } };
const CIRCLE: AnnotationSpec = { shape: "circle", name: "Exclusion zone", positions: [CENTRE], radius: { value: 4, unit: "km" } };
const ELLIPSE: AnnotationSpec = {
  shape: "ellipse",
  name: "Search area",
  positions: [CENTRE],
  semi_major: { value: 5, unit: "[nmi_i]" },
  semi_minor: { value: 2, unit: "[nmi_i]" },
  orientation: { value: 60, unit: "deg" },
};

describe("handles on a selected annotation", () => {
  it("an area has a handle at each corner, between each pair (its closing side too), and one to move it all", () => {
    const handles = handlesOf(AREA);
    expect(handles.map((h) => h.role)).toEqual(["vertex", "vertex", "vertex", "midpoint", "midpoint", "midpoint", "move"]);
    expect(handles[0].label).toBe("Area 'Transit lane': corner 1 of 3; drag it, or use the arrow keys; Delete removes it");
    expect(handles[5].label).toMatch(/between corners 3 and 1/);
    // A line has no closing side.
    expect(handlesOf({ ...AREA, shape: "line" }).filter((h) => h.role === "midpoint")).toHaveLength(2);
  });

  it("a circle has its centre and its radius; an ellipse its centre, axis end and side", () => {
    const [centre, radius] = handlesOf(CIRCLE);
    expect(centre.at).toEqual(CENTRE);
    expect(rangeBearing(CENTRE, radius.at).metres).toBeCloseTo(4000, 3);
    const [, major, minor] = handlesOf(ELLIPSE);
    const m = rangeBearing(CENTRE, major.at);
    expect(m.metres).toBeCloseTo(5 * NMI, 3);
    expect(m.bearing).toBeCloseTo(60, 6);
    expect(rangeBearing(CENTRE, minor.at).bearing).toBeCloseTo(150, 6);
    expect(handlesOf({ shape: "note", name: "n", time: "2026-10-11T09:00:00.000Z" })).toEqual([]);
  });

  it("dragging a corner moves it; the drag starts from where it was, so it is never applied twice", () => {
    const handle = handlesOf(AREA)[1];
    const to = at(100, 2.5);
    const once = dragTo(AREA, handle, to);
    expect(once.positions![1]).toEqual(to);
    expect(once.positions![0]).toEqual(CENTRE);
    expect(dragTo(AREA, handle, to)).toEqual(once);
    expect(once.appearance).toEqual(AREA.appearance);
    expect(sameGeometry(once, AREA)).toBe(false);
    expect(sameGeometry(dragTo(AREA, handle, AREA.positions![1] as LonLat), AREA)).toBe(true);
  });

  it("dragging a midpoint adds a corner there, which the handle then is", () => {
    const mid = handlesOf(AREA).find((h) => h.role === "midpoint" && h.index === 2)!;
    const to = at(200, 1);
    const added = dragTo(AREA, mid, to);
    expect(added.positions).toEqual([...AREA.positions!, to]);
    expect(handleAfter(mid)).toEqual({ role: "vertex", index: 3 });
    expect(editReadout(added, mid)).toMatch(/^Area 'Transit lane': corner 4 at .* · from the one before .* · area .* nmi²$/);
  });

  it("the move handle moves every corner by the same change of longitude and latitude", () => {
    const move = handlesOf(AREA).find((h) => h.role === "move")!;
    const moved = dragTo(AREA, move, [move.at[0] + 0.1, move.at[1] - 0.05]);
    moved.positions!.forEach((p, i) => {
      expect(p[0] - AREA.positions![i][0]).toBeCloseTo(0.1, 12);
      expect(p[1] - AREA.positions![i][1]).toBeCloseTo(-0.05, 12);
    });
  });

  it("a circle's radius handle sets the radius, kept in the circle's own unit", () => {
    const [, radius] = handlesOf(CIRCLE);
    const resized = dragTo(CIRCLE, radius, at(10, 3));
    expect(resized.radius).toEqual({ value: 5.56, unit: "km" });
    expect(resized.positions).toEqual(CIRCLE.positions);
    expect(editReadout(resized, radius)).toBe("Circle 'Exclusion zone': radius 3.00 nmi");
  });

  it("an ellipse's axis end sets its length and orientation; its side its width, never longer than the axis", () => {
    const [, major, minor] = handlesOf(ELLIPSE);
    const turned = dragTo(ELLIPSE, major, at(90, 6));
    expect(turned.semi_major).toEqual({ value: 6, unit: "[nmi_i]" });
    expect(turned.orientation).toEqual({ value: 90, unit: "deg" });
    expect(turned.semi_minor).toEqual(ELLIPSE.semi_minor);
    // Shorter than the semi-minor axis, the longer axis stops at it.
    expect(dragTo(ELLIPSE, major, at(90, 1)).semi_major).toEqual({ value: 2, unit: "[nmi_i]" });
    expect(dragTo(ELLIPSE, minor, at(150, 3)).semi_minor).toEqual({ value: 3, unit: "[nmi_i]" });
    expect(dragTo(ELLIPSE, minor, at(150, 9)).semi_minor).toEqual({ value: 5, unit: "[nmi_i]" });
  });

  it("a vertex can be removed down to the fewest the kind needs, and no further", () => {
    const four = { ...AREA, positions: [...AREA.positions!, at(180, 1)] as AnnotationSpec["positions"] };
    const removed = removeVertex(four, 1);
    expect("spec" in removed && removed.spec.positions).toEqual([four.positions![0], four.positions![2], four.positions![3]]);
    expect(removeVertex(AREA, 0)).toEqual({ problem: "An area needs at least 3 corners, so this one can't be removed." });
    expect(removeVertex({ ...AREA, shape: "line", positions: AREA.positions!.slice(0, 2) as AnnotationSpec["positions"] }, 0)).toEqual({
      problem: "A line needs at least 2 positions, so this one can't be removed.",
    });
  });

  it("nudging is dragging a little at a time: three nudges of a corner move it three times as far", () => {
    let spec = AREA;
    let handle = handlesOf(spec)[0];
    for (let i = 0; i < 3; i++) {
      spec = dragTo(spec, handle, [handle.at[0] + 0.01, handle.at[1]]);
      handle = handlesOf(spec)[0];
    }
    expect(spec.positions![0][0]).toBeCloseTo(CENTRE[0] + 0.03, 12);
  });
});

describe("messages", () => {
  it("what the map sends is what the host accepts", () => {
    const drawn = specOfDrawing(place(startDrawing("circle"), CENTRE, at(0, 2)));
    expect(() => checkMessage({ kind: "annotation_drawn", annotation: drawn })).not.toThrow();
    const moved = dragTo(CIRCLE, handlesOf(CIRCLE)[0], at(0, 1));
    expect(() => checkMessage({ kind: "edit_annotation", feature_id: "annotation-exclusion-zone", annotation: moved })).not.toThrow();
    expect(() => checkMessage({ kind: "edit_annotation", feature_id: "annotation-exclusion-zone" })).not.toThrow();
    expect(() => checkMessage({ kind: "annotation_drawn" })).toThrow(/annotation_drawn needs annotation/);
  });
});

// The geodesic helpers agree with GeographicLib itself.
it("range, bearing and travel are the WGS84 geodesic's", () => {
  const b = at(33, 7);
  const g = WGS84.Inverse(CENTRE[1], CENTRE[0], b[1], b[0]);
  expect(rangeBearing(CENTRE, b).metres).toBeCloseTo(g.s12!, 6);
  expect(rangeBearing(CENTRE, b).bearing).toBeCloseTo(33, 9);
});
