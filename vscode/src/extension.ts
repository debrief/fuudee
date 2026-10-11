/**
 * Debrief for VS Code: catalogues, map, outline and tools (Phase 1 tracer).
 *
 * Everything that changes data goes through the Python tool service, where
 * domain logic lives (PRN-03); the extension reads catalogues to display them.
 */
import { userInfo } from "node:os";
import * as vscode from "vscode";
import type { ParameterValue, SharedState, SharedStateChange, ToolDeclaration } from "@debrief/schemas";
import { headFile, headOnDisk, knownStores, openPlot, type OpenedPlot } from "./catalogue.js";
import { unwatchFile, watchFile } from "node:fs";
import { count, describeChanges } from "./format.js";
import { resolveTimes } from "./timeinput.js";
import { FormPanel } from "./panels/form.js";
import { MapPanel } from "./panels/map.js";
import { ResultsPanel } from "./panels/results.js";
import { CONFLICT, ServiceError, ToolService, type Agent, type CallOutcome, type ToolListing } from "./service.js";
import { HistoryProvider } from "./views/history.js";
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
}

export function activate(context: vscode.ExtensionContext): DebriefApi {
  const output = vscode.window.createOutputChannel("Debrief");
  const log = (line: string) => output.appendLine(line);
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
          log,
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
        if (session.current) await reloadPlot(true);
      } catch (error) {
        log((error as Error).message);
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

  // --- Running a tool ---------------------------------------------------------------
  const runTool = async (tool: ToolDeclaration, parameters: ParameterValue[]): Promise<string | undefined> => {
    const opened = session.current;
    if (!opened) return "Open a plot first.";
    if (!service) return "Debrief's tool service is not running. Run 'Debrief: Restart tool service'.";
    const timeProblem = resolveTimes(tool, parameters, opened);
    if (typeof timeProblem === "string") return timeProblem;
    parameters = timeProblem;
    const values = Object.fromEntries(parameters.map((p) => [p.name, p.value]));
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
      });
    let outcome: CallOutcome;
    try {
      writing++;
      outcome = await call();
      if (!outcome.ok && outcome.conflict) {
        // Changed elsewhere since it was opened: never overwrite, offer a choice (SUB-29).
        const choice = await askAboutConflict(tool.title, outcome.conflict.mergeable);
        if (!choice) {
          await reloadPlot(true);
          return `${tool.title} was not run: the plot was changed elsewhere. Debrief is showing the latest; run it again if it still applies.`;
        }
        outcome = await call(choice);
      }
    } catch (error) {
      return (error as Error).message;
    } finally {
      writing--;
    }
    if (!outcome.ok) return outcome.message;
    if (outcome.newItem) {
      catalogues.refresh();
      const open = await vscode.window.showInformationMessage(
        `${tool.title}: your result was saved as a new plot, ${outcome.newItem}. The original keeps the other change.`,
        "Open the new plot",
      );
      if (open) await loadPlot(opened.store, outcome.newItem);
      else await reloadPlot(true);
      return undefined;
    }
    if (outcome.changed) {
      const problem = await reloadPlot(true);
      if (problem) return problem;
    }
    const result = outcome.result;
    // A tool sets shared state by returning it, after the plot has its new features.
    if (result?.state_change) session.apply(result.state_change, `tool:${tool.name}`);
    if (result?.non_spatial?.length) results.show(tool, result);
    const said = describeChanges(result);
    if (said) void vscode.window.showInformationMessage(`${tool.title} ${said}.`);
    return undefined;
  };
  const form = new FormPanel(context.extensionUri, runTool, log);

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
  /** Writes of our own in progress, so the watcher doesn't report them as someone else's. */
  let writing = 0;
  let watched: string | undefined;

  /**
   * Open a plot: the service finishes any change a crash interrupted first
   * (NFR-10) and says where its history stands. Without the service the plot
   * is read as it is, and can't be changed.
   */
  async function loadPlot(store: OpenedPlot["store"], itemId: string, keepSelection = false): Promise<void> {
    let base: OpenedPlot["base"];
    let recovered: string[] = [];
    if (service) {
      try {
        ({ base, recovered } = await service.open(store.id, itemId));
      } catch (error) {
        log(`Opening ${itemId}: ${(error as Error).message}`);
      }
    }
    const opened = { ...openPlot(store, itemId), base };
    session.setPlot(opened, keepSelection && session.current?.item.id === itemId);
    watch(opened);
    catalogues.refresh();
    await refreshHistory();
    if (recovered.length) {
      void vscode.window.showWarningMessage(`${opened.item.properties.title ?? itemId}: ${recovered.join(" ")}`);
    }
  }

  /** Read the plot again after a change. Returns a problem to show, if it can't be read. */
  async function reloadPlot(keepSelection: boolean): Promise<string | undefined> {
    const opened = session.current;
    if (!opened) return undefined;
    try {
      await loadPlot(opened.store, opened.item.id, keepSelection);
      return undefined;
    } catch (error) {
      return `The plot was changed, but Debrief could not read it back: ${(error as Error).message}`;
    }
  }

  /**
   * Notice a change made elsewhere: another window, another analyst on a shared
   * folder, an agent (SUB-28). Polled, because change events are unreliable on
   * network shares. The plot is never overwritten: Debrief shows the latest.
   */
  function watch(opened: OpenedPlot): void {
    const file = headFile(opened.store, opened.item.id);
    if (watched === file) return;
    if (watched) unwatchFile(watched);
    watched = file;
    watchFile(file, { interval: 1000 }, () => {
      const current = session.current;
      if (writing || !current || headFile(current.store, current.item.id) !== file) return;
      const onDisk = headOnDisk(current.store, current.item.id);
      if (!onDisk || (onDisk.current === current.base?.current && onDisk.plot_hash === current.base?.plot_hash)) return;
      void reloadPlot(true).then((problem) => {
        void vscode.window.showInformationMessage(
          problem ?? `${current.item.properties.title ?? current.item.id} was changed elsewhere. Debrief is showing the latest.`,
        );
      });
    });
  }
  context.subscriptions.push({ dispose: () => watched && unwatchFile(watched) });

  async function refreshHistory(): Promise<void> {
    const opened = session.current;
    if (!opened || !service) return history.update([], 0, !!opened, opened ? "History needs the tool service." : undefined);
    try {
      const listed = await service.history(opened.store.id, opened.item.id);
      history.update(listed.steps, listed.base.current);
    } catch (error) {
      history.update([], 0, true, (error as Error).message);
    }
    void vscode.commands.executeCommand("setContext", "debrief.canUndo", history.canUndo());
    void vscode.commands.executeCommand("setContext", "debrief.canRedo", history.canRedo());
  }

  /** Undo, redo, or go to a step (SUB-21): replay in the service, then show the result. */
  async function move(how: "undo" | "redo" | "goto", step?: number): Promise<string | undefined> {
    const opened = session.current;
    if (!opened) return "Open a plot first.";
    if (!service || !opened.base) return "Undo needs Debrief's tool service. Run 'Debrief: Restart tool service'.";
    try {
      writing++;
      await service.move(how, opened.store.id, opened.item.id, opened.base, step);
    } catch (error) {
      if ((error as ServiceError).code === CONFLICT) {
        await reloadPlot(true);
        return "The plot was changed elsewhere, so nothing was undone. Debrief is showing the latest; try again if you still want to.";
      }
      return (error as Error).message;
    } finally {
      writing--;
    }
    return reloadPlot(true);
  }

  const storeById = (id: string) => knownStores(configFile).stores.find((s) => s.id === id);

  // --- Commands ---------------------------------------------------------------------
  const command = (name: string, handler: (...args: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(name, handler));

  command("debrief.openPlot", async (storeId: string, itemId: string) => {
    const store = storeById(storeId);
    if (!store) return;
    try {
      await loadPlot(store, itemId);
      map.reveal();
    } catch (error) {
      void vscode.window.showErrorMessage(`The plot could not be opened: ${(error as Error).message}`);
    }
  });

  // History (SUB-21). Each returns the problem, if any, for agents and tests.
  const report = (problem: string | undefined) => {
    if (problem) void vscode.window.showWarningMessage(problem);
    return problem;
  };
  command("debrief.undo", async () => report(await move("undo")));
  command("debrief.redo", async () => report(await move("redo")));
  command("debrief.goToStep", async (target?: number | { step: { seq: number } }) => {
    const seq = typeof target === "number" ? target : target?.step.seq;
    return seq === undefined ? undefined : report(await move("goto", seq));
  });
  command("debrief.redoToStep", (target?: { step: { seq: number } }) =>
    vscode.commands.executeCommand("debrief.goToStep", target),
  );
  command("debrief.historySteps", () => history.steps);

  command("debrief.select", (ids: string[]) => session.select(ids ?? [], "command"));
  // Shared state for agents and keyboard users (SUB-27).
  command("debrief.getState", () => session.state());
  command("debrief.setState", (change: SharedStateChange) => session.apply(change ?? {}, "command"));
  command("debrief.clearSelection", () => session.select([], "command"));
  command("debrief.refresh", async () => {
    catalogues.refresh();
    const problem = await reloadPlot(true);
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
    const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "REP files": ["rep", "REP"] } });
    if (!files?.length) return;
    try {
      const report = await service!.importRep(storeId, files[0].fsPath, agent);
      catalogues.refresh();
      const summary = `Imported ${count(report.tracks.length, "track")}, ${count(report.fixes, "fix", "fixes")}.`;
      // Nothing is dropped silently (EXT-14): say what was not imported.
      if (report.omitted.length) {
        const choice = await vscode.window.showWarningMessage(
          `${summary} Some content was not imported.`,
          "Show what was not imported",
          "Open plot",
        );
        if (choice === "Show what was not imported") {
          output.appendLine(`Not imported from ${files[0].fsPath}:`);
          report.omitted.forEach((line) => output.appendLine(`  ${line}`));
          output.show(true);
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
  };
}

export function deactivate(): void {}
