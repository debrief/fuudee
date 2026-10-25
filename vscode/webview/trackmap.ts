/**
 * Moving, rotating, shearing and stretching a track on the map (CAP-01, CAP-02,
 * CAP-21, NFR-13): handles on a track selected alone, the live preview while one
 * is dragged, and the keyboard. What each gesture makes is in trackedit.ts, free
 * of Leaflet.
 *
 * - A track selected on its own shows three handles in the theme's focus
 *   colour: one to move it (on a fix in the middle of what moves), one to
 *   rotate it (beyond the fix farthest from the pivot, on a dashed arm), and
 *   the pivot it rotates about (by default the fix nearest current time, or
 *   the first fix of what moves). A small control says what moves: the whole
 *   track, or only its fixes in the time window.
 * - Dragging the move or rotate handle shows the track moved or turned as the
 *   pointer goes, the track as it was dashed beneath, and says by how much
 *   ("BLUE ONE: moving 1.20 nmi 045.0°T"). Letting go sends the change
 *   (edit_track): one step. Escape during a drag puts it back. Moving only the
 *   fixes in the window shows the joins jumping, as they will.
 * - Dragging the pivot, or moving it with the arrow keys, chooses where the
 *   next rotation turns about; it records nothing.
 * - Two diamonds, beside the first and last fixes of what changes, are
 *   its ends. Dragging one shears the track (the other end held, every fix
 *   moved in proportion to its time from it: course and speed change
 *   together, "BLUE ONE: shearing to 087.2°T 12.4 kn; end moved ...") or, with
 *   Stretch chosen in the control, stretches it (only how far along the leg
 *   counts: speed changes, course does not). On the keyboard, the arrow keys
 *   move a shear handle as the move handle; on a stretch handle Up and Right
 *   are faster by one step of speed (0.1 kn), Down and Left slower, ten steps
 *   with Shift.
 * - From the keyboard: Tab to a handle. The arrow keys move the move handle 5
 *   pixels (25 with Shift) and turn the rotate handle 1° (10° with Shift),
 *   Right and Up clockwise; the change is sent when the analyst stops (or
 *   presses Enter, or moves on), so one run of presses is one step. Presses
 *   made while that step is being saved are kept and made as the next one.
 * - Single fixes (part B3): zoomed in far enough that fixes are apart on the
 *   screen (FIX_SPACING_PX, and no more than MOST_FIX_HANDLES in view), each fix
 *   in view has a small ring of its own, drawn beneath the track's other
 *   handles. Dragging one moves that fix alone: its time, its recorded course
 *   and speed and every other fix stay. The note says how far and which way, and
 *   the speeds the positions now imply to reach it and to go on from it, and
 *   whether that is as fast as a jump. Letting go is one step; Escape puts it
 *   back. Tab reaches each ring (after the track's other handles); the arrow
 *   keys nudge it 5 pixels (25 with Shift), one step for the run. Right-click
 *   it, or press and hold it on a touch screen, for the fix's menu.
 * - A track plotted by dead reckoning (decision, product owner, 14 Oct 2026) is
 *   previewed as dead reckoning makes it: a move of the whole track moves where it
 *   starts; every other gesture changes courses and speeds (a fix dragged, the leg
 *   into it), and the fixes after follow on, their rings with them. A time window
 *   that starts after the first fix turns about its own first fix.
 * - A TMA solution (CAP-21; product owner, 24 Oct 2026) is a DR track like any other,
 *   dragged the same way; split into legs, the control offers This leg too: the leg current
 *   time is in, dragged on its own, the legs after it following on, joined. While one is
 *   dragged the map says where it is now to the bearing view (tma_preview), which works its
 *   residuals out again as it moves; and that the drag ended, or was put back.
 * - Nothing here changes current time, the window or the selection. If the
 *   plot changes elsewhere during a drag, the drag is dropped and the map says so.
 */
import L from "leaflet";
import { DEFAULT_SETTINGS, formatTime } from "@debrief/kernel";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { densify, type LonLat } from "./geodesic.js";
import {
  changesNothing,
  defaultPivotIndex,
  dragGesture,
  endPlaces,
  fixHandleIndices,
  gestureChange,
  handlePlaces,
  isEnd,
  jumpSpeed,
  KeyRun,
  legOf,
  periodIndices,
  pivotReadout,
  pressKey,
  reckoningOf,
  speedIn,
  startGesture,
  turned,
  type EndMode,
  type Gesture,
  type Reckoning,
  type Screen,
  type Span,
  type Target,
  type TrackRole,
} from "./trackedit.js";

type Feature = DebriefFeatureCollection["features"][number];
type Track = Extract<Feature, { properties: { kind: "track" } }>;
const DRAG_PX = 4;
/** How far beyond its fix an end's handle is drawn, in pixels, so it is clear of the move handle and the pivot. */
const END_OFFSET_PX = 18;
const END_SIZE = 14;
/** A fix's own handle: smaller than the track's, so they stand out above it where they share a fix. */
const FIX_SIZE = 12;
/** The most fixes marked one by one while a track is moved. */
const MARKED_FIXES = 120;
const settings = DEFAULT_SETTINGS;
const toLatLng = ([lon, lat]: LonLat) => L.latLng(lat, lon);
const lonLat = (p: L.LatLng): LonLat => [p.lng, p.lat];

