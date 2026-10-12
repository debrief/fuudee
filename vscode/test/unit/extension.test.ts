import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { ParameterDeclaration, ToolDeclaration } from "@debrief/schemas";
import { describeStep, needs } from "../../src/wording.js";
import { checkMessage } from "../../src/messages.js";
import { openPlot, readCatalogue } from "../../src/catalogue.js";
import { densify } from "../../webview/geodesic.js";
import { initial } from "../../webview/formdraft.js";
import { count, describeTimes } from "../../src/format.js";
import { Session } from "../../src/session.js";
import { keyedHash, loadLogKey, logKeyFile, redact, serviceLine, setLogKey, toolRunLine } from "../../src/diagnostics.js";
import { displayed, hiddenIds, hiddenNotice, isFeature, isHidden, timeWindowOf } from "../../src/hidden.js";
import { historyRows } from "../../src/views/historyrows.js";
import type { HistoryStep } from "../../src/service.js";
import type { OpenedPlot } from "../../src/catalogue.js";

const repo = path.resolve(__dirname, "../../..");
const fixtures = path.join(repo, "schemas", "fixtures", "webview_message");

const tool = (applies_to: string[], min?: number, max?: number) =>
  ({ name: "x.y", version: "1", title: "T", explanation: "E", applies_to, min_selected: min, max_selected: max, outputs: ["non_spatial"] }) as ToolDeclaration;

describe("what a tool needs, in the analyst's words", () => {
  it.each([
    [tool(["track"], 2, 2), "select 2 tracks"],
    [tool(["track"], 1, 1), "select 1 track"],
    [tool(["track"], 1, 50), "select 1 to 50 tracks"],
    [tool(["track"], 1), "select 1 or more tracks"],
    [tool(["*"], 0), "works with any selection"],
    [tool(["track", "annotation"], 2), "select 2 or more features of the right kinds"],
  ])("%#", (declaration, expected) => expect(needs(declaration)).toBe(expected));
});

describe("webview messages are boundary types (CON-08)", () => {
  it.each(["show-plot", "selection-changed", "run-tool", "ready", "time-changed", "set-viewport-across-antimeridian", "show-time", "show-time-no-plot", "window-changed"])("accepts %s", (name) => {
    const raw = JSON.parse(readFileSync(path.join(fixtures, "valid", `${name}.json`), "utf8"));
    expect(checkMessage(raw)).toEqual(raw);
  });
  it.each(["run-tool-without-name", "ready-with-plot", "time-outside-range", "set-time-without-time", "window-changed-ends-before-it-starts", "window-changed-without-window"])("refuses %s, which Python refuses too", (name) => {
    const raw = JSON.parse(readFileSync(path.join(fixtures, "invalid", "semantic", `${name}.json`), "utf8"));
    expect(() => checkMessage(raw)).toThrow();
  });
  it("refuses an unknown kind", () => expect(() => checkMessage({ kind: "explode" })).toThrow());
});

describe("geodesic lines (SUB-03)", () => {
  it("keeps the ends and follows the great circle, not the Mercator straight line", () => {
    const line = densify([[-70, 40], [10, 50]]);
    expect(line[0]).toEqual([-70, 40]);
    expect(line.at(-1)![0]).toBeCloseTo(10, 9);
    const middle = line[Math.floor(line.length / 2)];
    expect(middle[1]).toBeGreaterThan(51); // the geodesic bows north of both ends; the rhumb line would not
  });
  it("leaves short segments alone", () => expect(densify([[0, 0], [0.001, 0]])).toHaveLength(2));
  it("crosses the antimeridian without wrapping round the world", () => {
    const line = densify([[179.9, 0], [-179.95, 0], [-179.9, 0]]);
    const steps = line.slice(1).map((p, i) => Math.abs(p[0] - line[i][0]));
    expect(Math.max(...steps)).toBeLessThan(0.1);
    expect(line.at(-1)![0]).toBeCloseTo(180.1, 6);
  });
});

