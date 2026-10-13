/**
 * The annotation form's fields and what they mean (CAP-03 to CAP-05), kept
 * free of React so it can be tested.
 *
 * Positions are typed in the analyst's notation and read with the kernel's
 * parsePosition (the twin of the Python one, held to the same vectors); sizes
 * are a number and a unit; orientation is degrees true; times are read as the
 * tool form reads them. The form checks everything as the analyst types, so a
 * problem is shown beside its field at once; the Python service checks again
 * before anything is saved.
 */
import { DEFAULT_SETTINGS, formatPosition, parsePosition, PositionError, type FormatSettings } from "@debrief/kernel";
import type { AnnotationAppearance, AnnotationSpec, LabelPositionEnum, LineStyleEnum, TimeRange } from "@debrief/schemas";
import { parseTime, TIME_EXAMPLES } from "../src/timeinput.js";
import type { Shape } from "./annotationlook.js";
import { showTime } from "./formdraft.js";
import { TRACK_COLOURS } from "./palette.js";

/** A colour to show as an example of #rrggbb: the blue tracks are drawn in. */
export const EXAMPLE_COLOUR = TRACK_COLOURS[1].colour;

export const SHAPES: { value: Shape; label: string; explanation: string }[] = [
  { value: "line", label: "Line", explanation: "A line through two or more positions, drawn along geodesics." },
  { value: "area", label: "Area", explanation: "A closed area with three or more corners." },
  { value: "circle", label: "Circle", explanation: "Every position at one range from a centre." },
  { value: "ellipse", label: "Ellipse", explanation: "An ellipse about a centre, its longer axis pointing along a true bearing." },
  { value: "label", label: "Label", explanation: "Text at a position." },
  { value: "marker", label: "Marker", explanation: "A marked position." },
  { value: "note", label: "Note", explanation: "Text at a time, with no position. Shown in the Timeline." },
];

export const FILLED: Shape[] = ["area", "circle", "ellipse"];
export const LENGTH_UNITS = ["[nmi_i]", "[yd_i]", "m", "km"] as const;

export interface AnnotationDraft {
  shape: Shape;
  name: string;
  text: string;
  /** One position per line: a line's positions or an area's corners, or the one position. */
  positions: string;
  radius: string;
  semiMajor: string;
  semiMinor: string;
  /** The unit of the radius or the semi-axes. */
  unit: string;
  orientation: string;
  when: "none" | "time" | "period";
  time: string;
  start: string;
  end: string;
  /** "" for Debrief's default; else lower-case hex. */
  colour: string;
  lineStyle: "" | LineStyleEnum;
  lineWidth: string;
  /** "" for a faint tint of the line colour; else lower-case hex. */
  fillColour: string;
  /** Percent; "" for the default. */
  fillOpacity: string;
  labelSize: string;
  labelPosition: "" | LabelPositionEnum;
  /**
   * What a properties form was opened with: its fields as first shown, and the
   * annotation they show. A field left as shown keeps its exact value, so saving
   * an annotation unchanged changes nothing, even where the field shows it rounded
   * (a position to a thousandth of a minute, a time to the second).
   */
  shown?: { draft: AnnotationDraft; spec: AnnotationSpec };
}

export type Field = keyof AnnotationDraft;
export type Problems = Partial<Record<Field, string>>;

const settings: FormatSettings = DEFAULT_SETTINGS;

/** A new annotation's fields: a circle, at the position given (the middle of the map, say). */
export function newDraft(position?: [number, number], shape: Shape = "circle"): AnnotationDraft {
  return {
    shape,
    name: "",
    text: "",
    positions: position ? formatPosition({ longitude: position[0], latitude: position[1] }, settings) : "",
    radius: "",
    semiMajor: "",
    semiMinor: "",
    unit: "[nmi_i]",
    orientation: "0",
    when: "none",
    time: "",
    start: "",
    end: "",
    colour: "",
    lineStyle: "",
    lineWidth: "",
    fillColour: "",
    fillOpacity: "",
    labelSize: "",
    labelPosition: "",
  };
}

const number = (n: number) => String(Math.round(n * 1e6) / 1e6);

