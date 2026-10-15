/**
 * The Timeline (CAP-05, CAP-20): one list in time order of a plot's narrative entries,
 * its time-only annotations (notes and periods of interest) and the comments on tracks'
 * fixes (EXT-14). Choosing one moves current time to it. Narrative from every source is
 * on one Zulu time axis (decision, product owner, 15 Oct 2026: the Timeline is where the
 * narrative is read; there is no separate narrative view).
 *
 * One order, the narrative's (debrief_stac.narrative, shared vectors
 * schemas/vectors/narrative-order.json): by time; then by source ignoring case, capitals
 * first between sources differing only in case; then the plot's order, so a log's own
 * order at one second is kept and two platforms' entries at one second always come in
 * the same order whichever was imported first. An annotation's source is its name; a fix
 * comment's, its track's.
 *
 * Kept free of VS Code, so it is tested and shared with the playground.
 */
import type { DebriefFeatureCollection, TimelineEntry, ToteTrack } from "@debrief/schemas";
import { isFeature, isHidden } from "./hidden.js";

/** The id of the Timeline's entry for a comment on a track's fix. */
export const fixCommentId = (trackId: string, time: string) => `fix:${trackId}:${time}`;

/** What an entry's type column says for rows that are not narrative. */
export const NOTE_TYPE = "Note";
export const PERIOD_TYPE = "Period";
export const FIX_TYPE = "Fix";

/** The Timeline's order of two entries, as Python's narrative.order_key. */
export function compareEntries(a: { ms: number; source: string; index: number }, b: { ms: number; source: string; index: number }): number {
  if (a.ms !== b.ms) return a.ms - b.ms;
  const la = a.source.toLowerCase();
  const lb = b.source.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  return a.index - b.index;
}

/** Text without spaces at either end, or undefined if there is none. */
const said = (text: string | null | undefined) => text?.trim() || undefined;

/** Every entry of the plot's Timeline, in its order. */
export function timelineEntries(plot: DebriefFeatureCollection): TimelineEntry[] {
  const colours = new Map<string, string>();
  const hiddenTracks = new Set<string>();
  for (const f of plot.features) {
    if (f.properties.kind !== "track") continue;
    if (f.properties.style?.colour) colours.set(f.id, f.properties.style.colour);
    if (isHidden(f)) hiddenTracks.add(f.id);
  }
  const keyed: { entry: TimelineEntry; ms: number; source: string; index: number }[] = [];
  const add = (entry: TimelineEntry) => keyed.push({ entry, ms: Date.parse(entry.start), source: entry.source, index: keyed.length });
  for (const feature of plot.features) {
    const props = feature.properties;
    if (props.kind === "narrative") {
      const colour = props.track_id ? colours.get(props.track_id) : undefined;
      add({
        id: feature.id,
        kind: "narrative",
        start: props.time,
        source: props.source,
        ...(props.entry_type && { entry_type: props.entry_type }),
        text: props.text,
        ...(props.track_id && { track: props.track_id }),
        ...(colour && { colour }),
      });
    } else if (props.kind === "track") {
      // A comment on a fix is read with the narrative, at its fix's time.
      for (const mark of props.fix_marks ?? []) {
        const text = said(mark.comment);
        if (!text) continue;
        const colour = colours.get(feature.id);
        add({
          id: fixCommentId(feature.id, mark.time),
          kind: "fix_comment",
          start: mark.time,
          source: props.name,
          entry_type: FIX_TYPE,
          text,
          track: feature.id,
          ...(colour && { colour }),
          ...(hiddenTracks.has(feature.id) && { hidden: true }),
        });
      }
    } else if (isFeature(feature) && props.kind === "annotation" && !feature.geometry && !props.furniture) {
      const start = props.time_range?.start ?? props.time ?? undefined;
      if (!start) continue;
      const end = props.time_range?.end;
      const text = said(props.text);
      add({
        id: feature.id,
        kind: "annotation",
        start,
        ...(end && end !== start && { end }),
        source: props.name,
        entry_type: props.time_range ? PERIOD_TYPE : NOTE_TYPE,
        ...(text && text !== props.name && { text }),
        ...(isHidden(feature) && { hidden: true }),
      });
    }
  }
  return keyed.sort(compareEntries).map((k) => k.entry);
}

/** The tracks a narrative entry can belong to, in plot order. */
export function timelineTracks(plot: DebriefFeatureCollection): ToteTrack[] {
  return plot.features.flatMap((f) =>
    f.properties.kind === "track" ? [{ id: f.id, name: f.properties.name, ...(f.properties.style?.colour && { colour: f.properties.style.colour }) }] : [],
  );
}

/** How long a narrative entry stays beside its track on the map, in plot time, unless a later one replaces it. */
export const NARRATIVE_ON_MAP_MS = 10 * 60_000;

/**
 * What the map shows of the narrative: the latest entry at or before current time that
 * belongs to a track, beside that track's marker, for ten minutes of plot time at most,
 * so an entry long past does not linger. Built once per plot; asked at each time.
 */
export class NarrativeOnMap {
  private readonly linked: TimelineEntry[];
  private readonly starts: number[];

  constructor(entries: readonly TimelineEntry[]) {
    this.linked = entries.filter((e) => e.kind === "narrative" && e.track);
    this.starts = this.linked.map((e) => Date.parse(e.start));
  }

  at(currentMs: number): TimelineEntry | undefined {
    const index = currentEntry(this.starts, currentMs);
    if (index < 0 || currentMs - this.starts[index] > NARRATIVE_ON_MAP_MS) return undefined;
    return this.linked[index];
  }
}

/** The entry current time is at: the last to start at or before it, in a list ordered by start. -1 if none has yet. */
export function currentEntry(starts: readonly number[], currentMs: number): number {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= currentMs) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}
