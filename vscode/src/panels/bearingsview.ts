/**
 * The bearing view, in the Debrief sidebar (CAP-21, CAP-22; product owner, 24 Oct 2026): a
 * sensor's cuts in a list a TMA solution's period is chosen from, the first guess, and a
 * solution's bearings and residuals after legacy Debrief's Stacked Dots. A webview, the
 * same component the playground docks as a panel (webview/tmacontrol.ts).
 *
 * The cuts and the residuals come from the tool service (debrief/sensors, debrief/
 * tma_residuals) whenever the plot or the choice changes; while a solution is dragged on
 * the map, the map's preview is passed on (tma_preview) and the view works the residuals
 * out again itself, exact again from Python once the drag's step is saved (NFR-04).
 *
 * Which sensor and which solution the view shows is the analyst's, in this view only:
 * selecting a solution on the map or in the Outline shows it; selecting a sensor, one of
 * its cuts or its track lists its cuts. Never saved, never a step.
 */
import * as vscode from "vscode";
import type { TimeState, TmaCut, TmaFocus, TmaRequest, TmaResiduals, TmaView } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import type { Session } from "../session.js";
import { startup } from "../startup.js";
import { webviewHtml } from "./html.js";
import { cutColours, cutRowsOf, sensorOfSelection, solutionOfSelection, tmaSensorRows, tmaSolutionRows, type ListedCut } from "../../webview/tma.js";

export const BEARINGS_VIEW = "debrief.bearings";

export interface BearingsAsk {
  /** A sensor's cuts, as debrief/sensors lists them. */
  cuts(sensorId: string): Promise<ListedCut[] | undefined>;
  /** A solution's residuals (debrief/tma_residuals). */
  residuals(solutionId: string): Promise<TmaResiduals | undefined>;
}

export interface BearingsAct {
  create(request: TmaRequest): Promise<{ problem?: string; feature?: string }>;
  guess(request: TmaRequest): void;
  exclude(solutionId: string, cutIds: string[], excluded: boolean): Promise<string | undefined>;
  split(solutionId: string, at: string): Promise<string | undefined>;
  resolve(cutId: string, keep: string): Promise<string | undefined>;
}

