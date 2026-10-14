/**
 * Cleaning tracks and marking fixes (CAP-01, EXT-14), the parts free of Leaflet
 * and VS Code so they can be tested and shared: the map, the VS Code commands
 * and the playground all use them.
 *
 * - A fix's own colour, label and comment are the track's marked fixes
 *   (fix_marks), each found by its time; of fixes sharing a time, the first's.
 * - Jumps are found by the tool service (debrief/find_jumps), shown to the
 *   analyst as a list and ringed on the map, and removed only when the analyst
 *   says which (debrief/remove_jumps), as one step.
 * - Smoothing is previewed (debrief/preview_smoothing), the track drawn as it
 *   would be beside it with how far fixes would move, then applied
 *   (debrief/smooth_track) as one step.
 */
import { convert, DEFAULT_SETTINGS, formatBearing, formatPosition, formatQuantity, formatTime, UNIT_LABELS, type FormatSettings } from "@debrief/kernel";
import type { FixMark } from "@debrief/schemas";

/** What of a track these need: its name, fixes, times and series. */
export interface FixTrack {
  id: string;
  geometry: { coordinates: number[][] };
  properties: {
    name: string;
    times: string[];
    fix_marks?: FixMark[] | null;
    courses?: { unit: string; values: number[] } | null;
    speeds?: { unit: string; values: number[] } | null;
  };
}

/** Each marked fix by its index: the first fix at the mark's time. */
export function marksByIndex(track: FixTrack): Map<number, FixMark> {
  const marks = track.properties.fix_marks ?? [];
  if (!marks.length) return new Map();
  const first = new Map<string, number>();
  track.properties.times.forEach((t, i) => {
    if (!first.has(t)) first.set(t, i);
  });
  const out = new Map<number, FixMark>();
  for (const mark of marks) {
    const i = first.get(mark.time);
    if (i !== undefined) out.set(i, mark);
  }
  return out;
}

/** The mark on the fix at a time, if it has one. */
export const markAt = (track: FixTrack, time: string): FixMark | undefined => track.properties.fix_marks?.find((m) => m.time === time);

/** A fix as the analyst reads it: its time, position, course and speed. */
export function describeFix(track: FixTrack, index: number, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const [lon, lat] = track.geometry.coordinates[index];
  const props = track.properties;
  const parts = [formatTime(Date.parse(props.times[index]), settings), formatPosition({ latitude: lat, longitude: lon }, settings)];
  const course = props.courses?.values[index];
  if (course !== undefined && props.courses) parts.push(formatBearing({ value: course, unit: props.courses.unit }, settings));
  const speed = props.speeds?.values[index];
  if (speed !== undefined && props.speeds) parts.push(formatQuantity({ value: speed, unit: props.speeds.unit }, settings));
  return parts.join("  ·  ");
}

/** The small tag beside the name of a track plotted by dead reckoning, in the outline and on the map (decision, product owner, 14 Oct 2026); its line is drawn as any track's. */
export const DR_TAG = "DR";
export const isDeadReckoned = (props: { plotting_mode?: string | null }): boolean => props.plotting_mode === "dr";
/** A track's name as the map labels it: "RED ONE (DR)" when it is plotted by dead reckoning. */
export const trackLabel = (props: { name: string; plotting_mode?: string | null }): string => (isDeadReckoned(props) ? `${props.name} (${DR_TAG})` : props.name);

