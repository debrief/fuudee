/**
 * The plot map (SUB-30): Web Mercator display, geodesic lines (SUB-03).
 *
 * - Click selects; Ctrl or Cmd click adds or removes; Escape or a click on
 *   empty sea clears (SUB-26, interaction model "Selection").
 * - The map shows the plot's time window (CAP-28, CAP-29): the range of
 *   current time in shared state. Within it, tracks are solid lines in their
 *   force colour, with ticks showing the direction of travel, a hollow dot at
 *   the first fix in the window and a filled, labelled dot at the last.
 *   Outside it, each whole track stays as a thin, solid line in a quieter
 *   version of its colour (its context), so a deployment of weeks still
 *   reads as one picture; fixes there are not marked. The plot says whether
 *   context is visible (at least 3:1 on any theme), faint or hidden; see
 *   contrast.ts. Hovering a track shows the nearest fix.
 * - Annotations, including everything tools draw, are dashed and labelled
 *   unless the analyst gave them a style of their own (annotationlook.ts):
 *   colour, line style and width, fill, label size and position. Circles and
 *   ellipses are drawn from their centre and size, along geodesics, not from
 *   the polygon their plot file holds for other tools. One with a time or a
 *   period is drawn only while that falls in the window; one without a time
 *   always is. Double-clicking one opens its properties form.
 * - Drawing and editing annotations (mapedit.ts): a toolbar to draw a line,
 *   area, circle, ellipse, label or marker, which the annotation form then
 *   names and adds as one step; handles on an annotation selected alone, to
 *   drag or nudge, each release one step. Neither changes current time, the
 *   window or the selection.
 * - Moving and rotating tracks (trackmap.ts): a track selected alone shows a
 *   move handle, a rotate handle and the pivot it turns about; dragging one
 *   shows the track moved or turned, along geodesics, and letting go is one
 *   step. The whole track moves, or only its fixes in the time window.
 * - Marked fixes (fixes.ts): a fix with a colour of its own is a dot in it, and
 *   the line from it to the next fix is drawn in it; a label is drawn beside
 *   its fix; a comment shows when the analyst points at the fix. Right-click a
 *   fix, or press and hold it on a touch screen (presshold.ts), to colour,
 *   label or comment on it. The host may ring fixes for the
 *   analyst to check (jumps found, before they are removed) and draw a track as
 *   a change would leave it (smoothing, before it is applied): show_fixes.
 * - Labels, symbols and arrows at an interval set for each track (CAP-32, frequencies.ts):
 *   the time beside the track, to port of its course, as legacy Debrief labels fixes; a
 *   small dot in its colour; a chevron on the line along its course. At each whole
 *   multiple of the interval of UTC in the time window, where the track was then, as the
 *   marker at current time places it. Thinned when zoomed out, and the map says so; only
 *   what is in view is drawn, again after each pan or zoom.
 * - Chart furniture: the scale bar always, and a north arrow when the plot has one.
 * - Selected features get an outline in the theme's text colour, which can
 *   never be mistaken for a force colour; everything else is dimmed.
 * - Each track shows where it was at current time with a square marker.
 *   Current time and the window are set by the time controller, which a host
 *   places beside the map (the sidebar in VS Code, the side column in the
 *   playground). Panning and zooming set the viewport. All are shared state,
 *   so other views, extensions and tools follow (SUB-26, SUB-27).
 *
 * Interface colours come from the VS Code theme; data colours from palette.ts
 * (DEV-07). Plot content is always set as text, never as HTML.
 */
import { pageReady, pageShown } from "./timing.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import geodesic from "geographiclib-geodesic";
import { convert, DEFAULT_SETTINGS, formatPosition, formatQuantity, UNIT_LABELS } from "@debrief/kernel";
import type { DebriefFeatureCollection, TimelineEntry, TimeState, ToteView } from "@debrief/schemas";
import type { AnnotationProperties } from "@debrief/schemas";
import { labelPlacement, labelText, lookOf, shapeOf, specOfFeature, type Look } from "./annotationlook.js";
import { circleRing, densify, ellipseRing, pointAt, positionAt as trackPositionAt, type LonLat } from "./geodesic.js";
import { CAP, declutter, everyFix, FIELDS, fixLabel, forcedTimes, gaps, gridCount, gridTimes, intervalMs, labelsWithDay, LEADER_PX, medianStep, mergeSpans, Occupied, placeLabels as placeTimeLabels, portSide, SPACING_PX, thinnedInterval, thinningNote, withForced, type Field } from "./frequencies.js";
import { CONTEXT_WEIGHT, contextStyle, parseColour, WINDOW_WEIGHT, type ContextStyle, type ContextTracks, type MapTheme, type Rgb } from "./contrast.js";
import { MapEditor } from "./mapedit.js";
import { PressHold } from "./presshold.js";
import { TrackEditor } from "./trackmap.js";
import { describeFix as describeFixOnly, marksByIndex, trackLabel } from "./fixes.js";
import { DATA_COLOURS, LIGHT_EXPORT_THEME } from "./palette.js";
import { host, onMessage } from "./vscode.js";
import { toteOf, toteMapLines } from "./totelogic.js";
import { composeSvg, rasterise, type PaintedMark } from "./exportimage.js";
import { SensorLayer } from "./sensormap.js";
import { cutChoices, cutClick, describeCut } from "./sensors.js";
import { clipIdFor, footerFontSize, layoutFor, pixelsOf, type ImageFormat, type ImagePreset, type ImageTheme } from "./exportlogic.js";
import type { RenderedImage, RevisionShown } from "@debrief/schemas";

type Feature = DebriefFeatureCollection["features"][number];
type Track = Extract<Feature, { properties: { kind: "track" } }>;
const settings = DEFAULT_SETTINGS;
const WGS84 = geodesic.Geodesic.WGS84;

const root = document.getElementById("root")!;
root.innerHTML = `<div id="map" tabindex="0" aria-label="Plot map"></div><div id="status" class="status"></div><div id="empty" class="empty" hidden></div><div id="revision" class="revision-banner" hidden><span class="revision-text" role="status"></span><button type="button" class="revision-latest"></button></div><div id="exporting" class="exporting-note" role="status" hidden>Preparing the image…</div>`;
const status = document.getElementById("status")!;
const mapElement = document.getElementById("map")!;

// Leaflet's own press and hold (tapHold) is off: it is on only for mobile Safari, which iPadOS
// often does not claim to be, and alongside presshold.ts it would open a fix's menu twice.
const map = L.map(mapElement, { zoomControl: true, attributionControl: false, worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 0.5, tapHold: false });
map.setView([50, -4], 6);

const css = (name: string) => getComputedStyle(document.body).getPropertyValue(name).trim();
/** Drawing an image (exportImage): the map is laid out at the image's size for a moment, which is no pan or zoom of the analyst's. */
let exporting = false;
const toLatLng = ([lon, lat]: LonLat) => L.latLng(lat, lon);

/** Text for Leaflet tooltips, as a text node so plot content can never be markup. */
function text(content: string, size?: number): HTMLElement {
  const span = document.createElement("span");
  span.textContent = content;
  if (size) span.style.fontSize = `${size}px`;
  return span;
}

// --- Scale bar in the analyst's distance unit (SUB-04) --------------------------
const ScaleBar = L.Control.extend({
  onAdd() {
    const div = L.DomUtil.create("div", "scale-bar");
    const update = () => {
      const y = map.getSize().y / 2;
      const metres = map.distance(map.containerPointToLatLng([0, y]), map.containerPointToLatLng([100, y]));
      const unit = settings.length_unit;
      const per100 = convert({ value: metres, unit: "m" }, unit).value;
      const nice = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter((n) => n <= per100).at(-1) ?? per100;
      div.style.width = `${Math.round((100 * nice) / per100)}px`;
      div.textContent = `${nice} ${UNIT_LABELS[unit] ?? unit}`;
    };
    map.on("zoomend moveend resize", update);
    setTimeout(update);
    return div;
  },
});
new ScaleBar({ position: "bottomright" }).addTo(map);

// --- North arrow: chart furniture, shown when the plot has one (CAP-03) -----------
// The map is Web Mercator, north up everywhere, so the arrow always points up.
let northArrow: HTMLElement | undefined;
const NorthArrow = L.Control.extend({
  onAdd() {
    const div = L.DomUtil.create("div", "north-arrow");
    div.setAttribute("role", "img");
    div.setAttribute("aria-label", "North arrow: north is up");
    div.innerHTML =
      '<svg viewBox="0 0 24 36" width="24" height="36" aria-hidden="true"><path d="M12 2 L20 26 L12 21 L4 26 Z" fill="currentColor"/><text x="12" y="35" text-anchor="middle" font-size="10" fill="currentColor">N</text></svg>'; // not user-facing
    div.hidden = true;
    northArrow = div;
    return div;
  },
});
new NorthArrow({ position: "topright" }).addTo(map);

// --- Zoom buttons and legend -----------------------------------------------------
let plotBounds = L.latLngBounds([]);
function boundsOf(ids: Iterable<string>): L.LatLngBounds {
  const bounds = L.latLngBounds([]);
  for (const id of ids) for (const layer of [...(drawn.get(id)?.layers ?? []), ...(drawn.get(id)?.windowed ?? [])]) {
    if (layer instanceof L.Polyline || layer instanceof L.Polygon) bounds.extend(layer.getBounds());
    else if (layer instanceof L.CircleMarker) bounds.extend(layer.getLatLng());
  }
  return bounds;
}
const Zoom = L.Control.extend({
  onAdd() {
    const bar = L.DomUtil.create("div", "leaflet-bar zoom-to");
    const button = (label: string, title: string, action: () => void) => {
      const a = L.DomUtil.create("a", "", bar);
      a.textContent = label;
      a.title = title;
      a.href = "#";
      a.setAttribute("role", "button");
      a.setAttribute("aria-label", title);
      L.DomEvent.on(a, "click", (e) => {
        L.DomEvent.preventDefault(e);
        action();
      });
    };
    button("Plot", "Zoom to the whole plot", () => fit(plotBounds));
    button("Selected", "Zoom to the selection", () => fit(boundsOf(selection)));
    L.DomEvent.disableClickPropagation(bar);
    return bar;
  },
});
new Zoom({ position: "topleft" }).addTo(map);

const Legend = L.Control.extend({
  onAdd() {
    const div = L.DomUtil.create("details", "legend");
    L.DomUtil.create("summary", "", div).textContent = "Key";
    const rows: [string, string][] = [
      ["track", "Track in the time window, in its force colour; arrows show direction"],
      ["context", "Track outside the time window"],
      ["first", "First fix in the window"],
      ["latest", "Last fix in the window, labelled"],
      ["now", "Position at current time"],
      ["time", "Time label, at the interval set for the track"],
      ["symbol", "Symbol, at the interval set for the track"],
      ["marked", "Marked fix: its own colour, a label or a comment; right-click a fix to mark it"],
      ["check", "Fix to check, such as a jump found"],
      ["cut", "Sensor cut in the time window, in its sensor's colour, from its track"],
      ["cut-twin", "Ambiguous cut: port solid, starboard darker and dashed; click the line to keep"],
      ["cut-now", "Cut at current time"],
      ["annotation", "Annotation, including what tools draw: dashed unless given a style"],
      ["selected", "Selected"],
    ];
    for (const [kind, label] of rows) {
      const row = L.DomUtil.create("div", "legend-row", div);
      const swatch = L.DomUtil.create("span", `swatch swatch-${kind}`, row);
      if (kind === "time") swatch.textContent = "0930";
      L.DomUtil.create("span", "", row).textContent = label;
      if (kind === "time" || kind === "symbol") row.hidden = true; // shown once a track has them
      if (kind.startsWith("cut")) row.hidden = true; // shown once the plot has sensor cuts
    }
    return div;
  },
});
new Legend({ position: "bottomleft" }).addTo(map);

// Hidden features (SUB-22): hiding is shared, so the map always says how many
// are hidden and offers to show them. Added after the key, so it sits above it.
let hiddenControl: { count: HTMLElement; box: HTMLElement } | undefined;
const Hidden = L.Control.extend({
  onAdd() {
    const box = L.DomUtil.create("div", "hidden-control");
    box.hidden = true;
    box.setAttribute("role", "status");
    const count = L.DomUtil.create("span", "", box);
    const show = L.DomUtil.create("button", "", box);
    show.textContent = "Show all";
    show.title = "Show every hidden feature on the map";
    L.DomEvent.on(show, "click", (e) => {
      L.DomEvent.stopPropagation(e);
      host.postMessage({ kind: "show_hidden" });
    });
    L.DomEvent.disableClickPropagation(box);
    hiddenControl = { count, box };
    return box;
  },
});
new Hidden({ position: "bottomleft" }).addTo(map);

