/**
 * Host-neutral feature registration (review of 7 Nov 2026, finding 2): each shared feature
 * (webview/panels/flows/features.ts) registers its commands once, through the Host both front ends
 * give it; both VS Code's extension (src/extension.ts) and the playground (play/host.ts) call every
 * feature's register function, and neither registers one of its commands by hand, so both register
 * the same command set. The features' commands are then run against a recording fake host.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TmaRequest } from "@debrief/schemas";
import { FEATURE_COMMANDS, FEATURES, type Feature } from "../../webview/panels/flows/features.js";
import { BEARINGS_COMMANDS, CHOOSE_CUTS, registerBearings, SELECT_SOLUTION, SET_TIME, type TmaHost } from "../../webview/panels/flows/bearings.js";
import { commandsOf, type Host, type Run } from "../../webview/panels/flows/register.js";

const vscodeDir = path.resolve(__dirname, "..", "..");
const read = (file: string) => readFileSync(path.join(vscodeDir, file), "utf8");

/** A host that records what is registered with it. */
function recording(): Host & { runs: Map<string, Run> } {
  const runs = new Map<string, Run>();
  return {
    runs,
    command: (id, run) => {
      expect(runs.has(id), `${id} registered twice`).toBe(false);
      runs.set(id, run);
    },
  };
}
/** A feature's own host that does nothing, for registering alone. */
const inert = new Proxy({}, { get: () => () => undefined }) as never;
const registered = (feature: Feature): string[] => {
  const host = recording();
  feature.register(host, inert);
  return [...host.runs.keys()];
};

