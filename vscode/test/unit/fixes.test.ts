/**
 * Cleaning tracks and marking fixes (CAP-01, EXT-14): what the analyst types for a
 * jump threshold and a smoothing window, how jumps and fixes are listed, which fix a
 * mark is on, the coloured legs the map draws, the Timeline's fix comments, and the
 * map's messages. The Leaflet side is played in the playground test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@debrief/kernel";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { checkMessage } from "../../src/messages.js";
import { timelineEntries } from "../../src/timeline.js";
import { describeFix, describeJump, describeMark, describeMetres, describeWindow, fixRows, jumpsFound, markAt, marksByIndex, readSpeed, readWindow, smoothingNote, type FixTrack } from "../../webview/fixes.js";
import { FIX_COLOURS } from "../../webview/palette.js";

const T = (minute: number) => `2026-10-11T09:${String(minute).padStart(2, "0")}:00.000Z`;
const track: FixTrack = {
  id: "track-blue",
  geometry: { coordinates: [[-4.12, 50.33], [-4.11, 50.33], [-4.1, 50.33], [-4.09, 50.33]] },
  properties: {
    name: "BLUE ONE",
    times: [T(0), T(1), T(1), T(2)],
    courses: { unit: "deg", values: [90, 90, 91, 92] },
    speeds: { unit: "[kn_i]", values: [12, 12, 12.5, 13] },
    fix_marks: [
      { time: T(1), colour: "#ffd700", label: "Turn", comment: "Wheel over\nsecond line" },
      { time: T(2), comment: "Last" },
    ],
  },
};
const fixture = (name: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../../../schemas/fixtures", name), "utf8"));
const named = (colour: string) => FIX_COLOURS.find((c) => c.colour === colour)?.name.toLowerCase();

describe("marked fixes", () => {
  it("are on the first fix at their time", () => {
    const marks = marksByIndex(track);
    expect([...marks.keys()]).toEqual([1, 3]);
    expect(marks.get(1)?.label).toBe("Turn");
    expect(markAt(track, T(2))?.comment).toBe("Last");
    expect(markAt(track, T(0))).toBeUndefined();
    expect(marksByIndex({ ...track, properties: { ...track.properties, fix_marks: null } }).size).toBe(0);
  });

  it("say what they are in a few words", () => {
    expect(describeMark(markAt(track, T(1)), named)).toBe("coloured yellow · labelled 'Turn' · Wheel over");
    expect(describeMark({ time: T(0), colour: "#123456" })).toBe("coloured its own colour");
    expect(describeMark(undefined)).toBe("");
  });

  it("are listed in the fix list with every fix, in time order", () => {
    const rows = fixRows(track, DEFAULT_SETTINGS, named);
    expect(rows.map((r) => r.label)).toEqual(["09:00:00Z", "09:01:00Z", "09:01:00Z", "09:02:00Z"]);
    expect(rows[1].description).toMatch(/^50°19\.800'N 004°06\.600'W {2}· {2}090\.0°T {2}· {2}12\.0 kn$/);
    expect(rows[1].mark).toBe("coloured yellow · labelled 'Turn' · Wheel over");
    expect(rows[2].mark).toBe(""); // the second fix at that time has none
    expect(describeFix(track, 0)).toContain("09:00:00Z");
  });

  it("show their comments in the Timeline, at their fix's time, with the narrative", () => {
    const plot = {
      type: "FeatureCollection",
      schema_version: "0.0.15",
      provenance: [],
      features: [
        { type: "Feature", id: "note", geometry: null, properties: { kind: "annotation", style: "note", name: "Contact", time: T(1) } },
        { type: "Feature", id: "track-blue", geometry: { type: "LineString", coordinates: track.geometry.coordinates }, properties: { kind: "track", ...track.properties } },
      ],
    } as unknown as DebriefFeatureCollection;
    const entries = timelineEntries(plot);
    expect(entries.map((e) => e.id)).toEqual(["note", `fix:track-blue:${T(1)}`, `fix:track-blue:${T(2)}`]);
    expect(entries[1]).toMatchObject({ name: "BLUE ONE fix", text: "Wheel over", when: "09:01:00Z", hidden: false });
  });
});

describe("finding jumps", () => {
  it("reads the threshold typed, in the analyst's unit or another", () => {
    expect(readSpeed("30")).toEqual({ value: 30, unit: "[kn_i]" });
    expect(readSpeed("30.5 kn")).toEqual({ value: 30.5, unit: "[kn_i]" });
    expect(readSpeed("15 m/s")).toEqual({ value: 15, unit: "m/s" });
    expect(readSpeed(" 40 km/h ")).toEqual({ value: 40, unit: "km/h" });
    expect(readSpeed("fast")).toHaveProperty("problem");
    expect(readSpeed("30 furlongs")).toHaveProperty("problem");
    expect((readSpeed("0") as { problem: string }).problem).toMatch(/above zero/);
  });

  it("lists each jump with when, where and how fast", () => {
    const row = describeJump({ time: T(5), position: [-4.12, 50.33], speed: { value: 64.83, unit: "[kn_i]" }, since: T(4) });
    expect(row).toEqual({ label: "09:05:00Z", description: "50°19.800'N 004°07.200'W · 64.8 kn to reach from 09:04:00Z" });
    const same = describeJump({ time: T(5), position: [-4.12, 50.33], speed: null, since: T(5) });
    expect(same.description).toMatch(/at the same time as the fix before, somewhere else$/);
  });

  it("says what was found", () => {
    expect(jumpsFound("BLUE ONE", 3, { value: 30, unit: "[kn_i]" })).toBe("BLUE ONE: 3 jumps found, each faster than 30.0 kn to reach. Check them on the map and in the list.");
    expect(jumpsFound("BLUE ONE", 1, { value: 15.4333, unit: "m/s" })).toMatch(/^BLUE ONE: 1 jump found, each faster than 30\.0 kn/);
    expect(jumpsFound("BLUE ONE", 0, { value: 30, unit: "[kn_i]" })).toBe("BLUE ONE: no jumps found faster than 30.0 kn.");
  });
});

describe("smoothing", () => {
  it("reads an odd number of fixes from 3 to 99", () => {
    expect(readWindow("5")).toBe(5);
    expect(readWindow(" 7 fixes")).toBe(7);
    for (const bad of ["4", "1", "101", "five", ""]) expect(readWindow(bad)).toHaveProperty("problem");
    expect(describeWindow(5)).toBe("each fix averaged with the 2 either side of it");
  });

  it("says what a preview would do", () => {
    expect(smoothingNote("BLUE ONE", 5, "28 fixes moved; the most a fix moved: 0.03 nmi, at 09:31:00Z")).toBe(
      "BLUE ONE smoothed over 5 fixes, if applied: 28 fixes moved; the most a fix moved: 0.03 nmi, at 09:31:00Z.",
    );
    expect(describeMetres(1852)).toBe("1.00 nmi");
    expect(describeMetres(4)).toBe("4 m");
  });
});

describe("the map's messages for cleaning tracks are boundary types (CON-08)", () => {
  it.each(["show-fixes-jumps", "show-fixes-preview", "show-fixes-cleared", "fix-chosen"])("accepts %s", (name) => {
    const raw = fixture(`webview_message/valid/${name}.json`);
    expect(checkMessage(raw)).toEqual(raw);
  });
  it.each(["fix-chosen-without-time", "show-fixes-with-selection"])("refuses %s", (name) => {
    expect(() => checkMessage(fixture(`webview_message/invalid/semantic/${name}.json`))).toThrow();
  });
  it.each(["fix-chosen-time-not-utc", "show-fixes-preview-one-position"])("refuses %s", (name) => {
    expect(() => checkMessage(fixture(`webview_message/invalid/schema/${name}.json`))).toThrow();
  });
});