/** The fields for an annotation as described, for its properties form. */
export function draftOf(spec: AnnotationSpec): AnnotationDraft {
  const draft = newDraft(undefined, spec.shape);
  const look = spec.appearance ?? {};
  const size = spec.radius ?? spec.semi_major ?? undefined;
  const fields: AnnotationDraft = {
    ...draft,
    name: spec.name,
    text: spec.text ?? "",
    positions: (spec.positions ?? []).map(([longitude, latitude]) => formatPosition({ longitude, latitude }, settings)).join("\n"),
    radius: spec.radius ? number(spec.radius.value) : "",
    semiMajor: spec.semi_major ? number(spec.semi_major.value) : "",
    // Both semi-axes are shown in the semi-major's unit.
    semiMinor: spec.semi_minor && spec.semi_major ? number(toUnit(spec.semi_minor, spec.semi_major.unit)) : "",
    unit: size?.unit ?? draft.unit,
    orientation: spec.orientation ? number(spec.orientation.unit === "rad" ? (spec.orientation.value * 180) / Math.PI : spec.orientation.value) : "0",
    when: spec.time_range ? "period" : spec.time ? "time" : "none",
    time: spec.time ? showTime(Date.parse(spec.time)) : "",
    start: spec.time_range ? showTime(Date.parse(spec.time_range.start)) : "",
    end: spec.time_range ? showTime(Date.parse(spec.time_range.end)) : "",
    colour: look.colour ?? "",
    lineStyle: look.line_style ?? "",
    lineWidth: look.line_width ? String(look.line_width) : "",
    fillColour: look.fill_colour ?? "",
    fillOpacity: look.fill_opacity !== undefined && look.fill_opacity !== null ? number(look.fill_opacity * 100) : "",
    labelSize: look.label_size ? String(look.label_size) : "",
    labelPosition: look.label_position ?? "",
  };
  return { ...fields, shown: { draft: fields, spec } };
}

/** Values the fields left as shown keep exactly: see AnnotationDraft.shown. */
function keepShown(draft: AnnotationDraft, spec: AnnotationSpec): void {
  if (!draft.shown) return;
  const { draft: was, spec: old } = draft.shown;
  const same = (...fields: Field[]) => fields.every((f) => draft[f] === was[f]);
  if (spec.positions && old.positions && same("shape", "positions")) spec.positions = old.positions;
  if (spec.radius && old.radius && same("radius", "unit")) spec.radius = old.radius;
  if (spec.semi_major && old.semi_major && same("semiMajor", "unit")) spec.semi_major = old.semi_major;
  if (spec.semi_minor && old.semi_minor && same("semiMinor", "unit")) spec.semi_minor = old.semi_minor;
  if (spec.orientation && old.orientation && same("orientation")) spec.orientation = old.orientation;
  if (spec.time && old.time && same("time")) spec.time = old.time;
  if (spec.time_range && old.time_range) {
    const start = same("start") ? old.time_range.start : spec.time_range.start;
    const end = same("end") ? old.time_range.end : spec.time_range.end;
    if (Date.parse(end) >= Date.parse(start)) spec.time_range = { start, end };
  }
  const fill = old.appearance?.fill_opacity;
  if (spec.appearance?.fill_opacity !== undefined && fill !== undefined && fill !== null && same("fillOpacity")) spec.appearance.fill_opacity = fill;
}

/**
 * A changed annotation's whole description, as the service is sent it: what the
 * form leaves empty (text, time, style, a size it no longer has) is given as null,
 * so it is cleared rather than kept.
 */
export function replacing(spec: AnnotationSpec): AnnotationSpec {
  return { text: null, time: null, time_range: null, appearance: null, radius: null, semi_major: null, semi_minor: null, orientation: null, ...spec };
}

const METRES: Record<string, number> = { m: 1, km: 1000, "[nmi_i]": 1852, "[yd_i]": 0.9144, "[ft_i]": 0.3048 };
const toUnit = (q: { value: number; unit: string }, unit: string) => (q.value * METRES[q.unit]) / METRES[unit];

/** How many positions each shape takes, as [fewest, most]. */
export const POSITION_COUNTS: Record<Shape, [number, number]> = {
  line: [2, Infinity],
  area: [3, Infinity],
  circle: [1, 1],
  ellipse: [1, 1],
  label: [1, 1],
  marker: [1, 1],
  note: [0, 0],
};

/** What a shape calls its positions, for the form's label. */
export function positionsLabel(shape: Shape): string {
  if (shape === "circle" || shape === "ellipse") return "Centre";
  if (shape === "line") return "Positions, one per line";
  if (shape === "area") return "Corners, one per line";
  return "Position";
}

/** Each line of the positions field read as a position, or the problem with it. */
export function readPositions(text: string): ({ position: [number, number] } | { problem: string })[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const p = parsePosition(line);
        return { position: [p.longitude, p.latitude] as [number, number] };
      } catch (error) {
        return { problem: error instanceof PositionError ? error.message : "Not a position Debrief understands" };
      }
    });
}

/** What each line of the positions field means, for the analyst to check: "Means 50°20.120'N 004°07.210'W". */
export function echoPositions(text: string): string[] {
  return readPositions(text).map((read) =>
    "position" in read ? `Means ${formatPosition({ longitude: read.position[0], latitude: read.position[1] }, settings)}` : read.problem,
  );
}

function positiveNumber(text: string): number | undefined {
  const value = Number(text.trim());
  return text.trim() && Number.isFinite(value) && value > 0 ? value : undefined;
}

