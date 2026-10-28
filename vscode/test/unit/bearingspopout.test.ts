import { describe, expect, it, vi } from "vitest";
import type { AmbiguityResolution } from "@debrief/schemas";
import { BearingsView, type BearingsAct, type BearingsSurface, type BearingsWhere } from "../../src/panels/bearingsview.js";
import { placeholderHtml } from "../../src/panels/bearingsplaceholder.js";
import { Session } from "../../src/session.js";

// Bearings popped out (product owner, 28 Oct 2026): one controller drives either surface, the
// panel's WebviewView or a WebviewPanel in a window of its own, one live at a time.

/** A surface standing in for a WebviewView or a WebviewPanel: what its page was sent. */
function surface(where: BearingsWhere) {
  const sent: Record<string, unknown>[] = [];
  const shown: boolean[] = [];
  const s = {
    where,
    sent,
    shown,
    visible: true as boolean,
    post: (message: unknown) => {
      sent.push(message as Record<string, unknown>);
      return Promise.resolve(true);
    },
    show: (preserveFocus: boolean) => void shown.push(preserveFocus),
  } satisfies BearingsSurface & { sent: unknown[]; shown: boolean[] };
  return s;
}

function controller() {
  const session = new Session();
  const act = {
    create: vi.fn(async () => ({})),
    guess: vi.fn(),
    exclude: vi.fn(async () => undefined),
    split: vi.fn(async () => undefined),
    resolve: vi.fn(async () => undefined),
    resolveCuts: vi.fn(async (_: AmbiguityResolution) => undefined),
    select: vi.fn(),
    cutOff: vi.fn(),
    errorCutOff: 3,
  } satisfies BearingsAct;
  const logged: string[] = [];
  const view = new BearingsView(session, { cuts: async () => [], residuals: async () => undefined }, act, (line) => logged.push(line));
  return { session, act, view, logged };
}

const range = { start: "2023-06-15T08:00:00.000Z", end: "2023-06-15T12:00:00.000Z" };
const at = (current: string) => ({ current, range });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const kinds = (s: { sent: Record<string, unknown>[] }) => s.sent.map((m) => m.kind);
const box = { kind: "tma_resolve", resolution: { keep: "bearing", cut_ids: ["cut-1"], other_cut_ids: ["cut-1", "cut-2"] } };

