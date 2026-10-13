/**
 * Drawing and editing annotations on the map (CAP-03, NFR-13), kept free of
 * Leaflet so it can be tested: what each click or drag makes, what the map
 * says while the analyst draws, and what dragging or nudging a handle does to
 * an annotation's description.
 *
 * Drawing makes an AnnotationSpec with an empty name; the host opens the
 * annotation form with it, and Add saves it as one step. Editing changes the
 * description of an annotation already in the plot; releasing a handle sends
 * it as one change, one step. Ranges and bearings are along geodesics (SUB-03)
 * and shown through the kernel's formatting, in the analyst's units (SUB-04).
 */
import { convert, DEFAULT_SETTINGS, fixed, formatBearing, formatPosition, formatQuantity, UNIT_LABELS, type FormatSettings } from "@debrief/kernel";
import type { AnnotationSpec } from "@debrief/schemas";
import type { Shape } from "./annotationlook.js";
import { geodesicArea, rangeBearing, travel, type LonLat } from "./geodesic.js";

/** The kinds of annotation that can be drawn: every kind but a note, which has no position. */
export type Tool = Exclude<Shape, "note">;

export const TOOLS: { tool: Tool; label: string; title: string }[] = [
  { tool: "line", label: "Line", title: "Draw a line: click each position, double-click or Enter to finish" },
  { tool: "area", label: "Area", title: "Draw an area: click each corner, double-click or Enter to finish" },
  { tool: "circle", label: "Circle", title: "Draw a circle: click the centre, then click or drag to set the radius" },
  { tool: "ellipse", label: "Ellipse", title: "Draw an ellipse: click the centre, the end of the longer axis, then its side" },
  { tool: "label", label: "Label", title: "Place a label: click where it goes" },
  { tool: "marker", label: "Marker", title: "Place a marker: click where it goes" },
];

const TITLES: Record<Shape, string> = { line: "Line", area: "Area", circle: "Circle", ellipse: "Ellipse", label: "Label", marker: "Marker", note: "Note" };

/** A drawing in progress: the kind being drawn and the points placed so far. */
export interface Drawing {
  tool: Tool;
  points: LonLat[];
}

/** Points that finish a drawing by themselves; a line or an area is finished by the analyst. */
const POINTS: Record<Tool, number | undefined> = { line: undefined, area: undefined, circle: 2, ellipse: 3, label: 1, marker: 1 };
/** The fewest different positions a line or an area needs. */
export const FEWEST: Partial<Record<Shape, number>> = { line: 2, area: 3 };

export function startDrawing(tool: Tool): Drawing {
  return { tool, points: [] };
}

/** The drawing with one more point placed; a drawing already complete is unchanged. */
export function placePoint(drawing: Drawing, point: LonLat): Drawing {
  if (isComplete(drawing)) return drawing;
  return { ...drawing, points: [...drawing.points, point] };
}

/** The drawing without its last point (Backspace). */
export function removeLast(drawing: Drawing): Drawing {
  return { ...drawing, points: drawing.points.slice(0, -1) };
}

/** Whether the drawing has all the points it takes: a circle its centre and radius, say. */
export function isComplete(drawing: Drawing): boolean {
  const needed = POINTS[drawing.tool];
  return needed !== undefined && drawing.points.length >= needed;
}

const distinct = (points: LonLat[]) => new Set(points.map(([lon, lat]) => `${lon},${lat}`)).size;

/** The drawing with each point that repeats the one before it left out: a double-click places one point, not two. */
export function dropRepeats(drawing: Drawing, same: (a: LonLat, b: LonLat) => boolean): Drawing {
  const points = drawing.points.filter((p, i) => i === 0 || !same(drawing.points[i - 1], p));
  return { ...drawing, points };
}

