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

/**
 * The window with one edge moved to a time, kept within the extent and never
 * ending before it starts. Whole seconds: the window is saved as the analyst
 * reads it.
 */
export function moveEdge(window: Span, extent: Span, edge: "start" | "end", to: number): Span {
  const at = Math.round(to / SECOND) * SECOND;
  if (edge === "start") return { start: clamp(at, extent.start, window.end), end: window.end };
  return { start: window.start, end: clamp(at, window.start, extent.end) };
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

export function describeSpeed(speed: number): string {
  const plot = speed * SECOND;
  return `${speed}× real time: ${plot >= MINUTE ? describeStep(plot) : `${speed} s`} of the plot each second`;
}

/** How often playing moves current time: ten times a second, smooth enough to follow without flooding the views. */
export const TICK_MS = 100;

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
    if (this.playing || !at || at.window.end <= at.window.start) return;
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
