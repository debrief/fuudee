/**
 * A page's own startup marks, sent to the extension only when it asks for them
 * (the body's data-timing, set when DEBRIEF_STARTUP_TIMING is; src/startup.ts):
 * when the page began loading, when its script started, when it said it was
 * ready, and when it first drew a plot, a frame after it was shown one.
 * Imported first by each page, so "script" is before its other modules run.
 */
import { host } from "./vscode.js";

const on = document.body?.dataset.timing === "1";
const now = () => performance.timeOrigin + performance.now();
const marks: Record<string, number> = on ? { navigation: performance.timeOrigin, script: now() } : {};

/** The page is about to say it is ready. */
export function pageReady(): void {
  if (!on) return;
  marks.ready = now();
  host.postMessage({ startup_timing: { ...marks } });
}

/** The page was just shown something; content: a plot's, not that none is open. */
export function pageShown(content: boolean): void {
  if (!on || !content || marks.rendered) return;
  marks.rendered = -1;
  // The frame after: what was shown has been laid out and painted.
  requestAnimationFrame(() => {
    marks.rendered = now();
    host.postMessage({ startup_timing: { ...marks } });
  });
}
