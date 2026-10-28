/**
 * What the analyst has open, and the shared state over it (SUB-26, SUB-27):
 * current time, selection and viewport. The map, the outline, the tools view,
 * other extensions (through the extension's API) and tools (through their
 * context and state_change) all read and set it here.
 *
 * Shared state is view state: it is neither undoable nor recorded in
 * provenance (SUB-22).
 */
import { EventEmitter } from "node:events";
import type { SharedState, SharedStateChange, TimeRange, TimeState, Viewport } from "@debrief/schemas";
import type { OpenedPlot } from "./catalogue.js";
import { contextShown, type ContextTracks } from "../webview/contrast.js";
import { contextTracksOf, isFeature, timeWindowOf, type PlotFeature } from "./hidden.js";

type Feature = PlotFeature;

const WORLD: Viewport = { bbox: [-180, -90, 180, 90] };

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Why a time cannot be current time, or undefined if it can. */
export function timeProblem(time: TimeState): string | undefined {
  const texts = [time.range.start, time.range.end, time.current];
  if (!texts.every((t) => UTC.test(t))) return "Times must be UTC, written like 1995-12-12T05:00:00.000Z.";
  const [start, end, current] = texts.map(Date.parse);
  if (start > end) return "The time range ends before it starts.";
  if (current < start || current > end) return "Current time must be within the time range.";
  return undefined;
}

/** Why a viewport cannot be shown, or undefined if it can. West may exceed east across 180°. */
export function viewportProblem(viewport: Viewport): string | undefined {
  const [west, south, east, north] = viewport.bbox;
  if (![west, east].every((x) => x >= -180 && x <= 180)) return "Viewport longitudes must be within ±180°.";
  if (!(south >= -90 && south <= north && north <= 90)) return "Viewport latitudes must be within ±90°, south below north.";
  return undefined;
}

export class Session {
  /** Each view and panel listens (more than Node's default of ten for "plot" since the Outline's Tools, 27 Oct 2026). */
  private readonly events = new EventEmitter().setMaxListeners(30);

  /** Tell listeners; one that fails (another extension's, say) never stops the rest. */
  private emit(name: string, ...args: unknown[]): void {
    for (const listener of this.events.listeners(name)) {
      try {
        (listener as (...a: unknown[]) => void)(...args);
      } catch (error) {
        console.error(`Debrief: a ${name} listener failed`, error);
      }
    }
  }
  current?: OpenedPlot;
  selection: string[] = [];
  time?: TimeState;
  viewport?: Viewport;

  onPlot(listener: (opened: OpenedPlot | undefined) => void): () => void {
    this.events.on("plot", listener);
    return () => this.events.off("plot", listener);
  }

  onSelection(listener: (ids: string[], origin: string) => void): () => void {
    this.events.on("selection", listener);
    return () => this.events.off("selection", listener);
  }

  /**
   * The plot's view (its island) was saved or read again: the saved window or
   * how context tracks are drawn may have changed, or the analyst's setting
   * for the minimum contrast did.
   */
  onView(listener: () => void): () => void {
    this.events.on("view", listener);
    return () => this.events.off("view", listener);
  }

  viewChanged(): void {
    this.emit("view");
  }

  /** The analyst's setting: faint context tracks are drawn as visible (debrief.map.minimumContextContrast). */
  minimumContextContrast = false;

  /** How the plot says tracks outside the window are drawn; visible if it doesn't say. */
  contextTracks(): ContextTracks {
    return (this.current && contextTracksOf(this.current.plot)) ?? "visible";
  }

  /** How the map draws them: the plot's choice, with the analyst's setting applied. */
  contextShown(): ContextTracks {
    return contextShown(this.contextTracks(), this.minimumContextContrast);
  }

  /** Any change to shared state: selection, time or viewport. origin names who set it. */
  onState(listener: (change: SharedStateChange, origin: string) => void): () => void {
    this.events.on("state", listener);
    return () => this.events.off("state", listener);
  }

  /**
   * Show a plot. Opening the plot already shown (a reload, a reopen, a recovery)
   * keeps selection, current time and viewport; keep carries them to another
   * plot, such as one saved as new from this one.
   */
  setPlot(opened: OpenedPlot | undefined, keep = false): void {
    const same = keep || (!!opened && opened.item.id === this.current?.item.id);
    this.current = opened;
    const ids = new Set(opened?.plot.features.map((f) => f.id) ?? []);
    this.selection = same ? this.selection.filter((id) => ids.has(id)) : [];
    const window = opened ? this.windowOf(opened) : undefined;
    this.time = opened ? this.timeFor(window, same ? this.time : undefined, same ? this.savedWindow : undefined) : undefined;
    this.savedWindow = window;
    if (!same) this.viewport = undefined; // the map fits the new plot and reports it
    this.emit("plot", opened);
    this.emit("selection", this.selection, "plot");
    this.emit("state", { selection: this.selectionState(), ...(this.time && { time: this.time }) }, "plot");
  }

  /** The time window as the plot file last had it, or the plot's period if it has none. */
  savedWindow?: TimeRange;

