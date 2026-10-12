/**
 * The time controller (CAP-28, SUB-26): the plot's time window, set with a
 * slider of two handles over the plot's whole period; current time, set with
 * a slider over the window; step buttons; and play, at a chosen speed. How
 * tracks outside the window are drawn (CAP-29) is chosen beside the window's
 * caption in the playground, and from the Time view's title menu in VS Code.
 *
 * One component for every host: VS Code shows it in the Debrief sidebar
 * (webview/time.ts), and the playground at the top of its side column.
 *
 * - The window moves the map at once, and is saved in the plot when the
 *   analyst lets go (see WindowGesture in timelogic.ts). It is never less
 *   than a second long: the handles stop a second apart.
 * - When a tool shows a window other than the saved one, the part that
 *   differs is hatched and a note says so, with Keep (save it) and Revert
 *   (the saved window again), until the analyst chooses. Letting go of the
 *   window counts as Keep. See SavedWindow in timelogic.ts.
 * - Play is off, and says why, when the window is shorter than one tick of
 *   playing at the chosen speed.
 * - Keyboard: the arrow keys move a handle or current time by one step, Page
 *   Up and Page Down by ten, Home and End to the ends; Space plays and pauses
 *   while any slider has focus. Every slider says its time to screen readers.
 */
import { DEFAULT_SETTINGS, formatTime } from "@debrief/kernel";
import type { TimeRange, TimeState } from "@debrief/schemas";
import type { ContextTracks } from "./contrast.js";
import {
  atLeastMinimum,
  clamp,
  describeSpeed,
  describeStep,
  extentOf,
  moveEdge,
  Player,
  sameSpan,
  SavedWindow,
  shiftWindow,
  SPEEDS,
  stepFor,
  tooShortReason,
  tooShortToPlay,
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
  /** The analyst let go of the window, or chose Keep: save it in the plot. */
  windowSaved(window: TimeRange): void;
  /** The analyst chose how tracks outside the window are drawn, where the control offers it: save it in the plot. */
  contextChanged?(context: ContextTracks): void;
}

/** What the host knows of the plot's view (its island) beyond the window shown. */
export interface TimeView {
  /** The window as saved in the plot; without it, the window shown is taken as saved. */
  saved?: TimeRange;
  context?: ContextTracks;
  /** The analyst's setting shows faint context tracks as clear. */
  minimumContrast?: boolean;
}

export interface TimeControlOptions {
  /**
   * Show the choice of how context tracks are drawn in the control (the
   * playground). VS Code offers it in the Time view's title menu instead.
   */
  contextInView?: boolean;
  clock?: Clock;
}

export class TimeControl {
  private current = 0;
  private window: Span = { start: 0, end: 0 };
  private extent: Span = { start: 0, end: 0 };
  private shown = false;
  private readonly player: Player;
  private readonly gesture: WindowGesture;
  private readonly saved: SavedWindow;
  private readonly part: <T extends HTMLElement>(selector: string) => T;
  private readonly contextInView: boolean;