function hex(text: string): string | undefined {
  const t = text.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  if (/^#[0-9a-f]{3}$/.test(t)) return `#${[...t.slice(1)].map((c) => c + c).join("")}`;
  return undefined;
}

function time(text: string, range: TimeRange | undefined): string | undefined {
  const ms = parseTime(text, range);
  return ms === undefined ? undefined : new Date(ms).toISOString();
}

/**
 * The annotation the fields describe, or the problem with each field that has
 * one. range is the plot's period, so a time of day means a day in it.
 */
export function specOf(draft: AnnotationDraft, range?: TimeRange): { spec?: AnnotationSpec; problems: Problems } {
  const problems: Problems = {};
  const shape = draft.shape;
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (!name) problems.name = "Give the annotation a name.";

  // A note has no position: anything left in the field from another kind is not read.
  const read = shape === "note" ? [] : readPositions(draft.positions);
  const [fewest, most] = POSITION_COUNTS[shape];
  const bad = read.find((r): r is { problem: string } => "problem" in r);
  const positions = read.flatMap((r) => ("position" in r ? [r.position] : []));
  if (bad) problems.positions = bad.problem;
  else if (positions.length < fewest || positions.length > most) {
    const noun = shape === "area" ? "corners" : "positions";
    problems.positions = most === 1 ? `Give one position, such as 50°20.120'N 004°07.210'W.` : `Give at least ${fewest} ${noun}, one per line.`;
  }

  const spec: AnnotationSpec = { shape, name };
  const text = draft.text.trim();
  if (text) spec.text = text;
  if (most > 0 && positions.length) spec.positions = positions as AnnotationSpec["positions"];

  if (shape === "circle") {
    const radius = positiveNumber(draft.radius);
    if (radius === undefined) problems.radius = "Give the radius, a number more than zero.";
    else spec.radius = { value: radius, unit: draft.unit as never };
  }
  if (shape === "ellipse") {
    const major = positiveNumber(draft.semiMajor);
    const minor = positiveNumber(draft.semiMinor);
    if (major === undefined) problems.semiMajor = "Give the semi-major axis, a number more than zero.";
    if (minor === undefined) problems.semiMinor = "Give the semi-minor axis, a number more than zero.";
    else if (major !== undefined && minor > major) problems.semiMinor = "The semi-minor axis must be no longer than the semi-major.";
    const orientation = Number(draft.orientation.trim() || "0");
    if (!Number.isFinite(orientation)) problems.orientation = "Give the direction of the longer axis in degrees true, such as 045.";
    if (major !== undefined && minor !== undefined && minor <= major && Number.isFinite(orientation)) {
      spec.semi_major = { value: major, unit: draft.unit as never };
      spec.semi_minor = { value: minor, unit: draft.unit as never };
      spec.orientation = { value: ((orientation % 360) + 360) % 360, unit: "deg" };
    }
  }

  if (draft.when === "time" || (shape === "note" && draft.when === "none")) {
    const at = time(draft.time, range);
    if (at === undefined) problems.time = shape === "note" && draft.when === "none" ? "A note needs a time." : `Give a UTC time, such as ${TIME_EXAMPLES}.`;
    else spec.time = at;
  } else if (draft.when === "period") {
    const start = time(draft.start, range);
    const end = time(draft.end, range);
    if (start === undefined) problems.start = `Give a UTC time, such as ${TIME_EXAMPLES}.`;
    if (end === undefined) problems.end = `Give a UTC time, such as ${TIME_EXAMPLES}.`;
    else if (start !== undefined && Date.parse(end) < Date.parse(start)) problems.end = "The period ends before it starts.";
    if (start !== undefined && end !== undefined && Date.parse(end) >= Date.parse(start)) spec.time_range = { start, end };
  }

  const look: AnnotationAppearance = {};
  if (draft.colour) {
    const colour = hex(draft.colour);
    if (colour) look.colour = colour;
    else problems.colour = `Give a colour as #rrggbb, such as ${EXAMPLE_COLOUR}.`;
  }
  if (draft.lineStyle && shape !== "label" && shape !== "note") look.line_style = draft.lineStyle;
  if (draft.lineWidth && shape !== "label" && shape !== "note") {
    const width = Number(draft.lineWidth);
    if (Number.isInteger(width) && width >= 1 && width <= 10) look.line_width = width;
    else problems.lineWidth = "Line width is a whole number of pixels, 1 to 10.";
  }
  if (FILLED.includes(shape)) {
    if (draft.fillColour) {
      const fill = hex(draft.fillColour);
      if (fill) look.fill_colour = fill;
      else problems.fillColour = `Give a colour as #rrggbb, such as ${EXAMPLE_COLOUR}.`;
    }
    if (draft.fillOpacity) {
      const percent = Number(draft.fillOpacity);
      if (Number.isFinite(percent) && percent >= 0 && percent <= 100) look.fill_opacity = Math.round(percent * 10) / 1000;
      else problems.fillOpacity = "Opacity is a percentage, 0 to 100.";
    }
  }
  if (shape !== "note") {
    if (draft.labelSize) {
      const size = Number(draft.labelSize);
      if (Number.isInteger(size) && size >= 8 && size <= 32) look.label_size = size;
      else problems.labelSize = "Label size is a whole number of pixels, 8 to 32.";
    }
    if (draft.labelPosition) look.label_position = draft.labelPosition;
  }
  if (Object.keys(look).length) spec.appearance = look;

  if (Object.keys(problems).length) return { problems };
  keepShown(draft, spec);
  return { spec, problems };
}
