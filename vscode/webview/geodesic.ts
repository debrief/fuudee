/**
 * Lines drawn along geodesics, whatever the map's projection (SUB-03).
 * A straight line between two positions on a Web Mercator map is not the
 * path a vessel or a bearing follows; each segment is densified along the
 * WGS84 geodesic so the map shows the true path.
 */
import geodesic from "geographiclib-geodesic";

const WGS84 = geodesic.Geodesic.WGS84;
const MASK = geodesic.Geodesic.LONGITUDE | geodesic.Geodesic.LATITUDE | geodesic.Geodesic.LONG_UNROLL;
/** Longest drawn piece of a segment, in metres. */
const STEP_M = 2000;
const MAX_PIECES = 256;

export type LonLat = [number, number];

/**
 * The line densified along geodesics. Longitudes are unrolled, so a line that
 * crosses the antimeridian continues past ±180° rather than jumping across the
 * map; Leaflet draws that correctly.
 */
export function densify(points: LonLat[], stepM = STEP_M): LonLat[] {
  if (points.length < 2) return points;
  const out: LonLat[] = [points[0]];
  let lon = points[0][0]; // the unrolled longitude reached so far
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1];
    const [lon2, lat2] = points[i];
    const offset = lon - lon1; // multiple of 360 carried from earlier segments
    const line = WGS84.InverseLine(lat1, lon1, lat2, lon2);
    const pieces = Math.max(1, Math.min(MAX_PIECES, Math.ceil(line.s13 / stepM)));
    for (let k = 1; k <= pieces; k++) {
      const p = line.Position((line.s13 * k) / pieces, MASK);
      out.push([p.lon2! + offset, p.lat2!]);
    }
    lon = out[out.length - 1][0];
  }
  return out;
}
