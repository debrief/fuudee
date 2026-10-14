/**
 * Moving a single fix on the map, and dead reckoning (CAP-01, NFR-13): which fixes get a
 * handle of their own, what a drag or a run of arrow keys on one makes, what the map says
 * meanwhile (how far, which way, and the speeds the positions now imply), and what is
 * sent. The Leaflet side is played in the playground test (fixdrag.mjs).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkMessage } from "../../src/messages.js";
import { rangeBearing, travel, type LonLat } from "../../webview/geodesic.js";
import {
  changesNothing,
  deadReckoned,
  dragGesture,
  FIX_SPACING_PX,
  fixEdit,
  fixHandleIndices,
  fixIndexAt,
  fixMoved,
  fixReadout,
  fixTarget,
  fixToEdit,
  gestureChange,
  impliedSpeeds,
  jumpSpeed,
  MOST_FIX_HANDLES,
  NUDGE_PX,
  pressKey,
  startGesture,
  type Screen,
  type Target,
} from "../../webview/trackedit.js";

const KNOT = 1852 / 3600;
const MINUTE = 60_000;
const T0 = Date.parse("2026-10-11T09:30:00.000Z");
const TIMES = [0, 1, 2, 3, 4, 5].map((m) => T0 + m * MINUTE);
const FIX_TIMES = TIMES.map((t) => new Date(t).toISOString());
/** RED ONE: a leg at 12 kn on 045, a fix a minute. */
const RED: LonLat[] = TIMES.map((_, i) => travel([-75.5, 37.1], 45, 12 * KNOT * 60 * i));
const SCREEN: Screen = { toPoint: ([lon, lat]) => [lon * 1000, -lat * 1000], toLonLat: ([x, y]) => [x / 1000, -y / 1000] };
const target = (over: Partial<Target> = {}): Target => ({
  name: "RED ONE",
  positions: RED,
  times: TIMES,
  indices: [0, 1, 2, 3, 4, 5],
  part: false,
  pivot: RED[0],
  fixTimes: FIX_TIMES,
  jump: jumpSpeed(RED, TIMES),
  ...over,
});

describe("a fix found and moved", () => {
  it("is found by its time, the first of two at one time", () => {
    expect(fixIndexAt(FIX_TIMES, FIX_TIMES[2])).toBe(2);
    expect(fixIndexAt([FIX_TIMES[0], FIX_TIMES[1], FIX_TIMES[1]], FIX_TIMES[1])).toBe(1);
    expect(fixIndexAt(FIX_TIMES, "2026-10-11T09:30:30.000Z")).toBe(-1);
  });

  it("moves alone: every other fix stays", () => {
    const to = travel(RED[2], 200, 500);
    const moved = fixMoved(RED, 2, to);
    expect(moved[2]).toEqual(to);
    for (const i of [0, 1, 3, 4, 5]) expect(moved[i]).toEqual(RED[i]);
  });

  it("goes the distance and bearing as saved, far north and across the antimeridian too", () => {
    for (const from of [[-75.5, 37.1], [20, 85], [179.99, -30]] as LonLat[]) {
      const edit = fixEdit(FIX_TIMES[1], 777.7, 95.04);
      const to = fixTarget(from, edit);
      const { metres, bearing } = rangeBearing(from, to);
      expect(metres).toBeCloseTo(0.42 * 1852, 4); // 777.7 m is 0.42 nmi, as shown
      expect(bearing).toBeCloseTo(95, 6);
      expect(Math.abs(to[0])).toBeLessThanOrEqual(180);
    }
    expect(fixTarget(RED[0], fixToEdit(FIX_TIMES[0], [-75.4, 37.2]))).toEqual([-75.4, 37.2]);
  });

  it("says the speeds the positions imply to reach it and to go on, none past an end", () => {
    const { into, out } = impliedSpeeds(RED, TIMES, 2);
    expect(into).toEqual({ time: TIMES[1], speed: expect.closeTo(12 * KNOT, 9) });
    expect(out).toEqual({ time: TIMES[3], speed: expect.closeTo(12 * KNOT, 9) });
    expect(impliedSpeeds(RED, TIMES, 0).into).toBeUndefined();
    expect(impliedSpeeds(RED, TIMES, 5).out).toBeUndefined();
    // Two fixes at one time: no time at all to get there.
    expect(impliedSpeeds(RED, [TIMES[0], TIMES[0]], 1).into!.speed).toBeNull();
  });

  it("is as fast as a jump above three times the median speed, and never below 10 kn", () => {
    expect(jumpSpeed(RED, TIMES)).toBeCloseTo(36 * KNOT, 9);
    const slow = TIMES.map((_, i) => travel([-75.5, 37.1], 45, 1 * KNOT * 60 * i));
    expect(jumpSpeed(slow, TIMES)).toBeCloseTo(10 * KNOT, 9);
  });
});

