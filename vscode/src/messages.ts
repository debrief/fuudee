/**
 * Messages to and from webviews are boundary types (CON-08): every message is
 * validated against the schema, and against the members its kind must carry,
 * before it is acted on.
 */
import { DocumentValidationError, validateDocument, type TrackEdit, type WebviewMessage } from "@debrief/schemas";
import table from "../../schemas/vectors/webview-messages.json";
import { timeProblem, viewportProblem } from "./session.js";

const MEMBERS = table.members as Record<string, string[]>;

export function checkMessage(raw: unknown): WebviewMessage {
  const message = validateDocument("webview_message", raw);
  const members = MEMBERS[message.kind] ?? [];
  const needed = members.filter((m) => !m.endsWith("?"));
  const allowed = members.map((m) => m.replace(/\?$/, ""));
  const present = Object.keys(message).filter((k) => k !== "kind");
  const problems = [
    ...needed.filter((m) => !(m in message)).map((m) => `${message.kind} needs ${m}`),
    ...present.filter((m) => !allowed.includes(m)).map((m) => `${message.kind} does not carry ${m}`),
  ];
  // The rules on shared state Python's validation applies too.
  const time = message.time && timeProblem(message.time);
  if (time) problems.push(`time: ${time}`);
  const viewport = message.viewport && viewportProblem(message.viewport);
  if (viewport) problems.push(`viewport: ${viewport}`);
  const range = message.time_range;
  if (range && !(Date.parse(range.start) <= Date.parse(range.end))) problems.push("time_range: time range starts after it ends");
  const saved = message.saved_window;
  if (saved && !(Date.parse(saved.start) <= Date.parse(saved.end))) problems.push("saved_window: time range starts after it ends");
  if (message.track_edit) problems.push(...trackEditProblems(message.track_edit));
  if (problems.length) throw new DocumentValidationError(problems);
  return message;
}

/** The rules on a track moved or rotated by hand that Python's validation applies too (debrief_schemas.documents.track_edit_problems). */
export function trackEditProblems(edit: TrackEdit, where = "track_edit"): string[] {
  const problems: string[] = [];
  const period = edit.period;
  if (period && !(Date.parse(period.start) <= Date.parse(period.end))) problems.push(`${where} period: time range starts after it ends`);
  if (edit.action === "move") {
    if (!edit.distance || !edit.bearing) problems.push(`${where}: a move needs a distance and a bearing`);
    if (edit.distance && edit.distance.value < 0) problems.push(`${where}: a move's distance cannot be negative`);
    if (edit.angle || edit.pivot) problems.push(`${where}: a move has no angle or pivot`);
  } else {
    if (!edit.angle) problems.push(`${where}: a rotation needs an angle`);
    if (edit.distance || edit.bearing) problems.push(`${where}: a rotation has no distance or bearing`);
    const pivot = edit.pivot;
    if (pivot && !(Math.abs(pivot[0]) <= 180 && Math.abs(pivot[1]) <= 90)) problems.push(`${where}: the pivot is not on the globe`);
  }
  return problems;
}
