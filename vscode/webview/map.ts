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
 *   context is clear (at least 3:1 on any theme), faint or off; see
 *   contrast.ts. Hovering a track shows the nearest fix.
 * - Annotations, including everything tools draw, are dashed and labelled.
 *   One with a time or a period is drawn only while that falls in the window;
 *   one without a time always is.
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
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import geodesic from "geographiclib-geodesic";
import { convert, DEFAULT_SETTINGS, formatBearing, formatPosition, formatQuantity, formatTime, UNIT_LABELS } from "@debrief/kernel";
import type { DebriefFeatureCollection, TimeState } from "@debrief/schemas";
import { densify, type LonLat } from "./geodesic.js";
import { CONTEXT_WEIGHT, contextStyle, parseColour, WINDOW_WEIGHT, type ContextStyle, type ContextTracks, type MapTheme, type Rgb } from "./contrast.js";
import { DATA_COLOURS } from "./palette.js";
import { host, onMessage } from "./vscode.js";

type Feature = DebriefFeatureCollection["features"][number];
type Track = Extract<Feature, { properties: { kind: "track" } }>;
const settings = DEFAULT_SETTINGS;
const WGS84 = geodesic.Geodesic.WGS84;

const root = document.getElementById("root")!;
root.innerHTML = `<div id="map" tabindex="0" aria-label="Plot map"></div><div id="status" class="status"></div><div id="empty" class="empty" hidden></div>`;
const status = document.getElementById("status")!;
const mapElement = document.getElementById("map")!;

const map = L.map(mapElement, { zoomControl: true, attributionControl: false, worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 0.5 });
map.setView([50, -4], 6);

const css = (name: string) => getComputedStyle(document.body).getPropertyValue(name).trim();
const toLatLng = ([lon, lat]: LonLat) => L.latLng(lat, lon);

/** Text for Leaflet tooltips, as a text node so plot content can never be markup. */
function text(content: string): HTMLElement {
  const span = document.createElement("span");
  span.textContent = content;
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
      ["track", "Track in the time window, in its force colour; ticks show direction"],
      ["context", "Track outside the time window"],
      ["first", "First fix in the window"],
      ["latest", "Last fix in the window, labelled"],
      ["now", "Position at current time"],
      ["annotation", "Annotation, including what tools draw"],
      ["selected", "Selected"],
    ];
    for (const [kind, label] of rows) {
      const row = L.DomUtil.create("div", "legend-row", div);
      L.DomUtil.create("span", `swatch swatch-${kind}`, row);
      L.DomUtil.create("span", "", row).textContent = label;
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
  /** How the context line is drawn now; none when context tracks are off. */
  contextStyle?: ContextStyle;
  /** The track's own colour. */
  colour?: string;
  /** An annotation's time or period, if it has one. */
  when?: { start: number; end: number };
}
const drawn = new Map<string, Drawn>();

// --- Context tracks: each track outside the window (CAP-29, expert panel 12 Oct) ----
/** How tracks outside the window are drawn: the plot's choice, the analyst's setting applied by the host. */
let contextMode: ContextTracks = "clear";
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
/** The key's context row: drawn as a track of the default colour would be, or gone when off. */
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
new MutationObserver(() => applyContext()).observe(document.body, { attributes: true, attributeFilter: ["class"] });
new MutationObserver(() => applyContext()).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });

