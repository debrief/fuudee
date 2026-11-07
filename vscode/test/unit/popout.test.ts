/**
 * The pop-out lifecycle both hosts share (webview/panels/popout.ts; review of 7 Nov 2026, finding 7):
 * popped out, popped out again (the window to the front), brought back, and closed by the analyst;
 * and both VS Code's PoppableView and the playground's Bearings run on it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PopOut, type PoppedWindow, type PopOutHost } from "../../webview/panels/popout.js";

type Window = PoppedWindow & { n: number };

function recorded(opens: (Window | undefined)[] = []) {
  const said: string[] = [];
  let n = 0;
  const window = (): Window => {
    const w: Window = { n: ++n, focus: () => said.push(`focus ${w.n}`), close: () => said.push(`close ${w.n}`) };
    return w;
  };
  const host: PopOutHost<Window> = {
    open: () => (opens.length ? opens.shift() : window()),
    poppedOut: (w) => void said.push(`out ${w.n}`),
    placed: async (w) => (said.push(`placed ${w.n}`), { where: "window" }),
    settled: (w, popped) => void said.push(`settled ${w.n} ${popped.where}`),
    cameBack: (w) => void said.push(`back ${w.n}`),
  };
  return { said, popOut: new PopOut(host) };
}

describe("a view popped out and brought back", () => {
  it("opens one window, brings it to the front when popped out again, and comes back when brought back", async () => {
    const { said, popOut } = recorded();
    expect(await popOut.popOut()).toEqual({ where: "window" });
    expect(await popOut.popOut()).toEqual({ where: "window" });
    popOut.focusWindow();
    popOut.bringBack();
    popOut.bringBack();
    expect(popOut.window).toBeUndefined();
    expect(said).toEqual(["out 1", "placed 1", "settled 1 window", "focus 1", "focus 1", "close 1", "back 1"]);
  });

  it("comes back when the window is closed any other way, once, ignoring a window no longer live", async () => {
    const { said, popOut } = recorded();
    await popOut.popOut();
    const first = popOut.window!;
    popOut.closed(first);
    popOut.closed(first);
    await popOut.popOut();
    popOut.closed(first);
    expect(popOut.window?.n).toBe(2);
    expect(said).toEqual(["out 1", "placed 1", "settled 1 window", "back 1", "out 2", "placed 2", "settled 2 window"]);
  });

  it("stays in the panel when no window could be opened", async () => {
    const { said, popOut } = recorded([undefined]);
    expect(await popOut.popOut()).toBeUndefined();
    expect(popOut.window).toBeUndefined();
    expect(said).toEqual([]);
  });

  it("is what both hosts' pop-outs run on", () => {
    const read = (file: string) => readFileSync(path.resolve(__dirname, "..", "..", file), "utf8");
    expect(read("src/panels/poppableview.ts")).toContain("new PopOut<");
    expect(read("play/host.ts")).toContain("new PopOut<");
  });
});
