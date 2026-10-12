/**
 * The time controller (CAP-28, SUB-26): the plot's time window, set with a
 * slider of two handles over the plot's whole period; current time, set with
 * a slider over the window; step buttons; and play, at a chosen speed.
 *
 * One component for every host: VS Code shows it in the Debrief sidebar
 * (webview/time.ts), and the playground at the top of its side column.
 *
 * - The window moves the map at once, and is saved in the plot when the
 *   analyst lets go (see WindowGesture in timelogic.ts).
 * - Keyboard: the arrow keys move a handle or current time by one step, Page
 *   Up and Page Down by ten, Home and End to the ends; Space plays and pauses
 *   while any slider has focus. Every slider says its time to screen readers.
 */
import { DEFAULT_SETTINGS, formatTime } from "@debrief/kernel";
import type { TimeRange, TimeState } from "@debrief/schemas";
import {
  clamp,
  describeSpeed,
  describeStep,
  extentOf,
  moveEdge,
  Player,
  sameSpan,
  shiftWindow,
  SPEEDS,
  stepFor,
  WindowGesture,
  type Clock,
  type Span,
} from "./timelogic.js";

const dated = { ...DEFAULT_SETTINGS, time_style: "date_time" as const };
const show = (ms: number) => formatTime(ms, dated);
const iso = (ms: number) => new Date(ms).toISOString();
const spanOf = (range: TimeRange): Span => ({ start: Date.parse(range.start), end: Date.parse(range.end) });
const rangeOf = (span: Span): TimeRange => ({ start: iso(span.start), end: iso(span.end) });

const KEY_STEPS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };

export interface TimeControlHost {
  /** Current time or the window moved: show it now. time.range is the window. */
  moved(time: TimeState): void;
  /** The analyst let go of the window: save it in the plot. */
  windowSaved(window: TimeRange): void;
}

export class TimeControl {
  private current = 0;
  private window: Span = { start: 0, end: 0 };
  private extent: Span = { start: 0, end: 0 };
  private shown = false;
  private readonly player: Player;
  private readonly gesture: WindowGesture;
  private readonly part: <T extends HTMLElement>(selector: string) => T;

  constructor(
    private readonly element: HTMLElement,
    private readonly host: TimeControlHost,
    clock?: Clock,
  ) {
    element.classList.add("timebar");
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Time controller");
    element.hidden = true;
    element.innerHTML =
      `<div class="tc-caption"><span>Time window</span><span class="tc-window-length"></span></div>` +
      `<div class="tc-window">` +
      `<div class="tc-rail"></div><div class="tc-band" title="Drag to move the window"></div>` +
      `<div class="tc-handle tc-start" role="slider" tabindex="0" aria-label="Time window start" aria-orientation="horizontal"></div>` +
      `<div class="tc-handle tc-end" role="slider" tabindex="0" aria-label="Time window end" aria-orientation="horizontal"></div>` +
      `</div>` +
      `<div class="tc-ends"><span class="tc-window-start"></span> – <span class="tc-window-end"></span></div>` +
      `<div class="tc-caption"><span>Current time</span><span class="tc-step-label"></span></div>` +
      `<input type="range" class="tc-current" aria-label="Current time">` +
      `<div class="tc-buttons">` +
      `<button class="step back" title="Step back" aria-label="Step back">‹</button>` +
      `<button class="tc-play" title="Play (Space)" aria-label="Play">▶</button>` +
      `<button class="step forward" title="Step forward" aria-label="Step forward">›</button>` +
      `<select class="tc-speed" aria-label="Playing speed"></select>` +
      `<span class="time-label"></span>` +
      `</div>`;
    this.part = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector)!;
    const speed = this.part<HTMLSelectElement>(".tc-speed");
    for (const s of SPEEDS) {
      const option = new Option(`${s}×`, String(s));
      option.title = describeSpeed(s);
      speed.append(option);
    }

    this.player = new Player(
      () => (this.shown ? { current: this.current, window: this.window } : undefined),
      (ms) => this.moveCurrent(ms),
      (playing) => this.showPlaying(playing),
      clock,
    );
    speed.value = String(this.player.speed);
    speed.title = describeSpeed(this.player.speed);
    speed.addEventListener("change", () => {
      this.player.speed = Number(speed.value);
      speed.title = describeSpeed(this.player.speed);
    });

