// The expert panel's rules for the time window (12 Oct): a window of at least a
// second, Play off when the window is too short to play, and a time a tool sets
// outside the saved window shown but never saved, with Keep and Revert.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  atLeastMinimum,
  beyondSaved,
  MINIMUM_WINDOW,
  moveEdge,
  placeToolTime,
  Player,
  realClock,
  SavedWindow,
  TICK_MS,
  tooShortReason,
  tooShortToPlay,
  WindowGesture,
  windowForTime,
  type Span,
} from "../../webview/timelogic.js";
import { describeToolRun } from "../../src/format.js";
import { Session } from "../../src/session.js";
import type { OpenedPlot } from "../../src/catalogue.js";

const t = (hhmmss: string) => Date.parse(`2023-06-15T${hhmmss.length === 5 ? `${hhmmss}:00` : hhmmss}.000Z`);
const period: Span = { start: t("08:00"), end: t("12:00") };
const s = 1000;

describe("the window is never shorter than a second", () => {
  const window = { start: t("09:00"), end: t("10:00") };
  it("stops the handles a second apart: they never cross", () => {
    expect(moveEdge(window, period, "start", t("10:30"))).toEqual({ start: t("10:00") - s, end: t("10:00") });
    expect(moveEdge(window, period, "end", t("08:00"))).toEqual({ start: t("09:00"), end: t("09:00") + s });
  });
  it("End on the start handle, or Home on the end handle, leaves a window of one second", () => {
    // The controller sends the other handle's time; moveEdge keeps the second between them.
    expect(moveEdge(window, period, "start", window.end)).toEqual({ start: window.end - s, end: window.end });
    expect(moveEdge(window, period, "end", window.start)).toEqual({ start: window.start, end: window.start + s });
  });
  it("shows a window loaded with no length as its first second, and saves it only when the analyst lets go", () => {
    const loaded = { start: t("09:00"), end: t("09:00") };
    const shown = atLeastMinimum(loaded);
    expect(shown).toEqual({ start: t("09:00"), end: t("09:00") + MINIMUM_WINDOW });
    expect(atLeastMinimum(window)).toBe(window);
    const saved: Span[] = [];
    const gesture = new WindowGesture(() => undefined, (w) => saved.push(w));
    gesture.begin(shown);
    gesture.end(); // taken hold of and let go, unmoved: nothing saved
    expect(saved).toEqual([]);
    gesture.begin(shown);
    gesture.move(moveEdge(shown, period, "end", t("09:05")));
    gesture.end();
    expect(saved).toEqual([{ start: t("09:00"), end: t("09:05") }]);
    // Saved and shown the same once normalised: no cue for a loaded zero-length window.
    expect(beyondSaved(shown, loaded)).toBeUndefined();
  });
});

describe("Play is off when the window is shorter than one tick at the chosen speed", () => {
  beforeEach(() => vi.useFakeTimers({ now: t("09:00") }));
  afterEach(() => vi.useRealTimers());

  it.each([
    [1, 99, true],
    [1, 100, false],
    [60, 5 * s, true],
    [60, 6 * s, false],
    [3600, 359 * s, true],
    [3600, 360 * s, false],
  ])("at %i×, a window of %i ms: too short %s", (speed, length, short) => {
    expect(tooShortToPlay({ start: 0, end: length }, speed)).toBe(short);
    expect(length < speed * TICK_MS).toBe(short);
  });
  it("says why, naming the speed", () => {
    expect(tooShortReason(60)).toBe("Window too short to play at 60×: widen it or slow down");
  });
  it("will not play a window too short, and plays once it is widened or slowed", () => {
    const state = { current: t("09:00"), window: { start: t("09:00"), end: t("09:00") + 2 * s } };
    let playing = false;
    const p = new Player(() => state, (ms) => (state.current = ms), (on) => (playing = on), realClock);
    p.speed = 60; // 6 s a tick
    p.play();
    expect(playing).toBe(false);
    p.speed = 10; // 1 s a tick
    p.play();
    expect(playing).toBe(true);
  });
});

