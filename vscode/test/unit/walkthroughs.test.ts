// Walkthroughs (CAP-25): one source of words for VS Code's Get Started page and the playground's
// panel, each step ticked by what the analyst did. Played in VS Code by test/integration/walkthroughs.ts
// and in the playground by test/play/onboarding.mjs.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import tours from "../../walkthroughs/tours.json";
import { commandLink, contextKey, plainForVSCode, stepParts, vscodeDescription, walkthroughsContribution, withWalkthroughs } from "../../walkthroughs/contribute.mjs";
import { BY_HAND, EVENTS, openedEvent, serviceEvent, toteCompares, TOURS, WalkthroughProgress } from "../../src/walkthroughs.js";
import { callEvent, parseActions, progressOf } from "../../play/tours.js";
import { demoPage } from "../../play/demo.mjs";

const manifest = readFileSync("package.json", "utf8");
const index = readFileSync("play/index.html", "utf8");
const steps = tours.tours.flatMap((t) => t.steps.map((s) => ({ tour: t.id, ...s })));

describe("one source for both hosts", () => {
  it("package.json's walkthroughs are written from tours.json, and nothing else of it changes", () => {
    expect(withWalkthroughs(manifest, walkthroughsContribution(tours))).toBe(manifest);
    const contributed = JSON.parse(manifest).contributes.walkthroughs;
    expect(contributed.map((w: { id: string }) => w.id)).toEqual(["explore", "collate", "tidy", "annotate"]);
    expect(contributed.flatMap((w: { steps: unknown[] }) => w.steps)).toHaveLength(20);
  });

  it("gives each step the same words in both hosts, and the keyboard in each", () => {
    for (const step of steps) {
      const vscode = stepParts(step, "vscode");
      const play = stepParts(step, "play");
      expect(vscode.text).toBe(play.text);
      expect(vscodeDescription(step)).toContain(plainForVSCode(step.text));
      expect(vscodeDescription(step)).not.toMatch(/`/);
      expect(vscodeDescription(step)).toContain(`**Keyboard:** ${plainForVSCode(vscode.keys)}`);
      expect(play.keys.length, step.id).toBeGreaterThan(10);
      expect(step.alt.length, step.id).toBeGreaterThan(10);
      expect(existsSync(`media/walkthroughs/${step.media}`), step.media).toBe(true);
    }
  });

  it("ends each VS Code step with its button, a command Debrief contributes or a view's", () => {
    const commands = new Set(JSON.parse(manifest).contributes.commands.map((c: { command: string }) => c.command));
    const views = new Set(Object.values(JSON.parse(manifest).contributes.views).flat().map((v) => `${(v as { id: string }).id}.focus`));
    for (const step of steps) {
      const { command, args } = step.vscode;
      expect(commands.has(command) || views.has(command), command).toBe(true);
      expect(vscodeDescription(step).endsWith(`[${step.vscode.button}](${commandLink(command!, args)})`)).toBe(true);
    }
    expect(commandLink("debrief.walkthrough.open", ["tidy"])).toBe("command:debrief.walkthrough.open?%5B%22tidy%22%5D");
  });

  it("ticks each VS Code step by its own context key, set by the analyst's doing it", () => {
    const contributed = JSON.parse(manifest).contributes.walkthroughs.flatMap((w: { steps: { completionEvents: string[] }[] }) => w.steps);
    expect(contributed.map((s: { completionEvents: string[] }) => s.completionEvents)).toEqual(steps.map((s) => [`onContext:${contextKey(s.event)}`]));
    expect(EVENTS.size).toBe(20); // no two steps wait for the same thing
  });

  it("points each playground button at something on the page", () => {
    for (const step of steps) {
      for (const action of parseActions(step.play.action!)) {
        if (action.verb === "focus" || action.verb === "click") expect(index, action.target).toContain(`id="${action.target}"`);
        if (action.verb === "open") expect(TOURS.map((t) => t.id)).toContain(action.target);
      }
    }
    expect(parseActions("select:track-red-one;click:find-jumps")).toEqual([
      { verb: "select", target: "track-red-one" },
      { verb: "click", target: "find-jumps" },
    ]);
    expect(() => parseActions("delete:everything")).toThrow(/Not a walkthrough action/);
  });
});

describe("ticking a step off", () => {
  it("in VS Code, by the change the tool service made, however it was asked for", () => {
    expect(serviceEvent("debrief/import", {})).toBe("imported");
    expect(serviceEvent("debrief/remove_jumps")).toBe("jumpsRemoved");
    expect(serviceEvent("debrief/edit_track", { edit: { action: "shear" } })).toBe("sheared");
    expect(serviceEvent("debrief/edit_track", { edit: { action: "stretch" } })).toBe("sheared");
    expect(serviceEvent("debrief/edit_track", { edit: { action: "move" } })).toBeUndefined();
    expect(serviceEvent("debrief/export_image", { file: "a.png" })).toBeUndefined(); // an agent's ask, not yet drawn
    expect(serviceEvent("debrief/export_image", { image: "…" })).toBe("imageExported");
    expect(serviceEvent("debrief/find_jumps")).toBeUndefined(); // looking changes nothing
    expect(toteCompares({ primary: "a", secondaries: [] })).toBe(false);
    expect(toteCompares({ primary: "a", secondaries: ["b"] })).toBe(true);
    expect([...BY_HAND]).toContain("debrief.time");
  });

  it("in either host, every step has something that sends its event", () => {
    const service = ["debrief/import", "debrief/take_new_data", "debrief/set_source_preference", "debrief/remove_jumps", "debrief/smooth_track", "debrief/mark_fix", "debrief/add_annotation", "debrief/set_track_frequencies", "debrief/open_revision"]
      .map((m) => serviceEvent(m))
      .concat(serviceEvent("debrief/edit_track", { edit: { action: "shear" } }), serviceEvent("debrief/export_image", { image: "x" }));
    const elsewhere = ["timeMoved", "selected", "toteChosen", "timelineChosen", "coverageShown", ...TOURS.map((t) => openedEvent(t.id))];
    expect(new Set([...service, ...elsewhere])).toEqual(EVENTS);
  });

  it("in the playground, by the call to Python that succeeded", () => {
    const ok = JSON.stringify({ ok: true });
    const request = (change: object) => ["serial-1-tidy", JSON.stringify({ base: {}, change })];
    expect(callEvent("clean", request({ kind: "remove_jumps" }), ok)).toBe("jumpsRemoved");
    expect(callEvent("clean", request({ kind: "find_jumps" }), ok)).toBeUndefined();
    expect(callEvent("clean", request({ kind: "smooth" }), ok)).toBe("smoothed");
    expect(callEvent("clean", request({ kind: "smooth" }), JSON.stringify({ error: "no" }))).toBeUndefined();
    expect(callEvent("track", request({ kind: "edit", edit: { action: "shear" } }), ok)).toBe("sheared");
    expect(callEvent("annotate", request({ kind: "add" }), ok)).toBe("annotationAdded");
    expect(callEvent("annotate", request({ kind: "delete" }), ok)).toBeUndefined();
    expect(callEvent("collate", request({ kind: "take" }), JSON.stringify({ changed: true }))).toBe("newDataTaken");
    expect(callEvent("collate", request({ kind: "take" }), JSON.stringify({ changed: false }))).toBeUndefined();
    expect(callEvent("import_tour_log", [], JSON.stringify({ item: "blue-one-nav-log" }))).toBe("imported");
    expect(callEvent("export_image", [], JSON.stringify({ data: "…" }))).toBe("imageExported");
    expect(callEvent("open_revision", [], "not JSON")).toBeUndefined();
  });

  it("once, setting its context key and marking its step complete on the Get Started page", () => {
    const ran: unknown[][] = [];
    const progress = new WalkthroughProgress(async (...call) => void ran.push(call), "debrief.debrief");
    progress.said("imported");
    progress.said("imported");
    progress.said("not a step");
    progress.said(undefined);
    expect(ran).toEqual([
      ["setContext", "debrief.walkthrough.imported", true],
      ["welcome.markStepComplete", "debrief.debrief#collate#collate.import"],
    ]);
    expect(progress.seen()).toEqual(["imported"]);
    progress.forget();
    expect(ran.slice(2)).toEqual([
      ["setContext", "debrief.walkthrough.imported", false],
      ["welcome.markStepIncomplete", "debrief.debrief#collate#collate.import"],
    ]);
    expect(progress.seen()).toEqual([]);
  });

  it("says how far through a walkthrough the reader is", () => {
    const tidy = tours.tours.find((t) => t.id === "tidy")!;
    expect(progressOf(tidy, new Set())).toEqual({ done: 0, total: 5, next: 0 });
    expect(progressOf(tidy, new Set(["tidyOpened", "smoothed"]))).toEqual({ done: 2, total: 5, next: 1 });
    expect(progressOf(tidy, new Set(tidy.steps.map((s) => s.event)))).toEqual({ done: 5, total: 5 });
  });
});

describe("the web demo's page", () => {
  it("is the playground's page, every panel and the walkthroughs, on the playground's files", () => {
    const page = demoPage(index);
    expect(page).toContain('<base href="../play/">');
    expect(page).toContain("<title>Debrief web demo</title>");
    for (const panel of ["tour", "time", "tote", "plot", "outline", "timeline", "catalogue", "coverage", "tools", "history", "export", "try", "import"]) expect(page).toContain(`id="panel-${panel}"`);
    expect(() => demoPage("<html></html>")).toThrow();
  });
});