/** Why the drawing cannot be finished yet, if it can't. */
export function finishProblem(drawing: Drawing, settings: FormatSettings = DEFAULT_SETTINGS): string | undefined {
  const { tool, points } = drawing;
  const fewest = FEWEST[tool];
  if (fewest !== undefined) {
    if (distinct(points) < fewest) return tool === "area" ? "An area needs at least 3 different corners." : "A line needs at least 2 different positions.";
    return undefined;
  }
  if (!isComplete(drawing)) return `${TITLES[tool]} not finished yet.`;
  const spec = specOfDrawing(drawing, settings);
  if (tool === "circle" && !(spec.radius && spec.radius.value > 0)) return "Give the circle a radius: click away from its centre.";
  if (tool === "ellipse" && !(spec.semi_major && spec.semi_major.value > 0)) return "Give the ellipse a longer axis: click away from its centre.";
  if (tool === "ellipse" && !(spec.semi_minor && spec.semi_minor.value > 0)) return "Give the ellipse a width: click to one side of its longer axis.";
  return undefined;
}

/**
 * A length to keep: in the unit given, to the decimals the analyst reads
 * lengths to, so what is saved is what the map said while drawing. A length
 * too small for those decimals keeps three significant figures.
 */
export function lengthIn(metres: number, unit: string, settings: FormatSettings = DEFAULT_SETTINGS): { value: number; unit: never } {
  const value = convert({ value: metres, unit: "m" }, unit).value;
  const rounded = Number(fixed(value, settings.length_decimals));
  return { value: rounded > 0 ? rounded : Number(value.toPrecision(3)), unit: unit as never };
}

const angle = (degrees: number, settings: FormatSettings) => Number(fixed(((degrees % 360) + 360) % 360, settings.angle_decimals)) % 360;

/** The ellipse's semi-minor axis, in metres: how far point lies to the side of the longer axis through centre. */
function sideways(centre: LonLat, orientation: number, point: LonLat): number {
  const { metres, bearing } = rangeBearing(centre, point);
  return Math.abs(metres * Math.sin(((bearing - orientation) * Math.PI) / 180));
}

/**
 * The annotation the drawing describes, with an empty name for the form to
 * fill in. A circle's radius and an ellipse's semi-axes are in the analyst's
 * length unit, its orientation in degrees true.
 */
export function specOfDrawing(drawing: Drawing, settings: FormatSettings = DEFAULT_SETTINGS): AnnotationSpec {
  const { tool, points } = drawing;
  const spec: AnnotationSpec = { shape: tool, name: "" };
  if (tool === "circle" || tool === "ellipse") {
    if (points.length) spec.positions = [points[0]];
    if (points.length < 2) return spec;
    const { metres, bearing } = rangeBearing(points[0], points[1]);
    if (tool === "circle") {
      spec.radius = lengthIn(metres, settings.length_unit, settings);
      return spec;
    }
    spec.semi_major = lengthIn(metres, settings.length_unit, settings);
    spec.orientation = { value: angle(bearing, settings), unit: "deg" };
    if (points.length > 2) spec.semi_minor = lengthIn(Math.min(metres, sideways(points[0], bearing, points[2])), settings.length_unit, settings);
    return spec;
  }
  const positions = tool === "line" || tool === "area" ? points : points.slice(0, 1);
  if (positions.length) spec.positions = positions as AnnotationSpec["positions"];
  return spec;
}

const length = (metres: number, settings: FormatSettings) => formatQuantity({ value: metres, unit: "m" }, settings);
const bearing = (degrees: number, settings: FormatSettings) => formatBearing({ value: degrees, unit: "deg" }, settings);
const position = (p: LonLat, settings: FormatSettings) => formatPosition({ longitude: p[0], latitude: p[1] }, settings);

/** An area in the square of the analyst's length unit: "4.52 nmi²". The kernel has no area unit, so this is the one place it is written. */
export function formatArea(squareMetres: number, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const unit = settings.length_unit;
  const side = convert({ value: 1, unit }, "m").value;
  return `${fixed(squareMetres / (side * side), settings.length_decimals)} ${UNIT_LABELS[unit] ?? unit}²`;
}

function pathLength(points: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += rangeBearing(points[i - 1], points[i]).metres;
  return total;
}

/**
 * What the map says while the analyst draws, with the pointer at cursor: for a
 * line or an area, how many points are placed, then the leg to the pointer and
 * its range and bearing from the start, and the length or area with it; an
 * area's size; a circle's radius; an ellipse's axes and orientation.
 */