    this.gesture = new WindowGesture(
      (window) => {
        this.window = window;
        this.current = clamp(this.current, window.start, window.end);
        this.render();
        this.tell();
      },
      (window) => this.host.windowSaved(rangeOf(window)),
    );

    // Current time.
    const slider = this.part<HTMLInputElement>(".tc-current");
    slider.addEventListener("input", () => this.moveCurrent(Number(slider.value)));
    slider.addEventListener("keydown", (event) => {
      const by = KEY_STEPS[event.key];
      if (by === undefined) return; // Home and End are the slider's own: the window's ends
      event.preventDefault();
      this.moveCurrent(this.current + by * stepFor(this.window));
    });
    this.part(".back").addEventListener("click", () => this.moveCurrent(this.current - stepFor(this.window)));
    this.part(".forward").addEventListener("click", () => this.moveCurrent(this.current + stepFor(this.window)));
    this.part(".tc-play").addEventListener("click", () => this.player.toggle());

    // Space plays and pauses from any slider; on a button or the speed list it does what it always does.
    element.addEventListener("keydown", (event) => {
      if (event.key !== " " || (event.target as HTMLElement).closest("button, select")) return;
      event.preventDefault();
      this.player.toggle();
    });

    this.windowKeys(this.part(".tc-start"), "start");
    this.windowKeys(this.part(".tc-end"), "end");
    this.windowPointer();
  }

  /** Show current time, its range being the window, and the plot's period; none hides the control. */
  show(time: TimeState | undefined, period?: TimeRange): void {
    this.shown = !!time;
    this.element.hidden = !time;
    if (!time) {
      this.gesture.cancel();
      this.player.pause();
      return;
    }
    const window = spanOf(time.range);
    // Mid-drag, the analyst's hand wins: a window set elsewhere would make the handles jump.
    if (!this.gesture.active) this.window = window;
    this.extent = extentOf(period ? spanOf(period) : undefined, this.window);
    this.current = clamp(Date.parse(time.current), this.window.start, this.window.end);
    this.render();
  }

  /** Whether it is playing, for hosts and tests. */
  get playing(): boolean {
    return this.player.playing;
  }

  private moveCurrent(ms: number): void {
    if (!this.shown) return;
    const next = clamp(Math.round(ms), this.window.start, this.window.end);
    if (next === this.current) return this.render();
    this.current = next;
    this.render();
    this.tell();
  }

  private tell(): void {
    this.host.moved({ current: iso(this.current), range: rangeOf(this.window) });
  }

  private showPlaying(playing: boolean): void {
    const button = this.part<HTMLButtonElement>(".tc-play");
    button.textContent = playing ? "❚❚" : "▶";
    button.setAttribute("aria-label", playing ? "Pause" : "Play");
    button.title = playing ? "Pause (Space)" : "Play (Space)";
  }

  // --- The window: keys and pointer ---------------------------------------------
  private windowKeys(handle: HTMLElement, edge: "start" | "end"): void {
    handle.addEventListener("keydown", (event) => {
      const step = stepFor(this.extent);
      const now = this.window[edge];
      const to =
        event.key === "Home" ? (edge === "start" ? this.extent.start : this.window.start)
        : event.key === "End" ? (edge === "start" ? this.window.end : this.extent.end)
        : KEY_STEPS[event.key] !== undefined ? now + KEY_STEPS[event.key] * step
        : undefined;
      if (to === undefined) return;
      event.preventDefault();
      this.gesture.begin(this.window);
      this.gesture.move(moveEdge(this.window, this.extent, edge, to));
    });
    // Saved when the key is let go, so holding an arrow key down saves once.
    handle.addEventListener("keyup", () => this.gesture.end());
    handle.addEventListener("blur", () => this.gesture.end());
  }

  private windowPointer(): void {
    const area = this.part(".tc-window");
    const at = (x: number) => {
      const box = area.getBoundingClientRect();
      const f = box.width ? clamp((x - box.left) / box.width, 0, 1) : 0;
      return this.extent.start + f * (this.extent.end - this.extent.start);
    };
    let dragging: { what: "start" | "end" | "band"; from: number; window: Span } | undefined;
    area.addEventListener("pointerdown", (event) => {
      if (!this.shown || event.button !== 0) return;
      const target = event.target as HTMLElement;
      const ms = at(event.clientX);
      let what: "start" | "end" | "band" = target.classList.contains("tc-start")
        ? "start"
        : target.classList.contains("tc-end")
          ? "end"
          : target.classList.contains("tc-band")
            ? "band"
            : Math.abs(ms - this.window.start) <= Math.abs(ms - this.window.end) ? "start" : "end";
      if (what === "band" && this.window.end - this.window.start >= this.extent.end - this.extent.start) what = ms < (this.window.start + this.window.end) / 2 ? "start" : "end";
      event.preventDefault();
      area.setPointerCapture(event.pointerId);
      dragging = { what, from: ms, window: { ...this.window } };
      this.gesture.begin(this.window);
      if (what !== "band") {
        this.part<HTMLElement>(what === "start" ? ".tc-start" : ".tc-end").focus({ preventScroll: true });
        this.gesture.move(moveEdge(this.window, this.extent, what, ms));
      }
    });
    area.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const ms = at(event.clientX);
      this.gesture.move(
        dragging.what === "band"
          ? shiftWindow(dragging.window, this.extent, ms - dragging.from)
          : moveEdge(this.window, this.extent, dragging.what, ms),
      );
    });
    const release = () => {
      if (!dragging) return;
      dragging = undefined;
      this.gesture.end();
    };
    area.addEventListener("pointerup", release);
    area.addEventListener("pointercancel", release);
    area.addEventListener("lostpointercapture", release);
  }

  // --- Drawing ---------------------------------------------------------------------
  private render(): void {
    const { start, end } = this.extent;
    const span = end - start || 1;
    const percent = (ms: number) => `${(100 * (ms - start)) / span}%`;
    const startHandle = this.part(".tc-start");
    const endHandle = this.part(".tc-end");
    startHandle.style.left = percent(this.window.start);
    endHandle.style.left = percent(this.window.end);
    const band = this.part(".tc-band");
    band.style.left = percent(this.window.start);
    band.style.width = `${(100 * (this.window.end - this.window.start)) / span}%`;
    this.sliderValues(startHandle, this.window.start, start, this.window.end);
    this.sliderValues(endHandle, this.window.end, this.window.start, end);
    // The date once, unless the window crosses midnight.
    const oneDay = iso(this.window.start).slice(0, 10) === iso(this.window.end).slice(0, 10);
    this.part(".tc-window-start").textContent = show(this.window.start);
    this.part(".tc-window-end").textContent = oneDay ? formatTime(this.window.end, DEFAULT_SETTINGS) : show(this.window.end);
    const whole = sameSpan(this.window, this.extent);
    this.part(".tc-window-length").textContent = whole ? "whole plot" : describeLength(this.window.end - this.window.start);

    const slider = this.part<HTMLInputElement>(".tc-current");
    slider.min = String(this.window.start);
    slider.max = String(this.window.end);
    slider.step = "1000"; // dragging reaches any second; buttons and keys move by a step
    slider.value = String(this.current);
    const label = show(this.current);
    slider.setAttribute("aria-valuetext", label);
    slider.title = `${show(this.window.start)} to ${show(this.window.end)}`;
    this.part(".time-label").textContent = oneDay ? formatTime(this.current, DEFAULT_SETTINGS) : label;
    const step = describeStep(stepFor(this.window));
    this.part(".tc-step-label").textContent = `step ${step}`;
    this.part(".back").title = `Step back ${step}`;
    this.part(".forward").title = `Step forward ${step}`;
  }

  private sliderValues(handle: HTMLElement, value: number, min: number, max: number): void {
    handle.setAttribute("aria-valuemin", String(min));
    handle.setAttribute("aria-valuemax", String(max));
    handle.setAttribute("aria-valuenow", String(value));
    handle.setAttribute("aria-valuetext", show(value));
  }
}

/** How long the window is, roughly, as the analyst reads it: "4 h 30 min", "3 days 2 h". */
export function describeLength(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)} s`;
  const minutes = Math.round(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [days && `${days} ${days === 1 ? "day" : "days"}`, hours && `${hours} h`, !days && mins && `${mins} min`].filter(Boolean);
  return parts.length ? parts.join(" ") : `${Math.round(ms / 1000)} s`;
}
