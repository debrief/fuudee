/**
 * The message glue between the webview components and their host, shared by both front ends
 * (PAR-13, docs/panel-parity-srd.md): what each component's page sends, and what each host's
 * receiver does with it. Every message is checked (CON-08); one a component's page never sends,
 * or one that fails the check, is refused and handled by nothing.
 */
import { describe, expect, it } from "vitest";
import { checkMessage } from "../../src/messages.js";
import {
  bearingsEvents,
  coverageEvents,
  receiveAnnotation,
  receiveBearings,
  receiveCoverage,
  receiveForm,
  receiveMap,
  receiveResults,
  receiveTime,
  receiveTimeline,
  receiveTote,
  SENT,
  timeEvents,
  timelineEvents,
  toteEvents,
  type Component,
} from "../../webview/dispatch.js";
import table from "../../../schemas/vectors/webview-messages.json";

/** A handler table that records each call, by its name and arguments. */
function recorder<H extends object>(): { handlers: H; calls: [string, ...unknown[]][] } {
  const calls: [string, ...unknown[]][] = [];
  const handlers = new Proxy({} as H, { get: (_t, name) => (...args: unknown[]) => void calls.push([String(name), ...args]) });
  return { handlers, calls };
}
const TIME = { current: "2023-06-15T09:00:00.000Z", range: { start: "2023-06-15T08:00:00.000Z", end: "2023-06-15T12:00:00.000Z" } };
const SOURCE = { catalogue: "c", item: "i", track: "t", name: "BLUE ONE" };

describe("the shared message glue (PAR-13)", () => {
  it("lists only message kinds the schema has", () => {
    const kinds = Object.keys(table.members);
    for (const sent of Object.values(SENT)) for (const kind of sent) expect(kinds, kind).toContain(kind);
  });

  it("sends the time controller's moves, saves and play as messages its receiver hands on", async () => {
    const { handlers, calls } = recorder<Parameters<typeof receiveTime>[0]>();
    const refused: Component[] = [];
    const receive = receiveTime(handlers, checkMessage, (c) => void refused.push(c));
    const sent: Record<string, unknown>[] = [];
    const events = timeEvents((m) => void sent.push(m));
    events.moved(TIME);
    events.windowSaved(TIME.range);
    events.playing!(true);
    for (const m of sent) await receive(m);
    expect(calls).toEqual([["timeChanged", TIME], ["windowChanged", TIME.range], ["playingChanged", true]]);
    expect(refused).toEqual([]);
  });

  it("hands Coverage's choices on as the collation flow's asks", async () => {
    const { handlers, calls } = recorder<Parameters<typeof receiveCoverage>[0]>();
    const receive = receiveCoverage(handlers, checkMessage, () => undefined);
    const events = coverageEvents((m) => void receive(m));
    const item = { catalogue: "c", item: "i", revision: `sha256:${"1".repeat(64)}` };
    events.choose("track-blue-one", TIME.range, SOURCE);
    events.link("track-blue-one", SOURCE, false);
    events.take(item);
    events.dismiss(item);
    events.reviewed();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.map((c) => (c[1] as { kind: string }).kind)).toEqual(["prefer", "link", "take", "dismiss", "reviewed"]);
    expect(calls[1][1]).toEqual({ kind: "link", feature: "track-blue-one", source: SOURCE, linked: false });
  });

  it("round-trips the Tote's, the Timeline's and Bearings' callbacks", async () => {
    const tote = recorder<Parameters<typeof receiveTote>[0]>();
    toteEvents((m) => void receiveTote(tote.handlers, checkMessage, () => undefined)(m)).changed({ primary: "track-blue-one", secondaries: ["track-red-one"] });
    const timeline = recorder<Parameters<typeof receiveTimeline>[0]>();
    const toTimeline = timelineEvents((m) => void receiveTimeline(timeline.handlers, checkMessage, () => undefined)(m));
    toTimeline.choose("n1");
    toTimeline.remove("n1");
    toTimeline.history!("redo");
    const bearings = recorder<Parameters<typeof receiveBearings>[0]>();
    const toBearings = bearingsEvents((m) => void receiveBearings(bearings.handlers, checkMessage, () => undefined)(m));
    toBearings.select("cut-1", TIME.current);
    toBearings.menu!("cut-1", TIME.current, 10, 20);
    toBearings.split("sol", TIME.current);
    await new Promise((r) => setTimeout(r, 0));
    expect(tote.calls).toEqual([["toteChanged", { primary: "track-blue-one", secondaries: ["track-red-one"] }]]);
    expect(timeline.calls).toEqual([["chosen", "n1"], ["remove", "n1"], ["history", "redo"]]);
    expect(bearings.calls).toEqual([["select", "cut-1", TIME.current], ["menu", "cut-1", TIME.current], ["split", "sol", TIME.current]]);
  });

  it("tells the map's two kinds of annotation edit apart, and its image or why there is none", async () => {
    const { handlers, calls } = recorder<Parameters<typeof receiveMap>[0]>();
    const receive = receiveMap(handlers, checkMessage, () => undefined);
    await receive({ kind: "edit_annotation", feature_id: "a1" });
    await receive({ kind: "selection_changed", selection: { plot: "p", feature_ids: ["track-blue-one"] } });
    await receive({ kind: "image_rendered", message: "The map was closed." });
    expect(calls).toEqual([["annotationChosen", "a1"], ["selected", ["track-blue-one"]], ["imageRendered", { problem: "The map was closed." }]]);
  });

  it("refuses a message that fails the check, or that the component's page never sends; handles nothing", async () => {
    const refused: Component[] = [];
    const { handlers, calls } = recorder<Parameters<typeof receiveForm>[0]>();
    const receive = receiveForm(handlers, checkMessage, (c) => void refused.push(c));
    await receive({ kind: "no_such_kind" });
    await receive({ kind: "time_changed", time: TIME }); // the map's, never the form's
    await receive({ kind: "time_changed", time: { ...TIME, current: "2023-06-15T13:00:00.000Z" } }); // outside its range
    await receive({ kind: "run_tool", tool_name: "core.range_rings", parameters: [] });
    expect(refused).toEqual(["form", "form", "form"]);
    expect(calls).toEqual([["run", "core.range_rings", []]]);
    const annotation = recorder<Parameters<typeof receiveAnnotation>[0]>();
    await receiveAnnotation(annotation.handlers, checkMessage, () => undefined)({ kind: "delete_annotation", feature_id: "a1" });
    expect(annotation.calls).toEqual([["remove", "a1"]]);
    const results = recorder<Parameters<typeof receiveResults>[0]>();
    await receiveResults(results.handlers, checkMessage, () => undefined)({ kind: "ready" });
    expect(results.calls).toEqual([["ready"]]);
  });
});
