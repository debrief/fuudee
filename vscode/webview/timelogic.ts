/**
 * The time controller's rules, kept free of the page so they can be tested:
 * the time window within the plot's period, the steps the keys and buttons
 * move by, playing at a chosen speed, and saving the window only when the
 * analyst lets go of it (CAP-28, SUB-22, SUB-26).
 *
 * Times are milliseconds since 1970, UTC.
 */

export interface Span {
  start: number;
  end: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Steps the buttons and keys move by: the first at least a hundredth of the span. */
export const STEPS = [1, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400].map((s) => s * SECOND);

export function stepFor(span: Span): number {
  return STEPS.find((s) => s >= (span.end - span.start) / 100) ?? STEPS.at(-1)!;
}

/** A step as the analyst reads it: "1 s", "5 min", "2 h", "1 day". */
export function describeStep(ms: number): string {
  if (ms >= DAY && ms % DAY === 0) return ms === DAY ? "1 day" : `${ms / DAY} days`;
  if (ms >= HOUR && ms % HOUR === 0) return `${ms / HOUR} h`;
  if (ms >= MINUTE && ms % MINUTE === 0) return `${ms / MINUTE} min`;
  return `${Math.round(ms / SECOND)} s`;
}

export const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** Where the window can go: the plot's period, widened to take in a window already outside it. */
export function extentOf(period: Span | undefined, window: Span): Span {
  if (!period) return { ...window };
  return { start: Math.min(period.start, window.start), end: Math.max(period.end, window.end) };
}

/** The shortest window: one second. A window of no length would show nothing and play nowhere. */
export const MINIMUM_WINDOW = SECOND;

/** A window as shown: one loaded with no length (or less than a second) shows its first second. */
export function atLeastMinimum(window: Span): Span {
  return window.end - window.start >= MINIMUM_WINDOW ? window : { start: window.start, end: window.start + MINIMUM_WINDOW };
}

/**
 * The window with one edge moved to a time, kept within the extent and at
 * least a second long: the handles stop a second apart and never cross.
 * Whole seconds: the window is saved as the analyst reads it.
 */
export function moveEdge(window: Span, extent: Span, edge: "start" | "end", to: number): Span {
  const at = Math.round(to / SECOND) * SECOND;
  const last = window.end - MINIMUM_WINDOW;
  const first = window.start + MINIMUM_WINDOW;
  if (edge === "start") return { start: clamp(at, Math.min(extent.start, last), last), end: window.end };
  return { start: window.start, end: clamp(at, first, Math.max(extent.end, first)) };
}

/** The whole window moved by an amount, keeping its length, within the extent. */
export function shiftWindow(window: Span, extent: Span, by: number): Span {
  const length = Math.min(window.end - window.start, extent.end - extent.start);
  const start = clamp(Math.round((window.start + by) / SECOND) * SECOND, extent.start, extent.end - length);
  return { start, end: start + length };
}

export const sameSpan = (a: Span | undefined, b: Span | undefined): boolean => !!a && !!b && a.start === b.start && a.end === b.end;

/**
 * Speeds the controller plays at, in multiples of real time. Exercise serials
 * last hours and deployments weeks, so the choices run from watching a
 * manoeuvre as it happened to crossing a week in minutes:
 *   1×     a close-quarters encounter, second by second
 *   10×    an approach: ten minutes of the plot a minute
 *   60×    a minute a second: a four-hour serial in four minutes
 *   600×   ten minutes a second: a serial in under half a minute
 *   3600×  an hour a second: a week's deployment in under three minutes
 */
export const SPEEDS = [1, 10, 60, 600, 3600];
export const DEFAULT_SPEED = 60;

/** How often playing moves current time: ten times a second, smooth enough to follow without flooding the views. */
export const TICK_MS = 100;

/** How far one tick of playing moves current time at a speed. */
export const tickAdvance = (speed: number): number => speed * TICK_MS;

/** Whether a window is too short to play at a speed: shorter than one tick moves current time. */
export const tooShortToPlay = (window: Span, speed: number): boolean => window.end - window.start < tickAdvance(speed);

/** Why Play is off, as the analyst reads it. */
export const tooShortReason = (speed: number): string => `Window too short to play at ${speed}×: widen it or slow down`;

export function describeSpeed(speed: number): string {
  const plot = speed * SECOND;
  return `${speed}× real time: ${plot >= MINUTE ? describeStep(plot) : `${speed} s`} of the plot each second`;
}

/** The clock playing uses, replaceable in tests. */
export interface Clock {
  now(): number;
  every(ms: number, tick: () => void): () => void;
}
export const realClock: Clock = {
  now: () => Date.now(),
  every: (ms, tick) => {
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  },
};

/**
 * Plays current time forward at a speed. Each tick asks for current time and
 * the window, so a time set elsewhere while playing is played on from. It
 * stops at the end of the window; playing from the end starts again from the
 * window's start.
 */
export class Player {
  speed = DEFAULT_SPEED;
  private stopTicking?: () => void;
  private last = 0;

