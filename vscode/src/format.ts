/** Display through the TypeScript formatting service only (SUB-04). */
import { DEFAULT_SETTINGS, formatTime, type FormatSettings } from "@debrief/kernel";

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
