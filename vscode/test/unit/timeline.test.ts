/**
 * The Timeline's logic (CAP-05, CAP-20, NFR-06): narrative, notes and fix comments in one
 * order held to the vectors Python is; filtering and searching; the entry current time is
 * at; the rows a list of sixty thousand draws; and following current time without
 * fighting the reader.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DebriefFeatureCollection, TimelineEntry } from "@debrief/schemas";
import { currentEntry, NARRATIVE_ON_MAP_MS, NarrativeOnMap, narrativeOnMapOf, timelineEntries, timelineTracks } from "../../src/timeline.js";
import { checkMessage } from "../../src/messages.js";
import { describeStep, NARRATIVE_IMPORTER } from "../../src/wording.js";
import {
  applyFilter,
  columnWidths,
  currentIndex,
  editsText,
  estimateLines,
  facets,
  filtering,
  followScroll,
  historyMove,
  Layout,
  matches,
  NO_FILTER,
  prepare,
  revealScroll,
  rowIndex,
  rowsOf,
  whereIs,
  type Filter,
} from "../../webview/timelinelogic.js";

const ROOT = path.resolve(__dirname, "../../..");
const vectors = JSON.parse(readFileSync(path.join(ROOT, "schemas/vectors/narrative-order.json"), "utf8")) as {
  cases: { name: string; entries: { id: string; time: string; source: string }[]; order: string[]; current: { at: string; index: number }[] }[];
};
const fixture = (name: string) => JSON.parse(readFileSync(path.join(ROOT, "schemas/fixtures", name), "utf8"));

const plotOf = (features: unknown[]) => ({ type: "FeatureCollection", schema_version: "0.0.23", provenance: [], features }) as unknown as DebriefFeatureCollection;
const narrative = (id: string, time: string, source: string, more: Record<string, unknown> = {}) => ({
  type: "Feature",
  id,
  geometry: null,
  properties: { kind: "narrative", time, source, text: `${source} logged.`, ...more },
});
const T = (minute: number, second = 0) => new Date(Date.UTC(2026, 9, 11, 9, minute, second)).toISOString();

describe("one order for every source, as Python's", () => {
  it.each(vectors.cases)("$name", (c) => {
    const entries = timelineEntries(plotOf(c.entries.map((e) => narrative(e.id, e.time, e.source))));
    expect(entries.map((e) => e.id)).toEqual(c.order);
    const starts = entries.map((e) => Date.parse(e.start));
    for (const current of c.current) expect(currentEntry(starts, Date.parse(current.at))).toBe(current.index);
  });

  it("merges narrative, notes and fix comments on one axis, each with its source, type and track", () => {
    const plot = plotOf([
      {
        type: "Feature",
        id: "track-blue-one",
        geometry: { type: "LineString", coordinates: [[0, 0], [0.1, 0]] },
        properties: { kind: "track", name: "BLUE ONE", times: [T(0), T(10)], style: { colour: "#0064bd" }, fix_marks: [{ time: T(10), comment: "Wheel over" }] },
      },
      narrative("narrative-0001", T(5), "BLUE ONE", { entry_type: "Sonar", track_id: "track-blue-one" }),
      narrative("narrative-0002", T(5), "CONTROL"),
      { type: "Feature", id: "note-1", geometry: null, properties: { kind: "annotation", style: "note", name: "Analyst", text: "Check this", time: T(5) } },
    ]);
    const entries = timelineEntries(plot);
    expect(entries.map((e) => [e.id, e.kind])).toEqual([
      [`coverage:track-blue-one:${T(0)}`, "coverage"], // the track's data, from its first fix to its last
      ["note-1", "annotation"], // "analyst" before "blue one" before "control"
      ["narrative-0001", "narrative"],
      ["narrative-0002", "narrative"],
      [`fix:track-blue-one:${T(10)}`, "fix_comment"],
    ]);
    expect(entries[0]).toMatchObject({ source: "This plot", entry_type: "Data", text: "BLUE ONE: 2 fixes", end: T(10) });
    expect(entries[2]).toEqual({ id: "narrative-0001", kind: "narrative", start: T(5), source: "BLUE ONE", entry_type: "Sonar", text: "BLUE ONE logged.", track: "track-blue-one", colour: "#0064bd" });
    expect(timelineTracks(plot)).toEqual([{ id: "track-blue-one", name: "BLUE ONE", colour: "#0064bd" }]);
    // The rows the Timeline is sent are boundary types.
    expect(() => checkMessage({ kind: "show_timeline", timeline_entries: entries, timeline_tracks: timelineTracks(plot) })).not.toThrow();
  });
});

describe("Timeline messages are boundary types (CON-08)", () => {
  it.each(["show-timeline", "show-timeline-no-plot", "timeline-chosen", "save-narrative", "save-narrative-change", "delete-narrative", "narrative-saved", "set-narrative", "open-narrative-form", "narrative-on-map-changed", "playing-changed", "undo-asked", "redo-asked"])("accepts %s", (name) => {
    const raw = fixture(`webview_message/valid/${name}.json`);
    expect(checkMessage(raw)).toEqual(raw);
  });
  it.each(["semantic/save-narrative-without-narrative", "semantic/timeline-chosen-without-entry", "schema/show-timeline-unknown-entry-kind", "schema/set-narrative-colour-not-hex", "semantic/playing-changed-without-playing", "schema/narrative-on-map-not-boolean", "semantic/undo-asked-carrying-entry"])("refuses %s", (name) => {
    expect(() => checkMessage(fixture(`webview_message/invalid/${name}.json`))).toThrow();
  });
});

const entry = (id: string, minute: number, source: string, more: Partial<TimelineEntry> = {}): TimelineEntry => ({ id, kind: "narrative", start: T(minute), source, text: `${id} text`, ...more });
const sample = prepare([
  entry("a", 0, "BLUE ONE", { entry_type: "Sonar", text: "Contact gained, bearing 045" }),
  entry("b", 1, "RED ONE", { entry_type: "CSD", text: "Going deep" }),
  entry("c", 1, "BLUE ONE", { entry_type: "Sonar", text: "Contact lost" }),
  entry("d", 1, "BLUE ONE", { text: "Weather fair" }),
  { id: "n", kind: "annotation", start: T(2), end: T(4), source: "Serial", entry_type: "Period" },
  entry("e", 60 * 24, "CONTROL", { text: "Next day" }),
]);
const filter = (f: Partial<Filter>): Filter => ({ ...NO_FILTER, ...f });

describe("filtering and searching", () => {
  it("leaves out kinds, sources and types, and finds text ignoring case", () => {
    const ids = (f: Partial<Filter>) => applyFilter(sample, filter(f)).map((i) => sample[i].entry.id);
    expect(ids({})).toEqual(["a", "b", "c", "d", "n", "e"]);
    expect(ids({ sources: new Set(["BLUE ONE"]) })).toEqual(["b", "n", "e"]);
    expect(ids({ types: new Set(["Sonar", ""]) })).toEqual(["b", "n"]);
    expect(ids({ kinds: new Set(["annotation"] as const) })).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids({ text: "CONTACT" })).toEqual(["a", "c"]);
    expect(ids({ text: "red one" })).toEqual(["b"]); // the source is searched too
    expect(ids({ text: "csd" })).toEqual(["b"]); // and the type
    expect(filtering(NO_FILTER)).toBe(false);
    expect(filtering(filter({ text: " x " }))).toBe(true);
  });

  it("counts each source, type and kind, most first", () => {
    const f = facets(sample);
    expect(f.sources[0]).toEqual({ name: "BLUE ONE", count: 3 });
    expect(f.types.find((t) => t.name === "")).toEqual({ name: "", count: 2 });
    expect(f.kinds).toEqual([{ name: "narrative", count: 5 }, { name: "annotation", count: 1 }]);
  });

  it("marks where a search is found", () => {
    expect(matches("Contact lost, contact regained", "CONTACT")).toEqual([[0, 7], [14, 21]]);
    expect(matches("anything", "  ")).toEqual([]);
  });
});

describe("the entry current time is at", () => {
  const visible = applyFilter(sample, NO_FILTER);
  const at = (minute: number, chosen?: string) => {
    const i = currentIndex(sample, visible, Date.parse(T(minute)), chosen);
    return i < 0 ? undefined : sample[visible[i]].entry.id;
  };
  it("is the last at or before it, and none before the first", () => {
    expect(at(-1)).toBeUndefined();
    expect(at(0)).toBe("a");
    expect(at(1)).toBe("d"); // the last of three at 09:01
    expect(at(3)).toBe("n");
  });
  it("is the one chosen, among those sharing its second", () => {
    expect(at(1, "b")).toBe("b");
    expect(at(1, "c")).toBe("c");
    expect(at(2, "b")).toBe("n"); // time moved on: the choice no longer counts
  });
  it("is among the entries listed only", () => {
    const blue = applyFilter(sample, filter({ sources: new Set(["BLUE ONE"]) }));
    expect(sample[blue[currentIndex(sample, blue, Date.parse(T(1)))]].entry.id).toBe("b");
  });
});

describe("rows and their layout", () => {
  it("heads each day's first entry with its date", () => {
    const rows = rowsOf(sample, applyFilter(sample, NO_FILTER));
    expect(rows.map((r) => ("day" in r ? "day" : sample[r.item].entry.id))).toEqual(["day", "a", "b", "c", "d", "n", "day", "e"]);
    expect(rowIndex(rows).get(5)).toBe(7);
  });

  it("places rows by estimated heights, then measured ones, and finds the rows in sight", () => {
    const layout = new Layout(5, (r) => (r === 0 ? 24 : 38));
    expect(layout.total).toBe(24 + 4 * 38);
    expect(layout.top(2)).toBe(24 + 38);
    expect(layout.rowAt(0)).toBe(0);
    expect(layout.rowAt(24)).toBe(1);
    expect(layout.rowAt(10_000)).toBe(4);
    expect(layout.setHeight(1, 38.2)).toBe(false); // the same, to half a pixel
    expect(layout.setHeight(1, 54)).toBe(true);
    expect(layout.top(2)).toBe(24 + 54);
    expect(layout.range(30, 40, 0)).toEqual([1, 1]);
    expect(new Layout(0, () => 10).range(0, 100, 0)).toEqual([0, -1]);
  });

  it("estimates a row's lines from its text and the column's width", () => {
    expect(estimateLines(undefined, 40)).toBe(1);
    expect(estimateLines("short", 40)).toBe(1);
    expect(estimateLines("x".repeat(81), 40)).toBe(3);
    expect(estimateLines("one\ntwo\nthree", 40)).toBe(3);
  });

  it("sizes the source and type columns from what they hold, within bounds", () => {
    expect(columnWidths(sample)).toEqual({ source: 8, type: 6 });
    expect(columnWidths(prepare([entry("x", 0, "A VERY LONG PLATFORM NAME INDEED")])).source).toBe(14);
  });
});

describe("following current time", () => {
  // A view 300 px high over a list 10,000 px long.
  const follow = (rowTop: number, scrollTop: number) => followScroll(rowTop, 40, scrollTop, 300, 10_000);
  it("leaves the list alone while the entry is in the comfortable middle of the view", () => {
    expect(follow(1000 + 60, 1000)).toBeUndefined();
    expect(follow(1000 + 180, 1000)).toBeUndefined();
  });
  it("scrolls, putting the entry a third of the way down, once it leaves that part", () => {
    expect(follow(1000 + 250, 1000)).toBe(1250 - 100); // about to go out of the bottom
    expect(follow(1000 + 10, 1000)).toBe(1010 - 100); // at the very top
    expect(follow(5000, 1000)).toBe(4900); // far below, after a jump of current time
    expect(follow(50, 0)).toBeUndefined(); // near the start of the list: nothing above to show
    expect(follow(9990, 9000)).toBe(9700); // never past the end
  });
  it("brings a row the keyboard moves to into view with the least scroll", () => {
    expect(revealScroll(100, 40, 200, 300)).toBe(100);
    expect(revealScroll(480, 40, 200, 300)).toBe(220);
    expect(revealScroll(300, 40, 200, 300)).toBeUndefined();
  });
  it("says which way current time is when the reader has scrolled away", () => {
    expect(whereIs(100, 40, 500, 300)).toBe("above");
    expect(whereIs(900, 40, 500, 300)).toBe("below");
    expect(whereIs(600, 40, 500, 300)).toBe("in view");
  });
});

describe("Undo and Redo in the Timeline (product owner, 15 Oct 2026)", () => {
  const press = (key: string, more: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...more });
  /** A VS Code keybinding, such as "cmd+shift+z", as the key press it is. */
  const chord = (binding: string) => {
    const parts = binding.split("+");
    const key = parts.at(-1)!;
    return press(parts.includes("shift") ? key.toUpperCase() : key, { ctrlKey: parts.includes("ctrl"), metaKey: parts.includes("cmd"), shiftKey: parts.includes("shift") });
  };

  it("takes the keys VS Code's keybindings give the map, Outline and History, on each platform", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "vscode/package.json"), "utf8")) as { contributes: { keybindings: { command: string; key: string; mac?: string }[] } };
    const bindings = manifest.contributes.keybindings.filter((b) => b.command === "debrief.undo" || b.command === "debrief.redo");
    expect(bindings.length).toBe(3);
    for (const binding of bindings) {
      const move = binding.command === "debrief.undo" ? "undo" : "redo";
      expect(historyMove(chord(binding.key), false), binding.key).toBe(move);
      expect(historyMove(chord(binding.mac ?? binding.key), true), binding.mac ?? binding.key).toBe(move);
    }
  });
  it("takes nothing else", () => {
    expect(historyMove(press("z"), false)).toBeUndefined();
    expect(historyMove(press("z", { metaKey: true }), false)).toBeUndefined(); // Cmd is macOS's
    expect(historyMove(press("z", { ctrlKey: true }), true)).toBeUndefined(); // Ctrl+Z is not Undo on macOS
    expect(historyMove(press("z", { ctrlKey: true, altKey: true }), false)).toBeUndefined();
    expect(historyMove(press("Y", { ctrlKey: true, shiftKey: true }), false)).toBeUndefined();
    expect(historyMove(press("x", { ctrlKey: true }), false)).toBeUndefined();
  });
  it("leaves the keys to the text in the search box and the form's text boxes, and only there", () => {
    expect(editsText({ tagName: "INPUT", type: "search" })).toBe(true); // the search box
    expect(editsText({ tagName: "INPUT", type: "text" })).toBe(true); // the form's time, source and type
    expect(editsText({ tagName: "INPUT", type: "" })).toBe(true);
    expect(editsText({ tagName: "TEXTAREA" })).toBe(true); // the form's entry
    expect(editsText({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(editsText({ tagName: "DIV" })).toBe(false); // the list
    expect(editsText({ tagName: "BUTTON", type: "submit" })).toBe(false); // Filter, +, Save
    expect(editsText({ tagName: "INPUT", type: "checkbox" })).toBe(false); // the filter's choices, Narrative on the map
    expect(editsText({ tagName: "SELECT" })).toBe(false); // the form's track
    expect(editsText(null)).toBe(false);
  });
});

describe("the narrative on the map", () => {
  const entries = [
    entry("a", 0, "BLUE ONE", { track: "track-blue-one" }),
    entry("b", 5, "CONTROL"),
    entry("c", 30, "RED ONE", { track: "track-red-one" }),
  ];
  const onMap = new NarrativeOnMap(entries);
  const at = (minute: number) => onMap.at(Date.parse(T(minute)))?.id;
  it("is the latest entry that belongs to a track, for ten minutes at most", () => {
    expect(NARRATIVE_ON_MAP_MS).toBe(600_000);
    expect(at(-1)).toBeUndefined();
    expect(at(5)).toBe("a"); // CONTROL has no track
    expect(at(10)).toBe("a");
    expect(at(11)).toBeUndefined(); // ten minutes on, it goes
    expect(at(31)).toBe("c");
  });
  it("is shown unless the plot's island turns it off (decision, product owner, 15 Oct 2026)", () => {
    const withView = (view: Record<string, unknown> | undefined) =>
      plotOf([{ type: "Feature", id: "plot", geometry: null, properties: { kind: "plot", title: "P", ...(view && { view }) } }]);
    expect(narrativeOnMapOf(undefined)).toBe(true);
    expect(narrativeOnMapOf(plotOf([]))).toBe(true); // no whole-plot feature: no island
    expect(narrativeOnMapOf(withView(undefined))).toBe(true);
    expect(narrativeOnMapOf(withView({ narrative_on_map: true }))).toBe(true);
    expect(narrativeOnMapOf(withView({ narrative_on_map: false }))).toBe(false);
  });
});

describe("narrative steps in the History view", () => {
  it("are named by their notes, a log read in by its file", () => {
    const named = (step: { kind: string; tool: string | null; notes: string[] }) => describeStep({ ...step, status: "applied" }, () => undefined).label;
    expect(named({ kind: "edit", tool: null, notes: ["Narrative entry by BLUE ONE at 08:40:00Z added"] })).toBe("Narrative entry by BLUE ONE at 08:40:00Z added");
    expect(named({ kind: "import", tool: NARRATIVE_IMPORTER, notes: ["Narrative read from red-log.rep", "2 narrative entries read, from RED ONE."] })).toBe("Narrative read from red-log.rep");
    expect(named({ kind: "import", tool: "debrief-io.rep", notes: ["Track 'A' plotted over the ground (OTG)."] })).toBe("Imported");
  });
});

describe("at the track-heavy scale (NFR-06: 12,000 entries scaled by five)", () => {
  const many: TimelineEntry[] = [];
  const sources = ["BLUE ONE", "RED ONE", "CONTROL", "BLUE TWO", "SEA KING"];
  for (let i = 0; i < 60_000; i++) {
    many.push(entry(`n${i}`, Math.floor(i / 3) / 30, sources[i % 5], { entry_type: ["Sonar", "CSD", "GenComment"][i % 3], text: `Entry ${i}: contact bearing ${String(i % 360).padStart(3, "0")}` }));
  }
  it("orders, filters, searches and lays out sixty thousand entries quickly", () => {
    const features = many.map((e) => narrative(e.id, e.start, e.source, { entry_type: e.entry_type, text: e.text }));
    const started = performance.now();
    const ordered = timelineEntries(plotOf(features));
    const orderMs = performance.now() - started;
    const items = prepare(ordered);
    let t = performance.now();
    const visible = applyFilter(items, NO_FILTER);
    const rows = rowsOf(items, visible);
    const layout = new Layout(rows.length, (r) => ("day" in rows[r] ? 24 : 38));
    const middle = layout.range(layout.total / 2, 600, 400);
    const allMs = performance.now() - t;
    t = performance.now();
    const found = applyFilter(items, filter({ text: "bearing 045", sources: new Set(["CONTROL"]) }));
    const searchMs = performance.now() - t;
    t = performance.now();
    for (let k = 0; k < 1000; k++) currentIndex(items, visible, Date.parse(T(k % 60)));
    const currentMs = (performance.now() - t) / 1000;
    console.log(
      `Timeline at 60,000 entries: order ${orderMs.toFixed(0)} ms; filter, rows and layout ${allMs.toFixed(1)} ms; ` +
        `search ${searchMs.toFixed(1)} ms; entry at current time ${(currentMs * 1000).toFixed(1)} µs`,
    );
    expect(ordered).toHaveLength(60_000);
    expect(middle[1] - middle[0]).toBeLessThan(40); // a screenful drawn, not sixty thousand
    expect(found.length).toBeGreaterThan(0);
    expect(orderMs).toBeLessThan(2000);
    expect(allMs + searchMs).toBeLessThan(500);
  });
});
