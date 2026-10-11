/**
 * Debrief for VS Code: catalogues, map, outline and tools (Phase 1 tracer).
 *
 * Everything that changes data goes through the Python tool service, where
 * domain logic lives (PRN-03); the extension reads catalogues to display them.
 */
import { userInfo } from "node:os";
import * as vscode from "vscode";
import type { ParameterValue, SharedState, SharedStateChange, ToolDeclaration } from "@debrief/schemas";
import { headFile, headOnDisk, knownStores, openPlot, presentationFile, presentationHashOnDisk, type OpenedPlot } from "./catalogue.js";
import { unwatchFile, watchFile } from "node:fs";
import { count, describeChanges } from "./format.js";
import { resolveTimes } from "./timeinput.js";
import { FormPanel } from "./panels/form.js";
import { MapPanel } from "./panels/map.js";
import { ResultsPanel } from "./panels/results.js";
import { CONFLICT, NEWER_SCHEMA, ServiceError, ToolService, type Agent, type CallOutcome, type ToolListing } from "./service.js";
import { HistoryProvider } from "./views/history.js";
import { DiagnosticLog, hashed, logKey, serviceLine, toolRunLine, type ToolOutcome } from "./diagnostics.js";
import { applyStep, hiddenIds, hiddenNotice, presentationChange, UndoTimeline, type TimelineEntry } from "./presentation.js";
import { TRACK_COLOURS } from "../webview/palette.js";
import { Session } from "./session.js";
import { CataloguesProvider } from "./views/catalogues.js";
import { featureIdsOf, OutlineProvider } from "./views/outline.js";
import { ToolsProvider } from "./views/tools.js";

/** What the integration tests and agents can inspect. */
export interface DebriefApi {
  session: Session;
  /**
   * Shared state for other extensions (SUB-27): current time, selection and
   * viewport of the open plot, or undefined with none open.
   */
  getState: () => SharedState | undefined;
  /**
   * Set some or all of shared state. Returns why it was refused, if it was.
   * who names the caller (an extension id, say), which listeners are told.
   */
  setState: (change: SharedStateChange, who?: string) => string | undefined;
  /** Called with each change to shared state and the view, extension or tool that made it. */
  onDidChangeState: (listener: (change: SharedStateChange, origin: string) => void) => vscode.Disposable;
  ready: Promise<void>;
  tools: () => ToolListing | undefined;
  /** Whether the map has drawn the current plot, for tests and agents. */
  mapShowing: () => string | undefined;
  /** The tools offered for the current selection. */
  offered: () => string[];
  /** Why tools are not available, if they are not. */
  toolsProblem: () => string | undefined;
  /** How many features the map says are hidden, for tests and agents. */
  hiddenOnMap: () => number | undefined;
}