export class BearingsView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private ready = false;
  private sensorId?: string;
  private solutionId?: string;
  private asking = 0;
  /** What the view is to choose when next shown, as a command asked (choose). */
  private focus?: TmaFocus;
  /** What the view was last sent, for tests and agents. */
  last?: TmaView;

  constructor(
    private readonly extension: vscode.Uri,
    private readonly session: Session,
    private readonly ask: BearingsAsk,
    private readonly act: BearingsAct,
    private readonly log: (line: string) => void,
  ) {
    session.onPlot((opened) => {
      if (!opened) {
        this.sensorId = this.solutionId = undefined;
        this.last = undefined;
        return this.post({ kind: "show_tma" });
      }
      // A plot read again (a step saved, undone): the same choices, if they are still there.
      const ids = new Set(opened.plot.features.map((f) => f.id));
      if (this.sensorId && !ids.has(this.sensorId)) this.sensorId = undefined;
      if (this.solutionId && !ids.has(this.solutionId)) this.solutionId = undefined;
      void this.refresh();
    });
    session.onSelection((ids) => {
      const plot = this.session.current?.plot;
      if (!plot) return;
      const solution = solutionOfSelection(plot, ids);
      const sensor = sensorOfSelection(plot, ids);
      if (solution && solution !== this.solutionId) {
        this.solutionId = solution;
        void this.refresh();
      } else if (!solution && sensor && (sensor !== this.sensorId || this.solutionId)) {
        this.sensorId = sensor;
        this.solutionId = undefined;
        void this.refresh();
      }
    });
    session.onState((change) => {
      if (change.time) this.post({ kind: "set_time", time: change.time });
    });
  }

  /** Whether the view has loaded, for tests and agents. */
  get showing(): boolean {
    return this.ready && !!this.view;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    startup.mark(BEARINGS_VIEW, "resolve");
    this.view = view;
    this.ready = false;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")] };
    view.webview.html = webviewHtml(view.webview, this.extension, "bearings", "Bearings");
    startup.mark(BEARINGS_VIEW, "html");
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
    view.onDidChangeVisibility(() => view.visible && void this.refresh());
    view.webview.onDidReceiveMessage((raw) => void this.receive(raw));
  }

  /** A message from the view; tests may pass one as if the view had sent it. */
  async receive(raw: unknown): Promise<void> {
    if (startup.fromPage(BEARINGS_VIEW, raw)) return;
    let message;
    try {
      message = checkMessage(raw);
    } catch {
      this.log("webview_message_refused panel=bearings");
      return;
    }
    if (message.kind === "ready") {
      startup.mark(BEARINGS_VIEW, "ready");
      this.ready = true;
      await this.refresh();
      if (this.session.time) this.post({ kind: "set_time", time: this.session.time });
    } else if (message.kind === "tma_chosen") {
      await this.choose(message.feature_id!);
    } else if (message.kind === "tma_create") {
      const done = await this.act.create(message.tma_request!);
      this.post(done.problem ? { kind: "tma_made", message: done.problem } : { kind: "tma_made", ...(done.feature && { feature_id: done.feature }) });
      if (done.feature) {
        this.solutionId = done.feature;
        this.session.select([done.feature], "bearings");
        await this.refresh();
      }
    } else if (message.kind === "tma_guess") {
      this.act.guess(message.tma_request!);
    } else if (message.kind === "tma_exclude") {
      await this.act.exclude(message.feature_id!, message.cut_ids!, message.excluded!);
    } else if (message.kind === "tma_split") {
      await this.act.split(message.feature_id!, message.current_time!);
    } else if (message.kind === "tma_time_asked") {
      this.timeTo(message.current_time!);
    } else if (message.kind === "resolve_asked") {
      await this.act.resolve(message.feature_id!, message.keep!);
    }
  }

  /**
   * Show a sensor's cuts or a solution's residuals, as the analyst chose in the view (or a
   * command); with focus, something chosen there once (a walkthrough's step).
   */
  async choose(featureId: string, focus?: TmaFocus): Promise<void> {
    const plot = this.session.current?.plot;
    const feature = plot?.features.find((f) => f.id === featureId);
    if (!feature) return;
    this.focus = focus;
    if (feature.properties.kind === "sensor") {
      this.sensorId = featureId;
      this.solutionId = undefined;
    } else if (feature.properties.kind === "track") {
      this.solutionId = featureId;
      // The solution shown is selected, so the map shows its handles to drag it.
      this.session.select([featureId], "bearings");
    }
    await this.refresh();
  }

  /** A drag on the map moved a solution (or ended): passed on, for the view to work its residuals out again. */
  preview(featureId: string, preview?: { type: "LineString"; coordinates: number[][] }): void {
    this.post(preview ? { kind: "tma_preview", feature_id: featureId, preview } : { kind: "tma_preview", feature_id: featureId });
  }

  /** Current time to a cut's time: within the window as it is, or a window widened to take it in, shown not saved (CAP-28). */
  private timeTo(at: string): void {
    const range = this.session.time?.range;
    if (!range) return;
    const within = at >= range.start && at <= range.end;
    const time: TimeState = { current: at, range: within ? range : { start: at < range.start ? at : range.start, end: at > range.end ? at : range.end } };
    this.session.setTime(time, "bearings");
  }

  /** Everything the view shows, asked for again. */
  async refresh(): Promise<void> {
    const opened = this.session.current;
    if (!opened || !this.view || !this.ready) return;
    const asked = ++this.asking;
    const plot = opened.plot;
    const sensors = tmaSensorRows(plot);
    const solutions = tmaSolutionRows(plot);
    if (!this.solutionId) this.solutionId = solutionOfSelection(plot, this.session.selection);
    if (!this.sensorId || !sensors.some((s) => s.id === this.sensorId)) this.sensorId = sensorOfSelection(plot, this.session.selection) ?? sensors[0]?.id;
    const sensor = sensors.find((s) => s.id === this.sensorId);
    let cuts: TmaCut[] | undefined;
    let residuals: TmaResiduals | undefined;
    try {
      if (this.solutionId && solutions.some((s) => s.id === this.solutionId)) residuals = await this.ask.residuals(this.solutionId);
      else if (sensor) cuts = cutRowsOf(sensor, (await this.ask.cuts(sensor.id)) ?? [], cutColours(plot));
    } catch (error) {
      this.log(`bearings_failed message_length=${(error as Error).message.length}`);
    }
    if (asked !== this.asking) return; // asked again meanwhile
    // Something a command asked to be chosen, once.
    const focus = this.focus;
    this.focus = undefined;
    const view: TmaView = {
      ...(focus && { focus }),
      plot_id: opened.item.id,
      ...(opened.revision && { read_only: true }),
      sensors,
      ...(sensor && { sensor_id: sensor.id }),
      ...(cuts && { cuts }),
      solutions,
      ...(residuals && this.solutionId && { solution_id: this.solutionId, residuals }),
    };
    this.last = view;
    this.post({ kind: "show_tma", tma: view });
  }

  private post(message: Record<string, unknown>): void {
    if (!this.view || !this.ready) return;
    void this.view.webview.postMessage(checkMessage(message));
    if (message.kind === "show_tma") startup.shown(BEARINGS_VIEW, !!message.tma);
  }
}
