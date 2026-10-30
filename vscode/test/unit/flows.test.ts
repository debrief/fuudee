/**
 * The shared command flows (PAR-09, PAR-17, docs/panel-parity-srd.md), each run against a recording
 * fake host: the questions asked, the messages shown and the service calls made are asserted here
 * once, for VS Code (src/extension.ts) and the playground (play/host.ts) both, which only implement
 * the host.
 */
import { describe, expect, it } from "vitest";
import type { DebriefFeatureCollection, ToolDeclaration, ToolResult } from "@debrief/schemas";
import { Refusal, type Done, type FlowHost, type ManyQuestion, type OpenSpec, type PickedFile, type PlotRef, type Question, type RememberQuestion, type SaveSpec, type SaveTarget, type Severity, type TextQuestion } from "../../webview/panels/flows/host.js";
import { COMBINE, NO_SERVICE, OPEN_NEW, runTool, SAVE_ANYWAY, SAVE_NEW, type ToolCall, type ToolRunHost } from "../../webview/panels/flows/runtool.js";
import { move, NOTHING_TO_REDO, NOTHING_TO_UNDO, type MoveHost } from "../../webview/panels/flows/move.js";
import { NOT_OFFERED, operationContext, operationsFor, runOperation, type OperationHost, type OperationState } from "../../webview/panels/flows/operation.js";
import { outlineIndex } from "../../webview/outlinemodel.js";
import type { CoverageReport, FigureSource, ReviewFlag } from "@debrief/schemas";
import { labelOf, titleOf } from "../../webview/panels/flows/host.js";
import { clearReviewFlag, dismissNewData, linkTrack, OPEN_PLOT as OPEN_PLOT_REASON, sayReviewFlags, SHOW_IN_CATALOGUES, takeNewData, unlinkTrack, type CollationHost, type PlotTarget, type TrackTarget } from "../../webview/panels/flows/collation.js";
import { CHANGED_ELSEWHERE } from "../../webview/panels/flows/step.js";
import { addPlotFile, askAgain, IMPORT_FILES, importPlot, NO_SERVICE as IMPORT_NO_SERVICE, type ImportHost } from "../../webview/panels/flows/importplot.js";
import { importNarrative, type NarrativeHost, type RememberedAnswers } from "../../webview/panels/flows/narrative.js";
import { importSensor, READ_AGAIN, type SensorHost } from "../../webview/panels/flows/sensor.js";
import { BY_FILE, BY_ID, COPY_ID, exportImage, findImageSource, GO_TO_LATEST, type ExportHost, type FindHost } from "../../webview/panels/flows/exportimage.js";
import { periodChoices, type NarrativePreview } from "../../src/narrativeimport.js";
import { describeTimes } from "../../src/format.js";
import type { SensorPreview } from "../../src/sensorimport.js";
import { PRESETS } from "../../webview/exportlogic.js";
import { READ_ONLY } from "../../src/figures.js";

// --- A recording fake host --------------------------------------------------------------------------

/**
 * Everything a flow did, in order: "ask" (any question: a confirmation or pick, several, one with a
 * box to remember, a line of text), "file" (a file to read or where to save one), "message", "call"
 * (the service), "open" (a plot or a panel).
 */
type Asked = Question | ManyQuestion | RememberQuestion | TextQuestion;
type Said =
  | { ask: Asked }
  | { file: ["pick", OpenSpec] | ["save", SaveSpec] | ["write", string, number] }
  | { message: [Severity, string, readonly string[]] }
  | { call: [string, ...unknown[]] }
  | { open: [string, ...unknown[]] };

const PLOT: PlotRef = { store: "s", item: "serial-1", base: { current: 3, plot_hash: "h3" }, properties: { title: "Serial 1", start_datetime: "2026-10-11T09:00:00Z", end_datetime: "2026-10-11T10:00:00Z" } };

class Recorder {
  readonly said: Said[] = [];
  /** What each question is answered, in turn (undefined: cancelled): a choice, choices, { choice, remember }, or text. */
  answers: unknown[] = [];
  /** What each message's buttons are answered, in turn. */
  buttons: (string | undefined)[] = [];
  /** The files chosen, in turn, to read or to save to. */
  files: (PickedFile | SaveTarget | undefined)[] = [];
  plotRef: PlotRef | undefined = PLOT;
  ready = true;

  get asked(): Asked[] {
    return this.said.flatMap((s) => ("ask" in s ? [s.ask] : []));
  }
  get messages(): [Severity, string, readonly string[]][] {
    return this.said.flatMap((s) => ("message" in s ? [s.message] : []));
  }
  get calls(): [string, ...unknown[]][] {
    return this.said.flatMap((s) => ("call" in s ? [s.call] : []));
  }
  get opened(): [string, ...unknown[]][] {
    return this.said.flatMap((s) => ("open" in s ? [s.open] : []));
  }
  get fileSteps(): Extract<Said, { file: unknown }>["file"][] {
    return this.said.flatMap((s) => ("file" in s ? [s.file] : []));
  }
  /** The kind of each thing done, in order: the flow's sequence. */
  get sequence(): string[] {
    return this.said.map((s) => Object.keys(s)[0]);
  }

