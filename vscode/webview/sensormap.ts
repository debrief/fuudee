/**
 * Sensor cuts on the map (CAP-22, CAP-28, CAP-29): painted on one canvas, as the
 * frequencies' symbols and arrows are, so a sensor of thousands of cuts costs one image to
 * pan, not thousands of elements.
 *
 * - Only cuts in the time window are drawn (the window is the volume strategy for dense
 *   sensors, CAP-29), each from its host track's position at its time (sensors.ts), in its
 *   sensor's colour or its own, to its range or past the edge of the view. A towed array's
 *   unresolved cut is two lines: the one to port solid, the one to starboard darker and
 *   dashed, so the sides are told apart without colour (legacy drew starboard darker);
 *   a resolved cut is its kept line alone.
 * - The cut current time is at, for each sensor (the last at or before it in the window),
 *   is emphasised: wider, haloed, with a dot where it is drawn from. It is painted on a
 *   canvas of its own over the rest, so moving current time (playing, or dragging the
 *   slider) repaints one line per sensor, not every cut in the window.
 * - A sensor hidden, its host hidden or missing, or a cut hidden: not drawn.
 * - Selected cuts are haloed in the theme's text colour; with a selection elsewhere, the
 *   rest are dimmed, as tracks are.
 *
 * Each line's geometry is worked out once, along the geodesic, on the map's plane at the
 * zoom where the world is one unit across, and kept while its host track and the cut are
 * unchanged (keyed by what they hold, so a step that changes neither, such as resolving
 * another cut, works nothing out again), and held by cut while the plot is shown, so a
 * repaint builds no keys. A line without a range is worked out once to five
 * degrees of arc and cut short to the view's length when painted. The canvas says how many
 * cuts it drew (data-cuts), for tests and tools.
 */
import L from "leaflet";
import geodesic from "geographiclib-geodesic";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import type { LonLat } from "./geodesic.js";
import { pointAt } from "./geodesic.js";
import {
  currentCut,
  DEFAULT_LENGTH_CAP_M,
  defaultLengthM,
  degrees,
  drawnBearings,
  inPeriod,
  metres,
  sensorsOf,
  sideOf,
  type CutFeature,
  type Kept,
  type SensorEntry,
} from "./sensors.js";

const WGS84 = geodesic.Geodesic.WGS84;
const MASK = geodesic.Geodesic.LONGITUDE | geodesic.Geodesic.LATITUDE | geodesic.Geodesic.LONG_UNROLL;
/** Pieces a line is worked out in: about one every 20 km, at most 24, so it curves as the geodesic does on the map. */
const PIECE_M = 20_000;
const MAX_PIECES = 24;
/** Painted beyond the view by this share of it each way, so a short pan shows them already there. */
const PAD = 0.25;
/** How near, in screen pixels, a click must be to a cut's line to be on it. */
export const HIT_PX = 5;

export interface Line {
  /** The line's points on the unit-zoom plane: x, y, x, y… from its origin. */
  xy: Float64Array;
  /** How long the line is, in metres, and whether that is its range (else the five-degree cap). */
  length: number;
  ranged: boolean;
  /** How far its middle bows from the straight line between its ends, on the plane: how many pieces it needs on the screen. */
  bow: number;
}
interface Origin {
  x: number;
  y: number;
  course?: number;
}
/** A line as painted, for hit testing: its points on the screen, its cut and which bearing. */
export interface Painted {
  cut: CutFeature;
  entry: SensorEntry;
  which: Kept;
  points: Float32Array;
  colour: string;
  dash: number[];
  alpha: number;
  /** Where the cut is drawn from, on the canvas. */
  origin: [number, number];
}
/** A line in the image an export draws (exportimage.ts), on the screen. */
export interface PaintedLine {
  points: [number, number][];
  colour: string;
  width: number;
  dash?: number[];
  opacity: number;
}

/** A darker shade of a colour, as legacy's Color.darker (0.7 of each component). */
export function darker(colour: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(colour);
  if (!m) return colour;
  const n = parseInt(m[1], 16);
  const part = (shift: number) => Math.floor(((n >> shift) & 255) * 0.7);
  return `#${[16, 8, 0].map((s) => part(s).toString(16).padStart(2, "0")).join("")}`;
}

