/**
 * The first guess of a TMA solution by two clicks on the map (CAP-21; product owner, 24 Oct
 * 2026): one on the first cut's line, one on the last's; the course and speed follow.
 *
 * Asked for by the bearing view (tma_guess, with the cuts). The first and last cuts' lines
 * are drawn in the theme's focus colour, brought into view, and the note says what to click. Each click is
 * taken onto its cut's line (the point on it level with the click; an ambiguous cut's nearer
 * line), marked, and the line between them drawn with the course and speed it makes; the
 * second click sends both (tma_guessed), and the host makes the solution as one step.
 * Escape, or the bearing view asking again, puts it away and makes nothing. The form in
 * the bearing view is the way without a pointer.
 */
import L from "leaflet";
import { DEFAULT_SETTINGS, formatTime } from "@debrief/kernel";
import type { DebriefFeatureCollection, TmaRequest } from "@debrief/schemas";
import { densify, travel, type LonLat } from "./geodesic.js";
import { bearingText, placeOfCut, sensorsOf, type CutFeature, type SensorEntry } from "./sensors.js";
import { describeTwoClicks, ontoLine } from "./tma.js";

const toLatLng = ([lon, lat]: LonLat) => L.latLng(lat, lon);
/** How far a cut's line is drawn for the clicks: well past any first guess. */
const LINE_M = 40 * 1852;
/** How much of each line is brought into view when the clicks are asked for. */
const SHOWN_M = 10 * 1852;

export interface GuessHost {
  map: L.Map;
  post(message: Record<string, unknown>): void;
  plot(): DebriefFeatureCollection | undefined;
  say(text: string): void;
}

interface Line {
  cut: CutFeature;
  entry: SensorEntry;
  origin: LonLat;
  time: number;
}

export class TmaGuess {
  private request?: TmaRequest;
  private ends: Line[] = [];
  private clicks: LonLat[] = [];
  private readonly layer = L.layerGroup();

  constructor(private readonly host: GuessHost) {
    this.layer.addTo(host.map);
    window.addEventListener(
      "keydown",
      (event) => {
        if (this.request && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.cancel();
        }
      },
      true,
    );
  }

  /** Whether the map is waiting for the clicks. */
  get active(): boolean {
    return !!this.request;
  }

  /** Ask for two clicks on these cuts' first and last lines; none to stop asking. */
  start(request: TmaRequest | undefined): void {
    this.stop();
    if (!request) return;
    const plot = this.host.plot();
    const lines = plot ? this.linesOf(plot, request) : [];
    if (lines.length < 2) {
      this.host.say("Those cuts cannot be shown for two clicks: they were not taken where the track has fixes. Use the form in Bearings instead.");
      this.host.post({ kind: "tma_guessed" });
      return;
    }
    this.request = request;
    this.ends = [lines[0], lines[lines.length - 1]];
    this.host.map.getContainer().classList.add("tma-guessing");
    for (const end of this.ends) this.drawCut(end);
    this.showEnds();
    this.host.say(`Click on the first cut's line, at ${this.when(this.ends[0])}; then on the last cut's, at ${this.when(this.ends[1])}. Escape cancels.`);
  }

