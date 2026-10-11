/**
 * A demo for "Measuring on the real Earth": drag two positions and compare the
 * range and bearing Debrief v4 measures (WGS84 geodesic, as GPS) with legacy
 * Debrief's flat patches (1° of arc = 60 nmi). The map is Web Mercator; the
 * solid line is the geodesic, densified as Debrief draws it (SUB-03), and the
 * dashed one is the straight line a Mercator chart would draw.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import geodesic from "geographiclib-geodesic";
import { DEFAULT_SETTINGS, formatBearing, formatPosition, formatQuantity } from "@debrief/kernel";
import { densify, type LonLat } from "../webview/geodesic.js";
import { DATA_COLOURS } from "../webview/palette.js";

const WGS84 = geodesic.Geodesic.WGS84;
const NMI = 1852;
const settings = DEFAULT_SETTINGS;
if (matchMedia("(prefers-color-scheme: light)").matches || new URLSearchParams(location.search).get("theme") === "light") {
  document.documentElement.classList.add("light");
}

document.documentElement.style.setProperty("--debrief-track", DATA_COLOURS.track);
document.documentElement.style.setProperty("--debrief-annotation", DATA_COLOURS.annotation);
const map = L.map("map", { attributionControl: false, zoomSnap: 0.25, worldCopyJump: true }).setView([50.2, -4.4], 8);
fetch("land.geojson")
  .then((r) => r.json())
  .then((land) =>
    L.geoJSON(land, { interactive: false, style: { color: DATA_COLOURS.land, weight: 0.6, fillColor: DATA_COLOURS.land, fillOpacity: 0.35 } }).addTo(map),
  )
  .catch(() => undefined);

// A drawn pin: Leaflet's default marker images don't survive bundling.
const icon = L.divIcon({ className: "pin", iconSize: [18, 18] });
const pin = (latlng: L.LatLngExpression, label: string) =>
  L.marker(latlng, { draggable: true, title: label, keyboard: true, icon })
    .bindTooltip(label, { permanent: true, direction: "right", className: "pin-label" })
    .addTo(map);
const a = pin([50.0, -5.0], "A");
const b = pin([50.6, -3.9], "B");
const geodesicLine = L.polyline([], { color: DATA_COLOURS.track, weight: 3 }).addTo(map);
const mercatorLine = L.polyline([], { color: DATA_COLOURS.annotation, weight: 2, dashArray: "6 6" }).addTo(map);

/** Legacy Debrief: each small patch of sea flat, one degree of arc 60 nmi. */
function legacy(from: L.LatLng, to: L.LatLng): { range: number; bearing: number } {
  const mean = ((from.lat + to.lat) / 2) * (Math.PI / 180);
  const north = (to.lat - from.lat) * 60 * NMI;
  const east = (to.lng - from.lng) * 60 * NMI * Math.cos(mean);
  return { range: Math.hypot(north, east), bearing: ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360 };
}

const text = (id: string, value: string) => (document.getElementById(id)!.textContent = value);
const nmi = (m: number) => formatQuantity({ value: m / NMI, unit: "[nmi_i]" }, settings);
const deg = (d: number) => formatBearing({ value: d, unit: "deg" }, settings);

function update(): void {
  const [p, q] = [a.getLatLng(), b.getLatLng()];
  const ends: LonLat[] = [
    [p.lng, p.lat],
    [q.lng, q.lat],
  ];
  geodesicLine.setLatLngs(densify(ends).map(([lon, lat]) => L.latLng(lat, lon)));
  mercatorLine.setLatLngs([p, q]);
  const g = WGS84.Inverse(p.lat, p.lng, q.lat, q.lng);
  const v4 = { range: g.s12 ?? 0, bearing: ((g.azi1 ?? 0) + 360) % 360 };
  const old = legacy(p, q);
  text("a", formatPosition({ latitude: p.lat, longitude: p.lng }, settings));
  text("b", formatPosition({ latitude: q.lat, longitude: q.lng }, settings));
  text("v4-range", nmi(v4.range));
  text("v4-bearing", deg(v4.bearing));
  text("old-range", nmi(old.range));
  text("old-bearing", deg(old.bearing));
  const dBearing = Math.abs(((v4.bearing - old.bearing + 540) % 360) - 180);
  text("diff-range", `${Math.round(Math.abs(v4.range - old.range))} m`);
  text("diff-bearing", `${dBearing.toFixed(2)}°`);
}
a.on("drag", update);
b.on("drag", update);
update();
map.fitBounds(L.latLngBounds([a.getLatLng(), b.getLatLng()]), { padding: [60, 60], animate: false });