/** Cheap fingerprint of a track's fixes: a track changed in any fix is another key. */
function fingerprint(coordinates: LonLat[], times: string[]): string {
  let sum = 0;
  for (let i = 0; i < coordinates.length; i++) sum += (coordinates[i][0] * 31 + coordinates[i][1] * 17) * ((i % 9973) + 1);
  return `${coordinates.length}|${sum}|${times[0]}|${times[times.length - 1]}`;
}

export interface SensorLayerOptions {
  map: L.Map;
  /** The map's plane at unit zoom (map.ts UNIT_ZOOM). */
  unitZoom: number;
  selection: () => Set<string>;
  background: () => string;
  outline: () => string;
  /** Hidden features' ids: a hidden host track hides its sensors' cuts. */
  hidden?: () => Set<string>;
}

/** A cut's origin and lines, worked out once per plot shown (null: outside its host's span). */
interface Prepared {
  from: Origin;
  /** Each line, and whether it is the starboard one of two (drawn darker and dashed). */
  lines: { which: Kept; line: Line; starboard: boolean }[];
}
type Entry = SensorEntry & {
  print: string;
  coordinates: LonLat[];
  hostTimes: number[];
  prepared: (Prepared | null | undefined)[];
  /** The cuts painted last: the first's index, and where each cut's lines start in painted (one more than there are cuts). */
  paintedFirst: number;
  paintedAt: Int32Array;
};

export class SensorLayer {
  /** Every cut in the window, repainted when the window, the view, the plot or the selection changes. */
  readonly canvas: HTMLCanvasElement;
  /** The cut current time is at, for each sensor: repainted alone as current time moves, so playing or dragging time costs one line, not thousands. */
  readonly top: HTMLCanvasElement;
  private entries: Entry[] = [];
  private window: { start: number; end: number } | undefined;
  private current = NaN;
  private painted: Painted[] = [];
  /** The cuts emphasised now, for an exported image. */
  private emphasised = new Set<string>();
  private readonly lines = new Map<string, Line>();
  private readonly origins = new Map<string, Origin | null>();
  private readonly crs: L.CRS;
  private ratio = 1;
  /** How many cuts were drawn last time, and how long painting took (ms). */
  drawn = 0;
  lastPaintMs = 0;

  constructor(private readonly options: SensorLayerOptions) {
    const { map } = options;
    this.crs = map.options.crs ?? L.CRS.EPSG3857;
    map.createPane("sensorCuts").style.zIndex = "390"; // above areas and context, beneath tracks (400)
    this.canvas = L.DomUtil.create("canvas", "sensor-cuts", map.getPane("sensorCuts"));
    this.top = L.DomUtil.create("canvas", "sensor-cuts-now", map.getPane("sensorCuts"));
    for (const c of [this.canvas, this.top]) c.setAttribute("aria-hidden", "true");
    map.on("zoomstart", () => {
      this.canvas.style.visibility = "hidden";
      this.top.style.visibility = "hidden";
    });
    map.on("moveend zoomend viewreset resize", () => this.paint());
  }

  /** The plot's sensors, each with its host's fixes once. */
  setPlot(plot: DebriefFeatureCollection): void {
    this.entries = sensorsOf(plot)
      .filter((e) => e.host?.geometry && e.cuts.length)
      .map((e) => {
        const coordinates = e.host!.geometry.coordinates as LonLat[];
        return { ...e, coordinates, hostTimes: e.host!.properties.times.map(Date.parse), print: `${e.host!.id}|${fingerprint(coordinates, e.host!.properties.times)}`, prepared: new Array(e.cuts.length), paintedFirst: 0, paintedAt: new Int32Array(1) };
      });
    if (this.lines.size > 400_000) this.lines.clear();
    if (this.origins.size > 200_000) this.origins.clear();
    this.paint();
  }

  /** The time window and current time, from the time controller. Current time alone moving repaints only its cuts. */
  setTime(window: { start: number; end: number } | undefined, current: number): void {
    const same = window && this.window && window.start === this.window.start && window.end === this.window.end;
    this.window = window;
    this.current = current;
    if (same) this.paintNow();
    else this.paint();
  }

  /** How many sensors the plot has with cuts to draw. */
  get sensorCount(): number {
    return this.entries.length;
  }