export function activate(context: vscode.ExtensionContext): DebriefApi {
  const output = vscode.window.createOutputChannel("Debrief");
  // Everything logged is redacted, on screen and in the file (NFR-14).
  const diagnostics = new DiagnosticLog(context.logUri.fsPath, (line) => output.appendLine(line));
  const log = (line: string) => diagnostics.write("info", line);
  const configFile = process.env.DEBRIEF_CONFIG || undefined;
  const session = new Session();
  const agent: Agent = { kind: "person", name: userInfo().username };

  const catalogues = new CataloguesProvider(configFile);
  const outline = new OutlineProvider(session);
  const tools = new ToolsProvider(session);
  const history = new HistoryProvider((name) => listing?.tools.find((t) => t.name === name)?.title);
  const outlineView = vscode.window.createTreeView("debrief.outline", { treeDataProvider: outline, canSelectMany: true });
  context.subscriptions.push(
    output,
    vscode.window.registerTreeDataProvider("debrief.catalogues", catalogues),
    outlineView,
    vscode.window.registerTreeDataProvider("debrief.tools", tools),
    vscode.window.registerTreeDataProvider("debrief.history", history),
  );

  const map = new MapPanel(context.extensionUri, session, log);
  const results = new ResultsPanel(context.extensionUri);

  // --- The tool service -----------------------------------------------------------
  let service: ToolService | undefined;
  let listing: ToolListing | undefined;
  let starting: Promise<void> | undefined;
  const settings = () => vscode.workspace.getConfiguration("debrief");
  const python = () =>
    process.env.DEBRIEF_PYTHON || settings().get<string>("python") || (process.platform === "win32" ? "python" : "python3");

  function startService(): Promise<void> {
    // One start at a time: a second request waits for the first.
    starting ??= (async () => {
      const old = service;
      service = undefined;
      listing = undefined;
      old?.stop();
      tools.update(undefined, []);
      try {
        const started = await ToolService.start({
          python: python(),
          timeoutSeconds: settings().get<number>("toolTimeout") ?? 120,
          // What the service prints is free text unless it is one of its own log lines (NFR-14).
          log: (line) => {
            const safe = serviceLine(line);
            if (safe) log(safe);
          },
          // The same key, so the service's hashes and ours match.
          env: { DEBRIEF_LOG_KEY: logKey().toString("hex") },
        });
        await started.initialise();
        listing = await started.listTools();
        started.onExit(() => {
          if (service !== started) return;
          service = undefined;
          tools.update(undefined, [], "The tool service stopped. Run 'Debrief: Restart tool service'.");
        });
        service = started;
        await refreshTools();
        // A plot opened before the service started: open it again, finishing any interrupted change.
        if (session.current) await serially(() => reloadPlot(true));
      } catch (error) {
        log(`service_start_failed message=${hashed((error as Error).message)}`);
        tools.update(undefined, [], (error as Error).message);
      } finally {
        starting = undefined;
      }
    })();
    return starting;
  }

  // Replies can arrive out of order; only the latest request's answer counts.
  let toolsRequest = 0;
  async function refreshTools(): Promise<void> {
    const request = ++toolsRequest;
    if (!service || !listing) return;
    const kinds = session.selectedFeatures().map((f) => f.properties.kind);
    try {
      const offered = await service.toolsForSelection(kinds);
      if (request === toolsRequest) tools.update(listing, offered);
    } catch (error) {
      if (request === toolsRequest) tools.update(listing, [], (error as Error).message);
    }
  }

  const needService = (): ToolService | undefined => {
    if (!service) {
      void vscode.window.showErrorMessage(
        "Debrief's tool service is not running. Run 'Debrief: Restart tool service', and see the Debrief output if it fails.",
      );
    }
    return service;
  };

  const ready = startService();
  context.subscriptions.push({ dispose: () => service?.stop() });
  session.onSelection(() => void refreshTools());
  session.onPlot(() => void refreshTools());

  // Selection in the outline selects everywhere (SUB-26); selection made elsewhere
  // is revealed in the outline. Revealing changes the tree's own selection, which
  // must not echo back as a new selection.
  let revealing: string | undefined;
  outlineView.onDidChangeSelection((event) => {
    const ids = featureIdsOf(event.selection);
    if (revealing !== undefined && ids.join() === revealing) return;
    revealing = undefined;
    if (ids.length) session.select(ids, "outline"); // clicking a heading leaves the selection alone
  });
  session.onSelection((ids, origin) => {
    if (origin === "outline" || origin === "plot" || !ids.length || !outlineView.visible) return;
    const node = outline.featureNode(ids[ids.length - 1]);
    if (!node) return;
    revealing = ids[ids.length - 1];
    void outlineView.reveal(node, { select: true, focus: false, expand: true }).then(undefined, () => undefined);
  });

  // --- Changes happen one at a time ---------------------------------------------------
  // Every change and reload waits for the one before, so each starts from the base
  // the last one left, and a reload can never put back a plot the analyst has left.
  let queue: Promise<unknown> = Promise.resolve();
  function serially<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  }
  /** Changes of our own under way, reload included, so the watcher never reports them as someone else's. */
  let writing = 0;
  async function ourChange<T>(work: () => Promise<T>): Promise<T> {
    writing++;
    try {
      return await work();
    } finally {
      writing--;
    }
  }

  // --- Running a tool ---------------------------------------------------------------
  const runTool = (tool: ToolDeclaration, parameters: ParameterValue[]): Promise<string | undefined> =>
    serially(() =>
      ourChange(async () => {
        const started = Date.now();
        const selected = session.selection.length;
        const { problem, outcome } = await runToolNow(tool, parameters);
        const supplied = Object.fromEntries(parameters.map((p) => [p.name, true]));
        // The outcome code only: the problem is free text, for the analyst, never the log (NFR-14).
        diagnostics.write(problem ? "warning" : "info", toolRunLine(tool, supplied, selected, outcome, Date.now() - started));
        return problem;
      }),
    );
  type Ran = { problem?: string; outcome: ToolOutcome };
  const refused = (problem: string): Ran => ({ problem, outcome: "refused" });
  const runToolNow = async (tool: ToolDeclaration, parameters: ParameterValue[]): Promise<Ran> => {
    const opened = session.current;
    if (!opened) return refused("Open a plot first.");
    if (!service) return refused("Debrief's tool service is not running. Run 'Debrief: Restart tool service'.");
    const timeProblem = resolveTimes(tool, parameters, opened);
    if (typeof timeProblem === "string") return refused(timeProblem);
    parameters = timeProblem;
    const values = Object.fromEntries(parameters.map((p) => [p.name, p.value]));
    let allowNewerSchema = false;
    const call = (on_conflict?: "merge" | "new_plot") =>
      service!.callTool(tool.name, {
        store: opened.store.id,
        item: opened.item.id,
        selection: session.selection,
        parameters: values,
        agent,
        state: session.state(), // tools read current time, selection and viewport (TL-10)
        base: opened.base, // the plot the analyst is looking at (SUB-28)
        ...(on_conflict && { on_conflict }),
        ...(allowNewerSchema && { allow_newer_schema: true }),
      });
    let outcome: CallOutcome;
    try {
      outcome = await call();
      if (!outcome.ok && outcome.newerSchema) {
        if (!(await confirmNewerSchema(outcome.message))) {
          return { problem: `${tool.title} was not saved.`, outcome: "needs_newer_schema_confirmed" };
        }
        allowNewerSchema = true;
        outcome = await call();
      }
      if (!outcome.ok && outcome.conflict) {
        // Changed elsewhere since it was opened: never overwrite, offer a choice (SUB-29).
        const choice = await askAboutConflict(tool.title, outcome.conflict.mergeable);
        if (!choice) {
          await reloadPlot(true);
          return {
            problem: `${tool.title} was not run: the plot was changed elsewhere. Debrief is showing the latest; run it again if it still applies.`,
            outcome: "conflict",
          };
        }
        outcome = await call(choice);
      }
    } catch (error) {
      return { problem: (error as Error).message, outcome: "failed" };
    }
    if (!outcome.ok) return { problem: outcome.message, outcome: outcome.outcome ?? "failed" };
    if (outcome.newItem) {
      // Show the original as it now is; offer the new plot, carrying time and selection.
      const newItem = outcome.newItem;
      const problem = await reloadPlot(true);
      void vscode.window
        .showInformationMessage(
          `${tool.title}: your result was saved as a new plot, ${newItem}. The original keeps the other change.`,
          "Open the new plot",
        )
        .then((open) => open && serially(() => loadPlot(opened.store, newItem, true)));
      return { problem, outcome: "saved_as_new_plot" };
    }
    if (outcome.changed) {
      timeline.record(opened.item.id, { kind: "data" });
      const problem = await reloadPlot(true);
      if (problem) return { problem, outcome: "changed" };
    }
    const result = outcome.result;
    // A tool sets shared state by returning it, after the plot has its new features.
    if (result?.state_change) session.apply(result.state_change, `tool:${tool.name}`);
    if (result?.non_spatial?.length) results.show(tool, result);
    const said = describeChanges(result);
    if (said) void vscode.window.showInformationMessage(`${tool.title} ${said}.`);
    return { outcome: outcome.changed ? "changed" : "unchanged" };
  };
  const form = new FormPanel(context.extensionUri, runTool, log);

  /** Warn before writing a newer schema into a shared catalogue (SUB-35). */
  async function confirmNewerSchema(message: string): Promise<boolean> {
    const save = "Save anyway";
    return (await vscode.window.showWarningMessage(message, { modal: true }, save)) === save;
  }

  // --- Presentation's local history and the undo timeline (SUB-21, SUB-22) -----------
  /** What the analyst did in this window, per plot, newest last, so one undo takes back the latest. */
  const timeline = new UndoTimeline();

  /** Save a presentation and show it. Never recorded in the plot's history. */
  const savePresentation = (next: OpenedPlot["presentation"]): Promise<string | undefined> =>
    ourChange(async () => {
      const opened = session.current;
      if (!opened || !service) return "Presentation changes need the tool service.";
      try {
        const { hash } = await service.setPresentation(opened.store.id, opened.item.id, next, opened.presentationHash);
        session.setPlot({ ...opened, presentation: next, presentationHash: hash }, true);
        return undefined;
      } catch (error) {
        if ((error as ServiceError).code === CONFLICT) {
          await reloadPlot(true);
          return "The plot's presentation was changed elsewhere, so nothing was changed. Debrief is showing the latest; try again if you still want to.";
        }
        return (error as Error).message;
      }
    });

  const changePresentation = (label: string, ids: string[], change: { colour: string } | { hidden: boolean }) =>
    serially(async () => {
      const opened = session.current;
      if (!opened) return "Open a plot first.";
      const { step, next } = presentationChange(opened.item.id, label, opened.presentation, ids, change);
      const problem = await savePresentation(next);
      if (!problem) timeline.record(opened.item.id, { kind: "presentation", step });
      await refreshHistory();
      return problem;
    });

  /**
   * Undo or redo a presentation step on the presentation as it is now, so
   * others' changes since are kept (SUB-28). The timeline moves only if it saved.
   */
  const movePresentation = (entry: Extract<TimelineEntry, { kind: "presentation" }>, how: "undo" | "redo") =>
    serially(async () => {
      const opened = session.current;
      if (!opened || opened.item.id !== entry.step.plot) return "Open the plot first.";
      const problem = await savePresentation(applyStep(opened.presentation, entry.step, how));
      if (!problem) {
        if (how === "undo") timeline.undone(entry.step.plot, entry);
        else timeline.redone(entry.step.plot, entry);
      }
      await refreshHistory();
      return problem;
    });

  async function askAboutConflict(title: string, mergeable: boolean): Promise<"merge" | "new_plot" | undefined> {
    const combine = "Combine the changes";
    const saveNew = "Save mine as a new plot";
    const choice = await vscode.window.showWarningMessage(
      mergeable
        ? `The plot was changed elsewhere while you were working. The other change touches different features from ${title}'s, so the two can be combined, or ${title}'s result can be saved as a new plot.`
        : `The plot was changed elsewhere while you were working, and the change touches the same features as ${title}'s. ${title}'s result can be saved as a new plot.`,
      { modal: true },
      ...(mergeable ? [combine, saveNew] : [saveNew]),
    );
    return choice === combine ? "merge" : choice === saveNew ? "new_plot" : undefined;
  }

  // --- Opening, reloading, and noticing changes made elsewhere ---------------------
  let watched: string[] = [];
  let checking = false;

  /**
   * Open a plot: the service finishes any change a crash interrupted first
   * (NFR-10) and says where its history stands. Without the service the plot
   * is read as it is, and can't be changed.
   */
  async function loadPlot(store: OpenedPlot["store"], itemId: string, keep = false): Promise<void> {
    let base: OpenedPlot["base"];
    let recovered: string[] = [];
    if (service) {
      try {
        ({ base, recovered } = await service.open(store.id, itemId));
      } catch (error) {
        // The plot's id only as a hash, and no message: both can name things (NFR-14).
        log(`open_failed item=${hashed(itemId)} code=${(error as ServiceError).code ?? "-"}`);
      }
    }
    const opened = { ...openPlot(store, itemId), base };
    session.setPlot(opened, keep);
    watch(opened);
    catalogues.refresh();
    await refreshHistory();
    if (recovered.length) {
      void vscode.window.showWarningMessage(`${opened.item.properties.title ?? itemId}: ${recovered.join(" ")}`);
    }
  }

  /** Read the plot again after a change. Returns a problem to show, if it can't be read. */
  async function reloadPlot(keep: boolean): Promise<string | undefined> {
    const opened = session.current;
    if (!opened) return undefined;
    try {
      await loadPlot(opened.store, opened.item.id, keep);
      return undefined;
    } catch (error) {
      return `The plot was changed, but Debrief could not read it back: ${(error as Error).message}`;
    }
  }

  /**
   * Notice a change made elsewhere: another window, another analyst on a shared
   * folder, an agent (SUB-28), to the plot or to its presentation. Polled,
   * because change events are unreliable on network shares. Nothing is ever
   * overwritten: Debrief shows the latest.
   */
  function watch(opened: OpenedPlot): void {
    const files = [headFile(opened.store, opened.item.id), presentationFile(opened.store, opened.item.id)];
    if (watched.join() === files.join()) return;
    watched.forEach((file) => unwatchFile(file));
    watched = files;
    for (const file of files) watchFile(file, { interval: 1000 }, () => noticeChange(files));
  }
  function noticeChange(files: string[]): void {
    if (writing || checking) return; // ours, or a check already waiting
    checking = true;
    // Checked in turn with our own changes, so one of ours finishing is never mistaken for another's.
    void serially(async () => {
      checking = false;
      const current = session.current;
      if (writing || !current || headFile(current.store, current.item.id) !== files[0]) return;
      const onDisk = headOnDisk(current.store, current.item.id);
      const plotChanged = !!onDisk && (onDisk.current !== current.base?.current || onDisk.plot_hash !== current.base?.plot_hash);
      const presentationChanged = presentationHashOnDisk(current.store, current.item.id) !== current.presentationHash;
      if (!plotChanged && !presentationChanged) return;
      const problem = await reloadPlot(true);
      const title = current.item.properties.title ?? current.item.id;
      void vscode.window.showInformationMessage(
        problem ??
          (plotChanged
            ? `${title} was changed elsewhere. Debrief is showing the latest.`
            : `${title}'s colours or hidden features were changed elsewhere. Debrief is showing the latest.`),
      );
    });
  }
  context.subscriptions.push({ dispose: () => watched.forEach((file) => unwatchFile(file)) });

  let historyRequest = 0;
  async function refreshHistory(): Promise<void> {
    const request = ++historyRequest;
    const opened = session.current;
    if (!opened || !service) {
      history.update([], 0, !!opened, opened ? "History needs the tool service." : undefined);
    } else {
      try {
        const listed = await service.history(opened.store.id, opened.item.id);
        if (request !== historyRequest) return; // a later refresh has the newer answer
        history.update(
          listed.steps,
          listed.base.current,
          true,
          undefined,
          timeline.presentationSteps(opened.item.id),
          timeline.nextUndo(opened.item.id),
        );
      } catch (error) {
        if (request !== historyRequest) return;
        history.update([], 0, true, (error as Error).message);
      }
    }
    const plot = session.current?.item.id;
    const nextUndo = plot ? timeline.nextUndo(plot) : undefined;
    const nextRedo = plot ? timeline.nextRedo(plot) : undefined;
    const canUndo = nextUndo?.kind === "presentation" || history.canUndo();
    const canRedo = nextRedo?.kind === "presentation" || (nextRedo?.kind === "data" && history.canRedo());
    void vscode.commands.executeCommand("setContext", "debrief.canUndo", canUndo);
    void vscode.commands.executeCommand("setContext", "debrief.canRedo", canRedo);
  }

  /** Undo, redo, or go to a step (SUB-21): replay in the service, then show the result. */
  const move = (how: "undo" | "redo" | "goto", step?: number): Promise<string | undefined> =>
    serially(() =>
      ourChange(async () => {
        const opened = session.current;
        if (!opened) return "Open a plot first.";
        if (!service || !opened.base) return "Undo needs Debrief's tool service. Run 'Debrief: Restart tool service'.";
        try {
          try {
            await service.move(how, opened.store.id, opened.item.id, opened.base, step);
          } catch (error) {
            if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
            if (!(await confirmNewerSchema((error as Error).message))) return "Nothing was changed."; // declined: the timeline must not move
            await service.move(how, opened.store.id, opened.item.id, opened.base, step, true);
          }
        } catch (error) {
          if ((error as ServiceError).code === CONFLICT) {
            await reloadPlot(true);
            return "The plot was changed elsewhere, so nothing was undone. Debrief is showing the latest; try again if you still want to.";
          }
          return (error as Error).message;
        }
        return reloadPlot(true);
      }),
    );

  const storeById = (id: string) => knownStores(configFile).stores.find((s) => s.id === id);

  // --- Commands ---------------------------------------------------------------------
  const command = (name: string, handler: (...args: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(name, handler));

  command("debrief.openPlot", async (storeId: string, itemId: string) => {
    const store = storeById(storeId);
    if (!store) return;
    try {
      await serially(() => loadPlot(store, itemId));
      map.reveal();
      // Hiding is shared: say so, so nothing on the plot goes unseen (SUB-22).
      const opened = session.current;
      const notice = opened && hiddenNotice(hiddenIds(opened.plot, opened.presentation).length);
      if (notice) {
        void vscode.window
          .showInformationMessage(notice, "Show all")
          .then((choice) => choice && vscode.commands.executeCommand("debrief.showAllHidden"));
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`The plot could not be opened: ${(error as Error).message}`);
    }
  });

  // History (SUB-21). Each returns the problem, if any, for agents and tests.
  const report = (problem: string | undefined) => {
    if (problem) void vscode.window.showWarningMessage(problem);
    return problem;
  };
  // One undo for everything the analyst does: Ctrl+Z takes back the latest
  // thing done in this window, a presentation change or a change to the plot.
  // The timeline moves only once the undo or redo has succeeded.
  command("debrief.undo", async () => {
    const plot = session.current?.item.id;
    if (!plot) return report("Open a plot first.");
    const entry = timeline.nextUndo(plot);
    if (entry?.kind === "presentation") return report(await movePresentation(entry, "undo"));
    // A change to the plot: made in this window, or (none recorded) one from before it.
    const problem = await move("undo");
    if (!problem) timeline.undone(plot, entry ?? { kind: "data" });
    await refreshHistory();
    return report(problem);
  });
  command("debrief.redo", async () => {
    const plot = session.current?.item.id;
    const entry = plot ? timeline.nextRedo(plot) : undefined;
    // Only what was undone in this window, and only until a new change (SUB-21).
    if (!plot || !entry) return report("There is nothing to redo.");
    if (entry.kind === "presentation") return report(await movePresentation(entry, "redo"));
    const problem = await move("redo");
    if (!problem) timeline.redone(plot, entry);
    await refreshHistory();
    return report(problem);
  });

  // Presentation (SUB-22): colours and hiding, beside the plot, outside its history.
  // A node from the outline, a list of ids (the map's "Show all"), or else the selection.
  type Target = { feature?: { id: string }; ids?: string[] };
  const targets = (node?: Target) => node?.ids ?? (node?.feature ? [node.feature.id] : session.selection);
  // colourName lets agents and keyboard macros choose without the picker.
  command("debrief.setColour", async (node?: Target, colourName?: string) => {
    const ids = targets(node).filter((id) => session.current?.plot.features.find((f) => f.id === id)?.properties.kind === "track");
    if (!ids.length) return report("Select one or more tracks to colour.");
    const choices = TRACK_COLOURS.map((c) => ({ label: c.name, colour: c.colour }));
    const picked = colourName
      ? choices.find((c) => c.label.toLowerCase() === colourName.toLowerCase())
      : await vscode.window.showQuickPick(choices, {
          placeHolder: `Colour for ${ids.length === 1 ? "the track" : `${ids.length} tracks`}`,
        });
    if (!picked) return undefined;
    return report(await changePresentation(`Colour ${picked.label.toLowerCase()}`, ids, { colour: picked.colour }));
  });
  command("debrief.hide", async (node?: Target) => {
    const ids = targets(node);
    return report(ids.length ? await changePresentation("Hide on map", ids, { hidden: true }) : "Select what to hide.");
  });
  command("debrief.show", async (node?: Target) => {
    const ids = targets(node);
    return report(ids.length ? await changePresentation("Show on map", ids, { hidden: false }) : "Select what to show.");
  });
  command("debrief.goToStep", async (target?: number | { step: { seq: number } }) => {
    const seq = typeof target === "number" ? target : target?.step.seq;
    return seq === undefined ? undefined : report(await move("goto", seq));
  });
  command("debrief.redoToStep", (target?: { step: { seq: number } }) =>
    vscode.commands.executeCommand("debrief.goToStep", target),
  );
  command("debrief.historySteps", () => history.steps);
  command("debrief.historyRows", () => history.rows());
  command("debrief.showAllHidden", () => {
    const opened = session.current;
    const ids = opened ? hiddenIds(opened.plot, opened.presentation) : [];
    return ids.length ? vscode.commands.executeCommand("debrief.show", { ids }) : undefined;
  });

  command("debrief.select", (ids: string[]) => session.select(ids ?? [], "command"));
  // Shared state for agents and keyboard users (SUB-27).
  command("debrief.getState", () => session.state());
  command("debrief.setState", (change: SharedStateChange) => session.apply(change ?? {}, "command"));
  command("debrief.clearSelection", () => session.select([], "command"));
  command("debrief.refresh", async () => {
    catalogues.refresh();
    const problem = await serially(() => reloadPlot(true));
    if (problem) void vscode.window.showErrorMessage(problem);
  });
  command("debrief.restartTools", () => startService());

  const timeRangeOf = () => {
    const extent = session.current?.item.properties;
    const start = extent?.start_datetime ?? extent?.datetime ?? undefined;
    const end = extent?.end_datetime ?? extent?.datetime ?? undefined;
    return start && end ? { start, end } : undefined;
  };
  command("debrief.showToolForm", (name: string) => {
    const tool = listing?.tools.find((t) => t.name === name);
    if (!tool) return;
    form.show(tool, session.selectedFeatures().map((f) => f.properties.name), timeRangeOf());
  });
  // The form says what the tool will act on, so it follows the selection.
  session.onSelection(() => form.updateSelection(session.selectedFeatures().map((f) => f.properties.name)));

  // Run without the form, for agents, keyboard users and tests (TL-14).
  command("debrief.runTool", async (name: string, parameters: Record<string, unknown> = {}) => {
    const tool = listing?.tools.find((t) => t.name === name);
    if (!tool) return `There is no tool called ${name}.`;
    const values = Object.entries(parameters).map(([n, value]) => ({ name: n, value }) as ParameterValue);
    const problem = await runTool(tool, values);
    if (problem) void vscode.window.showErrorMessage(problem);
    else if (form.showing === tool.name) form.close();
    return problem;
  });

  command("debrief.addCatalogue", async () => {
    if (!needService()) return;
    const folder = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: "Add catalogue" });
    if (!folder?.length || !service) return;
    const title = await vscode.window.showInputBox({ prompt: "Name for this catalogue", value: folder[0].path.split("/").pop() });
    if (!title) return;
    try {
      await service.createCatalogue(folder[0].fsPath, title);
      catalogues.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage((error as ServiceError).message);
    }
  });
  command("debrief.createCatalogue", () => vscode.commands.executeCommand("debrief.addCatalogue"));

  command("debrief.importRep", async (node?: { view?: { store: { id: string } } }) => {
    if (!needService()) return;
    const writable = knownStores(configFile).stores.filter((s) => !s.read_only);
    if (!writable.length) {
      void vscode.window.showWarningMessage("Add or create a catalogue first; imported plots go into a catalogue.");
      return;
    }
    let storeId = node?.view?.store.id;
    if (!storeId) {
      const picked =
        writable.length === 1
          ? { id: writable[0].id }
          : await vscode.window.showQuickPick(
              writable.map((s) => ({ label: s.title, description: s.location, id: s.id })),
              { placeHolder: "Import into which catalogue?" },
            );
      storeId = picked?.id;
    }
    if (!storeId) return;
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { "Plot files": ["rep", "REP", "dpf", "DPF"], "REP files": ["rep", "REP"], "Legacy plot files": ["dpf", "DPF"] },
    });
    if (!files?.length) return;
    try {
      let report;
      try {
        report = await service!.importFile(storeId, files[0].fsPath, agent);
      } catch (error) {
        if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
        if (!(await confirmNewerSchema((error as Error).message))) return;
        report = await service!.importFile(storeId, files[0].fsPath, agent, true);
      }
      catalogues.refresh();
      const parts = [count(report.tracks.length, "track"), count(report.fixes, "fix", "fixes")];
      if (report.annotations) parts.push(count(report.annotations, "annotation"));
      if (report.narrative_entries) parts.push(count(report.narrative_entries, "narrative note"));
      const summary = `Imported ${parts.join(", ")}.`;
      // Nothing is dropped silently (EXT-14): say what was not imported.
      if (report.omitted.length) {
        const choice = await vscode.window.showWarningMessage(
          `${summary} Some content was not imported.`,
          "Show what was not imported",
          "Open plot",
        );
        if (choice === "Show what was not imported") {
          // Plot content: shown in an untitled document, never written to the output channel or log (NFR-14).
          const content = [`Not imported from ${files[0].fsPath}:`, ...report.omitted.map((line) => `  ${line}`)].join("\n");
          const document = await vscode.workspace.openTextDocument({ content, language: "plaintext" });
          await vscode.window.showTextDocument(document, { preview: false });
        } else if (choice === "Open plot") {
          await vscode.commands.executeCommand("debrief.openPlot", storeId, report.item);
        }
      } else {
        void vscode.window.showInformationMessage(summary);
      }
    } catch (error) {
      void vscode.window.showErrorMessage((error as Error).message);
    }
  });

  return {
    session,
    getState: () => session.state(),
    setState: (change, who) => session.apply(change, who ? `extension:${who}` : "extension"),
    onDidChangeState: (listener) => new vscode.Disposable(session.onState(listener)),
    ready,
    tools: () => listing,
    mapShowing: () => map.showing,
    offered: () => tools.offered,
    toolsProblem: () => tools.problem,
    hiddenOnMap: () => map.hiddenCount,
  };
}

export function deactivate(): void {}