// Labels, symbols or arrows thinned to fit the zoom (CAP-32): the map says so, quietly.
let thinNote: HTMLElement | undefined;
const ThinNote = L.Control.extend({
  onAdd() {
    const note = L.DomUtil.create("div", "thin-note");
    note.hidden = true;
    note.setAttribute("role", "status");
    thinNote = note;
    return note;
  },
});
new ThinNote({ position: "bottomleft" }).addTo(map);
function showHidden(count: number): void {
  if (!hiddenControl) return;
  hiddenControl.box.hidden = count === 0;
  hiddenControl.count.textContent = `${count} hidden`;
}
document.documentElement.style.setProperty("--debrief-annotation", DATA_COLOURS.annotation);
document.documentElement.style.setProperty("--debrief-track", DATA_COLOURS.track);

// --- Reference data: land and graticule ---------------------------------------
const reference = L.layerGroup().addTo(map);
fetch(document.body.dataset.land!)
  .then((r) => r.json())
  .then((land) =>
    L.geoJSON(land, {
      interactive: false,
      style: { color: DATA_COLOURS.land, weight: 0.6, fillColor: DATA_COLOURS.land, fillOpacity: 0.35 },
    }).addTo(reference),
  )
  .catch(() => undefined);

const graticule = L.layerGroup().addTo(map);
function drawGraticule(): void {
  graticule.clearLayers();
  const bounds = map.getBounds();
  const span = Math.max(bounds.getEast() - bounds.getWest(), bounds.getNorth() - bounds.getSouth());
  // The largest step that still gives at least four lines across the view.
  const step = [10, 5, 2, 1, 0.5, 0.25, 1 / 6, 1 / 12, 1 / 30, 1 / 60].find((s) => span / s >= 4) ?? 1 / 60;
  const style = { color: DATA_COLOURS.graticule, weight: 1, opacity: 0.6, interactive: false };
  for (let lat = Math.ceil(bounds.getSouth() / step) * step; lat <= bounds.getNorth(); lat += step) {
    L.polyline([[lat, bounds.getWest() - 1], [lat, bounds.getEast() + 1]], style).addTo(graticule);
  }
  for (let lon = Math.ceil(bounds.getWest() / step) * step; lon <= bounds.getEast(); lon += step) {
    L.polyline([[bounds.getSouth() - 1, lon], [bounds.getNorth() + 1, lon]], style).addTo(graticule);
  }
}
map.on("moveend", drawGraticule);

// --- Plot features ------------------------------------------------------------
const halo = L.layerGroup().addTo(map);
const features = L.layerGroup().addTo(map);
let selection = new Set<string>();
let plotId = "";
/**
 * What is drawn for each feature. layers and paths are drawn once per plot;
 * windowed and windowedPaths are a track's part in the time window, drawn
 * again whenever the window moves; context is a track's whole line, thin.
 */
interface Drawn {
  layers: L.Layer[];
  paths: L.Path[];
  windowed: L.Layer[];
  windowedPaths: L.Path[];
  context?: L.Polyline;
  /** How the context line is drawn now; none when context tracks are hidden. */
  contextStyle?: ContextStyle;
  /** The track's own colour. */
  colour?: string;
  /** An annotation's time or period, if it has one. */
  when?: { start: number; end: number };
  /** A track's time labels at its interval, in view (its symbols and arrows are painted: paintMarks). */
  timeLabels?: L.Marker[];
  /** A track's first and last fix in the time window, where its end markers are. */
  ends?: [number, number];
}
const drawn = new Map<string, Drawn>();

// --- Context tracks: each track outside the window (CAP-29, expert panel 12 Oct) ----
/** How tracks outside the window are drawn: the plot's choice, the analyst's setting applied by the host. */
let contextMode: ContextTracks = "visible";
/** The theme the map is drawn on, read from VS Code's variables each time it is needed. */
function mapTheme(): MapTheme {
  const classes = document.body.classList;
  const highContrast = classes.contains("vscode-high-contrast") || classes.contains("vscode-high-contrast-light");
  const light = classes.contains("vscode-light") || classes.contains("vscode-high-contrast-light");
  const fallback = (dark: number): Rgb => [dark, dark, dark];
  return {
    background: parseColour(css("--vscode-editor-background")) ?? fallback(light ? 1 : 0.12),
    foreground: parseColour(css("--vscode-editor-foreground")) ?? fallback(light ? 0.2 : 0.83),
    highContrast,
  };
}
/** Draw each track's context line as the mode and theme now say, then its selection state. */
function applyContext(): void {
  const theme = mapTheme();
  for (const entry of drawn.values()) {
    if (!entry.context || !entry.colour) continue;
    entry.contextStyle = contextStyle(entry.colour, contextMode, theme);
    if (!entry.contextStyle) {
      features.removeLayer(entry.context);
      continue;
    }
    const { colour, weight } = entry.contextStyle;
    entry.context.setStyle({ color: colour, weight });
    (entry.context.options as { baseWeight?: number }).baseWeight = weight;
    if (!features.hasLayer(entry.context)) {
      features.addLayer(entry.context);
      entry.context.bringToBack();
      for (const area of areas) area.bringToBack();
    }
  }
  showContextKey(theme);
  restyle();
}
/** The key's context row: drawn as a track of the default colour would be, or gone when hidden. */
function showContextKey(theme: MapTheme): void {
  const swatch = document.querySelector<HTMLElement>(".swatch-context");
  if (!swatch) return;
  const style = contextStyle(DATA_COLOURS.track, contextMode, theme);
  swatch.parentElement!.hidden = !style;
  if (!style) return;
  swatch.style.borderTopColor = style.colour;
  swatch.style.borderTopWidth = `${style.weight}px`;
  swatch.style.opacity = String(style.opacity);
}
// VS Code changes theme by changing the page's classes and variables: draw again for the new one.
// Only then: Leaflet marks the body while the map is dragged (leaflet-dragging), at the start and
// end of every pan, and drawing everything again for that made each pan stutter.
const themeOf = () => [Array.from(document.body.classList).filter((c) => c.startsWith("vscode-")).join(" "), document.documentElement.className, document.documentElement.getAttribute("style") ?? ""].join("|");
let shownTheme = themeOf();
const themeChanged = () => {
  const theme = themeOf();
  if (theme === shownTheme) return;
  shownTheme = theme;
  applyContext();
};
new MutationObserver(themeChanged).observe(document.body, { attributes: true, attributeFilter: ["class"] });
new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });

function colourOf(feature: Feature): string {
  if (feature.properties.kind === "track") return feature.properties.style?.colour ?? DATA_COLOURS.track;
  if (feature.properties.kind === "annotation") return feature.properties.appearance?.colour ?? DATA_COLOURS.annotation;
  return DATA_COLOURS.annotation;
}

function select(id: string | undefined, add: boolean): void {
  const next = new Set(add ? selection : []);
  if (id) {
    if (add && next.has(id)) next.delete(id);
    else next.add(id);
  }
  selection = next;
  restyle();
  editor.setSelection([...selection]);
  trackEditor.setSelection([...selection]);
  host.postMessage({ kind: "selection_changed", selection: { plot: plotId, feature_ids: [...selection] } });
}

function restyle(): void {
  const any = selection.size > 0;
  for (const [id, { paths, windowedPaths, context, contextStyle: style }] of drawn) {
    const selected = selection.has(id);
    for (const path of [...paths, ...windowedPaths]) {
      const base = (path.options as { baseWeight?: number }).baseWeight ?? 2;
      path.setStyle({ weight: selected ? base + 1 : base, opacity: !any || selected ? 1 : 0.3 });
    }
    // Dimmed for a selection elsewhere: a state of its own, never below its floor.
    if (context && style) context.setStyle({ opacity: !any || selected ? style.opacity : style.dimmed });
  }
  for (const [id, { timeLabels }] of drawn) {
    const opacity = !any || selection.has(id) ? 1 : 0.3;
    timeLabels?.forEach((marker) => marker.setOpacity(opacity));
  }
  paintMarks();
  sensorLayer.paint();
  halo.clearLayers();
  const outline = css("--vscode-editor-foreground");
  for (const id of selection) {
    if (editing.has(id)) continue; // drawn changed, with its handles, instead
    const entry = drawn.get(id);
    // The track's part in the window, or its whole line when none of it is in the window.
    const outlined = entry?.windowedPaths.length ? [...entry.paths, ...entry.windowedPaths] : [...(entry?.paths ?? []), ...(entry?.context ? [entry.context] : [])];
    for (const path of outlined) {
      if (path instanceof L.Polyline) {
        const weight = ((path.options as { baseWeight?: number }).baseWeight ?? 2) + 5;
        L.polyline(path.getLatLngs() as L.LatLng[], { color: outline, weight, opacity: 0.55, dashArray: "2 8", lineCap: "round", interactive: false }).addTo(halo);
      }
    }
  }
}

function nearestFix(track: Track, at: L.LatLng): number {
  const coordinates = track.geometry.coordinates as LonLat[];
  const target = map.latLngToLayerPoint(at);
  let best = 0;
  let bestDistance = Infinity;
  coordinates.forEach((c, i) => {
    const d = map.latLngToLayerPoint(toLatLng(c)).distanceTo(target);
    if (d < bestDistance) [best, bestDistance] = [i, d];
  });
  return best;
}

function describeFix(track: Track, index: number): string {
  const props = track.properties;
  const parts = [trackLabel(props), describeFixOnly(track, index, settings)];
  const depth = props.depths?.values[index];
  if (depth !== undefined && props.depths) parts.push(`depth ${formatQuantity({ value: depth, unit: props.depths.unit }, settings)}`);
  // A marked fix says its label and comment too (EXT-14).
  const mark = props.fix_marks?.find((m) => m.time === props.times[index]);
  const forced = [mark?.show_label ? "time label" : "", mark?.show_symbol ? "symbol" : ""].filter(Boolean).join(" and ");
  const said = [parts.join("  ·  "), mark?.label ? `Label: ${mark.label}` : "", mark?.comment ? `Comment: ${mark.comment}` : "", forced ? `Always shows its ${forced}` : ""];
  return said.filter(Boolean).join("\n");
}

function directionTicks(coordinates: LonLat[], colour: string): L.Marker[] {
  if (coordinates.length < 3) return [];
  const count = Math.min(5, coordinates.length - 1);
  const ticks: L.Marker[] = [];
  for (let k = 1; k <= count; k++) {
    const i = Math.min(coordinates.length - 2, Math.floor((k * (coordinates.length - 1)) / (count + 1)));
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];
    // Drawn halfway along the leg, pointing along it there, so it sits on the line however long the leg.
    const leg = WGS84.Inverse(lat1, lon1, lat2, lon2);
    const half = WGS84.Direct(lat1, lon1, leg.azi1 ?? 0, (leg.s12 ?? 0) / 2);
    const azimuth = half.azi2 ?? leg.azi1 ?? 0;
    const icon = L.divIcon({ className: "tick", html: TICK_SVG, iconSize: [TICK_SIZE, TICK_SIZE], iconAnchor: [TICK_SIZE / 2, TICK_SIZE / 2] });
    const lon = lon1 + ((((half.lon2 ?? lon1) - lon1 + 540) % 360) - 180); // beside the leg, across 180° too
    const marker = L.marker([half.lat2 ?? lat1, lon], { icon, interactive: false, keyboard: false });
    marker.on("add", () => {
      const element = marker.getElement();
      if (element) {
        element.style.setProperty("--tick-colour", colour);
        element.style.setProperty("--tick-rotation", `${azimuth}deg`);
      }
    });
    ticks.push(marker);
  }
  return ticks;
}

/** A chevron pointing up (north), centred in its box: rotated to the course, its middle is on the line. */
const TICK_SIZE = 20;
const TICK_SVG =
  `<svg viewBox="0 0 16 16" width="${TICK_SIZE}" height="${TICK_SIZE}" aria-hidden="true">` +
  `<path class="tick-halo" d="M3 11 L8 5 L13 11"/><path class="tick-mark" d="M3 11 L8 5 L13 11"/></svg>`;

