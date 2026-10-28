/**
 * The bearing view, in VS Code's panel below the editor (CAP-21, CAP-22; product owner, 25 Oct
 * 2026): a TMA solution's bearings and residuals after legacy Debrief's Stacked Dots, or a
 * sensor's bearings. A webview, the same component the playground docks as a panel
 * (webview/tmacontrol.ts).
 *
 * It follows the Outline's selection (product owner, 27 Oct 2026; outlinemodel.ts bearingsFor):
 * a solution, one of its legs or positions shows the solution (a position ringed); a sensor, or
 * some of its cuts, the sensor's coverage; something unrelated keeps what is shown. It has no
 * lists of its own: the Outline lists the cuts, legs and positions. The cuts and the residuals
 * come from the tool service (debrief/sensors, debrief/tma_residuals) whenever the plot or the
 * choice changes; while a solution is dragged on the map, the map's preview is passed on
 * (tma_preview) and the view works the residuals out again itself, exact again from Python once
 * the drag's step is saved (NFR-04). What it shows is the analyst's, in this view only: never
 * saved, never a step.
 *
 * It can be popped out (product owner, 28 Oct 2026): opened as an editor tab, a WebviewPanel,
 * and moved into a window of its own for a second monitor, as legacy Debrief's Stacked Dots
 * could be (bearingshost.ts). This controller drives whichever surface is live, the panel's
 * WebviewView or the popped-out WebviewPanel, never both: one live instance at a time, the
 * panel showing a placeholder meanwhile. Everything it says goes to the live surface and only
 * what that surface's page says is acted on, so the popped-out view is linked exactly as the
 * panel's is. It needs nothing of VS Code's at run time, so the unit tests drive it with stand-ins.
 */
import type { AmbiguityResolution, TimeState, TmaCut, TmaFocus, TmaRequest, TmaResiduals, TmaView } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import type { Session } from "../session.js";
import { startup } from "../startup.js";
import { coverageOf, cutColours, cutRowsOf, FocusOnce, ownshipOf, tmaSensorRows, tmaSolutionRows, type ListedCut } from "../../webview/tma.js";
import { bearingsFor, bearingsTitle, outlineIndex, type BearingsShown, type OutlinePick } from "../../webview/outlinemodel.js";
import { PANES, type PanesShown } from "../../webview/stackeddots.js";

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
  /** A box drawn with Select bearings on: the sides boxed kept, one step (debrief/resolve_ambiguity). */
  resolveCuts(resolution: AmbiguityResolution): Promise<string | undefined>;
  /** A dot clicked: its cut, or the solution at its fix (index), selected in the Outline and on the map. */
  select(featureId: string, fix?: number): void;
  /** The analyst's error cut-off, degrees: kept in their Debrief configuration. */
  cutOff(degrees: number): void;
  /** The analyst's error cut-off, as their configuration holds it. */
  readonly errorCutOff: number;
}

/** Where Bearings shows: the panel below the editor, or popped out into an editor tab or window of its own. */
export type BearingsWhere = "panel" | "window";

/** A surface Bearings' page shows in: the panel's WebviewView, or the popped-out WebviewPanel. */
export interface BearingsSurface {
  readonly where: BearingsWhere;
  /** Post a message to its page; whether the page was there to take it. */
  post(message: unknown): PromiseLike<boolean>;
  /** Whether it is in sight now. */
  readonly visible: boolean;
  /** Bring it into sight; with preserveFocus, the keyboard left where it was. */
  show(preserveFocus: boolean): void;
}

/** What a message last posted to the page was, and where it went: for tests and agents. */
export interface BearingsPosted {
  where: BearingsWhere;
  delivered: boolean;
  message: Record<string, unknown>;
}

export class BearingsView {
  /** The panel's surface, once VS Code made it; the popped-out one, while open. */
  private panelSurface?: BearingsSurface;
  private windowSurface?: BearingsSurface;
  /** Whether the live surface's page said it was ready. */
  private ready = false;
  /** Which panes the page last said show (tma_panes): the next page opened shows the same. */
  panes?: PanesShown;
  /** The last message of each kind posted, and where: for tests and agents. */
  readonly posted = new Map<string, BearingsPosted>();
  /** Opens the panel's view when there is no surface yet (bearingshost.ts sets it). */
  open: (preserveFocus: boolean) => Promise<void> = async () => {};
  /** What the view shows: what the Outline's selection last chose. */
  private shownNow?: BearingsShown;
  private asking = 0;
  /** What the view is to choose when next shown (a position ringed, the first guess's form): once. */
  private readonly focus = new FocusOnce();
  /** What the view was last sent, for tests and agents. */
  last?: TmaView;
  /** The plot as the view last drew it, CSS pixels (tma_plot_drawn): for tests. */
  plot?: { height: number; panes: number[] };

