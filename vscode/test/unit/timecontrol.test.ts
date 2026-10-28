import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bandKey,
  describeSpeed,
  describeStep,
  describeWindow,
  extentOf,
  fractionOf,
  moveEdge,
  readTypedTime,
  tickLabel,
  ticksFor,
  timeAt,
  windowToInclude,
  Player,
  realClock,
  shiftWindow,
  SPEEDS,
  stepFor,
  TICK_MS,
  WindowGesture,
  type Span,
} from "../../webview/timelogic.js";
import { describeLength } from "../../webview/timecontrol.js";
import { Session } from "../../src/session.js";
import { parseTime } from "../../src/timeinput.js";
import { setViewOf, timeWindowOf, viewOf } from "../../src/hidden.js";
import type { OpenedPlot } from "../../src/catalogue.js";

const t = (hhmm: string) => Date.parse(`2023-06-15T${hhmm}:00.000Z`);
const period: Span = { start: t("08:00"), end: t("12:00") };

describe("the time window stays within the plot's period (CAP-28)", () => {
  it("moves one edge, stopping a second short of the other, never outside the period", () => {
    const window = { start: t("09:00"), end: t("10:00") };
    expect(moveEdge(window, period, "start", t("08:30"))).toEqual({ start: t("08:30"), end: t("10:00") });
    expect(moveEdge(window, period, "start", t("07:00"))).toEqual({ start: t("08:00"), end: t("10:00") });
    expect(moveEdge(window, period, "start", t("11:00"))).toEqual({ start: t("10:00") - 1000, end: t("10:00") });
    expect(moveEdge(window, period, "end", t("13:00"))).toEqual({ start: t("09:00"), end: t("12:00") });
    expect(moveEdge(window, period, "end", t("08:30"))).toEqual({ start: t("09:00"), end: t("09:00") + 1000 });
  });
  it("keeps to whole seconds, as the analyst reads it", () => {
    const moved = moveEdge({ start: t("09:00"), end: t("10:00") }, period, "start", t("09:00") + 1499);
    expect(moved.start).toBe(t("09:00") + 1000);
  });
  it("moves the whole window, keeping its length, stopping at the period's ends", () => {
    const window = { start: t("09:00"), end: t("10:00") };
    expect(shiftWindow(window, period, 30 * 60000)).toEqual({ start: t("09:30"), end: t("10:30") });
    expect(shiftWindow(window, period, 5 * 3600000)).toEqual({ start: t("11:00"), end: t("12:00") });
    expect(shiftWindow(window, period, -5 * 3600000)).toEqual({ start: t("08:00"), end: t("09:00") });
  });
  it("widens where it can go to take in a window already outside the period", () => {
    expect(extentOf(period, { start: t("07:00"), end: t("09:00") })).toEqual({ start: t("07:00"), end: t("12:00") });
    expect(extentOf(undefined, { start: t("09:00"), end: t("10:00") })).toEqual({ start: t("09:00"), end: t("10:00") });
  });
});

describe("steps and speeds, as the analyst reads them", () => {
  it("steps by about a hundredth of the span", () => {
    expect(stepFor({ start: 0, end: 4 * 3600000 })).toBe(300000); // four hours: 5 min
    expect(stepFor({ start: 0, end: 60000 })).toBe(1000); // a minute: 1 s
    expect(stepFor({ start: 0, end: 28 * 86400000 })).toBe(43200000); // four weeks: 12 h
    expect(stepFor({ start: 0, end: 200 * 86400000 })).toBe(86400000); // longer: never more than a day
  });
  it.each([
    [1000, "1 s"],
    [300000, "5 min"],
    [7200000, "2 h"],
    [86400000, "1 day"],
  ])("%i ms is %s", (ms, text) => expect(describeStep(ms)).toBe(text));
  it("says what each speed means", () => {
    expect(SPEEDS).toEqual([1, 10, 60, 600, 3600]);
    expect(describeSpeed(60)).toBe("60× real time: 1 min of the plot each second");
    expect(describeSpeed(3600)).toBe("3600× real time: 1 h of the plot each second");
    expect(describeSpeed(10)).toBe("10× real time: 10 s of the plot each second");
  });
  it("says how long the window is", () => {
    expect(describeLength(4.5 * 3600000)).toBe("4 h 30 min");
    expect(describeLength(3 * 86400000 + 2 * 3600000)).toBe("3 days 2 h");
    expect(describeLength(30000)).toBe("30 s");
  });
});