/** Areas, kept underneath everything else, so a track crossing an area's edge is on top. */
let areas: L.Path[] = [];
function draw(plot: DebriefFeatureCollection): void {
  areas = [];
  annotations = new Map(
    plot.features.filter((f): f is Annotation => f.properties.kind === "annotation" && !!f.geometry && !f.properties.furniture).map((f) => [f.id, f]),
  );
  features.clearLayers();
  drawn.clear();
  sized.length = 0;
  plotBounds = L.latLngBounds([]);
  if (northArrow) {
    northArrow.hidden = !plot.features.some((f) => f.properties.kind === "annotation" && f.properties.furniture === "north_arrow");
  }
  for (const feature of plot.features) {
    const colour = colourOf(feature);
    const geometry = feature.geometry;
    // Time-only annotations live in the outline (CAP-04); the plot's own details are not drawn.
    if (!geometry || feature.properties.kind === "plot") continue;
    const layers: L.Layer[] = [];
    const paths: L.Path[] = [];
    // An area, circle or ellipse is filled: a cut's line across it is clicked through it (CAP-22).
    const filled = feature.properties.kind === "annotation" && ["area", "circle", "ellipse"].includes(shapeOf(feature.properties as AnnotationProperties, geometry.type));
    const click = (event: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(event);
      if (editor.takeClick(event)) return; // drawing: a click places a point, even on a track
      if (filled && clickCut(event)) return;
      select(feature.id, event.originalEvent.ctrlKey || event.originalEvent.metaKey);
    };
    const isTrack = feature.properties.kind === "track";
    if (geometry.type === "LineString") {
      const coordinates = geometry.coordinates as LonLat[];
      const latlngs = densify(coordinates).map(toLatLng);
      if (isTrack) {
        // The whole track, solid and thin: context for the part in the window, drawn in drawWindow.
        // No ticks, dots or labels: those belong to the window. Styled in applyContext.
        const track = feature as Track;
        const context = L.polyline(latlngs, { color: colour, weight: CONTEXT_WEIGHT, baseWeight: CONTEXT_WEIGHT } as L.PolylineOptions);
        context.on("click", click);
        hoverFixes(context, track);
        layers.push(context);
        latlngs.forEach((p) => plotBounds.extend(p));
        context.addTo(features);
        drawn.set(feature.id, { layers, paths, windowed: [], windowedPaths: [], context, colour });
        continue;
      }
    }
    if (feature.properties.kind === "annotation") {
      drawAnnotation(feature as Annotation, click, layers, paths);
    }
    [...paths, ...layers].forEach((layer) => layer.addTo(features));
    drawn.set(feature.id, { layers: [...paths, ...layers], paths, windowed: [], windowedPaths: [], when: timeOf(feature) });
  }
  areas.reverse();
  applyContext();
  const empty = document.getElementById("empty")!;
  empty.hidden = plot.features.some((f) => f.geometry);
  empty.textContent = plot.features.length ? "This plot has nothing with a position." : "This plot is empty. Import a REP file to add tracks.";
  setTracks(plot.features.filter((f): f is Track => f.properties.kind === "track" && !!f.geometry));
  sensorLayer.setPlot(plot);
  closeCutPopover();
  showCutKey();
  drawnWindow = undefined;
  drawWindow();
  drawGraticule();
  placeLabels();
}

type Annotation = Extract<Feature, { properties: { kind: "annotation" } }>;

/** Line options from an annotation's look. baseWeight is what selection adds to. */
const lineOptions = (look: Look) => ({ color: look.colour, weight: look.weight, dashArray: look.dashArray, lineCap: look.lineCap, baseWeight: look.weight });

/**
 * Draw an annotation by its look (CAP-03): a line, an area, a circle or an
 * ellipse (from its centre and size, along geodesics), a label or a marker.
 * Its label goes where its look says; double-clicking it asks for its form.
 */
function drawAnnotation(feature: Annotation, click: (event: L.LeafletMouseEvent) => void, layers: L.Layer[], paths: L.Path[]): void {
  const geometry = feature.geometry!;
  const props = feature.properties as AnnotationProperties;
  const shape = shapeOf(props, geometry.type);
  const look = lookOf(shape, props.appearance);
  const placement = labelPlacement(look.labelPosition);
  const label = labelText(shape, props);
  const edit = (event: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(event);
    if (editor.takeDoubleClick(event)) return; // drawing: a double-click finishes
    host.postMessage({ kind: "edit_annotation", feature_id: feature.id });
  };
  const tooltip = (layer: L.Layer, direction = placement?.direction, offset = placement?.offset) => {
    if (placement) layer.bindTooltip(text(label, look.labelSize), { permanent: true, direction, offset, className: "annotation-label" });
  };
  if (geometry.type === "LineString") {
    const latlngs = densify(geometry.coordinates as LonLat[]).map(toLatLng);
    const line = L.polyline(latlngs, lineOptions(look) as L.PolylineOptions);
    line.on("click", click).on("dblclick", edit);
    tooltip(line);
    paths.push(line);
    latlngs.forEach((p) => plotBounds.extend(p));
  } else if (geometry.type === "Polygon") {
    const centre = props.centre as LonLat | undefined;
    const metres = (q: { value: number; unit: string }) => convert(q, "m").value;
    const rings =
      shape === "circle" && centre && props.radius
        ? [circleRing(centre, metres(props.radius)).map(toLatLng)]
        : shape === "ellipse" && centre && props.semi_major && props.semi_minor
          ? [ellipseRing(centre, metres(props.semi_major), metres(props.semi_minor), convert(props.orientation ?? { value: 0, unit: "deg" }, "deg").value).map(toLatLng)]
          : (geometry.coordinates as LonLat[][]).map((ring) => densify(ring).map(toLatLng));
    // An area is selected by its outline, never by a click inside it: what lies inside,
    // such as a track in an exercise area, must stay clickable. Its fill takes no
    // clicks, and a wide, invisible line along its edge takes them instead.
    const polygon = L.polygon(rings, { ...lineOptions(look), fillColor: look.fillColour, fillOpacity: look.fillOpacity, interactive: false } as L.PolylineOptions);
    const edge = L.polyline(
      rings.map((ring) => [...ring, ring[0]]),
      { color: look.colour, opacity: 0, weight: 10, className: "area-edge" },
    );
    edge.on("click", click).on("dblclick", edit);
    paths.push(polygon);
    layers.push(edge);
    areas.push(polygon, edge);
    if (placement) {
      // The label at the edge its position names, so nested rings each keep a readable label.
      const outer = rings[0];
      const pick = (better: (a: L.LatLng, b: L.LatLng) => boolean) => outer.reduce((a, b) => (better(b, a) ? b : a));
      const anchor =
        look.labelPosition === "below"
          ? pick((a, b) => a.lat < b.lat)
          : look.labelPosition === "left"
            ? pick((a, b) => a.lng < b.lng)
            : look.labelPosition === "right"
              ? pick((a, b) => a.lng > b.lng)
              : look.labelPosition === "centre"
                ? L.latLngBounds(outer).getCenter()
                : pick((a, b) => a.lat > b.lat);
      const marker = L.marker(anchor, { icon: L.divIcon({ className: "annotation-anchor", iconSize: [0, 0] }), interactive: false, keyboard: false });
      tooltip(marker);
      layers.push(marker);
      // Hidden while the shape is too small on screen to carry it: a label Debrief placed
      // needs room around it; one whose place the analyst chose stays down to a small mark.
      sized.push({ label: marker, bounds: L.latLngBounds(outer), least: props.appearance?.label_position ? CHOSEN_LABEL_ROOM : LABEL_ROOM });
    }
    rings[0].forEach((p) => plotBounds.extend(p));
  } else if (geometry.type === "Point") {
    const point = toLatLng(geometry.coordinates as LonLat);
    // A label is its text, at a small dot; a marker is a ring with its name beside it.
    const dashArray = props.appearance?.line_style ? look.dashArray : shape === "label" ? undefined : "2 2";
    const marker =
      shape === "label"
        ? L.circleMarker(point, { radius: 2.5, color: look.colour, fillColor: look.colour, fillOpacity: 1, weight: 1, baseWeight: 1 } as L.CircleMarkerOptions)
        : L.circleMarker(point, { radius: 5, color: look.colour, weight: look.weight, dashArray, fillColor: look.colour, fillOpacity: 0.25, baseWeight: look.weight } as L.CircleMarkerOptions);
    marker.on("click", click).on("dblclick", edit);
    tooltip(marker);
    paths.push(marker);
    plotBounds.extend(point);
  }
}

/** An annotation's time or period, if it has one: it is drawn only while that is in the window. */
function timeOf(feature: Feature): { start: number; end: number } | undefined {
  if (feature.properties.kind !== "annotation") return undefined;
  const { time, time_range: range } = feature.properties;
  if (range) return { start: Date.parse(range.start), end: Date.parse(range.end) };
  return time ? { start: Date.parse(time), end: Date.parse(time) } : undefined;
}

/** Hovering a track line shows its nearest fix; right-clicking it (or pressing and holding it) asks to colour, label or comment on that fix. */
function hoverFixes(line: L.Polyline, track: Track): void {
  holdable(line);
  line.bindTooltip(text(trackLabel(track.properties)), { sticky: true, className: "fix-tooltip" });
  line.on("mousemove", (event: L.LeafletMouseEvent) => {
    line.setTooltipContent(text(describeFix(track, nearestFix(track, event.latlng))));
  });
  line.on("contextmenu", (event: L.LeafletMouseEvent) => chooseFix(event, track, nearestFix(track, event.latlng)));
}

/** The analyst asked to colour, label or comment on a fix: the host asks which. Never while drawing. */
function chooseFix(event: L.LeafletMouseEvent, track: Track, index: number): void {
  L.DomEvent.stop(event);
  if (editor.active) return;
  host.postMessage({ kind: "fix_chosen", feature_id: track.id, fix_time: track.properties.times[index] });
}

/**
 * The marked fixes of a track's part in the window (EXT-14): a fix with a colour of its own
 * is a dot in it, and the line from it to the next fix is drawn in it; any other marked fix
 * is a ring in the track's colour. A label is drawn beside its fix; pointing at the fix shows
 * its comment. Each takes a click as the track does, and a right-click (or a press and hold) as its fix.
 */
function drawMarks(track: Track, first: number, last: number, colour: string, click: (event: L.LeafletMouseEvent) => void): { paths: L.Path[]; labels: L.Layer[] } {
  const marks = marksByIndex(track);
  const paths: L.Path[] = [];
  const labels: L.Layer[] = [];
  if (!marks.size) return { paths, labels };
  const coordinates = track.geometry.coordinates as LonLat[];
  for (const [i, mark] of marks) {
    if (i < first || i > last) continue;
    // A mark that only shows its time label or symbol always is drawn with the track's others (drawGrid).
    if (!mark.colour && !mark.label && !mark.comment) continue;
    const own = mark.colour ?? colour;
    if (mark.colour && i + 1 < coordinates.length) {
      const leg = L.polyline(densify([coordinates[i], coordinates[i + 1]]).map(toLatLng), { color: mark.colour, weight: WINDOW_WEIGHT, baseWeight: WINDOW_WEIGHT, className: "fix-leg" } as L.PolylineOptions);
      leg.on("click", click);
      hoverFixes(leg, track); // which also takes a right-click or a hold, as the fix nearest it
      paths.push(leg);
    }
    const dot = L.circleMarker(toLatLng(coordinates[i]), { radius: 4.5, color: own, weight: 2, fillColor: own, fillOpacity: mark.colour ? 1 : 0, baseWeight: 2, className: "fix-mark" } as L.CircleMarkerOptions);
    dot.bindTooltip(text(describeFix(track, i)), { className: "fix-tooltip" });
    dot.on("click", click).on("contextmenu", (event: L.LeafletMouseEvent) => chooseFix(event, track, i));
    holdable(dot);
    paths.push(dot);
    if (mark.label) {
      const anchor = L.marker(toLatLng(coordinates[i]), { icon: L.divIcon({ className: "annotation-anchor", iconSize: [0, 0] }), interactive: false, keyboard: false });
      anchor.bindTooltip(text(mark.label), { permanent: true, direction: "right", offset: [7, 0], className: "fix-label" });
      labels.push(anchor);
    }
  }
  return { paths, labels };
}