describe("a tool's time outside the saved window: shown, never saved", () => {
  const saved = { start: t("09:00"), end: t("10:00") };
  it("leaves the window alone when the time is already shown", () => {
    expect(windowForTime(saved, saved, t("09:30"), period)).toBe(saved);
  });
  it("widens the saved window by the least amount that takes the time in", () => {
    expect(windowForTime(saved, saved, t("10:20"), period)).toEqual({ start: t("09:00"), end: t("10:20") });
    expect(windowForTime(saved, saved, t("08:40"), period)).toEqual({ start: t("08:40"), end: t("10:00") });
    // Whole seconds, outward, so the time is always inside.
    expect(windowForTime(saved, saved, t("10:20") + 400, period)).toEqual({ start: t("09:00"), end: t("10:20") + s });
  });
  it("widens up to twice the saved length, and no further", () => {
    expect(windowForTime(saved, saved, t("11:00"), period)).toEqual({ start: t("09:00"), end: t("11:00") }); // exactly 2×
  });
  it("beyond twice, moves instead: the saved length, centred on the time, kept in the plot's period", () => {
    expect(windowForTime(saved, saved, t("11:01"), period)).toEqual({ start: t("10:31"), end: t("11:31") });
    expect(windowForTime(saved, saved, t("11:50"), period)).toEqual({ start: t("11:00"), end: t("12:00") }); // clamped
    const short = { start: t("09:00"), end: t("09:01") };
    expect(windowForTime(short, short, t("08:00"), period)).toEqual({ start: t("08:00"), end: t("08:01") }); // clamped at the start
  });
  it("starts from the saved window, not one a tool showed before", () => {
    const widened = { start: t("09:00"), end: t("10:30") };
    expect(windowForTime(saved, widened, t("08:50"), period)).toEqual({ start: t("08:50"), end: t("10:00") });
    expect(windowForTime(saved, widened, t("09:10"), period)).toBe(widened); // shown already
  });
  it("is never saved, and says when the time is outside the saved window", () => {
    const placed = placeToolTime(t("10:20"), { start: t("09:00"), end: t("10:20") }, { saved, shown: saved, period, saveWindow: false, byHand: true, samePlot: true });
    expect(placed).toEqual({ window: { start: t("09:00"), end: t("10:20") }, save: false, outside: true });
    const inside = placeToolTime(t("09:20"), saved, { saved, shown: saved, period, saveWindow: false, byHand: true, samePlot: true });
    expect(inside.outside).toBe(false);
    expect(describeToolRun("Closest approach", { new_features: [{ properties: { kind: "annotation" } }] } as never, true)).toBe(
      "Closest approach added 1 annotation and moved current time (outside your saved window).",
    );
    expect(describeToolRun("Track summary", {} as never, false)).toBeUndefined();
  });
  it("saves the range of a tool that sets the window only when the analyst ran it by hand on this plot", () => {
    const range = { start: t("08:30"), end: t("08:45") };
    const how = { saved, shown: saved, period, saveWindow: true };
    expect(placeToolTime(t("08:30"), range, { ...how, byHand: true, samePlot: true })).toEqual({ window: range, save: true, outside: false });
    // From an agent, a command or a chain, or after the analyst moved to another plot: shown, not saved.
    expect(placeToolTime(t("08:30"), range, { ...how, byHand: false, samePlot: true })).toMatchObject({ window: range, save: false, outside: true });
    expect(placeToolTime(t("08:30"), range, { ...how, byHand: true, samePlot: false })).toMatchObject({ save: false });
  });
});