export interface TrackHost {
  map: L.Map;
  /** The map's own element, which takes keyboard focus. */
  element: HTMLElement;
  post(message: Record<string, unknown>): void;
  /** The track with this id, if it is drawn on the map now. */
  track(id: string): { feature: Track; times: number[]; colour: string } | undefined;
  /** Current time, and the time window shown with its ends as written. */
  time(): { current: number; window: Span; range: { start: string; end: string } } | undefined;
  /** Draw or stop drawing a track's own lines, while its moved form is shown instead. */
  setShown(id: string, shown: boolean): void;
  /** Say something in the note at the top of the map. */
  say(text: string, readout?: string, saying?: "selection" | "other"): void;
  /** What the note is saying now: how to change the selection, something else (which the handles' note never replaces), or nothing. */
  noting(): "selection" | "other" | undefined;
  /** Whether an annotation is being drawn: the handles keep out of its way. */
  drawing(): boolean;
}

interface Selected {
  id: string;
  name: string;
  positions: LonLat[];
  times: number[];
  /** The times as the track writes them: a fix is found by its time. */
  fixTimes: string[];
  colour: string;
  /** Above this speed (metres a second), a fix moved is as fast as a jump. */
  jump: number;
  /** Plotted by dead reckoning: its courses and speeds, which the gestures change. */
  reckoning?: Reckoning;
  /** A TMA solution: whether the bearing view is told of its drags, and when its later legs start (ms). */
  tma?: { legStarts: number[] };
}

/** A press of an arrow key on a handle: on a fix's own handle, which fix. */
interface Press {
  role: TrackRole;
  key: string;
  shift: boolean;
  fixTime?: string;
}

/** What moves: the whole track, only its fixes in the time window, or (a TMA solution split into legs) the leg current time is in. */
export type Extent = "whole" | "window" | "leg";

/** The fixes of the leg a time is in (the first leg before the solution starts, the last after it ends): [first, last]. */
export function legIndices(times: number[], legStarts: number[], at: number | undefined): { indices: number[]; leg: number; legs: number } {
  const bounds = [0];
  for (const start of legStarts) {
    const index = times.findIndex((t) => t >= start);
    if (index > bounds[bounds.length - 1]) bounds.push(index);
  }
  bounds.push(times.length);
  const legs = bounds.length - 1;
  let leg = 0;
  if (at !== undefined) while (leg + 1 < legs && times[bounds[leg + 1]] <= at) leg++;
  const indices: number[] = [];
  for (let i = bounds[leg]; i < bounds[leg + 1]; i++) indices.push(i);
  return { indices, leg: leg + 1, legs };
}

export class TrackEditor {
  private selection: string[] = [];
  private selected?: Selected;
  private extent: Extent = "whole";
  /** What dragging an end of the period does. */
  private mode: EndMode = "shear";
  /** A pivot the analyst chose, by dragging it; otherwise the default. */
  private chosenPivot?: LonLat;
  private readonly preview = L.layerGroup();
  private readonly handleLayer = L.layerGroup();
  private handles = new Map<TrackRole, L.Marker>();
  /** Each fix's own handle, by the fix's time, beneath the track's other handles. */
  private readonly fixLayer = L.layerGroup();
  private fixHandles = new Map<string, L.Marker>();
  /** Whether fixes in view are too close together for handles of their own: the note says to zoom in. */
  private fixesTooClose = false;
  /** When a handle was last pressed with the pointer. */
  private pressedAt = 0;
  private arm?: L.Polyline;
  private drag?: Gesture & { start: L.Point; moved: boolean; pointer: number; element: HTMLElement };
  private dragEnded?: { at: L.Point; time: number };
  /** A run of arrow keys on the move or rotate handle, not yet sent. */
  private nudge?: Gesture;
  private readonly run = new KeyRun<Press>(() => this.commitNudge());
  private frame?: number;
  private rebuilding = false;
  private control?: { box: HTMLElement; whole: HTMLButtonElement; window: HTMLButtonElement; leg: HTMLButtonElement; shear: HTMLButtonElement; stretch: HTMLButtonElement };
  /** Whether the bearing view has been told of a drag of the selected solution, not yet of its end. */
  private previewing = false;
  private readonly screen: Screen;