/** A mark in a few words: "own colour · labelled 'Turn' · Wheel over". */
export function describeMark(mark: FixMark | undefined, colourName?: (colour: string) => string | undefined): string {
  if (!mark) return "";
  return [
    mark.colour ? `coloured ${colourName?.(mark.colour) ?? "its own colour"}` : "",
    mark.label ? `labelled '${mark.label}'` : "",
    mark.comment ? firstLine(mark.comment) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const firstLine = (text: string) => text.split("\n").find((l) => l.trim())?.trim() ?? "";

/** The fix list: one row for each fix, in time order, saying any mark it has. */
export function fixRows(track: FixTrack, settings: FormatSettings = DEFAULT_SETTINGS, colourName?: (colour: string) => string | undefined): { index: number; time: string; label: string; description: string; mark: string }[] {
  const marks = marksByIndex(track);
  return track.properties.times.map((time, index) => {
    const [when, ...rest] = describeFix(track, index, settings).split("  ·  ");
    return { index, time, label: when, description: rest.join("  ·  "), mark: describeMark(marks.get(index), colourName) };
  });
}

// --- Jumps ---------------------------------------------------------------------------

/** A jump as the tool service returns it: speed is null for a fix at the same time as the one before, somewhere else. */
export interface Jump {
  time: string;
  position: number[];
  speed: { value: number; unit: string } | null;
  since: string;
}

/** A jump as one row of the list the analyst confirms: when, where, and how fast the track would have gone. */
export function describeJump(jump: Jump, settings: FormatSettings = DEFAULT_SETTINGS): { label: string; description: string } {
  const [lon, lat] = jump.position;
  const how = jump.speed
    ? `${formatQuantity(convert(jump.speed, settings.speed_unit), settings)} to reach from ${formatTime(Date.parse(jump.since), settings)}`
    : `at the same time as the fix before, somewhere else`;
  return { label: formatTime(Date.parse(jump.time), settings), description: `${formatPosition({ latitude: lat, longitude: lon }, settings)} · ${how}` };
}

/** What was found, in a line: "BLUE ONE: 3 jumps found, each faster than 30.0 kn to reach". */
export function jumpsFound(name: string, jumps: number, threshold: { value: number; unit: string }, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const speed = formatQuantity(convert(threshold, settings.speed_unit), settings);
  if (!jumps) return `${name}: no jumps found faster than ${speed}.`;
  return `${name}: ${jumps} jump${jumps === 1 ? "" : "s"} found, each faster than ${speed} to reach. Check them on the map and in the list.`;
}

const SPEEDS = ["[kn_i]", "m/s", "km/h"];
const SPEED_UNITS: Record<string, string> = { kn: "[kn_i]", kt: "[kn_i]", kts: "[kn_i]", knots: "[kn_i]", "[kn_i]": "[kn_i]", "m/s": "m/s", "km/h": "km/h", kph: "km/h" };

/** A jump threshold, a speed as typed: "30", "30 kn", "15 m/s"; a bare number is in the analyst's speed unit. */
export function readThreshold(text: string, settings: FormatSettings = DEFAULT_SETTINGS): { value: number; unit: string } | { problem: string } {
  const match = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*([a-z/[\]_]*)\s*$/i.exec(text);
  const say = `Type a speed, such as 30 ${UNIT_LABELS[settings.speed_unit] ?? settings.speed_unit}; the units are ${SPEEDS.map((u) => UNIT_LABELS[u]).join(", ")}.`;
  if (!match) return { problem: say };
  const unit = match[2] ? SPEED_UNITS[match[2].toLowerCase()] : settings.speed_unit;
  if (!unit) return { problem: say };
  const value = Number(match[1]);
  if (!(value > 0)) return { problem: "Type a speed above zero: fixes faster than it to reach are jumps." };
  return { value, unit };
}

// --- Smoothing -----------------------------------------------------------------------

/** How many fixes to average each fix with, as typed: an odd number from 3 to 99. */
export function readWindow(text: string): number | { problem: string } {
  const match = /^\s*(\d+)\s*(?:fix|fixes)?\s*$/i.exec(text);
  const value = match ? Number(match[1]) : NaN;
  if (!match || value < 3 || value > 99 || value % 2 === 0) {
    return { problem: "Type an odd number of fixes from 3 to 99 (3, 5, 7 and so on): each fix is averaged with that many, itself in the middle." };
  }
  return value;
}

/** What a smoothing window means, said back: "each fix averaged with the 2 either side of it". */
export function describeWindow(window: number): string {
  const side = (window - 1) / 2;
  return `each fix averaged with the ${side} either side of it`;
}

/** The note the map shows over a preview: "BLUE ONE smoothed over 5 fixes: 28 fixes moved; the most a fix moved: 0.03 nmi, at 09:31:00Z". */
export function smoothingNote(name: string, window: number, summary: string): string {
  return `${name} smoothed over ${window} fixes, if applied: ${summary.charAt(0).toLowerCase()}${summary.slice(1)}.`;
}

/** A length in metres in the analyst's unit, or in metres when too small for the decimals shown. */
export function describeMetres(metres: number, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const text = formatQuantity(convert({ value: metres, unit: "m" }, settings.length_unit), settings);
  return /[1-9]/.test(text.split(" ")[0]) ? text : `${Math.round(metres)} m`;
}
