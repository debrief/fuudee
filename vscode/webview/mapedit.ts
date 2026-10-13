/**
 * Drawing and editing annotations on the map (CAP-03, NFR-13): the drawing
 * toolbar, the sketch while the analyst places points, and the handles on a
 * selected annotation. What each action makes is in drawing.ts, free of Leaflet.
 *
 * - Choosing a kind on the toolbar (or Enter on it) starts drawing: the
 *   pointer is a cross and the map says what to do and what has been drawn
 *   (range and bearing in the analyst's units, an area's size). Points are
 *   placed by clicking, or from the keyboard with Space at the cross in the
 *   middle of the map, which the arrow keys pan. Backspace removes the last
 *   point, Escape cancels. Ctrl or Cmd click still selects.
 * - Finishing sends the description to the host (annotation_drawn), which
 *   opens the annotation form with it: name it, and Add saves it as one step.
 *   It stays on the map, dashed, until the form is saved or closed.
 * - A single selected annotation shows handles: vertices and midpoints of a
 *   line or an area, and one to move it all; a circle's centre and radius; an
 *   ellipse's centre, the end of its longer axis and its side; a label's or
 *   marker's position. Dragging one changes it live; letting go sends the
 *   change (edit_annotation), one step. Escape during a drag puts it back.
 *   A focused handle moves with the arrow keys; the change is sent when the
 *   analyst stops (or presses Enter, or moves on), so one run of presses is
 *   one step. Delete or Backspace removes a focused vertex.
 * - Nothing here changes current time, the window or the selection. If the
 *   plot changes elsewhere during a drag, the drag is dropped and the map says so.
 *
 * Interface colours from the theme (map.css); the annotation's own look from annotationlook.ts.
 */
import L from "leaflet";
import { convert, DEFAULT_SETTINGS } from "@debrief/kernel";
import type { AnnotationSpec } from "@debrief/schemas";
import { lookOf } from "./annotationlook.js";
import { circleRing, densify, ellipseRing, type LonLat } from "./geodesic.js";
import {
  dragTo,
  dropRepeats,
  editReadout,
  finishProblem,
  handleAfter,
  handlesOf,
  hint,
  isComplete,
  placePoint,
  readout,
  removeLast,
  removeVertex,
  sameGeometry,
  specOfDrawing,
  startDrawing,
  titleOf,
  TOOLS,
  type Drawing,
  type Handle,
  type Tool,
} from "./drawing.js";
import { DATA_COLOURS } from "./palette.js";

const settings = DEFAULT_SETTINGS;
const toLatLng = ([lon, lat]: LonLat) => L.latLng(lat, lon);
const lonLat = (p: L.LatLng): LonLat => [p.lng, p.lat];
/** Pixels an arrow key moves a handle; with Shift, five times as far. */
export const NUDGE_PX = 5;
/** How long after the last arrow key a run of nudges is sent as one change. */
export const NUDGE_SETTLE_MS = 800;
/** A press that moves less than this is a click, not a drag. */
const DRAG_PX = 4;
const SKETCH = { color: DATA_COLOURS.annotation, weight: 2, dashArray: "6 5", interactive: false };

export interface EditorHost {
  map: L.Map;
  /** The map's own element, which takes keyboard focus. */
  element: HTMLElement;
  post(message: Record<string, unknown>): void;
  /** The annotation with this id, as its form describes it, if it is drawn on the map now. */
  annotation(id: string): AnnotationSpec | undefined;
  /** Draw or stop drawing a feature's own layers, while its changed form is shown instead. */
  setShown(id: string, shown: boolean): void;
}

interface Drag {
  handle: Handle;
  original: AnnotationSpec;
  start: L.Point;
  moved: boolean;
  spec: AnnotationSpec;
  element: HTMLElement;
  pointer: number;
}