  constructor(private readonly host: TrackHost) {
    this.preview.addTo(host.map);
    this.fixLayer.addTo(host.map);
    this.handleLayer.addTo(host.map);
    // Zooming or panning changes which fixes are in view, and whether they are far enough apart for handles.
    host.map.on("zoomend moveend resize", () => this.refresh());
    // A handle reached with Tab off the map's edge makes the browser scroll the map's own box to show
    // it, which leaves the map drawn out of line with where it is: put that back (the focus pans the map).
    const box = host.map.getContainer();
    box.addEventListener("scroll", () => {
      if (box.scrollLeft || box.scrollTop) box.scrollLeft = box.scrollTop = 0;
    });
    this.screen = {
      toPoint: (p) => {
        const point = host.map.latLngToContainerPoint(toLatLng(p));
        return [point.x, point.y];
      },
      toLonLat: ([x, y]) => lonLat(host.map.containerPointToLatLng([x, y])),
    };
    this.addControl();
    window.addEventListener(
      "keydown",
      (event) => {
        if (this.drag && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.cancelDrag();
        }
      },
      true,
    );
  }

  // --- The control: the whole track or its fixes in the window; shear or stretch -----------
  private addControl(): void {
    const editor = this;
    const Control = L.Control.extend({
      onAdd() {
        const box = L.DomUtil.create("div", "leaflet-bar track-extent");
        // Two choices, side by side for a screen reader as on the screen: what the handles change, and what dragging an end does.
        const extents = L.DomUtil.create("div", "track-extents", box);
        extents.setAttribute("role", "group");
        extents.setAttribute("aria-label", "What the handles on the selected track change");
        L.DomUtil.create("span", "track-extent-label", extents).textContent = "What changes";
        const button = (extent: Extent, text: string, title: string) => {
          const b = L.DomUtil.create("button", "track-extent-button", extents) as HTMLButtonElement;
          b.type = "button";
          b.textContent = text;
          b.title = title;
          b.dataset.extent = extent;
          b.addEventListener("click", (e) => {
            e.preventDefault();
            editor.setExtent(extent);
          });
          return b;
        };
        const whole = button("whole", "Whole track", "Move, rotate, shear or stretch every fix of the track");
        const inWindow = button("window", "Time window", "Change only the fixes in the time window; the track jumps where they meet the rest");
        const leg = button("leg", "This leg", "A TMA solution split into legs: change only the leg current time is in; the legs after it follow on, joined");
        // What dragging an end of the period does: shear (most used with TMA legs) or stretch.
        const ends = L.DomUtil.create("div", "track-ends", box);
        ends.setAttribute("role", "group");
        ends.setAttribute("aria-label", "What dragging an end of the selected track does");
        L.DomUtil.create("span", "track-extent-label", ends).textContent = "Drag the ends";
        const modeButton = (mode: EndMode, text: string, title: string) => {
          const b = L.DomUtil.create("button", "track-extent-button", ends) as HTMLButtonElement;
          b.type = "button";
          b.textContent = text;
          b.title = title;
          b.dataset.mode = mode;
          b.addEventListener("click", (e) => {
            e.preventDefault();
            editor.setMode(mode);
          });
          return b;
        };
        const shear = modeButton("shear", "Shear", "Drag an end: the other end stays, and course and speed change together");
        const stretch = modeButton("stretch", "Stretch", "Drag an end along the track: the other end stays, and only the speed changes");
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        box.hidden = true;
        editor.control = { box, whole, window: inWindow, leg, shear, stretch };
        return box;
      },
    });
    new Control({ position: "topleft" }).addTo(this.host.map);
  }

  /** Change the whole track, or only its fixes in the time window. */
  setExtent(extent: Extent): void {
    if (this.drag || this.nudge || this.run.saving) return;
    this.extent = extent;
    this.render(true);
  }

  /** Dragging an end shears the track, or stretches it. */
  setMode(mode: EndMode): void {
    if (this.drag || this.nudge || this.run.saving) return;
    this.mode = mode;
    this.render(true);
  }

  // --- The plot and the selection -------------------------------------------------------------
  /** The selection changed: handles on a track selected alone. */
  setSelection(ids: string[]): void {
    const before = this.selected?.id;
    this.selection = ids;
    const id = ids.length === 1 ? ids[0] : undefined;
    // The same track said again while it is dragged, nudged or being saved (the click that chose it
    // landing late, or another view): it stays as it is, the handle in use where the pointer has it.
    if (id && id === before && (this.drag || this.nudge || this.run.saving)) return;
    const shown = id ? this.host.track(id) : undefined;
    if (before && before !== id) this.cancelGesture();
    if (id !== before) this.chosenPivot = undefined;
    if (shown && id) {
      const positions = shown.feature.geometry.coordinates as LonLat[];
      const reckoning = reckoningOf(shown.feature.properties);
      const tag = shown.feature.properties.tma;
      const tma = tag ? { legStarts: (tag.leg_starts ?? []).map((t) => Date.parse(t)) } : undefined;
      this.selected = { id, name: shown.feature.properties.name, positions, times: shown.times, fixTimes: shown.feature.properties.times, colour: shown.colour, jump: jumpSpeed(positions, shown.times), ...(reckoning && { reckoning }), ...(tma && { tma }) };
    } else this.selected = undefined;
    this.render(before !== id);
  }