// --- Press and hold on a touch screen: a right-click (presshold.ts) --------------------
// A finger or pen held still on a track or a marked fix opens that fix's menu, as a
// right-click does: a tablet has no right button. The hold is sent on as a right-click
// at that place, so it goes where a right-click would. A tap still selects; a finger that
// moves pans the map or drags a handle; two fingers zoom. A right-click the browser makes
// of the same hold (Android does) is the same gesture, so only one opens the menu.
const HOLDABLE = "fix-hold";
/** Pressing and holding this track line or fix opens its fix's menu. */
function holdable(layer: L.Path): void {
  layer.on("add", () => layer.getElement()?.classList.add(HOLDABLE));
}
let holding = false; // sending the hold on as a right-click
const pressHold = new PressHold((x, y) => {
  if (editor.active) return; // drawing: a hold is not a choice of fix
  const target = document.elementFromPoint(x, y)?.closest(`.${HOLDABLE}`);
  if (!target || !mapElement.contains(target)) {
    const box = mapElement.getBoundingClientRect();
    chooseCut(L.point(x - box.left, y - box.top));
    return;
  }
  holding = true;
  try {
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2, buttons: 0 }));
  } finally {
    holding = false;
  }
});
const touchy = (event: PointerEvent) => event.pointerType === "touch" || event.pointerType === "pen";
mapElement.addEventListener(
  "pointerdown",
  (event) => {
    if (!touchy(event)) return pressHold.reset();
    if (event.isPrimary) pressHold.reset(); // a new gesture: a finger whose lifting was missed is gone
    pressHold.press(event.pointerId, event.clientX, event.clientY);
  },
  true,
);
mapElement.addEventListener("pointermove", (event) => touchy(event) && pressHold.move(event.pointerId, event.clientX, event.clientY), true);
for (const type of ["pointerup", "pointercancel"] as const) {
  window.addEventListener(type, (event) => touchy(event) && pressHold.release(event.pointerId), true);
}
mapElement.addEventListener(
  "contextmenu",
  (event) => {
    if (holding) return;
    if (pressHold.fired) {
      L.DomEvent.stop(event); // the browser's own right-click for a hold already sent on
    } else if (pressHold.pressing) {
      pressHold.cancel(); // the browser's right-click came first: it is the one
    }
  },
  true,
);
mapElement.addEventListener(
  "click",
  (event) => {
    if (pressHold.fired && !pressHold.pressing) {
      L.DomEvent.stop(event); // the tap that ends a hold is not a click: it would select
      pressHold.reset();
    }
  },
  true,
);
map.on("movestart zoomstart dragstart", () => pressHold.cancel());

// --- Fixes the host rings for the analyst to check, and a change previewed (show_fixes) ----
const checks = L.layerGroup().addTo(map);
/** What the note at the top of the map says for show_fixes, so taking them away clears only that. */
let checkNote = "";
/** Where the fixes ringed for the analyst to check are, so none is ever off the map unseen. */
let checkBounds: L.LatLngBounds | undefined;
function showFixes(message: { feature_id?: string; fix_times?: string[]; preview?: { coordinates: number[][] }; message?: string }): void {
  checks.clearLayers();
  checkBounds = undefined;
  const entry = tracks.find((t) => t.track.id === message.feature_id);
  if (!entry) {
    if (checkNote) editor.say("");
    checkNote = "";
    return;
  }
  const { track } = entry;
  const ring = css("--vscode-editorWarning-foreground") || css("--vscode-focusBorder");
  if (message.preview) {
    // The track as the change would leave it, over the track as it is.
    const coordinates = message.preview.coordinates as LonLat[];
    L.polyline(densify(coordinates).map(toLatLng), { color: css("--vscode-focusBorder"), weight: 2.5, dashArray: "6 4", interactive: false, className: "fix-preview" }).addTo(checks);
  }
  const wanted = new Set(message.fix_times ?? []);
  const ringed: L.LatLng[] = [];
  track.properties.times.forEach((time, i) => {
    if (!wanted.has(time)) return;
    wanted.delete(time); // the first fix at a time
    const at = toLatLng(track.geometry.coordinates[i] as LonLat);
    const marker = L.circleMarker(at, { radius: 9, color: ring, weight: 2.5, fill: false, className: "fix-check" });
    marker.bindTooltip(text(`To check: ${describeFix(track, i)}`), { className: "fix-tooltip" });
    marker.addTo(checks);
    ringed.push(at);
  });
  checkBounds = ringed.length ? L.latLngBounds(ringed) : undefined;
  keepChecksInView();
  checkNote = message.message ?? "";
  if (checkNote) editor.say(checkNote);
  else editor.say("");
}
/** Zoom out, keeping what is shown, until every fix ringed to check is in view. */
function keepChecksInView(): void {
  if (!checkBounds || map.getBounds().pad(-0.05).contains(checkBounds)) return;
  fitting = true;
  map.fitBounds(L.latLngBounds([checkBounds.getSouthWest(), checkBounds.getNorthEast()]).extend(map.getBounds()), { padding: [24, 24], animate: false });
  fitting = false;
  placeLabels();
}

// --- The time window (CAP-28, CAP-29) ----------------------------------------------
/** The window last drawn, so a change to current time alone draws nothing again. */
let drawnWindow: { start: number; end: number } | undefined;
const ALL = { start: -Infinity, end: Infinity };

/**
 * Draw what depends on the time window: each track's part in it, with its
 * ticks and end dots, and the annotations whose time falls in it.
 */
function drawWindow(): void {
  const window = time ? { start: Date.parse(time.range.start), end: Date.parse(time.range.end) } : ALL;
  if (drawnWindow && drawnWindow.start === window.start && drawnWindow.end === window.end) return;
  drawnWindow = window;
  for (const entry of tracks) {
    const shown = drawn.get(entry.track.id);
    if (!shown) continue;
    shown.windowed.forEach((layer) => features.removeLayer(layer));
    shown.windowed = [];
    shown.windowedPaths = [];
    const part = partIn(entry, window);
    shown.ends = part?.first !== undefined && part.last !== undefined ? [part.first, part.last] : undefined;
    if (!part) continue;
    const { track } = entry;
    const colour = colourOf(track);
    const click = (event: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(event);
      if (editor.takeClick(event)) return;
      select(track.id, event.originalEvent.ctrlKey || event.originalEvent.metaKey);
    };
    const line = L.polyline(densify(part.coordinates).map(toLatLng), { color: colour, weight: WINDOW_WEIGHT, baseWeight: WINDOW_WEIGHT } as L.PolylineOptions);
    line.on("click", click);
    hoverFixes(line, track);
    shown.windowedPaths.push(line);
    if (part.first !== undefined && part.last !== undefined) {
      const coordinates = track.geometry.coordinates as LonLat[];
      const first = L.circleMarker(toLatLng(coordinates[part.first]), { radius: 4, color: colour, weight: 2, fill: true, fillOpacity: 0, baseWeight: 2 } as L.CircleMarkerOptions);
      first.bindTooltip(text(describeFix(track, part.first)));
      const last = L.circleMarker(toLatLng(coordinates[part.last]), { radius: 4.5, color: colour, fillColor: colour, fillOpacity: 1, weight: 1, baseWeight: 1 } as L.CircleMarkerOptions);
      last.bindTooltip(text(trackLabel(track.properties)), { permanent: true, direction: "right", className: "track-label", offset: [6, 0] });
      first.on("click", click);
      last.on("click", click);
      shown.windowedPaths.push(first, last);
    }
    const marked = part.first !== undefined && part.last !== undefined ? drawMarks(track, part.first, part.last, colour, click) : { paths: [], labels: [] };
    shown.windowedPaths.push(...marked.paths);
    // Arrows: a few along the track by default; at an interval set for it, drawn by drawGrid; or none.
    const arrows = track.properties.arrow_interval === undefined || track.properties.arrow_interval === null ? directionTicks(part.coordinates, colour) : [];
    shown.windowed = [...shown.windowedPaths, ...marked.labels, ...arrows];
    shown.windowed.forEach((layer) => layer.addTo(features));
  }
  for (const shown of drawn.values()) {
    if (!shown.when) continue;
    const inWindow = shown.when.end >= window.start && shown.when.start <= window.end;
    for (const layer of shown.layers) {
      if (inWindow) features.addLayer(layer);
      else features.removeLayer(layer);
    }
  }
  for (const area of areas) area.bringToBack();
  restyle();
  drawNow();
  drawGrid();
  editor.refresh(); // an annotation with handles may have come into the window, or left it
  trackEditor.refresh(); // what moves, if only the fixes in the window
}

// --- Labels, symbols and arrows at each track's intervals (CAP-32, frequencies.ts) -----
/**
 * Symbols and arrows: painted on one canvas above the tracks, beneath the markers at current
 * time, so thousands of them cost one image, not thousands of elements, to pan. Never
 * interactive, so never in the way; hidden from screen readers, as the arrows and dots of the
 * tracks are. It says how many of each it holds (data-symbols, data-arrows).
 */
map.createPane("freqMarks").style.zIndex = "450";
const marksCanvas = L.DomUtil.create("canvas", "freq-marks", map.getPane("freqMarks"));
marksCanvas.setAttribute("aria-hidden", "true");
/** Painted beyond the view by this share of it each way, so a short pan shows them already there. */
const MARKS_PAD = 0.25;
/** What the canvas holds: each symbol and arrow on the map's plane (see Projected), its track, colour and course. */
let marks: { kind: "symbol" | "arrow"; x: number; y: number; track: string; colour: string; course?: number }[] = [];
map.on("zoomstart", () => (marksCanvas.style.visibility = "hidden")); // painted again for the new zoom
/** Paint the symbols and arrows for the view as it is, dimmed where a selection is elsewhere (restyle). */
function paintMarks(background = css("--vscode-editor-background")): void {
  const size = map.getSize();
  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
  const corner = map.containerPointToLayerPoint([-size.x * MARKS_PAD, -size.y * MARKS_PAD]);
  const width = size.x * (1 + 2 * MARKS_PAD);
  const height = size.y * (1 + 2 * MARKS_PAD);
  if (marksCanvas.width !== Math.round(width * ratio) || marksCanvas.height !== Math.round(height * ratio)) {
    marksCanvas.width = Math.round(width * ratio);
    marksCanvas.height = Math.round(height * ratio);
    marksCanvas.style.width = `${width}px`;
    marksCanvas.style.height = `${height}px`;
  }
  L.DomUtil.setPosition(marksCanvas, corner);
  const context = marksCanvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const scale = crs.scale(map.getZoom());
  const origin = map.getPixelOrigin();
  const any = selection.size > 0;

  // How many it holds, in view or near it (as drawGrid chose them), for tests and tools.
  const counts = { symbol: 0, arrow: 0 };
  for (const mark of marks) counts[mark.kind]++;
  context.lineCap = "round";
  context.lineJoin = "round";
  const k = TICK_SIZE / 16;
  for (const mark of marks) {
    const x = mark.x * scale - origin.x - corner.x;
    const y = mark.y * scale - origin.y - corner.y;
    if (x < -TICK_SIZE || y < -TICK_SIZE || x > width + TICK_SIZE || y > height + TICK_SIZE) continue;
    const alpha = !any || selection.has(mark.track) ? 1 : 0.3;
    if (mark.kind === "symbol") {
      // A small dot in the track's colour, haloed in the background's (radius 2.5, as the key's swatch).
      context.globalAlpha = alpha;
      context.beginPath();
      context.arc(x, y, 2.5, 0, 2 * Math.PI);
      context.fillStyle = mark.colour;
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = background;
      context.stroke();
      continue;
    }
    // The chevron the default arrows are (TICK_SVG, map.css .tick), turned to the course: its middle on the line.
    context.save();
    context.translate(x, y);
    context.rotate(((mark.course ?? 0) * Math.PI) / 180);
    context.beginPath();
    context.moveTo(-5 * k, 3 * k);
    context.lineTo(0, -3 * k);
    context.lineTo(5 * k, 3 * k);
    context.globalAlpha = alpha * 0.8;
    context.lineWidth = 4.5 * k;
    context.strokeStyle = background;
    context.stroke();
    context.globalAlpha = alpha;
    context.lineWidth = 2.5 * k;
    context.strokeStyle = mark.colour;
    context.stroke();
    context.restore();
  }
  marksCanvas.dataset.symbols = String(counts.symbol);
  marksCanvas.dataset.arrows = String(counts.arrow);
  marksCanvas.style.visibility = "";
}
/** Time labels: above arrows and markers, so no chevron cuts a time; beneath the tracks' names and fixes' labels (tooltips). */
map.createPane("timeLabels").style.zIndex = "620";
const timeLabels = L.layerGroup().addTo(map);
/** The time labels drawn now, by track, time and look: kept across a pan or zoom, so only what comes into view is made. */
const gridLayers = new Map<string, { layer: L.Marker; track: string }>();

/**
 * Each track's fixes on the map's plane once (map pixels at the zoom where the world is one
 * pixel across), with the distance along it to each fix there, its bounds, and where it was
 * at each time drawn so far: so a pan or zoom costs arithmetic, not geodesy, per fix.
 */
interface Projected {
  xy: Float64Array;
  along: Float64Array;
  bounds: [number, number, number, number];
  wraps: boolean;
  /** Its gaps in the data, where nothing is drawn (frequencies.gaps), and the median time between its fixes. */
  gaps: [number, number][];
  median: number;
  at: Map<number, { position: LonLat; course?: number; x: number; y: number }>;
}
const projectedTracks = new WeakMap<Track, Projected>();
const crs = map.options.crs ?? L.CRS.EPSG3857;
const UNIT_ZOOM = crs.zoom(1);