describe("playing (fake timers)", () => {
  beforeEach(() => vi.useFakeTimers({ now: t("09:00") }));
  afterEach(() => vi.useRealTimers());

  function player(start: number, window: Span = { start: t("09:00"), end: t("10:00") }) {
    const state = { current: start, window, playing: false, moves: [] as number[] };
    const p = new Player(
      () => ({ current: state.current, window: state.window }),
      (ms) => {
        state.current = ms;
        state.moves.push(ms);
      },
      (playing) => (state.playing = playing),
      realClock,
    );
    return { p, state };
  }

  it("moves current time at the chosen speed, ten times a second", () => {
    const { p, state } = player(t("09:00"));
    p.speed = 60;
    p.play();
    expect(state.playing).toBe(true);
    vi.advanceTimersByTime(TICK_MS);
    expect(state.current).toBe(t("09:00") + 6000); // a tenth of a second at 60×: six seconds
    vi.advanceTimersByTime(10 * TICK_MS);
    expect(state.current).toBe(t("09:01") + 6000);
    expect(state.moves).toHaveLength(11);
  });
  it("stops at the end of the window, and starts again from its start", () => {
    const { p, state } = player(t("09:59"));
    p.speed = 600;
    p.play();
    vi.advanceTimersByTime(TICK_MS); // 60 s of plot: exactly the end
    expect(state.current).toBe(t("10:00"));
    expect(state.playing).toBe(false);
    vi.advanceTimersByTime(10 * TICK_MS);
    expect(state.moves).toEqual([t("10:00")]); // stopped: no more ticks
    p.play();
    expect(state.current).toBe(t("09:00"));
  });
  it("pauses, and plays on from a time set elsewhere meanwhile", () => {
    const { p, state } = player(t("09:00"));
    p.speed = 10;
    p.toggle();
    vi.advanceTimersByTime(TICK_MS);
    p.toggle();
    expect(state.playing).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(state.current).toBe(t("09:00") + 1000);
    state.current = t("09:30"); // a tool moved current time
    p.play();
    vi.advanceTimersByTime(TICK_MS);
    expect(state.current).toBe(t("09:30") + 1000);
  });
  it("follows a speed changed while playing", () => {
    const { p, state } = player(t("09:00"));
    p.speed = 1;
    p.play();
    vi.advanceTimersByTime(TICK_MS);
    p.speed = 3600;
    vi.advanceTimersByTime(TICK_MS);
    expect(state.current).toBe(t("09:00") + 100 + 360000);
  });
});

describe("the window is saved when the analyst lets go, not as it moves (SUB-22)", () => {
  it("shows every movement, and saves once, the last", () => {
    const moved: Span[] = [];
    const saved: Span[] = [];
    const gesture = new WindowGesture((w) => moved.push(w), (w) => saved.push(w));
    const from = { start: t("09:00"), end: t("10:00") };
    gesture.begin(from);
    gesture.move({ start: t("09:10"), end: t("10:00") });
    gesture.begin({ start: t("09:10"), end: t("10:00") }); // a key held down repeats: the same gesture
    gesture.move({ start: t("09:20"), end: t("10:00") });
    gesture.move({ start: t("09:20"), end: t("10:00") }); // no movement: nothing to show
    expect(moved).toHaveLength(2);
    expect(saved).toEqual([]);
    gesture.end();
    expect(saved).toEqual([{ start: t("09:20"), end: t("10:00") }]);
    gesture.end(); // a blur after the key up: nothing more
    expect(saved).toHaveLength(1);
  });
  it("saves nothing when the window ends where it began, or is let go without saving", () => {
    const saved: Span[] = [];
    const gesture = new WindowGesture(() => undefined, (w) => saved.push(w));
    const from = { start: t("09:00"), end: t("10:00") };
    gesture.begin(from);
    gesture.move({ start: t("09:30"), end: t("10:00") });
    gesture.move(from);
    gesture.end();
    gesture.begin(from);
    gesture.move({ start: t("09:30"), end: t("10:00") });
    gesture.cancel();
    gesture.end();
    expect(saved).toEqual([]);
  });
});