  /** The map drew the plot again: a change sent has come back, or the plot changed elsewhere. */
  plotDrawn(ids: string[]): void {
    const interrupted = (this.drag || this.nudge) && !this.run.saving;
    // The plot drawn again: the bearing view has the residuals from Python with it, so the
    // drag's live ones stay until they come, rather than going back to before the drag.
    this.previewing = false;
    const kept = this.run.saved();
    if (this.drag) this.endDrag();
    this.run.stop();
    this.nudge = undefined;
    this.preview.clearLayers();
    this.setSelection(ids);
    if (interrupted) this.host.say("The plot was changed elsewhere, so your change was not made. Debrief is showing the latest; try again if you still want to.");
    // Presses made while the last change was saved: now made, from where the track is now.
    else if (this.selected) for (const k of kept) this.key(k.role, k.key, k.shift, k.fixTime);
  }

  /** The time window or current time moved, or drawing began or ended: what moves, and the default pivot, may have changed. */
  refresh(): void {
    if (!this.drag && !this.nudge && !this.run.saving) this.render(false);
  }

  /** Whether a click is the end of a handle's drag: it selects nothing. */
  endingDrag(event: L.LeafletMouseEvent): boolean {
    if (this.drag) return true;
    const ended = this.dragEnded;
    this.dragEnded = undefined;
    return !!ended && Date.now() - ended.time < 500 && event.containerPoint.distanceTo(ended.at) < 2;
  }

  // --- What moves, and where the handles go -----------------------------------------------------
  private target(): Target | undefined {
    const s = this.selected;
    if (!s) return undefined;
    const time = this.host.time();
    const inWindow = this.extent === "window" && time;
    const leg = this.legOf(s);
    const indices = leg ? leg.indices : periodIndices(s.times, inWindow ? time.window : undefined);
    if (!indices.length) return undefined;
    // Plotted by dead reckoning, fixes in a window that starts after the first turn about the window's first fix.
    const fixed = this.pivotFixed(indices);
    const index = fixed ? indices[0] : this.chosenPivot ? undefined : defaultPivotIndex(s.times, indices, time?.current);
    return {
      name: s.name,
      positions: s.positions,
      times: s.times,
      indices,
      part: indices.length < s.times.length,
      pivot: fixed ? s.positions[index!] : (this.chosenPivot ?? s.positions[index!]),
      ...(inWindow && !leg && { period: time.range }),
      ...(leg && indices.length < s.times.length && { period: { start: s.fixTimes[indices[0]], end: s.fixTimes[indices[indices.length - 1]] } }),
      fixTimes: s.fixTimes,
      jump: s.jump,
      ...(s.reckoning && { reckoning: s.reckoning }),
    };
  }

  /** The leg changed, with This leg chosen on a solution of more than one leg: the one current time is in. */
  private legOf(s: Selected): { indices: number[]; leg: number; legs: number } | undefined {
    if (this.extent !== "leg" || !s.tma?.legStarts.length) return undefined;
    const found = legIndices(s.times, s.tma.legStarts, this.host.time()?.current);
    return found.legs > 1 ? found : undefined;
  }

  /** Whether the pivot is the first fix of what changes, whatever the analyst chose: on a DR track, a window that starts after the first fix turns about its own first fix, which dead reckoning places from the fix before. */
  private pivotFixed(indices: number[]): boolean {
    return !!this.selected?.reckoning && indices[0] > 0;
  }

  /** Put the handles where they now are, and say how to use them. */
  private render(announce: boolean): void {
    const s = this.selected;
    const box = this.control?.box;
    if (!s || this.host.drawing()) {
      if (box) box.hidden = true;
      this.clearHandles();
      this.placeFixHandles(undefined);
      return;
    }
    if (this.control && box) {
      box.hidden = false;
      const legs = !!s.tma?.legStarts.length;
      const extent = this.extent === "leg" && !legs ? "whole" : this.extent;
      this.control.whole.setAttribute("aria-pressed", String(extent === "whole"));
      this.control.window.setAttribute("aria-pressed", String(extent === "window"));
      this.control.leg.setAttribute("aria-pressed", String(extent === "leg"));
      this.control.leg.hidden = !legs;
      this.control.shear.setAttribute("aria-pressed", String(this.mode === "shear"));
      this.control.stretch.setAttribute("aria-pressed", String(this.mode === "stretch"));
    }
    const t = this.target();
    if (!t) {
      this.clearHandles();
      this.placeFixHandles(s);
      if (!announce && this.host.noting() === "other") return;
      this.host.say(`${s.name} has no fixes in the time window: choose Whole track to move or rotate all of it.`, undefined, "selection");
      return;
    }
    const pivotIndex = this.chosenPivot && !this.pivotFixed(t.indices) ? undefined : s.positions.indexOf(t.pivot);
    const places = handlePlaces(s.positions, t.indices, t.pivot, pivotIndex);
    const ends = endPlaces(s.positions, s.times, t.indices);
    this.placeHandles({ move: places.move, rotate: places.rotate, pivot: t.pivot, ...ends });
    // After the track's own handles, so Tab reaches them first.
    this.placeFixHandles(s);
    if (announce || (!this.drag && this.host.noting() !== "other")) {
      const verb = this.mode === "stretch" ? "stretch" : "shear";
      const toEnds = ends.start ? `, or an end to ${verb} it` : "";
      const fixes = this.fixHandles.size ? " Drag a fix's ring to move that fix alone." : this.fixesTooClose ? " Zoom in to move a single fix." : "";
      this.host.say(`${this.what(s.name)}: drag the move or rotate handle${toEnds}; or Tab to one and use the arrow keys.${fixes}`, undefined, "selection");
    }
  }