  constructor(
    private readonly element: HTMLElement,
    private readonly host: TimeControlHost,
    options: TimeControlOptions = {},
  ) {
    this.contextInView = options.contextInView ?? true;
    element.classList.add("timebar");
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Time controller");
    element.hidden = true;
    // Compact, to fit VS Code's sidebar view at its first height: the window's ends and
    // length on one line, its slider, a one-line note, current time's slider with the step,
    // and the buttons on the same line as current time.
    const context = this.contextInView
      ? `<label class="tc-context-row" title="How tracks outside the time window are drawn, for everyone who opens this plot"><span>Context</span>` +
        `<select class="tc-context" aria-label="Context tracks">` +
        `<option value="clear">Clear</option><option value="faint">Faint</option><option value="off">Off</option></select>` +
        `<span class="tc-context-note"></span></label>`
      : "";
    element.innerHTML =
      `<div class="tc-caption"><span class="tc-ends" title="Time window"><span class="tc-window-start"></span><span class="tc-to">–</span><span class="tc-window-end"></span></span>` +
      `<span class="tc-window-length" title="Length of the time window"></span>${context}</div>` +
      `<div class="tc-window">` +
      `<div class="tc-rail"></div><div class="tc-band" title="Drag to move the window"></div>` +
      `<div class="tc-beyond" hidden></div><div class="tc-beyond" hidden></div>` +
      `<div class="tc-handle tc-start" role="slider" tabindex="0" aria-label="Time window start" aria-orientation="horizontal"></div>` +
      `<div class="tc-handle tc-end" role="slider" tabindex="0" aria-label="Time window end" aria-orientation="horizontal"></div>` +
      `</div>` +
      `<div class="tc-cue" role="status" aria-live="polite"><span class="tc-cue-text"></span>` +
      `<span class="tc-cue-actions" hidden><button class="tc-keep" title="Save the window shown as the plot's time window">Keep</button>` +
      `<button class="tc-revert" title="Show the saved time window again">Revert</button></span></div>` +
      `<div class="tc-current-row"><input type="range" class="tc-current" aria-label="Current time">` +
      `<span class="tc-step-label" title="The arrow keys and the step buttons move current time by this much"></span></div>` +
      `<div class="tc-buttons">` +
      `<button class="step back" title="Step back" aria-label="Step back">‹</button>` +
      `<button class="tc-play" title="Play (Space)" aria-label="Play">▶</button>` +
      `<button class="step forward" title="Step forward" aria-label="Step forward">›</button>` +
      `<select class="tc-speed" aria-label="Playing speed"></select>` +
      `<span class="time-label" title="Current time"></span>` +
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
      options.clock,
    );
    speed.value = String(this.player.speed);
    speed.title = describeSpeed(this.player.speed);
    speed.addEventListener("change", () => {
      this.player.speed = Number(speed.value);
      speed.title = describeSpeed(this.player.speed);
      this.render();
    });

    this.saved = new SavedWindow((window) => this.host.windowSaved(rangeOf(window)));
    this.gesture = new WindowGesture(
      (window) => {
        this.window = window;
        this.current = clamp(this.current, window.start, window.end);
        this.render();
        this.tell();
      },
      (window) => {
        // Let go: saved as left, which also settles a window a tool showed (Keep).
        this.saved.letGo(window);
        this.host.windowSaved(rangeOf(window));
        this.render();
      },
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

    // Space plays and pauses from any slider; on a button or a list it does what it always does.
    element.addEventListener("keydown", (event) => {
      if (event.key !== " " || (event.target as HTMLElement).closest("button, select")) return;
      event.preventDefault();
      this.player.toggle();
    });

    // A window other than the saved one: keep it, or go back.
    this.part(".tc-keep").addEventListener("click", () => {
      this.saved.keep(this.window);
      this.render();
    });
    this.part(".tc-revert").addEventListener("click", () => {
      const back = this.saved.revert(this.current);
      if (!back) return;
      this.window = back.window;
      this.extent = extentOf(this.extent, this.window);
      this.current = back.current;
      this.render();
      this.tell();
    });

    if (this.contextInView) {
      const context = this.part<HTMLSelectElement>(".tc-context");
      context.addEventListener("change", () => this.host.contextChanged?.(context.value as ContextTracks));
    }

    this.windowKeys(this.part(".tc-start"), "start");
    this.windowKeys(this.part(".tc-end"), "end");
    this.windowPointer();
  }

  /**
   * Show current time, its range being the window shown, and the plot's
   * period, with what the host knows of the plot's view; no time hides the
   * control.
   */
  show(time: TimeState | undefined, period?: TimeRange, view: TimeView = {}): void {
    this.shown = !!time;
    this.element.hidden = !time;
    if (!time) {
      this.gesture.cancel();
      this.player.pause();
      return;
    }
    // A window of no length shows its first second; it is saved only when the analyst lets go.
    const window = atLeastMinimum(spanOf(time.range));
    // Mid-drag, the analyst's hand wins: a window set elsewhere would make the handles jump.
    if (!this.gesture.active) this.window = window;
    this.saved.fromHost(view.saved ? spanOf(view.saved) : window);
    this.extent = extentOf(period ? spanOf(period) : undefined, this.window);
    this.current = clamp(Date.parse(time.current), this.window.start, this.window.end);
    if (this.contextInView) {
      const context = this.part<HTMLSelectElement>(".tc-context");
      context.value = view.context ?? "clear";
      const floor = !!view.minimumContrast && context.value === "faint";
      this.part(".tc-context-note").textContent = floor ? "shown as clear by your setting" : "";
    }
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
    this.render();
  }