// --- Sensor cuts (CAP-22, sensormap.ts) -------------------------------------------------
const sensorLayer = new SensorLayer({
  map,
  unitZoom: UNIT_ZOOM,
  selection: () => selection,
  background: () => css("--vscode-editor-background"),
  outline: () => css("--vscode-editor-foreground"),
});
// For tests: where on the map each cut's line can be clicked.
(window as unknown as { debriefCuts: () => ReturnType<SensorLayer["probe"]> }).debriefCuts = () => sensorLayer.probe();
/** The legend's rows for cuts: shown once the plot has sensor cuts to draw. */
function showCutKey(): void {
  for (const kind of ["cut", "cut-twin", "cut-now"]) {
    const row = document.querySelector<HTMLElement>(`.swatch-${kind}`)?.parentElement;
    if (row) row.hidden = sensorLayer.sensorCount === 0;
  }
}
/** A cut's details when pointed at, in a small box beside the pointer. */
const cutTip = Object.assign(document.createElement("div"), { className: "cut-tip", hidden: true });
cutTip.setAttribute("role", "tooltip");
mapElement.append(cutTip);
let tipPending = false;
map.on("mousemove", (event: L.LeafletMouseEvent) => {
  if (tipPending) return;
  tipPending = true;
  requestAnimationFrame(() => {
    tipPending = false;
    const found = editor.active ? undefined : sensorLayer.hit(event.containerPoint);
    mapElement.classList.toggle("on-cut", !!found);
    // While a cut's choices are shown, they say what it is: no tip over them.
    cutTip.hidden = !found || !cutPopover.hidden;
    if (!found) return;
    // The course found when the line was drawn: no host fixes read as the pointer moves.
    const more = found.cut.properties.ambiguous_bearing && !found.cut.properties.resolved ? "\nClick for its choices; Alt-click this line to keep it" : "";
    cutTip.textContent = describeCut(found.cut, found.entry.sensor.properties.name, found.course, settings) + more;
    const size = map.getSize();
    const left = event.containerPoint.x > size.x - 260;
    cutTip.style.left = left ? "" : `${event.containerPoint.x + 14}px`;
    cutTip.style.right = left ? `${size.x - event.containerPoint.x + 14}px` : "";
    cutTip.style.top = `${Math.max(4, event.containerPoint.y - 40)}px`;
  });
});
map.on("mouseout movestart zoomstart", () => {
  cutTip.hidden = true;
  mapElement.classList.remove("on-cut");
});
/**
 * A cut's choices, beside it, from a plain click or a tap on its line: what it is (its
 * label too), and buttons to keep either bearing (with its side), make it ambiguous
 * again, or open its menu. Escape, a click elsewhere, or moving the map closes it.
 */
const cutPopover = Object.assign(document.createElement("div"), { className: "cut-popover", hidden: true });
cutPopover.setAttribute("role", "dialog");
// The dialog itself takes focus first, so a screen reader reads what the cut is before
// any choice, and Enter keeps nothing by accident (round 3, L-3).
cutPopover.tabIndex = -1;
mapElement.append(cutPopover);
L.DomEvent.disableClickPropagation(cutPopover);
L.DomEvent.disableScrollPropagation(cutPopover);
function closeCutPopover(focusMap = false): void {
  if (cutPopover.hidden) return;
  cutPopover.hidden = true;
  cutPopover.replaceChildren();
  if (focusMap) mapElement.focus();
}
function openCutPopover(found: NonNullable<ReturnType<SensorLayer["hit"]>>, point: L.Point): void {
  const { cut, entry } = found;
  const text = describeCut(cut, entry.sensor.properties.name, found.course, settings).split("\n");
  cutPopover.replaceChildren();
  cutPopover.setAttribute("aria-label", text[0]);
  cutPopover.dataset.cut = cut.id;
  const title = Object.assign(document.createElement("strong"), { textContent: text[0] });
  const details = Object.assign(document.createElement("div"), { id: "cut-popover-details" });
  details.append(...text.slice(1).map((line) => Object.assign(document.createElement("div"), { textContent: line })));
  cutPopover.setAttribute("aria-describedby", details.id);
  cutPopover.append(title, details);
  const buttons = document.createElement("div");
  buttons.className = "choices";
  const readOnly = root.classList.contains("read-only");
  for (const choice of readOnly ? [] : cutChoices(cut, found.course)) {
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: choice.label });
    button.dataset.keep = choice.keep;
    if (choice.detail) button.title = choice.detail;
    button.addEventListener("click", () => {
      closeCutPopover(true);
      host.postMessage({ kind: "resolve_asked", feature_id: cut.id, keep: choice.keep });
    });
    buttons.append(button);
  }
  const menu = Object.assign(document.createElement("button"), { type: "button", textContent: "More…", title: "The cut's menu" });
  menu.addEventListener("click", () => {
    closeCutPopover(true);
    host.postMessage({ kind: "cut_chosen", feature_id: cut.id });
  });
  buttons.append(menu);
  cutPopover.append(buttons);
  cutPopover.hidden = false;
  cutTip.hidden = true;
  const size = map.getSize();
  const width = cutPopover.offsetWidth;
  const height = cutPopover.offsetHeight;
  cutPopover.style.left = `${Math.max(4, Math.min(size.x - width - 4, point.x + 12))}px`;
  cutPopover.style.top = `${Math.max(4, Math.min(size.y - height - 4, point.y + 12))}px`;
  cutPopover.focus({ preventScroll: true });
}
cutPopover.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.stopPropagation();
    closeCutPopover(true);
    return;
  }
  // Tab stays among the choices while they are shown (a focus trap), from the dialog to the first.
  if (event.key !== "Tab") return;
  const choices = Array.from(cutPopover.querySelectorAll<HTMLButtonElement>("button"));
  if (!choices.length) return;
  const at = choices.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.shiftKey ? (at <= 0 ? choices.length - 1 : at - 1) : at < 0 || at === choices.length - 1 ? 0 : at + 1;
  event.preventDefault();
  choices[next].focus();
});
map.on("movestart zoomstart", () => closeCutPopover());
/** A cut's menu, from a right-click or a press and hold on its line: the host shows it. */
function chooseCut(point: L.Point): boolean {
  const found = sensorLayer.hit(point);
  if (!found) return false;
  host.postMessage({ kind: "cut_chosen", feature_id: found.cut.id });
  return true;
}
map.on("contextmenu", (event: L.LeafletMouseEvent) => {
  if (editor.active) return;
  if (chooseCut(event.containerPoint)) L.DomEvent.preventDefault(event.originalEvent);
});
function projectedOf(track: Track, times: number[]): Projected {
  const known = projectedTracks.get(track);
  if (known) return known;
  const coordinates = track.geometry.coordinates as LonLat[];
  const xy = new Float64Array(coordinates.length * 2);
  const along = new Float64Array(coordinates.length);
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  let wraps = false;
  coordinates.forEach((c, i) => {
    const p = crs.latLngToPoint(toLatLng(c), UNIT_ZOOM);
    xy[2 * i] = p.x;
    xy[2 * i + 1] = p.y;
    bounds[0] = Math.min(bounds[0], p.x);
    bounds[1] = Math.min(bounds[1], p.y);
    bounds[2] = Math.max(bounds[2], p.x);
    bounds[3] = Math.max(bounds[3], p.y);
    if (i) {
      const dx = p.x - xy[2 * i - 2];
      if (Math.abs(coordinates[i][0] - coordinates[i - 1][0]) > 180) wraps = true;
      along[i] = along[i - 1] + Math.hypot(dx, p.y - xy[2 * i - 1]);
    }
  });
  const out = { xy, along, bounds, wraps, gaps: gaps(times), median: medianStep(times), at: new Map() };
  projectedTracks.set(track, out);
  return out;
}
/** The first fix at or after `t` (times.length if none). */
function fixFrom(times: number[], t: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] < t) low = middle + 1;
    else high = middle;
  }
  return low;
}
/** Where a track was at `t` on the map's plane, between the fixes either side, and its direction there on screen. */
function planeAt(p: Projected, times: number[], t: number): { x: number; y: number; dx: number; dy: number } {
  const j = Math.min(Math.max(fixFrom(times, t), 1), times.length - 1);
  const i = j - 1;
  if (times.length < 2) return { x: p.xy[0], y: p.xy[1], dx: 0, dy: 0 };
  const span = times[j] - times[i];
  const f = span > 0 ? Math.min(Math.max((t - times[i]) / span, 0), 1) : 1;
  const dx = p.xy[2 * j] - p.xy[2 * i];
  const dy = p.xy[2 * j + 1] - p.xy[2 * i + 1];
  return { x: p.xy[2 * i] + f * dx, y: p.xy[2 * i + 1] + f * dy, dx, dy };
}
/**
 * Where the track was at `t`, and its course, as pointAt says (along the geodesic; at a fix,
 * the course of the leg leaving it), with where that is on the map's plane: worked out once
 * for each time drawn. On a leg shorter than SHORT_LEG_M, along the straight line on the
 * map's plane instead, which is the geodesic there to well under a millimetre and costs no
 * geodesy (the map is conformal, so its direction there is the course).
 */
function pointOf(p: Projected, track: Track, times: number[], t: number): { position: LonLat; course?: number; x: number; y: number } {
  let point = p.at.get(t);
  if (!point) {
    point = shortLegPoint(p, track, times, t);
    if (!point) {
      const geodesic = pointAt(track.geometry.coordinates as LonLat[], times, t)!;
      const plane = crs.latLngToPoint(toLatLng(geodesic.position), UNIT_ZOOM);
      point = { ...geodesic, x: plane.x, y: plane.y };
    }
    p.at.set(t, point);
  }
  return point;
}
const SHORT_LEG_M = 2000;
/** The map's plane is one unit across the world: metres in one unit at the equator (EPSG:3857's sphere). */
const UNIT_M = 2 * Math.PI * 6_378_137;
function shortLegPoint(p: Projected, track: Track, times: number[], t: number): { position: LonLat; course?: number; x: number; y: number } | undefined {
  const n = times.length;
  if (n < 2 || t < times[0] || t > times[n - 1]) return undefined;
  // The last fix at or before t (the later of fixes sharing a time, as pointAt takes it).
  let low = fixFrom(times, t);
  while (low < n && times[low] === t) low++;
  low--;
  const atFix = times[low] === t;
  const [i, j] = low + 1 < n ? [low, low + 1] : [low - 1, low];
  const dx = p.xy[2 * j] - p.xy[2 * i];
  const dy = p.xy[2 * j + 1] - p.xy[2 * i + 1];
  const coordinates = track.geometry.coordinates as LonLat[];
  const metres = Math.hypot(dx, dy) * UNIT_M * Math.cos((coordinates[i][1] * Math.PI) / 180);
  if (!(metres > 0.01) || metres > SHORT_LEG_M) return undefined; // not moving there, or a long leg: as pointAt
  const course = ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360;
  if (atFix) return { position: coordinates[low], course, x: p.xy[2 * low], y: p.xy[2 * low + 1] };
  const f = (t - times[i]) / (times[j] - times[i]);
  const x = p.xy[2 * i] + f * dx;
  const y = p.xy[2 * i + 1] + f * dy;
  const at = crs.pointToLatLng(L.point(x, y), UNIT_ZOOM);
  return { position: [at.lng, at.lat], course, x, y };
}

/** Text widths on screen, measured once each. */
const measure = document.createElement("canvas").getContext("2d");
const widths = new Map<string, number>();
function textWidth(text: string, font: string): number {
  const key = `${font}|${text}`;
  let width = widths.get(key);
  if (width === undefined) {
    if (measure) measure.font = font;
    width = measure ? measure.measureText(text).width : text.length * 7;
    widths.set(key, width);
  }
  return width;
}
const TIME_FONT = () => {
  const family = getComputedStyle(document.body).fontFamily;
  return `10.5px ${family}`;
};

/** Every grid layer of a track taken off the map: it is being edited, or its plot was drawn again. */
function clearGridOf(id?: string): void {
  for (const [key, { layer, track }] of gridLayers) {
    if (id !== undefined && track !== id) continue;
    timeLabels.removeLayer(layer);
    gridLayers.delete(key);
  }
  marks = id === undefined ? [] : marks.filter((mark) => mark.track !== id);
  paintMarks();
}