describe("display", () => {
  it("counts in words", () => {
    expect(count(1, "plot")).toBe("1 plot");
    expect(count(3, "fix", "fixes")).toBe("3 fixes");
  });
  it("shows times through the formatting service", () =>
    expect(describeTimes("1995-12-12T05:00:00.000Z", "1995-12-12T06:28:00.000Z")).toBe("05:00:00Z – 06:28:00Z"));
});

describe("reading a catalogue Python wrote", () => {
  const python = process.env.DEBRIEF_PYTHON || path.join(repo, ".venv", "bin", "python");
  const work = mkdtempSync(path.join(tmpdir(), "debrief-cat-"));
  execFileSync(python, [
    "-c",
    "import sys; from pathlib import Path; from debrief_stac import Catalogue; from debrief_io import import_rep; " +
      "c = Catalogue.create(Path(sys.argv[1]), 'ex', 'Exercise', 'Test'); import_rep(c, Path(sys.argv[2]), item_id='serial-1', title='Serial 1')",
    work,
    path.join(repo, "vscode", "test", "integration", "demo.rep"),
  ]);
  const store = { id: "ex", title: "Exercise", kind: "file" as const, location: work };

  it("lists plots by walking folders", () => {
    const view = readCatalogue(store);
    expect(view.problem).toBeUndefined();
    expect(view.plots.map((p) => [p.id, p.title])).toEqual([["serial-1", "Serial 1"]]);
  });
  it("opens a plot with its source", () => {
    const opened = openPlot(store, "serial-1");
    expect(opened.plot.features.filter(isFeature).map((f) => f.properties.name)).toEqual(["NELSON", "BLUE", "TRAWLER 7"]);
    // The plot's own details, with its view: a time window over its period (SUB-22).
    expect(opened.plot.features.at(-1)?.properties.kind).toBe("plot");
    expect(timeWindowOf(opened.plot)).toEqual({ start: opened.item.properties.start_datetime, end: opened.item.properties.end_datetime });
    expect(opened.files).toEqual([expect.objectContaining({ kind: "source", title: "demo.rep" })]);
  });
  it("reports a missing catalogue instead of failing", () =>
    expect(readCatalogue({ ...store, location: path.join(work, "nowhere") }).problem).toMatch(/No catalogue found/));
});

import { parseTime } from "../../src/timeinput.js";
import { describeChanges } from "../../src/format.js";

describe("times as an analyst types them (SUB-04)", () => {
  const range = { start: "2023-06-15T08:00:00.000Z", end: "2023-06-15T12:00:00.000Z" };
  const at = (text: string) => {
    const ms = parseTime(text, range);
    return ms === undefined ? undefined : new Date(ms).toISOString();
  };
  it.each([
    ["2023-06-15T09:30:00Z", "2023-06-15T09:30:00.000Z"],
    ["2023-06-15T09:30:00.250Z", "2023-06-15T09:30:00.250Z"],
    ["15 Jun 2023 09:30:05Z", "2023-06-15T09:30:05.000Z"],
    ["150930Z JUN 23", "2023-06-15T09:30:00.000Z"],
    ["09:30Z", "2023-06-15T09:30:00.000Z"],
    ["0930Z", "2023-06-15T09:30:00.000Z"],
    ["09:30:05z", "2023-06-15T09:30:05.000Z"],
  ])("%s", (text, expected) => expect(at(text)).toBe(expected));
  it.each(["09:30", "31 Jun 2023 09:30Z", "25:00Z", "yesterday", "2023-06-15T09:30:00+01:00"])("refuses %s", (text) =>
    expect(at(text)).toBeUndefined(),
  );
  it("puts a time of day on the plot's second day when the plot spans midnight", () =>
    expect(new Date(parseTime("01:00Z", { start: "2023-06-15T22:00:00.000Z", end: "2023-06-16T03:00:00.000Z" })!).toISOString()).toBe(
      "2023-06-16T01:00:00.000Z",
    ));
});

