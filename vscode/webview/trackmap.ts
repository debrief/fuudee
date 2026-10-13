/**
 * Moving and rotating a track on the map (CAP-01, CAP-02, NFR-13): handles on
 * a track selected alone, the live preview while one is dragged, and the
 * keyboard. What each gesture makes is in trackedit.ts, free of Leaflet.
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
 * - From the keyboard: Tab to a handle. The arrow keys move the move handle 5
 *   pixels (25 with Shift) and turn the rotate handle 1° (10° with Shift),
 *   Right and Up clockwise; the change is sent when the analyst stops (or
 *   presses Enter, or moves on), so one run of presses is one step. Presses
 *   made while that step is being saved are kept and made as the next one.
 * - Nothing here changes current time, the window or the selection. If the
 *   plot changes elsewhere during a drag, the drag is dropped and the map says so.
 */
import L from "leaflet";
import { DEFAULT_SETTINGS } from "@debrief/kernel";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import { densify, type LonLat } from "./geodesic.js";
import {
  changesNothing,
  defaultPivotIndex,
  dragGesture,
  gestureChange,
  handlePlaces,
  KeyRun,
  periodIndices,
  pivotReadout,
  pressKey,
  startGesture,
  turned,
  type Gesture,
  type Screen,
  type Span,
  type Target,
  type TrackRole,
} from "./trackedit.js";

type Feature = DebriefFeatureCollection["features"][number];
type Track = Extract<Feature, { properties: { kind: "track" } }>;
const DRAG_PX = 4;
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
  colour: string;
}

/** What moves: the whole track, or only its fixes in the time window. */
export type Extent = "whole" | "window";

export class TrackEditor {
  private selection: string[] = [];
  private selected?: Selected;
  private extent: Extent = "whole";
  /** A pivot the analyst chose, by dragging it; otherwise the default. */
  private chosenPivot?: LonLat;
  private readonly preview = L.layerGroup();
  private readonly handleLayer = L.layerGroup();
  private handles = new Map<TrackRole, L.Marker>();
  private arm?: L.Polyline;
  private drag?: Gesture & { start: L.Point; moved: boolean; pointer: number; element: HTMLElement };
  private dragEnded?: { at: L.Point; time: number };
  /** A run of arrow keys on the move or rotate handle, not yet sent. */
  private nudge?: Gesture;
  private readonly run = new KeyRun<{ role: TrackRole; key: string; shift: boolean }>(() => this.commitNudge());
  private frame?: number;
  private rebuilding = false;
  private control?: { box: HTMLElement; whole: HTMLButtonElement; window: HTMLButtonElement };
  private readonly screen: Screen;

