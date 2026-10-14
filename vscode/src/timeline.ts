/**
 * The Timeline (CAP-05): a plot's time-only annotations, such as narrative
 * notes and periods of interest, and the comments on tracks' fixes (EXT-14),
 * in time order. Choosing one moves current time to it. Kept free of VS Code so it can be tested, and shared with the
 * playground.
 */
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { describeTimes } from "./format.js";
import { isFeature, isHidden } from "./hidden.js";

export interface TimelineEntry {
  id: string;
  name: string;
  /** The first line of its text, if it has text other than its name. */
  text?: string;
  /** Epoch milliseconds: its time, or the start of its period. */
  start: number;
  end: number;
  /** Its time or period, as the formatting service writes it. */
  when: string;
  hidden: boolean;
}

/** The id of the Timeline's entry for a comment on a track's fix. */
export const fixCommentId = (trackId: string, time: string) => `fix:${trackId}:${time}`;

/** The plot's time-only annotations (no position, a time or a period) and comments on fixes, earliest first. */
export function timelineEntries(plot: DebriefFeatureCollection): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const feature of plot.features) {
    if (isFeature(feature) && feature.properties.kind === "track") {
      // A comment on a fix is read with the narrative, at its fix's time.
      for (const mark of feature.properties.fix_marks ?? []) {
        const text = mark.comment?.split("\n").find((line) => line.trim())?.trim();
        if (!text) continue;
        const at = Date.parse(mark.time);
        entries.push({ id: fixCommentId(feature.id, mark.time), name: `${feature.properties.name} fix`, text, start: at, end: at, when: describeTimes(mark.time), hidden: isHidden(feature) });
      }
      continue;
    }
    if (!isFeature(feature) || feature.properties.kind !== "annotation" || feature.geometry) continue;
    const props = feature.properties;
    const start = props.time_range?.start ?? props.time ?? undefined;
    if (!start || props.furniture) continue;
    const end = props.time_range?.end ?? start;
    const firstLine = props.text?.split("\n").find((line) => line.trim())?.trim();
    entries.push({
      id: feature.id,
      name: props.name,
      ...(firstLine && firstLine !== props.name && { text: firstLine }),
      start: Date.parse(start),
      end: Date.parse(end),
      when: describeTimes(start, end === start ? undefined : end),
      hidden: isHidden(feature),
    });
  }
  // Stable: entries at the same time keep the plot's order.
  return entries.sort((a, b) => a.start - b.start);
}

/** The entry current time is at: the last to start at or before it. -1 if none has yet. */
export function currentEntry(entries: TimelineEntry[], currentMs: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (entries[middle].start <= currentMs) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}