describe("current time and the time window in shared state (SUB-22, SUB-26)", () => {
  const range = { start: "2023-06-15T08:00:00.000Z", end: "2023-06-15T12:00:00.000Z" };
  const opened = (window?: { start: string; end: string }) =>
    ({
      store: { id: "s", title: "S", location: "/x", read_only: false },
      item: { id: "serial", bbox: [0, 0, 1, 1], properties: { start_datetime: range.start, end_datetime: range.end } },
      plot: {
        type: "FeatureCollection",
        schema_version: "0.0.24",
        provenance: [],
        features: [{ type: "Feature", id: "plot", geometry: null, properties: { kind: "plot", title: "P", ...(window && { view: { time_window: window } }) } }],
      },
      files: [],
    }) as unknown as OpenedPlot;
  const narrow = { start: "2023-06-15T09:00:00.000Z", end: "2023-06-15T10:00:00.000Z" };

  it("opens on the saved window, and knows the plot's whole period", () => {
    const session = new Session();
    session.setPlot(opened(narrow));
    expect(session.time).toEqual({ current: narrow.start, range: narrow });
    expect(session.period()).toEqual(range);
    expect(session.savedWindow).toEqual(narrow);
  });
  it("shows a window a colleague changed when the plot is read again, keeping current time inside it", () => {
    const session = new Session();
    session.setPlot(opened());
    session.setTime({ current: "2023-06-15T11:30:00.000Z", range }, "time");
    session.setPlot(opened(narrow)); // read again: the island changed
    expect(session.time).toEqual({ current: narrow.end, range: narrow });
  });
  it("tells every view when the window is saved or changed elsewhere", () => {
    const session = new Session();
    session.setPlot(opened());
    const heard: string[] = [];
    session.onState((change, origin) => heard.push(`${change.time?.range.start}:${origin}`));
    session.windowChanged(narrow, "plot-view");
    expect(session.time?.range).toEqual(narrow);
    expect(heard).toEqual([`${narrow.start}:plot-view`]);
    session.windowChanged(narrow, "plot-view"); // the same again: nothing to tell
    expect(heard).toHaveLength(1);
    session.windowChanged(undefined, "plot-view"); // the window removed: the whole period
    expect(session.time?.range).toEqual(range);
  });
});

describe("the view in memory follows what the service read (SUB-22)", () => {
  it("replaces the island on the plot's own details, and only there", () => {
    const window = { start: "2023-06-15T09:00:00.000Z", end: "2023-06-15T10:00:00.000Z" };
    const plot = {
      type: "FeatureCollection",
      schema_version: "0.0.24",
      provenance: [],
      features: [{ type: "Feature", id: "plot", geometry: null, properties: { kind: "plot", title: "P" } }],
    } as unknown as Parameters<typeof viewOf>[0];
    expect(viewOf(plot)).toBeUndefined();
    expect(setViewOf(plot, { time_window: window })).toBe(true);
    expect(timeWindowOf(plot)).toEqual(window);
    expect(setViewOf(plot, null)).toBe(true);
    expect(viewOf(plot)).toBeUndefined();
    expect(setViewOf({ ...plot, features: [] }, { time_window: window })).toBe(false); // nowhere to keep it
  });
});

describe("the scrubber and the overview strip map places to times (product owner, 28 Oct 2026)", () => {
  const window = { start: t("09:00"), end: t("10:00") };
  it("maps the scrubber's travel to the window, whole seconds, never outside it", () => {
    expect(timeAt(0, window)).toBe(t("09:00"));
    expect(timeAt(0.5, window)).toBe(t("09:30"));
    expect(timeAt(1, window)).toBe(t("10:00"));
    expect(timeAt(-0.2, window)).toBe(t("09:00"));
    expect(timeAt(1.3, window)).toBe(t("10:00"));
    expect(timeAt(0.25 + 0.4 / 3600000, window) % 1000).toBe(0);
    expect(fractionOf(t("09:15"), window)).toBe(0.25);
    expect(fractionOf(t("08:00"), window)).toBe(0);
    expect(fractionOf(t("11:00"), window)).toBe(1);
    expect(fractionOf(t("09:00"), { start: t("09:00"), end: t("09:00") })).toBe(0);
  });
  it("maps the strip to the whole plot: the band where the window is", () => {
    expect(fractionOf(window.start, period)).toBe(0.25);
    expect(fractionOf(window.end, period)).toBe(0.5);
    expect(timeAt(0.75, period)).toBe(t("11:00"));
  });
  it("drags the band: the window moves, keeping its length, and stops at the plot's ends", () => {
    const by = timeAt(0.5, period) - timeAt(0.25, period); // a quarter of the strip
    expect(shiftWindow(window, period, by)).toEqual({ start: t("10:00"), end: t("11:00") });
    expect(shiftWindow(window, period, 3 * by)).toEqual({ start: t("11:00"), end: t("12:00") });
  });
  it("drags an edge: the window resizes, a second long at least", () => {
    expect(moveEdge(window, period, "end", timeAt(0.75, period))).toEqual({ start: t("09:00"), end: t("11:00") });
    expect(moveEdge(window, period, "start", timeAt(0.6, period))).toEqual({ start: t("10:00") - 1000, end: t("10:00") });
  });
  it("a time outside the window moves the window to take it in, centred, within the plot", () => {
    expect(windowToInclude(window, period, t("09:20"))).toBe(window);
    expect(windowToInclude(window, period, t("11:00"))).toEqual({ start: t("10:30"), end: t("11:30") });
    expect(windowToInclude(window, period, t("11:50"))).toEqual({ start: t("11:00"), end: t("12:00") });
    expect(windowToInclude(window, period, t("08:05"))).toEqual({ start: t("08:00"), end: t("09:00") });
  });
});