  // --- The window: keys and pointer ---------------------------------------------
  private windowKeys(handle: HTMLElement, edge: "start" | "end"): void {
    handle.addEventListener("keydown", (event) => {
      const step = stepFor(this.extent);
      const now = this.window[edge];
      // Home and End go as far as the handle can: the period's end, or a second from the other handle.
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
          : target.classList.contains("tc-band") || target.classList.contains("tc-beyond")
            ? "band"
            : Math.abs(ms - this.window.start) <= Math.abs(ms - this.window.end) ? "start" : "end";
      if (what === "band" && this.window.end - this.window.start >= this.extent.end - this.extent.start) what = ms < (this.window.start + this.window.end) / 2 ? "start" : "end";
      event.preventDefault();
      area.setPointerCapture(event.pointerId);
      // Focus first: the other handle losing focus ends its gesture, never this one.
      if (what !== "band") this.part<HTMLElement>(what === "start" ? ".tc-start" : ".tc-end").focus({ preventScroll: true });
      dragging = { what, from: ms, window: { ...this.window } };
      this.gesture.begin(this.window);
      if (what !== "band") this.gesture.move(moveEdge(this.window, this.extent, what, ms));
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
    const width = (s: Span) => `${(100 * (s.end - s.start)) / span}%`;
    const startHandle = this.part(".tc-start");
    const endHandle = this.part(".tc-end");
    startHandle.style.left = percent(this.window.start);
    endHandle.style.left = percent(this.window.end);
    const band = this.part(".tc-band");
    band.style.left = percent(this.window.start);
    band.style.width = width(this.window);
    this.sliderValues(startHandle, this.window.start, start, this.window.end);
    this.sliderValues(endHandle, this.window.end, this.window.start, end);
    // The date once, unless the window crosses midnight.
    const oneDay = iso(this.window.start).slice(0, 10) === iso(this.window.end).slice(0, 10);
    this.part(".tc-window-start").textContent = show(this.window.start);
    this.part(".tc-window-end").textContent = oneDay ? formatTime(this.window.end, DEFAULT_SETTINGS) : show(this.window.end);
    const whole = sameSpan(this.window, this.extent);
    this.part(".tc-window-length").textContent = whole ? "whole plot" : describeLength(this.window.end - this.window.start);

    // A window other than the saved one: hatch what differs, and say so until the analyst chooses.
    const cue = this.gesture.active ? undefined : this.saved.cue(this.window);
    this.element.querySelectorAll<HTMLElement>(".tc-beyond").forEach((hatch, i) => {
      const part = cue?.parts[i];
      hatch.hidden = !part;
      if (!part) return;
      hatch.style.left = percent(part.start);
      hatch.style.width = width(part);
    });
    const cueText = this.part(".tc-cue-text");
    if (cueText.textContent !== (cue?.message ?? "")) {
      // One line: the whole text on hover when it is cut short; screen readers hear it all.
      cueText.textContent = cue?.message ?? "";
      if (cue) cueText.title = cue.message;
      else cueText.removeAttribute("title");
    }
    this.part(".tc-cue-actions").hidden = !cue;
    this.part(".tc-cue").classList.toggle("showing", !!cue);

    const slider = this.part<HTMLInputElement>(".tc-current");
    slider.min = String(this.window.start);
    slider.max = String(this.window.end);
    slider.step = "1000"; // dragging reaches any second; buttons and keys move by a step
    slider.value = String(this.current);
    const label = show(this.current);
    slider.setAttribute("aria-valuetext", label);
    slider.title = `Current time, from ${show(this.window.start)} to ${show(this.window.end)}`;
    this.part(".time-label").textContent = oneDay ? formatTime(this.current, DEFAULT_SETTINGS) : label;
    const step = describeStep(stepFor(this.window));
    this.part(".tc-step-label").textContent = `step ${step}`;
    this.part(".back").title = `Step back ${step}`;
    this.part(".forward").title = `Step forward ${step}`;

    // Play is off when one tick at this speed would pass the whole window; it says why.
    const play = this.part<HTMLButtonElement>(".tc-play");
    const tooShort = !this.player.playing && tooShortToPlay(this.window, this.player.speed);
    play.setAttribute("aria-disabled", String(tooShort));
    play.classList.toggle("off", tooShort);
    if (tooShort) {
      play.title = tooShortReason(this.player.speed);
      play.setAttribute("aria-description", play.title);
    } else {
      play.title = this.player.playing ? "Pause (Space)" : "Play (Space)";
      play.removeAttribute("aria-description");
    }
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
