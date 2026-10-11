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
import type { SharedState, SharedStateChange, TimeState, Viewport } from "@debrief/schemas";
import type { OpenedPlot } from "./catalogue.js";

type Feature = OpenedPlot["plot"]["features"][number];

const WORLD: Viewport = { bbox: [-180, -90, 180, 90] };

/** Why a time cannot be current time, or undefined if it can. */
export function timeProblem(time: TimeState): string | undefined {
  const [start, end, current] = [time.range.start, time.range.end, time.current].map(Date.parse);
  if ([start, end, current].some(Number.isNaN)) return "Times must be UTC timestamps.";
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
  private readonly events = new EventEmitter();
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

  /** Any change to shared state: selection, time or viewport. origin names who set it. */
  onState(listener: (change: SharedStateChange, origin: string) => void): () => void {
    this.events.on("state", listener);
    return () => this.events.off("state", listener);
  }

  setPlot(opened: OpenedPlot | undefined, keepSelection = false): void {
    this.current = opened;
    const ids = new Set(opened?.plot.features.map((f) => f.id) ?? []);
    const selection = keepSelection ? this.selection.filter((id) => ids.has(id)) : [];
    this.selection = selection;
    this.time = opened ? this.timeFor(opened, keepSelection ? this.time : undefined) : undefined;
    if (!keepSelection) this.viewport = undefined; // the map fits the new plot and reports it
    this.events.emit("plot", opened);
    this.events.emit("selection", this.selection, "plot");
    this.events.emit("state", { selection: this.selectionState(), ...(this.time && { time: this.time }) }, "plot");
  }

  /** The plot's period, keeping current time where it was if it still falls inside. */
  private timeFor(opened: OpenedPlot, previous?: TimeState): TimeState | undefined {
    const props = opened.item.properties;
    const start = props.start_datetime ?? props.datetime ?? undefined;
    const end = props.end_datetime ?? props.datetime ?? undefined;
    if (!start || !end) return undefined;
    const keep = previous && previous.current >= start && previous.current <= end;
    return { current: keep ? previous.current : start, range: { start, end } };
  }

  /** Set the selection. origin names the view that changed it, so it need not redraw. */
  select(ids: string[], origin: string): void {
    const known = new Set(this.current?.plot.features.map((f) => f.id) ?? []);
    const next = [...new Set(ids)].filter((id) => known.has(id));
    if (next.length === this.selection.length && next.every((id, i) => id === this.selection[i])) return;
    this.selection = next;
    this.events.emit("selection", next, origin);
    this.events.emit("state", { selection: this.selectionState() }, origin);
  }

  /** Set current time. Returns why it was refused, if it was. */
  setTime(time: TimeState, origin: string): string | undefined {
    const problem = timeProblem(time);
    if (problem) return problem;
    if (this.time && this.time.current === time.current && this.time.range.start === time.range.start && this.time.range.end === time.range.end) {
      return undefined;
    }
    this.time = time;
    this.events.emit("state", { time }, origin);
    return undefined;
  }

  /** Set the viewport. Returns why it was refused, if it was. */
  setViewport(viewport: Viewport, origin: string): string | undefined {
    const problem = viewportProblem(viewport);
    if (problem) return problem;
    if (this.viewport && this.viewport.bbox.every((x, i) => x === viewport.bbox[i])) return undefined;
    this.viewport = viewport;
    this.events.emit("state", { viewport }, origin);
    return undefined;
  }

  /** Apply a change to some or all of shared state, all or nothing. Returns why it was refused. */
  apply(change: SharedStateChange, origin: string): string | undefined {
    if (!this.current) return "Open a plot first.";
    const problem = (change.time && timeProblem(change.time)) || (change.viewport && viewportProblem(change.viewport));
    if (problem) return problem;
    if (change.selection) this.select(change.selection.feature_ids, origin);
    if (change.time) this.setTime(change.time, origin);
    if (change.viewport) this.setViewport(change.viewport, origin);
    return undefined;
  }

  /** The whole shared state, as tools and extensions read it; none without a plot. */
  state(): SharedState | undefined {
    if (!this.current || !this.time) return undefined;
    const bbox = this.current.item.bbox;
    return {
      time: this.time,
      selection: this.selectionState(),
      viewport: this.viewport ?? (bbox?.length === 4 ? { bbox: bbox as Viewport["bbox"] } : WORLD),
    };
  }

  private selectionState() {
    return { plot: this.current?.item.id ?? "", feature_ids: this.selection };
  }

  selectedFeatures(): Feature[] {
    const byId = new Map((this.current?.plot.features ?? []).map((f) => [f.id, f]));
    return this.selection.map((id) => byId.get(id)!).filter(Boolean);
  }
}