describe("a tool form's time fields start at current time (SUB-26)", () => {
  const now = "2023-06-15T09:30:05.000Z";
  const time = { name: "at", title: "Time", kind: "time" } as ParameterDeclaration;
  it("shows current time as the analyst reads it, in a form the field accepts", () => {
    const { text } = initial(time, now);
    expect(text).toBe("15 Jun 2023 09:30:05Z");
    expect(new Date(parseTime(text)!).toISOString()).toBe(now);
  });
  it("keeps the tool's own default", () =>
    expect(initial({ ...time, default: "2023-06-15T08:00:00.000Z" } as ParameterDeclaration, now).text).toBe("2023-06-15T08:00:00.000Z"));
  it("leaves the field empty when there is no current time", () => expect(initial(time).text).toBe(""));
  it("leaves fields of other kinds alone", () =>
    expect(initial({ name: "label", title: "Label", kind: "string" } as ParameterDeclaration, now).text).toBe(""));
  it("travels in show_form", () => {
    const tool = { name: "core.add_note", version: "1", title: "Add note", explanation: "E", applies_to: ["*"], outputs: ["new_features"] };
    const message = { kind: "show_form", tool, selected_names: [], current_time: now };
    expect(checkMessage(message)).toEqual(message);
    expect(() => checkMessage({ kind: "set_time", time: { current: now, range: { start: now, end: now } }, current_time: now })).toThrow();
  });
});

describe("what a tool changed, in glossary terms", () => {
  const annotation = { properties: { kind: "annotation" } };
  it("counts by kind", () =>
    expect(describeChanges({ new_features: [annotation, annotation], deleted_feature_ids: ["a"] } as never)).toBe(
      "added 2 annotations, deleted 1 feature",
    ));
});

describe("shared state (SUB-26, SUB-27)", () => {
  const opened = (id = "serial") =>
    ({
      store: { id: "s" },
      item: {
        id,
        bbox: [-4.2, 50.3, -4.0, 50.4],
        properties: { start_datetime: "1995-12-12T05:00:00.000Z", end_datetime: "1995-12-12T06:00:00.000Z" },
      },
      plot: { features: [{ id: "a", properties: { kind: "track" } }, { id: "b", properties: { kind: "track" } }] },
    }) as unknown as OpenedPlot;
  const range = { start: "1995-12-12T05:00:00.000Z", end: "1995-12-12T06:00:00.000Z" };

  it("starts current time at the plot's start, and the viewport at its extent", () => {
    const session = new Session();
    expect(session.state()).toBeUndefined();
    session.setPlot(opened());
    expect(session.state()).toEqual({
      time: { current: range.start, range },
      selection: { plot: "serial", feature_ids: [] },
      viewport: { bbox: [-4.2, 50.3, -4.0, 50.4] },
    });
  });

  it("tells every listener who changed what, and refuses what cannot be shown", () => {
    const session = new Session();
    session.setPlot(opened());
    const heard: [string, string][] = [];
    session.onState((change, origin) => heard.push([Object.keys(change).join(), origin]));
    expect(session.apply({ selection: { plot: "serial", feature_ids: ["b", "ghost"] } }, "x")).toMatch(/no feature ghost/);
    expect(session.apply({ selection: { plot: "other", feature_ids: ["b"] } }, "x")).toMatch(/not the open plot/);
    expect(session.setTime({ current: "1995-12-12T05:30:00+01:00", range }, "x")).toMatch(/must be UTC/);
    expect(session.apply({ time: { current: "1995-12-12T05:30:00.000Z", range }, selection: { plot: "serial", feature_ids: ["b"] } }, "tool:x")).toBeUndefined();
    expect(session.selection).toEqual(["b"]);
    expect(session.setViewport({ bbox: [170, -20, -170, -10] }, "map")).toBeUndefined(); // across 180°
    expect(session.setTime({ current: "1995-12-12T07:00:00.000Z", range }, "extension")).toMatch(/within the time range/);
    expect(session.apply({ time: { current: range.start, range }, viewport: { bbox: [0, 10, 1, 5] } }, "x")).toMatch(/latitudes/);
    expect(session.time?.current).toBe("1995-12-12T05:30:00.000Z"); // all or nothing
    expect(heard).toEqual([
      ["selection", "tool:x"],
      ["time", "tool:x"],
      ["viewport", "map"],
    ]);
  });

  it("keeps current time, a widened range and the selection when the same plot is opened again", () => {
    const session = new Session();
    session.setPlot(opened());
    session.select(["a"], "map");
    const wide = { start: "1995-12-12T04:00:00.000Z", end: range.end };
    session.setTime({ current: "1995-12-12T04:30:00.000Z", range: wide }, "tool:x");
    session.setPlot(opened()); // reopened, or reloaded after a change
    expect(session.time).toEqual({ current: "1995-12-12T04:30:00.000Z", range: wide });
    expect(session.selection).toEqual(["a"]);
    session.setPlot(opened("copy"), true); // saved as a new plot: carried across
    expect(session.time?.current).toBe("1995-12-12T04:30:00.000Z");
    session.setPlot(opened("other"));
    expect(session.time?.current).toBe(range.start);
    expect(session.selection).toEqual([]);
  });

  it("hands out copies, and one failing listener never stops the rest", () => {
    const session = new Session();
    session.setPlot(opened());
    session.state()!.time.current = "tampered";
    expect(session.time?.current).toBe(range.start);
    const heard: string[] = [];
    session.onState(() => {
      throw new Error("another extension's bug");
    });
    session.onState((_, origin) => heard.push(origin));
    expect(session.setViewport({ bbox: [0, 0, 1, 1] }, "extension:x")).toBeUndefined();
    expect(heard).toEqual(["extension:x"]);
  });
});

