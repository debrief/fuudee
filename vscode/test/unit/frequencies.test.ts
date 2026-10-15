/**
 * Labels, symbols and arrows at intervals (CAP-32): reading and naming intervals (shared
 * vectors with Python), the form's choices for several tracks, the times drawn (aligned
 * multiples of UTC, the window, the track's ends, gaps, 1 s and 24 h), thinning, and
 * where the map puts them along the track. The Leaflet side is played in the playground
 * test (frequencies.mjs).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AT_EVERY_FIX,
  changesOf,
  choiceFromValue,
  choicesFor,
  choiceOf,
  declutter,
  describeChanges,
  describeFrequencies,
  describeSetFrequencies,
  describeInterval,
  durationOf,
  everyFix,
  fixLabel,
  forcedTimes,
  formState,
  gaps,
  gridCount,
  gridTimes,
  intervalMs,
  labelBox,
  labelsWithDay,
  medianStep,
  mergeSpans,
  Occupied,
  placeLabels,
  portSide,
  PRESETS,
  readInterval,
  thinnedInterval,
  thinningNote,
  trackDetails,
  withForced,
} from "../../webview/frequencies.js";
import { pointAt, positionAt, type LonLat } from "../../webview/geodesic.js";

const repo = path.resolve(__dirname, "../../..");
const vectors = JSON.parse(readFileSync(path.join(repo, "schemas", "vectors", "fix-intervals.json"), "utf8")) as {
  read: { text: string; seconds?: number | "off" | "all"; problem?: string }[];
  describe: { seconds: number; text: string }[];
  track: { properties: Record<string, never>; text: string }[];
};
const at = (text: string) => Date.parse(text);
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("intervals as typed and named (shared vectors)", () => {
  it.each(vectors.read)("reads $text", (c) => {
    expect(readInterval(c.text)).toEqual(c.problem ? { problem: c.problem } : c.seconds);
  });
  it.each(vectors.describe)("names $seconds s", (c) => {
    expect(describeInterval(c.seconds)).toBe(c.text);
  });
  it.each(vectors.track)("says a track's intervals: $text", (c) => {
    expect(describeFrequencies(c.properties)).toBe(c.text);
  });
  it("says only those set, for a track's row", () => {
    expect(describeSetFrequencies({})).toBe("");
    expect(describeSetFrequencies({ arrow_interval: "off", label_interval: { value: 10, unit: "min" } })).toBe("Labels every 10 min · Arrows off");
  });
  it("are among a track's details, as the outline shows them", () => {
    expect(trackDetails({ name: "BLUE ONE", label_interval: { value: 10, unit: "min" } }, "09:00 to 10:00Z", true)).toBe(
      "BLUE ONE: 09:00 to 10:00Z\nPlotted by dead reckoning (DR), from its first fix by each fix's course and speed\nLabels every 10 min · Symbols default · Arrows default",
    );
  });
  it("names every preset so it reads back", () => {
    for (const s of PRESETS) expect(readInterval(describeInterval(s))).toBe(s);
  });
  it("stores in the largest unit that holds it exactly", () => {
    expect(durationOf(600)).toEqual({ value: 10, unit: "min" });
    expect(durationOf(90)).toEqual({ value: 90, unit: "s" });
    expect(durationOf(86_400)).toEqual({ value: 24, unit: "h" });
    expect(intervalMs({ value: 1000, unit: "ms" })).toBe(1000);
    expect(intervalMs("off")).toBe("off");
    expect(intervalMs(undefined)).toBeUndefined();
  });
});

describe("the form for several tracks", () => {
  const ten = { value: 10, unit: "min" } as const;
  it("shows what they share, and mixed where they differ", () => {
    const state = formState([{ label_interval: ten, arrow_interval: "off" }, { label_interval: { value: 600, unit: "s" }, arrow_interval: null }]);
    expect(state).toEqual({ label_interval: 600, symbol_interval: "off", arrow_interval: "mixed" });
  });
  it("labels and symbols left out show as off; arrows left out as the default", () => {
    expect(choiceOf("label_interval", undefined)).toBe("off");
    expect(choiceOf("symbol_interval", "off")).toBe("off");
    expect(choiceOf("arrow_interval", undefined)).toBe("default");
  });
  it("offers mixed first when mixed, the default for arrows, off and the presets, and a typed interval a track has", () => {
    const labels = choicesFor("label_interval", 90);
    expect(labels[0]).toEqual({ value: "off", label: "Off" });
    expect(labels.map((c) => c.label)).toContain("Every 1 min 30 s");
    expect(labels[1]).toEqual({ value: "all", label: "All (every fix)" });
    expect(labels).toHaveLength(3 + PRESETS.length);
    const arrows = choicesFor("arrow_interval", "mixed");
    expect(arrows.slice(0, 3).map((c) => c.value)).toEqual(["mixed", "default", "off"]);
    expect(arrows.at(-1)).toEqual({ value: "86400", label: "Every 24 h" });
  });
  it("sends only what changes: mixed and what all have already are left out", () => {
    const tracks = [{ label_interval: ten }, { label_interval: undefined, arrow_interval: "off" as const }];
    expect(changesOf(tracks, { label_interval: "mixed", symbol_interval: "off", arrow_interval: 300 })).toEqual({ arrow_interval: { value: 5, unit: "min" } });
    expect(changesOf(tracks, { label_interval: 600 })).toEqual({ label_interval: ten });
    expect(changesOf(tracks, { arrow_interval: "default" })).toEqual({ arrow_interval: null });
    expect(changesOf(tracks, { label_interval: "off" })).toEqual({ label_interval: "off" });
  });
  it("says what the step will be called, as Python names it", () => {
    expect(describeChanges({ label_interval: { value: 10, unit: "min" }, arrow_interval: { value: 5, unit: "min" } }, ["BLUE ONE", "RED ONE"])).toBe(
      "Labels every 10 min, arrows every 5 min on BLUE ONE and RED ONE",
    );
    expect(describeChanges({ symbol_interval: "off" }, ["A", "B", "C"])).toBe("Symbols off on 3 tracks");
    expect(describeChanges({ arrow_interval: null }, ["A"])).toBe("Arrows back to the default on A");
  });
  it("offers labels and symbols at every fix (legacy Debrief's All), never arrows", () => {
    expect(choicesFor("symbol_interval", "all").map((c) => c.value)).toContain("all");
    expect(choicesFor("arrow_interval", "default").map((c) => c.value)).not.toContain("all");
    expect(choiceOf("label_interval", "all")).toBe("all");
    expect(choiceFromValue("all")).toBe("all");
    expect(formState([{ label_interval: "all" }, { label_interval: "all" }]).label_interval).toBe("all");
    expect(formState([{ label_interval: "all" }, { label_interval: "off" }]).label_interval).toBe("mixed");
    expect(changesOf([{ label_interval: "off" }], { label_interval: "all" })).toEqual({ label_interval: "all" });
    expect(changesOf([{ label_interval: "all" }], { label_interval: "all" })).toEqual({});
    expect(describeChanges({ label_interval: "all", symbol_interval: "all" }, ["A"])).toBe("Labels at every fix, symbols at every fix on A");
    expect(describeSetFrequencies({ symbol_interval: "all" })).toBe("Symbols at every fix");
    expect(intervalMs("all")).toBe("all");
    expect(AT_EVERY_FIX).toEqual(["label_interval", "symbol_interval"]);
  });
});

describe("at every fix", () => {
  const times = [0, 60_000, 120_000, 125_000, 180_000, 240_000].map((t) => t + at("2026-10-15T09:00:00.000Z"));
  const whole: [number, number][] = [[times[0], times[5]]];
  it("is each fix's time in view, each once, while they are far enough apart", () => {
    expect(medianStep(times)).toBe(60_000);
    expect(everyFix(times, whole, 1 / 1000, 44)).toEqual({ times }); // 60 px apart
    expect(everyFix([...times, times[5]], whole, 1 / 1000, 44)).toEqual({ times }); // a time shared
    expect(everyFix(times, [[times[1], times[3]]], 1 / 1000, 44)).toEqual({ times: times.slice(1, 4) });
  });
  it("gives way to an interval, thinned as any is, where the fixes would crowd or pass the cap", () => {
    expect(everyFix(times, whole, 1 / 10_000, 44)).toEqual({ every: 60_000 }); // 6 px apart: every 1 min, then thinned
    expect(everyFix(times, whole, 1 / 1000, 44, 3)).toEqual({ every: 60_000 });
    expect(everyFix([0, 7000, 14_000, 21_000], [[0, 21_000]], 1 / 1000, 44)).toEqual({ every: 10_000 }); // the preset at least 7 s
  });
});

describe("the times drawn", () => {
  const track = { start: at("2026-10-15T09:03:20.000Z"), end: at("2026-10-15T10:01:00.000Z") };
  const whole: [number, number][] = [[track.start, track.end]];
  it("are whole multiples of the interval of UTC, whenever the track starts (legacy setFixes)", () => {
    const times = gridTimes(whole, 10 * MIN, track).map(iso);
    expect(times).toEqual(["09:10", "09:20", "09:30", "09:40", "09:50", "10:00"].map((t) => `2026-10-15T${t}:00.000Z`));
  });
  it("are clipped to the time window", () => {
    const window: [number, number][] = [[at("2026-10-15T09:25:00.000Z"), at("2026-10-15T09:45:00.000Z")]];
    expect(gridTimes(window, 10 * MIN, track).map(iso)).toEqual(["2026-10-15T09:30:00.000Z", "2026-10-15T09:40:00.000Z"]);
  });
  it("include the track's ends when they fall on a multiple", () => {
    const exact = { start: at("2026-10-15T09:00:00.000Z"), end: at("2026-10-15T09:30:00.000Z") };
    expect(gridTimes([[exact.start, exact.end]], 15 * MIN, exact).map(iso)).toEqual(["09:00", "09:15", "09:30"].map((t) => `2026-10-15T${t}:00.000Z`));
  });
  it("are the start alone for a track too short to hold a multiple, as legacy Debrief labels it", () => {
    const short = { start: at("2026-10-15T09:03:00.000Z"), end: at("2026-10-15T09:08:00.000Z") };
    expect(gridTimes([[short.start, short.end]], HOUR, short).map(iso)).toEqual(["2026-10-15T09:03:00.000Z"]);
    // ... and nothing when that start is outside the window.
    expect(gridTimes([[at("2026-10-15T09:05:00.000Z"), short.end]], HOUR, short)).toEqual([]);
  });
  it("go down to every second", () => {
    const minute = { start: at("2026-10-15T09:00:00.400Z"), end: at("2026-10-15T09:01:00.000Z") };
    const times = gridTimes([[minute.start, minute.end]], 1000, minute);
    expect(times).toHaveLength(60);
    expect(iso(times[0])).toBe("2026-10-15T09:00:01.000Z");
  });
  it("go up to every 24 h, on UTC midnight, with no daylight saving to shift them", () => {
    // Across the end of British Summer Time (25 Oct 2026): still 00:00Z each day.
    const week = { start: at("2026-10-23T06:00:00.000Z"), end: at("2026-10-28T06:00:00.000Z") };
    expect(gridTimes([[week.start, week.end]], DAY, week).map(iso)).toEqual(["24", "25", "26", "27", "28"].map((d) => `2026-10-${d}T00:00:00.000Z`));
  });
  it("skip a gap in the data, as smoothing treats one", () => {
    const times = [0, 1, 2, 3, 4, 40, 41, 42].map((m) => at("2026-10-15T09:00:00.000Z") + m * MIN);
    expect(gaps(times)).toEqual([[times[4], times[5]]]);
    const span = { start: times[0], end: times[times.length - 1] };
    const drawn = gridTimes([[span.start, span.end]], 10 * MIN, span, gaps(times)).map(iso);
    expect(drawn).toEqual(["2026-10-15T09:00:00.000Z", "2026-10-15T09:40:00.000Z"]);
  });
  it("stop at a limit, and are counted without being listed", () => {
    const day = { start: at("2026-10-15T00:00:00.000Z"), end: at("2026-10-16T00:00:00.000Z") };
    expect(gridCount([[day.start, day.end]], 1000)).toBe(86_401);
    expect(gridTimes([[day.start, day.end]], 1000, day, [], 100)).toHaveLength(100);
    expect(gridCount([[0, 10 * MIN], [5 * MIN, 30 * MIN]], 10 * MIN)).toBe(4);
    expect(mergeSpans([[5, 9], [0, 6], [20, 30]])).toEqual([[0, 9], [20, 30]]);
  });
});

describe("a fix always showing its label or symbol (force on only)", () => {
  it("is listed by kind, in time order; arrows have none", () => {
    const marks = [
      { time: "2026-10-15T09:13:00.000Z", show_symbol: true },
      { time: "2026-10-15T09:07:00.000Z", show_label: true, show_symbol: true },
      { time: "2026-10-15T09:20:00.000Z", label: "Turn" },
    ];
    expect(forcedTimes(marks)).toEqual({
      label_interval: [at("2026-10-15T09:07:00.000Z")],
      symbol_interval: [at("2026-10-15T09:07:00.000Z"), at("2026-10-15T09:13:00.000Z")],
      arrow_interval: [],
    });
    expect(forcedTimes(undefined).label_interval).toEqual([]);
  });
  it("joins the interval's times once, where the interval falls on it too", () => {
    expect(withForced([0, 600_000, 1_200_000], [600_000, 780_000])).toEqual([0, 600_000, 780_000, 1_200_000]);
    expect(withForced([], [780_000])).toEqual([780_000]);
  });
});

describe("thinning", () => {
  it("keeps the interval where items are far enough apart", () => {
    expect(thinnedInterval(10 * MIN, 1 / 1000, 56)).toBe(10 * MIN); // 600 px apart
  });
  it("raises it to a clock-friendly multiple: 10 min to 20 min or 1 h, never 50 min", () => {
    // 10 min is 12 px: 56 px needs 46.7 min, so 1 h (50 min, five times, is no clock interval).
    expect(thinnedInterval(10 * MIN, 12 / (10 * MIN), 56)).toBe(HOUR);
    expect(thinnedInterval(10 * MIN, 30 / (10 * MIN), 56)).toBe(20 * MIN); // twice: 60 px
    // An interval typed: 90 s goes to 3 min (twice), then 15 min (ten times) or 30 min.
    expect(thinnedInterval(90_000, 40 / 90_000, 56)).toBe(180_000);
    expect(thinnedInterval(90_000, 10 / 90_000, 56)).toBe(15 * MIN);
  });
  it("goes past 24 h by doubling when zoomed right out", () => {
    expect(thinnedInterval(HOUR, 1 / DAY, 56)).toBe(64 * DAY);
  });
  it("keeps to the cap per track", () => {
    const count = (every: number) => Math.floor(DAY / every);
    expect(thinnedInterval(MIN, 1, 10, count, 100)).toBe(15 * MIN); // 1440 a day is too many; 96 fit
  });
  it("leaves out items closer than the spacing to the last one kept, where the track is slow", () => {
    const points = [0, 5, 10, 60, 62, 130].map((x) => ({ x, y: 0 }));
    expect(declutter(points, 50)).toEqual([0, 3, 5]);
  });
  it("is said in words", () => {
    expect(thinningNote([])).toBe("");
    expect(thinningNote([{ field: "label_interval", drawn: HOUR }, { field: "arrow_interval", drawn: 30 * MIN }])).toBe(
      "Labels every 1 h, arrows every 30 min at this zoom; zoom in for more",
    );
    expect(thinningNote([{ field: "label_interval", drawn: HOUR }, { field: "label_interval", drawn: 2 * HOUR }, { field: "symbol_interval" }])).toBe(
      "Labels every 1 h or more, some symbols left out at this zoom; zoom in for more",
    );
  });
  it("says which tracks, where only some of those drawing a kind were thinned", () => {
    // RED ONE thinned, BLUE ONE drawn at its own interval: the note must not seem to speak for both.
    expect(thinningNote([{ field: "label_interval", drawn: 20 * MIN, track: "RED ONE" }, { field: "arrow_interval", drawn: 10 * MIN, track: "RED ONE" }], { label_interval: 2, arrow_interval: 2 })).toBe(
      "Labels every 20 min, arrows every 10 min on RED ONE at this zoom; zoom in for more",
    );
    expect(thinningNote([{ field: "label_interval", drawn: HOUR, track: "A" }, { field: "label_interval", drawn: HOUR, track: "B" }, { field: "arrow_interval", drawn: HOUR, track: "A" }], { label_interval: 3, arrow_interval: 1 })).toBe(
      "Labels every 1 h on A and B, arrows every 1 h at this zoom; zoom in for more",
    );
    // Every track drawing labels thinned: no names.
    expect(thinningNote([{ field: "label_interval", drawn: HOUR, track: "A" }], { label_interval: 1 })).toBe("Labels every 1 h at this zoom; zoom in for more");
    expect(thinningNote(["A", "B", "C"].map((track) => ({ field: "label_interval" as const, drawn: HOUR, track })), { label_interval: 4 })).toBe(
      "Labels every 1 h on 3 tracks at this zoom; zoom in for more",
    );
  });
});

describe("time labels kept clear of one another", () => {
  const east = { x: 1, y: 0 };
  it("lays a label out as the map draws it: off its point by the leader, centred across it", () => {
    expect(labelBox({ x: 100, y: 100 }, east, 30)).toEqual({ x0: 109, y0: 94, x1: 139, y1: 106 });
    expect(labelBox({ x: 100, y: 100 }, { x: -1, y: 0 }, 30)).toEqual({ x0: 61, y0: 94, x1: 91, y1: 106 });
    expect(labelBox({ x: 100, y: 100 }, { x: 0, y: -1 }, 30)).toEqual({ x0: 85, y0: 79, x1: 115, y1: 91 });
  });
  it("finds what overlaps, with a pixel to spare", () => {
    const taken = new Occupied();
    taken.add({ x0: 0, y0: 0, x1: 10, y1: 10 });
    expect(taken.hits({ x0: 10.5, y0: 0, x1: 20, y1: 10 })).toBe(true);
    expect(taken.hits({ x0: 12, y0: 0, x1: 20, y1: 10 })).toBe(false);
    expect(taken.hits({ x0: -500, y0: 5, x1: 500, y1: 6 })).toBe(true); // across many cells
  });
  it("goes to port; to starboard where port is taken; left out where both are", () => {
    const taken = new Occupied();
    const label = { at: { x: 100, y: 100 }, side: east, width: 30 };
    // The first to port; the second, at the same point, to starboard; the third left out.
    expect(placeLabels([label, label, label], taken)).toEqual([east, { x: -1, y: 0 }, undefined]);
  });
  it("places a fix's label always shown first, and never leaves it out", () => {
    const taken = new Occupied();
    taken.add({ x0: 0, y0: 0, x1: 200, y1: 200 }); // a track's name, say, over both sides
    const regular = { at: { x: 100, y: 100 }, side: east, width: 30 };
    expect(placeLabels([regular, { ...regular, forced: true }], taken)).toEqual([undefined, east]);
    const clear = new Occupied();
    expect(placeLabels([regular, { ...regular, forced: true }], clear)).toEqual([{ x: -1, y: 0 }, east]);
  });
  it("keeps clear of what is already there, such as a fix's own label beside it", () => {
    const taken = new Occupied();
    taken.add(labelBox({ x: 100, y: 100 }, east, 40)); // "Turn 1", to the right of the fix
    expect(placeLabels([{ at: { x: 100, y: 100 }, side: east, width: 30 }], taken)).toEqual([{ x: -1, y: 0 }]);
  });
});

describe("labels", () => {
  const zulu = { time_zone: "UTC" };
  it("are HHmm, as legacy Debrief labels fixes; ddHHmm on the first of a day; .ss where the interval has seconds", () => {
    const t = at("2026-10-15T09:30:05.000Z");
    expect(fixLabel(at("2026-10-15T09:30:00.000Z"), 10 * MIN, zulu, false)).toBe("0930");
    expect(fixLabel(at("2026-10-15T09:30:00.000Z"), 10 * MIN, zulu, true)).toBe("150930");
    expect(fixLabel(t, 5000, zulu, false)).toBe("0930.05");
  });
  it("carry the day on the first label of each day", () => {
    const times = ["2026-10-15T22:00:00.000Z", "2026-10-15T23:00:00.000Z", "2026-10-16T00:00:00.000Z", "2026-10-16T01:00:00.000Z"].map(at);
    expect(labelsWithDay(times, zulu)).toEqual([true, false, true, false]);
  });
  it("follow the analyst's time zone, where they chose one", () => {
    expect(fixLabel(at("2026-10-15T09:30:00.000Z"), 10 * MIN, { time_zone: "Europe/London" }, false)).toBe("1030");
  });
  it("go to port of the course", () => {
    const round = (v: { x: number; y: number }) => ({ x: Math.round(v.x) + 0, y: Math.round(v.y) + 0 });
    expect(round(portSide(0))).toEqual({ x: -1, y: 0 }); // heading north: to the west
    expect(round(portSide(90))).toEqual({ x: 0, y: -1 }); // heading east: to the north
    expect(round(portSide(180))).toEqual({ x: 1, y: 0 });
    expect(round(portSide(270))).toEqual({ x: 0, y: 1 });
  });
});

describe("where along the track", () => {
  const coordinates: LonLat[] = [
    [-4, 50],
    [-4, 50.1],
    [-4, 50.1],
    [-3.9, 50.1],
  ];
  const times = ["09:00", "09:10", "09:20", "09:30"].map((t) => at(`2026-10-15T${t}:00.000Z`));
  it("is where the marker at current time would be, with the course there", () => {
    for (let t = times[0]; t <= times[3]; t += 37_000) {
      expect(pointAt(coordinates, times, t)?.position).toEqual(positionAt(coordinates, times, t));
    }
    const north = pointAt(coordinates, times, at("2026-10-15T09:05:00.000Z"))!;
    expect(north.course).toBeCloseTo(0, 6);
    const east = pointAt(coordinates, times, at("2026-10-15T09:25:00.000Z"))!;
    expect(east.course).toBeGreaterThan(89.9);
    expect(east.course).toBeLessThan(90.1);
  });
  it("keeps the last course while stopped, and leaves along the next leg at a fix", () => {
    expect(pointAt(coordinates, times, at("2026-10-15T09:15:00.000Z"))!.course).toBeCloseTo(0, 6);
    expect(pointAt(coordinates, times, times[2])!.course).toBeGreaterThan(89.9);
    expect(pointAt(coordinates, times, times[3])!.course).toBeGreaterThan(89.9);
    expect(pointAt(coordinates, times, times[3] + 1)).toBeUndefined();
    expect(pointAt([[-4, 50]], [times[0]], times[0])).toEqual({ position: [-4, 50] });
  });
});