export class MapEditor {
  private drawing?: Drawing;
  private cursor?: LonLat;
  /** A press on the map while drawing a circle or an ellipse: dragging from the centre sizes it. */
  private press?: L.Point;
  /** Where and when a press that placed a point ended: the click it makes there places nothing more. */
  private pressEnded?: { at: L.Point; time: number };
  private readonly sketch = L.layerGroup();
  private readonly preview = L.layerGroup();
  private readonly handleLayer = L.layerGroup();
  private handles: { handle: Handle; marker: L.Marker }[] = [];
  private buttons = new Map<Tool | "cancel", HTMLButtonElement>();
  private readonly statusBox: HTMLElement;
  private readonly statusHint: HTMLElement;
  private readonly statusReadout: HTMLElement;
  private selection: string[] = [];
  /** The selected annotation, while it alone is selected and drawn. */
  private selected?: { id: string; spec: AnnotationSpec };
  /** Its changed form, shown instead of it, from the first move until the plot comes back. */
  private changed?: AnnotationSpec;
  private drag?: Drag;
  /** When the last drag ended: the click that ends a drag is not a click on the map. */
  private dragEnded?: { at: L.Point; time: number };
  private nudge?: { role: Handle["role"]; index: number; original: AnnotationSpec; spec: AnnotationSpec; timer?: ReturnType<typeof setTimeout> };
  /** A change sent, waiting for the plot to come back with it. */
  private awaiting = false;
  /** A finished drawing, waiting for the form. */
  private pending?: AnnotationSpec;
  private rebuilding = false;
  /** What the map is saying: how to change the selected annotation, or something else, which that does not replace. */
  private saying?: "selection" | "other";

  constructor(private readonly host: EditorHost) {
    const { map } = host;
    this.sketch.addTo(map);
    this.preview.addTo(map);
    this.handleLayer.addTo(map);
    const root = host.element.parentElement!;
    this.statusBox = document.createElement("div");
    this.statusBox.className = "drawing-status";
    this.statusBox.hidden = true;
    this.statusHint = document.createElement("div");
    this.statusHint.setAttribute("role", "status");
    this.statusReadout = document.createElement("div");
    this.statusReadout.className = "drawing-readout";
    const keys = document.createElement("div");
    keys.className = "drawing-keys";
    keys.textContent = "Keys: arrows pan the map, Space places a point at the cross, Enter finishes.";
    this.statusBox.append(this.statusHint, this.statusReadout, keys);
    const cross = document.createElement("div");
    cross.className = "centre-cross";
    cross.setAttribute("aria-hidden", "true");
    root.append(this.statusBox, cross);
    this.addToolbar();

    map.on("click", (event: L.LeafletMouseEvent) => {
      if (this.drawing) this.takeClick(event);
    });
    map.on("dblclick", (event: L.LeafletMouseEvent) => {
      if (this.drawing) this.takeDoubleClick(event);
    });
    map.on("mousemove", (event: L.LeafletMouseEvent) => {
      if (!this.drawing) return;
      this.cursor = lonLat(event.latlng);
      this.renderSketch();
    });
    map.on("mousedown", (event: L.LeafletMouseEvent) => {
      const d = this.drawing;
      const original = event.originalEvent;
      if (!d || original.button !== 0 || original.ctrlKey || original.metaKey) return;
      if ((d.tool === "circle" || d.tool === "ellipse") && d.points.length === 0) {
        this.press = event.containerPoint;
        this.place(lonLat(event.latlng));
      }
    });
    map.on("mouseup", (event: L.LeafletMouseEvent) => {
      if (!this.press) return;
      const dragged = event.containerPoint.distanceTo(this.press) > DRAG_PX;
      this.press = undefined;
      this.pressEnded = { at: event.containerPoint, time: Date.now() }; // the centre is placed; its click places nothing
      if (dragged) this.place(lonLat(event.latlng));
      this.dragMode();
    });
    window.addEventListener("keydown", (event) => this.key(event), true);
    host.element.addEventListener("focus", () => root.classList.add("map-focused"));
    host.element.addEventListener("blur", () => root.classList.remove("map-focused"));
  }

  /** Whether the analyst is drawing: clicks on the map then place points. */
  get active(): boolean {
    return !!this.drawing;
  }