describe("the band from the keyboard: arrows move the window, Shift and arrows resize it", () => {
  const window = { start: t("09:00"), end: t("10:00") };
  const step = stepFor(period); // 5 min over four hours
  it("moves by a step, ten with Page Up and Page Down, to the plot's ends with Home and End", () => {
    expect(bandKey(window, period, "ArrowRight", false)).toEqual({ start: t("09:05"), end: t("10:05") });
    expect(bandKey(window, period, "ArrowLeft", false)).toEqual({ start: t("08:55"), end: t("09:55") });
    expect(bandKey(window, period, "PageUp", false)).toEqual({ start: t("09:50"), end: t("10:50") });
    expect(bandKey(window, period, "Home", false)).toEqual({ start: t("08:00"), end: t("09:00") });
    expect(bandKey(window, period, "End", false)).toEqual({ start: t("11:00"), end: t("12:00") });
    expect(step).toBe(300000);
  });
  it("resizes from its end with Shift, never under a second nor past the plot", () => {
    expect(bandKey(window, period, "ArrowRight", true)).toEqual({ start: t("09:00"), end: t("10:05") });
    expect(bandKey(window, period, "ArrowLeft", true)).toEqual({ start: t("09:00"), end: t("09:55") });
    expect(bandKey(window, period, "End", true)).toEqual({ start: t("09:00"), end: t("12:00") });
    expect(bandKey(window, period, "Home", true)).toEqual({ start: t("09:00"), end: t("09:00") + 1000 });
    expect(bandKey({ start: t("09:00"), end: t("09:00") + 1000 }, period, "ArrowLeft", true)).toEqual({ start: t("09:00"), end: t("09:00") + 1000 });
  });
  it("leaves other keys alone", () => {
    expect(bandKey(window, period, "Enter", false)).toBeUndefined();
    expect(bandKey(window, period, " ", false)).toBeUndefined();
  });
});

describe("the scrubber's tick labels and the window's summary", () => {
  it("chooses an interval that leaves each label room, on whole multiples of it", () => {
    const ticks = ticksFor(period, 250);
    expect(ticks.map((k) => k.label)).toEqual(["09:00", "10:00", "11:00"]);
    expect(ticks[0].fraction).toBe(0.25);
    expect(ticksFor(period, 500).map((k) => k.label)).toEqual(["08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
    expect(ticksFor({ start: t("09:00"), end: t("09:02") }, 250).map((k) => k.label)).toEqual(["09:00:30", "09:01:00", "09:01:30"]);
    expect(ticksFor({ start: Date.parse("2023-06-15T00:00:00Z"), end: Date.parse("2023-06-22T00:00:00Z") }, 250).map((k) => k.label)).toEqual(["16 Jun", "18 Jun", "20 Jun"]);
  });
  it("leaves out a label too near either end to be drawn whole, and draws none in no room", () => {
    expect(ticksFor(period, 250).some((k) => k.label === "08:00" || k.label === "12:00")).toBe(false);
    expect(ticksFor(period, 0)).toEqual([]);
    expect(ticksFor({ start: t("09:00"), end: t("09:00") }, 250)).toEqual([]);
  });
  it("labels as precisely as the interval needs", () => {
    expect(tickLabel(t("09:30"), 600000)).toBe("09:30");
    expect(tickLabel(t("09:30") + 15000, 15000)).toBe("09:30:15");
    expect(tickLabel(t("09:30"), 86400000)).toBe("15 Jun");
  });
  it("says the window short, seconds only where an end has them, the day where it crosses one", () => {
    expect(describeWindow(period)).toBe("08:00–12:00Z");
    expect(describeWindow({ start: t("09:40") + 5000, end: t("10:20") })).toBe("09:40:05–10:20:00Z");
    expect(describeWindow({ start: Date.parse("2023-06-15T22:00:00Z"), end: Date.parse("2023-06-16T02:00:00Z") })).toBe("15 Jun 22:00Z – 16 Jun 02:00Z");
  });
});

describe("a time typed into the controller", () => {
  it("reads the forms the tool forms take, and a time of day without its Z, on the plot's day", () => {
    expect(readTypedTime("10:31:30Z", period, parseTime)).toBe(t("10:31") + 30000);
    expect(readTypedTime("10:31:30", period, parseTime)).toBe(t("10:31") + 30000);
    expect(readTypedTime(" 1031 ", period, parseTime)).toBe(t("10:31"));
    expect(readTypedTime("15 Jun 2023 10:31:30Z", period, parseTime)).toBe(t("10:31") + 30000);
    expect(readTypedTime("151031Z JUN 23", period, parseTime)).toBe(t("10:31"));
  });
  it("is not a time when it is not one", () => {
    expect(readTypedTime("soon", period, parseTime)).toBeUndefined();
    expect(readTypedTime("25:00", period, parseTime)).toBeUndefined();
  });
});
