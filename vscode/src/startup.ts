/**
 * How long Debrief takes to start, for the measurements in
 * docs/notes/webview-startup.md: the extension's activation, and for each webview
 * (the three sidebar views and the map) when VS Code asked for it, when its page
 * was set, when the page said it was ready, and when it was first shown something.
 *
 * The extension's own marks cost a clock read each and are always taken; tests and
 * agents read them through the API (startupTimings). The pages' own marks (when the
 * page began loading, when its script started, when it first drew a plot) are sent
 * only when DEBRIEF_STARTUP_TIMING is set: they are a message outside the webview
 * message schema, so they are never acted on, only recorded.
 *
 * Every time is in milliseconds since the extension host process started.
 */

/** Milliseconds since the Unix epoch, to a fraction of a millisecond; the pages use the same clock. */
const now = () => performance.timeOrigin + performance.now();

export interface StartupSnapshot {
  /** When the extension host process started, in milliseconds since the Unix epoch. */
  origin: number;
  /** For each of "extension", "debrief.time", "debrief.tote", "debrief.timeline", "map": each mark, the first time it happened. */
  marks: Record<string, Record<string, number>>;
}

class StartupTimings {
  /** Whether the pages send their own marks (DEBRIEF_STARTUP_TIMING). */
  readonly pages = !!process.env.DEBRIEF_STARTUP_TIMING;
  private readonly marks: Record<string, Record<string, number>> = {};

  /** Record that this happened to this view now, if it has not before. */
  mark(view: string, event: string, at = now()): void {
    const marks = (this.marks[view] ??= {});
    marks[event] ??= at;
  }

  /** A page was sent something to show: a plot's content, or that none is open. */
  shown(view: string, content: boolean): void {
    this.mark(view, "shown");
    if (content) this.mark(view, "content");
  }

  /** Record the page's own marks, if this message is them; true if it was, so it is not acted on. */
  fromPage(view: string, raw: unknown): boolean {
    if (!this.pages || !raw || typeof raw !== "object" || !("startup_timing" in raw)) return false;
    const marks = (raw as { startup_timing: unknown }).startup_timing;
    if (marks && typeof marks === "object") {
      for (const [event, at] of Object.entries(marks)) {
        if (typeof at === "number" && Number.isFinite(at)) this.mark(view, `page_${event}`, at);
      }
    }
    return true;
  }

  snapshot(): StartupSnapshot {
    const origin = performance.timeOrigin;
    const marks: Record<string, Record<string, number>> = {};
    for (const [view, events] of Object.entries(this.marks)) {
      marks[view] = Object.fromEntries(Object.entries(events).map(([event, at]) => [event, Math.round((at - origin) * 10) / 10]));
    }
    return { origin, marks };
  }
}

export const startup = new StartupTimings();
startup.mark("extension", "loaded");