  private what(name: string): string {
    const leg = this.selected ? this.legOf(this.selected) : undefined;
    if (leg) return `${name}, leg ${leg.leg} of ${leg.legs}`;
    return this.extent === "window" ? `${name}, fixes in the time window` : name;
  }

  /**
   * A small ring on each fix in view, when they are few enough and far enough apart on the
   * screen to grab one; beneath the track's other handles, which keep the pointer where they
   * share a fix (the pivot can be dragged off one; any fix can be reached with Tab).
   */
  private placeFixHandles(s: Selected | undefined): void {
    const map = this.host.map;
    let wanted: number[] = [];
    this.fixesTooClose = false;
    if (s) {
      const size = map.getSize();
      const points = s.positions.map((p) => {
        const point = map.latLngToContainerPoint(toLatLng(p));
        return [point.x, point.y] as [number, number];
      });
      const shown = fixHandleIndices(points, [size.x, size.y]);
      wanted = shown.indices;
      this.fixesTooClose = !!shown.zoomIn;
    }
    // Of fixes sharing a time, the first: a fix is found by its time.
    const byTime = new Map<string, number>();
    for (const i of wanted) if (!byTime.has(s!.fixTimes[i]) && s!.fixTimes.indexOf(s!.fixTimes[i]) === i) byTime.set(s!.fixTimes[i], i);
    const same = byTime.size === this.fixHandles.size && [...byTime.keys()].every((t) => this.fixHandles.has(t));
    if (!same) {
      const focused = [...this.fixHandles].find(([, m]) => m.getElement() === document.activeElement)?.[0];
      this.rebuilding = true;
      this.fixLayer.clearLayers();
      this.fixHandles.clear();
      for (const [time, i] of byTime) this.fixHandles.set(time, this.makeHandle("fix", s!.positions[i], time).addTo(this.fixLayer));
      // Focus kept on the handle rebuilt, while still rebuilding: that is not a move to it, so the map does not pan.
      if (focused) (this.fixHandles.get(focused)?.getElement() ?? this.host.element).focus({ preventScroll: true });
      this.rebuilding = false;
    }
    for (const [time, i] of byTime) {
      const marker = this.fixHandles.get(time)!;
      marker.setLatLng(toLatLng(s!.positions[i]));
      const element = marker.getElement();
      if (element) {
        element.setAttribute("aria-label", this.label("fix", s!.name, s!.times[i]));
        element.title = this.label("fix", s!.name, s!.times[i]);
      }
    }
  }

  private clearHandles(): void {
    const hadFocus = [...this.handles.values()].some((m) => m.getElement() === document.activeElement);
    this.handleLayer.clearLayers();
    this.handles.clear();
    this.arm = undefined;
    if (hadFocus) this.host.element.focus({ preventScroll: true });
  }

  private placeHandles(places: Partial<Record<TrackRole, LonLat>>): void {
    const s = this.selected!;
    const wanted = (["pivot", "move", "rotate", "start", "end"] as TrackRole[]).filter((role) => places[role]);
    const same = wanted.length === this.handles.size && wanted.every((role) => this.handles.has(role));
    if (!same) {
      const focused = [...this.handles].find(([, m]) => m.getElement() === document.activeElement)?.[0];
      this.rebuilding = true;
      this.handleLayer.clearLayers();
      this.handles.clear();
      this.arm = undefined;
      for (const role of wanted) this.handles.set(role, this.makeHandle(role, places[role]!).addTo(this.handleLayer));
      // Focus kept on the handle rebuilt, while still rebuilding: that is not a move to it, so the map does not pan.
      if (focused) (this.handles.get(focused)?.getElement() ?? this.host.element).focus({ preventScroll: true });
      this.rebuilding = false;
    }
    for (const role of wanted) {
      const marker = this.handles.get(role)!;
      marker.setLatLng(toLatLng(places[role]!));
      const element = marker.getElement();
      if (element) {
        element.setAttribute("aria-label", this.label(role, s.name));
        element.title = this.label(role, s.name);
        if (isEnd(role)) {
          element.classList.toggle("track-handle-stretch", this.mode === "stretch");
          this.offsetEnd(element, role, places[role]!);
        }
      }
    }
    if (places.pivot && places.rotate) {
      const line = densify([places.pivot, places.rotate]).map(toLatLng);
      if (this.arm) this.arm.setLatLngs(line);
      else this.arm = L.polyline(line, { className: "track-arm", interactive: false, weight: 1, dashArray: "3 4" }).addTo(this.handleLayer);
    } else if (this.arm) {
      this.handleLayer.removeLayer(this.arm);
      this.arm = undefined;
    }
  }

