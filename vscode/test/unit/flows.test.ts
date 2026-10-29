/**
 * The shared command flows (PAR-09, PAR-17, docs/panel-parity-srd.md), each run against a recording
 * fake host: the questions asked, the messages shown and the service calls made are asserted here
 * once, for VS Code (src/extension.ts) and the playground (play/host.ts) both, which only implement
 * the host.
 */
import { describe, expect, it } from "vitest";
import type { DebriefFeatureCollection, ToolDeclaration, ToolResult } from "@debrief/schemas";
import { Refusal, type Done, type PlotRef, type Question, type Severity } from "../../webview/panels/flows/host.js";
import { COMBINE, NO_SERVICE, OPEN_NEW, runTool, SAVE_ANYWAY, SAVE_NEW, type ToolCall, type ToolRunHost } from "../../webview/panels/flows/runtool.js";
import { move, NOTHING_TO_REDO, NOTHING_TO_UNDO, type MoveHost } from "../../webview/panels/flows/move.js";
import { NOT_OFFERED, operationContext, operationsFor, runOperation, type OperationHost, type OperationState } from "../../webview/panels/flows/operation.js";
import { outlineIndex } from "../../webview/outlinemodel.js";
import { READ_ONLY } from "../../src/figures.js";

// --- A recording fake host --------------------------------------------------------------------------

/** Everything a flow did, in order: "ask", "message", "call" (the service), "open" (a plot or a panel). */
type Said = { ask: Question } | { message: [Severity, string, readonly string[]] } | { call: [string, ...unknown[]] } | { open: [string, ...unknown[]] };

const PLOT: PlotRef = { store: "s", item: "serial-1", base: { current: 3, plot_hash: "h3" }, properties: { start_datetime: "2026-10-11T09:00:00Z", end_datetime: "2026-10-11T10:00:00Z" } };

class Recorder {
  readonly said: Said[] = [];
  /** What each question is answered, in turn (undefined: cancelled). */
  answers: (string | undefined)[] = [];
  /** What each message's buttons are answered, in turn. */
  buttons: (string | undefined)[] = [];
  plotRef: PlotRef | undefined = PLOT;
  ready = true;

  get asked(): Question[] {
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

  base() {
    return {
      ask: async (q: Question) => (this.said.push({ ask: q }), this.answers.shift()),
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
    expect(r.asked[0].choices).toEqual([SAVE_NEW]);
    expect(r.asked[0].text).toMatch(/^The plot was changed elsewhere while you were working, and the change touches the same features as Closest approach's\./);
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
