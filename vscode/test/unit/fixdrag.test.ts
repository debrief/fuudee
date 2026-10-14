/**
 * Moving a single fix on the map, and dead reckoning (CAP-01, NFR-13): which fixes get a
 * handle of their own, what a drag or a run of arrow keys on one makes, what the map says
 * meanwhile (how far, which way, and the speeds the positions now imply), and what is
 * sent. The Leaflet side is played in the playground test (fixdrag.mjs).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkMessage, trackEditProblems } from "../../src/messages.js";
import { describeJump, jumpsFound, trackLabel } from "../../webview/fixes.js";
import { rangeBearing, travel, type LonLat } from "../../webview/geodesic.js";
import {
  changesNothing,
  deadReckoned,
  dragGesture,
  drFixMoved,
  drMoved,
  drSheared,
  drStretched,
  drTurned,
  FIX_SPACING_PX,
  fixEdit,
  fixHandleIndices,
  fixIndexAt,
  fixMeans,
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
  reckoningOf,
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

describe("a track plotted by dead reckoning", () => {
  it("is tagged DR beside its name on the map; its line is drawn as any track's", () => {
    expect(trackLabel({ name: "RED ONE", plotting_mode: "dr" })).toBe("RED ONE (DR)");
    expect(trackLabel({ name: "RED ONE", plotting_mode: "otg" })).toBe("RED ONE");
    expect(trackLabel({ name: "RED ONE" })).toBe("RED ONE");
  });

  it("is plotted over the ground again discarding changes only when the edit says so, and only then", () => {
    expect(trackEditProblems({ action: "set_plotting_mode", plotting_mode: "otg", discard_dr_changes: true })).toEqual([]);
    expect(trackEditProblems({ action: "set_plotting_mode", plotting_mode: "dr", discard_dr_changes: true })).toEqual([
      "track_edit: only plotting a track over the ground discards changes made while it was plotted by dead reckoning",
    ]);
  });
});

// --- Editing a track plotted by dead reckoning (decision, product owner, 14 Oct 2026) ---------

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

  // RED ONE plotted by dead reckoning: 12 kn on 045, the geodesic's own course at each fix.
  const COURSES = RED.map((p, i) => (i < 5 ? rangeBearing(p, RED[i + 1]).bearing : 45));
  const DR = { courses: COURSES, speeds: COURSES.map(() => 12 * KNOT) };
  const drTarget = (over: Partial<Target> = {}) => target({ reckoning: DR, ...over });

  it("a fix dragged changes the leg into it, and the fixes after follow", () => {
    const to: LonLat = [RED[2][0] + 0.004, RED[2][1] + 0.003];
    const g = dragGesture(startGesture("fix", RED[2], undefined, FIX_TIMES[2]), to, RED[0]);
    const change = gestureChange(g, drTarget())!;
    const { metres, bearing } = rangeBearing(RED[2], to);
    expect(change.edit).toEqual(fixEdit(FIX_TIMES[2], metres, bearing));
    expect(rangeBearing(change.positions[2], fixTarget(RED[2], change.edit)).metres).toBeLessThan(1e-6);
    expect(change.handle).toEqual(change.positions[2]);
    expect(rangeBearing(change.positions[1], RED[1]).metres).toBeLessThan(1e-6);
    // Each later leg as it was: the fixes after it follow.
    for (const i of [3, 4, 5]) {
      const was = rangeBearing(RED[i - 1], RED[i]);
      const now = rangeBearing(change.positions[i - 1], change.positions[i]);
      expect(now.metres).toBeCloseTo(was.metres, 6);
      expect(now.bearing).toBeCloseTo(was.bearing, 2);
    }
    expect(change.readout).toMatch(/^RED ONE \(DR\) fix at 09:32:00Z: moving 0\.\d\d nmi \d{3}\.\d°T; leg into it now \d{3}\.\d°T [\d.]+ kn \(was 045\.0°T 12\.0 kn\); the fixes after follow/);
  });

  it("the first fix dragged moves where dead reckoning starts", () => {
    const g = dragGesture(startGesture("fix", RED[0], undefined, FIX_TIMES[0]), [RED[0][0], RED[0][1] + 0.002], RED[0]);
    const change = gestureChange(g, drTarget())!;
    expect(change.readout).toBe("RED ONE (DR) fix at 09:30:00Z: moving 0.12 nmi 000.0°T; dead reckoning starts here, so every fix follows");
    expect(rangeBearing(change.positions[5], RED[5]).metres).toBeCloseTo(0.12 * 1852, 0);
  });

  it("a move of the whole track moves its origin; of a window, the leg into it", () => {
    const g = dragGesture(startGesture("move", RED[2]), travel(RED[2], 90, 1852), RED[0]);
    const whole = gestureChange(g, drTarget())!;
    expect(whole.readout).toBe("RED ONE (DR): moving 1.00 nmi 090.0°T");
    expect(rangeBearing(RED[0], whole.positions[0]).metres).toBeCloseTo(1852, 3);
    const part = gestureChange(g, drTarget({ indices: [2, 3], part: true }))!;
    expect(part.readout).toMatch(/^RED ONE \(DR\): moving 1\.00 nmi 090\.0°T; leg into 09:32:00Z now \d{3}\.\d°T [\d.]+ kn; it and the fixes after follow, by dead reckoning$/);
    expect(rangeBearing(part.positions[1], RED[1]).metres).toBeLessThan(1e-6);
    expect(rangeBearing(part.positions[5], travel(RED[5], 90, 1852)).metres).toBeLessThan(5);
  });

  it("a rotation turns the courses: of a window, about its first fix, and the fixes after follow on", () => {
    const g = { ...startGesture("rotate", RED[5]), degrees: 10 };
    const part = gestureChange(g, drTarget({ indices: [2, 3], part: true, pivot: RED[0] }))!;
    expect(part.readout).toMatch(/^RED ONE \(DR\): rotating 10\.0° clockwise about .*; the courses in the time window turn, and the fixes after follow on, by dead reckoning$/);
    expect(part.edit).toMatchObject({ action: "rotate", angle: { value: 10, unit: "deg" }, pivot: RED[2] });
    expect(rangeBearing(part.positions[2], RED[2]).metres).toBeLessThan(1e-6);
    expect(rangeBearing(part.positions[2], part.positions[3]).bearing).toBeCloseTo(COURSES[2] + 10, 6);
  });

  it("a shear adds one set to every leg; a stretch scales every speed; each says so", () => {
    const shear = gestureChange(dragGesture(startGesture("end", RED[5], "shear"), travel(RED[5], 135, 500), RED[0]), drTarget())!;
    expect(shear.readout).toMatch(/^RED ONE \(DR\): shearing to \d{3}\.\d°T [\d.]+ kn; end moved 0\.27 nmi 135\.0°T; one set and drift is added to every leg$/);
    const to = travel(RED[5], shear.edit.bearing!.value, shear.edit.distance!.value * 1852);
    expect(rangeBearing(shear.handle!, to).metres).toBeLessThan(1e-3);
    const stretch = gestureChange({ ...startGesture("end", RED[3], "stretch"), speed: 15 }, drTarget({ indices: [1, 2, 3], part: true }))!;
    expect(stretch.readout).toBe("RED ONE (DR): stretching to 15.0 kn (was 12.0 kn); every speed in the time window is scaled, and the fixes after follow on, by dead reckoning");
  });

  it("the form says the leg into the fix, plotted by dead reckoning", () => {
    const to = travel(RED[3], 0, 185.2);
    expect(fixMeans("RED ONE", RED, TIMES, 3, to, jumpSpeed(RED, TIMES), DR)).toMatch(/^RED ONE \(DR\) fix at 09:33:00Z: moves 0\.10 nmi 000\.0°T; leg into it now \d{3}\.\d°T [\d.]+ kn \(was 045\.0°T 12\.0 kn\); the fixes after follow$/);
    expect(fixMeans("RED ONE", RED, TIMES, 3, to, jumpSpeed(RED, TIMES))).toMatch(/^RED ONE fix at 09:33:00Z: moves 0\.10 nmi 000\.0°T; [\d.]+ kn from 09:32:00Z/);
    // A fix at the time of the one before cannot be put anywhere else.
    const same = [TIMES[0], TIMES[1], TIMES[1], TIMES[3], TIMES[4], TIMES[5]];
    expect(drFixMoved(RED, same, DR, 2, to)).toBeUndefined();
  });

  it("reads a DR track's courses and speeds in degrees and metres a second; none over the ground", () => {
    const props = { plotting_mode: "dr", courses: { unit: "deg", values: [45, 90] }, speeds: { unit: "[kn_i]", values: [12, 6] } };
    expect(reckoningOf(props)).toEqual({ courses: [45, 90], speeds: [expect.closeTo(12 * KNOT, 9), expect.closeTo(6 * KNOT, 9)] });
    expect(reckoningOf({ ...props, plotting_mode: "otg" })).toBeUndefined();
    expect(reckoningOf({ ...props, speeds: null })).toBeUndefined();
  });

  it("a jump on a DR track is a wild logged speed, said so", () => {
    const jump = { time: FIX_TIMES[3], position: RED[3], speed: { value: 180, unit: "[kn_i]" }, since: FIX_TIMES[4], logged: true };
    expect(describeJump(jump).description).toMatch(/· logged 180\.0 kn on to 09:34:00Z$/);
    expect(jumpsFound("RED ONE (DR)", 1, { value: 36, unit: "[kn_i]" }, undefined, true)).toBe(
      "RED ONE (DR): 1 jump found, each logged faster than 36.0 kn, so dead reckoning takes the leg from it too far. Check them on the map and in the list.",
    );
  });
});