describe("history steps, in the analyst's words (SUB-21)", () => {
  const title = (name: string) => ({ "core.range_rings": "Range rings" })[name];
  it.each([
    [{ kind: "import", tool: "debrief-io.rep", status: "applied" }, "Imported", "In the plot"],
    [{ kind: "tool", tool: "core.range_rings", status: "undone" }, "Range rings", "Undone; can be redone"],
    [{ kind: "tool", tool: "debrief-sample", status: "abandoned" }, "Made by debrief-sample", "Undone, then replaced by a later change; kept on record"],
    [{ kind: "edit", tool: null, status: "applied" }, "Edited", "In the plot"],
    [{ kind: "edit", tool: null, status: "applied", notes: ["Note added by a colleague"] }, "Note added by a colleague", "In the plot"],
    [{ kind: "edit", tool: null, status: "applied", notes: ["The plot had content but no record of how it was made, so this is long."] }, "Edited", "In the plot"],
  ])("%#", (step, label, status) => expect(describeStep(step, title)).toEqual({ label, status }));
});

describe("logs hold no plot data (NFR-14)", () => {
  const vectors = JSON.parse(readFileSync(path.join(repo, "schemas", "vectors", "redaction.json"), "utf8")) as {
    key: string;
    cases: { name: string; line: string; expected: string }[];
  };
  const key = Buffer.from(vectors.key, "hex");
  it.each(vectors.cases.map((c) => [c.name, c] as const))("%s, as Python redacts it", (_, c) => expect(redact(c.line, key)).toBe(c.expected));
  it("hashes with the install's key, as Python does", () => {
    expect(keyedHash("NELSON", key)).not.toBe(keyedHash("NELSON", Buffer.alloc(32)));
    // The same key gives the same hash in Python: the vectors above are Python's output.
    expect(redact("'NELSON'", key)).toBe(`'<text:${keyedHash("NELSON", key)}>'`);
  });
  it("makes the key once, beside the configuration, readable only by the user", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "debrief-key-"));
    const env = { DEBRIEF_CONFIG: path.join(folder, "config", "config.json") };
    const file = logKeyFile(env);
    expect(file).toBe(path.join(folder, "config", "log-key"));
    const first = loadLogKey(env);
    expect(first).toHaveLength(32);
    expect(readFileSync(file, "ascii")).toBe(first.toString("hex"));
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(loadLogKey(env)).toEqual(first);
    expect(loadLogKey({ ...env, DEBRIEF_LOG_KEY: vectors.key })).toEqual(key);
  });
  it("logs a tool run as parameter names and kinds, never values", () => {
    const note = {
      ...tool(["*"], 0),
      name: "core.add_note",
      version: "0.0.2",
      parameters: [
        { name: "text", title: "Note", kind: "string" },
        { name: "at", title: "Time", kind: "time" },
      ],
    } as ToolDeclaration;
    expect(toolRunLine(note, { text: "Contact lost near NELSON", at: "05:00Z", x: 1 }, 2, "changed", 41.2)).toBe(
      "tool_run tool=core.add_note version=0.0.2 parameters=at:time,text:string undeclared_parameters=1 selected=2 outcome=changed ms=41",
    );
  });
  it("uses the service's words for how a run ended", () => {
    const python = readFileSync(path.join(repo, "python", "debrief-tools", "src", "debrief_tools", "diagnostics.py"), "utf8");
    const words = [...python.slice(python.indexOf("OUTCOMES = (")).matchAll(/^ {4}"(\w+)",$/gm)].map((m) => m[1]);
    const ts = readFileSync(path.join(repo, "vscode", "src", "diagnostics.ts"), "utf8");
    const ours = [...ts.slice(ts.indexOf("export type ToolOutcome")).split(";")[0].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(ours).toEqual(words);
    expect(words).toContain("needs_newer_schema_confirmed");
  });
  it("keeps only the service's own log lines and traceback frames; anything else is hashed", () => {
    setLogKey(key);
    try {
      expect(serviceLine("WARNING tool_failed tool=core.closest_approach")).toBe("WARNING tool_failed tool=core.closest_approach");
      expect(serviceLine('  File "/home/analyst/tools/nelson.py", line 12, in run')).toBe("  at nelson.py:12:run");
      const printed = serviceLine("NELSON and LATE do not overlap in time");
      expect(printed).toMatch(/^service_output text=<text:[0-9a-f]{8}>$/);
      expect(serviceLine("ValueError: NELSON and LATE do not overlap")).not.toContain("NELSON");
      expect(serviceLine("")).toBeUndefined();
      // The rest of a logged exception, as the service's formatter writes it.
      expect(serviceLine("ValueError message=<text:0123abcd>")).toBe("ValueError message=<text:0123abcd>");
      expect(serviceLine("  at core.py:114:closest_approach")).toBe("  at core.py:114:closest_approach");
      expect(serviceLine("  at NELSON and LATE")).toMatch(/^service_output/);
    } finally {
      setLogKey(undefined);
    }
  });
  it("never logs free text: no messages, problems, item ids or paths in clear", () => {
    const source = readFileSync(path.join(repo, "vscode", "src", "extension.ts"), "utf8");
    // Every log call is fixed words, codes and hashes; a template may only interpolate hashed() or codes.
    const calls = [...source.matchAll(/\b(?:log|diagnostics\.write)\(([^;]*)\);/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).not.toMatch(/\.message\b(?!\))|problem\b(?! \?)|itemId\}|fsPath/);
    }
    expect(source).not.toMatch(/\$\{tool\.name\}: \$\{problem\}/);
    expect(source).not.toMatch(/Opening \$\{itemId\}/);
  });
  it("writes to the output channel only through the redacting log", () => {
    const files = readdirSync(path.join(repo, "vscode", "src"), { recursive: true }).map(String).filter((f) => f.endsWith(".ts"));
    const writes = files.flatMap((f) =>
      [...readFileSync(path.join(repo, "vscode", "src", f), "utf8").matchAll(/\.appendLine\(|\boutput\.(append|replace)\(/g)].map(() => f),
    );
    // One: the DiagnosticLog's echo. What a REP import left out goes to an untitled document instead.
    expect(writes).toEqual(["extension.ts"]);
    const source = readFileSync(path.join(repo, "vscode", "src", "extension.ts"), "utf8");
    expect(source).toMatch(/new DiagnosticLog\([^)]*\(line\) => output\.appendLine\(line\)\)/);
    expect(source).toContain('openTextDocument({ content, language: "plaintext" })');
  });
});