/**
 * Draw each track's labels, symbols and arrows at the intervals set for it: at the whole
 * multiples of each interval of UTC within the time window and the track's span, where the
 * track was then (as the marker at current time places it). Only what is in view, or near
 * it, is drawn; thinned when zoomed out (frequencies.ts), and the map says so. Time labels are
 * kept clear of one another, across tracks, and of the tracks' names, fixes' own labels and
 * the tracks' ends: each to port, or to starboard where port is taken, or left out (a fix's
 * label always shown wins). Arrows are not drawn on a track's first or last fix in the
 * window, where its end markers are. What is already drawn and still wanted is kept.
 */
function drawGrid(): void {
  const window = drawnWindow ?? ALL;
  const zoom = map.getZoom();
  const scale = crs.scale(zoom);
  const origin = map.getPixelOrigin();
  const pixels = map.getPixelBounds();
  const size = pixels.getSize();
  // In view, or half a view about it, in map pixels; and on the layer, where markers are placed.
  const view = { x0: pixels.min!.x - size.x / 2, y0: pixels.min!.y - size.y / 2, x1: pixels.max!.x + size.x / 2, y1: pixels.max!.y + size.y / 2 };
  const onLayer = (x: number, y: number) => ({ x: x * scale - origin.x, y: y * scale - origin.y });
  const any = selection.size > 0;
  const font = TIME_FONT();
  const background = css("--vscode-editor-background");

  // What time labels must keep clear of: the tracks' names and fixes' own labels as drawn (read before anything is written).
  const taken = new Occupied();
  const mapBox = mapElement.getBoundingClientRect();
  for (const element of Array.from(mapElement.querySelectorAll<HTMLElement>(".leaflet-tooltip.track-label, .leaflet-tooltip.fix-label"))) {
    if (element.style.visibility === "hidden") continue;
    const r = element.getBoundingClientRect();
    const corner = map.containerPointToLayerPoint([r.left - mapBox.left, r.top - mapBox.top]);
    taken.add({ x0: corner.x, y0: corner.y, x1: corner.x + r.width, y1: corner.y + r.height });
  }

  const wanted = new Map<string, { track: string; make: () => L.Marker }>();
  const marking: typeof marks = [];
  const thinned: { field: Field; drawn?: number; track: string }[] = [];
  const drawing: Partial<Record<Field, number>> = {};
  const shownKinds = new Set<Field>();
  /** Time labels, from every track, placed together once all are known. */
  const candidates: { id: string; time: number; step: number; withDay: boolean; text: string; at: { x: number; y: number }; side: { x: number; y: number }; width: number; forced: boolean; regular: boolean; colour: string; make: (side: { x: number; y: number }, text: string) => L.Marker }[] = [];
  const regularLabels = new Map<string, { offered: number; name: string; raised?: number }>();

  for (const entry of tracks) {
    const shown = drawn.get(entry.track.id);
    if (!shown) continue;
    const { track, times } = entry;
    const props = track.properties;
    // Fixes whose label or symbol is always shown (show_label, show_symbol), by kind: drawn whatever the interval, never thinned.
    const forcedAt = forcedTimes(props.fix_marks);
    const fields = FIELDS.filter((f) => typeof intervalMs(props[f]) === "number" || intervalMs(props[f]) === "all" || forcedAt[f].length);
    if (!fields.length || editing.has(track.id) || !times.length) continue;
    const start = Math.max(times[0], window.start);
    const end = Math.min(times[times.length - 1], window.end);
    if (start > end) continue;
    const p = projectedOf(track, times);
    const inView = (x0: number, y0: number, x1: number, y1: number) => x1 * scale >= view.x0 && x0 * scale <= view.x1 && y1 * scale >= view.y0 && y0 * scale <= view.y1;
    if (!p.wraps && !inView(...p.bounds)) continue;
    // The fixes in the window, the spans of time the track is in view there, and how fast it crosses the screen.
    const first = Math.max(fixFrom(times, start) - 1, 0);
    const last = Math.min(fixFrom(times, end), times.length - 1);
    const legs: [number, number][] = [];
    for (let i = first; i < last; i++) {
      if (times[i + 1] < start || times[i] > end) continue;
      const [ax, ay, bx, by] = [p.xy[2 * i], p.xy[2 * i + 1], p.xy[2 * i + 2], p.xy[2 * i + 3]];
      if (Math.abs(bx - ax) > 0.5 || inView(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by))) legs.push([Math.max(times[i], start), Math.min(times[i + 1], end)]);
    }
    if (times.length === 1 && inView(p.xy[0], p.xy[1], p.xy[0], p.xy[1])) legs.push([times[0], times[0]]);
    const spans = mergeSpans(legs);
    if (!spans.length) continue;
    const pxPerMs = end > start ? ((p.along[last] - p.along[first]) * scale) / (end - start) : 0;
    const gapSpans = p.gaps;
    const colour = colourOf(track);
    const inSpans = (t: number) => spans.some(([a, b]) => t >= a && t <= b);
    const screen = (t: number) => {
      const q = planeAt(p, times, t);
      return { ...onLayer(q.x, q.y), dx: q.dx, dy: q.dy };
    };
    // The track's ends in the window, where its end markers are: no arrow on them, no label over them.
    const ends = shown.ends?.map((i) => onLayer(p.xy[2 * i], p.xy[2 * i + 1])) ?? [];
    for (const e of ends) taken.add({ x0: e.x - END_PX, y0: e.y - END_PX, x1: e.x + END_PX, y1: e.y + END_PX });
    const opacity = !any || selection.has(track.id) ? 1 : 0.3;
    for (const field of fields) {
      const set = intervalMs(props[field]);
      const every = typeof set === "number" ? set : undefined;
      const spacing = SPACING_PX[field];
      // At every fix (legacy Debrief's All): each fix's time, until they would crowd; then an interval, thinned as any is.
      const fixes = set === "all" ? everyFix(times, spans, pxPerMs, spacing, CAP[field], p.median) : undefined;
      const asked = every ?? (fixes && "every" in fixes ? fixes.every : undefined);
      if (every || fixes) drawing[field] = (drawing[field] ?? 0) + 1;
      const drawnEvery = asked && thinnedInterval(asked, pxPerMs, spacing, (e) => gridCount(spans, e), CAP[field]);
      const regular = fixes && "times" in fixes ? fixes.times : drawnEvery ? gridTimes(spans, drawnEvery, { start: times[0], end: times[times.length - 1] }, gapSpans, CAP[field]) : [];
      const onScreen = regular.map(screen);
      // Never closer on screen than the spacing allows, where the track is slow or doubles back.
      let keptIndices = declutter(onScreen, spacing * 0.8);
      // An arrow on an end marker reads as a second arrowhead, or hides the marker: none there.
      if (field === "arrow_interval") keptIndices = keptIndices.filter((k) => ends.every((e) => Math.hypot(onScreen[k].x - e.x, onScreen[k].y - e.y) >= ARROW_END_PX));
      const keptRegular = keptIndices.map((k) => regular[k]);
      // Said when the interval was raised, or where crowding left out more than a quarter: a few in a tight turn go unsaid. Labels are said once placed.
      const raised = !!(drawnEvery && (fixes || drawnEvery !== every));
      if (field === "label_interval" && (every || fixes)) regularLabels.set(track.id, { offered: regular.length, name: trackLabel(props), ...(raised && { raised: drawnEvery as number }) });
      else if ((every || fixes) && (raised || keptRegular.length < CROWDED * regular.length)) thinned.push({ field, track: trackLabel(props), ...(raised && { drawn: drawnEvery as number }) });
      // A fix whose label or symbol is always shown: at the fix, at any zoom; once, where the interval falls on it too.
      const forced = forcedAt[field].filter(inSpans);
      const at = withForced(keptRegular, forced);
      if (field === "label_interval") {
        const days = labelsWithDay(at, settings);
        at.forEach((t, k) => {
          const isForced = forced.includes(t);
          // Seconds shown where the interval drawn is not whole minutes, or a forced fix's time is not.
          const step = drawnEvery && !isForced ? drawnEvery : t % 60_000 ? 1000 : 60_000;
          const text = fixLabel(t, step, settings, days[k]);
          // To port of the course there, as legacy Debrief places a fix's label.
          const { position, course, x, y } = pointOf(p, track, times, t);
          candidates.push({
            id: track.id,
            time: t,
            step,
            withDay: days[k],
            text,
            at: onLayer(x, y),
            side: portSide(course),
            width: textWidth(text, font) + 2,
            forced: isForced,
            regular: !isForced || keptRegular.includes(t),
            colour,
            make: (chosen, said) => {
              const label = L.marker(toLatLng(position), { icon: timeLabel(said, chosen, colour), interactive: false, keyboard: false, pane: "timeLabels" });
              label.setOpacity(opacity);
              return label;
            },
          });
        });
        continue;
      }
      if (at.length) shownKinds.add(field);
      for (const t of at) {
        const { x, y, course } = pointOf(p, track, times, t);
        if (field === "arrow_interval" && course === undefined) continue; // a track that never moved has no direction
        marking.push({ kind: field === "symbol_interval" ? "symbol" : "arrow", x, y, track: track.id, colour, course });
      }
    }
  }

  // Time labels, from every track at once: forced first, then earliest first, each to port, or starboard, or left out.
  candidates.sort((a, b) => a.time - b.time);
  const sides = placeTimeLabels(candidates, taken);
  const placed = new Map<string, number>();
  // The day on the first label of each day that is drawn, though an earlier one gave way.
  const shownOf = new Map<string, number[]>();
  candidates.forEach((c, k) => sides[k] && shownOf.set(c.id, [...(shownOf.get(c.id) ?? []), k]));
  for (const ks of shownOf.values()) {
    const withDay = labelsWithDay(ks.map((k) => candidates[k].time), settings);
    ks.forEach((k, n) => {
      const c = candidates[k];
      if (withDay[n] !== c.withDay) c.text = fixLabel(c.time, c.step, settings, withDay[n]);
    });
  }
  candidates.forEach((c, k) => {
    const side = sides[k];
    if (!side) return;
    if (c.regular) placed.set(c.id, (placed.get(c.id) ?? 0) + 1);
    shownKinds.add("label_interval");
    wanted.set(`${c.id}|${c.time}|${c.text}|${c.colour}|${Math.round(Math.atan2(side.y, side.x) * 100)}`, { track: c.id, make: () => c.make(side, c.text) });
  });
  for (const [id, { offered, name, raised }] of regularLabels) {
    if (raised || (placed.get(id) ?? 0) < CROWDED * offered) thinned.push({ field: "label_interval", track: name, ...(raised && { drawn: raised }) });
  }

  // Keep what is drawn and still wanted; take off the rest; make what is new.
  for (const [key, { layer }] of gridLayers) {
    if (wanted.has(key)) continue;
    timeLabels.removeLayer(layer);
    gridLayers.delete(key);
  }
  for (const [key, { track, make }] of wanted) {
    if (gridLayers.has(key)) continue;
    const layer = make();
    layer.addTo(timeLabels);
    gridLayers.set(key, { layer, track });
  }
  for (const shown of drawn.values()) shown.timeLabels = [];
  for (const { layer, track } of gridLayers.values()) drawn.get(track)?.timeLabels!.push(layer);
  marks = marking;
  paintMarks(background);

  if (thinNote) {
    // Written only when it changes: it is a status a screen reader says, and the map is drawn again at every pan.
    const said = thinningNote(thinned, drawing);
    if (thinNote.textContent !== said) thinNote.textContent = said;
    thinNote.hidden = !thinned.length;
  }
  for (const kind of ["time", "symbol"] as const) {
    const row = document.querySelector<HTMLElement>(`.swatch-${kind}`)?.parentElement;
    if (row) row.hidden = !shownKinds.has(kind === "time" ? "label_interval" : "symbol_interval");
  }
}

/**
 * A time label beside its point, to the side given (port of the course, or starboard where
 * port is taken): a short leader in the track's colour from the point, then the time in the
 * theme's text colour, haloed. Set as text. Laid out as frequencies.labelBox says.
 */
function timeLabel(time: string, side: { x: number; y: number }, colour: string): L.DivIcon {
  const box = document.createElement("div");
  box.className = "fix-time";
  const leader = document.createElement("span");
  leader.className = "fix-time-leader";
  leader.style.background = colour;
  leader.style.transform = `rotate(${(Math.atan2(side.y, side.x) * 180) / Math.PI}deg)`;
  const words = document.createElement("span");
  words.className = "fix-time-text";
  words.textContent = time;
  const across = (d: number) => (d > 0.38 ? "0%" : d < -0.38 ? "-100%" : "-50%");
  words.style.left = `${side.x * LEADER_PX}px`;
  words.style.top = `${side.y * LEADER_PX}px`;
  words.style.transform = `translate(${across(side.x)}, ${across(side.y)})`;
  box.append(leader, words);
  return L.divIcon({ className: "fix-time-anchor", html: box, iconSize: [0, 0], iconAnchor: [0, 0] });
}
/** Room kept about a track's end markers in the window, in pixels (their radius, and a pixel): no time label over them; and how near them no arrow is drawn. */
const END_PX = 5;
const ARROW_END_PX = 12;
/** Where fewer than this share of a track's items are kept for crowding, the map says some were left out. */
const CROWDED = 0.75;

