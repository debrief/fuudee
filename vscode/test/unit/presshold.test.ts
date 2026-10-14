import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS, HOLD_TOLERANCE_PX, PressHold } from "../../webview/presshold.js";

describe("press and hold on a touch screen is a right-click (EXT-14, NFR-13)", () => {
  let holds: [number, number][];
  let hold: PressHold;
  beforeEach(() => {
    vi.useFakeTimers();
    holds = [];
    hold = new PressHold((x, y) => holds.push([x, y]));
  });
  afterEach(() => vi.useRealTimers());

  it("fires once, where the finger touched, after it is held still long enough", () => {
    hold.press(1, 100, 200);
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(holds).toEqual([]);
    expect(hold.pressing).toBe(true);
    vi.advanceTimersByTime(1);
    expect(holds).toEqual([[100, 200]]);
    expect(hold.fired).toBe(true);
    vi.advanceTimersByTime(5 * HOLD_MS);
    hold.release(1);
    expect(holds).toHaveLength(1);
    expect(hold.pressing).toBe(false);
    expect(hold.fired).toBe(true); // until the next press: the click after it is the same gesture
  });

  it("is about half a second, a finger's width of wander", () => {
    expect(HOLD_MS).toBeGreaterThanOrEqual(500);
    expect(HOLD_MS).toBeLessThanOrEqual(600);
    expect(HOLD_TOLERANCE_PX).toBe(10);
  });

  it("a tap is not a hold", () => {
    hold.press(1, 100, 200);
    vi.advanceTimersByTime(200);
    hold.release(1);
    vi.advanceTimersByTime(HOLD_MS);
    expect(holds).toEqual([]);
    expect(hold.fired).toBe(false);
  });

  it("a finger that wanders within the tolerance is still held; beyond it, it is a pan", () => {
    hold.press(1, 100, 200);
    hold.move(1, 106, 208); // 10 px away
    vi.advanceTimersByTime(HOLD_MS);
    expect(holds).toEqual([[100, 200]]);
    hold.release(1);

    hold.press(1, 100, 200);
    expect(hold.fired).toBe(false);
    hold.move(1, 108, 207); // just over 10 px
    hold.move(1, 100, 200); // coming back does not make it a hold again
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(holds).toHaveLength(1);
  });

  it("a second finger landing is a pinch, not a hold, even after the first lifts", () => {
    hold.press(1, 100, 200);
    vi.advanceTimersByTime(200);
    hold.press(2, 300, 200);
    vi.advanceTimersByTime(HOLD_MS);
    hold.release(2);
    vi.advanceTimersByTime(HOLD_MS);
    expect(holds).toEqual([]);
    hold.release(1);
    hold.press(1, 100, 200); // a fresh press afterwards holds as usual
    vi.advanceTimersByTime(HOLD_MS);
    expect(holds).toEqual([[100, 200]]);
  });

  it("the map moving, or the browser taking the finger, cancels it", () => {
    hold.press(1, 100, 200);
    vi.advanceTimersByTime(300);
    hold.cancel(); // movestart, zoomstart, or the browser's own right-click arrived first
    vi.advanceTimersByTime(HOLD_MS);
    expect(holds).toEqual([]);
    expect(hold.pressing).toBe(true);
    hold.release(1);

    hold.press(7, 100, 200);
    hold.release(7); // pointercancel is a release
    vi.advanceTimersByTime(HOLD_MS);
    expect(holds).toEqual([]);
  });

  it("another finger's movement does not cancel the one held", () => {
    hold.press(1, 100, 200);
    hold.move(9, 400, 400);
    vi.advanceTimersByTime(HOLD_MS);
    expect(holds).toEqual([[100, 200]]);
  });

  it("a mouse taking over forgets every finger", () => {
    hold.press(1, 100, 200);
    vi.advanceTimersByTime(HOLD_MS);
    expect(hold.fired).toBe(true);
    hold.reset();
    expect(hold.fired).toBe(false);
    expect(hold.pressing).toBe(false);
    hold.press(2, 0, 0); // a finger missed lifting (its pointerup lost) does not make this a pinch
    vi.advanceTimersByTime(HOLD_MS);
    expect(holds).toHaveLength(2);
  });
});