  private originOf(entry: Entry, cut: CutFeature, at: number): Origin | null {
    const own = cut.properties.origin as LonLat | undefined | null;
    const key = `${entry.print}|${at}|${own ? own.join(",") : ""}`;
    let found = this.origins.get(key);
    if (found !== undefined) return found;
    const point = pointAt(entry.coordinates, entry.hostTimes, at);
    if (!point) found = null;
    else {
      const where = own ?? point.position;
      const p = this.crs.latLngToPoint(L.latLng(where[1], where[0]), this.options.unitZoom);
      found = { x: p.x, y: p.y, course: point.course };
    }
    this.origins.set(key, found);
    return found;
  }

  private lineOf(entry: Entry, cut: CutFeature, at: number, bearing: number): Line | undefined {
    const own = cut.properties.origin as LonLat | undefined | null;
    const range = cut.properties.range ? metres(cut.properties.range) : undefined;
    const key = `${entry.print}|${at}|${own ? own.join(",") : ""}|${bearing}|${range ?? ""}`;
    let line = this.lines.get(key);
    if (line) return line;
    const point = pointAt(entry.coordinates, entry.hostTimes, at);
    if (!point) return undefined;
    const [lon, lat] = own ?? point.position;
    const length = range ?? DEFAULT_LENGTH_CAP_M;
    const pieces = Math.max(1, Math.min(MAX_PIECES, Math.ceil(length / PIECE_M)));
    const xy = new Float64Array((pieces + 1) * 2);
    const start = this.crs.latLngToPoint(L.latLng(lat, lon), this.options.unitZoom);
    xy[0] = start.x;
    xy[1] = start.y;
    const geodesicLine = WGS84.DirectLine(lat, lon, bearing, length, MASK);
    for (let k = 1; k <= pieces; k++) {
      const p = geodesicLine.Position((length * k) / pieces, MASK);
      // At most 89°, as legacy kept a line's end off the pole.
      const q = this.crs.latLngToPoint(L.latLng(Math.max(-89, Math.min(89, p.lat2!)), p.lon2!), this.options.unitZoom);
      xy[2 * k] = q.x;
      xy[2 * k + 1] = q.y;
    }
    const mid = pieces >> 1;
    const [ax, ay, bx, by] = [xy[0], xy[1], xy[2 * pieces], xy[2 * pieces + 1]];
    const chord = Math.hypot(bx - ax, by - ay);
    const bow = chord > 0 ? Math.abs((bx - ax) * (ay - xy[2 * mid + 1]) - (ax - xy[2 * mid]) * (by - ay)) / chord : 0;
    line = { xy, length, ranged: range !== undefined, bow };
    this.lines.set(key, line);
    return line;
  }

  /** A cut's origin and lines: worked out once while the plot is shown, from the caches kept across plots. */
  private prepare(entry: Entry, i: number): Prepared | null {
    const cut = entry.cuts[i];
    const at = entry.times[i];
    const from = this.originOf(entry, cut, at);
    if (!from) return null; // outside its host's span: not drawn, as legacy
    const props = cut.properties;
    const lines: Prepared["lines"] = [];
    const drawn = drawnBearings(degrees(props.bearing), props.ambiguous_bearing ? degrees(props.ambiguous_bearing) : undefined, props.resolved);
    for (const { which, bearing } of drawn) {
      const line = this.lineOf(entry, cut, at, bearing);
      if (line) lines.push({ which, line, starboard: drawn.length === 2 && from.course !== undefined && sideOf(from.course, bearing) === "starboard" });
    }
    return { from, lines };
  }

  /** The view's length for lines without a range: twice its larger side (legacy). */
  private viewLength(): number {
    const { map } = this.options;
    const bounds = map.getBounds();
    const centre = bounds.getCenter();
    const width = map.distance(L.latLng(centre.lat, bounds.getWest()), L.latLng(centre.lat, bounds.getEast()));
    const height = map.distance(L.latLng(bounds.getSouth(), centre.lng), L.latLng(bounds.getNorth(), centre.lng));
    return defaultLengthM(width, height);
  }