  /**
   * Draw an end's handle beside its fix, to the left of the way the track goes there, so it is
   * clear of the pivot (which may be on the fix), the move handle and the rotate handle (which
   * lies beyond the far end, on the line of a straight leg). The handle's position is still the fix.
   */
  private offsetEnd(element: HTMLElement, role: TrackRole, at: LonLat): void {
    const t = this.target();
    let [ux, uy] = [1, 0]; // the way the track goes at this end, on the screen
    if (t && t.indices.length > 1) {
      const zoom = this.host.map.getZoom();
      const other = this.host.map.project(toLatLng(t.positions[role === "start" ? t.indices[1] : t.indices[t.indices.length - 2]]), zoom);
      const here = this.host.map.project(toLatLng(at), zoom);
      const [dx, dy] = role === "start" ? [other.x - here.x, other.y - here.y] : [here.x - other.x, here.y - other.y];
      const length = Math.hypot(dx, dy);
      if (length > 0) [ux, uy] = [dx / length, dy / length];
    }
    // Left of the way it goes (the screen's y is down).
    element.style.marginLeft = `${-END_SIZE / 2 + uy * END_OFFSET_PX}px`;
    element.style.marginTop = `${-END_SIZE / 2 - ux * END_OFFSET_PX}px`;
  }

  private label(role: TrackRole, name: string, time?: number): string {
    if (role === "fix") return `${name}: fix at ${formatTime(time ?? 0, settings)}; drag it, or use the arrow keys, to move this fix alone`;
    if (isEnd(role)) {
      const other = role === "start" ? "end" : "start";
      if (this.mode === "stretch") return `${this.what(name)}: stretch from the ${role}, holding the ${other}; drag it along the track, or use Up and Down to change speed`;
      return `${this.what(name)}: shear from the ${role}, holding the ${other}; drag it, or use the arrow keys`;
    }
    if (role === "move") return `${this.what(name)}: move; drag it, or use the arrow keys`;
    if (role === "rotate") return `${this.what(name)}: rotate about the pivot; drag it round, or use the arrow keys (Right turns clockwise)`;
    return `${name}: pivot for rotating; drag it, or use the arrow keys, to choose where it turns about`;
  }

  private makeHandle(role: TrackRole, at: LonLat, fixTime?: string): L.Marker {
    const size = role === "pivot" ? 12 : role === "fix" ? FIX_SIZE : isEnd(role) ? END_SIZE : 16;
    // A fix's ring is a hold target too (presshold.ts in map.ts), as a fix on the track is.
    const icon = L.divIcon({ className: `track-handle track-handle-${role}${role === "fix" ? " fix-hold" : ""}`, iconSize: [size, size] });
    const marker = L.marker(toLatLng(at), { icon, keyboard: false, interactive: true, bubblingMouseEvents: false, zIndexOffset: role === "fix" ? 500 : 1000 });
    marker.on("add", () => {
      const element = marker.getElement()!;
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      element.dataset.role = role;
      if (fixTime !== undefined) element.dataset.time = fixTime;
      L.DomEvent.disableClickPropagation(element);
      element.addEventListener("pointerdown", (event) => {
        this.pressedAt = Date.now();
        this.beginDrag(event, role, element, fixTime);
      });
      element.addEventListener("pointermove", (event) => this.moveDrag(event));
      element.addEventListener("pointerup", (event) => this.endDrag(event));
      element.addEventListener("pointercancel", () => this.cancelDrag());
      element.addEventListener("keydown", (event) => this.handleKey(event, role, fixTime));
      if (role === "fix") element.addEventListener("contextmenu", (event) => this.chooseFix(event, fixTime!));
      element.addEventListener("blur", () => {
        if (!this.rebuilding && this.nudge) this.commitNudge();
      });
      // A handle reached with Tab near or off the map's edge: pan the map to show it. Not when the
      // pointer put it there: a handle grabbed near the edge stays under the pointer.
      element.addEventListener("focus", () => {
        if (!this.rebuilding && !this.drag && !this.nudge && Date.now() - this.pressedAt > 500) this.host.map.panInside(marker.getLatLng(), { padding: [40, 40] });
      });
    });
    return marker;
  }

  private handleAt(role: TrackRole, fixTime?: string): LonLat | undefined {
    const marker = role === "fix" ? (fixTime !== undefined ? this.fixHandles.get(fixTime) : undefined) : this.handles.get(role);
    return marker ? lonLat(marker.getLatLng()) : undefined;
  }