  /** The plot's whole period, from its catalogue entry: where the time window can go. */
  period(): TimeRange | undefined {
    const props = this.current?.item.properties;
    const start = props?.start_datetime ?? props?.datetime ?? undefined;
    const end = props?.end_datetime ?? props?.datetime ?? undefined;
    return start && end ? { start, end } : undefined;
  }

  /** The plot's time window (its island, SUB-22), or else its period. */
  private windowOf(opened: OpenedPlot): TimeRange | undefined {
    const props = opened.item.properties;
    const window = timeWindowOf(opened.plot);
    const start = window?.start ?? props.start_datetime ?? props.datetime ?? undefined;
    const end = window?.end ?? props.end_datetime ?? props.datetime ?? undefined;
    return start && end ? { start, end } : undefined;
  }

  /**
   * Current time over a plot opened or read again. A plot opened afresh starts
   * at its window's start. Read again with its window as it was, current time
   * and the window shown stay where they were, a window a tool showed (widened
   * or moved, never saved) included, so current time never jumps back. Read
   * again with a window changed elsewhere, the new window is shown, with
   * current time kept inside it.
   */
  private timeFor(window: TimeRange | undefined, previous?: TimeState, saved?: TimeRange): TimeState | undefined {
    if (!window) return previous;
    if (!previous) return { current: window.start, range: window };
    const ms = Date.parse;
    if (!saved || saved.start !== window.start || saved.end !== window.end) {
      const current = Math.min(ms(window.end), Math.max(ms(window.start), ms(previous.current)));
      return { current: new Date(current).toISOString(), range: window };
    }
    return previous;
  }

  /**
   * The time window was saved, or changed elsewhere (SUB-22): show it, keeping
   * current time inside. origin names who changed it.
   */
  windowChanged(window: TimeRange | undefined, origin: string): void {
    const opened = this.current;
    if (!opened) return;
    const shown = window ?? this.period();
    const before = this.savedWindow;
    this.savedWindow = shown;
    if (!shown || (before && before.start === shown.start && before.end === shown.end && this.time?.range.start === shown.start && this.time?.range.end === shown.end)) return;
    const time = this.timeFor(shown, this.time, undefined);
    if (time) this.setTime(time, origin);
  }

  /** Set the selection. origin names the view that changed it, so it need not redraw. */
  select(ids: string[], origin: string): void {
    const known = new Set(this.current?.plot.features.map((f) => f.id) ?? []);
    const next = [...new Set(ids)].filter((id) => known.has(id));
    if (next.length === this.selection.length && next.every((id, i) => id === this.selection[i])) return;
    this.selection = next;
    this.emit("selection", next, origin);
    this.emit("state", { selection: this.selectionState() }, origin);
  }

  /** Set current time. Returns why it was refused, if it was. */
  setTime(time: TimeState, origin: string): string | undefined {
    const problem = timeProblem(time);
    if (problem) return problem;
    if (this.time && this.time.current === time.current && this.time.range.start === time.range.start && this.time.range.end === time.range.end) {
      return undefined;
    }
    this.time = time;
    this.emit("state", { time }, origin);
    return undefined;
  }

  /** Set the viewport. Returns why it was refused, if it was. */
  setViewport(viewport: Viewport, origin: string): string | undefined {
    const problem = viewportProblem(viewport);
    if (problem) return problem;
    if (this.viewport && this.viewport.bbox.every((x, i) => x === viewport.bbox[i])) return undefined;
    this.viewport = viewport;
    this.emit("state", { viewport }, origin);
    return undefined;
  }

  /** Apply a change to some or all of shared state, all or nothing. Returns why it was refused. */
  apply(change: SharedStateChange, origin: string): string | undefined {
    if (!this.current) return "Open a plot first.";
    const problem =
      (change.time && timeProblem(change.time)) ||
      (change.viewport && viewportProblem(change.viewport)) ||
      (change.selection && this.selectionProblem(change.selection));
    if (problem) return problem;
    if (change.selection) this.select(change.selection.feature_ids, origin);
    if (change.time) this.setTime(change.time, origin);
    if (change.viewport) this.setViewport(change.viewport, origin);
    return undefined;
  }

  /** The whole shared state, as tools and extensions read it; none without a plot. A copy. */
  state(): SharedState | undefined {
    if (!this.current || !this.time) return undefined;
    const bbox = this.current.item.bbox;
    return structuredClone({
      time: this.time,
      selection: this.selectionState(),
      viewport: this.viewport ?? (bbox?.length === 4 ? { bbox: bbox as Viewport["bbox"] } : WORLD),
    });
  }

  private selectionProblem(selection: { plot: string; feature_ids: string[] }): string | undefined {
    const plot = this.current!.item.id;
    if (selection.plot && selection.plot !== plot) return `That selection is for ${selection.plot}, not the open plot, ${plot}.`;
    const known = new Set(this.current!.plot.features.map((f) => f.id));
    const unknown = selection.feature_ids.find((id) => !known.has(id));
    return unknown ? `The open plot has no feature ${unknown}.` : undefined;
  }

  private selectionState() {
    return { plot: this.current?.item.id ?? "", feature_ids: this.selection };
  }

  selectedFeatures(): Feature[] {
    const byId = new Map((this.current?.plot.features ?? []).filter(isFeature).map((f) => [f.id, f]));
    return this.selection.map((id) => byId.get(id)!).filter(Boolean);
  }
}
