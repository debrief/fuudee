/**
 * The plot map (SUB-30): Web Mercator display, geodesic lines (SUB-03).
 *
 * - Click selects; Ctrl or Cmd click adds or removes; Escape or a click on
 *   empty sea clears (SUB-26, interaction model "Selection").
 * - Tracks are solid lines in their force colour, with ticks showing the
 *   direction of travel, a hollow dot at the first fix and a filled, labelled
 *   dot at the latest. Hovering a track shows the nearest fix.
 * - Annotations, including everything tools draw, are dashed and labelled.
 * - Selected features get an outline in the theme's text colour, which can
 *   never be mistaken for a force colour; everything else is dimmed.
 *
 * Interface colours come from the VS Code theme; data colours from palette.ts
 * (DEV-07). Plot content is always set as text, never as HTML.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import geodesic from "geographiclib-geodesic";
import { convert, DEFAULT_SETTINGS, formatBearing, formatPosition, formatQuantity, formatTime, UNIT_LABELS } from "@debrief/kernel";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { densify, type LonLat } from "./geodesic.js";
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
  for (const id of ids) for (const layer of drawn.get(id)?.layers ?? []) {
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
      ["track", "Track, in its force colour; ticks show direction"],
      ["first", "First fix"],
      ["latest", "Latest fix, labelled"],
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
const drawn = new Map<string, { layers: L.Layer[]; paths: L.Path[] }>();

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
  for (const [id, { paths }] of drawn) {
    const selected = selection.has(id);
    for (const path of paths) {
      const base = (path.options as { baseWeight?: number }).baseWeight ?? 2;
      path.setStyle({ weight: selected ? base + 1 : base, opacity: !any || selected ? 1 : 0.3 });
    }
  }
  halo.clearLayers();
  const outline = css("--vscode-editor-foreground");
  for (const id of selection) {
    for (const path of drawn.get(id)?.paths ?? []) {
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

function directionTicks(track: Track, colour: string): L.Marker[] {
  const coordinates = track.geometry.coordinates as LonLat[];
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

function draw(plot: DebriefFeatureCollection): void {
  features.clearLayers();
  drawn.clear();
  sized.length = 0;
  plotBounds = L.latLngBounds([]);
  for (const feature of plot.features) {
    const colour = colourOf(feature);
    const geometry = feature.geometry;
    if (!geometry) continue; // time-only annotations live in the outline (CAP-04)
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
      const line = L.polyline(latlngs, {
        color: colour,
        weight: isTrack ? 2.5 : 2,
        dashArray: isTrack ? undefined : "6 5",
        baseWeight: isTrack ? 2.5 : 2,
      } as L.PolylineOptions);
      line.on("click", click);
      if (isTrack) {
        const track = feature as Track;
        line.bindTooltip(text(name), { sticky: true });
        line.on("mousemove", (event: L.LeafletMouseEvent) => {
          line.setTooltipContent(text(describeFix(track, nearestFix(track, event.latlng))));
        });
        const first = L.circleMarker(toLatLng(coordinates[0]), { radius: 4, color: colour, weight: 2, fill: true, fillOpacity: 0, baseWeight: 2 } as L.CircleMarkerOptions);
        first.bindTooltip(text(describeFix(track, 0)));
        const latest = L.circleMarker(toLatLng(coordinates.at(-1)!), { radius: 4.5, color: colour, fillColor: colour, fillOpacity: 1, weight: 1, baseWeight: 1 } as L.CircleMarkerOptions);
        latest.bindTooltip(text(name), { permanent: true, direction: "right", className: "track-label", offset: [6, 0] });
        first.on("click", click);
        latest.on("click", click);
        paths.push(line, first, latest);
        layers.push(...directionTicks(track, colour));
      } else {
        line.bindTooltip(text(name), { permanent: true, direction: "center", className: "annotation-label" });
        paths.push(line);
      }
      latlngs.forEach((p) => plotBounds.extend(p));
    } else if (geometry.type === "Polygon") {
      const rings = (geometry.coordinates as LonLat[][]).map((ring) => densify(ring).map(toLatLng));
      const polygon = L.polygon(rings, { color: colour, weight: 1.5, dashArray: "6 5", fillOpacity: 0.05, baseWeight: 1.5 } as L.PolylineOptions);
      polygon.on("click", click);
      paths.push(polygon);
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
    drawn.set(feature.id, { layers: [...paths, ...layers], paths });
  }
  const empty = document.getElementById("empty")!;
  empty.hidden = plot.features.some((f) => f.geometry);
  empty.textContent = plot.features.length ? "This plot has nothing with a position." : "This plot is empty. Import a REP file to add tracks.";
  restyle();
  drawGraticule();
  placeLabels();
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

// --- Fitting the view ---------------------------------------------------------
let moved = false; // whether the analyst has panned or zoomed since the last fit
let fitting = false;
function fit(bounds: L.LatLngBounds): void {
  if (!bounds.isValid()) return;
  fitting = true;
  map.fitBounds(bounds, { padding: [40, 40], animate: false });
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
    draw(message.plot as DebriefFeatureCollection);
    if (firstShow) fit(plotBounds);
  } else if (message.kind === "set_selection") {
    selection = new Set((message.selection as { feature_ids: string[] }).feature_ids);
    restyle();
  }
});
host.postMessage({ kind: "ready" });