  /** A right-click on a fix's ring, or a press and hold on it: the fix's menu (colour, label, comment, move), as on the track. Not in the middle of a drag. */
  private chooseFix(event: MouseEvent, fixTime: string): void {
    event.preventDefault();
    event.stopPropagation();
    const s = this.selected;
    if (!s || this.host.drawing() || this.drag?.moved) return;
    if (this.drag) this.cancelDrag();
    this.host.post({ kind: "fix_chosen", feature_id: s.id, fix_time: fixTime });
  }

  // --- Showing the change ----------------------------------------------------------------------
  /** Draw the track changed, over a dashed copy of it as it was, and say by how much; or, for the pivot, put it there. */
  private show(g: Gesture): void {
    const s = this.selected;
    if (!s) return;
    if (g.role === "pivot") {
      const indices = this.target()?.indices;
      if (indices && this.pivotFixed(indices)) {
        this.render(false);
        this.host.say(`${s.name} (DR): the time window turns about its first fix, which dead reckoning places from the fix before; choose Whole track to turn about somewhere else.`);
        return;
      }
      this.chosenPivot = g.at;
      this.render(false);
      this.host.say(pivotReadout(s.name, g.at, settings));
      return;
    }
    const t = this.target();
    const change = t && gestureChange(g, t, settings);
    if (!t || !change) return;
    this.host.setShown(s.id, false);
    this.preview.clearLayers();
    if (s.tma) {
      // The bearing view works the solution's residuals out again as it moves (NFR-04).
      this.previewing = true;
      this.host.post({ kind: "tma_preview", feature_id: s.id, preview: { type: "LineString", coordinates: change.positions } });
    }
    L.polyline(densify(s.positions).map(toLatLng), { color: s.colour, weight: 1.5, opacity: 0.6, dashArray: "4 4", interactive: false, className: "track-before" }).addTo(this.preview);
    L.polyline(densify(change.positions).map(toLatLng), { color: s.colour, weight: 3, interactive: false, className: "track-moved" }).addTo(this.preview);
    // The fixes that move, marked while there are few enough to tell apart; a long track is its line. Plotted by dead
    // reckoning, the fixes after follow: those that move are marked, and their rings go with them.
    const shifted = (p: LonLat, q: LonLat) => Math.abs(((p[0] - q[0] + 540) % 360) - 180) > 1e-7 || Math.abs(p[1] - q[1]) > 1e-7;
    const followed = t.reckoning ? change.positions.flatMap((p, i) => (shifted(p, s.positions[i]) ? [i] : [])) : [];
    // A fix dragged on a long DR track: those nearest it, which are those in view when zoomed in far enough to grab it.
    const moving = t.reckoning ? (g.role === "fix" ? followed.slice(0, MARKED_FIXES) : followed.length <= MARKED_FIXES ? followed : []) : g.role === "fix" ? [] : t.indices.length <= MARKED_FIXES ? t.indices : [];
    if (t.reckoning) {
      for (const [time, ring] of this.fixHandles) {
        const i = s.fixTimes.indexOf(time);
        if (i >= 0 && time !== g.fixTime) ring.setLatLng(toLatLng(change.positions[i]));
      }
    }
    for (const i of moving) {
      L.circleMarker(toLatLng(change.positions[i]), { radius: 2.5, color: s.colour, fillColor: s.colour, fillOpacity: 1, weight: 1, interactive: false, className: "track-moved-fix" }).addTo(this.preview);
    }
    // The handle in use goes with the track.
    const marker = g.role === "fix" ? this.fixHandles.get(g.fixTime ?? "") : this.handles.get(g.role);
    if (change.handle) marker?.setLatLng(toLatLng(change.handle));
    else if (g.role === "move") marker?.setLatLng(toLatLng(g.at));
    else {
      const to = turned([g.origin], [0], t.pivot, g.degrees)[0];
      marker?.setLatLng(toLatLng(to));
      this.arm?.setLatLngs(densify([t.pivot, to]).map(toLatLng));
    }
    this.host.say(change.readout);
  }

  /** The bearing view told a solution's drag ended: put back, or saved (its residuals then come from Python). */
  private endPreview(): void {
    if (!this.previewing || !this.selected) return;
    this.previewing = false;
    this.host.post({ kind: "tma_preview", feature_id: this.selected.id });
  }

  /** Back as it is in the plot. */
  private unshow(): void {
    this.endPreview();
    this.preview.clearLayers();
    if (this.selected) this.host.setShown(this.selected.id, true);
    this.render(false);
  }

  /** Send the change: one step, named by the service ("BLUE ONE moved 1.20 nmi 045.0°T"). */
  private commit(g: Gesture): void {
    const s = this.selected;
    const t = this.target();
    const change = s && t && gestureChange(g, t, settings);
    if (!s || !change) return;
    if (change.unchanged || changesNothing(change.edit)) {
      this.unshow();
      this.host.say("Not changed.");
      return;
    }
    this.run.saving = true;
    this.host.post({ kind: "edit_track", feature_id: s.id, track_edit: change.edit });
  }