export function readout(drawing: Drawing, cursor: LonLat | undefined, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const last = drawing.points[drawing.points.length - 1];
  // The pointer where the last point was placed adds nothing.
  const next = cursor && !isComplete(drawing) && !(last && last[0] === cursor[0] && last[1] === cursor[1]) ? cursor : undefined;
  const points = next ? [...drawing.points, next] : drawing.points;
  const { tool } = drawing;
  if (!points.length) return "";
  if (tool === "label" || tool === "marker") return position(points[0], settings);
  if (tool === "circle") {
    if (points.length < 2) return `Centre ${position(points[0], settings)}`;
    const { metres, bearing: b } = rangeBearing(points[0], points[1]);
    return `Radius ${length(metres, settings)} · bearing ${bearing(b, settings)} · area ${formatArea(Math.PI * metres * metres, settings)}`;
  }
  if (tool === "ellipse") {
    if (points.length < 2) return `Centre ${position(points[0], settings)}`;
    const major = rangeBearing(points[0], points[1]);
    const parts = [`Semi-major ${length(major.metres, settings)}`];
    if (points.length > 2) {
      const minor = Math.min(major.metres, sideways(points[0], major.bearing, points[2]));
      parts.push(`semi-minor ${length(minor, settings)}`);
      parts.push(`orientation ${bearing(major.bearing, settings)}`);
      parts.push(`area ${formatArea(Math.PI * major.metres * minor, settings)}`);
    } else parts.push(`orientation ${bearing(major.bearing, settings)}`);
    return parts.join(" · ");
  }
  const noun = tool === "area" ? "corner" : "position";
  // How many are placed; the measurements include the pointer, as if it were placed too.
  const placed = drawing.points.length;
  const count = `${placed} ${noun}${placed === 1 ? "" : "s"} placed`;
  if (points.length < 2) return `${count} · ${position(points[0], settings)}`;
  const leg = rangeBearing(points[points.length - 2], points[points.length - 1]);
  const start = rangeBearing(points[0], points[points.length - 1]);
  const parts = [count, `leg ${length(leg.metres, settings)} ${bearing(leg.bearing, settings)}`, `from start ${length(start.metres, settings)} ${bearing(start.bearing, settings)}`];
  if (tool === "line") parts.push(`length ${length(pathLength(points), settings)}`);
  else if (points.length > 2) parts.push(`area ${formatArea(geodesicArea(points), settings)}`);
  return parts.join(" · ");
}

/** What to do next, said while drawing. */
export function hint(drawing: Drawing): string {
  const { tool, points } = drawing;
  const keys = "Backspace removes the last; Escape cancels.";
  switch (tool) {
    case "line":
      return `Line: click to place each position; double-click or Enter to finish. ${keys}`;
    case "area":
      return `Area: click to place each corner; double-click or Enter to finish. ${keys}`;
    case "circle":
      return points.length ? `Circle: click, or drag from the centre, to set the radius. ${keys}` : "Circle: click the centre, or drag from it to set the radius. Escape cancels.";
    case "ellipse":
      return [
        "Ellipse: click the centre, or drag from it to the end of the longer axis. Escape cancels.",
        `Ellipse: click the end of the longer axis; it sets the orientation. ${keys}`,
        `Ellipse: click to the side of the longer axis to set the width. ${keys}`,
      ][Math.min(points.length, 2)];
    default:
      return `${TITLES[tool]}: click where it goes. Escape cancels.`;
  }
}

// --- Editing an annotation already in the plot -------------------------------------

export type HandleRole = "vertex" | "midpoint" | "centre" | "radius" | "major" | "minor" | "position" | "move";

/** A handle on the selected annotation: dragged, or focused and moved with the arrow keys. */
export interface Handle {
  role: HandleRole;
  /** A vertex's place among the positions; a midpoint's is the vertex before it. */
  index: number;
  at: LonLat;
  /** What a screen reader says of it, and what dragging it does. */
  label: string;
}

