/**
 * Lines drawn along geodesics, whatever the map's projection (SUB-03).
 * A straight line between two positions on a Web Mercator map is not the
 * path a vessel or a bearing follows; each segment is densified along the
 * WGS84 geodesic so the map shows the true path.
 */
import geodesic from "geographiclib-geodesic";

const WGS84 = geodesic.Geodesic.WGS84;
const MASK = geodesic.Geodesic.LONGITUDE | geodesic.Geodesic.LATITUDE | geodesic.Geodesic.LONG_UNROLL;
/** Longitudes within ±180°, as the kernel gives positions. */
const MASK_WRAPPED = geodesic.Geodesic.LONGITUDE | geodesic.Geodesic.LATITUDE;
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

/** Points the map draws around a circle or an ellipse: enough to look smooth at any zoom. */
export const RING_POINTS = 180;

/**
 * A closed ring at one geodesic range from centre (SUB-03): what the map draws
 * for a circle, from its centre and radius, not from the polygon stored for
 * other tools. Longitudes are unrolled about the centre, so a circle across the
 * antimeridian is drawn whole.
 */
export function circleRing(centre: LonLat, radiusM: number, points = RING_POINTS): LonLat[] {
  return ring(centre, (t) => [t, radiusM], points);
}

/**
 * A closed ring approximating an ellipse about centre, its longer axis along
 * orientation (degrees true): at parametric angle t, the point (a cos t, b sin t)
 * in the ellipse's own axes, reached along the geodesic from the centre. As
 * debrief_kernel.geodesy.ellipse_ring makes the stored polygon.
 */
export function ellipseRing(centre: LonLat, semiMajorM: number, semiMinorM: number, orientationDeg: number, points = RING_POINTS): LonLat[] {
  return ring(
    centre,
    (t) => {
      const r = (t * Math.PI) / 180;
      const x = semiMajorM * Math.cos(r);
      const y = semiMinorM * Math.sin(r);
      return [(orientationDeg + (Math.atan2(y, x) * 180) / Math.PI + 360) % 360, Math.hypot(x, y)];
    },
    points,
  );
}

function ring(centre: LonLat, at: (t: number) => [number, number], points: number): LonLat[] {
  const [lon, lat] = centre;
  const out: LonLat[] = [];
  for (let i = 0; i < points; i++) {
    const [bearing, distance] = at((360 * i) / points);
    const p = WGS84.Direct(lat, lon, bearing, distance, MASK);
    out.push([p.lon2!, p.lat2!]);
  }
  out.push(out[0]);
  return out;
}

/** The range in metres and the initial bearing in degrees true from a to b, along the geodesic (SUB-03). */
export function rangeBearing(a: LonLat, b: LonLat): { metres: number; bearing: number } {
  const g = WGS84.Inverse(a[1], a[0], b[1], b[0]);
  return { metres: g.s12 ?? 0, bearing: (((g.azi1 ?? 0) % 360) + 360) % 360 };
}

/** The position reached from a along the geodesic at bearing (degrees true) for metres. */
export function travel(a: LonLat, bearing: number, metres: number): LonLat {
  const p = WGS84.Direct(a[1], a[0], bearing, metres, MASK);
  return [p.lon2!, p.lat2!];
}

/** The area inside a ring of corners (not closed), in square metres, along geodesics. */
export function geodesicArea(corners: LonLat[]): number {
  if (corners.length < 3) return 0;
  const polygon = WGS84.Polygon(false);
  for (const [lon, lat] of corners) polygon.AddPoint(lat, lon);
  return Math.abs(polygon.Compute(false, true).area ?? 0);
}

/**
 * Where a track was at an instant (SUB-03): along the geodesic between the fixes either
 * side, in proportion to time; none outside its span. Where fixes share a time, the later
 * one. The map's marker at current time; the Tote's measures place tracks the same way
 * (debrief_kernel.geodesy.TrackPath), held to schemas/vectors/track-positions.json.
 */
export function positionAt(coordinates: LonLat[], times: number[], at: number): LonLat | undefined {
  return pointAt(coordinates, times, at)?.position;
}

/** The fixes either side of an instant within a track's span: the later of fixes sharing a time. */
function bracket(times: number[], at: number): [number, number] {
  let low = 0;
  let high = times.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (times[middle] <= at) low = middle;
    else high = middle;
  }
  return [low, high];
}

/** The direction of travel, degrees true, along the geodesic from fix i to fix j; none if they are at one place. */
function legCourse(coordinates: LonLat[], i: number, j: number): number | undefined {
  const [lon1, lat1] = coordinates[i];
  const [lon2, lat2] = coordinates[j];
  const g = WGS84.Inverse(lat1, lon1, lat2, lon2);
  return (g.s12 ?? 0) > 0.01 ? (((g.azi1 ?? 0) % 360) + 360) % 360 : undefined;
}

/**
 * Where a track was at an instant, as positionAt gives it, and its direction of travel
 * there (degrees true): along the geodesic between the fixes either side, the course at
 * that point of it. At a fix, the course of the leg leaving it (the leg arriving, at the
 * last fix); where the track did not move, the nearest leg before it that did. None
 * outside its span; no course for a track that never moved. The map's direction arrows
 * at a set interval (CAP-32) are drawn so, on the line and along it.
 */
export function pointAt(coordinates: LonLat[], times: number[], at: number): { position: LonLat; course?: number } | undefined {
  if (!times.length || at < times[0] || at > times[times.length - 1]) return undefined;
  if (times.length === 1) return { position: coordinates[0] };
  const [low, high] = bracket(times, at);
  const span = times[high] - times[low];
  const f = span > 0 ? (at - times[low]) / span : 1;
  const legBefore = (end: number) => {
    for (let k = end; k > 0; k--) {
      const course = legCourse(coordinates, k - 1, k);
      if (course !== undefined) return course;
    }
    return undefined;
  };
  if (f <= 0 || f >= 1) {
    const fix = f <= 0 ? low : high;
    const leaving = fix + 1 < coordinates.length ? legCourse(coordinates, fix, fix + 1) : undefined;
    return { position: coordinates[fix], course: leaving ?? legBefore(fix) };
  }
  const [lon1, lat1] = coordinates[low];
  const [lon2, lat2] = coordinates[high];
  const line = WGS84.InverseLine(lat1, lon1, lat2, lon2);
  const point = line.Position(f * line.s13, MASK_WRAPPED | geodesic.Geodesic.AZIMUTH);
  const moved = line.s13 > 0.01;
  return {
    position: [point.lon2 ?? lon2, point.lat2 ?? lat2],
    course: moved ? ((((point.azi2 ?? 0) % 360) + 360) % 360) : legBefore(low),
  };
}
