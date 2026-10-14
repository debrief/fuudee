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

/** The rules on a track changed by hand that Python's validation applies too (debrief_schemas.documents.track_edit_problems). */
export function trackEditProblems(edit: TrackEdit, where = "track_edit"): string[] {
  const problems: string[] = [];
  const period = edit.period;
  if (period && !(Date.parse(period.start) <= Date.parse(period.end))) problems.push(`${where} period: time range starts after it ends`);
  const given = new Set((["distance", "bearing", "angle", "pivot", "anchor", "course", "speed", "fix_time", "position", "plotting_mode"] as const).filter((name) => edit[name] != null));
  const any = (...names: string[]) => names.some((n) => given.has(n as never));
  const all = (...names: string[]) => names.every((n) => given.has(n as never));
  if (edit.action !== "move_fix" && any("fix_time", "position")) problems.push(`${where}: only a single fix moved has a fix time or a position`);
  if (edit.action !== "set_plotting_mode" && any("plotting_mode")) problems.push(`${where}: only a change of plotting mode has a plotting mode`);
  if (edit.discard_dr_changes != null && !(edit.action === "set_plotting_mode" && edit.plotting_mode === "otg")) problems.push(`${where}: only plotting a track over the ground discards changes made while it was plotted by dead reckoning`);
  if (edit.action === "move_fix") {
    if (!edit.fix_time) problems.push(`${where}: moving a fix needs the fix's time`);
    const byDrag = all("distance", "bearing") && !any("position");
    const byPlace = any("position") && !any("distance", "bearing");
    if (!(byDrag || byPlace)) problems.push(`${where}: moving a fix needs either a distance and a bearing, or a position`);
    if (any("angle", "pivot", "anchor", "course", "speed") || period) problems.push(`${where}: moving a fix has no period, angle, pivot, anchor or speed`);
    const position = edit.position;
    if (position && !(Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90)) problems.push(`${where}: the position is not on the globe`);
  } else if (edit.action === "set_plotting_mode") {
    if (!edit.plotting_mode) problems.push(`${where}: a change of plotting mode needs the mode: otg or dr`);
    if (given.size > (edit.plotting_mode ? 1 : 0) || period) problems.push(`${where}: a change of plotting mode has only the mode`);
  } else if (edit.action === "move") {
    if (!edit.distance || !edit.bearing) problems.push(`${where}: a move needs a distance and a bearing`);
    if (any("angle", "pivot")) problems.push(`${where}: a move has no angle or pivot`);
    if (any("anchor", "course", "speed")) problems.push(`${where}: a move has no anchor, course or speed`);
  } else if (edit.action === "rotate") {
    if (!edit.angle) problems.push(`${where}: a rotation needs an angle`);
    if (any("distance", "bearing")) problems.push(`${where}: a rotation has no distance or bearing`);
    if (any("anchor", "course", "speed")) problems.push(`${where}: a rotation has no anchor, course or speed`);
    const pivot = edit.pivot;
    if (pivot && !(Math.abs(pivot[0]) <= 180 && Math.abs(pivot[1]) <= 90)) problems.push(`${where}: the pivot is not on the globe`);
  } else if (edit.action === "shear") {
    if (!edit.anchor) problems.push(`${where}: a shear needs the end it holds (anchor)`);
    const byDrag = all("distance", "bearing") && !any("course", "speed");
    const byLeg = all("course", "speed") && !any("distance", "bearing");
    if (!(byDrag || byLeg)) problems.push(`${where}: a shear needs either a distance and a bearing, or a course and a speed`);
    if (any("angle", "pivot")) problems.push(`${where}: a shear has no angle or pivot`);
  } else {
    if (!edit.anchor) problems.push(`${where}: a stretch needs the end it holds (anchor)`);
    if (!edit.speed) problems.push(`${where}: a stretch needs a speed`);
    else if (edit.speed.value <= 0) problems.push(`${where}: a stretch's speed must be more than nothing`);
    if (any("distance", "bearing", "course", "angle", "pivot")) problems.push(`${where}: a stretch has only an anchor and a speed`);
  }
  if (edit.distance && edit.distance.value < 0) problems.push(`${where}: the distance cannot be negative`);
  if (edit.speed && edit.speed.value < 0) problems.push(`${where}: the speed cannot be negative`);
  return problems;
}
