/**
 * Presentation (SUB-22): the analyst's colours and hidden features, kept
 * beside the plot but outside its history. Changes are undoable through a
 * local history, kept in memory for this VS Code window, and never recorded
 * in provenance. Kept free of VS Code so it can be tested.
 *
 * Presentation is shared: someone else may change it while the analyst works
 * (SUB-28). So a step records, for each feature it touched, the value before
 * and after, and undo puts back only those values on the presentation as it
 * is now, leaving everyone else's changes alone.
 */
import type { DebriefFeatureCollection, Presentation } from "@debrief/schemas";

type Entry = Presentation["features"][number];
export type PresentationField = "colour" | "hidden";
type Value = string | boolean | undefined;

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

/** The plot's features that are hidden on the map, in plot order. */
export function hiddenIds(plot: DebriefFeatureCollection, presentation: Presentation | undefined): string[] {
  return plot.features.filter((f) => isHidden(presentation, f.id)).map((f) => f.id);
}

/** What to tell the analyst on opening a plot with hidden features, if anything. */
export function hiddenNotice(count: number): string | undefined {
  if (!count) return undefined;
  return count === 1
    ? "1 feature of this plot is hidden on the map."
    : `${count} features of this plot are hidden on the map.`;
}

const valueOf = (entry: Entry | undefined, field: PresentationField): Value =>
  field === "colour" ? entry?.colour ?? undefined : entry?.hidden ? true : undefined;

/** A copy with one field of each named feature set; entries that say nothing any more are dropped. */
export function withValues(presentation: Presentation, field: PresentationField, values: Record<string, Value>): Presentation {
  const by = new Map(presentation.features.map((e) => [e.id, { ...e }]));
  for (const [id, value] of Object.entries(values)) {
    const entry: Entry = by.get(id) ?? { id };
    if (field === "colour") entry.colour = (value as string | undefined) ?? undefined;
    else entry.hidden = value ? true : undefined;
    by.set(id, entry);
  }
  const features = [...by.values()]
    .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== null)) as unknown as Entry)
    .filter((e) => e.colour !== undefined || e.hidden);
  return { ...presentation, features };
}

/** A copy with each named feature changed; entries that say nothing any more are dropped. */
export function changed(presentation: Presentation, ids: string[], change: { colour?: string; hidden?: boolean }): Presentation {
  let next = presentation;
  if (change.colour !== undefined) next = withValues(next, "colour", Object.fromEntries(ids.map((id) => [id, change.colour])));
  if (change.hidden !== undefined) next = withValues(next, "hidden", Object.fromEntries(ids.map((id) => [id, change.hidden || undefined])));
  return next;
}

/** One presentation change: for each feature it touched, one field's value before and after. */
export interface PresentationStep {
  plot: string;
  label: string;
  field: PresentationField;
  before: Record<string, Value>;
  after: Record<string, Value>;
}

/** The step a change makes, and the presentation after it. */
export function presentationChange(
  plot: string,
  label: string,
  presentation: Presentation,
  ids: string[],
  change: { colour: string } | { hidden: boolean },
): { step: PresentationStep; next: Presentation } {
  const field: PresentationField = "colour" in change ? "colour" : "hidden";
  const value: Value = "colour" in change ? change.colour : change.hidden || undefined;
  const by = new Map(presentation.features.map((e) => [e.id, e]));
  const before = Object.fromEntries(ids.map((id) => [id, valueOf(by.get(id), field)]));
  const after = Object.fromEntries(ids.map((id) => [id, value]));
  return { step: { plot, label, field, before, after }, next: withValues(presentation, field, after) };
}

/**
 * Undo or redo a step on the presentation as it is now: only the values the
 * step changed are put back, so others' changes since are kept (SUB-28).
 */
export function applyStep(current: Presentation, step: PresentationStep, how: "undo" | "redo"): Presentation {
  return withValues(current, step.field, how === "undo" ? step.before : step.after);
}

/** One thing the analyst did in this window: a change to the plot, or to its presentation. */
export type TimelineEntry = { kind: "data" } | { kind: "presentation"; step: PresentationStep };

/**
 * What the analyst did in this window, per plot, in order, so one Ctrl+Z
 * takes back the latest thing done, whichever kind it was (SUB-21, SUB-22).
 * Kept per plot, so opening another plot and coming back keeps it. Entries
 * move only once the undo or redo has succeeded.
 */
export class UndoTimeline {
  private readonly plots = new Map<string, { done: TimelineEntry[]; undone: TimelineEntry[] }>();

  private of(plot: string) {
    let lists = this.plots.get(plot);
    if (!lists) this.plots.set(plot, (lists = { done: [], undone: [] }));
    return lists;
  }

  /** A new change: it can be undone, and nothing undone before it can be redone. */
  record(plot: string, entry: TimelineEntry): void {
    const lists = this.of(plot);
    lists.done.push(entry);
    lists.undone = [];
  }

  /** What Ctrl+Z takes back next; none means the plot's own history (a change from before this window). */
  nextUndo(plot: string): TimelineEntry | undefined {
    return this.plots.get(plot)?.done.at(-1);
  }

  /** What Ctrl+Y brings back next; none means there is nothing to redo. */
  nextRedo(plot: string): TimelineEntry | undefined {
    return this.plots.get(plot)?.undone.at(-1);
  }

  /** An undo succeeded. entry is what it took back. */
  undone(plot: string, entry: TimelineEntry): void {
    const lists = this.of(plot);
    if (lists.done.at(-1) === entry) lists.done.pop();
    lists.undone.push(entry);
  }

  /** A redo succeeded. */
  redone(plot: string, entry: TimelineEntry): void {
    const lists = this.of(plot);
    if (lists.undone.at(-1) === entry) lists.undone.pop();
    lists.done.push(entry);
  }

  /** The plot's presentation steps, oldest first, and whether each is undone. */
  presentationSteps(plot: string): { step: PresentationStep; undone: boolean }[] {
    const lists = this.plots.get(plot);
    if (!lists) return [];
    const steps = (entries: TimelineEntry[], undone: boolean) =>
      entries.flatMap((e) => (e.kind === "presentation" ? [{ step: e.step, undone }] : []));
    return [...steps(lists.done, false), ...steps([...lists.undone].reverse(), true)];
  }
}