const metresOf = (q: { value: number; unit: string } | null | undefined) => (q ? convert(q, "m").value : 0);
const degreesOf = (q: { value: number; unit: string } | null | undefined) => (q ? convert(q, "deg").value : 0);

/** What the map calls an annotation: "Area 'Transit lane'". */
export function titleOf(spec: Pick<AnnotationSpec, "shape" | "name">): string {
  const kind = TITLES[spec.shape];
  return `${kind} '${spec.name}'`;
}

/** A vertex's number, counted from 1 as the analyst counts them. */
const ordinal = (i: number) => i + 1;

/** An annotation of this kind can be changed on the map: everything with a position. */
export function editable(spec: AnnotationSpec): boolean {
  return spec.shape !== "note" && !!spec.positions?.length;
}

/** The middle of the positions, where the handle that moves a whole line or area goes. */
function middle(points: LonLat[]): LonLat {
  const lon = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [lon, lat];
}

function midpointOf(a: LonLat, b: LonLat): LonLat {
  const { metres, bearing: b1 } = rangeBearing(a, b);
  return travel(a, b1, metres / 2);
}

/** The handles an annotation shows when it is selected on its own. */
export function handlesOf(spec: AnnotationSpec): Handle[] {
  if (!editable(spec)) return [];
  const points = spec.positions as LonLat[];
  const what = titleOf(spec);
  const keys = "drag it, or use the arrow keys";
  if (spec.shape === "line" || spec.shape === "area") {
    const noun = spec.shape === "area" ? "Corner" : "Position";
    const handles: Handle[] = points.map((at, i) => ({
      role: "vertex",
      index: i,
      at,
      label: `${what}: ${noun.toLowerCase()} ${ordinal(i)} of ${points.length}; ${keys}; Delete removes it`,
    }));
    const segments = spec.shape === "area" ? points.length : points.length - 1;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % points.length;
      const label = `${what}: between ${noun.toLowerCase()}s ${ordinal(i)} and ${ordinal(next)}; ${keys} to add a ${noun.toLowerCase()} there`;
      handles.push({ role: "midpoint", index: i, at: midpointOf(points[i], points[next]), label });
    }
    handles.push({ role: "move", index: 0, at: middle(points), label: `${what}: move it all; ${keys}` });
    return handles;
  }
  const centre = points[0];
  if (spec.shape === "circle") {
    const radius = metresOf(spec.radius);
    return [
      { role: "centre", index: 0, at: centre, label: `${what}: centre; ${keys} to move the circle` },
      { role: "radius", index: 0, at: travel(centre, 90, radius), label: `${what}: radius; ${keys} to change it` },
    ];
  }
  if (spec.shape === "ellipse") {
    const orientation = degreesOf(spec.orientation);
    return [
      { role: "centre", index: 0, at: centre, label: `${what}: centre; ${keys} to move the ellipse` },
      { role: "major", index: 0, at: travel(centre, orientation, metresOf(spec.semi_major)), label: `${what}: end of the longer axis; ${keys} to change its length and orientation` },
      { role: "minor", index: 0, at: travel(centre, orientation + 90, metresOf(spec.semi_minor)), label: `${what}: side; ${keys} to change the width` },
    ];
  }
  return [{ role: "position", index: 0, at: centre, label: `${what}: ${keys} to move it` }];
}

/** The same handle after a drag: dragging a midpoint adds a vertex, which the handle then is. */
export function handleAfter(handle: Pick<Handle, "role" | "index">): Pick<Handle, "role" | "index"> {
  return handle.role === "midpoint" ? { role: "vertex", index: handle.index + 1 } : { role: handle.role, index: handle.index };
}

/**
 * The annotation with handle dragged to `to`, from how it was when the drag
 * began (so a drag is never applied twice). A whole line or area moves by the
 * same change of longitude and latitude at every position; sizes keep their
 * units; an ellipse's axes never cross (the longer stays the longer).
 */
