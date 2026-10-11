/**
 * Debrief for VS Code: catalogues, map, outline and tools (Phase 1 tracer).
 *
 * Everything that changes data goes through the Python tool service, where
 * domain logic lives (PRN-03); the extension reads catalogues to display them.
 */
import { userInfo } from "node:os";
import * as vscode from "vscode";
import type { ParameterValue, ToolDeclaration } from "@debrief/schemas";
import { knownStores, openPlot } from "./catalogue.js";
import { count } from "./format.js";
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
  ready: Promise<void>;
  tools: () => ToolListing | undefined;
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
  const settings = () => vscode.workspace.getConfiguration("debrief");
  const python = () =>
    process.env.DEBRIEF_PYTHON || settings().get<string>("python") || (process.platform === "win32" ? "python" : "python3");

  async function startService(): Promise<void> {
    tools.update(undefined, []);
    try {
      service = await ToolService.start({
        python: python(),
        timeoutSeconds: settings().get<number>("toolTimeout") ?? 120,
        log,
      });
      await service.initialise();
      listing = await service.listTools();
      service.onExit((code) => {
        if (code !== null && code !== 0) {
          tools.update(undefined, [], "The tool service stopped. Run 'Debrief: Restart tool service'.");
        }
      });
      await refreshTools();
    } catch (error) {
      log((error as Error).message);
      tools.update(undefined, [], (error as Error).message);
    }
  }

  async function refreshTools(): Promise<void> {
    if (!service || !listing) return;
    const kinds = session.selectedFeatures().map((f) => f.properties.kind);
    try {
      tools.update(listing, await service.toolsForSelection(kinds));
    } catch (error) {
      tools.update(listing, [], (error as Error).message);
    }
  }

  const ready = startService();
  context.subscriptions.push({ dispose: () => service?.stop() });
  session.onSelection(() => void refreshTools());
  session.onPlot(() => void refreshTools());

  // Selection in the outline selects everywhere (SUB-26).
  outlineView.onDidChangeSelection((event) => session.select(featureIdsOf(event.selection), "outline"));

  // --- Running a tool ---------------------------------------------------------------
  const runTool = async (tool: ToolDeclaration, parameters: ParameterValue[]): Promise<string | undefined> => {
    const opened = session.current;
    if (!service || !opened) return "Open a plot first.";
    const values = Object.fromEntries(parameters.map((p) => [p.name, p.value]));
    let outcome;
    try {
      outcome = await service.callTool(tool.name, {
        store: opened.store.id,
        item: opened.item.id,
        selection: session.selection,
        parameters: values,
        agent,
      });
    } catch (error) {
      return (error as Error).message;
    }
    if (!outcome.ok) return outcome.message;
    if (outcome.changed) reloadPlot(true);
    const result = outcome.result;
    if (result?.non_spatial?.length) results.show(tool.title, result);
    const added = result?.new_features?.length ?? 0;
    const changed = result?.modified_features?.length ?? 0;
    const parts = [added && `added ${count(added, "feature")}`, changed && `changed ${count(changed, "feature")}`];
    const said = parts.filter(Boolean);
    if (said.length) void vscode.window.showInformationMessage(`${tool.title} ${said.join(" and ")}.`);
    return undefined;
  };
  const form = new FormPanel(context.extensionUri, runTool, log);

  function reloadPlot(keepSelection: boolean): void {
    const opened = session.current;
    if (!opened) return;
    session.setPlot(openPlot(opened.store, opened.item.id), keepSelection);
    catalogues.refresh();
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
  command("debrief.clearSelection", () => session.select([], "command"));
  command("debrief.refresh", () => {
    catalogues.refresh();
    if (session.current) reloadPlot(true);
  });
  command("debrief.restartTools", async () => {
    service?.stop();
    await startService();
  });

  command("debrief.showToolForm", (name: string) => {
    const tool = listing?.tools.find((t) => t.name === name);
    if (!tool) return;
    form.show(tool, session.selectedFeatures().map((f) => f.properties.name));
  });

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
    if (!service) return;
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
      const report = await service.importRep(storeId, files[0].fsPath, agent);
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

  return { session, ready, tools: () => listing };
}

export function deactivate(): void {}
