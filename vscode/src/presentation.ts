/**
 * Presentation (SUB-22): the analyst's colours and hidden features, kept
 * beside the plot but outside its history. Changes are undoable through a
 * local history, kept in memory for this window, and never recorded in
 * provenance. Kept free of VS Code so it can be tested.
 */
import type { DebriefFeatureCollection, Presentation } from "@debrief/schemas";

type Entry = Presentation["features"][number];

export function emptyPresentation(schemaVersion: string): Presentation {
  return { schema_version: schemaVersion, features: [] };
}

/** The plot as the map shows it: hidden features left out, colours as the analyst set them. */
export function displayed(plot: DebriefFeatureCollection, presentation: Presentation): DebriefFeatureCollection {
  const by = new Map(presentation.features.map((e) => [e.id, e]));
  if (!by.size) return plot;
  return {
    ...plot,
    features: plot.features
      .filter((f) => !by.get(f.id)?.hidden)
      .map((f) => {
        const colour = by.get(f.id)?.colour;
        if (!colour || f.properties.kind !== "track") return f;
        const style = { ...(f.properties.style ?? {}), colour };
        return { ...f, properties: { ...f.properties, style } } as typeof f;
      }),
  };
}

export function isHidden(presentation: Presentation | undefined, id: string): boolean {
  return !!presentation?.features.find((e) => e.id === id)?.hidden;
}

/** A copy with each named feature changed; entries that say nothing any more are dropped. */
export function changed(presentation: Presentation, ids: string[], change: { colour?: string; hidden?: boolean }): Presentation {
  const by = new Map(presentation.features.map((e) => [e.id, { ...e }]));
  for (const id of ids) {
    const entry: Entry = by.get(id) ?? { id };
    if (change.colour !== undefined) entry.colour = change.colour;
    if (change.hidden !== undefined) entry.hidden = change.hidden || undefined;
    by.set(id, entry);
  }
  const features = [...by.values()]
    .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== null)) as unknown as Entry)
    .filter((e) => e.colour !== undefined || e.hidden);
  return { ...presentation, features };
}

export interface PresentationStep {
  plot: string;
  label: string;
  before: Presentation;
  after: Presentation;
}

/** The local history of presentation changes, one plot at a time (SUB-22). */
export class LocalHistory {
  private done: PresentationStep[] = [];
  private undone: PresentationStep[] = [];

  record(step: PresentationStep): void {
    this.done.push(step);
    this.undone = [];
  }

  /** Steps for one plot, oldest first, and whether each is undone. */
  steps(plot: string): { step: PresentationStep; undone: boolean }[] {
    return [
      ...this.done.filter((s) => s.plot === plot).map((step) => ({ step, undone: false })),
      ...[...this.undone].reverse().filter((s) => s.plot === plot).map((step) => ({ step, undone: true })),
    ];
  }

  canUndo(plot: string): boolean {
    return this.done.at(-1)?.plot === plot;
  }

  canRedo(plot: string): boolean {
    return this.undone.at(-1)?.plot === plot;
  }

  undo(): PresentationStep | undefined {
    const step = this.done.pop();
    if (step) this.undone.push(step);
    return step;
  }

  redo(): PresentationStep | undefined {
    const step = this.undone.pop();
    if (step) this.done.push(step);
    return step;
  }

  forget(plot: string): void {
    this.done = this.done.filter((s) => s.plot !== plot);
    this.undone = this.undone.filter((s) => s.plot !== plot);
  }
}