describe("what the map says, and what it sends", () => {
  it("says the fix, how far and which way, and the speeds in and out", () => {
    const to = travel(RED[1], 45, 0.42 * 1852);
    const said = fixReadout("RED ONE", TIMES[1], 0.42 * 1852, 45, impliedSpeeds(fixMoved(RED, 1, to), TIMES, 1), jumpSpeed(RED, TIMES));
    expect(said).toBe("RED ONE fix at 09:31:00Z: moving 0.42 nmi 045.0°T; 37.2 kn from 09:30:00Z, 13.2 kn on to 09:32:00Z: faster than 36.0 kn, as a jump would be");
    // Back on the leg: nothing to warn of.
    const back = fixReadout("RED ONE", TIMES[1], 0, 0, impliedSpeeds(RED, TIMES, 1), jumpSpeed(RED, TIMES));
    expect(back).toBe("RED ONE fix at 09:31:00Z: moving 0.00 nmi 000.0°T; 12.0 kn from 09:30:00Z, 12.0 kn on to 09:32:00Z");
  });

  it("sends what it said: the fix's time, the distance in the analyst's unit and the bearing", () => {
    const edit = fixEdit(FIX_TIMES[1], 777.7, 45.04);
    expect(edit).toEqual({ action: "move_fix", fix_time: FIX_TIMES[1], distance: { value: 0.42, unit: "[nmi_i]" }, bearing: { value: 45, unit: "deg" } });
    expect(changesNothing(fixEdit(FIX_TIMES[1], 0, 45))).toBe(true);
    expect(changesNothing(edit)).toBe(false);
    for (const e of [edit, fixToEdit(FIX_TIMES[1], [-75.4, 37.2]), { action: "set_plotting_mode" as const, plotting_mode: "dr" as const }]) {
      expect(() => checkMessage({ kind: "edit_track", feature_id: "track-red", track_edit: e })).not.toThrow();
    }
    const fixtures = path.resolve(__dirname, "../../../schemas/fixtures/webview_message");
    for (const name of [
      "edit-track-move-fix-without-time",
      "edit-track-move-fix-placed-and-dragged",
      "edit-track-move-fix-with-period",
      "edit-track-move-fix-off-the-globe",
      "edit-track-move-with-fix-time",
      "edit-track-plotting-mode-missing",
      "edit-track-plotting-mode-with-period",
      "edit-track-move-with-plotting-mode",
    ]) {
      const raw = JSON.parse(readFileSync(path.join(fixtures, "invalid", "semantic", `${name}.json`), "utf8"));
      expect(() => checkMessage(raw), name).toThrow();
    }
    for (const name of ["edit-track-move-fix", "edit-track-move-fix-to-position", "edit-track-plot-as-dr"]) {
      const raw = JSON.parse(readFileSync(path.join(fixtures, "valid", `${name}.json`), "utf8"));
      expect(() => checkMessage(raw), name).not.toThrow();
    }
  });
});