  // --- The toolbar -------------------------------------------------------------------
  private addToolbar(): void {
    const editor = this;
    const Toolbar = L.Control.extend({
      onAdd() {
        const bar = L.DomUtil.create("div", "leaflet-bar draw-toolbar");
        bar.setAttribute("role", "toolbar");
        bar.setAttribute("aria-label", "Draw an annotation");
        bar.setAttribute("aria-orientation", "vertical");
        const button = (key: Tool | "cancel", label: string, title: string, action: () => void) => {
          const b = L.DomUtil.create("button", "draw-button", bar) as HTMLButtonElement;
          b.type = "button";
          b.textContent = label;
          b.title = title;
          b.dataset.tool = key;
          if (key !== "cancel") b.setAttribute("aria-pressed", "false");
          b.addEventListener("click", (e) => {
            e.preventDefault();
            action();
          });
          editor.buttons.set(key, b);
        };
        for (const { tool, label, title } of TOOLS) button(tool, label, title, () => (editor.drawing?.tool === tool ? editor.cancel() : editor.start(tool)));
        button("cancel", "Cancel", "Stop, and keep nothing of what was placed (Escape)", () => editor.cancel());
        // Up and down move along the toolbar, as a toolbar's arrow keys do; Tab moves on as ever.
        bar.addEventListener("keydown", (e) => {
          const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          e.stopPropagation(); // not the map's panning
          const buttons = [...editor.buttons.values()].filter((b) => !b.disabled);
          const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[(at + step + buttons.length) % buttons.length]?.focus();
        });
        L.DomEvent.disableClickPropagation(bar);
        L.DomEvent.disableScrollPropagation(bar);
        editor.showButtons();
        return bar;
      },
    });
    new Toolbar({ position: "topleft" }).addTo(this.host.map);
  }

  private showButtons(): void {
    for (const [key, b] of this.buttons) {
      if (key === "cancel") b.disabled = !this.drawing;
      else b.setAttribute("aria-pressed", String(this.drawing?.tool === key));
    }
  }

  // --- Drawing --------------------------------------------------------------------------
  /** Start drawing an annotation of this kind. */
  start(tool: Tool): void {
    this.cancelEdit();
    this.clearPending();
    this.drawing = startDrawing(tool);
    this.cursor = undefined;
    this.host.map.doubleClickZoom.disable();
    this.host.element.classList.add("drawing-mode");
    this.dragMode();
    this.showHandles();
    this.showButtons();
    this.say(hint(this.drawing), "");
    // The keyboard goes to the map, where Space places a point at the cross.
    this.host.element.focus();
  }

  /** Stop drawing and keep nothing. */
  cancel(): void {
    if (!this.drawing) return;
    this.endDrawing();
    this.say("");
  }

  private endDrawing(): void {
    this.drawing = undefined;
    this.press = undefined;
    this.sketch.clearLayers();
    this.host.map.doubleClickZoom.enable();
    this.host.element.classList.remove("drawing-mode");
    this.dragMode();
    this.showButtons();
    this.showHandles();
  }

  /** Before a circle's or an ellipse's centre is placed, a drag on the map draws it rather than panning. */
  private dragMode(): void {
    const d = this.drawing;
    const sizing = !!d && (d.tool === "circle" || d.tool === "ellipse") && d.points.length === 0;
    if (sizing || this.press) this.host.map.dragging.disable();
    else this.host.map.dragging.enable();
  }

  /** A click on the map or on a feature while drawing places a point; Ctrl or Cmd click selects as ever. */
  takeClick(event: L.LeafletMouseEvent): boolean {
    if (this.endingDrag(event)) return true;
    if (!this.drawing) return false;
    const original = event.originalEvent;
    if (original.ctrlKey || original.metaKey) return false;
    const ended = this.pressEnded;
    this.pressEnded = undefined;
    if (ended && Date.now() - ended.time < 500 && event.containerPoint.distanceTo(ended.at) < 1) {
      return true;
    }
    this.place(lonLat(event.latlng));
    return true;
  }

  /** Whether a click is the end of a handle's drag, which selects nothing. */
  endingDrag(event: L.LeafletMouseEvent): boolean {
    const ended = this.dragEnded;
    if (this.drag) return true;
    if (!ended) return false;
    this.dragEnded = undefined;
    return Date.now() - ended.time < 500 && event.containerPoint.distanceTo(ended.at) < 2;
  }