function colourOf(feature: Feature): string {
  if (feature.properties.kind === "track") return feature.properties.style?.colour ?? DATA_COLOURS.track;
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
  halo.clearLayers();
  const outline = css("--vscode-editor-foreground");
  for (const id of selection) {
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
  const [lon, lat] = track.geometry.coordinates[index] as LonLat;
  const props = track.properties;
  const parts = [
    props.name,
    formatTime(Date.parse(props.times[index]), settings),
    formatPosition({ latitude: lat, longitude: lon }, settings),
  ];
  const course = props.courses?.values[index];
  if (course !== undefined && props.courses) parts.push(formatBearing({ value: course, unit: props.courses.unit }, settings));
  const speed = props.speeds?.values[index];
  if (speed !== undefined && props.speeds) parts.push(formatQuantity({ value: speed, unit: props.speeds.unit }, settings));
  const depth = props.depths?.values[index];
  if (depth !== undefined && props.depths) parts.push(`depth ${formatQuantity({ value: depth, unit: props.depths.unit }, settings)}`);
  return parts.join("  ·  ");
}

function directionTicks(coordinates: LonLat[], colour: string): L.Marker[] {
  if (coordinates.length < 3) return [];
  const count = Math.min(5, coordinates.length - 1);
  const ticks: L.Marker[] = [];
  for (let k = 1; k <= count; k++) {
    const i = Math.min(coordinates.length - 2, Math.floor((k * (coordinates.length - 1)) / (count + 1)));
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];
    const azimuth = WGS84.Inverse(lat1, lon1, lat2, lon2).azi1 ?? 0;
    const icon = L.divIcon({ className: "tick", html: "", iconSize: [12, 12] });
    const marker = L.marker(toLatLng(coordinates[i]), { icon, interactive: false, keyboard: false });
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

/** Areas, kept underneath everything else, so a track crossing an area's edge is on top. */
let areas: L.Path[] = [];
function draw(plot: DebriefFeatureCollection): void {
  areas = [];
  features.clearLayers();
  drawn.clear();
  sized.length = 0;
  plotBounds = L.latLngBounds([]);
  for (const feature of plot.features) {
    const colour = colourOf(feature);
    const geometry = feature.geometry;
    // Time-only annotations live in the outline (CAP-04); the plot's own details are not drawn.
    if (!geometry || feature.properties.kind === "plot") continue;
    const layers: L.Layer[] = [];
    const paths: L.Path[] = [];
    const click = (event: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(event);
      select(feature.id, event.originalEvent.ctrlKey || event.originalEvent.metaKey);
    };
    const name = feature.properties.name;
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
      const line = L.polyline(latlngs, { color: colour, weight: 2, dashArray: "6 5", baseWeight: 2 } as L.PolylineOptions);
      line.on("click", click);
      line.bindTooltip(text(name), { permanent: true, direction: "center", className: "annotation-label" });
      paths.push(line);
      latlngs.forEach((p) => plotBounds.extend(p));
    } else if (geometry.type === "Polygon") {
      const rings = (geometry.coordinates as LonLat[][]).map((ring) => densify(ring).map(toLatLng));
      // An area is selected by its outline, never by a click inside it: what lies inside,
      // such as a track in an exercise area, must stay clickable. Its fill takes no
      // clicks, and a wide, invisible line along its edge takes them instead.
      const polygon = L.polygon(rings, { color: colour, weight: 1.5, dashArray: "6 5", fillOpacity: 0.05, baseWeight: 1.5, interactive: false } as L.PolylineOptions);
      const edge = L.polyline(
        rings.map((ring) => [...ring, ring[0]]),
        { color: colour, opacity: 0, weight: 10, className: "area-edge" },
      );
      edge.on("click", click);
      paths.push(polygon);
      layers.push(edge);
      areas.push(polygon, edge);
      // Label at the northernmost point, so nested rings each keep a readable label.
      const top = rings[0].reduce((a, b) => (b.lat > a.lat ? b : a));
      const label = L.marker(top, { icon: L.divIcon({ className: "annotation-anchor", iconSize: [0, 0] }), interactive: false, keyboard: false });
      label.bindTooltip(text(name), { permanent: true, direction: "top", className: "annotation-label" });
      layers.push(label);
      sized.push({ label, bounds: L.latLngBounds(rings[0]) });
      rings[0].forEach((p) => plotBounds.extend(p));
    } else if (geometry.type === "Point") {
      const point = toLatLng(geometry.coordinates as LonLat);
      const marker = L.circleMarker(point, { radius: 4, color: colour, weight: 2, dashArray: "2 2", baseWeight: 2 } as L.CircleMarkerOptions);
      marker.on("click", click).bindTooltip(text(name), { permanent: true, direction: "right", className: "annotation-label" });
      paths.push(marker);
      plotBounds.extend(point);
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
  drawnWindow = undefined;
  drawWindow();
  drawGraticule();
  placeLabels();
}

/** An annotation's time or period, if it has one: it is drawn only while that is in the window. */
function timeOf(feature: Feature): { start: number; end: number } | undefined {
  if (feature.properties.kind !== "annotation") return undefined;
  const { time, time_range: range } = feature.properties;
  if (range) return { start: Date.parse(range.start), end: Date.parse(range.end) };
  return time ? { start: Date.parse(time), end: Date.parse(time) } : undefined;
}

/** Hovering a track line shows its nearest fix. */
function hoverFixes(line: L.Polyline, track: Track): void {
  line.bindTooltip(text(track.properties.name), { sticky: true });
  line.on("mousemove", (event: L.LeafletMouseEvent) => {
    line.setTooltipContent(text(describeFix(track, nearestFix(track, event.latlng))));
  });
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
    if (!part) continue;
    const { track } = entry;
    const colour = colourOf(track);
    const click = (event: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(event);
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
      last.bindTooltip(text(track.properties.name), { permanent: true, direction: "right", className: "track-label", offset: [6, 0] });
      first.on("click", click);
      last.on("click", click);
      shown.windowedPaths.push(first, last);
    }
    shown.windowed = [...shown.windowedPaths, ...directionTicks(part.coordinates, colour)];
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
}

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

// Annotation labels only where the shape is big enough on screen to carry one.
const sized: { label: L.Layer & { getTooltip(): L.Tooltip | undefined }; bounds: L.LatLngBounds }[] = [];
function placeLabels(): void {
  for (const { label, bounds } of sized) {
    const size = map.latLngToContainerPoint(bounds.getNorthEast()).distanceTo(map.latLngToContainerPoint(bounds.getSouthWest()));
    const element = label.getTooltip()?.getElement();
    if (element) element.style.visibility = size >= 70 ? "visible" : "hidden";
  }
}
map.on("zoomend", placeLabels);

// --- Current time and the window (shared state) ------------------------------------
// Set by the time controller beside the map; the map only shows them.
const now = L.layerGroup().addTo(map);
/** Each track with its fix times parsed once, and its marker at current time. */
let tracks: { track: Track; times: number[]; marker?: L.Marker }[] = [];
let time: TimeState | undefined;

function setTracks(plotTracks: Track[]): void {
  now.clearLayers();
  tracks = plotTracks.map((track) => ({ track, times: track.properties.times.map(Date.parse) }));
}

/** Where a track was at an instant, between the fixes either side; none outside its span. */
function positionAt(track: Track, times: number[], at: number): LonLat | undefined {
  const coordinates = track.geometry.coordinates as LonLat[];
  if (!times.length || at < times[0] || at > times[times.length - 1]) return undefined;
  let low = 0;
  let high = times.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (times[middle] <= at) low = middle;
    else high = middle;
  }
  const span = times[high] - times[low];
  const f = span > 0 ? (at - times[low]) / span : 0;
  const [lon1, lat1] = coordinates[low];
  const [lon2, lat2] = coordinates[high];
  // Along the geodesic between the two fixes, as the line is drawn (SUB-03).
  const line = WGS84.InverseLine(lat1, lon1, lat2, lon2);
  const point = line.Position(f * line.s13);
  return [point.lon2 ?? lon2, point.lat2 ?? lat2];
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
    const marker = L.marker(toLatLng(position), { icon, keyboard: false, title: track.properties.name });
    marker.on("add", () => marker.getElement()?.style.setProperty("--now-colour", colour));
    marker.on("click", (event: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(event);
      select(track.id, event.originalEvent.ctrlKey || event.originalEvent.metaKey);
    });
    marker.addTo(now);
    entry.marker = marker;
  }
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
  });
}

