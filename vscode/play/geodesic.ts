/**
 * A demo for "Measuring on the real Earth": drag two positions, or move them
 * with the arrow keys, and compare the range and bearing Debrief v4 measures
 * (WGS84 geodesic, as GPS) with legacy Debrief's flat patches (1° of arc =
 * 60 nmi). The map is Web Mercator; the solid line is the geodesic, densified
 * as Debrief draws it (SUB-03), and the dashed one is just a straight line on
 * the chart, which is how neither of them measures.
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
const map = L.map("map", { attributionControl: false, zoomSnap: 0.25, worldCopyJump: true, keyboard: false }).setView([59.5, -4], 5);
fetch("land.geojson")
  .then((r) => r.json())
  .then((land) =>
    L.geoJSON(land, { interactive: false, style: { color: DATA_COLOURS.land, weight: 0.6, fillColor: DATA_COLOURS.land, fillOpacity: 0.35 } }).addTo(map),
  )
  .catch(() => undefined);

// A drawn pin: Leaflet's default marker images don't survive bundling.
const icon = L.divIcon({ className: "pin", iconSize: [18, 18] });
const pin = (latlng: L.LatLngExpression, label: string) =>
  L.marker(latlng, { draggable: true, title: `${label}: drag, or use the arrow keys`, alt: label, keyboard: true, icon })
    .bindTooltip(label, { permanent: true, direction: "right", className: "pin-label" })
    .addTo(map);
// Far enough apart, and far enough north, that the geodesic visibly bows away from
// the straight chart line and the two measurements part company.
const a = pin([58.0, -10.0], "A");
const b = pin([61.0, 2.0], "B");
const geodesicLine = L.polyline([], { color: DATA_COLOURS.track, weight: 3 }).addTo(map);
const mercatorLine = L.polyline([], { color: DATA_COLOURS.annotation, weight: 2, dashArray: "6 6" }).addTo(map);

/**
 * Legacy Debrief: each small patch of sea flat, one degree of arc 60 nmi. This is
 * MWC.Algorithms.EarthModels.FlatEarth.subtract (mid-latitude sailing: the change in
 * longitude scaled by the cosine of the mean latitude), which WorldLocation's
 * rangeFrom and bearingFrom use, with Conversions.Degs2Nm (× 60) for the range.
 */
function legacy(from: L.LatLng, to: L.LatLng): { range: number; bearing: number } {
  const mean = ((from.lat + to.lat) / 2) * (Math.PI / 180);
  const dLong = ((((to.lng - from.lng + 180) % 360) + 360) % 360) - 180; // signed, as legacy's signedRads
  const north = (to.lat - from.lat) * 60 * NMI;
  const east = dLong * 60 * NMI * Math.cos(mean);
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

// Keyboard: Tab to a pin, then the arrow keys move it, 10 pixels a press (Shift: 50).
for (const marker of [a, b]) {
  const element = marker.getElement()!;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `${marker.options.alt}: use the arrow keys to move it`);
  element.addEventListener("keydown", (event) => {
    const by = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (!by) return;
    event.preventDefault();
    const step = event.shiftKey ? 50 : 10;
    const point = map.latLngToContainerPoint(marker.getLatLng()).add([by[0] * step, by[1] * step]);
    const next = map.containerPointToLatLng(point);
    marker.setLatLng([Math.max(-85, Math.min(85, next.lat)), next.lng]);
    update();
  });
}
update();
map.fitBounds(L.latLngBounds([a.getLatLng(), b.getLatLng()]), { padding: [60, 60], animate: false });
