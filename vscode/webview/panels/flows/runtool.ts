/**
 * Running a tool (TL-10 to TL-14, SUB-28, SUB-29, SUB-35), written once for both front ends (PAR-09,
 * PAR-12): its times read, the run asked of the service with the plot the analyst is looking at as
 * its base; a newer schema confirmed ("Save anyway") before it is written; a change made elsewhere
 * meanwhile never overwritten, the analyst choosing to combine the two or save the result as a new
 * plot; a result saved as a new plot offered ("Open the new plot"), never opened by itself; the
 * plot shown again as changed, the shared state the tool returned applied, its results shown and
 * what it did said.
 */
import type { ParameterValue, SharedStateChange, ToolDeclaration, ToolResult } from "@debrief/schemas";
import type { ToolOutcome } from "../../../src/diagnostics.js";
import { describeToolRun } from "../../../src/format.js";
import { resolveTimes } from "../../../src/timeinput.js";
import type { FlowHost, PlotRef } from "./host.js";

/** What the service says of a run (VS Code's CallOutcome). */
export interface ToolCall {
  ok: boolean;
  outcome?: ToolOutcome;
  message: string;
  result?: ToolResult;
  changed?: boolean;
  /** The plot changed while the tool ran, or since the analyst opened it (SUB-28). */
  conflict?: { mergeable: boolean };
  /** The result was saved as a new plot (SUB-29). */
  newItem?: string;
  /** Saving would write a newer schema into the catalogue: ask, then call again allowing it (SUB-35). */
  newerSchema?: boolean;
}

export interface ToolRunHost extends FlowHost {
  /** Ask the service to run a tool on the plot open: with the selection, the shared state and the plot's base. */
  callTool(tool: ToolDeclaration, plot: PlotRef, values: Record<string, unknown>, options: { on_conflict?: "merge" | "new_plot"; allow_newer_schema?: boolean }): Promise<ToolCall>;
  /** Open another plot of the same store (the new plot a result was saved as). */
  openPlot(plot: PlotRef, item: string): Promise<void>;
  /** Apply the shared state a tool returned, on the plot it ran on: true if current time is now outside the saved window (CAP-28). */
  applyToolState(change: SharedStateChange, tool: ToolDeclaration, ranOn: PlotRef): boolean;
  /** Show a result's non-spatial outputs in the results panel. */
  showResults(tool: ToolDeclaration, result: ToolResult): void;
}

export const SAVE_ANYWAY = "Save anyway";
export const COMBINE = "Combine the changes";
export const SAVE_NEW = "Save mine as a new plot";
export const OPEN_NEW = "Open the new plot";
export const NO_SERVICE = "Debrief's tool service is not running. Run 'Debrief: Restart tool service'.";

/** The newer-schema question (SUB-35), as every change asks it. */
export const confirmNewerSchema = async (host: FlowHost, message: string): Promise<boolean> =>
  (await host.ask({ kind: "confirm", text: message, choices: [SAVE_ANYWAY] })) === SAVE_ANYWAY;

/** The conflict question (SUB-29): combine the two changes when they touch different features, or save this result as a new plot. */
export async function askAboutConflict(host: FlowHost, title: string, mergeable: boolean): Promise<"merge" | "new_plot" | undefined> {
  const choice = await host.ask({
    kind: "confirm",
    text: mergeable
      ? `The plot was changed elsewhere while you were working. The other change touches different features from ${title}'s, so the two can be combined, or ${title}'s result can be saved as a new plot.`
      : `The plot was changed elsewhere while you were working, and the change touches the same features as ${title}'s. ${title}'s result can be saved as a new plot.`,
    choices: mergeable ? [COMBINE, SAVE_NEW] : [SAVE_NEW],
  });
  return choice === COMBINE ? "merge" : choice === SAVE_NEW ? "new_plot" : undefined;
}

export type Ran = { problem?: string; outcome: ToolOutcome };
const refused = (problem: string): Ran => ({ problem, outcome: "refused" });

/** Run a tool with these parameters on the plot open: the problem, if any, and how it ended (for the log). */
export async function runTool(host: ToolRunHost, tool: ToolDeclaration, given: readonly ParameterValue[]): Promise<Ran> {
  const plot = host.plot();
  if (!plot) return refused("Open a plot first.");
  if (!host.serviceReady()) return refused(NO_SERVICE);
  const parameters = resolveTimes(tool, [...given], { item: { properties: plot.properties } });
  if (typeof parameters === "string") return refused(parameters);
  const values = Object.fromEntries(parameters.map((p) => [p.name, p.value]));
  let allowNewerSchema = false;
  const call = (on_conflict?: "merge" | "new_plot") => host.callTool(tool, plot, values, { ...(on_conflict && { on_conflict }), ...(allowNewerSchema && { allow_newer_schema: true }) });
  let outcome: ToolCall;
  try {
    outcome = await call();
    if (!outcome.ok && outcome.newerSchema) {
      if (!(await confirmNewerSchema(host, outcome.message))) return { problem: `${tool.title} was not saved.`, outcome: "needs_newer_schema_confirmed" };
      allowNewerSchema = true;
      outcome = await call();
    }
    if (!outcome.ok && outcome.conflict) {
      // Changed elsewhere since it was opened: never overwrite, offer a choice (SUB-29).
      const choice = await askAboutConflict(host, tool.title, outcome.conflict.mergeable);
      if (!choice) {
        await host.reloadPlot();
        return { problem: `${tool.title} was not run: the plot was changed elsewhere. Debrief is showing the latest; run it again if it still applies.`, outcome: "conflict" };
      }
      outcome = await call(choice);
    }
  } catch (error) {
    return { problem: (error as Error).message, outcome: "failed" };
  }
  if (!outcome.ok) return { problem: outcome.message, outcome: outcome.outcome ?? "failed" };
  if (outcome.newItem) {
    // The original shown as it now is; the new plot offered, not opened (PAR-12).
    const newItem = outcome.newItem;
    const problem = await host.reloadPlot();
    void host
      .message("info", `${tool.title}: your result was saved as a new plot, ${newItem}. The original keeps the other change.`, [OPEN_NEW])
      .then((open) => (open === OPEN_NEW ? host.openPlot(plot, newItem) : undefined));
    return { problem, outcome: "saved_as_new_plot" };
  }
  if (outcome.changed) {
    const problem = await host.reloadPlot();
    if (problem) return { problem, outcome: "changed" };
  }
  const result = outcome.result;
  // A tool sets shared state by returning it, after the plot has its new features.
  const outside = result?.state_change ? host.applyToolState(result.state_change, tool, plot) : false;
  if (result?.non_spatial?.length) host.showResults(tool, result);
  const said = describeToolRun(tool.title, result, outside);
  if (said) void host.message("info", said);
  return { outcome: outcome.changed ? "changed" : "unchanged" };
}
