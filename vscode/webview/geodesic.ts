/**
 * Lines drawn along geodesics, whatever the map's projection (SUB-03).
 * A straight line between two positions on a Web Mercator map is not the
 * path a vessel or a bearing follows; each segment is densified along the
 * WGS84 geodesic so the map shows the true path.
 */
import geodesic from "geographiclib-geodesic";

const WGS84 = geodesic.Geodesic.WGS84;
/** Longest drawn piece of a segment, in metres. */
const STEP_M = 2000;

export type LonLat = [number, number];

export function densify(points: LonLat[], stepM = STEP_M): LonLat[] {
  if (points.length < 2) return points;
  const out: LonLat[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1];
    const [lon2, lat2] = points[i];
    const line = WGS84.InverseLine(lat1, lon1, lat2, lon2);
    const pieces = Math.min(256, Math.ceil(line.s13 / stepM));
    for (let k = 1; k < pieces; k++) {
      const p = line.Position((line.s13 * k) / pieces, geodesic.Geodesic.LONGITUDE | geodesic.Geodesic.LONG_UNROLL | geodesic.Geodesic.LATITUDE);
      out.push([p.lon2!, p.lat2!]);
    }
    out.push([lon1 + unroll(lon2 - lon1), lat2]);
  }
  return out;
}

/** Keep longitudes continuous across the antimeridian. */
function unroll(delta: number): number {
  return ((((delta + 180) % 360) + 360) % 360) - 180;
}
