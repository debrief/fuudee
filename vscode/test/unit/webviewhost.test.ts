import { describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

const created: { type: string; options: Record<string, unknown> }[] = [];
const registered: { id: string; options: unknown }[] = [];

/** A webview view or panel standing in for VS Code's: what its page was sent, and its dispose. */
function stand() {
  const sent: unknown[] = [];
  let disposed: (() => void) | undefined;
  let received: ((raw: unknown) => void) | undefined;
  const hosted = {
    sent,
    title: "",
    visible: true,
    webview: {
      options: {} as Record<string, unknown>,
      html: "",
      cspSource: "csp",
      asWebviewUri: (uri: unknown) => uri,
      postMessage: (message: unknown) => {
        sent.push(message);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: (listener: (raw: unknown) => void) => void (received = listener),
    },
    onDidDispose: (listener: () => void) => void (disposed = listener),
    dispose: () => disposed?.(),
    say: (raw: unknown) => received?.(raw),
  };
  return hosted;
}

vi.mock("vscode", () => ({
  Uri: { joinPath: (_base: unknown, ...parts: string[]) => parts.join("/") },
  ViewColumn: { One: 1, Beside: -2 },
  window: {
    createWebviewPanel: (type: string, _title: string, _column: unknown, options: Record<string, unknown>) => {
      created.push({ type, options });
      return stand();
    },
    registerWebviewViewProvider: (id: string, _provider: unknown, options: unknown) => {
      registered.push({ id, options });
      return { dispose: () => undefined };
    },
  },
}));

const { WebviewHost, RETAIN_CONTEXT_WHEN_HIDDEN, registerView } = await import("../../src/panels/webviewhost.js");

const extension = "ext" as unknown as vscode.Uri;
const time = { current: "2026-01-01T00:00:00.000Z", range: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T01:00:00.000Z" } };

describe("a webview's host (review 7 Nov 2026, finding 7)", () => {
  it("drops what is posted before the page is ready, as every host did, and posts after", () => {
    const received: unknown[] = [];
    const host = new WebviewHost(extension, { bundle: "time", receive: (raw) => received.push(raw) });
    const view = stand();
    host.resolve(view as unknown as vscode.WebviewView, "Time");
    expect(view.webview.options).toMatchObject({ enableScripts: true });
    expect(view.webview.html).toContain("time.js");
    expect(host.post({ kind: "set_time", time })).toBe(false);
    view.say({ kind: "ready" });
    expect(received).toEqual([{ kind: "ready" }]);
    host.readied();
    expect(host.ready).toBe(true);
    expect(host.post({ kind: "set_time", time })).toBe(true);
    expect(view.sent).toEqual([{ kind: "set_time", time }]);
  });

  it("checks what it posts against the schema", () => {
    const host = new WebviewHost(extension, { bundle: "time", receive: () => undefined });
    host.resolve(stand() as unknown as vscode.WebviewView, "Time");
    host.readied();
    expect(() => host.post({ kind: "set_time" } as never)).toThrow();
  });

  it("whenReady waits for the page, and gives up after the time asked", async () => {
    vi.useFakeTimers();
    try {
      const host = new WebviewHost(extension, { bundle: "map", receive: () => undefined });
      const panel = host.open("debrief.map", "Plot", 1);
      const ready = vi.fn();
      void host.whenReady(1000).then(ready);
      const late = host.whenReady(500);
      const lateResult = late.then(
        () => "ready",
        (error: Error) => error.message,
      );
      await vi.advanceTimersByTimeAsync(600);
      expect(await lateResult).toBe("The page was not ready in time.");
      host.readied();
      await vi.advanceTimersByTimeAsync(0);
      expect(ready).toHaveBeenCalledOnce();
      // Disposed: no longer ready, and a new page must say so again.
      panel.dispose();
      expect(host.ready).toBe(false);
      expect(host.target).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a page disposed of says so once, and only for the page it is", () => {
    const disposed = vi.fn();
    const host = new WebviewHost(extension, { bundle: "form", receive: () => undefined, disposed });
    const first = host.open("debrief.form", "Tool", -2);
    first.dispose();
    const second = host.open("debrief.form", "Tool", -2);
    first.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(host.target).toBe(second);
  });

  it("keeps a tool's form and its results while hidden, decided in one place", () => {
    created.length = 0;
    new WebviewHost(extension, { bundle: "form", receive: () => undefined }).open("debrief.form", "Tool", -2);
    new WebviewHost(extension, { bundle: "results", receive: () => undefined }).open("debrief.results", "Results", -2);
    expect(created.map((c) => c.options.retainContextWhenHidden)).toEqual([true, true]);
    registerView("debrief.time", {} as vscode.WebviewViewProvider);
    registerView("debrief.coverage", {} as vscode.WebviewViewProvider);
    expect(registered).toEqual([
      { id: "debrief.time", options: { webviewOptions: { retainContextWhenHidden: true } } },
      { id: "debrief.coverage", options: undefined },
    ]);
    expect(RETAIN_CONTEXT_WHEN_HIDDEN["debrief.annotation"]).toBe(true);
  });
});