/** Drawn again after each pan or zoom, at most once a frame: only what is in view is drawn. */
let gridPending = false;
function scheduleGrid(): void {
  if (gridPending) return;
  gridPending = true;
  requestAnimationFrame(() => {
    gridPending = false;
    drawGrid();
  });
}
map.on("zoomend moveend", scheduleGrid);

/**
 * A track's part in the window: its fixes there, with the positions at the
 * window's edges where the track crosses them, and the first and last fix in
 * the window, if any. None if the track is not in the window at all.
 */
function partIn(entry: { track: Track; times: number[] }, window: { start: number; end: number }): { coordinates: LonLat[]; first?: number; last?: number } | undefined {
  const { track, times } = entry;
  const coordinates = track.geometry.coordinates as LonLat[];
  if (!times.length || times[0] > window.end || times[times.length - 1] < window.start) return undefined;
  let first = 0;
  while (first < times.length && times[first] < window.start) first++;
  let last = times.length - 1;
  while (last >= 0 && times[last] > window.end) last--;
  const part: LonLat[] = [];
  if (first > 0 && (first === times.length || times[first] > window.start)) part.push(positionAt(track, times, window.start)!);
  for (let i = first; i <= last; i++) part.push(coordinates[i]);
  if (last < times.length - 1 && (last < 0 || times[last] < window.end)) part.push(positionAt(track, times, window.end)!);
  if (part.length < 2) return part.length === 1 && first <= last ? { coordinates: part, first, last } : undefined;
  return first <= last ? { coordinates: part, first, last } : { coordinates: part };
}

// Annotation labels only where the shape is big enough on screen to carry one: its
// diagonal in pixels, at least LABEL_ROOM, or CHOSEN_LABEL_ROOM where the analyst placed the label.
const LABEL_ROOM = 70;
const CHOSEN_LABEL_ROOM = 24;
const sized: { label: L.Layer & { getTooltip(): L.Tooltip | undefined }; bounds: L.LatLngBounds; least: number }[] = [];
function placeLabels(): void {
  for (const { label, bounds, least } of sized) {
    const size = map.latLngToContainerPoint(bounds.getNorthEast()).distanceTo(map.latLngToContainerPoint(bounds.getSouthWest()));
    const element = label.getTooltip()?.getElement();
    if (element) element.style.visibility = size >= least ? "visible" : "hidden";
  }
}
map.on("zoomend", placeLabels);

// --- Current time and the window (shared state) ------------------------------------
// The Tote's lines (CAP-06; decision, 14 Oct 2026): thin and muted, from the primary to each
// secondary at current time, under the markers; off when the Tote says so.
const toteLayer = L.layerGroup().addTo(map);
let toteView: ToteView = {};
// Set by the time controller beside the map; the map only shows them.
const now = L.layerGroup().addTo(map);
/** Each track with its fix times parsed once, and its marker at current time. */
let tracks: { track: Track; times: number[]; marker?: L.Marker }[] = [];
let time: TimeState | undefined;

function setTracks(plotTracks: Track[]): void {
  now.clearLayers();
  tracks = plotTracks.map((track) => ({ track, times: track.properties.times.map(Date.parse) }));
  clearGridOf(); // drawn again for the plot as it now is
}

/** Where a track was at an instant, between the fixes either side; none outside its span. As the Tote measures it (geodesic.ts). */
function positionAt(track: Track, times: number[], at: number): LonLat | undefined {
  return trackPositionAt(track.geometry.coordinates as LonLat[], times, at);
}

function drawNow(): void {
  const at = time ? Date.parse(time.current) : NaN;
  for (const entry of tracks) {
    const position = time ? positionAt(entry.track, entry.times, at) : undefined;
    if (!position) {
      if (entry.marker) now.removeLayer(entry.marker);
      entry.marker = undefined;
      continue;
    }
    if (entry.marker) {
      entry.marker.setLatLng(toLatLng(position));
      if (!now.hasLayer(entry.marker)) entry.marker.addTo(now);
      continue;
    }
    const { track } = entry;
    const colour = colourOf(track);
    const icon = L.divIcon({ className: "now", html: "", iconSize: [10, 10] });
    const marker = L.marker(toLatLng(position), { icon, keyboard: false, title: trackLabel(track.properties) });
    marker.on("add", () => marker.getElement()?.style.setProperty("--now-colour", colour));
    marker.on("click", (event: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(event);
      if (editor.takeClick(event)) return;
      select(track.id, event.originalEvent.ctrlKey || event.originalEvent.metaKey);
    });
    marker.addTo(now);
    entry.marker = marker;
  }
  drawToteLines(at);
  drawNarrative(at);
}

/** A line from the primary's marker to each secondary's, along the geodesic, as the Tote measures range. */
function drawToteLines(at: number): void {
  toteLayer.clearLayers();
  if (!time) return;
  const byId = new Map(tracks.map((entry) => [entry.track.id, entry]));
  const positionOf = (id: string) => {
    const entry = byId.get(id);
    return entry ? positionAt(entry.track, entry.times, at) : undefined;
  };
  const colour = css("--vscode-descriptionForeground") || css("--vscode-editor-foreground");
  for (const line of toteMapLines(toteView, positionOf)) {
    const options = { color: colour, weight: 1, opacity: 0.7, dashArray: "4 3", interactive: false, className: "tote-map-line" };
    L.polyline(densify([line.from, line.to]).map(toLatLng), options).addTo(toteLayer);
  }
}

// --- The narrative at current time (CAP-20) --------------------------------------
/**
 * The narrative entry current time is at, where it belongs to a track: its source and
 * the start of its text in a small box beside the track's marker, in the theme's
 * colours, never in the way (not interactive). The host says which entry, and none
 * when ten minutes of plot time have passed with no other.
 */
const narrativeLayer = L.layerGroup().addTo(map);
let narrativeShown: TimelineEntry | undefined;
const NARRATIVE_CHARS = 60;
function drawNarrative(at: number): void {
  narrativeLayer.clearLayers();
  const entry = narrativeShown;
  if (!entry?.track || !time) return;
  const found = tracks.find((t) => t.track.id === entry.track);
  const position = found ? positionAt(found.track, found.times, at) : undefined;
  if (!position) return;
  const box = document.createElement("div");
  box.className = "narrative-box";
  const words = (entry.text ?? "").replace(/\s+/g, " ").trim();
  const shown = words.length > NARRATIVE_CHARS ? `${words.slice(0, NARRATIVE_CHARS - 1).trimEnd()}…` : words;
  const source = document.createElement("b");
  source.textContent = entry.source;
  box.append(source, document.createTextNode(` ${shown}`));
  box.title = `${entry.source}: ${entry.text ?? ""}`;
  // Beside the marker, to its right; to its left where the right is short of room.
  const left = map.latLngToContainerPoint(toLatLng(position)).x > map.getSize().x - 300;
  if (left) box.classList.add("narrative-left");
  const icon = L.divIcon({ className: "narrative-on-map", html: box, iconSize: [0, 0], iconAnchor: [left ? 10 : -10, 26] });
  L.marker(toLatLng(position), { icon, interactive: false, keyboard: false }).addTo(narrativeLayer);
}

/** Current time and the window changed: move the markers, and draw the window again if it moved. */
let timePending = false;
function showTime(next: TimeState | undefined): void {
  time = next;
  if (timePending) return;
  timePending = true;
  // At most once a frame, however fast the controller sends them.
  requestAnimationFrame(() => {
    timePending = false;
    drawWindow();
    drawNow();
    sensorLayer.setTime(time ? { start: Date.parse(time.range.start), end: Date.parse(time.range.end) } : ALL, time ? Date.parse(time.current) : NaN);
    trackEditor.refresh(); // the default pivot is the fix nearest current time
  });
}

// --- Viewport (shared state) -----------------------------------------------------
let reporting: ReturnType<typeof setTimeout> | undefined;
let settingViewport = false; // a move made to show a viewport set elsewhere is not reported back
map.on("moveend", () => {
  clearTimeout(reporting);
  if (settingViewport || exporting) return;
  reporting = setTimeout(() => {
    const bounds = map.getBounds();
    const whole = bounds.getEast() - bounds.getWest() >= 360;
    const wrap = (lon: number) => L.Util.wrapNum(lon, [-180, 180], true);
    const clamp = (lat: number) => Math.max(-90, Math.min(90, lat));
    const round = (x: number) => Math.round(x * 1e6) / 1e6;
    const bbox = [
      whole ? -180 : wrap(bounds.getWest()),
      clamp(bounds.getSouth()),
      whole ? 180 : wrap(bounds.getEast()),
      clamp(bounds.getNorth()),
    ].map(round);
    host.postMessage({ kind: "viewport_changed", viewport: { bbox } });
  }, 150);
});

function showViewport(bbox: number[]): void {
  const [west, south, east, north] = bbox;
  settingViewport = true;
  fit(L.latLngBounds([south, west], [north, east > west ? east : east + 360]), 0);
  settingViewport = false;
  moved = true; // set from elsewhere: keep it, even if a panel opens beside the map
}

// --- Fitting the view ---------------------------------------------------------
let moved = false; // whether the analyst has panned or zoomed since the last fit
let fitting = false;
function fit(bounds: L.LatLngBounds, padding = 40): void {
  if (!bounds.isValid()) return;
  fitting = true;
  map.fitBounds(bounds, { padding: [padding, padding], animate: false });
  fitting = false;
  moved = false;
  placeLabels();
}
map.on("movestart zoomstart", () => {
  if (!fitting) moved = true;
});
// A resize keeps the map's centre by shifting the map. A pan still animating then (an arrow
// key pressed just before a form opens beside the map, say) would carry on to where it was
// heading in the old size and undo that shift: the map would end up off sideways by half the
// change in width, and stay so once the form closes. The shift goes into the pan as well.
// (Leaflet 1.9 keeps the pan in _panAnim, from _startPos; it has no public way to do this.)
map.on("resize", (event: L.ResizeEvent) => {
  const pan = (map as unknown as { _panAnim?: { _inProgress?: boolean; _startPos?: L.Point } })._panAnim;
  if (!pan?._inProgress || !pan._startPos) return;
  pan._startPos = pan._startPos.subtract(event.oldSize.divideBy(2).round().subtract(event.newSize.divideBy(2).round()));
});
// When a form or results panel opens beside the map, keep the plot in view.
new ResizeObserver(() => {
  if (exporting) return; // laid out at an image's size for a moment: exportImage puts the view back
  if (!mapElement.clientWidth || !mapElement.clientHeight) return; // hidden: nothing to fit
  fitting = true; // resizing moves the map, but the analyst didn't
  map.invalidateSize({ animate: false });
  fitting = false;
  if (!moved) fit(plotBounds);
  keepChecksInView(); // a panel opened beside the map may have narrowed a ringed fix out of view
}).observe(mapElement);

map.on("click", (event: L.LeafletMouseEvent) => {
  closeCutPopover();
  if (trackEditor.endingDrag(event)) return;
  if (editor.active || editor.endingDrag(event)) return;
  if (clickCut(event)) return;
  select(undefined, false);
});
/**
 * A click on a sensor cut's line (CAP-22; product owner, 24 Oct 2026, sensors.ts
 * cutClick): a plain click or a tap selects the cut and shows its choices; Ctrl adds it to
 * the selection; Alt on one of an ambiguous cut's lines keeps that bearing, one step; a
 * double-click's second click does nothing. False if no cut's line is under the click.
 */
function clickCut(event: L.LeafletMouseEvent): boolean {
  const found = sensorLayer.hit(event.containerPoint);
  if (!found) return false;
  const original = event.originalEvent;
  const ambiguous = !!found.cut.properties.ambiguous_bearing && !found.cut.properties.resolved;
  const action = cutClick({ detail: original.detail, alt: original.altKey, add: original.ctrlKey || original.metaKey }, ambiguous, root.classList.contains("read-only"));
  if (action === "ignore") return true;
  if (action === "keep") {
    closeCutPopover();
    host.postMessage({ kind: "resolve_asked", feature_id: found.cut.id, keep: found.which });
    return true;
  }
  select(found.cut.id, action === "add");
  if (action === "select") openCutPopover(found, event.containerPoint);
  else closeCutPopover();
  return true;
}
mapElement.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !editor.active) select(undefined, false);
});
map.on("mousemove", (event: L.LeafletMouseEvent) => {
  status.textContent = formatPosition({ latitude: event.latlng.lat, longitude: L.Util.wrapNum(event.latlng.lng, [-180, 180], true) }, settings);
});

