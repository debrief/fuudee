/**
 * Debrief for VS Code: catalogues, map, outline and tools (Phase 1 tracer).
 *
 * Everything that changes data goes through the Python tool service, where
 * domain logic lives (PRN-03); the extension reads catalogues to display them.
 */
import { userInfo } from "node:os";
import * as vscode from "vscode";
import type { AnnotationSpec, ContextTracksEnum, ParameterValue, PlotView, SharedState, SharedStateChange, TimeRange, ToolDeclaration, TrackEdit } from "@debrief/schemas";
import { formatBearing, formatPosition, parsePosition, POSITION_EXAMPLE, UNIT_LABELS } from "@debrief/kernel";
import { defaultPivotIndex, describeDistance, describeTurn, periodIndices, readBearing, readDistance, readTurn } from "../webview/trackedit.js";
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
import { CONFLICT, NEWER_SCHEMA, ServiceError, ToolService, type Agent, type AnnotationChange, type CallOutcome, type OpenedView, type ToolListing, type TrackChange } from "./service.js";
import { HistoryProvider } from "./views/history.js";
import { DiagnosticLog, hashed, logKey, serviceLine, toolRunLine, type ToolOutcome } from "./diagnostics.js";
import { hiddenIds, hiddenNotice, isFeature, setViewOf, timeWindowOf, viewOf, type PlotFeature } from "./hidden.js";
import { specOfFeature } from "../webview/annotationlook.js";
import { TRACK_COLOURS } from "../webview/palette.js";
import { Session, timeProblem } from "./session.js";
import { CataloguesProvider } from "./views/catalogues.js";
import { featureIdsOf, OutlineProvider } from "./views/outline.js";
import { TimelineProvider } from "./views/timeline.js";
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
  /** How many times the plot's view has been read again after a change on disk, for tests. */
  viewChecks: () => number;
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
  const timeline = new TimelineProvider(session);
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
    (timeline.view = vscode.window.createTreeView("debrief.timeline", { treeDataProvider: timeline })),
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
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TIME_VIEW, timeView, { webviewOptions: { retainContextWhenHidden: true } }),
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

  // --- Tracks: moved, rotated, split and merged by hand (CAP-01, CAP-02) ----------------
  /**
   * Move, rotate, split or merge tracks: one step in the plot's history each, named by
   * its note ("BLUE ONE moved 1.20 nmi 045.0°T"), and undone by Ctrl+Z like any other.
   * A change made elsewhere since the plot was opened is never overwritten (SUB-28).
   * Returns the problem, if any, and the tracks the change made.
   */
  const changeTrack = (change: TrackChange) =>
    serially(() =>
      ourChange(async (): Promise<{ problem?: string; feature?: string; features?: string[] }> => {
        const opened = session.current;
        if (!opened) return { problem: "Open a plot first." };
        if (!service || !opened.base) return { problem: "Changing tracks needs Debrief's tool service. Run 'Debrief: Restart tool service'." };
        const save = (allow = false) => service!.changeTrack(opened.store.id, opened.item.id, opened.base!, agent, change, allow);
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
        return { problem, feature: answer.feature, features: answer.features };
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
    if (!trackById(featureId) || !edit) return { problem: report("Select a track to move or rotate.") };
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
  // "Merge selected tracks": the tracks selected, or the ids given, joined in time order.
  command("debrief.mergeTracks", async (target?: string[] | Target, others?: readonly unknown[] | { name?: string }) => {
    const nodes = Array.isArray(others) ? featureIdsOf(others as never) : [];
    const ids = Array.isArray(target) ? target : nodes.length ? nodes : session.selection;
    const tracks = ids.filter((id) => trackById(id));
    if (tracks.length < 2) return { problem: report("Select two or more tracks to merge.") };
    const name = others && !Array.isArray(others) ? (others as { name?: string }).name : undefined;
    const done = await changeTrack({ kind: "merge", features: tracks, ...(name && { name }) });
    if (!done.problem && done.feature) session.select([done.feature], "command");
    return trackDone(done);
  });

  // The Timeline: choosing an entry moves current time to it. Outside the window shown, the
  // window widens or moves to take it in, shown but never saved, as for a tool's time (CAP-28).
  command("debrief.goToTime", (id?: string) => {
    const entry = timeline.entries.find((e) => e.id === id);
    const range = session.time?.range;
    if (!entry || !range) return report("Choose an entry in the Timeline.");
    const at = new Date(entry.start).toISOString();
    const within = entry.start >= Date.parse(range.start) && entry.start <= Date.parse(range.end);
    const time = { current: at, range: within ? range : { start: at < range.start ? at : range.start, end: at > range.end ? at : range.end } };
    applyToolState({ time }, "timeline", false);
    return undefined;
  });
  command("debrief.timelineEntries", () => ({ entries: timeline.entries.map((e) => e.id), current: timeline.currentId }));
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
    mapContext: () => map.context,
    viewChecks: () => viewChecks,
    ...(context.extensionMode === vscode.ExtensionMode.Test && { fromMap: (message: unknown) => map.receive(message) }),
  };
}

export function deactivate(): void {}