  /** A double-click finishes a line or an area. */
  takeDoubleClick(event: L.LeafletMouseEvent): boolean {
    if (!this.drawing) return false;
    L.DomEvent.stop(event);
    this.finish();
    return true;
  }

  private place(point: LonLat): void {
    if (!this.drawing) return;
    this.drawing = placePoint(this.drawing, point);
    this.dragMode();
    if (isComplete(this.drawing)) return this.finish();
    this.say(hint(this.drawing), readout(this.drawing, this.cursor, settings));
    this.renderSketch();
  }

  private finish(): void {
    if (!this.drawing) return;
    const { map } = this.host;
    // A double-click places the same point twice: keep one.
    const same = (a: LonLat, b: LonLat) => map.latLngToContainerPoint(toLatLng(a)).distanceTo(map.latLngToContainerPoint(toLatLng(b))) < DRAG_PX;
    const drawing = dropRepeats(this.drawing, same);
    const problem = finishProblem(drawing, settings);
    if (problem) {
      this.drawing = isComplete(drawing) ? removeLast(drawing) : drawing;
      this.dragMode();
      this.renderSketch();
      const next = hint(this.drawing);
      return this.say(`${problem} ${next}`, readout(this.drawing, this.cursor, settings));
    }
    const spec = specOfDrawing(drawing, settings);
    const title = TOOLS.find((t) => t.tool === drawing.tool)!.label;
    this.endDrawing();
    this.pending = spec;
    this.renderShape(this.sketch, spec, SKETCH);
    this.host.post({ kind: "annotation_drawn", annotation: spec });
    this.say(`${title} drawn. Name it in the form beside the map: Add saves it as one step, Cancel discards it.`, readout({ tool: drawing.tool, points: drawing.points }, undefined, settings));
  }

  private clearPending(): void {
    if (!this.pending) return;
    this.pending = undefined;
    this.sketch.clearLayers();
  }

  /** The drawing so far, and where the next point would go. */
  private renderSketch(): void {
    const d = this.drawing;
    this.sketch.clearLayers();
    if (!d) return;
    const points = this.cursor && !isComplete(d) ? [...d.points, this.cursor] : d.points;
    for (const p of d.points) L.circleMarker(toLatLng(p), { radius: 3, color: DATA_COLOURS.annotation, fillColor: DATA_COLOURS.annotation, fillOpacity: 1, weight: 1, interactive: false }).addTo(this.sketch);
    if (d.tool === "line" && points.length > 1) L.polyline(densify(points).map(toLatLng), SKETCH).addTo(this.sketch);
    if (d.tool === "area" && points.length > 1) L.polygon(densify([...points, points[0]]).map(toLatLng), { ...SKETCH, fillColor: DATA_COLOURS.annotation, fillOpacity: 0.08 }).addTo(this.sketch);
    if ((d.tool === "circle" || d.tool === "ellipse") && points.length > 1) {
      if (d.tool === "ellipse" && points.length === 2) L.polyline(densify(points).map(toLatLng), SKETCH).addTo(this.sketch);
      else this.renderShape(this.sketch, { ...specOfDrawing({ tool: d.tool, points }, settings), name: "" }, SKETCH);
    }
    this.statusReadout.textContent = readout(d, this.cursor, settings);
  }

