/**
 * Messages to and from webviews are boundary types (CON-08): every message is validated against
 * the schema, where each kind is a class of its own naming the members it carries and needs, and
 * against the rules the schema cannot express, before it is acted on, in both hosts (PAR-13).
 * Free of VS Code, of Node and of the DOM: the schema's validator is given, as VS Code's extension
 * host compiles it (src/messages.ts) and the playground has it compiled when it is built (its page
 * may not compile code, play/messagecheck.ts).
 *
 * The rules are Python's (debrief_schemas.documents._webview_message_problems), in the same words;
 * a test runs both over the schema's invalid/semantic message fixtures and asserts they refuse the
 * same ones. Python's alone also checks a plot or a tool result a message carries in full.
 */
import type { TmaRequest, ToteView, TrackEdit, WebviewMessage } from "@debrief/schemas";
import { timeProblem, viewportProblem } from "./stateproblems.js";

/** The type of a member of whichever kinds carry it. */
type Member<N extends string> = WebviewMessage extends infer T ? (T extends unknown ? (N extends keyof T ? T[N] : never) : never) : never;
/** A member of a message, of whichever kind; undefined (or null) for a kind that does not carry it. */
const member = <N extends string>(message: WebviewMessage, name: N) => (message as unknown as Partial<Record<N, Member<N>>>)[name];

/**
 * Check a message with the schema's validator given (which throws if it is not one, its kind's
 * members included), then against the rules the schema cannot express; refuse throws with the problems.
 */
export function checkMessageWith(validate: (raw: unknown) => WebviewMessage, raw: unknown, refuse: (problems: string[]) => never): WebviewMessage {
  const message = validate(raw);
  const problems: string[] = [];
  // The rules on shared state Python's validation applies too.
  const time = member(message, "time");
  const timeWrong = time && timeProblem(time);
  if (timeWrong) problems.push(`time: ${timeWrong}`);
  const viewport = member(message, "viewport");
  const viewportWrong = viewport && viewportProblem(viewport);
  if (viewportWrong) problems.push(`viewport: ${viewportWrong}`);
  const range = member(message, "time_range");
  if (range && !(Date.parse(range.start) <= Date.parse(range.end))) problems.push("time_range: time range starts after it ends");
  const saved = member(message, "saved_window");
  if (saved && !(Date.parse(saved.start) <= Date.parse(saved.end))) problems.push("saved_window: time range starts after it ends");
  const edit = member(message, "track_edit");
  if (edit) problems.push(...trackEditProblems(edit));
  const tote = member(message, "tote_view");
  if (tote) problems.push(...toteViewProblems(tote));
  if (message.kind === "resolve_asked" && message.keep !== "bearing" && message.keep !== "ambiguous_bearing" && message.keep !== "ambiguous") problems.push("resolve_asked keeps the bearing clicked (bearing or ambiguous_bearing) or makes the cut ambiguous again (ambiguous)");
  const request = member(message, "tma_request");
  if (request) problems.push(...tmaRequestProblems(request));
  if (message.kind === "tma_exclude" && !message.cut_ids.length) problems.push("tma_exclude names the cuts to leave out or count again");
  if (message.kind === "tma_guessed" && message.tma_request && (!message.tma_request.first_position || !message.tma_request.last_position)) problems.push("tma_guessed carries both positions clicked");
  if (message.kind === "tma_panes") problems.push(...panesProblems(message.panes_shown));
  // The rules Python's validation applies to an image drawn.
  if (message.kind === "image_rendered" && !message.image === !message.message) problems.push("image_rendered carries either the image or why there is none (message)");
  const imageBox = message.kind === "image_rendered" && message.image?.viewport && viewportProblem(message.image.viewport);
  if (imageBox) problems.push(`image viewport: ${imageBox}`);
  if (problems.length) refuse(problems);
  return message;
}

/** The rules on a TMA solution asked for that Python's validation applies too (debrief_schemas.documents.tma_request_problems). */
export function tmaRequestProblems(request: TmaRequest, where = "tma_request"): string[] {
  const problems: string[] = [];
  const given = (v: unknown) => v !== undefined && v !== null;
  if (request.cut_ids?.length && (request.sensor_ids?.length || request.period)) problems.push(`${where}: name the cuts, or the sensors and a period, not both`);
  const period = request.period;
  if (period && !(Date.parse(period.start) <= Date.parse(period.end))) problems.push(`${where} period: time range starts after it ends`);
  const form = [request.range, request.course, request.speed];
  const clicks = [request.first_position, request.last_position];
  if (form.some(given) && clicks.some(given)) problems.push(`${where}: a first guess is by form or by two positions, not both`);
  if (form.some(given) && !form.every(given)) problems.push(`${where}: a first guess by form gives a range, a course and a speed`);
  if (clicks.some(given) && !clicks.every(given)) problems.push(`${where}: a first guess by two clicks gives both positions`);
  for (const [name, position] of [["first_position", request.first_position], ["last_position", request.last_position]] as const) {
    if (position && !(Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90)) problems.push(`${where}: ${name} is not on the globe`);
  }
  if (request.range && !(Number.isFinite(request.range.value) && request.range.value > 0)) problems.push(`${where}: the range is more than nothing`);
  if (request.speed && !(Number.isFinite(request.speed.value) && request.speed.value >= 0)) problems.push(`${where}: the speed is 0 or more`);
  return problems;
}

/** The Bearings view's panes shown (tma_panes), as Python's validation has them: known panes, each once, one at least. */
export function panesProblems(panes: string[]): string[] {
  const problems = panes.filter((p) => !["bearing", "error", "course"].includes(p)).map((p) => `tma_panes: '${p}' is not a pane`);
  if (new Set(panes).size !== panes.length) problems.push("tma_panes names a pane more than once");
  if (!panes.length) problems.push("tma_panes shows one pane at least");
  return problems;
}

/** The rules on the Tote's choice of tracks that Python's validation applies too (debrief_schemas.documents.tote_view_problems). */
export function toteViewProblems(tote: ToteView, where = "tote_view"): string[] {
  const problems: string[] = [];
  const secondaries = tote.secondaries ?? [];
  if (tote.primary && secondaries.includes(tote.primary)) problems.push(`${where}: the primary, ${tote.primary}, is also a secondary`);
  const twice = [...new Set(secondaries.filter((id, i) => secondaries.indexOf(id) !== i))].sort();
  for (const id of twice) problems.push(`${where}: secondary ${id} is chosen more than once`);
  return problems;
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
