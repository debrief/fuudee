/** Display through the TypeScript formatting service only (SUB-04). */
import { DEFAULT_SETTINGS, formatTime, type FormatSettings } from "@debrief/kernel";
import type { ToolResult } from "@debrief/schemas";

export const settings: FormatSettings = DEFAULT_SETTINGS;

const parse = (text: string) => Date.parse(text);
const dated: FormatSettings = { ...settings, time_style: "date_time" };

/** "12 Dec 1995 05:00:00Z – 06:28:00Z", or a single time. */
export function describePeriod(start?: string, end?: string): string {
  if (!start) return "";
  if (!end || end === start) return formatTime(parse(start), dated);
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  return `${formatTime(parse(start), dated)} – ${formatTime(parse(end), sameDay ? settings : dated)}`;
}

/** Times only, for features inside an open plot whose date is already shown: "05:00:00Z – 06:28:00Z". */
export function describeTimes(start?: string, end?: string): string {
  if (!start) return "";
  if (!end || end === start) return formatTime(parse(start), settings);
  return `${formatTime(parse(start), settings)} – ${formatTime(parse(end), settings)}`;
}

export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const KIND_WORDS: Record<string, [string, string]> = {
  track: ["track", "tracks"],
  annotation: ["annotation", "annotations"],
  sensor_observations: ["set of sensor observations", "sets of sensor observations"],
  sensor: ["sensor", "sensors"],
  sensor_cut: ["sensor cut", "sensor cuts"],
};

function byKind(features: { properties: { kind: string } }[]): string {
  const counts = new Map<string, number>();
  for (const f of features) counts.set(f.properties.kind, (counts.get(f.properties.kind) ?? 0) + 1);
  return [...counts]
    .map(([kind, n]) => {
      const [one, many] = KIND_WORDS[kind] ?? [kind, `${kind}s`];
      return count(n, one, many);
    })
    .join(" and ");
}

/** What a tool's result did to the plot, in glossary terms: "added 4 annotations". */
export function describeChanges(result?: ToolResult): string {
  if (!result) return "";
  const parts = [
    result.new_features?.length ? `added ${byKind(result.new_features)}` : "",
    result.modified_features?.length ? `changed ${byKind(result.modified_features)}` : "",
    result.deleted_feature_ids?.length ? `deleted ${count(result.deleted_feature_ids.length, "feature")}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}

/**
 * What to tell the analyst after a tool ran: what it did to the plot and,
 * when it moved current time outside the saved window, that too (CAP-28).
 * Nothing if there is nothing to say.
 */
export function describeToolRun(title: string, result: ToolResult | undefined, outsideSavedWindow: boolean): string | undefined {
  const parts = [describeChanges(result), outsideSavedWindow ? "moved current time (outside your saved window)" : ""].filter(Boolean);
  return parts.length ? `${title} ${parts.join(" and ")}.` : undefined;
}