  /** A click on the map: taken onto the next cut's line. True if it was one of the two clicks. */
  click(at: L.LatLng): boolean {
    if (!this.request) return false;
    const end = this.ends[this.clicks.length];
    const props = end.cut.properties;
    const click: LonLat = [L.Util.wrapNum(at.lng, [-180, 180], true), at.lat];
    const on = ontoLine(end.origin, props.bearing.value, props.ambiguous_bearing?.value, props.resolved, click);
    if (!on) {
      this.host.say(`That is behind where the cut at ${this.when(end)} was taken: click on its line, ahead of the sensor.`);
      return true;
    }
    this.clicks.push(click);
    L.circleMarker(toLatLng(on.position), { radius: 5, weight: 2, interactive: false, className: "tma-guess-point" }).addTo(this.layer);
    if (this.clicks.length === 1) {
      this.host.say(`First click on the cut at ${this.when(end)}, along ${bearingText(on.bearing)}. Now click on the last cut's line, at ${this.when(this.ends[1])}. Escape cancels.`);
      return true;
    }
    const first = this.ends[0];
    const start = ontoLine(first.origin, first.cut.properties.bearing.value, first.cut.properties.ambiguous_bearing?.value, first.cut.properties.resolved, this.clicks[0])!;
    L.polyline(densify([start.position, on.position]).map(toLatLng), { weight: 3, interactive: false, className: "tma-guess-leg" }).addTo(this.layer);
    this.host.say(`Making the solution: ${describeTwoClicks(start.position, on.position, (end.time - first.time) / 1000, DEFAULT_SETTINGS)}.`);
    this.host.post({ kind: "tma_guessed", tma_request: { first_position: this.clicks[0], last_position: this.clicks[1] } });
    this.request = undefined;
    this.host.map.getContainer().classList.remove("tma-guessing");
    // The marks stay until the plot is drawn again, with the solution.
    return true;
  }

  /** Escape: nothing made. */
  cancel(): void {
    if (!this.request) return;
    this.stop();
    this.host.say("No solution made.");
    this.host.post({ kind: "tma_guessed" });
  }

  /** Put away what the clicks drew: the plot was drawn again, or asked again. */
  stop(): void {
    this.request = undefined;
    this.ends = [];
    this.clicks = [];
    this.layer.clearLayers();
    this.host.map.getContainer().classList.remove("tma-guessing");
  }

  private when(line: Line): string {
    return formatTime(line.time, DEFAULT_SETTINGS);
  }

  /** Where the two cuts were taken, and their lines' first ten miles, brought into view if they are not. */
  private showEnds(): void {
    const points = this.ends.flatMap((line) => [line.origin, ...this.bearingsOf(line).map((b) => travel(line.origin, b, SHOWN_M))]);
    const bounds = L.latLngBounds(points.map(toLatLng));
    if (!this.host.map.getBounds().contains(bounds)) this.host.map.fitBounds(bounds.pad(0.1), { animate: false });
  }

  private bearingsOf(line: Line): number[] {
    const props = line.cut.properties;
    return props.ambiguous_bearing && !props.resolved ? [props.bearing.value, props.ambiguous_bearing.value] : [props.resolved === "ambiguous_bearing" && props.ambiguous_bearing ? props.ambiguous_bearing.value : props.bearing.value];
  }

  private drawCut(line: Line): void {
    for (const bearing of this.bearingsOf(line)) {
      // Along the geodesic at its bearing, far enough to click on wherever the solution is.
      const to = travel(line.origin, bearing, LINE_M);
      L.polyline(densify([line.origin, to]).map(toLatLng), { weight: 4, opacity: 0.9, interactive: false, className: "tma-guess-cut" }).addTo(this.layer);
    }
  }

  /** The first and last cuts asked for, with where each was taken from; those taken outside their track's fixes left out. */
  private linesOf(plot: DebriefFeatureCollection, request: TmaRequest): Line[] {
    const entries = sensorsOf(plot);
    const out: Line[] = [];
    const wanted = request.cut_ids ? new Set(request.cut_ids) : undefined;
    const sensors = request.sensor_ids ? new Set(request.sensor_ids) : undefined;
    const lo = request.period ? Date.parse(request.period.start) : -Infinity;
    const hi = request.period ? Date.parse(request.period.end) : Infinity;
    for (const entry of entries) {
      if (sensors && !sensors.has(entry.sensor.id)) continue;
      entry.cuts.forEach((cut, i) => {
        const t = entry.times[i];
        if (wanted ? !wanted.has(cut.id) : t < lo || t > hi) return;
        const place = placeOfCut(entry, cut);
        if (place) out.push({ cut, entry, origin: place.position, time: t });
      });
    }
    return out.sort((a, b) => a.time - b.time);
  }
}
