import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { ToolDeclaration } from "@debrief/schemas";
import { needs } from "../../src/wording.js";
import { checkMessage } from "../../src/messages.js";
import { openPlot, readCatalogue } from "../../src/catalogue.js";
import { densify } from "../../webview/geodesic.js";
import { count, describeTimes } from "../../src/format.js";

const repo = path.resolve(__dirname, "../../..");
const fixtures = path.join(repo, "schemas", "fixtures", "webview_message");

const tool = (applies_to: string[], min?: number, max?: number) =>
  ({ name: "x.y", version: "1", title: "T", explanation: "E", applies_to, min_selected: min, max_selected: max, outputs: ["non_spatial"] }) as ToolDeclaration;

describe("what a tool needs, in the analyst's words", () => {
  it.each([
    [tool(["track"], 2, 2), "select 2 tracks"],
    [tool(["track"], 1, 1), "select 1 track"],
    [tool(["track"], 1, 50), "select 1 to 50 tracks"],
    [tool(["track"], 1), "select 1 or more tracks"],
    [tool(["*"], 0), "works with any selection"],
    [tool(["track", "annotation"], 2), "select 2 or more features of the right kinds"],
  ])("%#", (declaration, expected) => expect(needs(declaration)).toBe(expected));
});

describe("webview messages are boundary types (CON-08)", () => {
  it.each(["show-plot", "selection-changed", "run-tool", "ready"])("accepts %s", (name) => {
    const raw = JSON.parse(readFileSync(path.join(fixtures, "valid", `${name}.json`), "utf8"));
    expect(checkMessage(raw)).toEqual(raw);
  });
  it.each(["run-tool-without-name", "ready-with-plot"])("refuses %s, which Python refuses too", (name) => {
    const raw = JSON.parse(readFileSync(path.join(fixtures, "invalid", "semantic", `${name}.json`), "utf8"));
    expect(() => checkMessage(raw)).toThrow();
  });
  it("refuses an unknown kind", () => expect(() => checkMessage({ kind: "explode" })).toThrow());
});

describe("geodesic lines (SUB-03)", () => {
  it("keeps the ends and follows the great circle, not the Mercator straight line", () => {
    const line = densify([[-70, 40], [10, 50]]);
    expect(line[0]).toEqual([-70, 40]);
    expect(line.at(-1)![0]).toBeCloseTo(10, 9);
    const middle = line[Math.floor(line.length / 2)];
    expect(middle[1]).toBeGreaterThan(51); // the geodesic bows north of both ends; the rhumb line would not
  });
  it("leaves short segments alone", () => expect(densify([[0, 0], [0.001, 0]])).toHaveLength(2));
});

describe("display", () => {
  it("counts in words", () => {
    expect(count(1, "plot")).toBe("1 plot");
    expect(count(3, "fix", "fixes")).toBe("3 fixes");
  });
  it("shows times through the formatting service", () =>
    expect(describeTimes("1995-12-12T05:00:00.000Z", "1995-12-12T06:28:00.000Z")).toBe("05:00:00Z – 06:28:00Z"));
});

describe("reading a catalogue Python wrote", () => {
  const python = process.env.DEBRIEF_PYTHON || path.join(repo, ".venv", "bin", "python");
  const work = mkdtempSync(path.join(tmpdir(), "debrief-cat-"));
  execFileSync(python, [
    "-c",
    "import sys; from pathlib import Path; from debrief_stac import Catalogue; from debrief_io import import_rep; " +
      "c = Catalogue.create(Path(sys.argv[1]), 'ex', 'Exercise', 'Test'); import_rep(c, Path(sys.argv[2]), item_id='serial-1', title='Serial 1')",
    work,
    path.join(repo, "vscode", "test", "integration", "demo.rep"),
  ]);
  const store = { id: "ex", title: "Exercise", kind: "file" as const, location: work };

  it("lists plots by walking folders", () => {
    const view = readCatalogue(store);
    expect(view.problem).toBeUndefined();
    expect(view.plots.map((p) => [p.id, p.title])).toEqual([["serial-1", "Serial 1"]]);
  });
  it("opens a plot with its source", () => {
    const opened = openPlot(store, "serial-1");
    expect(opened.plot.features.map((f) => f.properties.name)).toEqual(["NELSON", "BLUE", "TRAWLER 7"]);
    expect(opened.files).toEqual([expect.objectContaining({ kind: "source", title: "demo.rep" })]);
  });
  it("reports a missing catalogue instead of failing", () =>
    expect(readCatalogue({ ...store, location: path.join(work, "nowhere") }).problem).toMatch(/No catalogue found/));
});
