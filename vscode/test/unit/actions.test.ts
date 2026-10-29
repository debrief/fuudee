/**
 * The action catalogue (PAR-05 to PAR-08, PAR-18; docs/panel-parity-srd.md): package.json's commands
 * and menus are written from it, so an entry edited by hand fails here; every action is one the
 * extension registers; every action on the Outline's rows and title bar is one the playground can
 * run; menus are put together, and conditions read, as VS Code does; the Tote's entries follow the
 * product owner's rule; and neither front end writes rows or menus of its own beside the shared ones.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIONS, contribution, entryOf, holds, matches, placementWhen, rowActions, rowMenu, titleMenu, whenClause } from "../../webview/panels/actions.js";
import { withContribution } from "../../scripts/menutext.mjs";
import { toteMenu } from "../../webview/totelogic.js";
import { undoRedo } from "../../src/views/historyrows.js";

const vscodeDir = path.resolve(__dirname, "..", "..");
const read = (file: string) => readFileSync(path.join(vscodeDir, file), "utf8");

describe("the action catalogue", () => {
  it("writes package.json's commands and menus: an entry edited there by hand fails here (npm run menus)", () => {
    const manifest = read("package.json");
    expect(withContribution(manifest, contribution())).toBe(manifest);
  });

  it("declares each action once, each a command the extension registers", () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const source = read("src/extension.ts") + read("src/views/tools.ts");
    const registered = (id: string) => source.includes(`"${id}"`) || (id.startsWith("debrief.contextTracks.") && source.includes("command(`debrief.contextTracks.${choice}`"));
    expect(ids.filter((id) => !registered(id))).toEqual([]);
  });

  it("offers in the playground every action on the Outline's rows and title bar (PAR-07)", () => {
    const host = read("play/host.ts");
    const outline = ACTIONS.filter((a) => a.placements?.some((p) => (p.menu === "row" || p.menu === "title") && p.view === "debrief.outline"));
    const missing = outline.filter((a) => !a.operation && !host.includes(`  "${a.id}": `)).map((a) => a.id);
    expect(missing).toEqual([]);
  });

  it("says its conditions as when clauses, and reads them as VS Code does", () => {
    expect(whenClause([{ key: "debrief.plotOpen" }, { key: "debrief.selectionVisibility", isNot: "hidden" }, { key: "debrief.bearingsPoppedOut", not: true }])).toBe(
      "debrief.plotOpen && debrief.selectionVisibility != hidden && !debrief.bearingsPoppedOut",
    );
    expect(placementWhen({ menu: "row", view: "debrief.outline", item: [{ re: "^feature-" }, { re: "^(?!.*-hidden$)" }], group: "1_presentation@2" })).toBe(
      "view == debrief.outline && viewItem =~ /^feature-/ && viewItem =~ /^(?!.*-hidden$)/",
    );
    expect(placementWhen({ menu: "palette", hidden: true })).toBe("false");
    expect(holds({ key: "activeWebviewPanelId", is: "'debrief.map'" }, { activeWebviewPanelId: "debrief.map" })).toBe(true);
    expect(holds({ key: "debrief.selectionVisibility", isNot: "hidden" }, {})).toBe(true);
    expect(holds({ key: "debrief.plotOpen" }, { "debrief.plotOpen": false })).toBe(false);
    expect(matches({ re: "^(?!.*-hidden$)" }, "feature-track-hidden")).toBe(false);
    expect(matches({ is: "outline-cut" }, "outline-cut-hidden")).toBe(false);
  });

  it("puts a menu together as VS Code does: by group, then order; each entry disabled with its reason (PAR-08)", () => {
    const open = { "debrief.plotOpen": true, "debrief.toteCanAdd": true, "debrief.toteCanSetPrimary": true };
    const track = rowMenu("debrief.outline", "feature-track", open);
    expect(track.map((e) => e.title)).toEqual([
      "Move track…",
      "Rotate track…",
      "Shear track…",
      "Stretch track…",
      "Split track at current time…",
      "Merge selected tracks",
      "Find and remove jumps…",
      "Smooth track…",
      "Fixes: colour, label or comment…",
      "Move a fix…",
      "Plot over the ground or by dead reckoning…",
      "Change colour…",
      "Hide on map",
      "Frequencies: labels, symbols and arrows…",
      "Set as Tote primary",
      "Add to Tote",
    ]);
    expect(track.every((e) => e.enabled)).toBe(true);
    const closed = rowMenu("debrief.outline", "feature-track", {}, { "debrief.toteCanSetPrimary": "Select one track to be the Tote's primary." });
    expect(closed.find((e) => e.id === "debrief.tote.setPrimary")).toMatchObject({ enabled: false, reason: "Open a plot first." });
    expect(closed.find((e) => e.id === "debrief.moveTrack")).toMatchObject({ enabled: true });
    expect(entryOf(ACTIONS.find((a) => a.id === "debrief.tote.setPrimary")!, undefined, { "debrief.plotOpen": true }, { "debrief.toteCanSetPrimary": "Select one track to be the Tote's primary." }).reason).toBe(
      "Select one track to be the Tote's primary.",
    );
    // A hidden cut: no Hide selected cuts; a solution's menu: Bearings and TMA (0_sensor), then split into legs (0_track).
    expect(rowMenu("debrief.outline", "outline-cut-hidden", open).map((e) => e.id)).not.toContain("debrief.hideCuts");
    expect(rowMenu("debrief.outline", "feature-track-tma", open).slice(0, 3).map((e) => e.id)).toEqual(["debrief.showBearings", "debrief.tmaSplitLeg", "debrief.moveTrack"]);
    expect(rowActions("debrief.outline", "outline-fix")).toEqual(["debrief.splitBeforeFix", "debrief.splitAfterFix"]);
  });

  it("puts the Outline's title bar together: its buttons, then its overflow menu", () => {
    const bar = titleMenu("debrief.outline", { "debrief.plotOpen": true, "debrief.selectionVisibility": "mixed", "debrief.northArrow": true });
    expect(bar.map((e) => [e.id, e.group])).toEqual([
      ["debrief.selectionShowAll", "navigation"],
      ["debrief.colourSelection", "navigation"],
      ["debrief.selectAll", "navigation"],
      ["debrief.selectChildren", "navigation"],
      ["debrief.clearSelection", "navigation"],
      ["debrief.addAnnotation", "navigation"],
      ["debrief.toggleNorthArrow", "2_furniture"],
      ["debrief.exportImage", "3_export"],
      ["debrief.importSensor", "3_import"],
    ]);
    expect(bar.find((e) => e.id === "debrief.toggleNorthArrow")?.checked).toBe(true);
  });
});

describe("the Tote's entries on a track's menu (decision, product owner, 29 Oct 2026)", () => {
  const tote = { primary: "a", secondaries: ["b"] };
  it("offers Add when any selected track is not in the Tote, Remove when any is", () => {
    expect(toteMenu(tote, ["c"])).toEqual({ canAdd: true, canRemove: false });
    expect(toteMenu(tote, ["b", "c"])).toMatchObject({ canAdd: true, canRemove: true });
    expect(toteMenu(tote, ["a", "b"])).toMatchObject({ canAdd: false, canRemove: true });
  });
  it("disables Set as Tote primary, saying why, for more than one track or the primary itself", () => {
    expect(toteMenu(tote, ["a", "b"]).primaryReason).toBe("Select one track to be the Tote's primary.");
    expect(toteMenu(tote, ["a"]).primaryReason).toBe("That track is the Tote's primary already.");
    expect(toteMenu(tote, ["b"]).primaryReason).toBeUndefined();
  });
});

describe("Undo and Redo, disabled rather than refused (PAR-08)", () => {
  const steps = [
    { seq: 1, status: "applied" },
    { seq: 2, status: "applied" },
    { seq: 3, status: "undone" },
  ];
  it("undoes while the current step has one before it, redoes while a step is undone, neither read-only", () => {
    expect(undoRedo(steps, 2, false)).toEqual({ canUndo: true, canRedo: true });
    expect(undoRedo(steps, 1, false)).toEqual({ canUndo: false, canRedo: true });
    expect(undoRedo(steps.slice(0, 2), 2, true)).toEqual({ canUndo: false, canRedo: false });
  });
});

// --- PAR-18: no rows or menus outside the shared modules -------------------------------------------

describe("rows and menus only from the shared models (PAR-18)", () => {
  const sources = (dir: string) => readdirSync(path.join(vscodeDir, dir)).filter((f) => f.endsWith(".ts")).map((f) => [`${dir}/${f}`, read(`${dir}/${f}`)] as const);

  it("writes no catalogued action's title by hand in the playground", () => {
    const found = sources("play").flatMap(([file, text]) => ACTIONS.filter((a) => [`"${a.title}"`, `'${a.title}'`, `\`${a.title}\``].some((l) => text.includes(l))).map((a) => `${file}: ${a.title}`));
    expect(found).toEqual([]);
  });

  it("makes the Outline's tree items in its renderer only", () => {
    expect(read("src/views/outline.ts").match(/new vscode\.TreeItem\(/g)).toHaveLength(1);
    expect(sources("src").filter(([, text]) => /new vscode\.TreeItem\(/.test(text)).map(([f]) => f)).toEqual([]);
  });

  it("says no Outline row in the playground's host: the Outline panel model does (outlinerow.ts draws it)", () => {
    const host = read("play/host.ts");
    for (const said of ["cutRow(", "legRow(", "fixRow(", "sensorDetail(", "trackDetails("]) expect(host).not.toContain(said);
  });
});
