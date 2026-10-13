/**
 * Hiding (SUB-22): a feature's own hidden property, content like its colour,
 * so hiding and showing are steps in the plot's history (decision 12 Oct).
 * Kept free of VS Code so it can be tested.
 */
import type { DebriefFeatureCollection, PlotView } from "@debrief/schemas";

type Feature = DebriefFeatureCollection["features"][number];

/** A feature the analyst works with: everything but the whole-plot feature (the plot's own details). */
export type PlotFeature = Exclude<Feature, { properties: { kind: "plot" } }>;

export function isFeature(feature: Feature): feature is PlotFeature {
  return feature.properties.kind !== "plot";
}

export function isHidden(feature: Feature | undefined): boolean {
  return !!feature && isFeature(feature) && feature.properties.hidden === true;
}

/** The plot as the map shows it: hidden features and the plot's own details left out. */
export function displayed(plot: DebriefFeatureCollection): DebriefFeatureCollection {
  return { ...plot, features: plot.features.filter((f) => isFeature(f) && !isHidden(f)) };
}

/** The plot's features that are hidden on the map, in plot order. */
export function hiddenIds(plot: DebriefFeatureCollection): string[] {
  return plot.features.filter(isHidden).map((f) => f.id);
}

/** What to tell the analyst on opening a plot with hidden features, if anything. */
export function hiddenNotice(count: number): string | undefined {
  if (!count) return undefined;
  return count === 1
    ? "1 feature of this plot is hidden on the map."
    : `${count} features of this plot are hidden on the map.`;
}

/** The plot's view (its island): the time window, kept in the plot file outside its history. */
export function timeWindowOf(plot: DebriefFeatureCollection): { start: string; end: string } | undefined {
  for (const f of plot.features) {
    if (f.properties.kind === "plot") return f.properties.view?.time_window ?? undefined;
  }
  return undefined;
}

/** How the plot says tracks outside the time window are drawn (its island, CAP-29); undefined means visible. */
export function contextTracksOf(plot: DebriefFeatureCollection): PlotView["context_tracks"] {
  return viewOf(plot)?.context_tracks ?? undefined;
}

/** The plot's whole view (its island), or undefined if it has none. */
export function viewOf(plot: DebriefFeatureCollection): PlotView | undefined {
  for (const f of plot.features) {
    if (f.properties.kind === "plot") return f.properties.view ?? undefined;
  }
  return undefined;
}

/**
 * Put a view read from the service into the plot as held in memory, so the
 * window can be shown without reading the plot's content again. False if the
 * plot has no whole-plot feature to hold it.
 */
export function setViewOf(plot: DebriefFeatureCollection, view: PlotView | null): boolean {
  for (const f of plot.features) {
    if (f.properties.kind !== "plot") continue;
    if (view) f.properties.view = view;
    else delete f.properties.view;
    return true;
  }
  return false;
}