  constructor(private readonly host: TrackHost) {
    this.preview.addTo(host.map);
    this.handleLayer.addTo(host.map);
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

  // --- The control: the whole track, or its fixes in the window ---------------------------
  private addControl(): void {
    const editor = this;
    const Control = L.Control.extend({
      onAdd() {
        const box = L.DomUtil.create("div", "leaflet-bar track-extent");
        box.setAttribute("role", "group");
        box.setAttribute("aria-label", "What moving or rotating the selected track changes");
        L.DomUtil.create("span", "track-extent-label", box).textContent = "Move or rotate";
        const button = (extent: Extent, text: string, title: string) => {
          const b = L.DomUtil.create("button", "track-extent-button", box) as HTMLButtonElement;
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
        const whole = button("whole", "Whole track", "Move or rotate every fix of the track");
        const inWindow = button("window", "Time window", "Move or rotate only the fixes in the time window; the track jumps where they meet the rest");
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        box.hidden = true;
        editor.control = { box, whole, window: inWindow };
        return box;
      },
    });
    new Control({ position: "topleft" }).addTo(this.host.map);
  }

  /** Move or rotate the whole track, or only its fixes in the time window. */
  setExtent(extent: Extent): void {
    if (this.drag || this.nudge || this.run.saving) return;
    this.extent = extent;
    this.render(true);
  }

  // --- The plot and the selection -------------------------------------------------------------
  /** The selection changed: handles on a track selected alone. */
  setSelection(ids: string[]): void {
    const before = this.selected?.id;
    this.selection = ids;
    const id = ids.length === 1 ? ids[0] : undefined;
    const shown = id ? this.host.track(id) : undefined;
    if (before && before !== id) this.cancelGesture();
    if (id !== before) this.chosenPivot = undefined;
    this.selected = shown && id ? { id, name: shown.feature.properties.name, positions: shown.feature.geometry.coordinates as LonLat[], times: shown.times, colour: shown.colour } : undefined;
    this.render(before !== id);
  }

  /** The map drew the plot again: a change sent has come back, or the plot changed elsewhere. */
  plotDrawn(ids: string[]): void {
    const interrupted = (this.drag || this.nudge) && !this.run.saving;
    const kept = this.run.saved();
    if (this.drag) this.endDrag();
    this.run.stop();
    this.nudge = undefined;
    this.preview.clearLayers();
    this.setSelection(ids);
    if (interrupted) this.host.say("The plot was changed elsewhere, so your change was not made. Debrief is showing the latest; try again if you still want to.");
    // Presses made while the last change was saved: now made, from where the track is now.
    else if (this.selected) for (const k of kept) this.key(k.role, k.key, k.shift);
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
    const indices = periodIndices(s.times, inWindow ? time.window : undefined);
    if (!indices.length) return undefined;
    const index = this.chosenPivot ? undefined : defaultPivotIndex(s.times, indices, time?.current);
    return {
      name: s.name,
      positions: s.positions,
      indices,
      part: indices.length < s.times.length,
      pivot: this.chosenPivot ?? s.positions[index!],
      ...(inWindow && { period: time.range }),
    };
  }

  /** Put the handles where they now are, and say how to use them. */
  private render(announce: boolean): void {
    const s = this.selected;
    const box = this.control?.box;
    if (!s || this.host.drawing()) {
      if (box) box.hidden = true;
      this.clearHandles();
      return;
    }
    if (this.control && box) {
      box.hidden = false;
      this.control.whole.setAttribute("aria-pressed", String(this.extent === "whole"));
      this.control.window.setAttribute("aria-pressed", String(this.extent === "window"));
    }
    const t = this.target();
    if (!t) {
      this.clearHandles();
      if (!announce && this.host.noting() === "other") return;
      this.host.say(`${s.name} has no fixes in the time window: choose Whole track to move or rotate all of it.`, undefined, "selection");
      return;
    }
    const pivotIndex = this.chosenPivot ? undefined : s.positions.indexOf(t.pivot);
    const places = handlePlaces(s.positions, t.indices, t.pivot, pivotIndex);
    this.placeHandles({ move: places.move, rotate: places.rotate, pivot: t.pivot });
    if (announce || (!this.drag && this.host.noting() !== "other")) {
      this.host.say(`${this.what(s.name)}: drag the move or rotate handle, or Tab to one and use the arrow keys.`, undefined, "selection");
    }
  }

  private what(name: string): string {
    return this.extent === "window" ? `${name}, fixes in the time window` : name;
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
    const wanted = (["pivot", "move", "rotate"] as TrackRole[]).filter((role) => places[role]);
    const same = wanted.length === this.handles.size && wanted.every((role) => this.handles.has(role));
    if (!same) {
      const focused = [...this.handles].find(([, m]) => m.getElement() === document.activeElement)?.[0];
      this.rebuilding = true;
      this.handleLayer.clearLayers();
      this.handles.clear();
      this.arm = undefined;
      for (const role of wanted) this.handles.set(role, this.makeHandle(role, places[role]!).addTo(this.handleLayer));
      this.rebuilding = false;
      if (focused) (this.handles.get(focused)?.getElement() ?? this.host.element).focus({ preventScroll: true });
    }
    for (const role of wanted) {
      const marker = this.handles.get(role)!;
      marker.setLatLng(toLatLng(places[role]!));
      const element = marker.getElement();
      if (element) {
        element.setAttribute("aria-label", this.label(role, s.name));
        element.title = this.label(role, s.name);
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

  private label(role: TrackRole, name: string): string {
    if (role === "move") return `${this.what(name)}: move; drag it, or use the arrow keys`;
    if (role === "rotate") return `${this.what(name)}: rotate about the pivot; drag it round, or use the arrow keys (Right turns clockwise)`;
    return `${name}: pivot for rotating; drag it, or use the arrow keys, to choose where it turns about`;
  }

  private makeHandle(role: TrackRole, at: LonLat): L.Marker {
    const size = role === "pivot" ? 12 : 16;
    const icon = L.divIcon({ className: `track-handle track-handle-${role}`, iconSize: [size, size] });
    const marker = L.marker(toLatLng(at), { icon, keyboard: false, interactive: true, bubblingMouseEvents: false, zIndexOffset: 1000 });
    marker.on("add", () => {
      const element = marker.getElement()!;
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      element.dataset.role = role;
      L.DomEvent.disableClickPropagation(element);
      element.addEventListener("pointerdown", (event) => this.beginDrag(event, role, element));
      element.addEventListener("pointermove", (event) => this.moveDrag(event));
      element.addEventListener("pointerup", (event) => this.endDrag(event));
      element.addEventListener("pointercancel", () => this.cancelDrag());
      element.addEventListener("keydown", (event) => this.handleKey(event, role));
      element.addEventListener("blur", () => {
        if (!this.rebuilding && this.nudge) this.commitNudge();
      });
    });
    return marker;
  }

  private handleAt(role: TrackRole): LonLat | undefined {
    const marker = this.handles.get(role);
    return marker ? lonLat(marker.getLatLng()) : undefined;
  }

  // --- Showing the change ----------------------------------------------------------------------
  /** Draw the track changed, over a dashed copy of it as it was, and say by how much; or, for the pivot, put it there. */
  private show(g: Gesture): void {
    const s = this.selected;
    if (!s) return;
    if (g.role === "pivot") {
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
    L.polyline(densify(s.positions).map(toLatLng), { color: s.colour, weight: 1.5, opacity: 0.6, dashArray: "4 4", interactive: false, className: "track-before" }).addTo(this.preview);
    L.polyline(densify(change.positions).map(toLatLng), { color: s.colour, weight: 3, interactive: false, className: "track-moved" }).addTo(this.preview);
    // The fixes that move, marked while there are few enough to tell apart; a long track is its line.
    for (const i of t.indices.length <= MARKED_FIXES ? t.indices : []) {
      L.circleMarker(toLatLng(change.positions[i]), { radius: 2.5, color: s.colour, fillColor: s.colour, fillOpacity: 1, weight: 1, interactive: false, className: "track-moved-fix" }).addTo(this.preview);
    }
    // The handle in use goes with the track.
    const marker = this.handles.get(g.role);
    if (g.role === "move") marker?.setLatLng(toLatLng(g.at));
    else {
      const to = turned([g.origin], [0], t.pivot, g.degrees)[0];
      marker?.setLatLng(toLatLng(to));
      this.arm?.setLatLngs(densify([t.pivot, to]).map(toLatLng));
    }
    this.host.say(change.readout);
  }

  /** Back as it is in the plot. */
  private unshow(): void {
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
    if (changesNothing(change.edit)) {
      this.unshow();
      this.host.say("Not changed.");
      return;
    }
    this.run.saving = true;
    this.host.post({ kind: "edit_track", feature_id: s.id, track_edit: change.edit });
  }

  // --- Dragging ----------------------------------------------------------------------------------
  private beginDrag(event: PointerEvent, role: TrackRole, element: HTMLElement): void {
    const origin = this.handleAt(role);
    if (event.button !== 0 || !this.selected || !origin || this.host.drawing()) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.run.saving) return this.host.say("Saving the last change: drag again once it is saved.");
    if (this.nudge) this.commitNudge();
    element.focus({ preventScroll: true }); // so Escape can put it back
    element.setPointerCapture?.(event.pointerId);
    const start = this.host.map.mouseEventToContainerPoint(event as unknown as MouseEvent);
    this.drag = { ...startGesture(role, origin), start, moved: false, pointer: event.pointerId, element };
  }

  private moveDrag(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const point = this.host.map.mouseEventToContainerPoint(event as unknown as MouseEvent);
    if (!drag.moved && point.distanceTo(drag.start) < DRAG_PX) return;
    drag.moved = true;
    const pivot = this.target()?.pivot ?? drag.origin;
    Object.assign(drag, dragGesture(drag, lonLat(this.host.map.containerPointToLatLng(point)), pivot));
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
  private handleKey(event: KeyboardEvent, role: TrackRole): void {
    if (!this.selected || this.host.drawing()) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      event.stopPropagation(); // not the map's own panning
      if (this.drag) return;
      if (this.run.saving && role !== "pivot") {
        // The last change is still being saved: this press is kept, and made as the next change once it is.
        this.run.press({ role, key: event.key, shift: event.shiftKey });
        return this.host.say("Saving the last change; your next move follows once it is saved.");
      }
      this.key(role, event.key, event.shiftKey);
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
  private key(role: TrackRole, key: string, shift: boolean): void {
    const origin = this.handleAt(role);
    if (!origin) return;
    if (this.nudge && this.nudge.role !== role) this.commitNudge();
    const before = role === "pivot" ? startGesture(role, origin) : (this.nudge ?? startGesture(role, origin));
    const g = pressKey(before, key, shift, this.screen);
    this.show(g);
    if (role === "pivot") return; // the pivot records nothing: each press puts it where it now is
    this.nudge = g;
    this.run.press({ role, key, shift });
  }

  private commitNudge(): void {
    const nudge = this.nudge;
    if (!nudge) return;
    this.run.stop();
    this.nudge = undefined;
    this.commit(nudge);
  }
}