  /** Draw an annotation as described, in its own look or the sketch's. */
  private renderShape(layer: L.LayerGroup, spec: AnnotationSpec, style?: L.PathOptions): void {
    const look = lookOf(spec.shape, spec.appearance);
    const options: L.PathOptions = style ?? { color: look.colour, weight: look.weight, dashArray: look.dashArray, lineCap: look.lineCap, fillColor: look.fillColour, fillOpacity: look.fillOpacity, interactive: false };
    const points = (spec.positions ?? []) as LonLat[];
    if (!points.length) return;
    const metres = (q?: { value: number; unit: string } | null) => (q ? convert(q, "m").value : 0);
    if (spec.shape === "line") L.polyline(densify(points).map(toLatLng), options).addTo(layer);
    else if (spec.shape === "area") L.polygon(densify([...points, points[0]]).map(toLatLng), { fillColor: look.fillColour, fillOpacity: look.fillOpacity, ...options }).addTo(layer);
    else if (spec.shape === "circle" && spec.radius) L.polygon(circleRing(points[0], metres(spec.radius)).map(toLatLng), { fillOpacity: 0.05, fillColor: look.fillColour, ...options }).addTo(layer);
    else if (spec.shape === "ellipse" && spec.semi_major && spec.semi_minor) {
      const orientation = spec.orientation ? convert(spec.orientation, "deg").value : 0;
      L.polygon(ellipseRing(points[0], metres(spec.semi_major), metres(spec.semi_minor), orientation).map(toLatLng), { fillOpacity: 0.05, fillColor: look.fillColour, ...options }).addTo(layer);
    } else L.circleMarker(toLatLng(points[0]), { radius: 5, color: options.color, weight: 2, fillColor: options.color, fillOpacity: 0.25, interactive: false }).addTo(layer);
  }

  // --- The plot and the selection ---------------------------------------------------------
  /** The map drew the plot again: a change sent has come back, or the plot changed elsewhere. */
  plotDrawn(): void {
    const interrupted = (this.drag || this.nudge) && !this.awaiting;
    if (this.drag) this.endDrag();
    if (this.nudge?.timer) clearTimeout(this.nudge.timer);
    this.nudge = undefined;
    this.awaiting = false;
    this.changed = undefined;
    this.preview.clearLayers();
    this.clearPending();
    if (interrupted) this.say("The plot was changed elsewhere, so your change was not made. Debrief is showing the latest; try again if you still want to.");
    else if (!this.drawing) this.say("");
    this.setSelection(this.selection);
  }

  /** The selection changed: handles on an annotation selected alone. */
  setSelection(ids: string[]): void {
    this.selection = ids;
    const id = ids.length === 1 ? ids[0] : undefined;
    const spec = id ? this.host.annotation(id) : undefined;
    const before = this.selected?.id;
    if (this.selected && before !== id) this.cancelEdit();
    this.selected = id && spec && handlesOf(spec).length ? { id, spec } : undefined;
    this.showHandles();
    if (this.selected && !this.drawing && !this.pending && (before !== id || this.saying !== "other")) {
      this.say(`${titleOf(this.selected.spec)}: drag a handle to change it, or Tab to one and use the arrow keys. Each change is one step.`, undefined, "selection");
    } else if (!this.selected && this.saying === "selection") this.say("");
  }

  /** The time window moved: the selected annotation may have come into it or left it. */
  refresh(): void {
    if (!this.drag && !this.nudge && !this.awaiting) this.setSelection(this.selection);
  }

  private current(): AnnotationSpec | undefined {
    return this.changed ?? this.selected?.spec;
  }

  /** Put the handles where the annotation now is: moved in place if they are the same handles, else made again. */
  private showHandles(focus?: Pick<Handle, "role" | "index">): void {
    const spec = this.current();
    const wanted = spec && this.selected && !this.drawing ? handlesOf(spec) : [];
    const same = wanted.length === this.handles.length && wanted.every((h, i) => h.role === this.handles[i].handle.role && h.index === this.handles[i].handle.index);
    if (same) {
      wanted.forEach((h, i) => {
        const shown = this.handles[i];
        shown.handle = h;
        shown.marker.setLatLng(toLatLng(h.at));
        const element = shown.marker.getElement();
        if (element) {
          element.setAttribute("aria-label", h.label);
          element.title = h.label;
        }
      });
      return;
    }
    const hadFocus = this.handles.some((h) => h.marker.getElement() === document.activeElement);
    this.rebuilding = true;
    this.handleLayer.clearLayers();
    this.handles = wanted.map((handle) => ({ handle, marker: this.makeHandle(handle) }));
    this.handles.forEach((h) => h.marker.addTo(this.handleLayer));
    this.rebuilding = false;
    if (focus && hadFocus) this.handles.find((h) => h.handle.role === focus.role && h.handle.index === focus.index)?.marker.getElement()?.focus();
  }