  constructor(
    private readonly where: () => { current: number; window: Span } | undefined,
    private readonly moveTo: (ms: number) => void,
    private readonly changed: (playing: boolean) => void,
    private readonly clock: Clock = realClock,
  ) {}

  get playing(): boolean {
    return !!this.stopTicking;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  play(): void {
    const at = this.where();
    if (this.playing || !at || tooShortToPlay(at.window, this.speed)) return;
    if (at.current >= at.window.end) this.moveTo(at.window.start);
    this.last = this.clock.now();
    this.stopTicking = this.clock.every(TICK_MS, () => this.tick());
    this.changed(true);
  }

  pause(): void {
    if (!this.stopTicking) return;
    this.stopTicking();
    this.stopTicking = undefined;
    this.changed(false);
  }

  private tick(): void {
    const at = this.where();
    if (!at) return this.pause();
    const now = this.clock.now();
    const next = Math.min(at.window.end, Math.max(at.window.start, at.current) + (now - this.last) * this.speed);
    this.last = now;
    this.moveTo(next);
    if (next >= at.window.end) this.pause();
  }
}

/**
 * Moving the window: every movement is shown at once, but it is saved only
 * when the analyst lets go (pointer up, key up), and only if it changed.
 * Saving on every movement would write the plot file many times a second
 * and, on a shared folder, look to a colleague like a flood of changes.
 */
export class WindowGesture {
  private from?: Span;
  private latest?: Span;

  constructor(
    private readonly moved: (window: Span) => void,
    private readonly committed: (window: Span) => void,
  ) {}

  get active(): boolean {
    return !!this.from;
  }

  /** The analyst takes hold of the window, as it is now. */
  begin(window: Span): void {
    if (this.from) return; // a key held down repeats: still the same gesture
    this.from = { ...window };
    this.latest = { ...window };
  }

  move(window: Span): void {
    if (!this.from || sameSpan(window, this.latest)) return;
    this.latest = { ...window };
    this.moved(window);
  }

  /** The analyst lets go: save, if anything changed. */
  end(): void {
    const [from, latest] = [this.from, this.latest];
    this.from = this.latest = undefined;
    if (from && latest && !sameSpan(from, latest)) this.committed(latest);
  }

