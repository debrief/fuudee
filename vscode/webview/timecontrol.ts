/**
 * The time controller (CAP-28, SUB-26), laid out as "big time and scrubber"
 * (product owner, 28 Oct 2026). From the top:
 *
 * - current time, large, with its date small beside it; click it (or Enter
 *   on it) to type a time and go there;
 * - one row of transport: step back, play or pause, step forward, the speed
 *   and the step;
 * - the scrubber, a slider over the time window, with tick labels;
 * - a thin overview strip of the whole plot, the window a band on it: drag
 *   the band to move the window, its edges to resize it; click to move
 *   current time (outside the window, the window moves to take it in);
 * - the note when a tool shows a window other than the saved one, with Keep
 *   and Revert;
 * - "Window 08:00–12:00Z (Visible)", a disclosure, collapsed at first and
 *   remembered by the host: the window's ends typed, its length, Whole plot,
 *   and (in the playground) how tracks outside it are drawn (CAP-29). VS
 *   Code offers that from the Time view's title menu instead.
 *
 * One component for every host: VS Code shows it in the Debrief sidebar
 * (webview/time.ts), and the playground in its Time panel.
 *
 * - The window moves the map at once, and is saved in the plot when the
 *   analyst lets go (see WindowGesture in timelogic.ts). It is never less
 *   than a second long: the edges stop a second apart.
 * - When a tool shows a window other than the saved one, the part that
 *   differs is hatched and a note says so, with Keep (save it) and Revert
 *   (the saved window again), until the analyst chooses. Letting go of the
 *   window counts as Keep. See SavedWindow in timelogic.ts.
 * - Play is off, and says why, when the window is shorter than one tick of
 *   playing at the chosen speed.
 * - Keyboard: on the scrubber and the window's edges the arrow keys move by
 *   one step, Page Up and Page Down by ten, Home and End to the ends; on the
 *   band the arrows move the window and Shift with them resizes it; Space
 *   plays and pauses while any slider has focus. Every slider says its time
 *   to screen readers. No live region follows playing.
 */
import { DEFAULT_SETTINGS, formatTime } from "@debrief/kernel";
import type { TimeRange, TimeState } from "@debrief/schemas";
import type { ContextTracks } from "./contrast.js";
import { parseTime } from "../src/timeinput.js";
import {
  atLeastMinimum,
  bandKey,
  clamp,
  describeSpeed,
  describeStep,
  describeWindow,
  extentOf,
  fractionOf,
  moveEdge,
  Player,
  readTypedTime,
  sameSpan,
  SavedWindow,
  shiftWindow,
  SPEEDS,
  stepFor,
  ticksFor,
  timeAt,
  tooShortReason,
  tooShortToPlay,
  WindowGesture,
  windowToInclude,
  type Clock,
  type Span,
} from "./timelogic.js";

const dated = { ...DEFAULT_SETTINGS, time_style: "date_time" as const };
const show = (ms: number) => formatTime(ms, dated);
const clock = (ms: number) => formatTime(ms, DEFAULT_SETTINGS);
const dateOf = (ms: number) => show(ms).slice(0, show(ms).lastIndexOf(" "));
const iso = (ms: number) => new Date(ms).toISOString();
const spanOf = (range: TimeRange): Span => ({ start: Date.parse(range.start), end: Date.parse(range.end) });
const rangeOf = (span: Span): TimeRange => ({ start: iso(span.start), end: iso(span.end) });
const CONTEXT_NAMES: Record<ContextTracks, string> = { visible: "Visible", faint: "Faint", hidden: "Hidden" };

const KEY_STEPS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };

/** The transport's icons: drawn in the text colour, so every theme and forced colours show them. */
const icon = (path: string) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="${path}"/></svg>`;
const ICONS = {
  back: icon("M3 3h2v10H3zM13.5 3v10L6 8z"),
  play: icon("M4.5 2.5v11L13.5 8z"),
  pause: icon("M4 3h3v10H4zM9 3h3v10H9z"),
  forward: icon("M2.5 3L10 8l-7.5 5zM11 3h2v10h-2z"),
};

let made = 0;

export interface TimeControlHost {
  /** Current time or the window moved: show it now. time.range is the window. */
  moved(time: TimeState): void;
  /** The analyst let go of the window, or chose Keep: save it in the plot. */
  windowSaved(window: TimeRange): void;
  /** The analyst chose how tracks outside the window are drawn, where the control offers it: save it in the plot. */
  contextChanged?(context: ContextTracks): void;
  /** Current time started or stopped playing: the Timeline follows it again when it starts. */
  playing?(playing: boolean): void;
}

/** What the host knows of the plot's view (its island) beyond the window shown. */
export interface TimeView {
  /** The window as saved in the plot; without it, the window shown is taken as saved. */
  saved?: TimeRange;
  context?: ContextTracks;
  /** The analyst's setting shows faint context tracks as visible. */
  minimumContrast?: boolean;
}

/** Where the host keeps whether the window's disclosure is open: the browser's storage, or VS Code's view state. */
export interface Remembered {
  get(): boolean | undefined;
  set(open: boolean): void;
}

export interface TimeControlOptions {
  /**
   * Show the choice of how context tracks are drawn in the control (the
   * playground). VS Code offers it in the Time view's title menu instead.
   */
  contextInView?: boolean;
  clock?: Clock;
  /** Whether the window's disclosure is open, kept by the host; collapsed when it knows nothing. */
  windowOpen?: Remembered;
}

export class TimeControl {
  private current = 0;
  private window: Span = { start: 0, end: 0 };
  private extent: Span = { start: 0, end: 0 };
  private context?: ContextTracks;
  private shown = false;
  private scrubWidth = 0;
  private ticksDrawn = "";
  private readonly player: Player;
  private readonly gesture: WindowGesture;
  private readonly saved: SavedWindow;
  private readonly part: <T extends HTMLElement>(selector: string) => T;
  private readonly contextInView: boolean;
  private readonly windowOpen?: Remembered;

  constructor(
    private readonly element: HTMLElement,
    private readonly host: TimeControlHost,
    options: TimeControlOptions = {},
  ) {
    this.contextInView = options.contextInView ?? true;
    this.windowOpen = options.windowOpen;
    const id = `tc-details-${++made}`;
    element.classList.add("timebar");
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Time controller");
    element.hidden = true;
    const context = this.contextInView
      ? `<label class="tc-context-row" title="How tracks outside the time window are drawn, for everyone who opens this plot"><span>Context</span>` +
        `<select class="tc-context" aria-label="Context tracks">` +
        `<option value="visible">Visible</option><option value="faint">Faint</option><option value="hidden">Hidden</option></select>` +
        `<span class="tc-context-note"></span></label>`
      : "";
    element.innerHTML =
      // Current time, large: the panel's first and largest text. A button, to type a time.
      `<div class="tc-now">` +
      `<button type="button" class="tc-time time-label"></button>` +
      `<input type="text" class="tc-time-input" hidden spellcheck="false" autocomplete="off" aria-label="Go to time" aria-describedby="${id}-hint">` +
      `<span class="tc-date"></span>` +
      `</div>` +
      `<div class="tc-time-problem" id="${id}-hint" role="status"></div>` +
      // Transport.
      `<div class="tc-transport">` +
      `<button type="button" class="tc-icon step back" aria-label="Step back">${ICONS.back}</button>` +
      `<button type="button" class="tc-icon tc-play" aria-label="Play">${ICONS.play}</button>` +
      `<button type="button" class="tc-icon step forward" aria-label="Step forward">${ICONS.forward}</button>` +
      `<select class="tc-speed" aria-label="Playing speed"></select>` +
      `<span class="tc-step-label" title="The arrow keys and the step buttons move current time by this much"></span>` +
      `</div>` +
      // The scrubber, over the window.
      `<div class="tc-scrub"><input type="range" class="tc-current" aria-label="Current time">` +
      `<div class="tc-ticks" aria-hidden="true"></div></div>` +
      // The overview strip: the whole plot, the window a band on it.
      `<div class="tc-window" title="The whole plot. Drag the band to move the time window, its edges to resize it; click to move current time">` +
      `<div class="tc-rail"></div>` +
      `<div class="tc-band" role="slider" tabindex="0" aria-label="Time window" aria-orientation="horizontal" aria-roledescription="window slider"` +
      ` aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"></div>` +
      `<div class="tc-beyond" hidden></div><div class="tc-beyond" hidden></div>` +
      `<div class="tc-now-mark" aria-hidden="true"></div>` +
      `<div class="tc-handle tc-start" role="slider" tabindex="0" aria-label="Time window start" aria-orientation="horizontal"></div>` +
      `<div class="tc-handle tc-end" role="slider" tabindex="0" aria-label="Time window end" aria-orientation="horizontal"></div>` +
      `</div>` +
      // The note when a tool shows another window than the saved one.
      `<div class="tc-cue" role="status" aria-live="polite"><span class="tc-cue-text"></span>` +
      `<span class="tc-cue-actions" hidden><button type="button" class="tc-keep" title="Save the window shown as the plot's time window">Keep</button>` +
      `<button type="button" class="tc-revert" title="Show the saved time window again">Revert</button></span></div>` +
      // Window management, collapsed until the analyst wants it.
      `<button type="button" class="tc-disclosure" aria-expanded="false" aria-controls="${id}">` +
      `<span class="tc-chevron" aria-hidden="true"></span><span class="tc-summary-name">Window</span>` +
      `<span class="tc-summary"></span><span class="tc-summary-context"></span></button>` +
      `<div class="tc-details" id="${id}" role="group" aria-label="Time window" hidden>` +
      `<label class="tc-field"><span>From</span><input type="text" class="tc-from" spellcheck="false" autocomplete="off" aria-label="Time window start"></label>` +
      `<label class="tc-field"><span>To</span><input type="text" class="tc-to" spellcheck="false" autocomplete="off" aria-label="Time window end"></label>` +
      `<div class="tc-window-problem" role="status"></div>` +
      `<div class="tc-details-row"><span class="tc-window-length" title="Length of the time window"></span>` +
      `<button type="button" class="tc-whole" title="Make the time window the whole plot">Whole plot</button></div>` +
      context +
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

    // Current time: the scrubber, the buttons, and typing a time.
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
    this.typedTime();

    // Space plays and pauses from any slider; on a button, a list or a box to type in it does what it always does.
    element.addEventListener("keydown", (event) => {
      if (event.key !== " " || (event.target as HTMLElement).closest("button, select, input:not([type=range])")) return;
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
      context.addEventListener("change", () => {
        this.context = context.value as ContextTracks;
        this.render();
        this.host.contextChanged?.(this.context);
      });
    }

    // The disclosure: collapsed unless the host remembers it open.
    const disclosure = this.part<HTMLButtonElement>(".tc-disclosure");
    this.setOpen(this.windowOpen?.get() === true);
    disclosure.addEventListener("click", () => {
      const open = disclosure.getAttribute("aria-expanded") !== "true";
      this.setOpen(open);
      this.windowOpen?.set(open);
    });
    this.part(".tc-whole").addEventListener("click", () => this.setWindow(this.extent));
    this.typedEdge(this.part(".tc-from"), "start");
    this.typedEdge(this.part(".tc-to"), "end");

    this.edgeKeys(this.part(".tc-start"), "start");
    this.edgeKeys(this.part(".tc-end"), "end");
    this.bandKeys(this.part(".tc-band"));
    this.stripPointer();

    // Tick labels follow the scrubber's width.
    const ticks = this.part(".tc-ticks");
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => {
        this.scrubWidth = ticks.clientWidth;
        this.drawTicks();
      }).observe(ticks);
    }
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
    this.context = view.context;
    if (this.contextInView) {
      const context = this.part<HTMLSelectElement>(".tc-context");
      context.value = view.context ?? "visible";
      const floor = !!view.minimumContrast && context.value === "faint";
      this.part(".tc-context-note").textContent = floor ? "shown as visible by your setting" : "";
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

  /** Current time to a moment, the window moved to take it in if it is outside (saved, as a let go). */
  private goTo(at: number): void {
    const window = windowToInclude(this.window, this.extent, at);
    if (!sameSpan(window, this.window)) this.setWindow(window);
    this.moveCurrent(at);
  }

  /** The window set in one go (Whole plot, a typed end, a click outside it): shown, then saved as let go. */
  private setWindow(window: Span): void {
    if (!this.shown || sameSpan(window, this.window)) return;
    this.gesture.begin(this.window);
    this.gesture.move(window);
    this.gesture.end();
  }

  private tell(): void {
    this.host.moved({ current: iso(this.current), range: rangeOf(this.window) });
  }

  private showPlaying(playing: boolean): void {
    const button = this.part<HTMLButtonElement>(".tc-play");
    button.innerHTML = playing ? ICONS.pause : ICONS.play;
    button.setAttribute("aria-label", playing ? "Pause" : "Play");
    this.render();
    this.host.playing?.(playing);
  }

  private setOpen(open: boolean): void {
    this.part(".tc-disclosure").setAttribute("aria-expanded", String(open));
    this.part(".tc-details").hidden = !open;
    this.element.classList.toggle("tc-open", open);
  }

  // --- Typing a time ----------------------------------------------------------------
  private typedTime(): void {
    const button = this.part<HTMLButtonElement>(".tc-time");
    const input = this.part<HTMLInputElement>(".tc-time-input");
    const problem = this.part(".tc-time-problem");
    const close = (focus: boolean) => {
      input.hidden = true;
      button.hidden = false;
      problem.textContent = "";
      if (focus) button.focus();
    };
    button.addEventListener("click", () => {
      input.value = clock(this.current);
      button.hidden = true;
      input.hidden = false;
      input.focus();
      input.select();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const at = readTypedTime(input.value, this.extent, parseTime);
        if (at === undefined) problem.textContent = "Not a time Debrief reads: try 10:31:30Z or 15 Jun 2023 10:31:30Z";
        else if (at < this.extent.start || at > this.extent.end) problem.textContent = `Outside the plot, ${show(this.extent.start)} to ${show(this.extent.end)}`;
        else {
          close(true);
          this.goTo(at);
        }
      }
    });
    input.addEventListener("blur", () => {
      if (!input.hidden) close(false);
    });
  }

  /** A window's end typed: saved on Enter or on leaving the box, if it reads as a time. */
  private typedEdge(input: HTMLInputElement, edge: "start" | "end"): void {
    const problem = this.part(".tc-window-problem");
    const apply = () => {
      const at = readTypedTime(input.value, this.extent, parseTime);
      if (at === undefined) {
        problem.textContent = `${edge === "start" ? "From" : "To"}: not a time Debrief reads; try 09:30Z or 15 Jun 2023 09:30:00Z`;
        return;
      }
      problem.textContent = "";
      this.setWindow(moveEdge(this.window, this.extent, edge, at));
      this.render(true);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        apply();
      } else if (event.key === "Escape") {
        event.preventDefault();
        problem.textContent = "";
        this.render(true);
      }
    });
    input.addEventListener("change", apply);
  }

  // --- The window: keys and pointer ---------------------------------------------
  private edgeKeys(handle: HTMLElement, edge: "start" | "end"): void {
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

  private bandKeys(band: HTMLElement): void {
    band.addEventListener("keydown", (event) => {
      const next = bandKey(this.window, this.extent, event.key, event.shiftKey);
      if (!next) return;
      event.preventDefault();
      this.gesture.begin(this.window);
      this.gesture.move(next);
    });
    band.addEventListener("keyup", (event) => {
      if (event.key !== "Shift") this.gesture.end();
    });
    band.addEventListener("blur", () => this.gesture.end());
  }

  private stripPointer(): void {
    const area = this.part(".tc-window");
    const fraction = (x: number) => {
      const box = area.getBoundingClientRect();
      return box.width ? (x - box.left) / box.width : 0;
    };
    const at = (x: number) => timeAt(fraction(x), this.extent);
    let held: { what: "start" | "end" | "band" | "click"; x: number; from: number; window: Span; moved: boolean } | undefined;
    area.addEventListener("pointerdown", (event) => {
      if (!this.shown || event.button !== 0) return;
      const target = event.target as HTMLElement;
      const what = target.classList.contains("tc-start") ? "start"
        : target.classList.contains("tc-end") ? "end"
        : target.classList.contains("tc-band") || target.classList.contains("tc-beyond") ? "band"
        : "click";
      event.preventDefault();
      area.setPointerCapture(event.pointerId);
      // Focus first: the other handle losing focus ends its gesture, never this one.
      const focus = what === "start" ? ".tc-start" : what === "end" ? ".tc-end" : ".tc-band";
      this.part<HTMLElement>(focus).focus({ preventScroll: true });
      held = { what, x: event.clientX, from: at(event.clientX), window: { ...this.window }, moved: false };
      if (what === "start" || what === "end") {
        this.gesture.begin(this.window);
        this.gesture.move(moveEdge(this.window, this.extent, what, at(event.clientX)));
      }
    });
    area.addEventListener("pointermove", (event) => {
      if (!held) return;
      const ms = at(event.clientX);
      if (held.what === "start" || held.what === "end") {
        this.gesture.move(moveEdge(this.window, this.extent, held.what, ms));
      } else if (held.what === "band") {
        // A drag once it has gone a few pixels; less is a click.
        if (!held.moved && Math.abs(event.clientX - held.x) < 4) return;
        if (!held.moved) this.gesture.begin(this.window);
        held.moved = true;
        this.gesture.move(shiftWindow(held.window, this.extent, ms - held.from));
      }
    });
    const release = (click: boolean) => {
      if (!held) return;
      const was = held;
      held = undefined;
      if (was.what === "click" || (was.what === "band" && !was.moved)) {
        if (click) this.goTo(was.from);
      } else this.gesture.end();
    };
    area.addEventListener("pointerup", () => release(true));
    area.addEventListener("pointercancel", () => release(false));
    area.addEventListener("lostpointercapture", () => release(false));
  }

  // --- Drawing ---------------------------------------------------------------------
  /** Draw it all; `edges` puts the typed ends back even while one has the keyboard. */
  private render(edges = false): void {
    const percent = (ms: number) => `${100 * fractionOf(ms, this.extent)}%`;
    const width = (s: Span) => `${100 * (fractionOf(s.end, this.extent) - fractionOf(s.start, this.extent))}%`;

    // Current time, large; its date small beside it.
    const button = this.part<HTMLButtonElement>(".tc-time");
    const time = clock(this.current);
    if (button.textContent !== time) button.textContent = time;
    const date = dateOf(this.current);
    this.part(".tc-date").textContent = date;
    button.title = "Current time: click to type a time to go to";
    button.setAttribute("aria-label", `Current time ${time}, ${date}. Press Enter to type a time`);

    // The overview strip.
    const startHandle = this.part(".tc-start");
    const endHandle = this.part(".tc-end");
    startHandle.style.left = percent(this.window.start);
    endHandle.style.left = percent(this.window.end);
    const band = this.part(".tc-band");
    band.style.left = percent(this.window.start);
    band.style.width = width(this.window);
    this.part(".tc-now-mark").style.left = percent(this.current);
    this.sliderValues(startHandle, this.window.start, this.extent.start, this.window.end);
    this.sliderValues(endHandle, this.window.end, this.window.start, this.extent.end);
    const length = this.window.end - this.window.start;
    const whole = sameSpan(this.window, this.extent);
    const lengthText = whole ? "whole plot" : describeLength(length);
    band.setAttribute("aria-valuemin", String(this.extent.start));
    band.setAttribute("aria-valuemax", String(Math.max(this.extent.start, this.extent.end - length)));
    band.setAttribute("aria-valuenow", String(this.window.start));
    band.setAttribute("aria-valuetext", `${show(this.window.start)} to ${show(this.window.end)}, ${lengthText}`);

    // The window in words: the summary, and inside the disclosure.
    this.part(".tc-window-length").textContent = whole ? `Length ${describeLength(length)}, the whole plot` : `Length ${lengthText}`;
    this.part(".tc-summary").textContent = describeWindow(this.window);
    this.part(".tc-summary-context").textContent = this.context ? `(${CONTEXT_NAMES[this.context]})` : "";
    this.part(".tc-disclosure").title = `Time window ${show(this.window.start)} to ${show(this.window.end)}, ${lengthText}${this.context ? `; context tracks ${this.context}` : ""}`;
    const wholeButton = this.part<HTMLButtonElement>(".tc-whole");
    wholeButton.disabled = whole;
    for (const [selector, ms] of [[".tc-from", this.window.start], [".tc-to", this.window.end]] as const) {
      const input = this.part<HTMLInputElement>(selector);
      if (edges || document.activeElement !== input) input.value = show(ms);
    }

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

    // The scrubber, over the window.
    const slider = this.part<HTMLInputElement>(".tc-current");
    slider.min = String(this.window.start);
    slider.max = String(this.window.end);
    slider.step = "1000"; // dragging reaches any second; buttons and keys move by a step
    slider.value = String(this.current);
    slider.setAttribute("aria-valuetext", show(this.current));
    slider.title = `Current time, from ${show(this.window.start)} to ${show(this.window.end)}`;
    this.drawTicks();
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

  /** The scrubber's tick labels, drawn again only when the window or the width changes. */
  private drawTicks(): void {
    const width = this.scrubWidth || this.part(".tc-ticks").clientWidth;
    const key = `${this.window.start}/${this.window.end}/${width}`;
    if (key === this.ticksDrawn) return;
    this.ticksDrawn = key;
    const ticks = this.part(".tc-ticks");
    ticks.replaceChildren(
      ...ticksFor(this.window, width).map((tick) => {
        const label = document.createElement("span");
        label.className = "tc-tick";
        label.style.left = `${100 * tick.fraction}%`;
        label.textContent = tick.label;
        return label;
      }),
    );
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