  base(): FlowHost {
    const answer = <T>(q: Asked) => (this.said.push({ ask: q }), this.answers.shift() as T);
    return {
      ask: async (q) => answer(q),
      askMany: async (q) => answer(q),
      askRemembering: async (q) => answer(q),
      askText: async (q) => answer(q),
      pickFile: async (spec) => (this.said.push({ file: ["pick", spec] }), this.files.shift() as PickedFile | undefined),
      chooseSave: async (spec) => (this.said.push({ file: ["save", spec] }), this.files.shift() as SaveTarget | undefined),
      writeFile: async (target, data) => void this.said.push({ file: ["write", target.name, data.length] }),
      openPanel: (panel) => void this.said.push({ open: ["panel", panel] }),
      oneAtATime: (work) => work(),
      message: async (severity: Severity, text: string, buttons: readonly string[] = []) => (this.said.push({ message: [severity, text, buttons] }), buttons.length ? this.buttons.shift() : undefined),
      plot: () => this.plotRef,
      serviceReady: () => this.ready,
      reloadPlot: async () => (this.said.push({ open: ["reload"] }), undefined),
    };
  }
}
/** Let what a flow left running (a message's button, answered) finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// --- Running a tool -------------------------------------------------------------------------------

const TOOL = { name: "core.closest_approach", title: "Closest approach", explanation: "", applies_to: ["track"], parameters: [], outputs: ["non_spatial"] } as unknown as ToolDeclaration;
const RESULT = { non_spatial: [{ kind: "table", title: "CPA" }] } as unknown as ToolResult;

function toolHost(recorder: Recorder, outcomes: ToolCall[]): ToolRunHost {
  return {
    ...recorder.base(),
    callTool: async (tool, plot, values, options) => {
      recorder.said.push({ call: ["callTool", tool.name, plot.item, values, options] });
      return outcomes.shift()!;
    },
    openPlot: async (_plot, item) => void recorder.said.push({ open: ["plot", item] }),
    applyToolState: () => (recorder.said.push({ open: ["state"] }), false),
    showResults: (tool) => void recorder.said.push({ open: ["results", tool.name] }),
  };
}

describe("running a tool (shared flow)", () => {
  it("asks nothing and calls nothing with no plot open, or no service", async () => {
    const r = new Recorder();
    r.plotRef = undefined;
    expect(await runTool(toolHost(r, []), TOOL, [])).toEqual({ problem: "Open a plot first.", outcome: "refused" });
    r.plotRef = PLOT;
    r.ready = false;
    expect(await runTool(toolHost(r, []), TOOL, [])).toEqual({ problem: NO_SERVICE, outcome: "refused" });
    expect(r.said).toEqual([]);
  });

  it("runs on the plot's base, shows its results and says what it did", async () => {
    const r = new Recorder();
    const ran = await runTool(toolHost(r, [{ ok: true, message: "", result: RESULT, changed: false }]), TOOL, []);
    expect(ran).toEqual({ outcome: "unchanged" });
    expect(r.calls).toEqual([["callTool", "core.closest_approach", "serial-1", {}, {}]]);
    expect(r.opened).toEqual([["results", "core.closest_approach"]]);
  });

  it("shows the plot again when the tool changed it", async () => {
    const r = new Recorder();
    expect(await runTool(toolHost(r, [{ ok: true, message: "", result: {} as ToolResult, changed: true }]), TOOL, [])).toEqual({ outcome: "changed" });
    expect(r.opened).toEqual([["reload"]]);
  });

  it("asks before writing a newer schema, Save anyway, and calls again allowing it", async () => {
    const r = new Recorder();
    r.answers = [SAVE_ANYWAY];
    const host = toolHost(r, [{ ok: false, newerSchema: true, message: "The catalogue is a newer version." }, { ok: true, message: "", changed: false }]);
    expect(await runTool(host, TOOL, [])).toEqual({ outcome: "unchanged" });
    expect(r.asked).toEqual([{ kind: "confirm", text: "The catalogue is a newer version.", choices: ["Save anyway"] }]);
    expect(r.calls.map((c) => c[4])).toEqual([{}, { allow_newer_schema: true }]);
  });

  it("saves nothing when the newer schema is not confirmed", async () => {
    const r = new Recorder();
    const host = toolHost(r, [{ ok: false, newerSchema: true, message: "Newer." }]);
    expect(await runTool(host, TOOL, [])).toEqual({ problem: "Closest approach was not saved.", outcome: "needs_newer_schema_confirmed" });
    expect(r.calls).toHaveLength(1);
  });

  it("on a change made elsewhere, offers to combine or save as a new plot, in VS Code's words", async () => {
    const r = new Recorder();
    r.answers = [COMBINE];
    const host = toolHost(r, [{ ok: false, conflict: { mergeable: true }, message: "Changed." }, { ok: true, message: "", changed: true }]);
    expect(await runTool(host, TOOL, [])).toEqual({ outcome: "changed" });
    expect(r.asked).toEqual([
      {
        kind: "confirm",
        text: "The plot was changed elsewhere while you were working. The other change touches different features from Closest approach's, so the two can be combined, or Closest approach's result can be saved as a new plot.",
        choices: [COMBINE, SAVE_NEW],
      },
    ]);
    expect(r.calls.map((c) => c[4])).toEqual([{}, { on_conflict: "merge" }]);
  });

  it("offers only a new plot when the changes touch the same features; cancelled, shows the latest", async () => {
    const r = new Recorder();
    r.answers = [undefined];
    const host = toolHost(r, [{ ok: false, conflict: { mergeable: false }, message: "Changed." }]);
    expect(await runTool(host, TOOL, [])).toEqual({
      problem: "Closest approach was not run: the plot was changed elsewhere. Debrief is showing the latest; run it again if it still applies.",
      outcome: "conflict",
    });
    expect((r.asked[0] as Question).choices).toEqual([SAVE_NEW]);
    expect((r.asked[0] as Question).text).toMatch(/^The plot was changed elsewhere while you were working, and the change touches the same features as Closest approach's\./);
    expect(r.opened).toEqual([["reload"]]);
  });

  it("offers a result saved as a new plot, and opens it only when asked (PAR-12)", async () => {
    const r = new Recorder();
    r.answers = [SAVE_NEW];
    const host = toolHost(r, [{ ok: false, conflict: { mergeable: false }, message: "Changed." }, { ok: true, message: "", result: RESULT, newItem: "serial-1-2" }]);
    expect(await runTool(host, TOOL, [])).toEqual({ outcome: "saved_as_new_plot" });
    expect(r.calls.map((c) => c[4])).toEqual([{}, { on_conflict: "new_plot" }]);
    expect(r.messages).toEqual([["info", "Closest approach: your result was saved as a new plot, serial-1-2. The original keeps the other change.", [OPEN_NEW]]]);
    await settle();
    // Not chosen: the original shown again, the new plot not opened, no results.
    expect(r.opened).toEqual([["reload"]]);

    const chosen = new Recorder();
    chosen.answers = [SAVE_NEW];
    chosen.buttons = [OPEN_NEW];
    await runTool(toolHost(chosen, [{ ok: false, conflict: { mergeable: false }, message: "" }, { ok: true, message: "", newItem: "serial-1-2" }]), TOOL, []);
    await settle();
    expect(chosen.opened).toEqual([["reload"], ["plot", "serial-1-2"]]);
  });

  it("says the service's own refusal as it is", async () => {
    const r = new Recorder();
    expect(await runTool(toolHost(r, [{ ok: false, message: "It failed.", outcome: "failed" }]), TOOL, [])).toEqual({ problem: "It failed.", outcome: "failed" });
  });
});

// --- Undo, redo and go to ---------------------------------------------------------------------------

function moveHost(recorder: Recorder, can = { canUndo: true, canRedo: true }, refuse: (Refusal | Error)[] = []): MoveHost {
  return {
    ...recorder.base(),
    history: async () => can,
    move: async (how, base, step, allow) => {
      recorder.said.push({ call: ["move", how, base, step, allow] });
      const refusal = refuse.shift();
      if (refusal) throw refusal;
    },
    refreshHistory: async () => void recorder.said.push({ open: ["history"] }),
  };
}

describe("undo, redo and go to (shared flow)", () => {
  it("sends the base it started from, shows the plot again, and closes nothing", async () => {
    const r = new Recorder();
    expect(await move(moveHost(r), "undo")).toBeUndefined();
    expect(r.said).toEqual([{ call: ["move", "undo", PLOT.base, undefined, false] }, { open: ["reload"] }, { open: ["history"] }]);
  });

  it("goes to a step by its number", async () => {
    const r = new Recorder();
    await move(moveHost(r), "goto", 2);
    expect(r.calls).toEqual([["move", "goto", PLOT.base, 2, false]]);
  });

  it("says there is nothing to undo, or redo, and asks the service nothing", async () => {
    const r = new Recorder();
    expect(await move(moveHost(r, { canUndo: false, canRedo: false }), "undo")).toBe(NOTHING_TO_UNDO);
    expect(await move(moveHost(r, { canUndo: false, canRedo: false }), "redo")).toBe(NOTHING_TO_REDO);
    expect(r.messages).toEqual([
      ["warning", "There is nothing to undo.", []],
      ["warning", "There is nothing to redo.", []],
    ]);
    expect(r.calls).toEqual([]);
  });

  it("refuses with no plot open, or an earlier revision shown read-only", async () => {
    const r = new Recorder();
    r.plotRef = undefined;
    expect(await move(moveHost(r), "undo")).toBe("Open a plot first.");
    r.plotRef = { ...PLOT, readOnly: true };
    expect(await move(moveHost(r), "redo")).toBe(READ_ONLY);
    expect(r.calls).toEqual([]);
  });

  it("on a change made elsewhere, undoes nothing and shows the latest", async () => {
    const r = new Recorder();
    expect(await move(moveHost(r, undefined, [new Refusal("conflict", "Changed.")]), "undo")).toBe(
      "The plot was changed elsewhere, so nothing was undone. Debrief is showing the latest; try again if you still want to.",
    );
    expect(r.opened).toEqual([["reload"], ["history"]]);
  });

  it("asks before writing a newer schema, then replays allowing it", async () => {
    const r = new Recorder();
    r.answers = [SAVE_ANYWAY];
    expect(await move(moveHost(r, undefined, [new Refusal("newer_schema", "Newer.")]), "redo")).toBeUndefined();
    expect(r.calls.map((c) => c[4])).toEqual([false, true]);
    const declined = new Recorder();
    expect(await move(moveHost(declined, undefined, [new Refusal("newer_schema", "Newer.")]), "redo")).toBe("Nothing was changed.");
    expect(declined.asked).toEqual([{ kind: "confirm", text: "Newer.", choices: [SAVE_ANYWAY] }]);
  });
});

// --- The Tools' entries for the Outline's selection ------------------------------------------------

const T = (hhmm: string) => `2026-10-11T${hhmm}:00.000Z`;
const cut = (id: string, time: string, more: Record<string, unknown> = {}) => ({ type: "Feature", id, geometry: null, properties: { kind: "sensor_cut", sensor_id: "sensor-ta", time, bearing: { value: 45, unit: "deg" }, ...more } });
const times = ["09:00", "09:01", "09:02", "09:03", "09:04", "09:05"].map(T);
const solution = (id: string, name: string) => ({
  type: "Feature",
  id,
  geometry: { type: "LineString", coordinates: times.map((_, i) => [0.1 + i * 0.001, 0.1]) },
  properties: { kind: "track", name, times, courses: { unit: "deg", values: times.map(() => 90) }, speeds: { unit: "[kn_i]", values: times.map(() => 6) }, tma: { contact: name, sensor_ids: ["sensor-ta"], cut_ids: ["cut-1", "cut-2"], period: { start: T("09:00"), end: T("09:05") } } },
});
const plot = {
  type: "FeatureCollection",
  schema_version: "0.0.24",
  provenance: [],
  features: [
    { type: "Feature", id: "track-blue", geometry: { type: "LineString", coordinates: [[0, 0], [0.2, 0]] }, properties: { kind: "track", name: "BLUE ONE", times: [T("08:59"), T("09:10")], courses: { unit: "deg", values: [90, 90] } } },
    { type: "Feature", id: "sensor-ta", geometry: null, properties: { kind: "sensor", name: "Towed array", host_track_id: "track-blue" } },
    cut("cut-1", T("09:00"), { ambiguous_bearing: { value: 135, unit: "deg" } }),
    cut("cut-2", T("09:01")),
    solution("sol-a", "Contact A"),
    solution("sol-b", "Contact B"),
  ],
} as unknown as DebriefFeatureCollection;
const STATE: OperationState = { index: outlineIndex(plot), keys: ["cut-1", "cut-2"], window: { start: T("09:00"), end: T("09:05") } };

function operationHost(recorder: Recorder, state: OperationState = STATE, done: Done = { notes: ["2 cuts hidden", "Contact A keeps 0 cuts"] }): OperationHost {
  const call = (name: string) => async (...args: unknown[]) => (recorder.said.push({ call: [name, ...args] }), done);
  return {
    ...recorder.base(),
    operationState: () => state,
    splitLeg: call("splitLeg"),
    setCutsHidden: call("setCutsHidden"),
    deleteCuts: call("deleteCuts"),
    exclude: call("exclude"),
    keepSide: call("keepSide"),
    makeSolution: async (sensor, focus) => void recorder.said.push({ open: ["bearings", sensor, focus] }),
  };
}

describe("the Tools' entries for the Outline's selection (shared flow)", () => {
  it("reads one context: the Outline's rows chosen, or the rows a menu was opened on", () => {
    expect(operationContext({ keys: [] })).toBeUndefined();
    expect(operationContext(STATE)!.picks.map((p) => ("id" in p ? p.id : ""))).toEqual(["cut-1", "cut-2"]);
    expect(operationContext(STATE, ["cut-2"])!.picks).toHaveLength(1);
    expect(operationContext({ ...STATE, readOnly: true })!.readOnly).toBe(true);
    expect(operationsFor({ keys: [] })).toEqual([]);
  });

  it("refuses with nothing it acts on selected, in VS Code's words", async () => {
    const r = new Recorder();
    expect(await runOperation(operationHost(r, { ...STATE, keys: ["track-blue"] }), "hide-cuts")).toEqual({ problem: NOT_OFFERED });
    expect(r.messages).toEqual([["warning", "Select what this acts on in the Outline first: a solution's position, cuts, or a sensor.", []]]);
    expect(r.calls).toEqual([]);
  });

  it("refuses an entry that cannot act with its reason", async () => {
    const r = new Recorder();
    const reason = operationsFor({ ...STATE, readOnly: true }).find((o) => o.id === "hide-cuts")!.reason!;
    expect(await runOperation(operationHost(r, { ...STATE, readOnly: true }), "hide-cuts")).toEqual({ problem: reason });
    expect(r.messages).toEqual([["warning", reason, []]]);
  });

  it("hides the cuts, then says what that did, in sentences", async () => {
    const r = new Recorder();
    expect(await runOperation(operationHost(r), "hide-cuts")).toEqual({ notes: ["2 cuts hidden", "Contact A keeps 0 cuts"] });
    expect(r.calls).toEqual([["setCutsHidden", ["cut-1", "cut-2"], true]]);
    expect(r.messages).toEqual([["info", "2 cuts hidden. Contact A keeps 0 cuts.", []]]);
  });

  it("asks which solution when the cuts are rooted in several and Bearings shows none; cancelled, does nothing", async () => {
    const r = new Recorder();
    r.answers = ["Contact B", undefined];
    await runOperation(operationHost(r), "leave-out");
    expect(r.asked).toEqual([{ kind: "pick", text: "Leave the cuts out of which solution?", choices: ["Contact A", "Contact B"] }]);
    expect(r.calls).toEqual([["exclude", "sol-b", ["cut-1", "cut-2"], true]]);
    expect(await runOperation(operationHost(r), "count-in")).toEqual({});
    expect(r.calls).toHaveLength(1);
    // Bearings showing one of them: that one, nothing asked.
    const shown = new Recorder();
    await runOperation(operationHost(shown, { ...STATE, shownSolution: "sol-a" }), "leave-out");
    expect(shown.asked).toEqual([]);
    expect(shown.calls).toEqual([["exclude", "sol-a", ["cut-1", "cut-2"], true]]);
  });

  it("keeps a side of the ambiguous cuts only", async () => {
    const r = new Recorder();
    await runOperation(operationHost(r, STATE, { notes: ["1 cut resolved."] }), "keep-port");
    expect(r.calls).toEqual([["keepSide", "port", ["cut-1"]]]);
    expect(r.messages).toEqual([["info", "1 cut resolved.", []]]);
  });

  it("opens the first guess's form in Bearings for a solution from the cuts", async () => {
    const r = new Recorder();
    expect(await runOperation(operationHost(r), "tma-from-cuts")).toEqual({});
    expect(r.opened).toEqual([["bearings", "sensor-ta", { make: true, cut_ids: ["cut-1", "cut-2"] }]]);
  });

  it("says a change's problem as a warning", async () => {
    const r = new Recorder();
    expect(await runOperation(operationHost(r, STATE, { problem: "The plot was changed elsewhere." }), "delete-cuts")).toEqual({ problem: "The plot was changed elsewhere." });
    expect(r.messages).toEqual([["warning", "The plot was changed elsewhere.", []]]);
  });
});

// --- Collation (CAP-08 to CAP-12) ----------------------------------------------------------------

const COVERAGE = {
  plot: { catalogue: "cat", item: "serial-1", title: "Serial 1" },
  items: [
    { catalogue: "cat", item: "serial-1", title: "Serial 1", role: "this_plot" },
    { catalogue: "cat", item: "nav-log", title: "BLUE ONE navigation log", role: "other", revision: "sha256:1", new_data: { revision: "sha256:1", note: "New data for Serial 1: BLUE ONE" } },
  ],
  platforms: [{ track: "track-blue-one", name: "BLUE ONE", sources: [{ catalogue: "cat", item: "nav-log", track: "t1", name: "Blue One", link: "proposed" }], periods: [] }],
} as unknown as CoverageReport;
const LOG_ROW: PlotTarget = { store: "s", catalogue: "cat", item: "nav-log", title: "BLUE ONE navigation log" };
const LOG_TRACK: TrackTarget = { ...LOG_ROW, track: "t1", name: "Blue One" };

function collationHost(r: Recorder, answers: { changed: boolean; message?: string }[] = [{ changed: true }], refuse?: Refusal): CollationHost {
  return {
    ...r.base(),
    coverage: () => COVERAGE,
    plotTracks: () => [
      { id: "track-red-one", name: "RED ONE" },
      { id: "track-blue-one", name: "BLUE ONE" },
    ],
    collate: async (plot, change, allow) => {
      r.said.push({ call: ["collate", plot.item, change, allow] });
      if (refuse && !allow) throw refuse;
      return answers.shift()!;
    },
    collationView: async (where, change) => void r.said.push({ call: ["collationView", where.item, change] }),
    refreshCollation: async () => void r.said.push({ open: ["collation"] }),
    refreshHistory: async () => void r.said.push({ open: ["history"] }),
  };
}

describe("collation (shared flows)", () => {
  it("refuses to take data with no plot open, in the catalogue's words (PAR-08)", async () => {
    const r = new Recorder();
    r.plotRef = undefined;
    expect(await takeNewData(collationHost(r), LOG_ROW)).toBe(OPEN_PLOT_REASON);
    expect(r.messages).toEqual([["warning", "Open a plot first.", []]]);
    expect(r.calls).toEqual([]);
  });

  it("takes a row's data as one step, the plot shown again, in VS Code's words", async () => {
    const r = new Recorder();
    expect(await takeNewData(collationHost(r), LOG_ROW)).toBeUndefined();
    expect(r.calls).toEqual([["collate", "serial-1", { kind: "take", source: { catalogue: "cat", item: "nav-log", revision: "sha256:1" } }, false]]);
    expect(r.opened).toEqual([["reload"], ["history"]]);
    expect(r.messages).toEqual([["info", "Took the new data in BLUE ONE navigation log into Serial 1, as one step. Undo takes it back.", []]]);
  });

  it("asks which item from the Command Palette, with each item's mark and note", async () => {
    const r = new Recorder();
    r.answers = ["0"];
    await takeNewData(collationHost(r));
    expect(r.asked).toEqual([{ kind: "pick", text: "Take data from which item into Serial 1?", choices: [{ label: "BLUE ONE navigation log", description: "New data", detail: "New data for Serial 1: BLUE ONE", id: "0" }] }]);
    expect(r.calls).toHaveLength(1);
  });

  it("says when nothing was taken, and confirms a newer schema first", async () => {
    const r = new Recorder();
    expect(await takeNewData(collationHost(r, [{ changed: false, message: "The plot already has this item's data." }]), LOG_ROW)).toBe("The plot already has this item's data.");
    expect(r.opened).toEqual([["collation"]]);
    const newer = new Recorder();
    newer.answers = [SAVE_ANYWAY];
    await takeNewData(collationHost(newer, [{ changed: true }], new Refusal("newer_schema", "Newer.")), LOG_ROW);
    expect(newer.asked).toEqual([{ kind: "confirm", text: "Newer.", choices: ["Save anyway"] }]);
    expect(newer.calls.map((c) => c[3])).toEqual([false, true]);
  });

  it("never overwrites a change made elsewhere", async () => {
    const r = new Recorder();
    expect(await takeNewData(collationHost(r, [], new Refusal("conflict", "Changed.")), LOG_ROW)).toBe(CHANGED_ELSEWHERE);
    expect(r.messages).toEqual([["warning", CHANGED_ELSEWHERE, []]]);
  });

  it("sets new data aside in the open plot's island; says why when the row has none", async () => {
    const r = new Recorder();
    expect(await dismissNewData(collationHost(r), LOG_ROW)).toBeUndefined();
    expect(r.calls).toEqual([["collationView", "serial-1", { kind: "dismiss", source: { catalogue: "cat", item: "nav-log", revision: "sha256:1" } }]]);
    expect(r.messages).toEqual([["info", "BLUE ONE navigation log set aside. It is marked again if it is revised.", []]]);
    const none = new Recorder();
    expect(await dismissNewData(collationHost(none))).toMatch(/^Choose an item marked New data in Catalogues/);
  });

  it("clears a review flag on the row's plot, with no plot open too", async () => {
    const r = new Recorder();
    r.plotRef = undefined;
    expect(await clearReviewFlag(collationHost(r), { ...LOG_ROW, item: "serial-2", title: "Serial 2" })).toBeUndefined();
    expect(r.calls).toEqual([["collationView", "serial-2", { kind: "reviewed" }]]);
    expect(r.messages[0][1]).toBe("Review flag cleared on Serial 2. It is flagged again if an item it drew from is revised.");
  });

  it("links a track to one of the open plot's, the one named alike first; unlinks one proposed", async () => {
    const r = new Recorder();
    r.answers = ["track-blue-one"];
    await linkTrack(collationHost(r), LOG_TRACK);
    expect((r.asked[0] as Question).choices).toEqual([
      { label: "BLUE ONE", id: "track-blue-one" },
      { label: "RED ONE", id: "track-red-one" },
    ]);
    expect(r.calls[0][2]).toEqual({ kind: "link", feature: "track-blue-one", source: { catalogue: "cat", item: "nav-log", track: "t1", name: "Blue One" }, linked: true });
    expect(r.messages.at(-1)).toEqual(["info", "Blue One in BLUE ONE navigation log linked.", []]);
    const un = new Recorder();
    await unlinkTrack(collationHost(un), LOG_TRACK);
    expect(un.calls[0][2]).toMatchObject({ feature: "track-blue-one", linked: false });
    expect(un.messages.at(-1)).toEqual(["info", "Blue One in BLUE ONE navigation log is not BLUE ONE.", []]);
  });

  it("says new review flags once, all in one notice, with Show in Catalogues", async () => {
    const r = new Recorder();
    r.buttons = [SHOW_IN_CATALOGUES];
    const flags = [
      { catalogue: "cat", item: "serial-1", title: "Serial 1", note: "May need review: nav-log was revised", revised: [{ revision: "a" }] },
      { catalogue: "other", item: "serial-2", title: "Serial 2", note: "May need review", revised: [{ revision: "b" }] },
    ] as unknown as ReviewFlag[];
    const said = new Set<string>();
    expect(sayReviewFlags(r.base(), flags, said)).toBe("2 plots may need review: items they took data from were revised (Serial 1, Serial 2).");
    await settle();
    expect(r.messages).toEqual([["info", "2 plots may need review: items they took data from were revised (Serial 1, Serial 2).", ["Show in Catalogues"]]]);
    expect(r.opened).toEqual([["panel", "catalogues"]]);
    expect(sayReviewFlags(r.base(), flags, said)).toBeUndefined();
    expect(sayReviewFlags(r.base(), [flags[0]], new Set())).toBe("May need review: nav-log was revised.");
  });
});

// --- Import (CAP-01, EXT-14) -----------------------------------------------------------------------

const REP: PickedFile = { name: "demo.rep" };
function importHost(r: Recorder, options: { mode?: "ask" | "otg" | "dr"; omitted?: string[]; tracks?: string[]; preview?: Partial<NarrativePreview>; refuse?: Refusal } = {}): ImportHost {
  let mode = options.mode ?? "ask";
  return {
    ...r.base(),
    chooseCatalogue: async (_purpose, given) => given ?? "s",
    previewDocument: async () => options.preview as NarrativePreview | undefined,
    repTracks: async () => options.tracks ?? ["NELSON", "BLUE"],
    importMode: async () => mode,
    setImportMode: async (m) => void (r.said.push({ call: ["setImportMode", m] }), (mode = m)),
    rememberedNote: "To change it, see Settings.",
    importFile: async (store, file, opts, allow) => {
      r.said.push({ call: ["importFile", store, file.name, opts, allow] });
      if (options.refuse && !allow) throw options.refuse;
      return { item: "demo", tracks: ["NELSON", "BLUE"], fixes: 4, omitted: options.omitted ?? [], notes: ["Tracks were plotted by DR as you chose."] };
    },
    addPlotFile: async (store, file) => (r.said.push({ call: ["addPlotFile", store, file.name] }), { item: "sent", title: "Serial 1 (from sent.geojson)", steps: 8 }),
    refreshCatalogues: async () => void r.said.push({ open: ["catalogues"] }),
    showNotImported: async (file, omitted) => void r.said.push({ open: ["not imported", file.name, omitted] }),
    openPlotIn: async (store, item) => void r.said.push({ open: ["plot", store, item] }),
  };
}

describe("import (shared flow)", () => {
  it("asks how each REP track is plotted, one question each, with the box for future imports; the plot offered, not opened", async () => {
    const r = new Recorder();
    r.files = [REP];
    r.answers = [{ choice: "dr", remember: false }, { choice: "otg", remember: false }];
    r.buttons = [undefined];
    expect(await importPlot(importHost(r))).toEqual({ item: "demo", notes: ["Tracks were plotted by DR as you chose."], omitted: [] });
    expect(r.fileSteps[0]).toEqual(["pick", IMPORT_FILES]);
    expect(r.asked).toEqual([
      { title: "How is NELSON plotted? (1 of 2)", text: "Over the ground, as logged, or dead reckoned from course and speed", choices: [{ label: "Over the ground (OTG)", description: "each fix where it was logged", id: "otg" }, { label: "Dead reckoning (DR)", description: "from the first fix, by each fix's course and speed", id: "dr" }], remember: "Use this choice for future track imports" },
      expect.objectContaining({ title: "How is BLUE plotted? (2 of 2)" }),
    ]);
    expect(r.calls).toEqual([["importFile", "s", "demo.rep", { modes: { NELSON: "dr", BLUE: "otg" } }, false]]);
    expect(r.messages).toEqual([["info", "Imported 2 tracks, 4 fixes.", ["Open plot"]]]);
    expect(r.opened).toEqual([["catalogues"]]);
  });

  it("remembers a choice for the tracks still to come and for future imports; Ask again forgets it", async () => {
    const r = new Recorder();
    r.files = [REP];
    r.answers = [{ choice: "dr", remember: true }];
    const host = importHost(r);
    await importPlot(host);
    expect(r.asked).toHaveLength(1);
    expect(r.calls).toContainEqual(["setImportMode", "dr"]);
    expect(r.calls).toContainEqual(["importFile", "s", "demo.rep", { modes: { NELSON: "dr", BLUE: "dr" } }, false]);
    // Remembered: asked nothing, and the summary says so with how to change it.
    const again = new Recorder();
    again.files = [REP];
    await importPlot(importHost(again, { mode: "dr" }));
    expect(again.asked).toEqual([]);
    expect(again.calls[0]).toEqual(["importFile", "s", "demo.rep", { modes: { NELSON: "dr", BLUE: "dr" }, remembered: "To change it, see Settings." }, false]);
    expect(again.messages[0][1]).toBe("Imported 2 tracks, 4 fixes. Tracks were plotted by DR as you chose.");
    const forget = new Recorder();
    await askAgain(importHost(forget, { mode: "dr" }));
    expect(forget.calls).toEqual([["setImportMode", "ask"]]);
    expect(forget.messages).toEqual([["info", "Debrief will ask, for each track imported, whether it is plotted over the ground (OTG) or by dead reckoning (DR).", []]]);
  });

  it("imports nothing when a question is put away, and says so", async () => {
    const r = new Recorder();
    r.files = [REP];
    r.answers = [undefined];
    expect(await importPlot(importHost(r))).toBeUndefined();
    expect(r.calls).toEqual([]);
    expect(r.messages).toEqual([["info", "Nothing was imported.", []]]);
  });

  it("says what was not imported, shows it when asked, and offers the plot", async () => {
    const r = new Recorder();
    r.files = [{ name: "legacy.dpf" }];
    r.buttons = ["Show what was not imported"];
    await importPlot(importHost(r, { omitted: ["Line 3: not understood"] }));
    expect(r.asked).toEqual([]);
    expect(r.messages).toEqual([["warning", "Imported 2 tracks, 4 fixes. Some content was not imported.", ["Show what was not imported", "Open plot"]]]);
    expect(r.opened).toContainEqual(["not imported", "legacy.dpf", ["Line 3: not understood"]]);
    expect(r.opened).not.toContainEqual(expect.arrayContaining(["plot"]));
    const open = new Recorder();
    open.files = [{ name: "legacy.dpf" }];
    open.buttons = ["Open plot"];
    await importPlot(importHost(open));
    expect(open.opened).toContainEqual(["plot", "s", "demo"]);
  });

  it("asks the name of an ASW document's track, as legacy Debrief did", async () => {
    const r = new Recorder();
    r.files = [{ name: "asw.docx" }];
    r.answers = ["RED ONE"];
    await importPlot(importHost(r, { preview: { name: "asw.docx", fixes: 12 } }));
    expect(r.asked).toEqual([{ title: "Name for this track", prompt: "asw.docx holds 12 positions of one platform.", value: "asw" }]);
    expect(r.calls[0]).toEqual(["importFile", "s", "asw.docx", { track_name: "RED ONE" }, false]);
  });

  it("confirms a newer schema before saving: Save anyway", async () => {
    const r = new Recorder();
    r.files = [{ name: "legacy.dpf" }];
    r.answers = [SAVE_ANYWAY];
    await importPlot(importHost(r, { refuse: new Refusal("newer_schema", "Newer.") }));
    expect(r.asked).toEqual([{ kind: "confirm", text: "Newer.", choices: ["Save anyway"] }]);
    expect(r.calls.map((c) => c[4])).toEqual([false, true]);
  });

  it("adds a Debrief plot file with its history, offering to open it", async () => {
    const r = new Recorder();
    r.files = [{ name: "sent.geojson" }];
    expect(await importPlot(importHost(r))).toEqual({ item: "sent" });
    expect(r.calls).toEqual([["addPlotFile", "s", "sent.geojson"]]);
    expect(r.messages).toEqual([["info", "Added Serial 1 (from sent.geojson) with its history: 8 steps, undo and redo included.", ["Open plot"]]]);
    const added = new Recorder();
    await addPlotFile(importHost(added), { store: "t", file: { name: "sent.geojson" }, quiet: true });
    expect(added.fileSteps).toEqual([]);
    expect(added.messages).toEqual([["info", "Added Serial 1 (from sent.geojson) with its history: 8 steps, undo and redo included.", []]]);
  });

  it("needs the tool service, and refuses plainly without it", async () => {
    const r = new Recorder();
    r.ready = false;
    expect(await importPlot(importHost(r))).toEqual({ problem: IMPORT_NO_SERVICE });
    expect(r.messages).toEqual([["error", IMPORT_NO_SERVICE, []]]);
  });
});

// --- Narrative and sensor data read into the open plot (CAP-19, CAP-20, CAP-22) ------------------

const PREVIEW = {
  name: "log.docx",
  format: "docx",
  dialect: "narrative-document",
  described: "Word document, read as a narrative log",
  entries: 7,
  fixes: 0,
  types: [
    { name: "SONAR", count: 3 },
    { name: "COMMS", count: 4 },
  ],
  sources: [{ name: "BLUE TWO", count: 2, track_id: null }],
  unnamed: 0,
  platform: null,
  start: null,
  end: null,
  plot_start: "2026-10-11T09:00:00Z",
  plot_end: "2026-10-11T10:00:00Z",
  outside: 2,
  omitted: [],
  notes: [],
} as NarrativePreview;

function narrativeHost(r: Recorder, preview: NarrativePreview = PREVIEW, remembered?: RememberedAnswers): NarrativeHost {
  return {
    ...r.base(),
    previewNarrative: async () => preview,
    narrativeAnswers: async () => remembered,
    rememberNarrativeAnswers: async (dialect, answers) => void r.said.push({ call: ["remember", dialect, answers] }),
    plotTracks: () => [{ id: "track-red-one", name: "RED ONE" }],
    readNarrative: async (plot, file, choices) => (r.said.push({ call: ["read", file.name, choices] }), { entries: 3, omitted: [] }),
  };
}

describe("narrative import (shared flow)", () => {
  it("is refused with no plot open (PAR-08)", async () => {
    const r = new Recorder();
    r.plotRef = undefined;
    expect(await importNarrative(narrativeHost(r))).toEqual({ problem: "Open a plot first." });
    expect(r.fileSteps).toEqual([]);
  });

  it("asks what legacy Debrief asked, one question at a time, in VS Code's order", async () => {
    const r = new Recorder();
    r.files = [{ name: "log.docx" }];
    r.answers = [["SONAR"], periodChoices(PREVIEW, (iso) => describeTimes(iso)).within, "1"];
    const read = await importNarrative(narrativeHost(r));
    expect(read).toEqual({ entries: 3, omitted: [] });
    expect(r.sequence).toEqual(["file", "ask", "ask", "ask", "call", "call", "open", "message"]);
    const [types, period, platform] = r.asked as [ManyQuestion, Question, Question];
    expect(types).toEqual({ title: "Read which types from log.docx?", text: "Word document, read as a narrative log: 7 entries", choices: [{ label: "SONAR", description: "3 entries" }, { label: "COMMS", description: "4 entries" }], picked: ["SONAR", "COMMS"] });
    expect(period.title).toBe("2 entries of log.docx are outside the plot's period");
    expect(period.choices[0]).toBe("All 7 entries");
    expect(platform).toMatchObject({ title: "Which track is BLUE TWO's?", choices: [{ label: "RED ONE", id: "0" }, { label: "No track", id: "1" }] });
    expect(r.calls.find((c) => c[0] === "read")).toEqual(["read", "log.docx", { types: ["SONAR"], within_period: true, tracks: { "BLUE TWO": null } }]);
    expect(r.messages).toEqual([["info", "Read 3 narrative entries into the plot.", []]]);
  });

  it("offers last time's answers first, read with one key", async () => {
    const r = new Recorder();
    r.files = [{ name: "log.docx" }];
    r.answers = ["Read as last time"];
    await importNarrative(narrativeHost(r, PREVIEW, { skipTypes: ["COMMS"], withinPeriod: false, tracks: { "BLUE TWO": null } }));
    expect(r.asked).toEqual([
      {
        kind: "pick",
        title: "Read log.docx",
        text: "Word document, read as a narrative log: 7 entries",
        choices: [
          { label: "Read as last time", detail: "All types but COMMS; all entries, in the plot's period or not; BLUE TWO on no track" },
          { label: "Choose again", detail: "Which types, the period, which track each platform is" },
        ],
      },
    ]);
    expect(r.calls).toEqual([["read", "log.docx", { types: ["SONAR"], tracks: { "BLUE TWO": null } }]]);
  });

  it("asks first about a file read in before: skip what is there, or read nothing", async () => {
    const r = new Recorder();
    r.files = [{ name: "log.rep" }];
    r.answers = ["Cancel"];
    const rep = { ...PREVIEW, name: "log.rep", format: "rep", dialect: null, already: 7 } as NarrativePreview;
    expect(await importNarrative(narrativeHost(r, rep))).toEqual({ problem: "Nothing was read." });
    expect((r.asked[0] as Question).choices).toEqual([
      { label: "Skip entries already in the plot", detail: "Nothing new to read" },
      { label: "Cancel", detail: "Read nothing" },
    ]);
    expect(r.calls).toEqual([]);
  });

  it("asks nothing for an agent: its choices say", async () => {
    const r = new Recorder();
    await importNarrative(narrativeHost(r), { file: { name: "log.docx" }, choices: { types: ["SONAR"] }, quiet: true });
    expect(r.asked).toEqual([]);
    expect(r.calls).toEqual([["read", "log.docx", { types: ["SONAR"] }]]);
  });
});

const SENSORS: SensorPreview = {
  name: "nelson.dsf",
  sensors: [{ track: "NELSON", sensor: "Hull array", name: "Hull array", cuts: 3, ambiguous: 2, lines: 3, start: "2023-06-15T09:00:00Z", end: "2023-06-15T09:10:00Z", host_track_id: null, host: null }],
  cuts: 3,
  fixes: 0,
  tracks: [
    { id: "track-red-one", name: "RED ONE" },
    { id: "track-blue-one", name: "BLUE ONE" },
  ],
  omitted: [],
  notes: [],
  content_hash: "h",
  earlier: [{ step: 4, at: "2023-06-15T09:00:00Z", by: "you", how: "Sensor data read from nelson.dsf", name: "nelson.dsf" }],
};
function sensorHost(r: Recorder): SensorHost {
  return {
    ...r.base(),
    previewSensor: async () => SENSORS,
    readSensor: async (plot, file, hosts, again) => (r.said.push({ call: ["read", file.name, hosts, again] }), { sensors: ["Hull array"], cuts: 3, omitted: [], notes: [] }),
  };
}

describe("sensor import (shared flow)", () => {
  it("says a file read in before first, then asks which track carries a track the plot has not", async () => {
    const r = new Recorder();
    r.files = [{ name: "nelson.dsf" }];
    r.answers = [READ_AGAIN, "track-red-one"];
    const done = await importSensor(sensorHost(r));
    expect(done?.answer?.cuts).toBe(3);
    expect(r.asked[0]).toMatchObject({ kind: "pick", title: "nelson.dsf was read into this plot before", text: "Sensor data read from nelson.dsf, 15 Jun 2023 09:00:00Z" });
    expect(r.asked[1]).toEqual({
      kind: "pick",
      title: "Which track carries NELSON's sensors?",
      text: "Hull array on NELSON: 3 cuts, 2 ambiguous",
      choices: [
        { label: "RED ONE", id: "track-red-one" },
        { label: "BLUE ONE", id: "track-blue-one" },
        { label: "Do not read these", id: "" },
      ],
    });
    expect(r.calls).toEqual([["read", "nelson.dsf", { NELSON: "track-red-one" }, true]]);
    expect(r.messages).toEqual([["info", "3 cuts of 1 sensor read from nelson.dsf.", []]]);
  });

  it("reads nothing when cancelled, and says so", async () => {
    const r = new Recorder();
    r.files = [{ name: "nelson.dsf" }];
    r.answers = ["Cancel"];
    expect(await importSensor(sensorHost(r))).toEqual({ problem: "Nothing was read." });
    expect(r.calls).toEqual([]);
  });

  it("is refused with no plot open (PAR-08)", async () => {
    const r = new Recorder();
    r.plotRef = undefined;
    expect(await importSensor(sensorHost(r))).toEqual({ problem: "Open a plot first." });
    expect(r.messages).toEqual([["warning", "Open a plot first.", []]]);
  });
});

// --- Exporting an image and finding its source (SUB-25, OUT-04) -------------------------------------

function exportHost(r: Recorder, remembered: unknown = { preset: "a4_landscape", theme: "light" }, reveal = true): ExportHost {
  return {
    ...r.base(),
    rememberedExport: () => remembered,
    rememberExport: (kept) => void r.said.push({ call: ["remember", kept] }),
    figureId: async () => ({ id: "DBF1-X", short: "DBF-PTET", revision: "h3" }),
    drawAndStamp: async (plot, choice, figure, target) => (
      r.said.push({ call: ["draw", choice, target.name] }), { data: new Uint8Array(3), answer: { file: target.name, id: figure.id, short: figure.short, revision: "h3", recorded: true }, notes: [] }
    ),
    copy: async (text) => void r.said.push({ call: ["copy", text] }),
    ...(reveal && { revealFile: (target: SaveTarget) => void r.said.push({ open: ["folder", target.name] }) }),
  };
}

describe("exporting an image (shared flow)", () => {
  it("asks in three steps, last time's size first, the footer on again; then Copy ID and Show in folder", async () => {
    const r = new Recorder();
    r.answers = ["A4 landscape", ["Image ID in a corner"]];
    r.files = [{ name: "Serial-1 DBF-PTET.svg", path: "/x/Serial-1 DBF-PTET.svg" }];
    r.buttons = [COPY_ID];
    const done = await exportImage(exportHost(r));
    expect(done).toMatchObject({ file: "Serial-1 DBF-PTET.svg", id: "DBF1-X" });
    const [size, shows] = r.asked as [Question, ManyQuestion];
    expect(size).toEqual({ kind: "pick", sequence: { name: "Export image", step: 1, of: 3 }, title: "size", text: "The size to draw the map at", choices: PRESETS.map((p) => ({ label: p.label, detail: p.detail })), default: "A4 landscape" });
    expect(titleOf(size)).toBe("Export image (1 of 3): size");
    expect(shows).toMatchObject({ sequence: { step: 2 }, picked: ["Image ID in a corner", "Light colours, for print"] });
    expect(r.fileSteps[0]).toEqual(["save", { title: "Export image (3 of 3): where to save it, as PNG or SVG", saveLabel: "Export", name: "Serial-1 DBF-PTET.png", filters: [{ name: "PNG image", extensions: ["png"] }, { name: "SVG image", extensions: ["svg"] }] }]);
    expect(r.calls).toContainEqual(["remember", { preset: "a4_landscape", theme: "current" }]);
    expect(r.calls).toContainEqual(["draw", { format: "svg", preset: "a4_landscape", theme: "current", footer: true }, "Serial-1 DBF-PTET.svg"]);
    expect(r.fileSteps.at(-1)).toEqual(["write", "Serial-1 DBF-PTET.svg", 3]);
    await settle();
    expect(r.messages).toEqual([["info", "Exported Serial-1 DBF-PTET.svg. Its ID, DBF-PTET, is in its metadata and its corner. The plot's export log has it.", ["Copy ID", "Show in folder"]]]);
    expect(r.calls.at(-1)).toEqual(["copy", "DBF1-X"]);
  });

  it("offers no Show in folder where files are downloads (the playground, §5)", async () => {
    const r = new Recorder();
    r.answers = ["Slide, 1600 × 900", []];
    r.files = [{ name: "plot.png" }];
    await exportImage(exportHost(r, undefined, false));
    expect(r.messages[0][2]).toEqual(["Copy ID"]);
  });

  it("is refused with no plot open (PAR-08), and asks nothing of an agent", async () => {
    const r = new Recorder();
    r.plotRef = undefined;
    expect(await exportImage(exportHost(r))).toBe("Open a plot first.");
    expect(r.messages).toEqual([["warning", "The image was not exported: Open a plot first.", []]]);
    const agent = new Recorder();
    await exportImage(exportHost(agent), { choice: { preset: "slide" }, target: { name: "a.png", path: "/w/a.png" } });
    expect(agent.asked).toEqual([]);
    expect(agent.messages).toEqual([]);
    expect(agent.fileSteps).toEqual([["write", "a.png", 3]]);
  });
});

describe("finding an image's source (shared flow)", () => {
  const source = (step: number) => ({ store: "s", catalogue: "cat", item: "serial-1", title: "Serial 1", revision: `r${step}`, step, current: 5 }) as unknown as FigureSource;
  const findHost = (r: Recorder, sources: FigureSource[]): FindHost => ({
    ...r.base(),
    findImageSource: async (where) => (r.said.push({ call: ["find", where] }), { images: [{ id: "DBF1-X", short: "DBF-PTET", where: "typed", sources }] }),
    showRevision: async (s) => (r.said.push({ open: ["revision", s.step] }), { title: "Serial 1" }),
    openLatestRevision: async () => void r.said.push({ open: ["latest"] }),
  });

  it("asks by file or by ID, the ID checked as typed; one found is shown read-only, with Go to latest", async () => {
    const r = new Recorder();
    r.answers = [BY_ID, "DBF-PTET"];
    r.buttons = [GO_TO_LATEST];
    expect(await findImageSource(findHost(r, [source(3)]))).toBeUndefined();
    expect((r.asked[0] as Question).choices.map(labelOf)).toEqual([BY_FILE, BY_ID]);
    expect((r.asked[1] as TextQuestion).validate!("not an id")).toBeTruthy();
    expect(r.calls).toEqual([["find", { id: "DBF-PTET" }]]);
    await settle();
    expect(r.messages).toEqual([["info", "Serial 1 at step 3, as when image DBF-PTET was exported. It is shown read-only.", ["Go to latest"]]]);
    expect(r.opened).toEqual([["revision", 3], ["latest"]]);
  });

  it("lists several matches to choose from, never one picked silently", async () => {
    const r = new Recorder();
    r.files = [{ name: "figure.png" }];
    r.answers = [BY_FILE, "1"];
    await findImageSource(findHost(r, [source(3), source(4)]));
    expect(r.asked[1]).toMatchObject({ kind: "pick", title: "Find source of image: which export" });
    expect(r.opened[0]).toEqual(["revision", 4]);
  });
});