  constructor(
    private readonly session: Session,
    private readonly ask: BearingsAsk,
    private readonly act: BearingsAct,
    private readonly log: (line: string) => void,
  ) {
    session.onPlot((opened) => {
      if (!opened) {
        this.shownNow = undefined;
        this.last = undefined;
        return this.post({ kind: "show_tma" });
      }
      void this.refresh();
    });
    session.onState((change) => {
      if (change.time) this.post({ kind: "set_time", time: change.time });
    });
  }

  /** The solution Bearings shows, if one: the Tools' Leave out and Count in act on it. */
  get solutionShown(): string | undefined {
    return this.shownNow && "solution" in this.shownNow ? this.shownNow.solution : undefined;
  }

  /** The surface Bearings is live on: the popped-out one while open, else the panel's. One at a time. */
  get live(): BearingsSurface | undefined {
    return this.windowSurface ?? this.panelSurface;
  }

  /** Where Bearings is live, if anywhere yet. */
  get where(): BearingsWhere | undefined {
    return this.live?.where;
  }

  /** Whether Bearings is popped out: the panel then shows only a placeholder. */
  get poppedOut(): boolean {
    return !!this.windowSurface;
  }

  /**
   * A surface made: the panel's view (VS Code resolved it), or the popped-out one. A popped-out
   * surface is live at once, the panel's left to its placeholder; there is never more than one
   * popped out (bearingshost.ts reuses it). The live surface's page loads afresh and says when
   * it is ready.
   */
  attach(surface: BearingsSurface): void {
    if (surface.where === "window") this.windowSurface = surface;
    else this.panelSurface = surface;
    if (this.live === surface) this.ready = false;
  }

  /** A surface gone (closed, disposed): if it was live, the other is, once its page is ready again. */
  detach(surface: BearingsSurface): void {
    const before = this.live;
    if (this.windowSurface === surface) this.windowSurface = undefined;
    if (this.panelSurface === surface) this.panelSurface = undefined;
    if (this.live !== before) this.ready = false;
  }

  /** Whether the view has loaded, for tests and agents. */
  get showing(): boolean {
    return this.ready && !!this.live;
  }

  /** Whether the view is in sight now (in the panel below the editor, or popped out), for tests and agents. */
  get visible(): boolean {
    return !!this.live?.visible;
  }

  /**
   * The view brought into sight where it is live: popped out, its tab or window; else in the
   * panel below the editor. With preserveFocus (the default), the keyboard left where it was: a
   * TMA walkthrough step's button that opens a form (Move…, Shear…) shows Bearings too, since
   * the step is read there (product owner, 25 Oct 2026). Show bearings moves the keyboard there.
   */
  async reveal(preserveFocus = true): Promise<void> {
    const live = this.live;
    if (live) {
      if (!live.visible || !preserveFocus) live.show(preserveFocus);
      return;
    }
    await this.open(preserveFocus);
  }

  /** A surface came into sight: if live, its page reads the plot afresh. */
  shown(surface: BearingsSurface): void {
    if (surface === this.live && surface.visible) void this.refresh();
  }

  /**
   * A message from the live surface's page; tests may pass one as if the view had sent it. A
   * message from a surface that is not live (a page about to be replaced) is not acted on.
   */
  async receive(raw: unknown, from?: BearingsSurface): Promise<void> {
    if (startup.fromPage(BEARINGS_VIEW, raw)) return;
    if (from && from !== this.live) {
      this.log(`webview_message_refused panel=bearings where=${from.where} not_live`);
      return;
    }
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
    } else if (message.kind === "tma_create") {
      const done = await this.act.create(message.tma_request!);
      this.post(done.problem ? { kind: "tma_made", message: done.problem } : { kind: "tma_made", ...(done.feature && { feature_id: done.feature }) });
      if (done.feature) {
        this.shownNow = { solution: done.feature };
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
    } else if (message.kind === "tma_resolve" && message.resolution) {
      await this.act.resolveCuts(message.resolution);
    } else if (message.kind === "tma_select") {
      // A dot clicked: its cut, or the solution at a fix (that position, in the Outline), selected; current time to it.
      const id = message.feature_id!;
      const plot = this.session.current?.plot;
      const s = plot && id === this.solutionShown ? outlineIndex(plot).solutions.get(id) : undefined;
      const fix = s ? s.times.indexOf(Date.parse(message.current_time!)) : -1;
      this.timeTo(message.current_time!);
      this.act.select(id, fix >= 0 ? fix : undefined);
    } else if (message.kind === "tma_cut_off") {
      this.act.cutOff(message.error_cut_off!);
    } else if (message.kind === "tma_plot_drawn") {
      this.plot = { height: message.plot_height!, panes: message.pane_widths ?? [] };
    } else if (message.kind === "tma_panes") {
      const shown = new Set(message.panes_shown);
      this.panes = Object.fromEntries(PANES.map((p) => [p, shown.has(p)])) as PanesShown;
    }
  }

