/**
 * The rules on shared state (SUB-26) that Python's validation applies too, free of VS Code, of
 * Node and of the DOM: the extension's session and both hosts' message checks use them.
 */
import type { TimeState, Viewport } from "@debrief/schemas";

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Why a time cannot be current time, or undefined if it can. */
export function timeProblem(time: TimeState): string | undefined {
  const texts = [time.range.start, time.range.end, time.current];
  if (!texts.every((t) => UTC.test(t))) return "Times must be UTC, written like 1995-12-12T05:00:00.000Z.";
  const [start, end, current] = texts.map(Date.parse);
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
