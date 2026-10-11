/**
 * Debrief for VS Code: catalogues, map, outline and tools (Phase 1 tracer).
 *
 * Everything that changes data goes through the Python tool service, where
 * domain logic lives (PRN-03); the extension reads catalogues to display them.
 */
import { userInfo } from "node:os";
import * as vscode from "vscode";
import type { ParameterValue, SharedState, SharedStateChange, ToolDeclaration } from "@debrief/schemas";
import { knownStores, openPlot } from "./catalogue.js";
import { count, describeChanges } from "./format.js";
import { resolveTimes } from "./timeinput.js";
import { FormPanel } from "./panels/form.js";
import { MapPanel } from "./panels/map.js";
import { ResultsPanel } from "./panels/results.js";
import { ServiceError, ToolService, type Agent, type ToolListing } from "./service.js";
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
  /** Set some or all of shared state. Returns why it was refused, if it was. */
  setState: (change: SharedStateChange) => string | undefined;
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
  const outlineView = vscode.window.createTreeView("debrief.outline", { treeDataProvider: outline, canSelectMany: true });
  context.subscriptions.push(
    output,
    vscode.window.registerTreeDataProvider("debrief.catalogues", catalogues),
    outlineView,
    vscode.window.registerTreeDataProvider("debrief.tools", tools),
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
    let outcome;
    try {
      outcome = await service.callTool(tool.name, {
        store: opened.store.id,
        item: opened.item.id,
        selection: session.selection,
        parameters: values,
        agent,
        state: session.state(), // tools read current time, selection and viewport (TL-10)
      });
    } catch (error) {
      return (error as Error).message;
    }
    if (!outcome.ok) return outcome.message;
    if (outcome.changed) {
      const problem = reloadPlot(true);
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

  /** Read the plot again after a change. Returns a problem to show, if it can't be read. */
  function reloadPlot(keepSelection: boolean): string | undefined {
    const opened = session.current;
    if (!opened) return undefined;
    try {
      session.setPlot(openPlot(opened.store, opened.item.id), keepSelection);
      catalogues.refresh();
      return undefined;
    } catch (error) {
      return `The plot was changed, but Debrief could not read it back: ${(error as Error).message}`;
    }
  }

  const storeById = (id: string) => knownStores(configFile).stores.find((s) => s.id === id);

  // --- Commands ---------------------------------------------------------------------
  const command = (name: string, handler: (...args: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(name, handler));

  command("debrief.openPlot", (storeId: string, itemId: string) => {
    const store = storeById(storeId);
    if (!store) return;
    try {
      session.setPlot(openPlot(store, itemId));
      map.reveal();
    } catch (error) {
      void vscode.window.showErrorMessage(`The plot could not be opened: ${(error as Error).message}`);
    }
  });

  command("debrief.select", (ids: string[]) => session.select(ids ?? [], "command"));
  // Shared state for agents and keyboard users (SUB-27).
  command("debrief.getState", () => session.state());
  command("debrief.setState", (change: SharedStateChange) => session.apply(change ?? {}, "command"));
  command("debrief.clearSelection", () => session.select([], "command"));
  command("debrief.refresh", () => {
    catalogues.refresh();
    const problem = reloadPlot(true);
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
    setState: (change) => session.apply(change, "extension"),
    onDidChangeState: (listener) => new vscode.Disposable(session.onState(listener)),
    ready,
    tools: () => listing,
    mapShowing: () => map.showing,
    offered: () => tools.offered,
    toolsProblem: () => tools.problem,
  };
}

export function deactivate(): void {}
