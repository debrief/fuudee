/**
 * What the analyst has open and selected. Selection is shared by the map,
 * the outline and the tools view (SUB-26); Phase 2 makes it shared state that
 * extensions and tools can also read and set (SUB-27).
 */
import { EventEmitter } from "node:events";
import type { OpenedPlot } from "./catalogue.js";

type Feature = OpenedPlot["plot"]["features"][number];

export class Session {
  private readonly events = new EventEmitter();
  current?: OpenedPlot;
  selection: string[] = [];

  onPlot(listener: (opened: OpenedPlot | undefined) => void): () => void {
    this.events.on("plot", listener);
    return () => this.events.off("plot", listener);
  }

  onSelection(listener: (ids: string[], origin: string) => void): () => void {
    this.events.on("selection", listener);
    return () => this.events.off("selection", listener);
  }

  setPlot(opened: OpenedPlot | undefined, keepSelection = false): void {
    this.current = opened;
    const ids = new Set(opened?.plot.features.map((f) => f.id) ?? []);
    const selection = keepSelection ? this.selection.filter((id) => ids.has(id)) : [];
    this.selection = selection;
    this.events.emit("plot", opened);
    this.events.emit("selection", this.selection, "plot");
  }

  /** Set the selection. origin names the view that changed it, so it need not redraw. */
  select(ids: string[], origin: string): void {
    const known = new Set(this.current?.plot.features.map((f) => f.id) ?? []);
    const next = [...new Set(ids)].filter((id) => known.has(id));
    if (next.length === this.selection.length && next.every((id, i) => id === this.selection[i])) return;
    this.selection = next;
    this.events.emit("selection", next, origin);
  }

  selectedFeatures(): Feature[] {
    const byId = new Map((this.current?.plot.features ?? []).map((f) => [f.id, f]));
    return this.selection.map((id) => byId.get(id)!).filter(Boolean);
  }
}
