/**
 * The cross-host parity check (test/parity): its sequence is of shared commands only, and its
 * projection of a plot's file drops what legitimately differs between the hosts (when, who by
 * name, hashes) and nothing else. The check itself runs in both real hosts: VS Code's tracer
 * (test/integration/parity.ts) and the playground's harness (test/play/parity.mjs), and CI's
 * parity job compares what they wrote (compare.mjs).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURE_COMMANDS } from "../../webview/panels/flows/features.js";
import { DIFFERENCED, differences, LOOSE, normalise, STRICT, without } from "../parity/normalise.mjs";
import { KNOWN_DIFFERENCES, LEFT_OUT, SEQUENCE } from "../parity/sequence.mjs";

const vscodeDir = path.resolve(__dirname, "..", "..");

/** A plot's file with one step, made by an agent at a time, its hashes as they follow. */
function plotFile(agent: string, at: string, colour = "#00a000"): string {
  const record = { id: `edit-${at}`, kind: "edit", started_at: at, ended_at: at, agent: { kind: "person", name: agent }, notes: ["Colour of RED ONE set to green"] };
  return JSON.stringify({
    type: "FeatureCollection",
    schema_version: "0.0.24",
    features: [
      { type: "Feature", id: "track-red-one", properties: { kind: "track", name: "RED ONE", colour }, geometry: { type: "LineString", coordinates: [[-75.5, 37.1], [-75.4, 37.2]] } },
      { type: "Feature", id: "plot", properties: { kind: "plot", title: "Serial 1", view: { context_tracks: "faint" } }, geometry: null },
    ],
    named_sets: [],
    provenance: [record],
    history: { current: 2, head_hash: `sha256:${at}`, steps: [{ seq: 2, state: "applied", after: 1, result_hash: `sha256:${at}`, records: [record] }] },
  });
}

describe("the cross-host parity check", () => {
  it("runs shared commands only, each from a shared feature, as do those it leaves out", () => {
    for (const step of SEQUENCE) expect(FEATURE_COMMANDS, step.command).toContain(step.command);
    // A command left out is named with why; one in the sequence is not also left out.
    const left = LEFT_OUT.flatMap((l) => l.command.split(/,\s*/).map((c) => c.split(" ")[0]));
    for (const step of SEQUENCE) expect(left).not.toContain(step.command);
    for (const l of LEFT_OUT) expect(l.why.length).toBeGreaterThan(20);
    // Each known difference says why.
    for (const d of KNOWN_DIFFERENCES) expect(d.why.length).toBeGreaterThan(20);
  });

  it("is played by both hosts' harnesses and compared in CI", () => {
    const ci = readFileSync(path.join(vscodeDir, "..", ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).toContain("test/parity/compare.mjs");
    expect(readFileSync(path.join(vscodeDir, "test/integration/suite.ts"), "utf8")).toMatch(/\bparity\(\)/);
    expect(readFileSync(path.join(vscodeDir, "test/play/play.mjs"), "utf8")).toMatch(/\bplayParity\(page\)/);
  });

  it("drops when, who by name and hashes, and keeps everything else", () => {
    const vscode = normalise(plotFile("you, in VS Code", "2026-11-07T10:00:00.000Z"));
    const play = normalise(plotFile("you, in the browser", "2026-11-07T11:30:00.000Z"));
    expect(differences(vscode, play)).toEqual([]);
    expect(vscode.view).toEqual({ context_tracks: "faint" });
    expect(vscode.plot).toEqual({ kind: "plot", title: "Serial 1" });
    expect(vscode.history.steps[0].records[0]).toEqual({ kind: "edit", agent: { kind: "person" }, notes: ["Colour of RED ONE set to green"] });
    // A different change is a difference, by the feature's id and the property.
    const other = normalise(plotFile("you, in the browser", "2026-11-07T11:30:00.000Z", "#e01c3e"));
    expect(differences(vscode, other).map((d) => d.path)).toEqual(["features[track-red-one].properties.colour"]);
    // A path known to differ is left out.
    expect(differences(without(vscode, ["view"]), without(normalise(plotFile("x", "y").replace('"faint"', '"hidden"')), ["view"]))).toEqual([]);
  });

  it("holds positions and every other number to one part in 10^12, and courses and speeds worked out from positions to one in 10^9", () => {
    expect([STRICT, LOOSE]).toEqual([1e-12, 1e-9]);
    const at = (x: number) => x * (1 + 1e-10);
    const track = (lon: number, speed: number, course: number) => ({
      features: [{ id: "track-red-one", geometry: { coordinates: [[lon, 37.03617954352515]] }, properties: { speeds: { values: [speed] }, courses: { values: [course] } } }],
    });
    const base = track(-75.82790233909675, 6.02906254781588, 200.11);
    // The last bits of a position, as two Pythons' maths libraries round: the same.
    expect(differences(base, track(-75.82790233909674, 6.02906254781588, 200.11))).toEqual([]);
    // One part in 10^10 in a position (about a micrometre): a difference.
    expect(differences(base, track(at(-75.82790233909675), 6.02906254781588, 200.11)).map((d) => d.path)).toEqual(["features[track-red-one].geometry.coordinates[0][0]"]);
    // The same in a speed or course worked out from positions: the same, as a sheared track's in each host.
    expect(differences(base, track(-75.82790233909675, at(6.02906254781588), at(200.11)))).toEqual([]);
    // A thousandth of a knot is a difference even there.
    expect(differences(base, track(-75.82790233909675, 6.03006254781588, 200.11)).map((d) => d.path)).toEqual(["features[track-red-one].properties.speeds.values[0]"]);
    // Anything else, such as a time window's or an annotation's numbers, is held strictly.
    expect(differences({ view: { radius: 1000 } }, { view: { radius: at(1000) } })).toHaveLength(1);
    expect(DIFFERENCED.test("features[track-red-one].properties.speeds.values[3]")).toBe(true);
    expect(DIFFERENCED.test("features[track-red-one].geometry.coordinates[3][0]")).toBe(false);
  });
});