  private makeHandle(handle: Handle): L.Marker {
    const size = handle.role === "midpoint" ? 10 : 14;
    const icon = L.divIcon({ className: `edit-handle edit-handle-${handle.role}`, iconSize: [size, size] });
    const marker = L.marker(toLatLng(handle.at), { icon, keyboard: false, interactive: true, bubblingMouseEvents: false, zIndexOffset: 1000 });
    const entry = () => this.handles.find((h) => h.marker === marker)?.handle ?? handle;
    marker.on("add", () => {
      const element = marker.getElement()!;
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", handle.label);
      element.title = handle.label;
      element.dataset.role = handle.role;
      element.dataset.index = String(handle.index);
      L.DomEvent.disableClickPropagation(element);
      element.addEventListener("pointerdown", (event) => this.beginDrag(event, entry(), element));
      element.addEventListener("pointermove", (event) => this.moveDrag(event));
      element.addEventListener("pointerup", (event) => this.endDrag(event));
      element.addEventListener("pointercancel", () => this.cancelDrag());
      element.addEventListener("keydown", (event) => this.handleKey(event, entry()));
      element.addEventListener("blur", () => {
        if (!this.rebuilding && this.nudge) this.commitNudge();
      });
    });
    return marker;
  }

  // --- Dragging a handle -----------------------------------------------------------------
  private beginDrag(event: PointerEvent, handle: Handle, element: HTMLElement): void {
    const spec = this.current();
    if (event.button !== 0 || !spec || this.drawing || this.awaiting) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.nudge) this.commitNudge();
    // The keyboard comes here too, so Escape can put it back (the press itself moves no focus).
    element.focus({ preventScroll: true });
    element.setPointerCapture?.(event.pointerId);
    this.drag = { handle, original: spec, start: this.host.map.mouseEventToContainerPoint(event as unknown as MouseEvent), moved: false, spec, element, pointer: event.pointerId };
  }

  private moveDrag(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const point = this.host.map.mouseEventToContainerPoint(event as unknown as MouseEvent);
    if (!drag.moved && point.distanceTo(drag.start) < DRAG_PX) return;
    drag.moved = true;
    drag.spec = dragTo(drag.original, drag.handle, lonLat(this.host.map.containerPointToLatLng(point)), settings);
    this.showChanged(drag.spec, drag.handle);
    this.say(editReadout(drag.spec, drag.handle, settings));
  }

  private endDrag(event?: PointerEvent): void {
    const drag = this.drag;
    if (!drag || (event && event.pointerId !== drag.pointer)) return;
    this.drag = undefined;
    if (event) this.dragEnded = { at: this.host.map.mouseEventToContainerPoint(event as unknown as MouseEvent), time: Date.now() };
    // Cancelled: the pointer stays with the handle until it is let go, so the click that ends it selects nothing.
    if (!event) return;
    drag.element.releasePointerCapture?.(drag.pointer);
    if (!drag.moved) return drag.element.focus();
    this.commit(drag.spec, handleAfter(drag.handle));
  }

  /** Escape, or the pointer lost: the annotation goes back to how it was before the drag. */
  private cancelDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.endDrag();
    this.showChanged(drag.original === this.selected?.spec ? undefined : drag.original);
    this.say("Not changed.");
  }

  /** Show the annotation as changed (live, while dragging or nudging), or as it is. */
  private showChanged(spec: AnnotationSpec | undefined, handle?: Pick<Handle, "role" | "index">): void {
    const id = this.selected?.id;
    if (!id) return;
    this.changed = spec;
    this.preview.clearLayers();
    if (spec) {
      this.host.setShown(id, false);
      this.renderShape(this.preview, spec);
    } else this.host.setShown(id, true);
    // While a midpoint is dragged, it becomes a vertex: the handles are made again once let go.
    if (this.drag && handle?.role === "midpoint") {
      const kept = this.handles.find((h) => h.handle.role === "midpoint" && h.handle.index === handle.index);
      kept?.marker.setLatLng(toLatLng((spec?.positions ?? [])[handle.index + 1] as LonLat));
      return;
    }
    this.showHandles(handle && handleAfter(handle));
  }

  /** Send the change: one step, named by the service ("Circle 'X' moved"). */
  private commit(spec: AnnotationSpec, focus?: Pick<Handle, "role" | "index">): void {
    const selected = this.selected;
    if (!selected) return;
    if (sameGeometry(spec, selected.spec)) {
      this.showChanged(undefined);
      return;
    }
    this.awaiting = true;
    this.showChanged(spec, focus);
    this.host.post({ kind: "edit_annotation", feature_id: selected.id, annotation: spec });
  }

  private cancelEdit(): void {
    if (this.drag) this.cancelDrag();
    if (this.nudge) {
      if (this.nudge.timer) clearTimeout(this.nudge.timer);
      this.nudge = undefined;
      this.showChanged(undefined);
    }
  }

  // --- The keyboard -------------------------------------------------------------------
  private handleKey(event: KeyboardEvent, handle: Handle): void {
    const spec = this.current();
    if (!spec || this.drawing) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = arrows[event.key];
    if (direction) {
      event.preventDefault();
      event.stopPropagation(); // not the map's own panning
      if (this.awaiting || this.drag) return;
      const step = event.shiftKey ? NUDGE_PX * 5 : NUDGE_PX;
      this.nudge ??= { role: handle.role, index: handle.index, original: spec, spec };
      const nudge = this.nudge;
      const now = handlesOf(nudge.spec).find((h) => h.role === nudge.role && h.index === nudge.index);
      if (!now) return;
      const { map } = this.host;
      const to = map.containerPointToLatLng(map.latLngToContainerPoint(toLatLng(now.at)).add([direction[0] * step, direction[1] * step]));
      nudge.spec = dragTo(nudge.spec, now, lonLat(to), settings);
      Object.assign(nudge, handleAfter(now));
      this.showChanged(nudge.spec, nudge);
      this.say(editReadout(nudge.spec, nudge, settings));
      if (nudge.timer) clearTimeout(nudge.timer);
      nudge.timer = setTimeout(() => this.commitNudge(), NUDGE_SETTLE_MS);
    } else if (event.key === "Enter" && this.nudge) {
      event.preventDefault();
      this.commitNudge();
    } else if (event.key === "Escape" && (this.nudge || this.drag)) {
      event.preventDefault();
      event.stopPropagation(); // keeps the selection
      this.cancelEdit();
      this.say("Not changed.");
    } else if ((event.key === "Delete" || event.key === "Backspace") && handle.role === "vertex") {
      event.preventDefault();
      event.stopPropagation();
      if (this.awaiting || this.drag) return;
      if (this.nudge) this.commitNudge();
      const removed = removeVertex(this.current()!, handle.index);
      if ("problem" in removed) return this.say(removed.problem);
      this.commit(removed.spec, { role: "vertex", index: Math.max(0, handle.index - 1) });
    }
  }

  private commitNudge(): void {
    const nudge = this.nudge;
    if (!nudge) return;
    if (nudge.timer) clearTimeout(nudge.timer);
    this.nudge = undefined;
    this.commit(nudge.spec, nudge);
  }

  /** Keys while drawing, or during a drag: before the map's own (Escape there clears the selection). */
  private key(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const onButton = target?.tagName === "BUTTON";
    if (this.drag && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return this.cancelDrag();
    }
    const d = this.drawing;
    if (!d) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    } else if (event.key === "Backspace") {
      event.preventDefault();
      this.drawing = removeLast(d);
      this.dragMode();
      this.renderSketch();
      this.say(hint(this.drawing), readout(this.drawing, this.cursor, settings));
    } else if (event.key === "Enter" && !onButton) {
      event.preventDefault();
      this.finish();
    } else if (event.key === " " && target === this.host.element) {
      event.preventDefault();
      this.cursor = undefined;
      this.place(lonLat(this.host.map.getCenter()));
    }
  }

  private say(text: string, readoutText?: string, saying: "selection" | "other" = "other"): void {
    this.saying = text ? saying : undefined;
    this.statusHint.textContent = text;
    if (readoutText !== undefined) this.statusReadout.textContent = readoutText;
    else if (!this.drawing) this.statusReadout.textContent = "";
    this.statusBox.hidden = !text && !this.statusReadout.textContent;
  }
}