/** The hosts, and what each registers by hand: VS Code's command("…") calls, the playground's action table's entries. */
const HOSTS = [
  { file: "src/extension.ts", byHand: (source: string) => [...source.matchAll(/\bcommand\(\s*"(debrief\.[^"]+)"/g)].map((m) => m[1]) },
  {
    file: "play/host.ts",
    byHand: (source: string) => {
      const table = source.slice(source.indexOf("const PLAY_ACTIONS"), source.indexOf("\n};\n", source.indexOf("const PLAY_ACTIONS")));
      return [...table.matchAll(/^ {2}"(debrief\.[^"]+)":/gm)].map((m) => m[1]);
    },
  },
];
/** The features a host's source registers: those whose register function it calls, once. */
const featuresIn = (source: string) => FEATURES.filter((f) => source.split(new RegExp(`\\b${f.register.name}\\(`)).length === 2);

describe("feature registration", () => {
  it("registers each feature's commands, once each, under the ids it declares", () => {
    for (const feature of FEATURES) expect(registered(feature)).toEqual(commandsOf(feature.commands));
    expect(new Set(FEATURE_COMMANDS).size).toBe(FEATURE_COMMANDS.length);
  });

  it("is called by both hosts for every feature, and neither registers a feature's command by hand", () => {
    for (const { file, byHand } of HOSTS) {
      const source = read(file);
      expect(
        featuresIn(source).map((f) => f.name),
        file,
      ).toEqual(FEATURES.map((f) => f.name));
      const hand = byHand(source);
      expect(hand.length, `${file}'s own commands are found`).toBeGreaterThan(10);
      expect(
        hand.filter((id) => FEATURE_COMMANDS.includes(id)),
        file,
      ).toEqual([]);
    }
  });

  it("gives both hosts the same command set through it", () => {
    const [vscode, play] = HOSTS.map(({ file }) => featuresIn(read(file)).flatMap(registered).sort());
    expect(vscode).toEqual(play);
    expect(vscode).toEqual([...FEATURE_COMMANDS].sort());
  });
});

// --- Bearings and TMA ------------------------------------------------------------------------------

type Call = [string, ...unknown[]];
function tmaHost(over: Partial<TmaHost> = {}): { calls: Call[]; run: (id: string, ...args: unknown[]) => Promise<unknown> } {
  const calls: Call[] = [];
  const record =
    (name: string, answer?: unknown) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return answer;
    };
  const impl: TmaHost = {
    message: (severity, text) => (calls.push(["message", severity, text]), Promise.resolve(undefined)),
    show: record("show"),
    popOut: record("popOut"),
    bringBack: record("bringBack"),
    focusWindow: record("focusWindow"),
    idOf: (target) => (typeof target === "string" ? target : target?.ids?.[0]),
    solutionOf: (target) => (typeof target === "string" ? target : target?.ids?.[0]),
    currentTime: () => "2026-10-11T09:30:00Z",
    runOperation: record("runOperation", { notes: [] }),
    create: async (request) => (calls.push(["create", request]), { feature: "solution-1", notes: ["made"] }),
    splitLeg: async (...args) => (calls.push(["splitLeg", ...args]), { notes: ["split"] }),
    exclude: async (...args) => (calls.push(["exclude", ...args]), { changed: true, notes: [] }),
    ...over,
  };
  const host = recording();
  registerBearings(host, impl);
  return { calls, run: async (id, ...args) => (host.runs.get(id) as (...a: unknown[]) => unknown)(...args) };
}

describe("Bearings and TMA's commands", () => {
  it("show Bearings on the row given, or its Target's first, with the focus asked", async () => {
    const { calls, run } = tmaHost();
    await run(BEARINGS_COMMANDS.show, "sensor-1", { cut_time: "2026-10-11T09:30:00Z" });
    await run(BEARINGS_COMMANDS.show, { ids: ["solution-1"] });
    await run(BEARINGS_COMMANDS.popOut);
    await run(BEARINGS_COMMANDS.bringBack);
    await run(BEARINGS_COMMANDS.focusWindow);
    expect(calls).toEqual([["show", "sensor-1", { cut_time: "2026-10-11T09:30:00Z" }], ["show", "solution-1", undefined], ["popOut"], ["bringBack"], ["focusWindow"]]);
  });

  it("make a solution from a request, one step, or without one run TMA solution from cuts… on the selection", async () => {
    const { calls, run } = tmaHost();
    const request = { sensor_id: "sensor-1" } as unknown as TmaRequest;
    expect(await run(BEARINGS_COMMANDS.create, request)).toEqual({ feature: "solution-1", notes: ["made"] });
    expect(await run(BEARINGS_COMMANDS.create)).toEqual({ notes: [] });
    expect(calls).toEqual([["create", request], ["runOperation", "tma-from-cuts"]]);
  });

  it("say the service's problem as a warning, and return it", async () => {
    const { calls, run } = tmaHost({ create: async () => ({ problem: "No cuts in that period." }), exclude: async () => ({ problem: "Changed elsewhere." }) });
    expect(await run(BEARINGS_COMMANDS.create, {})).toEqual({ problem: "No cuts in that period." });
    expect(await run(BEARINGS_COMMANDS.exclude, "solution-1", ["cut-1"])).toEqual({ problem: "Changed elsewhere." });
    expect(calls).toEqual([
      ["message", "warning", "No cuts in that period."],
      ["message", "warning", "Changed elsewhere."],
    ]);
  });

  it("split a solution at current time, or the time given, or join; refusing without one solution or a time", async () => {
    const { calls, run } = tmaHost();
    expect(await run(BEARINGS_COMMANDS.splitLeg, { ids: ["solution-1"] })).toEqual({ notes: ["split"] });
    await run(BEARINGS_COMMANDS.splitLeg, "solution-1", { at: "2026-10-11T09:40:00Z", join: true });
    expect(await run(BEARINGS_COMMANDS.splitLeg, { ids: [] })).toEqual({ problem: SELECT_SOLUTION });
    const untimed = tmaHost({ currentTime: () => undefined });
    expect(await untimed.run(BEARINGS_COMMANDS.splitLeg, "solution-1")).toEqual({ problem: SET_TIME });
    expect(calls).toEqual([
      ["splitLeg", "solution-1", "2026-10-11T09:30:00Z", false],
      ["splitLeg", "solution-1", "2026-10-11T09:40:00Z", true],
      ["message", "warning", SELECT_SOLUTION],
    ]);
    expect(untimed.calls).toEqual([["message", "warning", SET_TIME]]);
  });

  it("leave cuts out of a solution's RMS or count them in, refusing without cuts", async () => {
    const { calls, run } = tmaHost();
    expect(await run(BEARINGS_COMMANDS.exclude, "solution-1", ["cut-1", "cut-2"])).toEqual({ changed: true, notes: [] });
    await run(BEARINGS_COMMANDS.exclude, "solution-1", ["cut-1"], false);
    expect(await run(BEARINGS_COMMANDS.exclude, "solution-1", [])).toEqual({ problem: CHOOSE_CUTS });
    expect(calls).toEqual([
      ["exclude", "solution-1", ["cut-1", "cut-2"], true],
      ["exclude", "solution-1", ["cut-1"], false],
      ["message", "warning", CHOOSE_CUTS],
    ]);
  });
});