export function dragTo(spec: AnnotationSpec, handle: Pick<Handle, "role" | "index" | "at">, to: LonLat, settings: FormatSettings = DEFAULT_SETTINGS): AnnotationSpec {
  const points = (spec.positions ?? []).map((p) => [p[0], p[1]] as LonLat);
  const next: AnnotationSpec = { ...spec };
  const centre = points[0];
  switch (handle.role) {
    case "vertex":
    case "centre":
    case "position":
      points[handle.index] = to;
      next.positions = points as AnnotationSpec["positions"];
      break;
    case "midpoint":
      points.splice(handle.index + 1, 0, to);
      next.positions = points as AnnotationSpec["positions"];
      break;
    case "move": {
      const dLon = to[0] - handle.at[0];
      const dLat = to[1] - handle.at[1];
      next.positions = points.map(([lon, lat]) => [lon + dLon, Math.max(-90, Math.min(90, lat + dLat))]) as AnnotationSpec["positions"];
      break;
    }
    case "radius": {
      const unit = spec.radius?.unit ?? settings.length_unit;
      next.radius = lengthIn(Math.max(rangeBearing(centre, to).metres, 1), unit, settings);
      break;
    }
    case "major": {
      const unit = spec.semi_major?.unit ?? settings.length_unit;
      const { metres, bearing: b } = rangeBearing(centre, to);
      next.semi_major = lengthIn(Math.max(metres, metresOf(spec.semi_minor), 1), unit, settings);
      next.orientation = { value: angle(b, settings), unit: "deg" };
      if (spec.semi_minor) next.semi_minor = { ...spec.semi_minor };
      break;
    }
    case "minor": {
      const unit = spec.semi_minor?.unit ?? settings.length_unit;
      const side = sideways(centre, degreesOf(spec.orientation), to);
      next.semi_minor = lengthIn(Math.max(1, Math.min(side, metresOf(spec.semi_major))), unit, settings);
      break;
    }
  }
  return next;
}

/** The annotation without one of its vertices, or why it can't lose one. */
export function removeVertex(spec: AnnotationSpec, index: number): { spec: AnnotationSpec } | { problem: string } {
  const points = spec.positions ?? [];
  const fewest = FEWEST[spec.shape];
  if (fewest === undefined) return { problem: "Only a line or an area has corners to remove." };
  if (points.length <= fewest) {
    return { problem: spec.shape === "area" ? "An area needs at least 3 corners, so this one can't be removed." : "A line needs at least 2 positions, so this one can't be removed." };
  }
  return { spec: { ...spec, positions: points.filter((_, i) => i !== index) as AnnotationSpec["positions"] } };
}

/** Whether two descriptions place and size an annotation the same: if so, letting go changes nothing. */
export function sameGeometry(a: AnnotationSpec, b: AnnotationSpec): boolean {
  const key = (s: AnnotationSpec) => JSON.stringify([s.positions, s.radius, s.semi_major, s.semi_minor, s.orientation]);
  return key(a) === key(b);
}

/** What the map says while a handle is dragged or nudged. */
export function editReadout(spec: AnnotationSpec, handle: Pick<Handle, "role" | "index">, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const points = (spec.positions ?? []) as LonLat[];
  const what = titleOf(spec);
  const noun = spec.shape === "area" ? "corner" : "position";
  switch (handle.role) {
    case "radius":
      return `${what}: radius ${formatQuantity(spec.radius!, settings)}`;
    case "major":
    case "minor":
      return `${what}: semi-major ${formatQuantity(spec.semi_major!, settings)} · semi-minor ${formatQuantity(spec.semi_minor!, settings)} · orientation ${bearing(degreesOf(spec.orientation), settings)}`;
    case "move":
      return `${what}: first ${noun} ${position(points[0], settings)}`;
    case "vertex":
    case "midpoint": {
      const k = handleAfter(handle).index;
      const at = position(points[k], settings);
      const parts = [`${what}: ${noun} ${ordinal(k)} at ${at}`];
      if (k > 0) {
        const leg = rangeBearing(points[k - 1], points[k]);
        parts.push(`from the one before ${length(leg.metres, settings)} ${bearing(leg.bearing, settings)}`);
      }
      if (spec.shape === "area") parts.push(`area ${formatArea(geodesicArea(points), settings)}`);
      return parts.join(" · ");
    }
    default:
      return `${what}: ${position(points[0], settings)}`;
  }
}