describe("one controller drives Bearings in the panel or popped out", () => {
  it("drives the panel's view once its page is ready", async () => {
    const { session, view } = controller();
    const panel = surface("panel");
    view.attach(panel);
    expect(view.where).toBe("panel");
    session.setTime(at("2023-06-15T09:00:00.000Z"), "map");
    expect(panel.sent).toEqual([]); // not ready yet
    await view.receive({ kind: "ready" }, panel);
    expect(view.showing).toBe(true);
    expect(panel.sent.at(-1)).toEqual({ kind: "set_time", time: at("2023-06-15T09:00:00.000Z") });
    session.setTime(at("2023-06-15T09:30:00.000Z"), "map");
    expect(panel.sent.at(-1)).toEqual({ kind: "set_time", time: at("2023-06-15T09:30:00.000Z") });
    await flush();
    expect(view.posted.get("set_time")).toMatchObject({ where: "panel", delivered: true });
  });

  it("popped out, drives the window alone: time goes there, and only its page's asks are acted on", async () => {
    const { session, act, view, logged } = controller();
    const panel = surface("panel");
    view.attach(panel);
    await view.receive({ kind: "ready" }, panel);
    const window = surface("window");
    view.attach(window);
    expect(view.where).toBe("window");
    expect(view.poppedOut).toBe(true);
    expect(view.showing).toBe(false); // the window's page not ready yet
    await view.receive({ kind: "ready" }, window);
    const before = panel.sent.length;
    session.setTime(at("2023-06-15T10:00:00.000Z"), "time");
    expect(window.sent.at(-1)).toEqual({ kind: "set_time", time: at("2023-06-15T10:00:00.000Z") });
    expect(panel.sent.length).toBe(before); // the placeholder is sent nothing
    // The plot closed: said to the window.
    session.setPlot(undefined);
    expect(kinds(window).at(-1)).toBe("show_tma");
    // A box drawn in the window: one step asked for, once.
    await view.receive(box, window);
    expect(act.resolveCuts).toHaveBeenCalledTimes(1);
    expect(act.resolveCuts).toHaveBeenCalledWith(box.resolution);
    // The panel's page, about to become the placeholder, is not acted on.
    await view.receive(box, panel);
    expect(act.resolveCuts).toHaveBeenCalledTimes(1);
    expect(logged.at(-1)).toMatch(/not_live/);
    // Keep a side, leave out, split and the cut-off: each acted on from the window, as from the panel.
    await view.receive({ kind: "resolve_asked", feature_id: "cut-1", keep: "bearing" }, window);
    await view.receive({ kind: "tma_exclude", feature_id: "s", cut_ids: ["cut-1"], excluded: true }, window);
    await view.receive({ kind: "tma_split", feature_id: "s", current_time: "2023-06-15T10:00:00.000Z" }, window);
    await view.receive({ kind: "tma_cut_off", error_cut_off: 2.5 }, window);
    expect([act.resolve, act.exclude, act.split, act.cutOff].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it("closed, the window gives Bearings back to the panel, live once its page is ready again", async () => {
    const { session, view } = controller();
    const panel = surface("panel");
    const window = surface("window");
    view.attach(panel);
    view.attach(window);
    await view.receive({ kind: "ready" }, window);
    view.detach(window);
    expect(view.where).toBe("panel");
    expect(view.poppedOut).toBe(false);
    expect(view.showing).toBe(false);
    session.setTime(at("2023-06-15T11:00:00.000Z"), "map");
    expect(panel.sent).toEqual([]);
    await view.receive({ kind: "ready" }, panel);
    expect(panel.sent.at(-1)).toEqual({ kind: "set_time", time: at("2023-06-15T11:00:00.000Z") });
    // A window's message after it closed is not acted on.
    await view.receive({ kind: "tma_cut_off", error_cut_off: 1 }, window);
    expect(view.where).toBe("panel");
  });

  it("the panel made again while popped out leaves the window live", async () => {
    const { view } = controller();
    const window = surface("window");
    view.attach(window);
    await view.receive({ kind: "ready" }, window);
    view.attach(surface("panel"));
    expect(view.where).toBe("window");
    expect(view.showing).toBe(true);
  });

  it("reveals whichever surface is live; with none, opens the panel's view", async () => {
    const { view } = controller();
    const opened: boolean[] = [];
    view.open = async (preserveFocus) => void opened.push(preserveFocus);
    await view.reveal(false);
    expect(opened).toEqual([false]);
    const panel = surface("panel");
    const window = surface("window");
    view.attach(panel);
    view.attach(window);
    await view.reveal(false);
    expect(window.shown).toEqual([false]);
    expect(panel.shown).toEqual([]);
    // Already in sight and the keyboard left where it is: nothing to do.
    await view.reveal();
    expect(window.shown).toEqual([false]);
    window.visible = false;
    await view.reveal();
    expect(window.shown).toEqual([false, true]);
  });

  it("remembers the panes the page shows, for the next page opened", async () => {
    const { view } = controller();
    const panel = surface("panel");
    view.attach(panel);
    await view.receive({ kind: "tma_panes", panes_shown: ["bearing", "course"] }, panel);
    expect(view.panes).toEqual({ bearing: true, error: false, course: true });
    await view.receive({ kind: "tma_panes", panes_shown: [] }, panel); // refused: one at least
    expect(view.panes).toEqual({ bearing: true, error: false, course: true });
  });
});

describe("the panel's placeholder while popped out", () => {
  it("says where Bearings is, with Bring back and Focus that window, and no script", () => {
    const html = placeholderHtml(true);
    expect(html).toContain("Bearings is open in its own window.");
    expect(html).toContain('href="command:debrief.bringBackBearings"');
    expect(html).toContain('href="command:debrief.focusBearingsWindow"');
    expect(html).toContain("Focus that window");
    expect(html).not.toMatch(/<script/);
    expect(placeholderHtml(false)).toContain("Bearings is open in an editor tab of its own.");
  });
});
