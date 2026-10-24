/**
 * Collation's logic in TypeScript (CAP-05, CAP-08, CAP-09): spans, platform names and
 * periods held to the vectors Python is held to; a track's coverage piece by piece for the
 * Timeline; where things lie along Coverage's bars; and the messages the view sends.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CoverageReport, DebriefFeatureCollection, TrackSupply } from "@debrief/schemas";
import { along, choices, coveragePieces, extentOf, linkWords, periods, platformKey, plotTitleOf, spans, untaken, type Span } from "../../webview/coveragelogic.js";
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

describe("periods of gappy sources, swept along the time (NFR-01)", () => {
  // Fifty sources of a hundred bursts each, every source offset a little: 10,000 bounds.
  const sources: Span[][] = Array.from({ length: 50 }, (_, n) =>
    Array.from({ length: 100 }, (_, b): Span => [b * 600_000 + n * 7_000, b * 600_000 + n * 7_000 + 40_000]),
  );
  /** The periods as worked out bound by bound against every span: slow, but plainly right. */
  const plainly = (all: Span[][]) => {
    const bounds = [...new Set(all.flat(2))].sort((a, b) => a - b);
    const out: { start: number; end: number; sources: number[] }[] = [];
    for (let k = 1; k < bounds.length; k++) {
      const [a, b] = [bounds[k - 1], bounds[k]];
      const covering = all.flatMap((s, i) => (s.some(([x, y]) => x <= a && b <= y && x < y) ? [i] : []));
      if (!covering.length) continue;
      const last = out.at(-1);
      if (last && last.end === a && last.sources.join() === covering.join()) last.end = b;
      else out.push({ start: a, end: b, sources: covering });
    }
    return out;
  };
  it("cuts them as the plain way does", () => {
    expect(periods(sources.slice(0, 8).map((s) => s.slice(0, 20)))).toEqual(plainly(sources.slice(0, 8).map((s) => s.slice(0, 20))));
  });
  it("in well under a tenth of a second", () => {
    const started = performance.now();
    const cut = periods(sources);
    const took = performance.now() - started;
    expect(cut.length).toBeGreaterThan(5_000);
    expect(took).toBeLessThan(100);
  });
  it("finds a long track's pieces in one pass", () => {
    // 2,000 spans of 10 fixes, each from the next supplier: 20,000 fixes, each with its
    // supplier found by halving, in one pass over the spans.
    const times = Array.from({ length: 2000 }, (_, b) => Array.from({ length: 10 }, (_, k) => iso(Date.parse("2023-06-15T00:00:00.000Z") + b * 3_600_000 + k * 10_000))).flat();
    const supplies: TrackSupply[] = Array.from({ length: 2000 }, (_, b) => ({
      catalogue: "c",
      item: b % 2 ? "log" : "plot",
      track: "t",
      title: b % 2 ? "Log" : "Plot",
      ...(b % 2 ? { revision: `sha256:${"a".repeat(64)}` } : {}),
      start: times[b * 10],
      end: times[b * 10 + 9],
    }));
    const started = performance.now();
    const pieces = coveragePieces(times, supplies);
    const took = performance.now() - started;
    expect(pieces).toHaveLength(2000);
    expect(pieces[1]).toMatchObject({ source: "Log", fixes: 10 });
    expect(pieces[0].source).toBeUndefined();
    expect(took).toBeLessThan(60);
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
    schema_version: "0.0.23",
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
