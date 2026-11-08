/**
 * What jsdom lacks for the webview's controls (vitest.workspace.ts, the webview project):
 *
 * - A 2D canvas context that draws nothing and records each call and each property set, so a
 *   test can say what was drawn (`drawn(canvas)`) without a browser. Text is 6 px a character.
 * - A ResizeObserver the test drives: `resized(element)` calls every observer watching it, as
 *   the browser would after a layout.
 * - PointerEvent, which jsdom lacks, as a MouseEvent with a pointer id.
 * - Element sizes: jsdom lays nothing out, so `sized(element, { width, height })` says what
 *   clientWidth, clientHeight and offsetHeight read.
 */
import { afterEach } from "vitest";

export interface DrawCall {
  name: string;
  args: unknown[];
}

const contexts = new WeakMap<HTMLCanvasElement, { calls: DrawCall[]; context: CanvasRenderingContext2D }>();

function recordingContext(canvas: HTMLCanvasElement): { calls: DrawCall[]; context: CanvasRenderingContext2D } {
  const calls: DrawCall[] = [];
  const state: Record<string, unknown> = { canvas, font: "10px sans-serif", globalAlpha: 1, lineWidth: 1 };
  const context = new Proxy(state, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key === "measureText") return (text: string) => ({ width: text.length * 6 });
      if (key === "getLineDash") return () => [];
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ name: key, args });
      };
    },
    set(target, key, value) {
      if (typeof key !== "string") return false;
      target[key] = value;
      calls.push({ name: `${key}=`, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { calls, context };
}

HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
  if (kind !== "2d") return null;
  let entry = contexts.get(this);
  if (!entry) contexts.set(this, (entry = recordingContext(this)));
  return entry.context;
} as HTMLCanvasElement["getContext"];

/** Every call made on a canvas's 2D context since it was made, or since `drawn(canvas, true)`. */
export function drawn(canvas: HTMLCanvasElement, clear = false): DrawCall[] {
  const entry = contexts.get(canvas);
  const calls = entry ? [...entry.calls] : [];
  if (clear && entry) entry.calls.length = 0;
  return calls;
}

const observers = new Set<FakeResizeObserver>();

class FakeResizeObserver {
  readonly watched = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {
    observers.add(this);
  }
  observe(target: Element): void {
    this.watched.add(target);
  }
  unobserve(target: Element): void {
    this.watched.delete(target);
  }
  disconnect(): void {
    this.watched.clear();
    observers.delete(this);
  }
  fire(target: Element): void {
    if (this.watched.has(target)) this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}
globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;

/** The browser's layout changed an element's size: each observer watching it is called. */
export function resized(element: Element): void {
  for (const observer of [...observers]) observer.fire(element);
}

/** What jsdom reads as an element's laid-out size. */
export function sized(element: HTMLElement, size: { width?: number; height?: number }): void {
  if (size.width !== undefined) Object.defineProperty(element, "clientWidth", { configurable: true, get: () => size.width });
  if (size.height !== undefined) {
    Object.defineProperty(element, "clientHeight", { configurable: true, get: () => size.height });
    Object.defineProperty(element, "offsetHeight", { configurable: true, get: () => size.height });
  }
}

// jsdom has no PointerEvent: a MouseEvent with a pointer's id.
if (!globalThis.PointerEvent) {
  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  globalThis.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
}

afterEach(() => {
  for (const observer of [...observers]) observer.disconnect();
  document.body.innerHTML = "";
});