describe("contributed menus", () => {
  const manifest = JSON.parse(readFileSync(path.join(repo, "vscode", "package.json"), "utf8"));
  it("give every context-menu entry a when clause, and no command definitions", () => {
    for (const entry of manifest.contributes.menus["view/item/context"]) {
      expect(entry.when, entry.command).toBeTruthy();
      expect(entry).not.toHaveProperty("title");
      expect(entry).not.toHaveProperty("category");
    }
  });
  it("offer colour and hiding on the outline's features only", () => {
    const when = (command: string) =>
      manifest.contributes.menus["view/item/context"].find((e: { command: string }) => e.command === command).when as string;
    for (const command of ["debrief.setColour", "debrief.hide", "debrief.show"]) expect(when(command)).toContain("view == debrief.outline");
  });
});

describe("hiding and colour are the plot's own content (SUB-22)", () => {
  const plot = {
    type: "FeatureCollection",
    schema_version: "0.0.9",
    features: [
      { id: "a", properties: { kind: "track", name: "A", style: { colour: "#e01c3e" } } },
      { id: "b", properties: { kind: "annotation", name: "B", hidden: true } },
      { id: "c", properties: { kind: "track", name: "C", hidden: true } },
      {
        id: "plot",
        geometry: null,
        properties: { kind: "plot", title: "P", view: { time_window: { start: "1995-12-12T05:00:00.000Z", end: "1995-12-12T06:00:00.000Z" } } },
      },
    ],
    provenance: [],
  } as unknown as Parameters<typeof displayed>[0];

  it("leaves hidden features and the plot's own details off the map, colours as they are", () => {
    const shown = displayed(plot);
    expect(shown.features.map((f) => f.id)).toEqual(["a"]);
    expect(shown.features[0]).toBe(plot.features[0]); // nothing restyled on the way
  });

  it("says how many features are hidden, so hiding never goes unseen", () => {
    expect(hiddenIds(plot)).toEqual(["b", "c"]);
    expect(isHidden(plot.features[3])).toBe(false);
    expect(hiddenNotice(2)).toBe("2 features of this plot are hidden on the map.");
    expect(hiddenNotice(1)).toBe("1 feature of this plot is hidden on the map.");
    expect(hiddenNotice(0)).toBeUndefined();
  });

  it("reads the plot's time window from its view", () => {
    expect(timeWindowOf(plot)).toEqual({ start: "1995-12-12T05:00:00.000Z", end: "1995-12-12T06:00:00.000Z" });
    expect(timeWindowOf({ ...plot, features: plot.features.slice(0, 3) })).toBeUndefined();
  });
});

describe("the History view (SUB-21, SUB-22)", () => {
  const steps = [
    { seq: 1, status: "applied", kind: "import", tool: "debrief-io.rep", agent: "a", at: "", records: 1 },
    { seq: 2, status: "applied", kind: "edit", tool: null, agent: "a", at: "", records: 1, notes: ["Colour of A set to green"] },
  ] as HistoryStep[];

  it("lists a colour change as a step, named by its note, and marks it as what Ctrl+Z takes next", () => {
    const rows = historyRows(steps, 2);
    expect(rows.map((r) => [r.step.seq, r.current, r.nextToUndo])).toEqual([
      [2, true, true],
      [1, false, false],
    ]);
    expect(describeStep(rows[0].step, () => undefined).label).toBe("Colour of A set to green");
    expect(historyRows(steps, 1).every((r) => !r.nextToUndo)).toBe(true); // the import can't be undone
  });
});