describe("gestures on a fix", () => {
  it("a drag moves that fix alone, from where the drag began, as it will be saved", () => {
    let g = startGesture("fix", RED[2], undefined, FIX_TIMES[2]);
    g = dragGesture(g, [RED[2][0] + 0.001, RED[2][1]], RED[0]);
    const to: LonLat = [RED[2][0] + 0.004, RED[2][1] + 0.003];
    g = dragGesture(g, to, RED[0]);
    const change = gestureChange(g, target())!;
    const { metres, bearing } = rangeBearing(RED[2], to);
    expect(change.edit).toEqual(fixEdit(FIX_TIMES[2], metres, bearing));
    expect(change.positions[2]).toEqual(fixTarget(RED[2], change.edit));
    expect(change.handle).toEqual(change.positions[2]);
    for (const i of [0, 1, 3, 4, 5]) expect(change.positions[i]).toEqual(RED[i]);
    expect(change.readout).toMatch(/^RED ONE fix at 09:32:00Z: moving 0\.\d\d nmi \d{3}\.\d°T; [\d.]+ kn from 09:31:00Z, [\d.]+ kn on to 09:33:00Z/);
  });

  it("arrow keys nudge it by pixels; a run adds up, from where it began", () => {
    let g = startGesture("fix", RED[3], undefined, FIX_TIMES[3]);
    for (let i = 0; i < 3; i++) g = pressKey(g, "ArrowRight", false, SCREEN);
    g = pressKey(g, "ArrowDown", true, SCREEN);
    expect(g.at[0]).toBeCloseTo(RED[3][0] + (3 * NUDGE_PX) / 1000, 9);
    expect(g.at[1]).toBeCloseTo(RED[3][1] - (5 * NUDGE_PX) / 1000, 9);
    expect(g.origin).toEqual(RED[3]);
    expect(gestureChange(g, target())!.edit.fix_time).toBe(FIX_TIMES[3]);
  });

  it("a fix the track no longer has changes nothing", () => {
    const g = dragGesture(startGesture("fix", RED[2], undefined, "2026-10-11T08:00:00.000Z"), RED[3], RED[0]);
    expect(gestureChange(g, target())).toBeUndefined();
  });
});

describe("which fixes get a handle of their own", () => {
  const line = (n: number, gap: number): [number, number][] => Array.from({ length: n }, (_, i) => [10 + i * gap, 100]);

  it("every fix in view, when they are far enough apart", () => {
    expect(fixHandleIndices(line(10, FIX_SPACING_PX), [800, 600])).toEqual({ indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    // Only those on the screen.
    expect(fixHandleIndices(line(10, 100), [450, 600]).indices).toEqual([0, 1, 2, 3, 4]);
  });

  it("none, and zoom in, when they are too close or too many", () => {
    expect(fixHandleIndices(line(10, FIX_SPACING_PX - 1), [800, 600])).toEqual({ indices: [], zoomIn: true });
    expect(fixHandleIndices(line(MOST_FIX_HANDLES + 1, 15), [5000, 600])).toEqual({ indices: [], zoomIn: true });
    expect(fixHandleIndices(line(3, 100), [5, 5])).toEqual({ indices: [] });
  });
});

describe("dead reckoning, as the tool service does it (debrief_stac.tracks.dead_reckoned_positions)", () => {
  it("puts each fix where the course and speed at the fix before take it", () => {
    // The geodesic's own course at each fix, as a leg's log records it.
    const courses = RED.map((p, i) => (i < 5 ? rangeBearing(p, RED[i + 1]).bearing : 45));
    const speeds = courses.map(() => 12 * KNOT);
    const noisy = RED.map((p, i) => (i ? ([p[0], p[1] + 0.001] as LonLat) : p));
    const dr = deadReckoned(noisy, TIMES, [0, 1, 2, 3, 4, 5], courses, speeds);
    for (let i = 0; i < 6; i++) expect(rangeBearing(dr[i], RED[i]).metres).toBeLessThan(0.01);
  });
});