// --- Viewport (shared state) -----------------------------------------------------
let reporting: ReturnType<typeof setTimeout> | undefined;
let settingViewport = false; // a move made to show a viewport set elsewhere is not reported back
map.on("moveend", () => {
  clearTimeout(reporting);
  if (settingViewport) return;
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
// When a form or results panel opens beside the map, keep the plot in view.
new ResizeObserver(() => {
  if (!mapElement.clientWidth || !mapElement.clientHeight) return; // hidden: nothing to fit
  fitting = true; // resizing moves the map, but the analyst didn't
  map.invalidateSize({ animate: false });
  fitting = false;
  if (!moved) fit(plotBounds);
}).observe(mapElement);

map.on("click", () => select(undefined, false));
mapElement.addEventListener("keydown", (event) => {
  if (event.key === "Escape") select(undefined, false);
});
map.on("mousemove", (event: L.LeafletMouseEvent) => {
  status.textContent = formatPosition({ latitude: event.latlng.lat, longitude: L.Util.wrapNum(event.latlng.lng, [-180, 180], true) }, settings);
});

let shownPlot = "";
onMessage((message) => {
  if (message.kind === "show_plot") {
    const sel = message.selection as { plot: string; feature_ids: string[] };
    const firstShow = sel.plot !== shownPlot;
    shownPlot = plotId = sel.plot;
    selection = new Set(sel.feature_ids);
    showTime(message.time as TimeState | undefined);
    contextMode = (message.context_tracks as ContextTracks | undefined) ?? "clear";
    draw(message.plot as DebriefFeatureCollection);
    showHidden(typeof message.hidden_count === "number" ? message.hidden_count : 0);
    if (firstShow) fit(plotBounds);
  } else if (message.kind === "set_selection") {
    selection = new Set((message.selection as { feature_ids: string[] }).feature_ids);
    restyle();
  } else if (message.kind === "set_time") {
    showTime(message.time as TimeState);
  } else if (message.kind === "set_viewport") {
    showViewport((message.viewport as { bbox: number[] }).bbox);
  } else if (message.kind === "set_context") {
    contextMode = message.context_tracks as ContextTracks;
    applyContext();
  }
});
host.postMessage({ kind: "ready" });