  /** Size and place both canvases over the view and a margin; their size in CSS pixels. */
  private place(): { width: number; height: number; corner: L.Point } {
    const { map } = this.options;
    const size = map.getSize();
    this.ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    const corner = map.containerPointToLayerPoint([-size.x * PAD, -size.y * PAD]);
    const width = size.x * (1 + 2 * PAD);
    const height = size.y * (1 + 2 * PAD);
    for (const canvas of [this.canvas, this.top]) {
      if (canvas.width !== Math.round(width * this.ratio) || canvas.height !== Math.round(height * this.ratio)) {
        canvas.width = Math.round(width * this.ratio);
        canvas.height = Math.round(height * this.ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      L.DomUtil.setPosition(canvas, corner);
      canvas.style.visibility = "";
    }
    return { width, height, corner };
  }

  /** Paint the cuts in the window for the view as it is now, then the current ones over them. */
  paint(): void {
    const began = performance.now();
    const { map } = this.options;
    const size = map.getSize();
    const { width, height, corner } = this.place();
    const canvas = this.canvas;
    const context = canvas.getContext("2d");
    this.painted = [];
    for (const entry of this.entries) entry.paintedAt = new Int32Array(1);
    this.drawn = 0;
    if (!context) return;
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const window = this.window;
    if (!window || !this.entries.length || !size.x || !size.y) {
      canvas.dataset.cuts = "0";
      canvas.dataset.lines = "0";
      this.paintNow();
      return;
    }
    const scale = this.crs.scale(map.getZoom());
    const origin = map.getPixelOrigin();
    const ox = origin.x + corner.x;
    const oy = origin.y + corner.y;
    const viewLength = this.viewLength();
    const selection = this.options.selection();
    const hidden = this.options.hidden?.() ?? new Set<string>();
    const any = selection.size > 0;
    // Lines grouped by how they are drawn, so each group is one stroke: by colour, then
    // port or starboard and dimmed or not.
    type Group = { colour: string; dash: number[]; alpha: number; paths: Float32Array[] };
    const groups = new Map<string, Group[]>();
    const groupOf = (colour: string, starboard: boolean, dim: boolean): Group => {
      let four = groups.get(colour);
      if (!four) {
        const twin = darker(colour);
        four = [false, true].flatMap((d) => [{ colour, dash: NO_DASH, alpha: d ? 0.25 : 0.9, paths: [] }, { colour: twin, dash: DASH, alpha: d ? 0.25 : 0.9, paths: [] }]);
        groups.set(colour, four);
      }
      return four[(dim ? 2 : 0) + (starboard ? 1 : 0)];
    };
    const selected: Float32Array[] = [];
    const pad = 4;
    let count = 0;
    for (const entry of this.entries) {
      const sensor = entry.sensor;
      if (sensor.properties.hidden || hidden.has(sensor.id) || hidden.has(entry.host!.id)) continue;
      const [first, last] = inPeriod(entry.times, window.start, window.end);
      const sensorChosen = selection.has(sensor.id) || selection.has(entry.host!.id);
      const at = new Int32Array(last - first + 1);
      entry.paintedFirst = first;
      entry.paintedAt = at;
      for (let i = first; i < last; i++) {
        at[i - first] = this.painted.length;
        const cut = entry.cuts[i];
        if (cut.properties.hidden) continue;
        let prepared = entry.prepared[i];
        if (prepared === undefined) prepared = entry.prepared[i] = this.prepare(entry, i);
        if (!prepared) continue;
        const colour = cut.properties.colour ?? sensor.properties.colour;
        const dim = any && !sensorChosen && !selection.has(cut.id);
        const from = prepared.from;
        count++;
        for (const { which, line, starboard } of prepared.lines) {
          const points = screenPoints(line, line.ranged ? line.length : Math.min(viewLength, line.length), scale, ox, oy);
          if (!points || !onCanvas(points, width, height, pad)) continue;
          const group = groupOf(colour, starboard, dim);
          this.painted.push({ cut, entry, which, points, colour: group.colour, dash: group.dash, alpha: group.alpha, origin: [from.x * scale - ox, from.y * scale - oy] });
          group.paths.push(points);
          if (selection.size && selection.has(cut.id)) selected.push(points);
        }
      }
      at[last - first] = this.painted.length;
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 1.25;
    for (const group of [...groups.values()].flat()) {
      if (!group.paths.length) continue;
      context.globalAlpha = group.alpha;
      context.strokeStyle = group.colour;
      context.setLineDash(group.dash);
      stroke(context, group.paths);
    }
    // Selected cuts: haloed in the theme's text colour, as the map outlines a selection.
    if (selected.length) {
      context.globalAlpha = 0.55;
      context.setLineDash([2, 6]);
      context.strokeStyle = this.options.outline();
      context.lineWidth = 6;
      stroke(context, selected);
    }
    context.globalAlpha = 1;
    context.setLineDash([]);
    this.drawn = count;
    canvas.dataset.cuts = String(count);
    canvas.dataset.lines = String(this.painted.length);
    this.paintNow(began);
  }

  /** Paint the cut current time is at, for each sensor (the last at or before it in the window): wider, haloed, with a dot where it is drawn from. */
  private paintNow(began = performance.now()): void {
    const top = this.top;
    const context = top.getContext("2d");
    this.emphasised = new Set();
    if (!context) return;
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, top.width / this.ratio, top.height / this.ratio);
    const window = this.window;
    const background = this.options.background();
    if (window) {
      for (const entry of this.entries) {
        const now = currentCut(entry.times, this.current, window.start, window.end);
        const offset = now - entry.paintedFirst;
        if (now < 0 || offset < 0 || offset + 1 >= entry.paintedAt.length) continue;
        const lines = this.painted.slice(entry.paintedAt[offset], entry.paintedAt[offset + 1]);
        if (!lines.length) continue;
        this.emphasised.add(entry.cuts[now].id);
        for (const e of lines) {
          context.setLineDash([]);
          context.globalAlpha = 0.8;
          context.strokeStyle = background;
          context.lineWidth = 7;
          stroke(context, [e.points]);
          context.globalAlpha = 1;
          context.setLineDash(e.dash);
          context.strokeStyle = e.colour;
          context.lineWidth = 3;
          stroke(context, [e.points]);
        }
        const e = lines[0];
        context.setLineDash([]);
        context.beginPath();
        context.arc(e.origin[0], e.origin[1], 4, 0, 2 * Math.PI);
        context.fillStyle = e.colour;
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = background;
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    context.setLineDash([]);
    this.canvas.dataset.current = String(this.emphasised.size);
    this.lastPaintMs = performance.now() - began;
    this.canvas.dataset.paintMs = this.lastPaintMs.toFixed(2);
  }

  /** Where the canvas's corner is on the map's container now (it moves with the map while panned). */
  private offset(): { x: number; y: number } {
    return this.options.map.layerPointToContainerPoint(L.DomUtil.getPosition(this.canvas));
  }

  /** The cut line nearest a point on the map's container, within HIT_PX; a current cut's before others as near. */
  hit(point: L.Point): Painted | undefined {
    const offset = this.offset();
    const x = point.x - offset.x;
    const y = point.y - offset.y;
    let best: Painted | undefined;
    let bestDistance = HIT_PX;
    for (const painted of this.painted) {
      const p = painted.points;
      const now = this.emphasised.has(painted.cut.id);
      for (let k = 2; k < p.length; k += 2) {
        const d = segmentDistance(x, y, p[k - 2], p[k - 1], p[k], p[k + 1]);
        if (d < bestDistance || (d === bestDistance && now) || (d <= bestDistance && now && best && !this.emphasised.has(best.cut.id))) {
          bestDistance = d;
          best = painted;
        }
      }
    }
    return best;
  }

  /**
   * For tests and tools: a point on each line painted, in the page, where a click would
   * find that line (none where another is nearer); its cut, which bearing, and whether
   * the cut is still ambiguous.
   */
  probe(): { id: string; which: Kept; ambiguous: boolean; x: number; y: number }[] {
    const offset = this.offset();
    const size = this.options.map.getSize();
    const page = this.options.map.getContainer().getBoundingClientRect();
    const out: { id: string; which: Kept; ambiguous: boolean; x: number; y: number }[] = [];
    for (const p of this.painted) {
      const n = p.points.length / 2;
      for (const share of PROBE_SHARES) {
        const k = Math.min(n - 2, Math.floor((n - 1) * share));
        const f = (n - 1) * share - k;
        // Whole pixels in the page, as a pointer gives them.
        const px = Math.round(p.points[2 * k] + (p.points[2 * k + 2] - p.points[2 * k]) * f + offset.x + page.left);
        const py = Math.round(p.points[2 * k + 1] + (p.points[2 * k + 3] - p.points[2 * k + 1]) * f + offset.y + page.top);
        const [x, y] = [px - page.left, py - page.top];
        if (x < 30 || y < 30 || x > size.x - 30 || y > size.y - 30) continue;
        // Not under the map's controls, a label, a mark or a line (a track's): where a click reaches
        // the map, or an area, circle or ellipse, which a click on a cut goes through.
        const under = document.elementFromPoint(px, py);
        const line = under?.closest(".leaflet-interactive");
        if (!under || under.closest(".leaflet-control, .leaflet-tooltip, .leaflet-marker-icon") || (line && line.getAttribute("fill") === "none")) continue;
        const found = this.hit(L.point(x, y));
        if (found?.cut.id !== p.cut.id || found.which !== p.which) continue;
        out.push({ id: p.cut.id, which: p.which, ambiguous: !!p.cut.properties.ambiguous_bearing && !p.cut.properties.resolved, x: px, y: py });
        break;
      }
    }
    return out;
  }

  /** The lines drawn now, on the map's container, for an exported image: the current cuts wider, over the rest. */
  linesForExport(): PaintedLine[] {
    const offset = this.offset();
    const line = (p: Painted, now: boolean): PaintedLine => {
      const list: [number, number][] = [];
      for (let k = 0; k < p.points.length; k += 2) list.push([p.points[k] + offset.x, p.points[k + 1] + offset.y]);
      return { points: list, colour: p.colour, width: now ? 3 : 1.25, ...(p.dash.length && { dash: p.dash }), opacity: now ? 1 : p.alpha };
    };
    return [...this.painted.filter((p) => !this.emphasised.has(p.cut.id)).map((p) => line(p, false)), ...this.painted.filter((p) => this.emphasised.has(p.cut.id)).map((p) => line(p, true))];
  }
}

// Where along a line probe() tries, away from the crowd near the origin first, then nearer it.
const PROBE_SHARES = [0.3, 0.2, 0.4, 0.15, 0.5, 0.1, 0.6, 0.07, 0.75, 0.05, 0.9];
const DASH = [5, 3];
const NO_DASH: number[] = [];

function stroke(context: CanvasRenderingContext2D, paths: Float32Array[]): void {
  context.beginPath();
  for (const p of paths) {
    context.moveTo(p[0], p[1]);
    for (let k = 2; k < p.length; k += 2) context.lineTo(p[k], p[k + 1]);
  }
  context.stroke();
}

/** How far, in screen pixels, a line drawn in pieces may stray from the geodesic. */
const STRAY_PX = 0.25;

/**
 * A line's points on the canvas, up to a length along it; none if it has none there. It
 * takes only as many of its points as keep it within STRAY_PX of the geodesic on the
 * screen (a bow shrinks with the square of the pieces it is cut into), so a view of
 * thousands of cuts strokes a few segments each, not two dozen.
 */
export function screenPoints(line: Line, upto: number, scale: number, ox: number, oy: number): Float32Array | undefined {
  const xy = line.xy;
  const pieces = xy.length / 2 - 1;
  const along = (Math.min(upto, line.length) / line.length) * pieces;
  const whole = Math.floor(along);
  const part = along - whole;
  if (whole === 0 && part <= 1e-9) return undefined;
  const share = along / pieces;
  const bowPx = line.bow * scale * share * share;
  const wanted = Math.max(1, Math.ceil(Math.sqrt(bowPx / STRAY_PX)));
  const stride = Math.max(1, Math.floor(along / wanted));
  const kept = Math.floor(whole / stride);
  const tail = whole % stride !== 0 || part > 1e-9; // the point at whole, or the partial end
  const out = new Float32Array((kept + 1 + (tail ? 1 : 0)) * 2);
  for (let j = 0; j <= kept; j++) {
    const k = j * stride;
    out[2 * j] = xy[2 * k] * scale - ox;
    out[2 * j + 1] = xy[2 * k + 1] * scale - oy;
  }
  if (tail) {
    const k = Math.min(whole, pieces - 1);
    const f = whole >= pieces ? 1 : part;
    const x = xy[2 * k] + (xy[2 * k + 2] - xy[2 * k]) * f;
    const y = xy[2 * k + 1] + (xy[2 * k + 3] - xy[2 * k + 1]) * f;
    out[2 * kept + 2] = x * scale - ox;
    out[2 * kept + 3] = y * scale - oy;
  }
  return out;
}

/** Whether any of a line could be on the canvas: its points' box meets it. */
function onCanvas(points: Float32Array, width: number, height: number, pad: number): boolean {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < points.length; k += 2) {
    const x = points[k];
    const y = points[k + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 >= -pad && y1 >= -pad && x0 <= width + pad && y0 <= height + pad;
}

/** The distance from a point to a segment. */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
