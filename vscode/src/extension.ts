/**
 * Debrief for VS Code: catalogues, map, outline and tools (Phase 1 tracer).
 *
 * Everything that changes data goes through the Python tool service, where
 * domain logic lives (PRN-03); the extension reads catalogues to display them.
 */
import { userInfo } from "node:os";
import * as vscode from "vscode";
import type { AnnotationSpec, ContextTracksEnum, NarrativeSpec, TimelineEntry, ParameterValue, PlotView, SharedState, SharedStateChange, TimeRange, ToolDeclaration, ToteResult, ToteView as ToteChoice, TrackEdit } from "@debrief/schemas";
import { formatBearing, formatPosition, formatQuantity, parsePosition, POSITION_EXAMPLE, UNIT_LABELS } from "@debrief/kernel";
import { defaultPivotIndex, describeDistance, describeSpeed, describeTurn, FIX_PROMPT, FIX_PROMPT_DR, fixIndexAt, fixMeans, fixToEdit, jumpSpeed, legNow, mergedName, mergePlan, periodIndices, readBearing, readDistance, readSpeed, readTurn, reckoningOf, type Anchor } from "../webview/trackedit.js";
import { chooseModes, MODE_LABELS, modeChoices, modeQuestion, REMEMBERED_IN_VSCODE, rememberItem, type ModeChoice, type PlottingMode } from "./importmode.js";
import { loadConfig, trackImportMode, updateConfig, withTrackImportMode, type TrackImportMode } from "@debrief/config";
import { changedSince, historyOnDisk, knownStores, openPlot, plotFile, type OpenedPlot } from "./catalogue.js";
import { statSync, unwatchFile, watchFile } from "node:fs";
import { count, describeTimes, describeToolRun, settings as displaySettings } from "./format.js";
import { placeToolTime } from "../webview/timelogic.js";
import { resolveTimes } from "./timeinput.js";
import { AnnotationPanel } from "./panels/annotation.js";
import { FormPanel } from "./panels/form.js";
import { MapPanel } from "./panels/map.js";
import { ResultsPanel } from "./panels/results.js";
import { TIME_VIEW, TimeView } from "./panels/timeview.js";
import { TOTE_VIEW, ToteView } from "./panels/toteview.js";
import { TIMELINE_VIEW, TimelineView } from "./panels/timelineview.js";
import { withMapLines, withPrimary, withSecondaries, withoutSecondary } from "../webview/totelogic.js";
import { CONFLICT, NEEDS_CONFIRMATION, NEWER_SCHEMA, ServiceError, ToolService, type Agent, type AnnotationChange, type CallOutcome, type NarrativeChange, type OpenedView, type ToolListing, type TrackChange } from "./service.js";
import type { CleanChange } from "./service.js";
import { describeJump, describeMark, describeWindow, fixRows, isDeadReckoned, jumpsFound, markAt, readThreshold, readWindow, smoothingNote, trackLabel } from "../webview/fixes.js";
import { HistoryProvider } from "./views/history.js";
import { DiagnosticLog, hashed, logKey, serviceLine, toolRunLine, type ToolOutcome } from "./diagnostics.js";
import { hiddenIds, hiddenNotice, isFeature, setViewOf, timeWindowOf, viewOf, type PlotFeature } from "./hidden.js";
import { specOfFeature } from "../webview/annotationlook.js";
import { FIX_COLOURS, TRACK_COLOURS } from "../webview/palette.js";
import { Session, timeProblem } from "./session.js";
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
  /** Whether the time controller in the sidebar has loaded, for tests and agents. */
  timeControllerShowing: () => boolean;
  /** How the map was last told to draw tracks outside the window, for tests and agents. */
  mapContext: () => string | undefined;
  /** The Tote's choice the map was last told of, for its lines from the primary to each secondary, for tests and agents. */
  mapTote: () => ToteChoice | undefined;
  /** How many times the plot's view has been read again after a change on disk, for tests. */
  viewChecks: () => number;
  /** Whether the Tote view in the sidebar has loaded, for tests and agents. */
  toteShowing: () => boolean;
  /** Whether the Timeline view in the sidebar has loaded, for tests and agents. */
  timelineShowing: () => boolean;
  /** The narrative entry the map shows beside its track at current time, for tests and agents (CAP-20). */
  mapNarrative: () => TimelineEntry | undefined;
  /** The Tote's values last shown, and how long answers took to show (CAP-06, NFR-04), for tests and agents. */
  tote: () => ToteResult | undefined;
  toteLatency: () => { count: number; p50: number; p95: number; max: number };
  /**
   * For tests only: act on a message as if the map had sent it (drawing or dragging an
   * annotation, say). Present only when the extension runs under test, so no other
   * extension can pose as the map.
   */
  fromMap?: (message: unknown) => Promise<void>;
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
  // What the menus need to know of the open plot: whether there is one, and whether it has a north arrow.
  session.onPlot((opened) => {
    void vscode.commands.executeCommand("setContext", "debrief.plotOpen", !!opened);
    const arrow = !!opened?.plot.features.some((f) => f.properties.kind === "annotation" && f.properties.furniture === "north_arrow");
    void vscode.commands.executeCommand("setContext", "debrief.northArrow", arrow);
  });
  context.subscriptions.push(
    output,
    vscode.window.registerTreeDataProvider("debrief.catalogues", catalogues),
    outlineView,
    vscode.window.registerTreeDataProvider("debrief.tools", tools),
    vscode.window.registerTreeDataProvider("debrief.history", history),
  );

  const map = new MapPanel(context.extensionUri, session, log);
  // The time controller, at the top of the sidebar; it saves the window when the analyst lets go.
  const timeView = new TimeView(
    context.extensionUri,
    session,
    // Not saved: show the time controller what is saved again, so it never claims otherwise.
    (window) => void saveWindow(window).then(resync).then(report),
    log,
  );
  // The Tote, below it: values from the tool service at each current time; the choice of tracks saved in the island.
  const toteView = new ToteView(
    context.extensionUri,
    session,
    async (plot, time, tote) => {
      const opened = session.current;
      if (!service || opened?.item.id !== plot) return undefined;
      return service.tote(opened.store.id, plot, time, tote);
    },
    (tote) => saveTote(tote).then(resync),
    log,
  );
  // The Timeline: narrative, notes and periods in time order; choosing one moves current time to it.
  const timeline = new TimelineView(
    context.extensionUri,
    session,
    (id) => void vscode.commands.executeCommand("debrief.goToTime", id),
    async (spec, id) => {
      const done = await narrate(id ? { kind: "edit", feature: id, entry: spec } : { kind: "add", entry: spec });
      return { problem: done.problem, feature: done.feature ?? id };
    },
    async (id) => (await narrate({ kind: "delete", features: [id] })).problem,
    log,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TIMELINE_VIEW, timeline, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerWebviewViewProvider(TIME_VIEW, timeView, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerWebviewViewProvider(TOTE_VIEW, toteView, { webviewOptions: { retainContextWhenHidden: true } }),
  );
  const results = new ResultsPanel(context.extensionUri);

  // --- The tool service -----------------------------------------------------------
  let service: ToolService | undefined;
  let listing: ToolListing | undefined;
  let starting: Promise<void> | undefined;
  const settings = () => vscode.workspace.getConfiguration("debrief");
  // An analyst who needs it can have faint context tracks drawn visible on every plot (CAP-29).
  const readContrastSetting = () => (session.minimumContextContrast = settings().get<boolean>("map.minimumContextContrast") === true);
  readContrastSetting();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("debrief.map.minimumContextContrast")) return;
      readContrastSetting();
      session.viewChanged();
    }),
  );
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
      seePlotFile(); // as we left it: not a change of someone else's to check
      writing--;
    }
  }

  // --- Running a tool ---------------------------------------------------------------
  /** byHand: the analyst ran it from its form, not an agent or a command (CAP-28: only then may it save the window). */
  const runTool = (tool: ToolDeclaration, parameters: ParameterValue[], byHand = false): Promise<string | undefined> =>
    serially(() =>
      ourChange(async () => {
        const started = Date.now();
        const selected = session.selection.length;
        const { problem, outcome } = await runToolNow(tool, parameters, byHand);
        const supplied = Object.fromEntries(parameters.map((p) => [p.name, true]));
        // The outcome code only: the problem is free text, for the analyst, never the log (NFR-14).
        diagnostics.write(problem ? "warning" : "info", toolRunLine(tool, supplied, selected, outcome, Date.now() - started));
        return problem;
      }),
    );
  type Ran = { problem?: string; outcome: ToolOutcome };
  const refused = (problem: string): Ran => ({ problem, outcome: "refused" });
  const runToolNow = async (tool: ToolDeclaration, parameters: ParameterValue[], byHand: boolean): Promise<Ran> => {
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
      const problem = await reloadPlot(true);
      if (problem) return { problem, outcome: "changed" };
    }
    const result = outcome.result;
    // A tool sets shared state by returning it, after the plot has its new features.
    const outside = result?.state_change ? applyToolState(result.state_change, `tool:${tool.name}`, byHand && session.current?.item.id === opened.item.id && session.current.store.id === opened.store.id) : false;
    if (result?.non_spatial?.length) results.show(tool, result);
    const said = describeToolRun(tool.title, result, outside);
    if (said) void vscode.window.showInformationMessage(said);
    return { outcome: outcome.changed ? "changed" : "unchanged" };
  };
  /**
   * Shared state a tool returned. Current time outside the saved window is
   * shown in a window widened or moved to take it in, never saved (CAP-28):
   * the time controller says so until the analyst keeps or reverts it. A tool
   * whose purpose is to set the window has it saved, through the normal path,
   * only when the analyst ran it by hand on this plot. True if current time
   * is outside the saved window.
   */
  function applyToolState(change: SharedStateChange, origin: string, byHandHere: boolean): boolean {
    const { save_window: saveWindowAsked, ...state } = change;
    const shown = session.time?.range;
    const saved = session.savedWindow ?? shown;
    if (!state.time || !shown || !saved) {
      session.apply(state, origin);
      return false;
    }
    const span = (r: TimeRange) => ({ start: Date.parse(r.start), end: Date.parse(r.end) });
    const range = (s: { start: number; end: number }) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() });
    const period = session.period();
    const placed = placeToolTime(Date.parse(state.time.current), span(state.time.range), {
      saved: span(saved),
      shown: span(shown),
      period: period && span(period),
      saveWindow: saveWindowAsked === true,
      byHand: byHandHere,
      samePlot: byHandHere,
    });
    const window = range(placed.window);
    session.apply({ ...state, time: { current: state.time.current, range: window } }, origin);
    if (placed.save) void saveWindow(window).then(report);
    return placed.outside;
  }
  // From the form: the analyst ran it by hand.
  const form = new FormPanel(context.extensionUri, (tool, values) => runTool(tool, values, true), log);

  /** Warn before writing a newer schema into a shared catalogue (SUB-35). */
  async function confirmNewerSchema(message: string): Promise<boolean> {
    const save = "Save anyway";
    return (await vscode.window.showWarningMessage(message, { modal: true }, save)) === save;
  }

  // --- Colour and hiding: content, recorded in the plot's history (SUB-22) ----------
  /**
   * Colour tracks, or hide or show features: a step in the plot's history like
   * any change, named by its note ("Colour of BLUE ONE set to red"), and undone
   * by Ctrl+Z like any other (decision 12 Oct). A change made elsewhere since
   * the plot was opened is never overwritten (SUB-28).
   */
  const restyle = (ids: string[], change: { colour: string; colour_name?: string } | { hidden: boolean }) =>
    serially(() =>
      ourChange(async () => {
        const opened = session.current;
        if (!opened) return "Open a plot first.";
        if (!service || !opened.base) return "Changing colours and hiding needs Debrief's tool service. Run 'Debrief: Restart tool service'.";
        const save = (allow = false) => service!.restyle(opened.store.id, opened.item.id, opened.base!, agent, ids, change, allow);
        try {
          try {
            await save();
          } catch (error) {
            if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
            if (!(await confirmNewerSchema((error as Error).message))) return "Nothing was changed.";
            await save(true);
          }
        } catch (error) {
          if ((error as ServiceError).code === CONFLICT) {
            await reloadPlot(true);
            return "The plot was changed elsewhere, so nothing was changed. Debrief is showing the latest; try again if you still want to.";
          }
          return (error as Error).message;
        }
        return reloadPlot(true);
      }),
    );

  // --- Annotations: made, changed and deleted by hand (CAP-03 to CAP-05) ---------------
  /**
   * Add, change or delete annotations, or show or remove the north arrow: one step in
   * the plot's history each, named by its note ("Circle 'Exclusion zone' added"), and
   * undone by Ctrl+Z like any other. A change made elsewhere since the plot was opened
   * is never overwritten (SUB-28). Returns the problem, if any, and the feature added.
   */
  const annotate = (change: AnnotationChange) =>
    serially(() =>
      ourChange(async (): Promise<{ problem?: string; feature?: string }> => {
        const opened = session.current;
        if (!opened) return { problem: "Open a plot first." };
        if (!service || !opened.base) return { problem: "Changing annotations needs Debrief's tool service. Run 'Debrief: Restart tool service'." };
        const save = (allow = false) => service!.annotate(opened.store.id, opened.item.id, opened.base!, agent, change, allow);
        let answer;
        try {
          try {
            answer = await save();
          } catch (error) {
            if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
            if (!(await confirmNewerSchema((error as Error).message))) return { problem: "Nothing was changed." };
            answer = await save(true);
          }
        } catch (error) {
          if ((error as ServiceError).code === CONFLICT) {
            await reloadPlot(true);
            return { problem: "The plot was changed elsewhere, so nothing was changed. Debrief is showing the latest; try again if you still want to." };
          }
          return { problem: (error as Error).message };
        }
        const problem = await reloadPlot(true);
        return { problem, feature: answer.feature };
      }),
    );

  // --- Narrative: entries added, changed and deleted by hand, or read in (CAP-20) -------
  /**
   * Add, change or delete narrative entries, or read a REP file's narrative into the
   * open plot: one step in the plot's history each, named by its note ("Narrative entry
   * by BLUE ONE at 08:40:00Z added"), undone by Ctrl+Z like any other. A change made
   * elsewhere since the plot was opened is never overwritten (SUB-28).
   */
  const narrate = (change: NarrativeChange) =>
    serially(() =>
      ourChange(async (): Promise<{ problem?: string; feature?: string; entries?: number; omitted?: string[] }> => {
        const opened = session.current;
        if (!opened) return { problem: "Open a plot first." };
        if (!service || !opened.base) return { problem: "Changing the narrative needs Debrief's tool service. Run 'Debrief: Restart tool service'." };
        const save = (allow = false) => service!.narrate(opened.store.id, opened.item.id, opened.base!, agent, change, allow);
        let answer;
        try {
          try {
            answer = await save();
          } catch (error) {
            if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
            if (!(await confirmNewerSchema((error as Error).message))) return { problem: "Nothing was changed." };
            answer = await save(true);
          }
        } catch (error) {
          if ((error as ServiceError).code === CONFLICT) {
            await reloadPlot(true);
            return { problem: "The plot was changed elsewhere, so nothing was changed. Debrief is showing the latest; try again if you still want to." };
          }
          return { problem: (error as Error).message };
        }
        const problem = await reloadPlot(true);
        return { problem, feature: answer.feature, entries: answer.entries, omitted: answer.omitted };
      }),
    );

  // --- Tracks: moved, rotated, split and merged by hand (CAP-01, CAP-02) ----------------
  /**
   * Move, rotate, split or merge tracks: one step in the plot's history each, named by
   * its note ("BLUE ONE moved 1.20 nmi 045.0°T"), and undone by Ctrl+Z like any other.
   * A change made elsewhere since the plot was opened is never overwritten (SUB-28).
   * Returns the problem, if any, and the tracks the change made.
   */
  const changeTrack = (change: TrackChange, confirm?: (message: string) => Promise<boolean>) =>
    serially(() =>
      ourChange(async (): Promise<{ problem?: string; feature?: string; features?: string[]; notes?: string[] }> => {
        const opened = session.current;
        if (!opened) return { problem: "Open a plot first." };
        if (!service || !opened.base) return { problem: "Changing tracks needs Debrief's tool service. Run 'Debrief: Restart tool service'." };
        let sent = change;
        const save = (allow = false) => service!.changeTrack(opened.store.id, opened.item.id, opened.base!, agent, sent, allow);
        let answer;
        try {
          try {
            try {
              answer = await save();
            } catch (error) {
              // A change that would lose what the analyst made: with confirm, asked, and sent again confirming; without, refused, saying why.
              if ((error as ServiceError).code !== NEEDS_CONFIRMATION || !confirm || sent.kind !== "edit") throw error;
              const said = (error as Error).message.replace(/\s*Nothing was changed\. To go ahead[^]*$/, "");
              if (!(await confirm(said))) return { problem: "Nothing was changed." };
              sent = { ...sent, edit: { ...sent.edit, discard_dr_changes: true } };
              answer = await save();
            }
          } catch (error) {
            if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
            if (!(await confirmNewerSchema((error as Error).message))) return { problem: "Nothing was changed." };
            answer = await save(true);
          }
        } catch (error) {
          if ((error as ServiceError).code === CONFLICT) {
            await reloadPlot(true);
            return { problem: "The plot was changed elsewhere, so nothing was changed. Debrief is showing the latest; try again if you still want to." };
          }
          return { problem: (error as Error).message };
        }
        const problem = await reloadPlot(true);
        return { problem, feature: answer.feature, features: answer.features, ...(answer.notes?.length && { notes: answer.notes }) };
      }),
    );

  // --- Cleaning tracks: jumps, smoothing and marked fixes (CAP-01, EXT-14) ---------------
  /**
   * Remove jumps the analyst confirmed, smooth a track, or colour, label or comment on a
   * fix: one step in the plot's history each ("BLUE ONE: 3 jumps removed"), undone by
   * Ctrl+Z like any other, and never made over a change made elsewhere (SUB-28).
   */
  const cleanTrack = (change: CleanChange) =>
    serially(() =>
      ourChange(async (): Promise<{ problem?: string; summary?: string }> => {
        const opened = session.current;
        if (!opened) return { problem: "Open a plot first." };
        if (!service || !opened.base) return { problem: "Changing tracks needs Debrief's tool service. Run 'Debrief: Restart tool service'." };
        const save = (allow = false) => service!.cleanTrack(opened.store.id, opened.item.id, opened.base!, agent, change, allow);
        let answer;
        try {
          try {
            answer = await save();
          } catch (error) {
            if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
            if (!(await confirmNewerSchema((error as Error).message))) return { problem: "Nothing was changed." };
            answer = await save(true);
          }
        } catch (error) {
          if ((error as ServiceError).code === CONFLICT) {
            await reloadPlot(true);
            return { problem: "The plot was changed elsewhere, so nothing was changed. Debrief is showing the latest; try again if you still want to." };
          }
          return { problem: (error as Error).message };
        }
        const problem = await reloadPlot(true);
        return { problem, ...(answer.summary && { summary: answer.summary }) };
      }),
    );

  const annotationForm = new AnnotationPanel(
    context.extensionUri,
    {
      save: async (spec, featureId) => {
        const done = await annotate(featureId ? { kind: "edit", feature: featureId, annotation: spec } : { kind: "add", annotation: spec });
        if (!done.problem && done.feature && !featureId) session.select([done.feature], "command");
        return done.problem;
      },
      remove: async (featureId) => (await annotate({ kind: "delete", features: [featureId] })).problem,
      // Closed unsaved: what was drawn on the map for it goes.
      closed: (saved) => saved || map.refresh(),
    },
    log,
  );

  type Annotation = Extract<PlotFeature, { properties: { kind: "annotation" } }>;
  const annotationById = (id: string | undefined) => {
    const feature = id ? session.current?.plot.features.find((f) => f.id === id) : undefined;
    return feature && feature.properties.kind === "annotation" && !feature.properties.furniture ? (feature as Annotation) : undefined;
  };
  /** The middle of the map, where a new annotation starts. */
  const mapCentre = (): [number, number] | undefined => {
    const bbox = session.viewport?.bbox ?? session.current?.item.bbox;
    if (!bbox || bbox.length !== 4) return undefined;
    const [west, south, east, north] = bbox as number[];
    const lon = east >= west ? (west + east) / 2 : ((west + east + 360) / 2 + 180) % 360 - 180;
    return [lon, (south + north) / 2];
  };

  // --- The time window: view state, in the plot file outside its history (SUB-22) -----
  /**
   * Save the time window in the plot's island: never a step in its history,
   * never undone, never in provenance. Called when the analyst lets go of the
   * window, not as it moves. A window changed elsewhere since the plot was
   * read is never overwritten (SUB-28): Debrief shows that one and says so.
   */
  const saveWindow = (window: TimeRange): Promise<string | undefined> => {
    const problem = timeProblem({ current: window.start, range: window });
    if (problem) return Promise.resolve(problem);
    return saveView({ time_window: window }, {
      needsService: "Saving the time window needs Debrief's tool service. Run 'Debrief: Restart tool service'.",
      notSaved: "The time window was not saved.",
      conflict: "Someone else changed the time window, so yours was not saved. Debrief is showing theirs; set it again if you still want yours.",
    });
  };

  /** How tracks outside the window are drawn, for everyone who opens the plot: view state, saved as the window is (CAP-29). */
  const saveContext = (contextTracks: ContextTracksEnum): Promise<string | undefined> =>
    saveView({ context_tracks: contextTracks }, {
      needsService: "Saving how context tracks are drawn needs Debrief's tool service. Run 'Debrief: Restart tool service'.",
      notSaved: "How context tracks are drawn was not saved.",
      conflict: "Someone else changed this plot's view, so your choice was not saved. Debrief is showing theirs; choose again if you still want yours.",
    });

  /**
   * Which tracks the Tote compares, for everyone who opens the plot: view state, saved
   * as the window is (decision, 14 Oct 2026). Never a step in the history: choosing what
   * to look at is not an edit, so Ctrl+Z never changes it.
   */
  const saveTote = (tote: ToteChoice): Promise<string | undefined> =>
    saveView({ tote }, {
      needsService: "Saving the Tote's tracks needs Debrief's tool service. Run 'Debrief: Restart tool service'.",
      notSaved: "The Tote's tracks were not saved.",
      conflict: "Someone else changed this plot's view, so your choice of Tote tracks was not saved. Debrief is showing theirs; choose again if you still want yours.",
    });

  /** Change part of the plot's island, never overwriting a change made elsewhere since it was read (SUB-28). */
  const saveView = (change: Partial<PlotView>, say: { needsService: string; notSaved: string; conflict: string }): Promise<string | undefined> =>
    serially(() =>
      ourChange(async () => {
        const opened = session.current;
        if (!opened) return "Open a plot first.";
        if (!service || opened.viewHash === undefined) return say.needsService;
        const view = { ...(viewOf(opened.plot) ?? {}), ...change };
        const save = (allow = false) => service!.setView(opened.store.id, opened.item.id, view, opened.viewHash!, agent, allow);
        let answer: OpenedView;
        try {
          try {
            answer = await save();
          } catch (error) {
            if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
            if (!(await confirmNewerSchema((error as Error).message))) return say.notSaved;
            answer = await save(true);
          }
        } catch (error) {
          if ((error as ServiceError).code === CONFLICT) {
            await refreshView();
            return say.conflict;
          }
          return (error as Error).message;
        }
        // A plot made before plots had details of their own gets them first, as a step in its history.
        if (answer.base.current !== opened.base?.current || answer.base.plot_hash !== opened.base?.plot_hash) {
          const reloaded = await reloadPlot(true);
          await refreshHistory();
          return reloaded;
        }
        showView(opened, answer, true);
        return undefined;
      }),
    );

  /**
   * Show a view the service read: the plot's content is as it was, so it isn't
   * read again. Our own window is on screen already, from when it moved; showing
   * it again as its save finishes could put back a window since moved on from.
   */
  function showView(opened: OpenedPlot, answer: OpenedView, ours = false): void {
    opened.viewHash = answer.view_hash;
    setViewOf(opened.plot, answer.view);
    if (ours) session.savedWindow = timeWindowOf(opened.plot) ?? session.period();
    else session.windowChanged(timeWindowOf(opened.plot), "plot-view");
    // The saved window and how context tracks are drawn: the time controller and the map follow.
    session.viewChanged();
  }

  let viewChecks = 0;
  /**
   * Read the plot's view again, after a change to the plot file that left its
   * history alone: a colleague's new window, say. True if it had changed.
   */
  async function refreshView(): Promise<boolean> {
    const opened = session.current;
    if (!opened || !service) return false;
    viewChecks++;
    let answer: OpenedView;
    try {
      answer = await service.open(opened.store.id, opened.item.id, agent);
    } catch {
      return false;
    }
    if (session.current !== opened) return false; // another plot was opened meanwhile
    if (
      answer.base.current !== opened.base?.current ||
      answer.base.plot_hash !== opened.base?.plot_hash ||
      (answer.latest !== undefined && answer.latest !== opened.latest)
    ) {
      await reloadPlot(true);
      return true;
    }
    if (answer.view_hash === opened.viewHash) return false;
    showView(opened, answer);
    return true;
  }

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
    let latest: number | undefined;
    let recovered: string[] = [];
    let viewHash: string | undefined;
    let shown: OpenedPlot["plot"] | undefined;
    if (service) {
      try {
        const answer = await service.open(store.id, itemId, agent);
        ({ base, recovered, latest } = answer);
        viewHash = answer.view_hash;
        shown = answer.plot; // a retired presentation.json applied in memory (a read-only store)
      } catch (error) {
        // The plot's id only as a hash, and no message: both can name things (NFR-14).
        log(`open_failed item=${hashed(itemId)} code=${(error as ServiceError).code ?? "-"}`);
      }
    }
    const read = openPlot(store, itemId);
    const opened = { ...read, plot: shown ?? read.plot, base, latest, viewHash };
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
   * folder, an agent (SUB-28). Polled, because change events are unreliable on
   * network shares. One file holds the plot's content, its view and its whole
   * history (decision 13 Oct), so it is the only file watched. Nothing is ever
   * overwritten: Debrief shows the latest.
   */
  function watch(opened: OpenedPlot): void {
    const plot = plotFile(opened.store, opened.item);
    const files = plot ? [plot] : [];
    if (watched.join() === files.join()) return seePlotFile();
    watched.forEach((file) => unwatchFile(file));
    watched = files;
    seePlotFile();
    for (const file of files) {
      watchFile(file, { interval: 1000 }, (now) => {
        // The plot file as Debrief last wrote or read it: nothing to check. Checking
        // its view means opening the plot through the service, a second or so for a big one.
        if (fileVersion(now) === plotFileSeen) return;
        plotFileSeen = fileVersion(now);
        noticeChange(file);
      });
    }
  }
  /**
   * Which version of the plot file it is. Its modification time alone can miss a save
   * made in the same second where times are kept coarsely (some network shares, FAT);
   * every save replaces the file with a new one, so its inode tells them apart too.
   */
  function fileVersion(stats: { mtimeMs: number; size: number; ino: number }): string {
    return `${stats.mtimeMs}/${stats.size}/${stats.ino}`;
  }
  /** The plot file as Debrief last wrote or read it. */
  let plotFileSeen: string | undefined;
  function seePlotFile(): void {
    try {
      plotFileSeen = watched[0] ? fileVersion(statSync(watched[0])) : undefined;
    } catch {
      plotFileSeen = undefined;
    }
  }
  function noticeChange(file: string): void {
    if (writing) return; // ours
    if (checking) return; // a check already waiting
    checking = true;
    // Checked in turn with our own changes, so one of ours finishing is never mistaken for another's.
    void serially(async () => {
      checking = false;
      const current = session.current;
      if (writing || !current || plotFile(current.store, current.item) !== file) return;
      // A step made, undone or redone elsewhere moves the history's current step, its
      // length or the content's hash; a new time window moves none of them.
      const plotChanged = changedSince(historyOnDisk(file), current);
      const title = current.item.properties.title ?? current.item.id;
      if (!plotChanged) {
        // Perhaps only its time window: show that, without reading the plot's content again.
        if (await refreshView()) {
          void vscode.window.showInformationMessage(`The time window of ${title} was changed elsewhere. Debrief is showing the latest.`);
        }
        return;
      }
      const problem = await reloadPlot(true);
      void vscode.window.showInformationMessage(
        problem ?? `${title} was changed elsewhere. Debrief is showing the latest.`,
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
        history.update(listed.steps, listed.base.current, true);
      } catch (error) {
        if (request !== historyRequest) return;
        history.update([], 0, true, (error as Error).message);
      }
    }
    void vscode.commands.executeCommand("setContext", "debrief.canUndo", history.canUndo());
    void vscode.commands.executeCommand("setContext", "debrief.canRedo", history.canRedo());
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
            if (!(await confirmNewerSchema((error as Error).message))) return "Nothing was changed.";
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
      const notice = opened && hiddenNotice(hiddenIds(opened.plot).length);
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
  const resync = (problem: string | undefined) => {
    if (problem) session.viewChanged();
    return problem;
  };
  const report = (problem: string | undefined) => {
    if (problem) void vscode.window.showWarningMessage(problem);
    return problem;
  };
  // Ctrl+Z is the plot's history: colour and hiding are steps in it like any change.
  command("debrief.undo", async () => {
    if (!session.current) return report("Open a plot first.");
    const problem = await move("undo");
    await refreshHistory();
    return report(problem);
  });
  command("debrief.redo", async () => {
    if (!session.current || !history.canRedo()) return report("There is nothing to redo.");
    const problem = await move("redo");
    await refreshHistory();
    return report(problem);
  });

  // Colour and hiding (SUB-22): content, so each is a step in the plot's history.
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
    return report(await restyle(ids, { colour: picked.colour, colour_name: picked.label.toLowerCase() }));
  });
  const features = (ids: string[]) =>
    ids.filter((id) => {
      const feature = session.current?.plot.features.find((f) => f.id === id);
      return !!feature && isFeature(feature);
    });
  command("debrief.hide", async (node?: Target) => {
    const ids = features(targets(node));
    return report(ids.length ? await restyle(ids, { hidden: true }) : "Select what to hide.");
  });
  command("debrief.show", async (node?: Target) => {
    const ids = features(targets(node));
    return report(ids.length ? await restyle(ids, { hidden: false }) : "Select what to show.");
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
    const ids = opened ? hiddenIds(opened.plot) : [];
    return ids.length ? vscode.commands.executeCommand("debrief.show", { ids }) : undefined;
  });

  // Annotations (CAP-03 to CAP-05). Each command takes what agents and tests give it
  // instead of asking, and returns what happened: { problem } or { feature }.
  const timeRangeOfPlot = () => session.period();
  command("debrief.addAnnotation", async (spec?: AnnotationSpec) => {
    if (!session.current) return { problem: report("Open a plot first.") };
    if (spec && typeof spec === "object" && "shape" in spec) {
      const done = await annotate({ kind: "add", annotation: spec });
      report(done.problem);
      return done;
    }
    const centre = mapCentre();
    annotationForm.show({
      spec: centre ? { shape: "circle", name: "", positions: [centre] } : undefined,
      timeRange: timeRangeOfPlot(),
      currentTime: session.time?.current,
    });
    return {};
  });
  // Drawn on the map (annotation_drawn): the form, filled in with what was drawn, to name it and
  // add it as one step. Cancel adds nothing. Never changes current time, the window or the selection.
  command("debrief.addDrawnAnnotation", (spec?: AnnotationSpec) => {
    if (!session.current) return { problem: report("Open a plot first.") };
    if (!spec || typeof spec !== "object" || !("shape" in spec)) return { problem: report("Draw an annotation on the map first.") };
    annotationForm.show({ spec: { ...spec, name: "" }, timeRange: timeRangeOfPlot(), currentTime: session.time?.current });
    return {};
  });
  // From the outline's menu (a node), the map (an id), or the selection; with changes, without the form.
  command("debrief.editAnnotation", async (target?: string | Target, changes?: Partial<AnnotationSpec>) => {
    const id = typeof target === "string" ? target : targets(target ?? undefined).find((i) => annotationById(i));
    const feature = annotationById(id);
    if (!feature) return { problem: report("Select an annotation to change.") };
    if (changes) {
      const done = await annotate({ kind: "edit", feature: feature.id, annotation: changes });
      report(done.problem);
      return done;
    }
    annotationForm.show({ spec: specOfFeature(feature), featureId: feature.id, timeRange: timeRangeOfPlot(), currentTime: session.time?.current });
    return {};
  });
  command("debrief.deleteAnnotation", async (target?: string | Target) => {
    const ids = (typeof target === "string" ? [target] : targets(target ?? undefined)).filter((i) => annotationById(i));
    if (!ids.length) return { problem: report("Select the annotations to delete.") };
    const done = await annotate({ kind: "delete", features: ids });
    return { problem: report(done.problem) };
  });
  // Chart furniture: the north arrow is content, so showing or removing it is a step (CAP-03).
  command("debrief.toggleNorthArrow", async (shown?: boolean) => {
    if (!session.current) return { problem: report("Open a plot first.") };
    const has = session.current.plot.features.some((f) => f.properties.kind === "annotation" && f.properties.furniture === "north_arrow");
    const done = await annotate({ kind: "north_arrow", shown: shown ?? !has });
    return { problem: report(done.problem) };
  });
  // Tracks (CAP-01, CAP-02): moved, rotated, split and merged, each one step. Each command takes
  // what agents and tests give it instead of asking, and returns what happened: { problem } or
  // { feature } / { features }.
  type TrackFeature = Extract<PlotFeature, { properties: { kind: "track" } }>;
  const trackById = (id?: string) => {
    const feature = id ? session.current?.plot.features.find((f) => f.id === id) : undefined;
    return feature?.properties.kind === "track" ? (feature as TrackFeature) : undefined;
  };
  /** The one track a command acts on: the outline node it was run on, an id given, or the one track selected. */
  const trackTarget = (target?: string | Target) => {
    const found = (typeof target === "string" ? [target] : targets(target ?? undefined)).map(trackById).filter((t): t is TrackFeature => !!t);
    return found.length === 1 ? found[0] : undefined;
  };
  const trackDone = (done: { problem?: string }) => {
    report(done.problem);
    return done;
  };
  /** What a move or rotation changes: the whole track, or only its fixes in the time window shown. */
  async function chooseExtent(track: TrackFeature, verb: string): Promise<{ period?: TimeRange } | undefined> {
    const window = session.time?.range;
    const { times } = track.properties;
    const whole = { label: "Whole track", description: describeTimes(times[0], times.at(-1)), period: undefined as TimeRange | undefined };
    if (!window) return {};
    const inWindow = periodIndices(times.map(Date.parse), { start: Date.parse(window.start), end: Date.parse(window.end) }).length;
    const items = [
      whole,
      {
        label: "Current time window",
        description: `${describeTimes(window.start, window.end)} · ${count(inWindow, "fix", "fixes")}`,
        detail: "Only the fixes in the window change; the track jumps where they meet the rest.",
        period: window,
      },
    ];
    const picked = await vscode.window.showQuickPick(items, { title: `${verb} ${track.properties.name}`, placeHolder: `What of ${track.properties.name} to ${verb.toLowerCase()}?` });
    return picked && { period: picked.period };
  }
  /** The input box's note on what was typed: what it means, or what is wrong. */
  const meaning = (read: { problem: string } | unknown, means: () => string): vscode.InputBoxValidationMessage => {
    if (read && typeof read === "object" && "problem" in read) return { message: (read as { problem: string }).problem, severity: vscode.InputBoxValidationSeverity.Error };
    return { message: `Means ${means()}`, severity: vscode.InputBoxValidationSeverity.Info };
  };

  // From the map: a handle let go of, or a run of arrow keys on one.
  command("debrief.editTrack", async (featureId?: string, edit?: TrackEdit) => {
    if (!trackById(featureId) || !edit) return { problem: report("Select a track to change.") };
    return trackDone(await changeTrack({ kind: "edit", feature: featureId!, edit }));
  });
  // "Move track…": what moves, the distance and the bearing. With a change given, no questions.
  command("debrief.moveTrack", async (target?: string | Target, given?: Omit<TrackEdit, "action">) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to move.") };
    const name = track.properties.name;
    if (given && typeof given === "object") return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: { ...given, action: "move" } }));
    const extent = await chooseExtent(track, "Move");
    if (!extent) return {};
    const distanceText = await vscode.window.showInputBox({
      title: `Move ${name}`,
      prompt: "How far: each fix moves this far along the bearing, along its own geodesic",
      placeHolder: `such as 1.2 ${UNIT_LABELS[displaySettings.length_unit]}`,
      validateInput: (text) => {
        const read = readDistance(text, displaySettings);
        return meaning(read, () => describeDistance(read as { value: number; unit: string }, displaySettings));
      },
    });
    const distance = distanceText === undefined ? undefined : readDistance(distanceText, displaySettings);
    if (!distance || "problem" in distance) return {};
    const bearingText = await vscode.window.showInputBox({
      title: `Move ${name} ${describeDistance(distance, displaySettings)}`,
      prompt: "Which way: a bearing in degrees true",
      placeHolder: "such as 045",
      validateInput: (text) => {
        const read = readBearing(text);
        return meaning(read, () => formatBearing({ value: read as number, unit: "deg" }, displaySettings));
      },
    });
    const bearing = bearingText === undefined ? undefined : readBearing(bearingText);
    if (bearing === undefined || typeof bearing !== "number") return {};
    const edit: TrackEdit = { action: "move", distance: distance as never, bearing: { value: bearing, unit: "deg" }, ...(extent.period && { period: extent.period }) };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }));
  });
  // "Rotate track…": what turns, about which pivot, and by how much. With a change given, no questions.
  command("debrief.rotateTrack", async (target?: string | Target, given?: Omit<TrackEdit, "action">) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to rotate.") };
    const name = track.properties.name;
    const current = session.time?.current;
    if (given && typeof given === "object") {
      const edit: TrackEdit = { ...given, action: "rotate" };
      return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit, ...(current && !edit.pivot && { current_time: current }) }));
    }
    const extent = await chooseExtent(track, "Rotate");
    if (!extent) return {};
    const times = track.properties.times.map(Date.parse);
    const positions = track.geometry.coordinates as [number, number][];
    const span = extent.period && { start: Date.parse(extent.period.start), end: Date.parse(extent.period.end) };
    const indices = periodIndices(times, span);
    if (!indices.length) return { problem: report(`${name} has no fixes in the time window, so nothing was rotated.`) };
    const at = (i: number) => formatPosition({ longitude: positions[i][0], latitude: positions[i][1] }, displaySettings);
    const nearest = defaultPivotIndex(times, indices, current ? Date.parse(current) : undefined);
    const fix = (i: number) => `${at(i)} at ${describeTimes(track.properties.times[i])}`;
    const pivots = [
      { label: current && nearest !== indices[0] ? "Fix nearest current time" : "First fix", description: fix(nearest), pivot: positions[nearest] },
      ...(nearest !== indices[0] ? [{ label: "First fix", description: fix(indices[0]), pivot: positions[indices[0]] }] : []),
      { label: "Last fix", description: fix(indices[indices.length - 1]), pivot: positions[indices[indices.length - 1]] },
      { label: "A position I type…", description: "", pivot: undefined as [number, number] | undefined },
    ];
    const chosen = await vscode.window.showQuickPick(pivots, { title: `Rotate ${name}`, placeHolder: "Rotate about which position? Each fix keeps its range from it." });
    if (!chosen) return {};
    let pivot = chosen.pivot;
    if (!pivot) {
      const typed = await vscode.window.showInputBox({
        title: `Rotate ${name}`,
        prompt: "Rotate about this position",
        placeHolder: POSITION_EXAMPLE,
        validateInput: (text) => {
          try {
            const p = parsePosition(text);
            return { message: `Means ${formatPosition(p, displaySettings)}`, severity: vscode.InputBoxValidationSeverity.Info };
          } catch (error) {
            return { message: (error as Error).message, severity: vscode.InputBoxValidationSeverity.Error };
          }
        },
      });
      if (typed === undefined) return {};
      const p = parsePosition(typed);
      pivot = [p.longitude, p.latitude];
    }
    const angleText = await vscode.window.showInputBox({
      title: `Rotate ${name} about ${formatPosition({ longitude: pivot[0], latitude: pivot[1] }, displaySettings)}`,
      prompt: "By how much: degrees, positive or 'clockwise' turns clockwise, negative or 'anticlockwise' the other way",
      placeHolder: "such as 10, or 10 anticlockwise",
      validateInput: (text) => {
        const read = readTurn(text);
        return meaning(read, () => describeTurn(read as number, displaySettings));
      },
    });
    const angle = angleText === undefined ? undefined : readTurn(angleText);
    if (angle === undefined || typeof angle !== "number") return {};
    const edit: TrackEdit = { action: "rotate", angle: { value: angle, unit: "deg" }, pivot, ...(extent.period && { period: extent.period }) };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }));
  });
  /** Which end of what changes a shear or a stretch holds: the other end is the one that moves. Undefined for Escape, or a problem when it cannot be done. */
  async function chooseAnchor(track: TrackFeature, verb: string, period?: TimeRange): Promise<{ anchor: Anchor; now: NonNullable<ReturnType<typeof legNow>> } | { problem: string } | undefined> {
    const times = track.properties.times.map(Date.parse);
    const span = period && { start: Date.parse(period.start), end: Date.parse(period.end) };
    const indices = periodIndices(times, span);
    const name = track.properties.name;
    const now = legNow(track.geometry.coordinates as [number, number][], times, indices, displaySettings);
    if (!now) return { problem: `${name} has fixes at only one time there, so it cannot be ${verb === "Shear" ? "sheared" : "stretched"}: that needs fixes at two times.` };
    const at = (i: number) => describeTimes(track.properties.times[i]);
    const [first, last] = [indices[0], indices[indices.length - 1]];
    const picked = await vscode.window.showQuickPick(
      [
        { label: "Hold the start", description: `${at(first)}; the end moves`, anchor: "start" as Anchor },
        { label: "Hold the end", description: `${at(last)}; the start moves`, anchor: "end" as Anchor },
      ],
      { title: `${verb} ${name}: now ${now.said}`, placeHolder: "Which end stays where it is?" },
    );
    return picked && { anchor: picked.anchor, now };
  }
  const speedMeaning = (positive: boolean) => (text: string) => {
    const read = readSpeed(text, displaySettings, positive);
    return meaning(read, () => describeSpeed(read as { value: number; unit: string }, displaySettings));
  };
  // "Shear track…": what changes, which end is held, and the course and speed the rest then makes good. With a change given, no questions.
  command("debrief.shearTrack", async (target?: string | Target, given?: Omit<TrackEdit, "action">) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to shear.") };
    const name = track.properties.name;
    if (given && typeof given === "object") return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: { ...given, action: "shear" } }));
    const extent = await chooseExtent(track, "Shear");
    if (!extent) return {};
    const held = await chooseAnchor(track, "Shear", extent.period);
    if (!held) return {};
    if ("problem" in held) return { problem: report(held.problem) };
    const courseText = await vscode.window.showInputBox({
      title: `Shear ${name}, holding the ${held.anchor}`,
      prompt: `The course it then makes good, from its first fix to its last, in degrees true (now ${held.now.said})`,
      value: held.now.course,
      validateInput: (text) => {
        const read = readBearing(text);
        return meaning(read, () => formatBearing({ value: read as number, unit: "deg" }, displaySettings));
      },
    });
    const course = courseText === undefined ? undefined : readBearing(courseText);
    if (course === undefined || typeof course !== "number") return {};
    const speedText = await vscode.window.showInputBox({
      title: `Shear ${name} to ${formatBearing({ value: course, unit: "deg" }, displaySettings)}`,
      prompt: `The speed it then makes good (now ${held.now.said})`,
      value: held.now.speed,
      validateInput: speedMeaning(false),
    });
    const speed = speedText === undefined ? undefined : readSpeed(speedText, displaySettings);
    if (!speed || "problem" in speed) return {};
    const edit: TrackEdit = { action: "shear", anchor: held.anchor, course: { value: course, unit: "deg" }, speed: speed as never, ...(extent.period && { period: extent.period }) };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }));
  });
  // "Stretch track…": what changes, which end is held, and the speed the rest then makes good, on the same course. With a change given, no questions.
  command("debrief.stretchTrack", async (target?: string | Target, given?: Omit<TrackEdit, "action">) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to stretch.") };
    const name = track.properties.name;
    if (given && typeof given === "object") return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: { ...given, action: "stretch" } }));
    const extent = await chooseExtent(track, "Stretch");
    if (!extent) return {};
    const held = await chooseAnchor(track, "Stretch", extent.period);
    if (!held) return {};
    if ("problem" in held) return { problem: report(held.problem) };
    if (!held.now.moves) return { problem: report(`${name} ends where it starts there, so it cannot be stretched: shear it instead.`) };
    const speedText = await vscode.window.showInputBox({
      title: `Stretch ${name}, holding the ${held.anchor}`,
      prompt: `The speed it then makes good, on the same course (now ${held.now.said})`,
      value: held.now.speed,
      validateInput: speedMeaning(true),
    });
    const speed = speedText === undefined ? undefined : readSpeed(speedText, displaySettings, true);
    if (!speed || "problem" in speed) return {};
    const edit: TrackEdit = { action: "stretch", anchor: held.anchor, speed: speed as never, ...(extent.period && { period: extent.period }) };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }));
  });
  // "Split track at current time…": the two parts' names, offered as "X (1)" and "X (2)". With options given, no questions.
  command("debrief.splitTrack", async (target?: string | Target, options?: { at?: string; names?: [string, string] }) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to split.") };
    const at = options?.at ?? session.time?.current;
    if (!at) return { problem: report("Set current time first: the track is split there.") };
    const name = track.properties.name;
    let names = options?.names;
    if (!options) {
      const when = describeTimes(at);
      const ask = (part: string, value: string) =>
        vscode.window.showInputBox({ title: `Split ${name} at ${when}`, prompt: `Name for the part ${part}`, value, validateInput: (text) => (text.trim() ? undefined : "Give the part a name.") });
      const first = await ask(`before ${when}`, `${name} (1)`);
      if (first === undefined) return {};
      const second = await ask(`from ${when} on`, `${name} (2)`);
      if (second === undefined) return {};
      names = [first.trim(), second.trim()];
    }
    const done = await changeTrack({ kind: "split", feature: track.id, at, ...(names && { names }) });
    if (!done.problem && done.features) session.select(done.features, "command");
    return trackDone(done);
  });
  // "Merge selected tracks": the tracks selected, or the ids given, joined in time order. Asked for
  // the merged track's name, and, if speeds, courses or depths would not be kept, asked first
  // whether to merge anyway. With the ids given (agents, tests), no questions; what was not kept comes back.
  command("debrief.mergeTracks", async (target?: string[] | Target, others?: readonly unknown[] | { name?: string }) => {
    const nodes = Array.isArray(others) ? featureIdsOf(others as never) : [];
    const ids = Array.isArray(target) ? target : nodes.length ? nodes : session.selection;
    const tracks = ids.map(trackById).filter((t): t is TrackFeature => !!t);
    if (tracks.length < 2) return { problem: report("Select two or more tracks to merge.") };
    let name = others && !Array.isArray(others) ? (others as { name?: string }).name : undefined;
    if (!Array.isArray(target)) {
      const { ordered, lost } = mergePlan(tracks);
      if (lost.length) {
        const go = "Merge anyway";
        const answer = await vscode.window.showWarningMessage(
          `Merging ${ordered.map((t) => t.properties.name).join(", ")} keeps only what every track has.`,
          { modal: true, detail: `${lost.join(". ")}. Undo puts them back.` },
          go,
        );
        if (answer !== go) return {};
      }
      name = await vscode.window.showInputBox({
        title: `Merge ${count(ordered.length, "track", "tracks")}`,
        prompt: "Name for the merged track",
        value: mergedName(ordered.map((t) => t.properties.name)),
        validateInput: (text) => (text.trim() ? undefined : "Give the merged track a name."),
      });
      if (name === undefined) return {};
      name = name.trim();
    }
    const done = await changeTrack({ kind: "merge", features: tracks.map((t) => t.id), ...(name && { name }) });
    if (!done.problem && done.feature) session.select([done.feature], "command");
    return trackDone(done);
  });

  // Cleaning tracks (CAP-01, EXT-14): what would change is shown first, on the map and in a
  // list, and changed only when the analyst says, as one step. Each command takes what agents
  // and tests give it instead of asking, and returns what happened.
  /** Ring fixes on the map for the analyst to check, or draw a change previewed; nothing to take them away. */
  const showFixes = (shown?: { feature_id: string; fix_times?: string[]; preview?: { type: "LineString"; coordinates: number[][] }; message?: string }) => map.showFixes(shown);
  const colourName = (colour: string) => FIX_COLOURS.find((c) => c.colour === colour)?.name.toLowerCase();

  // "Find and remove jumps…": the threshold (offered as the track's default), then the jumps found,
  // ringed on the map and listed, all ticked; those left ticked are removed as one step. Given
  // options, no questions: the times to remove ("all" found), or none, to find them and ring them.
  command("debrief.removeJumps", async (target?: string | Target, given?: { threshold?: { value: number; unit: string }; times?: string[] | "all" }) => {
    const track = trackTarget(target);
    const opened = session.current;
    if (!track || !opened) return { problem: report("Select one track to find its jumps.") };
    if (!service || !opened.base) return { problem: report("Finding jumps needs Debrief's tool service. Run 'Debrief: Restart tool service'.") };
    const name = track.properties.name;
    const find = (threshold?: { value: number; unit: string }) => service!.findJumps(opened.store.id, opened.item.id, opened.base!, track.id, threshold);
    let found;
    try {
      found = await find(given?.threshold);
      if (!given) {
        const median = found.median_speed ? `three times its median speed of ${formatQuantity(found.median_speed, displaySettings)}, at least 10 kn` : "at least 10 kn";
        const typed = await vscode.window.showInputBox({
          title: `Find jumps in ${name}`,
          prompt: `A fix is a jump when reaching it from the fix before needs more than this speed. Offered: ${median}.`,
          value: formatQuantity(found.threshold, displaySettings),
          validateInput: (text) => {
            const read = readThreshold(text, displaySettings);
            return meaning(read, () => `faster than ${formatQuantity(read as { value: number; unit: string }, displaySettings)} to reach`);
          },
        });
        if (typed === undefined) return {};
        const threshold = readThreshold(typed, displaySettings);
        if ("problem" in threshold) return {};
        if (threshold.value !== found.threshold.value || threshold.unit !== found.threshold.unit) found = await find(threshold);
      }
    } catch (error) {
      return { problem: report((error as Error).message) };
    }
    const times = found.jumps.map((j) => j.time);
    const dr = isDeadReckoned(track.properties);
    const said = jumpsFound(dr ? trackLabel(track.properties) : name, times.length, found.threshold, displaySettings, dr);
    if (!times.length) {
      showFixes(undefined);
      if (!given) void vscode.window.showInformationMessage(said);
      return { found: [], threshold: found.threshold };
    }
    showFixes({ feature_id: track.id, fix_times: times, message: said });
    let chosen: string[] | undefined;
    if (given?.times) chosen = given.times === "all" ? times : given.times;
    else if (given) return { found: times, threshold: found.threshold }; // asked only to find them: they stay ringed on the map
    else {
      const items = found.jumps.map((jump) => ({ ...describeJump(jump, displaySettings), time: jump.time }));
      const list = vscode.window.createQuickPick<(typeof items)[number]>();
      list.title = said.split(". ")[0];
      list.placeholder = "Untick any that are real; those ticked are removed as one step. Each is ringed on the map.";
      list.canSelectMany = true;
      list.ignoreFocusOut = true;
      list.items = items;
      list.selectedItems = items;
      // An unticked jump's ring goes from the map, so the map shows what will be removed.
      list.onDidChangeSelection((ticked) => showFixes({ feature_id: track.id, fix_times: ticked.map((t) => t.time), message: said }));
      chosen = await new Promise<string[] | undefined>((resolve) => {
        list.onDidAccept(() => resolve(list.selectedItems.map((t) => t.time)));
        list.onDidHide(() => resolve(undefined));
        list.show();
      });
      list.dispose();
    }
    if (!chosen?.length) {
      showFixes(undefined);
      return { found: times, threshold: found.threshold };
    }
    const done = await cleanTrack({ kind: "remove_jumps", feature: track.id, times: chosen, threshold: found.threshold });
    showFixes(undefined);
    report(done.problem);
    return { ...done, found: times, removed: done.problem ? 0 : chosen.length, threshold: found.threshold };
  });

  // "Smooth track…": what to smooth, over how many fixes, then the track drawn as it would be,
  // with how far fixes would move; Apply makes it one step. Given a window, it is applied, unless
  // apply is false: then the preview stays on the map.
  command("debrief.smoothTrack", async (target?: string | Target, given?: { window: number; period?: TimeRange; apply?: boolean }) => {
    const track = trackTarget(target);
    const opened = session.current;
    if (!track || !opened) return { problem: report("Select one track to smooth.") };
    if (!service || !opened.base) return { problem: report("Smoothing needs Debrief's tool service. Run 'Debrief: Restart tool service'.") };
    const name = track.properties.name;
    let window = given?.window;
    let period = given?.period;
    if (!given) {
      // What to smooth: the whole track, or its fixes in the time window, whose first and last stay put.
      const shown = session.time?.range;
      const { times } = track.properties;
      const extents = [
        { label: "Whole track", description: describeTimes(times[0], times.at(-1)), period: undefined as TimeRange | undefined },
        ...(shown
          ? [{ label: "Current time window", description: `${describeTimes(shown.start, shown.end)} · ${count(periodIndices(times.map(Date.parse), { start: Date.parse(shown.start), end: Date.parse(shown.end) }).length, "fix", "fixes")}`, detail: "Only the fixes in the window are smoothed; its first and last fixes stay where they are.", period: shown }]
          : []),
      ];
      const extent = extents.length > 1 ? await vscode.window.showQuickPick(extents, { title: `Smooth ${name}`, placeHolder: `What of ${name} to smooth?` }) : extents[0];
      if (!extent) return {};
      period = extent.period;
      const typed = await vscode.window.showInputBox({
        title: `Smooth ${name}`,
        prompt: "Over how many fixes: an odd number; the first and last fixes of what is smoothed stay where they are",
        value: "5",
        validateInput: (text) => {
          const read = readWindow(text);
          return meaning(read, () => describeWindow(read as number));
        },
      });
      const read = typed === undefined ? undefined : readWindow(typed);
      if (typeof read !== "number") return {};
      window = read;
    }
    let preview;
    try {
      preview = await service.previewSmoothing(opened.store.id, opened.item.id, opened.base, track.id, window!, period);
    } catch (error) {
      return { problem: report((error as Error).message) };
    }
    const note = smoothingNote(name, window!, preview.summary);
    if (!preview.moved) {
      if (!given) void vscode.window.showInformationMessage(`${name}: no fix would move, so there is nothing to smooth.`);
      return { summary: preview.summary, moved: 0 };
    }
    showFixes({ feature_id: track.id, fix_times: [], preview: preview.preview, message: note });
    // Asked only to preview: it stays on the map until the next change or debrief.showFixes.
    if (given?.apply === false) return { summary: preview.summary, moved: preview.moved };
    const apply = given ? true : (await vscode.window.showInformationMessage(note, { detail: "The dashed line shows the track as smoothing would leave it." }, "Apply", "Cancel")) === "Apply";
    if (!apply) {
      showFixes(undefined);
      return { summary: preview.summary, moved: preview.moved };
    }
    const done = await cleanTrack({ kind: "smooth", feature: track.id, window: window!, ...(period && { period }) });
    showFixes(undefined);
    report(done.problem);
    return { ...done, moved: preview.moved };
  });

  // "Fixes…": the fix list of a track, to choose one; then its colour, label or comment, each one step.
  // From the map (a right-click on a fix), the fix is given. With a change given, no questions.
  type MarkChanges = { colour?: string | null; label?: string | null; comment?: string | null; colour_name?: string };
  /** The fix list of a track, the fix nearest current time offered: the time of the fix chosen, or undefined for Escape. */
  async function chooseFix(track: TrackFeature, placeholder: string): Promise<string | undefined> {
    const rows = fixRows(track, displaySettings, colourName).map((row) => ({ label: row.label, description: row.description, detail: row.mark || undefined, time: row.time }));
    const current = session.time ? Date.parse(session.time.current) : undefined;
    const near = current === undefined ? 0 : rows.reduce((best, row, i) => (Math.abs(Date.parse(row.time) - current) < Math.abs(Date.parse(rows[best].time) - current) ? i : best), 0);
    const quick = vscode.window.createQuickPick<(typeof rows)[number]>();
    quick.title = `Fixes of ${track.properties.name}`;
    quick.placeholder = placeholder;
    quick.items = rows;
    quick.matchOnDescription = true;
    quick.matchOnDetail = true;
    quick.activeItems = rows[near] ? [rows[near]] : [];
    const at = await new Promise<string | undefined>((resolve) => {
      quick.onDidAccept(() => resolve(quick.selectedItems[0]?.time ?? quick.activeItems[0]?.time));
      quick.onDidHide(() => resolve(undefined));
      quick.show();
    });
    quick.dispose();
    return at;
  }
  command("debrief.markFix", async (target?: string | Target, time?: string, change?: MarkChanges) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to mark one of its fixes.") };
    const at = time ?? (await chooseFix(track, "Choose a fix to colour, label or comment on; type a time to find one"));
    if (!at) return {};
    let changes = change;
    if (!changes) {
      // The fix chosen, ringed on the map while the analyst says what to do to it.
      showFixes({ feature_id: track.id, fix_times: [at] });
      const asked = await askMarkChange(track, at);
      showFixes(undefined);
      if (asked === "move") return vscode.commands.executeCommand("debrief.moveFix", track.id, at);
      changes = asked;
      if (!changes) return {};
    }
    const { colour_name, ...members } = changes;
    const done = await cleanTrack({ kind: "mark", feature: track.id, time: at, changes: members, ...(colour_name && { colour_name }) });
    report(done.problem);
    return done;
  });
  /** What to do to a fix: its colour, label or comment, asked in VS Code's lists and input boxes; or move it. */
  async function askMarkChange(track: TrackFeature, at: string): Promise<MarkChanges | "move" | undefined> {
    const name = track.properties.name;
    const mark = markAt(track, at);
    const when = describeTimes(at);
    const actions = [
      { label: "Colour…", description: mark?.colour ? `now ${colourName(mark.colour) ?? mark.colour}` : "", act: "colour" },
      { label: "Label…", description: mark?.label ? `now '${mark.label}'` : "", act: "label" },
      { label: "Comment…", description: mark?.comment ? `now: ${mark.comment.split("\n")[0]}` : "", act: "comment" },
      ...(mark?.colour ? [{ label: "Remove its own colour", description: "drawn in the track's colour again", act: "uncolour" }] : []),
      { label: "Move…", description: "this fix alone, to a position you type", act: "move" },
    ];
    const action = await vscode.window.showQuickPick(actions, { title: `Fix of ${name} at ${when}`, placeHolder: describeMark(mark, colourName) || "Give this fix a colour, a label or a comment of its own" });
    if (!action) return undefined;
    if (action.act === "move") return "move";
    if (action.act === "uncolour") return { colour: null };
    if (action.act === "colour") {
      const picked = await vscode.window.showQuickPick(FIX_COLOURS.map((c) => ({ label: c.name, colour: c.colour })), { title: `Colour for the fix of ${name} at ${when}` });
      return picked && { colour: picked.colour, colour_name: picked.label.toLowerCase() };
    }
    const typed = await vscode.window.showInputBox({
      title: `${action.act === "label" ? "Label" : "Comment"} for the fix of ${name} at ${when}`,
      prompt: action.act === "label" ? "Drawn on the map beside the fix. Leave empty to remove it." : "Shown when you point at the fix, and in the Timeline. Leave empty to remove it.",
      value: (action.act === "label" ? mark?.label : mark?.comment) ?? "",
    });
    return typed === undefined ? undefined : { [action.act]: typed.trim() || null };
  }
  // "Move a fix…": the fix list, then where it goes, typed in any notation Debrief reads. Only that fix moves;
  // its time, its recorded course and speed and its mark stay. From the map's fix menu, the fix is given;
  // with a change given ({position} or {distance, bearing}), no questions.
  command("debrief.moveFix", async (target?: string | Target, time?: string, given?: Omit<TrackEdit, "action" | "fix_time">) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to move one of its fixes.") };
    const name = track.properties.name;
    const at = time ?? (await chooseFix(track, "Choose a fix to move; type a time to find one"));
    if (!at) return {};
    if (given && typeof given === "object") return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: { ...given, action: "move_fix", fix_time: at } }));
    const index = fixIndexAt(track.properties.times, at);
    if (index < 0) return { problem: report(`${name} has no fix at ${describeTimes(at)}.`) };
    const positions = track.geometry.coordinates as [number, number][];
    const times = track.properties.times.map(Date.parse);
    const jump = jumpSpeed(positions, times);
    const here = positions[index];
    showFixes({ feature_id: track.id, fix_times: [track.properties.times[index]] });
    const typed = await vscode.window.showInputBox({
      title: `Move the fix of ${name} at ${describeTimes(at)}`,
      prompt: reckoningOf(track.properties) ? FIX_PROMPT_DR : FIX_PROMPT,
      value: formatPosition({ longitude: here[0], latitude: here[1] }, displaySettings),
      placeHolder: POSITION_EXAMPLE,
      validateInput: (text) => {
        try {
          const p = parsePosition(text);
          const to: [number, number] = [p.longitude, p.latitude];
          const said = fixMeans(name, positions, times, index, to, jump, reckoningOf(track.properties), displaySettings);
          return { message: `Means ${formatPosition(p, displaySettings)}. ${said}`, severity: vscode.InputBoxValidationSeverity.Info };
        } catch (error) {
          return { message: (error as Error).message, severity: vscode.InputBoxValidationSeverity.Error };
        }
      },
    });
    showFixes(undefined);
    if (typed === undefined) return {};
    const p = parsePosition(typed);
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: fixToEdit(track.properties.times[index], [p.longitude, p.latitude]) }));
  });
  // "Plot over the ground or by dead reckoning…": the track's plotting mode, chosen as it was
  // imported, changed as one step. With the mode given ("otg" or "dr"), no questions. Over the ground after a
  // change made while plotted by dead reckoning loses that change (decision, product owner, 14 Oct 2026): asked,
  // the analyst confirms in a dialog first; given, it is refused, saying why, unless options say to discard it.
  command("debrief.plottingMode", async (target?: string | Target, given?: PlottingMode, options?: { discard_dr_changes?: boolean }) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to plot over the ground or by dead reckoning.") };
    const name = track.properties.name;
    const now: PlottingMode = (track.properties.plotting_mode as PlottingMode | undefined) ?? "otg";
    let mode = given;
    if (!mode) {
      const items = (["otg", "dr"] as const).map((m) => ({ label: MODE_LABELS[m], description: m === now ? "as it is plotted now" : "", mode: m }));
      const picked = await vscode.window.showQuickPick(items, {
        title: `How is ${name} plotted?`,
        placeHolder: "By dead reckoning, each fix after the first is placed by the course and speed at the fix before; its positions as logged are kept.",
      });
      if (!picked || picked.mode === now) return {};
      mode = picked.mode;
    }
    const discard = !!given && mode === "otg" && options?.discard_dr_changes === true;
    const edit: TrackEdit = { action: "set_plotting_mode", plotting_mode: mode, ...(discard && { discard_dr_changes: true }) };
    const confirmLoss = async (message: string) => {
      const go = "Plot over the ground";
      return (await vscode.window.showWarningMessage(message, { modal: true }, go)) === go;
    };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }, given ? undefined : confirmLoss));
  });
  // What the map rings or previews, for agents and tests; debrief.showFixes with nothing takes it away.
  command("debrief.fixesOnMap", () => map.fixesShown);
  command("debrief.showFixes", (shown?: Parameters<typeof showFixes>[0]) => showFixes(shown));

  // The Timeline: choosing an entry moves current time to it. Outside the window shown, the
  // window widens or moves to take it in, shown but never saved, as for a tool's time (CAP-28).
  command("debrief.goToTime", (id?: string) => {
    const entry = timeline.entries.find((e) => e.id === id);
    const range = session.time?.range;
    if (!entry || !range) return report("Choose an entry in the Timeline.");
    const start = Date.parse(entry.start);
    const at = new Date(start).toISOString();
    const within = start >= Date.parse(range.start) && start <= Date.parse(range.end);
    const time = { current: at, range: within ? range : { start: at < range.start ? at : range.start, end: at > range.end ? at : range.end } };
    applyToolState({ time }, "timeline", false);
    return undefined;
  });
  command("debrief.timelineEntries", () => ({ entries: timeline.entries.map((e) => e.id), current: timeline.currentId }));
  // Narrative entries (CAP-20): with an entry, added at once (agents, macros, tests); without, the Timeline's form.
  command("debrief.addNarrative", async (spec?: NarrativeSpec) => {
    if (!session.current) return report("Open a plot first.");
    if (!spec) return timeline.openForm();
    return narrate({ kind: "add", entry: spec }).then((done) => (report(done.problem), done));
  });
  command("debrief.editNarrative", async (id?: string, changes?: Partial<NarrativeSpec>) => {
    const entry = timeline.entries.find((e) => e.id === id && e.kind === "narrative");
    if (!entry) return report("Choose a narrative entry in the Timeline.");
    if (!changes) return timeline.openForm(entry.id);
    return narrate({ kind: "edit", feature: entry.id, entry: changes }).then((done) => (report(done.problem), done));
  });
  command("debrief.deleteNarrative", async (id?: string | string[]) => {
    const ids = (Array.isArray(id) ? id : id ? [id] : []).filter((i) => timeline.entries.some((e) => e.id === i && e.kind === "narrative"));
    if (!ids.length) return report("Choose a narrative entry in the Timeline.");
    return narrate({ kind: "delete", features: ids }).then((done) => (report(done.problem), done));
  });
  // A platform's log read into the open plot: its ;NARRATIVE: lines, one step, the file kept as a source.
  command("debrief.importNarrative", async (given?: string) => {
    if (!session.current) return report("Open a plot first.");
    const path =
      given ??
      (await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "Read narrative", filters: { "REP files": ["rep", "REP"], "All files": ["*"] } }))?.[0]?.fsPath;
    if (!path) return undefined;
    const done = await narrate({ kind: "import", path });
    if (done.problem) return (report(done.problem), done);
    const left = done.omitted?.length ? ` ${done.omitted.length === 1 ? "One line was" : `${done.omitted.length} kinds of line were`} not read; see the History.` : "";
    void vscode.window.showInformationMessage(`Read ${count(done.entries ?? 0, "narrative entry", "narrative entries")} into the plot.${left}`);
    return done;
  });
  command("debrief.annotationFormOpen", () => annotationForm.open);

  // The time window, for agents, keyboard macros and tests: saved as when the analyst lets go of it.
  command("debrief.setTimeWindow", async (window?: TimeRange) => {
    if (!window || !session.current) return report("Open a plot first.");
    const problem = timeProblem({ current: window.start, range: window });
    if (problem) return report(problem);
    const time = session.time;
    const current = time ? Math.min(Date.parse(window.end), Math.max(Date.parse(window.start), Date.parse(time.current))) : Date.parse(window.start);
    session.setTime({ current: new Date(current).toISOString(), range: window }, "command");
    return report(await saveWindow(window));
  });
  // --- The Tote (CAP-06): from the outline's menu, the Command Palette, agents and keyboard macros ---
  /** Tracks named by a command: ids, an outline node (with the others selected beside it), or the selection. */
  const toteTargets = (target?: string | string[] | Target, others?: unknown): string[] => {
    const many = Array.isArray(others) ? featureIdsOf(others as never) : [];
    const ids = typeof target === "string" ? [target] : Array.isArray(target) ? target : many.length ? many : targets(target);
    return ids.filter((id) => trackById(id));
  };
  const chooseTote = async (change: (tote: ToteChoice) => ToteChoice): Promise<string | undefined> => {
    if (!session.current) return report("Open a plot first.");
    const problem = await toteView.choose(change(toteView.choice()));
    if (!problem) void vscode.commands.executeCommand(`${TOTE_VIEW}.focus`, { preserveFocus: true });
    return report(problem);
  };
  command("debrief.tote.setPrimary", async (target?: string | Target, others?: unknown) => {
    const ids = toteTargets(target, others);
    if (ids.length !== 1) return report("Select one track to be the Tote's primary.");
    return chooseTote((tote) => withPrimary(tote, ids[0]));
  });
  command("debrief.tote.add", async (target?: string | string[] | Target, others?: unknown) => {
    const ids = toteTargets(target, others);
    if (!ids.length) return report("Select the tracks to add to the Tote.");
    return chooseTote((tote) => withSecondaries(tote, ids));
  });
  command("debrief.tote.remove", async (target?: string | string[] | Target, others?: unknown) => {
    const ids = toteTargets(target, others);
    if (!ids.length) return report("Select the tracks to remove from the Tote.");
    return chooseTote((tote) => ids.reduce((t, id) => (t.primary === id ? withPrimary(t, undefined) : withoutSecondary(t, id)), tote));
  });
  // The whole choice at once, for agents, keyboard macros and tests: saved as from the Tote view.
  command("debrief.setTote", async (tote?: ToteChoice) => {
    if (!tote || typeof tote !== "object") return report("Give the Tote's primary and secondaries.");
    const choice = withMapLines(withSecondaries(withPrimary({ measure_group: tote.measure_group }, tote.primary ?? undefined), tote.secondaries ?? []), tote.map_lines !== false);
    return chooseTote(() => choice);
  });

  // How tracks outside the window are drawn, for agents, keyboard macros and tests: saved as from the time controller.
  command("debrief.setContextTracks", async (contextTracks?: ContextTracksEnum) => {
    if (!session.current) return report("Open a plot first.");
    if (!contextTracks || !["visible", "faint", "hidden"].includes(contextTracks)) return report("Choose visible, faint or hidden.");
    return report(resync(await saveContext(contextTracks)));
  });
  // The Time view's title menu: the same choice, the plot's current one checked.
  for (const choice of ["visible", "faint", "hidden"] as const) {
    command(`debrief.contextTracks.${choice}`, () => vscode.commands.executeCommand("debrief.setContextTracks", choice));
  }
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
    form.show(tool, session.selectedFeatures().map((f) => f.properties.name), timeRangeOf(), session.time?.current);
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

  // The remembered choice of how imported tracks are plotted: kept in the analyst's configuration
  // (debrief-config), shown in Settings as debrief.trackImportMode; never in a catalogue or a plot.
  const rememberedMode = (): TrackImportMode => {
    try {
      return trackImportMode(loadConfig(configFile));
    } catch {
      return "ask";
    }
  };
  const rememberMode = async (mode: TrackImportMode) => {
    updateConfig((c) => withTrackImportMode(c, mode), configFile);
    const setting = vscode.workspace.getConfiguration("debrief");
    if (setting.get<string>("trackImportMode") !== mode) await setting.update("trackImportMode", mode, vscode.ConfigurationTarget.Global);
  };
  // Settings and the configuration agree: what the configuration holds is shown in Settings, and a change in Settings is kept there.
  void (async () => {
    const setting = vscode.workspace.getConfiguration("debrief");
    const held = rememberedMode();
    if (setting.get<string>("trackImportMode", "ask") !== held) await setting.update("trackImportMode", held, vscode.ConfigurationTarget.Global);
  })();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("debrief.trackImportMode")) return;
      const mode = vscode.workspace.getConfiguration("debrief").get<TrackImportMode>("trackImportMode", "ask");
      if (["ask", "otg", "dr"].includes(mode) && mode !== rememberedMode()) updateConfig((c) => withTrackImportMode(c, mode), configFile);
    }),
  );
  command("debrief.askTrackImportMode", async () => {
    await rememberMode("ask");
    void vscode.window.showInformationMessage("Debrief will ask, for each track imported, whether it is plotted over the ground (OTG) or by dead reckoning (DR).");
  });
  command("debrief.trackImportMode", () => rememberedMode());
  /** How each track of a REP file is plotted: asked, one track at a time, unless a choice is remembered. Undefined if the analyst stopped. */
  async function askModes(file: string): Promise<{ modes: Record<string, PlottingMode>; remembered: boolean } | undefined> {
    const tracks = (await service!.repTracks(file)).tracks;
    return chooseModes(
      tracks,
      rememberedMode(),
      (track, index, count) => askMode(modeQuestion(track, index, count)),
      (mode) => rememberMode(mode),
    );
  }
  /**
   * One track's question, as legacy Debrief asked it: over the ground or by dead reckoning, and apart from that choice
   * a box to tick, "Use this choice for future track imports". A Quick Pick has no check box, so the box is the list's
   * last line: choosing it ticks or clears it and the list stays open; choosing OTG or DR answers. So one list, used
   * the same by keyboard, mouse or screen reader (which reads on or off), and one question per track, not two.
   */
  function askMode(title: string): Promise<ModeChoice | undefined> {
    type Item = vscode.QuickPickItem & { mode?: PlottingMode; toggle?: true };
    const quick = vscode.window.createQuickPick<Item>();
    let remember = false;
    const options: Item[] = modeChoices();
    const box = (): Item => ({ ...rememberItem(remember), toggle: true, alwaysShow: true });
    const show = (active?: Item) => {
      const toggle = box();
      quick.items = [...options, { label: "", kind: vscode.QuickPickItemKind.Separator }, toggle];
      quick.activeItems = [active === undefined ? toggle : active];
    };
    quick.title = title;
    quick.placeholder = "Over the ground, as logged, or dead reckoned from course and speed";
    quick.ignoreFocusOut = true;
    show(options[0]);
    return new Promise((resolve) => {
      quick.onDidAccept(() => {
        const item = quick.selectedItems[0] ?? quick.activeItems[0];
        if (item?.toggle) {
          remember = !remember;
          show();
        } else if (item?.mode) {
          resolve({ mode: item.mode, remember });
          quick.hide();
        }
      });
      quick.onDidHide(() => {
        resolve(undefined);
        quick.dispose();
      });
      quick.show();
    });
  }
  // Import a REP or .dpf file. Given { store, path, modes } (agents and tests), it asks nothing.
  command("debrief.importRep", async (node?: { view?: { store: { id: string } } }, given?: { store?: string; path?: string; modes?: string | Record<string, PlottingMode> }) => {
    if (!needService()) return;
    const writable = knownStores(configFile).stores.filter((s) => !s.read_only);
    if (!writable.length) {
      void vscode.window.showWarningMessage("Add or create a catalogue first; imported plots go into a catalogue.");
      return;
    }
    let storeId = given?.store ?? node?.view?.store.id;
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
    const files = given?.path
      ? [vscode.Uri.file(given.path)]
      : await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { "Plot files": ["rep", "REP", "dpf", "DPF"], "REP files": ["rep", "REP"], "Legacy plot files": ["dpf", "DPF"] },
        });
    if (!files?.length) return;
    try {
      // How each track is plotted (CAP-01): a legacy plot says; a REP file's tracks are asked about.
      let options: { modes?: string | Record<string, PlottingMode>; remembered?: string } = {};
      if (given?.modes) options = { modes: given.modes };
      else if (!/\.dpf$/i.test(files[0].fsPath)) {
        const asked = await askModes(files[0].fsPath);
        if (!asked) {
          void vscode.window.showInformationMessage("Nothing was imported.");
          return;
        }
        options = { modes: asked.modes, ...(asked.remembered && { remembered: REMEMBERED_IN_VSCODE }) };
      }
      let report;
      try {
        report = await service!.importFile(storeId, files[0].fsPath, agent, false, options);
      } catch (error) {
        if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
        if (!(await confirmNewerSchema((error as Error).message))) return;
        report = await service!.importFile(storeId, files[0].fsPath, agent, true, options);
      }
      catalogues.refresh();
      const parts = [count(report.tracks.length, "track"), count(report.fixes, "fix", "fixes")];
      if (report.annotations) parts.push(count(report.annotations, "annotation"));
      if (report.narrative_entries) parts.push(count(report.narrative_entries, "narrative note"));
      // A remembered choice is said, with how to change it (CAP-01).
      const remembered = options.remembered ? ` ${report.notes?.at(-1) ?? ""}` : "";
      const summary = `Imported ${parts.join(", ")}.${remembered}`;
      // Nothing is dropped silently (EXT-14): say what was not imported.
      if (given) {
        // Agents and tests: said, not asked about, and what happened returned.
        void vscode.window.showInformationMessage(summary);
        return { item: report.item, notes: report.notes ?? [], omitted: report.omitted };
      }
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

  /**
   * Add a plot file received from a colleague: one .geojson file holding the plot,
   * its view and its whole history (decision 13 Oct). Its history comes with it, so
   * undo, redo and going back to a step work on what the sender did; one more step
   * records where it came from. A file whose history fails its checksums is refused.
   * For tests and agents, the catalogue and the file may be given.
   */
  command("debrief.addPlotFile", async (node?: { view?: { store: { id: string } } }, given?: string) => {
    if (!needService()) return { problem: "Adding a plot file needs the tool service." };
    const writable = knownStores(configFile).stores.filter((s) => !s.read_only);
    if (!writable.length) {
      void vscode.window.showWarningMessage("Add or create a catalogue first; a plot file is added to a catalogue.");
      return { problem: "no catalogue" };
    }
    let storeId = node?.view?.store.id;
    if (!storeId) {
      const picked =
        writable.length === 1
          ? { id: writable[0].id }
          : await vscode.window.showQuickPick(
              writable.map((s) => ({ label: s.title, description: s.location, id: s.id })),
              { placeHolder: "Add the plot file to which catalogue?" },
            );
      storeId = picked?.id;
    }
    if (!storeId) return undefined;
    let file = given;
    if (!file) {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Add plot file",
        filters: { "Debrief plot files": ["geojson", "json"] },
      });
      file = files?.[0]?.fsPath;
    }
    if (!file) return undefined;
    try {
      let added;
      try {
        added = await service!.addPlotFile(storeId, file, agent);
      } catch (error) {
        if ((error as ServiceError).code !== NEWER_SCHEMA) throw error;
        if (!(await confirmNewerSchema((error as Error).message))) return undefined;
        added = await service!.addPlotFile(storeId, file, agent, true);
      }
      catalogues.refresh();
      const message = `Added ${added.title} with its history: ${count(added.steps, "step")}, undo and redo included.`;
      if (given) {
        void vscode.window.showInformationMessage(message);
      } else {
        void vscode.window.showInformationMessage(message, "Open plot").then((choice) => {
          if (choice === "Open plot") void vscode.commands.executeCommand("debrief.openPlot", storeId, added.item);
        });
      }
      return { item: added.item };
    } catch (error) {
      void vscode.window.showErrorMessage((error as Error).message);
      return { problem: (error as Error).message };
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
    timeControllerShowing: () => timeView.showing,
    toteShowing: () => toteView.showing,
    timelineShowing: () => timeline.showing,
    mapNarrative: () => map.narrative,
    tote: () => toteView.last,
    toteLatency: () => toteView.latency(),
    mapContext: () => map.context,
    mapTote: () => map.tote,
    viewChecks: () => viewChecks,
    ...(context.extensionMode === vscode.ExtensionMode.Test && { fromMap: (message: unknown) => map.receive(message) }),
  };
}

export function deactivate(): void {}
