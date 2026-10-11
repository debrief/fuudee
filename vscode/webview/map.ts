/**
 * The plot map (SUB-30): Web Mercator display, geodesic lines (SUB-03), click
 * to select, Ctrl or Shift click to add to the selection (SUB-26). Interface
 * colours come from the VS Code theme; data colours from palette.ts (DEV-07).
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import { DEFAULT_SETTINGS, formatPosition } from "@debrief/kernel";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { densify, type LonLat } from "./geodesic.js";
import { DATA_COLOURS } from "./palette.js";
import { host, onMessage } from "./vscode.js";

type Feature = DebriefFeatureCollection["features"][number];

const root = document.getElementById("root")!;
root.innerHTML = `<div id="map"></div><div id="status" class="status"></div><div id="empty" class="empty" hidden></div>`;
const status = document.getElementById("status")!;

const map = L.map("map", { zoomControl: true, attributionControl: false, preferCanvas: false, worldCopyJump: true });
map.setView([50, -4], 6);
L.control.scale({ metric: true, imperial: false, position: "bottomright" }).addTo(map);

const css = (name: string) => getComputedStyle(document.body).getPropertyValue(name).trim();
const toLatLng = ([lon, lat]: LonLat) => L.latLng(lat, lon);

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
const features = L.layerGroup().addTo(map);
let current: Feature[] = [];
let selection = new Set<string>();
let plotId = "";
const drawn = new Map<string, L.Path[]>();

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
  for (const [id, paths] of drawn) {
    const selected = selection.has(id);
    for (const path of paths) {
      const base = (path.options as { baseWeight?: number }).baseWeight ?? 2;
      path.setStyle({ weight: selected ? base + 2.5 : base, opacity: selected || selection.size === 0 ? 1 : 0.55 });
      if (selected) path.bringToFront();
    }
  }
  halo.clearLayers();
  for (const id of selection) {
    for (const path of drawn.get(id) ?? []) {
      if (path instanceof L.Polyline) {
        L.polyline(path.getLatLngs() as L.LatLng[], {
          color: css("--vscode-focusBorder"),
          weight: ((path.options as { baseWeight?: number }).baseWeight ?? 2) + 8,
          opacity: 0.45,
          interactive: false,
        }).addTo(halo);
      }
    }
  }
  halo.eachLayer((l) => (l as L.Path).bringToBack());
}
const halo = L.layerGroup().addTo(map);

function draw(plot: DebriefFeatureCollection, fit: boolean): void {
  features.clearLayers();
  drawn.clear();
  current = plot.features;
  const bounds = L.latLngBounds([]);
  for (const feature of current) {
    const colour = colourOf(feature);
    const geometry = feature.geometry;
    if (!geometry) continue; // time-only annotations live in the outline (CAP-04)
    const paths: L.Path[] = [];
    const click = (event: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(event);
      select(feature.id, event.originalEvent.ctrlKey || event.originalEvent.metaKey || event.originalEvent.shiftKey);
    };
    const label = feature.properties.name;
    if (geometry.type === "LineString") {
      const latlngs = densify(geometry.coordinates as LonLat[]).map(toLatLng);
      const isTrack = feature.properties.kind === "track";
      const line = L.polyline(latlngs, {
        color: colour,
        weight: isTrack ? 2.5 : 2,
        dashArray: isTrack ? undefined : "6 4",
        baseWeight: isTrack ? 2.5 : 2,
      } as L.PolylineOptions);
      line.on("click", click).bindTooltip(label, { sticky: true });
      paths.push(line);
      if (isTrack) {
        const start = toLatLng(geometry.coordinates[0] as LonLat);
        const marker = L.circleMarker(start, { radius: 4, color: colour, fillColor: colour, fillOpacity: 1, weight: 1 });
        marker.on("click", click);
        marker.bindTooltip(label, { permanent: true, direction: "right", className: "track-label", offset: [6, 0] });
        paths.push(marker);
      }
      latlngs.forEach((p) => bounds.extend(p));
    } else if (geometry.type === "Polygon") {
      const rings = (geometry.coordinates as LonLat[][]).map((ring) => densify(ring).map(toLatLng));
      const polygon = L.polygon(rings, {
        color: colour,
        weight: 1.5,
        fillOpacity: 0.06,
        baseWeight: 1.5,
      } as L.PolylineOptions);
      polygon.on("click", click).bindTooltip(label, { sticky: true });
      paths.push(polygon);
      rings[0].forEach((p) => bounds.extend(p));
    } else if (geometry.type === "Point") {
      const point = toLatLng(geometry.coordinates as LonLat);
      const marker = L.circleMarker(point, { radius: 5, color: colour, weight: 2, baseWeight: 2 } as L.CircleMarkerOptions);
      marker.on("click", click).bindTooltip(label, { permanent: true, direction: "right", className: "track-label" });
      paths.push(marker);
      bounds.extend(point);
    }
    paths.forEach((p) => p.addTo(features));
    drawn.set(feature.id, paths);
  }
  const empty = document.getElementById("empty")!;
  empty.hidden = current.some((f) => f.geometry);
  empty.textContent = current.length ? "This plot has nothing with a position." : "This plot is empty. Import a REP file to add tracks.";
  if (fit && bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
  restyle();
  drawGraticule();
}

map.on("click", () => select(undefined, false));
map.on("mousemove", (event: L.LeafletMouseEvent) => {
  status.textContent = formatPosition({ latitude: event.latlng.lat, longitude: L.Util.wrapNum(event.latlng.lng, [-180, 180], true) }, DEFAULT_SETTINGS);
});

let shownPlot = "";
onMessage((message) => {
  if (message.kind === "show_plot") {
    const sel = message.selection as { plot: string; feature_ids: string[] };
    const fit = sel.plot !== shownPlot;
    shownPlot = plotId = sel.plot;
    selection = new Set(sel.feature_ids);
    draw(message.plot as DebriefFeatureCollection, fit);
  } else if (message.kind === "set_selection") {
    selection = new Set((message.selection as { feature_ids: string[] }).feature_ids);
    restyle();
  }
});
host.postMessage({ kind: "ready" });