  /**
   * Follow the Outline's selection (product owner, 27 Oct 2026): a solution for it, a leg or a
   * position of it (the position ringed); a sensor's coverage for it or some of its cuts (the last
   * ringed), cuts of the solution's sensors keeping it shown; something unrelated, no change.
   */
  follow(picks: readonly OutlinePick[]): void {
    const plot = this.session.current?.plot;
    if (!plot) return;
    const index = outlineIndex(plot);
    const next = bearingsFor(index, picks, this.solutionShown);
    if (!next) return;
    let ring: string | undefined;
    if ("solution" in next && next.fix !== undefined) ring = new Date(index.solutions.get(next.solution)!.times[next.fix]).toISOString();
    else {
      const cut = [...picks].reverse().find((p) => p.kind === "cut");
      if (cut && cut.kind === "cut") ring = cut.cut.properties.time;
    }
    if (ring) this.focus.ask({ cut_time: ring });
    this.shownNow = next;
    // Asked again even when the same: the plot read afresh, as choosing a solution again did (the panel's H2).
    void this.refresh();
  }

  /**
   * Show a sensor's coverage or a solution, as a command asks (Show bearings); with focus,
   * something chosen there once (a cut ringed, the first guess's form for a period or cuts).
   */
  async choose(featureId: string, focus?: TmaFocus): Promise<void> {
    const plot = this.session.current?.plot;
    const feature = plot?.features.find((f) => f.id === featureId);
    if (!feature) return;
    this.focus.ask(focus);
    if (feature.properties.kind === "sensor") this.shownNow = { sensor: featureId };
    else if (feature.properties.kind === "sensor_cut") this.shownNow = { sensor: feature.properties.sensor_id };
    else if (feature.properties.kind === "track" && feature.properties.tma) this.shownNow = { solution: featureId };
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
    if (!opened || !this.live || !this.ready) return;
    const asked = ++this.asking;
    const plot = opened.plot;
    const index = outlineIndex(plot);
    // Something no longer in the plot (undone, deleted): nothing shown.
    if (this.shownNow && ("solution" in this.shownNow ? !index.solutions.has(this.shownNow.solution) : !index.sensors.has(this.shownNow.sensor))) this.shownNow = undefined;
    const sensors = tmaSensorRows(plot);
    const solutions = tmaSolutionRows(plot);
    const solutionId = this.solutionShown;
    const sensor = this.shownNow && "sensor" in this.shownNow ? sensors.find((s) => s.id === (this.shownNow as { sensor: string }).sensor) : undefined;
    let cuts: TmaCut[] | undefined;
    let residuals: TmaResiduals | undefined;
    try {
      if (solutionId) residuals = await this.ask.residuals(solutionId);
      else if (sensor) cuts = cutRowsOf(sensor, (await this.ask.cuts(sensor.id)) ?? [], cutColours(plot));
    } catch (error) {
      this.log(`bearings_failed message_length=${(error as Error).message.length}`);
    }
    if (asked !== this.asking) return; // asked again meanwhile
    // Something asked to be chosen, once.
    const focus = this.focus.take();
    const view: TmaView = {
      ...(focus && { focus }),
      plot_id: opened.item.id,
      ...(opened.revision && { read_only: true }),
      title: bearingsTitle(index, this.shownNow),
      sensors,
      ...(sensor && { sensor_id: sensor.id }),
      ...(cuts && { cuts }),
      ...(sensor && { ownship: ownshipOf(plot, sensor.id) }),
      solutions,
      ...(residuals && solutionId && { solution_id: solutionId, residuals, ...this.around(solutionId, residuals) }),
      error_cut_off: this.act.errorCutOff,
    };
    this.last = view;
    this.post({ kind: "show_tma", tma: view });
  }

  /** What the plot shows around a solution: its sensors' whole coverage, and ownship's courses over it (product owner, 25 Oct 2026). */
  private around(solutionId: string, residuals: TmaResiduals): Pick<TmaView, "coverage" | "ownship"> {
    const plot = this.session.current!.plot;
    const coverage = coverageOf(plot, solutionId);
    const times = [...coverage.map((c) => c.time), ...residuals.rows.map((r) => r.time)].sort();
    const period = times.length ? { start: times[0], end: times[times.length - 1] } : undefined;
    return { coverage, ownship: ownshipOf(plot, solutionId, period) };
  }

  private post(message: Record<string, unknown>): void {
    const live = this.live;
    if (!live || !this.ready) return;
    const checked = checkMessage(message);
    const kind = message.kind as string;
    void Promise.resolve(live.post(checked)).then(
      (delivered) => this.posted.set(kind, { where: live.where, delivered, message }),
      () => this.posted.set(kind, { where: live.where, delivered: false, message }),
    );
    if (kind === "show_tma") startup.shown(BEARINGS_VIEW, !!message.tma);
  }
}