describe("the cue: Keep, Revert, and what clears it (SavedWindow)", () => {
  const saved = { start: t("09:00"), end: t("10:00") };
  const widened = { start: t("09:00"), end: t("10:20") };

  it("hatches the part beyond the saved window, and says whether it widened or moved", () => {
    expect(beyondSaved(widened, saved)).toEqual({ kind: "widened", parts: [{ start: t("10:00"), end: t("10:20") }], message: "Showing beyond saved window" });
    const moved = { start: t("10:31"), end: t("11:31") };
    expect(beyondSaved(moved, saved)).toEqual({ kind: "shifted", parts: [{ start: t("10:31"), end: t("11:31") }], message: "Showing a different period from the saved window" });
    expect(beyondSaved(saved, saved)).toBeUndefined();
  });
  it("persists while the analyst scrubs, steps or plays inside the window shown", () => {
    const window = new SavedWindow(() => undefined);
    window.saved = saved;
    // Moving current time never touches the saved window.
    for (const _ of [t("10:05"), t("10:10"), t("10:20")]) expect(window.cue(widened)?.kind).toBe("widened");
    expect(window.saved).toEqual(saved);
  });
  it("Keep saves the window shown through the normal path, and the cue goes", () => {
    const saves: Span[] = [];
    const window = new SavedWindow((w) => saves.push(w));
    window.saved = saved;
    window.keep(widened);
    expect(saves).toEqual([widened]);
    expect(window.cue(widened)).toBeUndefined();
  });
  it("Revert shows the saved window, current time moved to its nearest edge, and saves nothing", () => {
    const saves: Span[] = [];
    const window = new SavedWindow((w) => saves.push(w));
    window.saved = saved;
    expect(window.revert(t("10:15"))).toEqual({ window: saved, current: t("10:00") });
    expect(window.revert(t("09:15"))).toEqual({ window: saved, current: t("09:15") });
    expect(saves).toEqual([]);
    expect(window.cue(saved)).toBeUndefined();
  });
  it("is not fooled by saves still on their way, but shows a colleague's window", () => {
    const window = new SavedWindow(() => undefined);
    window.fromHost(saved);
    const a = { start: t("09:05"), end: t("10:00") };
    const b = { start: t("09:10"), end: t("10:00") };
    window.letGo(a);
    window.letGo(b); // two key presses, two saves
    window.fromHost(saved); // the host, before either is saved
    expect(window.cue(b)).toBeUndefined();
    window.fromHost(a); // the first saved
    expect(window.cue(b)).toBeUndefined();
    window.fromHost(b); // both
    expect(window.saved).toEqual(b);
    window.letGo(a);
    const theirs = { start: t("11:00"), end: t("11:30") };
    window.fromHost(theirs); // a colleague's, which refused ours
    expect(window.saved).toEqual(theirs);
    expect(window.cue(a)?.kind).toBe("shifted");
  });
  it("letting go of a handle or the band saves the window as left: it counts as Keep", () => {
    const window = new SavedWindow(() => undefined);
    window.saved = saved;
    const left = { start: t("09:10"), end: t("10:20") };
    const gesture = new WindowGesture(() => undefined, (w) => window.letGo(w));
    gesture.begin(widened);
    gesture.move(left);
    expect(window.cue(left)?.kind).toBe("shifted"); // still differs mid-drag (the controller hides the cue then)
    gesture.end();
    expect(window.cue(left)).toBeUndefined();
    expect(window.saved).toEqual(left);
  });
});

describe("a window a tool showed survives the plot being read again, and goes with a new saved window", () => {
  const range = { start: "2023-06-15T08:00:00.000Z", end: "2023-06-15T12:00:00.000Z" };
  const narrow = { start: "2023-06-15T09:00:00.000Z", end: "2023-06-15T10:00:00.000Z" };
  const opened = (window: { start: string; end: string }) =>
    ({
      store: { id: "s", title: "S", location: "/x", read_only: false },
      item: { id: "serial", bbox: [0, 0, 1, 1], properties: { start_datetime: range.start, end_datetime: range.end } },
      plot: {
        type: "FeatureCollection",
        schema_version: "0.0.22",
        provenance: [],
        features: [{ type: "Feature", id: "plot", geometry: null, properties: { kind: "plot", title: "P", view: { time_window: window } } }],
      },
      files: [],
    }) as unknown as OpenedPlot;
  it("keeps a moved window as shown, not widened to take in the saved one too", () => {
    const session = new Session();
    session.setPlot(opened(narrow));
    const moved = { start: "2023-06-15T10:31:00.000Z", end: "2023-06-15T11:31:00.000Z" };
    session.setTime({ current: "2023-06-15T11:01:00.000Z", range: moved }, "tool:core.closest_approach");
    session.setPlot(opened(narrow)); // read again after the tool changed the plot
    expect(session.time?.range).toEqual(moved);
    expect(session.savedWindow).toEqual(narrow); // never saved
  });
  it("tells the views when the plot's view changes, and draws faint as visible for an analyst who asks", () => {
    const session = new Session();
    session.setPlot(opened(narrow));
    let told = 0;
    session.onView(() => told++);
    session.viewChanged();
    expect(told).toBe(1);
    expect(session.contextTracks()).toBe("visible");
    (session.current!.plot.features[0].properties as { view: { context_tracks?: string } }).view.context_tracks = "faint";
    expect(session.contextShown()).toBe("faint");
    session.minimumContextContrast = true;
    expect(session.contextShown()).toBe("visible");
    (session.current!.plot.features[0].properties as { view: { context_tracks?: string } }).view.context_tracks = "hidden";
    expect(session.contextShown()).toBe("hidden");
  });
});