  /** Let go without saving, such as when another plot is opened mid-drag. */
  cancel(): void {
    this.from = this.latest = undefined;
  }
}

// --- A time outside the saved window (CAP-28, expert panel 12 Oct) ------------------

const within = (at: number, span: Span) => at >= span.start && at <= span.end;
const toSecond = (ms: number, round: (x: number) => number) => round(ms / SECOND) * SECOND;

/**
 * The window to show when a tool moves current time, never saved: the window
 * shown if the time is in it; else the saved window widened by the least
 * amount that takes the time in, unless that would make it more than twice
 * as long; else a window of the saved length, centred on the time, kept in
 * the plot's period. Whole seconds.
 */
export function windowForTime(saved: Span, shown: Span, at: number, period?: Span): Span {
  if (within(at, shown)) return shown;
  const base = atLeastMinimum(saved);
  if (within(at, base)) return base;
  const widened = { start: toSecond(Math.min(base.start, at), Math.floor), end: toSecond(Math.max(base.end, at), Math.ceil) };
  const length = base.end - base.start;
  if (widened.end - widened.start <= 2 * length) return widened;
  let start = toSecond(at - length / 2, Math.round);
  if (period && within(at, period) && period.end - period.start >= length) start = clamp(start, period.start, period.end - length);
  return { start, end: start + length };
}

/** How a tool's time is shown: in a window, and whether that window is saved. */
export interface ToolTime {
  window: Span;
  /** Saved through the normal path, as if the analyst had let go of it. */
  save: boolean;
  /** The time is outside the saved window: the tool's message says so. */
  outside: boolean;
}

/**
 * Where a tool's current time is shown. A tool whose purpose is to set the
 * window (save_window) has its range saved, through the normal path, only
 * when the analyst ran it by hand on the plot still open; otherwise its
 * range is shown and not saved. Every other tool's time is shown in the
 * window windowForTime gives, never saved.
 */
export function placeToolTime(
  at: number,
  range: Span,
  how: { saved: Span; shown: Span; period?: Span; saveWindow: boolean; byHand: boolean; samePlot: boolean },
): ToolTime {
  const saved = atLeastMinimum(how.saved);
  if (how.saveWindow && how.byHand && how.samePlot) return { window: atLeastMinimum(range), save: true, outside: false };
  const window = how.saveWindow ? atLeastMinimum(range) : windowForTime(saved, how.shown, at, how.period);
  return { window, save: false, outside: !within(at, saved) };
}

/** How the window shown differs from the saved one: the parts beyond it, and what to say. */
export interface Beyond {
  kind: "widened" | "shifted";
  /** The parts of the window shown that are not in the saved window: hatched on the bar. */
  parts: Span[];
  message: string;
}

/** How the window shown differs from the saved one, or undefined if it doesn't. */
export function beyondSaved(shown: Span, saved: Span): Beyond | undefined {
  const [a, b] = [atLeastMinimum(shown), atLeastMinimum(saved)];
  if (sameSpan(a, b)) return undefined;
  const parts: Span[] = [];
  if (a.start < b.start) parts.push({ start: a.start, end: Math.min(a.end, b.start) });
  if (a.end > b.end) parts.push({ start: Math.max(a.start, b.end), end: a.end });
  return a.start <= b.start && a.end >= b.end
    ? { kind: "widened", parts, message: "Showing beyond saved window" }
    : { kind: "shifted", parts, message: "Showing a different period from the saved window" };
}

/**
 * The saved window, as the time controller keeps it, and the cue that the
 * window shown differs from it. Keep saves the window shown; Revert shows the
 * saved one again; letting go of the window saves it as left, so it counts
 * as Keep. Moving current time, stepping and playing change neither.
 */
export class SavedWindow {
  saved?: Span;
  /** Windows asked to be saved and not yet confirmed by the host, oldest first. */
  private pending: Span[] = [];
  /** The saved window before them, which the host may still report meanwhile. */
  private before?: Span;

  constructor(private readonly save: (window: Span) => void) {}

  /**
   * The host says what is saved. While saves the analyst asked for are on
   * their way, one of them, or the window saved before them, is no news:
   * the latest asked for stands. Anything else (a colleague's window) wins.
   */
  fromHost(saved: Span): void {
    if (this.pending.length) {
      const confirmed = this.pending.findIndex((p) => sameSpan(p, saved));
      if (confirmed >= 0) {
        this.pending.splice(0, confirmed + 1);
        this.before = saved;
        if (this.pending.length) return;
      } else if (this.before && sameSpan(this.before, saved)) return;
    }
    this.pending = [];
    this.before = undefined;
    this.saved = { ...saved };
  }

  /** What the cue says about the window shown, if anything. */
  cue(shown: Span): Beyond | undefined {
    return this.saved ? beyondSaved(shown, this.saved) : undefined;
  }

  /** Keep: save the window shown, through the normal path. */
  keep(shown: Span): void {
    this.asked(shown);
    this.save(shown);
  }

  private asked(window: Span): void {
    if (!this.pending.length) this.before = this.saved;
    this.pending.push({ ...window });
    this.saved = { ...window };
  }

  /** Revert: the saved window again, current time moved to its nearest edge. */
  revert(current: number): { window: Span; current: number } | undefined {
    if (!this.saved) return undefined;
    const window = atLeastMinimum(this.saved);
    return { window, current: clamp(current, window.start, window.end) };
  }

  /** The analyst let go of the window: it is saved as left, so the cue goes. */
  letGo(window: Span): void {
    this.asked(window);
  }
}
