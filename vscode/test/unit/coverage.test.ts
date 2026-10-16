/**
 * Collation's logic in TypeScript (CAP-05, CAP-08, CAP-09): spans, platform names and
 * periods held to the vectors Python is held to; a track's coverage piece by piece for the
 * Timeline; where things lie along Coverage's bars; and the messages the view sends.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CoverageReport, DebriefFeatureCollection, TrackSupply } from "@debrief/schemas";
import { along, choices, coveragePieces, extentOf, linkWords, nextSource, periods, platformKey, plotTitleOf, spans, untaken } from "../../webview/coveragelogic.js";
import { coverageId, timelineEntries } from "../../src/timeline.js";
import { checkMessage } from "../../src/messages.js";

const repo = path.resolve(__dirname, "../../..");
const vectors = JSON.parse(readFileSync(path.join(repo, "schemas/vectors/collation.json"), "utf8")) as {
  spans: { name: string; times: string[]; spans: [string, string][] }[];
  platform_keys: { name: string; key: string }[];
  periods: { name: string; sources: [string, string][][]; periods: { start: string; end: string; sources: number[] }[] }[];
};
const iso = (ms: number) => new Date(ms).toISOString();

describe("spans, as Python works them out (schemas/vectors/collation.json)", () => {
  it.each(vectors.spans)("$name", (c) => {
    expect(spans(c.times.map(Date.parse)).map(([a, b]) => [iso(a), iso(b)])).toEqual(c.spans);
  });
});

describe("platform names, as Python matches them", () => {
  it.each(vectors.platform_keys)("$name", (c) => expect(platformKey(c.name)).toBe(c.key));
});

describe("periods, as Python cuts them", () => {
  it.each(vectors.periods)("$name", (c) => {
    const got = periods(c.sources.map((s) => s.map(([a, b]) => [Date.parse(a), Date.parse(b)] as [number, number])));
    expect(got.map((p) => ({ start: iso(p.start), end: iso(p.end), sources: p.sources }))).toEqual(c.periods);
  });
});

const T = (hhmm: string) => `2023-06-15T${hhmm}:00.000Z`;
const minutes = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(T(from)); t <= Date.parse(T(to)); t += 60_000) out.push(iso(t));
  return out;
};

describe("a track's coverage, piece by piece, for the Timeline (CAP-05)", () => {
  it("is the plot's own data where nothing else supplies it", () => {
    expect(coveragePieces(minutes("08:00", "08:30"), undefined)).toEqual([{ start: Date.parse(T("08:00")), end: Date.parse(T("08:30")), fixes: 31 }]);
  });
  it("is cut where the item supplying it changes, and at gaps", () => {
    const times = [...minutes("08:00", "08:30"), ...minutes("09:30", "09:40")];
    const supplies: TrackSupply[] = [
      { catalogue: "c", item: "p", track: "t", title: "Serial 1", start: T("08:00"), end: T("08:09") },
      { catalogue: "c", item: "log", track: "t", title: "Nav log", revision: `sha256:${"1".repeat(64)}`, start: T("08:10"), end: T("08:20") },
      { catalogue: "c", item: "p", track: "t", title: "Serial 1", start: T("08:21"), end: T("09:40") },
    ];
    const pieces = coveragePieces(times, supplies).map((p) => [iso(p.start).slice(11, 16), iso(p.end).slice(11, 16), p.source ?? "own", p.fixes]);
    expect(pieces).toEqual([
      ["08:00", "08:09", "own", 10],
      ["08:10", "08:20", "Nav log", 11],
      ["08:21", "08:30", "own", 10],
      ["09:30", "09:40", "own", 11],
    ]);
  });
});

describe("the Timeline lists each track's data coverage (CAP-05, CAP-08)", () => {
  const plot: DebriefFeatureCollection = {
    type: "FeatureCollection",
    schema_version: "0.0.21",
    provenance: [],
    features: [
      {
        type: "Feature",
        id: "track-blue",
        geometry: { type: "LineString", coordinates: minutes("08:00", "08:10").map((_, i) => [-75 + i * 0.001, 37]) as [[number, number], [number, number], ...[number, number][]] },
        properties: { kind: "track", name: "BLUE ONE", times: minutes("08:00", "08:10"), style: { colour: "#2e6fd8" } },
      },
      { type: "Feature", id: "plot", geometry: null, properties: { kind: "plot", title: "Serial 1" } },
    ],
  };
  it("names the plot's own data by the plot's title, with the track and how many fixes", () => {
    const rows = timelineEntries(plot).filter((e) => e.kind === "coverage");
    expect(rows).toEqual([
      {
        id: coverageId("track-blue", T("08:00")),
        kind: "coverage",
        start: T("08:00"),
        end: T("08:10"),
        source: "Serial 1",
        entry_type: "Data",
        text: "BLUE ONE: 11 fixes",
        track: "track-blue",
        colour: "#2e6fd8",
      },
    ]);
    expect(plotTitleOf(plot)).toBe("Serial 1");
  });
});

const report: CoverageReport = {
  catalogue: "c",
  item: "p",
  title: "Serial 1",
  start: T("08:00"),
  end: T("10:00"),
  items: [],
  platforms: [
    {
      track: "track-blue",
      name: "BLUE ONE",
      sources: [
        { catalogue: "c", item: "p", track: "track-blue", name: "BLUE ONE", title: "Serial 1", link: "plot", fixes: 121, spans: [{ start: T("08:00"), end: T("10:00") }] },
        { catalogue: "c", item: "log", track: "t", name: "Blue One", title: "Nav log", link: "proposed", fixes: 181, spans: [{ start: T("09:00"), end: T("09:30") }] },
      ],
      periods: [
        { start: T("08:00"), end: T("09:00"), sources: [0], chosen: 0 },
        { start: T("09:00"), end: T("09:30"), sources: [0, 1], chosen: 0 },
        { start: T("09:30"), end: T("10:00"), sources: [0], chosen: 0 },
        { start: T("10:00"), end: T("10:30"), sources: [1] },
      ],
    },
  ],
};

describe("Coverage's bars and choices", () => {
  it("places times along the period every bar runs over", () => {
    const extent = extentOf(report)!;
    expect(along(Date.parse(T("09:00")), extent)).toBe(0.5);
    expect(along(Date.parse(T("07:00")), extent)).toBe(0);
    expect(along(Date.parse(T("11:00")), extent)).toBe(1);
  });
  it("offers a choice where two sources have data, and says what is not taken", () => {
    const [platform] = report.platforms;
    expect(choices(platform).map((p) => p.start)).toEqual([T("09:00")]);
    expect(untaken(platform).map((p) => p.start)).toEqual([T("10:00")]);
    expect(nextSource(platform.periods[1])).toBe(1);
    expect(nextSource(platform.periods[1], -1)).toBe(1);
    expect(linkWords(platform.sources[1])).toBe("proposed: same name");
  });
  it("sends only messages the schema allows", () => {
    const source = { catalogue: "c", item: "log", track: "t", name: "Blue One" };
    expect(() => checkMessage({ kind: "show_coverage", coverage: report })).not.toThrow();
    expect(() => checkMessage({ kind: "show_coverage", message: "Nothing to change: it is so already." })).not.toThrow();
    expect(() => checkMessage({ kind: "source_chosen", feature_id: "track-blue", time_range: { start: T("09:00"), end: T("09:30") }, source })).not.toThrow();
    expect(() => checkMessage({ kind: "link_changed", feature_id: "track-blue", source, linked: true })).not.toThrow();
    expect(() => checkMessage({ kind: "take_asked", item_revision: { catalogue: "c", item: "log", revision: `sha256:${"1".repeat(64)}` } })).not.toThrow();
    expect(() => checkMessage({ kind: "review_cleared" })).not.toThrow();
    expect(() => checkMessage({ kind: "source_chosen", feature_id: "track-blue", source })).toThrow();
    expect(() => checkMessage({ kind: "review_cleared", feature_id: "x" })).toThrow();
  });
});
