/**
 * Press and hold on a touch screen: the right-click of a tablet (EXT-14, NFR-13).
 *
 * A finger or pen held still on the map for HOLD_MS is a hold; the map then treats it as
 * a right-click where the finger is. Anything else is not a hold: lifting the finger
 * sooner (a tap, which selects), moving it more than HOLD_TOLERANCE_PX (a pan or a
 * drag), a second finger landing (a pinch), or the map moving under it.
 *
 * Kept free of Leaflet and the DOM so the timing and movement rules can be tested on
 * their own; map.ts feeds it pointer events and acts when it fires.
 */

/** How long a finger is held still before it is a hold: as long-press menus elsewhere. */
export const HOLD_MS = 550;
/** How far a finger may wander, in screen pixels, and still be held still. */
export const HOLD_TOLERANCE_PX = 10;

export interface HoldTimers {
  set(fire: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realTimers: HoldTimers = {
  set: (fire, ms) => setTimeout(fire, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class PressHold {
  /** Fingers or pens down now, by pointer id. */
  private readonly down = new Set<number>();
  private start?: { id: number; x: number; y: number };
  private timer?: unknown;
  private held = false;

  constructor(
    private readonly onHold: (x: number, y: number) => void,
    private readonly timers: HoldTimers = realTimers,
    private readonly delay = HOLD_MS,
    private readonly tolerance = HOLD_TOLERANCE_PX,
  ) {}

  /** A finger or pen touched. The first starts a hold; another one landing is a pinch, not a hold. */
  press(id: number, x: number, y: number): void {
    this.down.add(id);
    if (this.down.size > 1) {
      this.cancel();
      return;
    }
    this.held = false;
    this.start = { id, x, y };
    this.timer = this.timers.set(() => this.fire(), this.delay);
  }

  /** The finger moved: further than the tolerance from where it touched, it is not held still. */
  move(id: number, x: number, y: number): void {
    if (!this.start || id !== this.start.id) return;
    if (Math.hypot(x - this.start.x, y - this.start.y) > this.tolerance) this.cancel();
  }

  /** A finger or pen lifted (or the browser took it away). */
  release(id: number): void {
    this.down.delete(id);
    if (this.start?.id === id) this.cancel();
  }

  /** Not a hold after all: the map moved, or the browser handled it. */
  cancel(): void {
    if (this.timer !== undefined) this.timers.clear(this.timer);
    this.timer = undefined;
    this.start = undefined;
  }

  /** Forget every finger: a mouse took over, so nothing is pressed by touch. */
  reset(): void {
    this.cancel();
    this.down.clear();
    this.held = false;
  }

  /** Whether a finger or pen is down now. */
  get pressing(): boolean {
    return this.down.size > 0;
  }

  /** Whether the last press became a hold: the tap or right-click the browser sends after it is the same gesture, not another. */
  get fired(): boolean {
    return this.held;
  }

  private fire(): void {
    const start = this.start;
    this.timer = undefined;
    this.start = undefined;
    if (!start) return;
    this.held = true;
    this.onHold(start.x, start.y);
  }
}