  // --- Dragging ----------------------------------------------------------------------------------
  private beginDrag(event: PointerEvent, role: TrackRole, element: HTMLElement, fixTime?: string): void {
    const origin = this.handleAt(role, fixTime);
    if (event.button !== 0 || !this.selected || !origin || this.host.drawing()) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.run.saving) return this.host.say("Saving the last change: drag again once it is saved.");
    if (this.nudge) this.commitNudge();
    element.focus({ preventScroll: true }); // so Escape can put it back
    element.setPointerCapture?.(event.pointerId);
    const start = this.host.map.mouseEventToContainerPoint(event as unknown as MouseEvent);
    this.drag = { ...startGesture(role, origin, this.mode, fixTime), start, moved: false, pointer: event.pointerId, element };
  }

  private moveDrag(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const point = this.host.map.mouseEventToContainerPoint(event as unknown as MouseEvent);
    if (!drag.moved && point.distanceTo(drag.start) < DRAG_PX) return;
    drag.moved = true;
    const pivot = this.target()?.pivot ?? drag.origin;
    // An end goes as far as the pointer has, from wherever on the handle it was grabbed.
    const to = isEnd(drag.role)
      ? this.screen.toLonLat([this.screen.toPoint(drag.origin)[0] + point.x - drag.start.x, this.screen.toPoint(drag.origin)[1] + point.y - drag.start.y])
      : lonLat(this.host.map.containerPointToLatLng(point));
    Object.assign(drag, dragGesture(drag, to, pivot));
    // At most once a frame: a long track takes a moment to move.
    if (this.frame === undefined) {
      this.frame = requestAnimationFrame(() => {
        this.frame = undefined;
        if (this.drag) this.show(this.drag);
      });
    }
  }

  private endDrag(event?: PointerEvent): void {
    const drag = this.drag;
    if (!drag || (event && event.pointerId !== drag.pointer)) return;
    this.drag = undefined;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    if (!event) return;
    this.dragEnded = { at: this.host.map.mouseEventToContainerPoint(event as unknown as MouseEvent), time: Date.now() };
    drag.element.releasePointerCapture?.(drag.pointer);
    if (!drag.moved) return;
    if (drag.role === "pivot") return this.render(false);
    this.show(drag);
    this.commit(drag);
  }

  /** Escape, or the pointer lost: the track goes back to how it was before the drag. */
  private cancelDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.endDrag();
    if (drag.role === "pivot") this.chosenPivot = undefined;
    this.unshow();
    this.host.say("Not changed.");
  }

  private cancelGesture(): void {
    this.run.clear();
    if (this.drag) this.cancelDrag();
    if (this.nudge) {
      this.nudge = undefined;
      this.unshow();
    }
  }

  // --- The keyboard ------------------------------------------------------------------------------
  private handleKey(event: KeyboardEvent, role: TrackRole, fixTime?: string): void {
    if (!this.selected || this.host.drawing()) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      event.stopPropagation(); // not the map's own panning
      if (this.drag) return;
      if (this.run.saving && role !== "pivot") {
        // The last change is still being saved: this press is kept, and made as the next change once it is.
        this.run.press({ role, key: event.key, shift: event.shiftKey, fixTime });
        return this.host.say("Saving the last change; your next move follows once it is saved.");
      }
      this.key(role, event.key, event.shiftKey, fixTime);
    } else if (event.key === "Enter" && this.nudge) {
      event.preventDefault();
      this.commitNudge();
    } else if (event.key === "Escape" && (this.nudge || this.run.keeping)) {
      event.preventDefault();
      event.stopPropagation(); // keeps the selection
      this.cancelGesture();
      this.host.say("Not changed.");
    }
  }

  /** One arrow key on a handle: the move handle and the pivot move by pixels on the screen; the rotate handle turns by degrees. */
  private key(role: TrackRole, key: string, shift: boolean, fixTime?: string): void {
    const origin = this.handleAt(role, fixTime);
    if (!origin) return;
    if (this.nudge && (this.nudge.role !== role || this.nudge.fixTime !== fixTime)) this.commitNudge();
    const before = role === "pivot" ? startGesture(role, origin) : (this.nudge ?? startGesture(role, origin, this.mode, fixTime));
    const t = this.target();
    // A stretch's first press starts from the speed the period makes good, as shown.
    const speed = before.mode === "stretch" && t ? speedIn(legOf(t.positions, t.times, t.indices).speed, settings) : undefined;
    const g = pressKey(before, key, shift, this.screen, speed, settings);
    this.show(g);
    if (role === "pivot") return; // the pivot records nothing: each press puts it where it now is
    this.nudge = g;
    this.run.press({ role, key, shift, fixTime });
  }

  private commitNudge(): void {
    const nudge = this.nudge;
    if (!nudge) return;
    this.run.stop();
    this.nudge = undefined;
    this.commit(nudge);
  }
}