// --- Drawing and editing annotations (mapedit.ts) -----------------------------------
/** Annotations drawn changed, with handles, instead of as they are in the plot. */
const editing = new Set<string>();
let annotations = new Map<string, Annotation>();
const editor = new MapEditor({
  map,
  element: mapElement,
  post: (message) => host.postMessage(message),
  annotation: (id) => {
    const feature = annotations.get(id);
    const shown = drawn.get(id)?.layers.some((layer) => features.hasLayer(layer));
    return feature && shown ? specOfFeature(feature) : undefined;
  },
  setShown: (id, shown) => {
    const entry = drawn.get(id);
    if (!entry) return;
    if (shown) editing.delete(id);
    else editing.add(id);
    for (const layer of entry.layers) {
      if (shown) features.addLayer(layer);
      else features.removeLayer(layer);
    }
    restyle();
  },
  drawingChanged: () => trackEditor.refresh(),
});

// --- Moving and rotating tracks (trackmap.ts) -------------------------------------
const trackEditor = new TrackEditor({
  map,
  element: mapElement,
  post: (message) => host.postMessage(message),
  track: (id) => {
    const entry = tracks.find((t) => t.track.id === id);
    return entry && drawn.has(id) ? { feature: entry.track, times: entry.times, colour: colourOf(entry.track) } : undefined;
  },
  time: () => (time ? { current: Date.parse(time.current), window: { start: Date.parse(time.range.start), end: Date.parse(time.range.end) }, range: time.range } : undefined),
  setShown: (id, shown) => {
    const entry = drawn.get(id);
    if (!entry) return;
    if (shown) editing.delete(id);
    else editing.add(id);
    // The track's whole line, its part in the window, and where it is at current time.
    const marker = tracks.find((t) => t.track.id === id)?.marker;
    for (const layer of [...entry.layers, ...entry.windowed, ...(entry.context ? [entry.context] : []), ...(marker ? [marker] : [])]) {
      const group = layer === marker ? now : features;
      if (shown) group.addLayer(layer);
      else group.removeLayer(layer);
    }
    if (shown && entry.context && !entry.contextStyle) features.removeLayer(entry.context); // context tracks hidden
    if (!shown) clearGridOf(id); // its labels, symbols and arrows off while it moves
    else scheduleGrid(); // drawn again where the track now is
    restyle();
  },
  say: (text, readout, saying) => editor.say(text, readout, saying),
  noting: () => editor.noting,
  drawing: () => editor.active,
});

// --- Exporting the map as an image (SUB-25, exportimage.ts) -------------------------------
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/** Wait for the map to draw what it draws after a frame: its grid of labels, its labels' room. */
async function settle(): Promise<void> {
  await frame();
  await frame();
  drawGrid();
  placeLabels();
  // The narrative box's side is chosen by the room beside its marker: at the image's size, not the screen's.
  drawNarrative(time ? Date.parse(time.current) : NaN);
  await frame();
}
/**
 * A picture of the map as it is, laid over it while the map is laid out at an image's size
 * and in its colours, so the analyst sees no jump and no flash of colour (expert panel,
 * 16 Oct 2026); removed once the map is put back.
 */
async function coverMap(): Promise<() => void> {
  const size = map.getSize();
  const r = mapElement.getBoundingClientRect();
  const { svg } = composeSvg({ root: mapElement, width: size.x, height: size.y, scale: 1, background: css("--vscode-editor-background"), marks: paintedMarks(), lines: sensorLayer.linesForExport(), tickSize: TICK_SIZE, clipId: clipIdFor() });
  const cover = Object.assign(document.createElement("img"), { className: "export-cover", alt: "", src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
  Object.assign(cover.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(cover);
  await cover.decode().catch(() => undefined);
  return () => cover.remove();
}
/** Messages that came while an image was being drawn: shown once the map is put back, so none is undone by it (a selection set meanwhile, say). */
const whileExporting: Record<string, unknown>[] = [];
/** The map's own colours swapped for light ones (LIGHT_EXPORT_THEME); returns how to put them back. */
function lightTheme(): () => void {
  const style = document.documentElement.style;
  const before = Object.keys(LIGHT_EXPORT_THEME).map((name) => [name, style.getPropertyValue(name)] as const);
  const classes = document.body.className;
  for (const [name, value] of Object.entries(LIGHT_EXPORT_THEME)) style.setProperty(name, value);
  document.body.classList.remove("vscode-dark", "vscode-high-contrast");
  document.body.classList.add("vscode-light");
  return () => {
    for (const [name, value] of before) {
      if (value) style.setProperty(name, value);
      else style.removeProperty(name);
    }
    document.body.className = classes;
  };
}
/** Symbols and arrows from the canvas, where they are on the map now. */
function paintedMarks(): PaintedMark[] {
  const scale = crs.scale(map.getZoom());
  const origin = map.getPixelOrigin();
  return marks.map((mark) => {
    const at = map.layerPointToContainerPoint(L.point(mark.x * scale - origin.x, mark.y * scale - origin.y));
    return { kind: mark.kind, x: at.x, y: at.y, colour: mark.colour, course: mark.course };
  });
}
/**
 * Draw the map as an image: laid out at the size asked for (the view kept: the same area,
 * fitted), in the theme asked for, the selection's outline and dimming off, then put back
 * exactly as it was. What is drawn is what the map draws at that size: its labels kept
 * clear of one another as on screen.
 */
async function exportImage(request: { format: ImageFormat; preset: ImagePreset; theme: ImageTheme; footer_text?: string }): Promise<RenderedImage> {
  if (!shownPlot) throw new Error("The map has no plot to draw.");
  if (exporting) throw new Error("The map is preparing another image. Try again when it has finished.");
  const restore: (() => void)[] = [];
  const note = document.getElementById("exporting")!;
  exporting = true;
  note.hidden = false;
  try {
    restore.push(await coverMap());
    const kept = selection;
    selection = new Set();
    restyle();
    restore.push(() => {
      selection = kept;
      restyle();
    });
    if (request.theme === "light") {
      restore.push(lightTheme());
      applyContext();
    }
    const view = { centre: map.getCenter(), zoom: map.getZoom(), bounds: map.getBounds(), size: map.getSize() };
    const wasMoved = moved; // laying out at the image's size is no pan or zoom of the analyst's
    restore.push(() => (moved = wasMoved));
    const layout = layoutFor(request.preset, { width: view.size.x, height: view.size.y });
    if (layout.width !== view.size.x || layout.height !== view.size.y) {
      const snap = map.options.zoomSnap;
      const overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      mapElement.classList.add("export-sizing");
      mapElement.style.width = `${layout.width}px`;
      mapElement.style.height = `${layout.height}px`;
      map.invalidateSize({ animate: false, pan: false });
      map.options.zoomSnap = 0;
      map.fitBounds(view.bounds, { animate: false, padding: [0, 0] });
      restore.push(() => {
        mapElement.classList.remove("export-sizing");
        mapElement.style.width = "";
        mapElement.style.height = "";
        document.body.style.overflow = overflow;
        map.invalidateSize({ animate: false, pan: false });
        map.options.zoomSnap = snap;
        map.setView(view.centre, view.zoom, { animate: false });
      });
    }
    await settle();
    const size = map.getSize();
    const background = css("--vscode-editor-background");
    const composed = composeSvg({
      root: mapElement,
      width: size.x,
      height: size.y,
      scale: layout.scale,
      background,
      marks: paintedMarks(),
      lines: sensorLayer.linesForExport(),
      footer: request.footer_text ? { text: request.footer_text, colour: css("--vscode-descriptionForeground") || css("--vscode-editor-foreground"), halo: background, size: footerFontSize({ width: size.x, height: size.y, scale: layout.scale }) } : undefined,
      tickSize: TICK_SIZE,
      clipId: clipIdFor(),
    });
    const pixels = pixelsOf({ width: size.x, height: size.y, scale: layout.scale });
    const bounds = map.getBounds();
    const wrap = (lon: number) => L.Util.wrapNum(lon, [-180, 180], true);
    const round = (x: number) => Math.round(x * 1e6) / 1e6;
    const whole = bounds.getEast() - bounds.getWest() >= 360;
    const bbox = [whole ? -180 : wrap(bounds.getWest()), Math.max(-90, bounds.getSouth()), whole ? 180 : wrap(bounds.getEast()), Math.min(90, bounds.getNorth())].map(round) as [number, number, number, number];
    const data = request.format === "png" ? await rasterise(composed.svg, pixels.width, pixels.height) : composed.svg;
    return { format: request.format, data, width: pixels.width, height: pixels.height, viewport: { bbox }, ...(composed.notes.length && { notes: composed.notes }) };
  } finally {
    // Put back beneath the picture of it, which goes last.
    const uncover = restore.shift();
    for (const undo of restore.reverse()) undo();
    if (request.theme === "light") applyContext();
    await settle();
    exporting = false;
    for (const message of whileExporting.splice(0)) handle(message);
    uncover?.();
    note.hidden = true;
  }
}

// --- An earlier revision, shown read-only (an image traced to its plot) --------------------
const revisionBanner = document.getElementById("revision")!;
revisionBanner.querySelector("button")!.addEventListener("click", () => host.postMessage({ kind: "latest_asked" }));
function showRevision(shown: RevisionShown | undefined): void {
  revisionBanner.hidden = !shown;
  root.classList.toggle("read-only", !!shown);
  if (!shown) return;
  const image = shown.figure ? `image ${shown.figure}` : "the image";
  revisionBanner.querySelector(".revision-text")!.textContent =
    shown.step === shown.latest
      ? `The plot as it is now, as when ${image} was exported (step ${shown.step}). Read-only here.`
      : `The plot at step ${shown.step} of ${shown.latest}, as when ${image} was exported. Read-only.`;
  const button = revisionBanner.querySelector("button")!;
  button.textContent = shown.step === shown.latest ? "Edit the plot" : "Go to latest";
  button.title = "Leave this earlier revision and show the plot as it is now, to change it";
}

let shownPlot = "";
onMessage((message) => {
  if (exporting && message.kind !== "export_image") whileExporting.push(message);
  else handle(message);
});
function handle(message: Record<string, unknown>): void {
  if (message.kind === "show_plot") {
    const sel = message.selection as { plot: string; feature_ids: string[] };
    const firstShow = sel.plot !== shownPlot;
    shownPlot = plotId = sel.plot;
    selection = new Set(sel.feature_ids);
    showTime(message.time as TimeState | undefined);
    contextMode = (message.context_tracks as ContextTracks | undefined) ?? "visible";
    toteView = toteOf(message.plot as DebriefFeatureCollection);
    draw(message.plot as DebriefFeatureCollection);
    editing.clear();
    editor.plotDrawn();
    trackEditor.plotDrawn([...selection]);
    showHidden(typeof message.hidden_count === "number" ? message.hidden_count : 0);
    showRevision(message.revision_shown as RevisionShown | undefined);
    if (firstShow) fit(plotBounds);
    pageShown(true);
  } else if (message.kind === "export_image") {
    const request = message.image_request as Parameters<typeof exportImage>[0];
    exportImage(request).then(
      (image) => host.postMessage({ kind: "image_rendered", image }),
      (error: Error) => host.postMessage({ kind: "image_rendered", message: `The image could not be drawn: ${error.message}` }),
    );
  } else if (message.kind === "set_selection") {
    selection = new Set((message.selection as { feature_ids: string[] }).feature_ids);
    restyle();
    editor.setSelection([...selection]);
    trackEditor.setSelection([...selection]);
  } else if (message.kind === "set_time") {
    showTime(message.time as TimeState);
  } else if (message.kind === "set_viewport") {
    showViewport((message.viewport as { bbox: number[] }).bbox);
  } else if (message.kind === "set_context") {
    contextMode = message.context_tracks as ContextTracks;
    applyContext();
  } else if (message.kind === "set_tote") {
    toteView = (message.tote_view as ToteView | undefined) ?? {};
    drawToteLines(time ? Date.parse(time.current) : NaN);
  } else if (message.kind === "set_narrative") {
    narrativeShown = message.timeline_entry as TimelineEntry | undefined;
    drawNarrative(time ? Date.parse(time.current) : NaN);
  } else if (message.kind === "show_fixes") {
    showFixes(message as Parameters<typeof showFixes>[0]);
  }
}
pageReady();
host.postMessage({ kind: "ready" });
