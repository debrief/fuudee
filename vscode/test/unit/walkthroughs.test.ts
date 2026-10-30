// Walkthroughs (CAP-25): one source of words for VS Code's Get Started page and the playground's
// panel, each step ticked by what the analyst did. Played in VS Code by test/integration/walkthroughs.ts
// and in the playground by test/play/onboarding.mjs.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import tours from "../../walkthroughs/tours.json";
import { ALL_DONE, commandLink, contextKey, doneLabel, latestSolution, tmaDragEvent, nextLabel, nextTour, NO_SOLUTION, OPEN, plainForVSCode, SOLUTION, stepParts, vscodeButton, vscodeDescription, walkthroughsContribution, withSolution, withWalkthroughs } from "../../walkthroughs/contribute.mjs";
import { AFTER_OPEN, BY_HAND, EVENTS, FIRST_RUN_KEY, FIRST_TOUR, openedEvent, openOnFirstRun, serviceEvent, stepsFor, toteCompares, TOURS, tourOfEvent, WalkthroughProgress, whyNotPrepared } from "../../src/walkthroughs.js";
import { callEvent, counts, outlineTarget, parseActions, progressOf, serviceCall } from "../../play/tours.js";
import { STEP_METHODS } from "../../webview/walkthroughevents.js";
import { DEMO_META, demoPage } from "../../play/demo.mjs";
import { CSP, CSP_META, CSP_PAGES } from "../../play/csp.mjs";
import { contentFree } from "../../webview/timelinelogic.js";

const manifest = readFileSync("package.json", "utf8");
const index = readFileSync("play/index.html", "utf8");
const steps = tours.tours.flatMap((t) => t.steps.map((s) => ({ tour: t.id, ...s })));
type Tour = (typeof tours.tours)[number];

describe("one source for both hosts", () => {
  it("package.json's walkthroughs are written from tours.json, and nothing else of it changes", () => {
    expect(withWalkthroughs(manifest, walkthroughsContribution(tours))).toBe(manifest);
    const contributed = JSON.parse(manifest).contributes.walkthroughs;
    expect(contributed.map((w: { id: string }) => w.id)).toEqual(["explore", "collate", "tidy", "annotate", "tma"]);
    expect(contributed.flatMap((w: { steps: unknown[] }) => w.steps)).toHaveLength(27);
  });

  it("gives each step the same words in both hosts, and the keyboard in each", () => {
    for (const step of steps) {
      const vscode = stepParts(step, "vscode");
      const play = stepParts(step, "play");
      expect(vscode.text).toBe(play.text);
      expect(vscodeDescription(step, step.tour)).toContain(plainForVSCode(step.text));
      expect(vscodeDescription(step, step.tour)).not.toMatch(/`/);
      expect(vscodeDescription(step, step.tour)).toContain(`**Keyboard:** ${plainForVSCode(vscode.keys)}`);
      expect(play.keys.length, step.id).toBeGreaterThan(10);
      expect(step.alt.length, step.id).toBeGreaterThan(10);
      expect(existsSync(`media/walkthroughs/${step.media}`), step.media).toBe(true);
    }
  });

  it("ends each VS Code step with its button: a command Debrief contributes or a view's, on the walkthrough's copy", () => {
    const commands = new Set(JSON.parse(manifest).contributes.commands.map((c: { command: string }) => c.command));
    const views = new Set(Object.values(JSON.parse(manifest).contributes.views).flat().map((v) => `${(v as { id: string }).id}.focus`));
    for (const step of steps) {
      const { command, args = [] } = step.vscode as { command: string; args?: unknown[] };
      expect(commands.has(command) || views.has(command), command).toBe(true);
      expect(vscodeDescription(step, step.tour).endsWith(`[${step.vscode.button}](${vscodeButton(step, step.tour)})`)).toBe(true);
      // Every step after the first acts on the walkthrough's copy, never on whatever plot is open (panel review, 17 Oct 2026).
      if (step.id === "open") expect(vscodeButton(step, step.tour)).toBe(commandLink(OPEN, [step.tour]));
      else expect(vscodeButton(step, step.tour)).toBe(commandLink("debrief.walkthrough.do", [step.tour, command, ...args]));
    }
    expect(commands.has("debrief.walkthrough.do")).toBe(true);
    expect(commandLink("debrief.walkthrough.open", ["tidy"])).toBe("command:debrief.walkthrough.open?%5B%22tidy%22%5D");
  });

  it("ends each walkthrough's last VS Code step with a link to the next, from tours.json's order; the last says all are done (product owner, 23 Oct 2026)", () => {
    const pkg = JSON.parse(manifest);
    const contributed = pkg.contributes.walkthroughs as { id: string; steps: { description: string }[] }[];
    expect(contributed.map((w) => w.id)).toEqual(tours.tours.map((t) => t.id));
    contributed.forEach((walkthrough, i) => {
      const last = walkthrough.steps.at(-1)!.description;
      const after = tours.tours[i + 1];
      expect(nextTour(tours, walkthrough.id)?.id).toBe(after?.id);
      if (after) {
        const link = commandLink("workbench.action.openWalkthrough", [`${pkg.publisher}.${pkg.name}#${after.id}`, true]);
        expect(last.endsWith(`\n\n[${nextLabel(after)}](${link})`), walkthrough.id).toBe(true);
        expect(link).toContain(encodeURIComponent(`debrief.debrief#${after.id}`));
      } else {
        expect(last).toMatch(new RegExp(`\\*\\*${ALL_DONE}\\*\\* once this step is done`));
        expect(last).not.toContain("openWalkthrough");
      }
      // Only the last step offers the next walkthrough.
      for (const step of walkthrough.steps.slice(0, -1)) expect(step.description).not.toContain("openWalkthrough");
    });
    expect(nextTour(tours, "nowhere")).toBeUndefined();
  });

  it("ticks each VS Code step by its own context key, set by the analyst's doing it", () => {
    const contributed = JSON.parse(manifest).contributes.walkthroughs.flatMap((w: { steps: { completionEvents: string[] }[] }) => w.steps);
    expect(contributed.map((s: { completionEvents: string[] }) => s.completionEvents)).toEqual(steps.map((s) => [`onContext:${contextKey(s.event)}`]));
    expect(EVENTS.size).toBe(27); // no two steps wait for the same thing
  });

  it("does what VS Code's button does with each playground button (PAR-14)", () => {
    for (const step of steps) {
      const command = step.vscode.command as string;
      const actions = parseActions(step.play.action!);
      const verbs = actions.map((a) => a.verb);
      // Bringing a panel forward, opening the copy, importing its log or choosing in the Outline: the same in both.
      if (command.endsWith(".focus") || command === "debrief.showCoverage") expect(verbs, step.id).toEqual(["focus"]);
      else if (command === "debrief.walkthrough.open") expect(verbs[0], step.id).toBe("open");
      else if (command === "debrief.walkthrough.importLog") expect(verbs, step.id).toEqual(["import-log"]);
      else if (command === "debrief.chooseInOutline") expect(verbs, step.id).toEqual(["outline"]);
      // Any other command: the playground runs the same action, never only shows where it is.
      else expect(actions.filter((a) => a.verb === "run").map((a) => a.target), step.id).toEqual([command]);
    }
  });

  it("points each playground button at something on the page", () => {
    for (const step of steps) {
      for (const action of parseActions(step.play.action!)) {
        if (action.verb === "focus" || action.verb === "click") expect(index, action.target).toContain(`id="${action.target}"`);
        if (action.verb === "open") expect(TOURS.map((t) => t.id)).toContain(action.target);
        // The Outline, under the towed array or the walkthrough's solution, choosing what VS Code's step chooses.
        if (action.verb === "outline") {
          const { feature, focus } = outlineTarget(action.target);
          expect(["sensor-blue-one-towed-array", SOLUTION]).toContain(feature);
          if (focus) expect(step.vscode.args).toEqual([feature, focus]);
          if (focus) expect(step.vscode.command).toBe("debrief.chooseInOutline");
        }
      }
    }
    expect(parseActions("select:track-red-one;click:find-jumps")).toEqual([
      { verb: "select", target: "track-red-one" },
      { verb: "click", target: "find-jumps" },
    ]);
    expect(() => parseActions("delete:everything")).toThrow(/Not a walkthrough action/);
    expect(outlineTarget("s?period=2023-06-15T09:46:00.000Z/2023-06-15T12:00:00.000Z&make")).toEqual({ feature: "s", focus: { period: { start: "2023-06-15T09:46:00.000Z", end: "2023-06-15T12:00:00.000Z" }, make: true } });
    expect(outlineTarget("s?fix=2023-06-15T10:38:00.000Z")).toEqual({ feature: "s", focus: { fix_time: "2023-06-15T10:38:00.000Z" } });
    expect(outlineTarget("s?cut=2023-06-15T09:46:00.000Z")).toEqual({ feature: "s", focus: { cut_time: "2023-06-15T09:46:00.000Z" } });
    expect(outlineTarget("s")).toEqual({ feature: "s" });
    expect(() => outlineTarget("s?everything")).toThrow(/Not a choice in the Outline/);
  });

  it("puts in the walkthrough's latest TMA solution where a step names it, and none before it is made", () => {
    const track = (id: string, tma?: object) => ({ id, properties: { kind: "track", ...(tma && { tma }) } });
    const features = [track("track-blue-one"), track("track-contact-1-solution", { contact: "Contact 1" }), track("track-contact-2-solution", { contact: "Contact 2" })];
    expect(latestSolution(features)).toBe("track-contact-2-solution");
    expect(withSolution([SOLUTION, { largest: true }], features)).toEqual(["track-contact-2-solution", { largest: true }]);
    expect(withSolution([SOLUTION], [track("track-blue-one")])).toBeUndefined();
    expect(withSolution(["track-red-one"], [])).toEqual(["track-red-one"]);
    expect(NO_SOLUTION).toMatch(/^Make the solution first/);
  });
});

describe("ticking a step off", () => {
  it("in VS Code, by the change the tool service made, however it was asked for", () => {
    expect(serviceEvent("debrief/import", {})).toBe("imported");
    expect(serviceEvent("debrief/remove_jumps")).toBe("jumpsRemoved");
    expect(serviceEvent("debrief/edit_track", { edit: { action: "shear" } })).toBe("sheared");
    expect(serviceEvent("debrief/edit_track", { edit: { action: "stretch" } })).toBeUndefined(); // the step asks for a shear
    expect(serviceEvent("debrief/edit_track", { edit: { action: "move" } })).toBeUndefined();
    expect(serviceEvent("debrief/export_image", { file: "a.png" })).toBeUndefined(); // an agent's ask, not yet drawn
    expect(serviceEvent("debrief/export_image", { image: "…" })).toBe("imageExported");
    expect(serviceEvent("debrief/find_jumps")).toBeUndefined(); // looking changes nothing
    // Bearings and TMA: a side kept (not both again), a solution made, moved (its start to RED
    // ONE's range), sheared (not Tidy a track's shear), a cut left out (not counted again, nor one
    // already left out), split into legs and a leg dragged.
    // Contact 1 is a solution of one leg, Contact 2 one split into two.
    const solution = (id: string) => ({ "track-contact-1-solution": 1, "track-contact-2-solution": 2 })[id];
    expect(serviceEvent("debrief/resolve_ambiguity", { keep: "bearing", cut_ids: ["c"] })).toBe("sideKept");
    expect(serviceEvent("debrief/resolve_ambiguity", { keep: "port", sensor_ids: ["s"] })).toBe("sideKept");
    expect(serviceEvent("debrief/resolve_ambiguity", { keep: "ambiguous", cut_ids: ["c"] })).toBeUndefined();
    // A solution made: its feature said back (the same rule as the playground's, PAR-14).
    expect(serviceEvent("debrief/tma_create", {}, undefined, { changed: true, feature: "track-contact-1-solution" })).toBe("solutionMade");
    expect(serviceEvent("debrief/tma_create", {})).toBeUndefined();
    expect(serviceEvent("debrief/edit_track", { feature: "track-contact-1-solution", edit: { action: "shear" } }, solution)).toBe("solutionSheared");
    expect(serviceEvent("debrief/edit_track", { feature: "track-contact-1-solution", edit: { action: "move" } }, solution)).toBe("solutionMoved");
    expect(serviceEvent("debrief/edit_track", { feature: "track-contact-1-solution", edit: { action: "rotate" } }, solution)).toBeUndefined();
    expect(serviceEvent("debrief/edit_track", { feature: "track-contact-1-solution", edit: { action: "stretch" } }, solution)).toBeUndefined();
    expect(serviceEvent("debrief/edit_track", { feature: "track-contact-1-solution", edit: { action: "set_plotting_mode" } }, solution)).toBeUndefined();
    expect(serviceEvent("debrief/edit_track", { feature: "track-blue-one", edit: { action: "shear" } }, solution)).toBe("sheared");
    expect(serviceEvent("debrief/tma_exclude_cut", { excluded: true })).toBe("cutLeftOut");
    expect(serviceEvent("debrief/tma_exclude_cut", { excluded: false })).toBeUndefined();
    // Already left out: nothing changed, so not the step (as the playground's changed !== false).
    expect(serviceEvent("debrief/tma_exclude_cut", { excluded: true }, undefined, { changed: false })).toBeUndefined();
    expect(serviceEvent("debrief/tma_exclude_cut", { excluded: true }, undefined, { changed: true })).toBe("cutLeftOut");
    // The last step ends on a leg dragged, not on the split (product owner, 25 Oct 2026).
    expect(serviceEvent("debrief/tma_split_leg", { at: "t" })).toBeUndefined();
    expect(serviceEvent("debrief/edit_track", { feature: "track-contact-2-solution", edit: { action: "shear", period: { start: "a", end: "b" } } }, solution)).toBe("legDragged");
    expect(serviceEvent("debrief/edit_track", { feature: "track-contact-2-solution", edit: { action: "shear" } }, solution)).toBe("solutionSheared");
    expect(serviceEvent("debrief/edit_track", { feature: "track-contact-2-solution", edit: { action: "move", period: { start: "a", end: "b" } } }, solution)).toBe("legDragged");
    expect(serviceEvent("debrief/edit_track", { feature: "track-contact-1-solution", edit: { action: "shear", period: { start: "a", end: "b" } } }, solution)).toBe("solutionSheared");
    expect(tmaDragEvent(undefined, "shear", true)).toBe(false);
    expect(tmaDragEvent(2, "set_plotting_mode", true)).toBeUndefined();
    expect(AFTER_OPEN.tma).toEqual(["debrief.chooseInOutline", "sensor-blue-one-towed-array"]);
    expect(toteCompares({ primary: "a", secondaries: [] })).toBe(false);
    expect(toteCompares({ primary: "a", secondaries: ["b"] })).toBe(true);
    expect([...BY_HAND]).toContain("debrief.time");
    // Debrief selects what it has just added by command: that is not the analyst selecting (panel review, 17 Oct 2026).
    expect(BY_HAND.has("command")).toBe(false);
  });

  it("in either host, every step has something that sends its event", () => {
    const service = ["debrief/import", "debrief/take_new_data", "debrief/set_source_preference", "debrief/remove_jumps", "debrief/smooth_track", "debrief/mark_fix", "debrief/add_annotation", "debrief/set_track_frequencies", "debrief/open_revision"]
      .map((m) => serviceEvent(m))
      .concat(serviceEvent("debrief/edit_track", { edit: { action: "shear" } }), serviceEvent("debrief/export_image", { image: "x" }))
      .concat(serviceEvent("debrief/tma_create", {}, undefined, { feature: "s" }))
      .concat(serviceEvent("debrief/resolve_ambiguity", { keep: "port" }), serviceEvent("debrief/tma_exclude_cut", { excluded: true }), serviceEvent("debrief/edit_track", { feature: "s", edit: { action: "shear" } }, () => 1), serviceEvent("debrief/edit_track", { feature: "s", edit: { action: "move" } }, () => 1), serviceEvent("debrief/edit_track", { feature: "s", edit: { action: "move", period: { start: "a", end: "b" } } }, () => 2));
    const elsewhere = ["timeMoved", "selected", "toteChosen", "timelineChosen", "coverageShown", ...TOURS.map((t) => openedEvent(t.id))];
    expect(new Set([...service, ...elsewhere])).toEqual(EVENTS);
  });

  it("names each call to the playground's Python by the tool service's method, one table for both (PAR-14)", () => {
    const request = (change: object) => ["serial-1-tma", JSON.stringify({ base: {}, change })];
    const calls: [string, unknown[]][] = [
      ["clean", request({ kind: "remove_jumps" })],
      ["clean", request({ kind: "smooth" })],
      ["clean", request({ kind: "mark" })],
      ["track", request({ kind: "edit", edit: { action: "shear" } })],
      ["sensor", request({ kind: "resolve", resolution: { keep: "port" } })],
      ["tma_change", request({ kind: "create", request: {} })],
      ["tma_change", request({ kind: "exclude", excluded: true })],
      ["annotate", request({ kind: "add" })],
      ["frequencies", request({})],
      ["import_tour_log", []],
      ["collate", request({ kind: "take" })],
      ["collate", request({ kind: "prefer" })],
      ["export_image", ["serial-1", "{}", new Uint8Array(1)]],
      ["open_revision", []],
    ];
    const methods = calls.map(([call, args]) => serviceCall(call, args)?.method);
    expect(new Set(methods)).toEqual(new Set(STEP_METHODS));
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
    expect(callEvent("export_image", ["serial-1-annotate", "{}", new Uint8Array(3)], JSON.stringify({ data: "…" }))).toBe("imageExported");
    expect(callEvent("figure_id", ["serial-1-annotate"], JSON.stringify({ id: "DBF1-…" }))).toBeUndefined(); // the image's ID asked for first
    expect(callEvent("open_revision", [], "not JSON")).toBeUndefined();
    // Bearings and TMA's steps.
    const solution = (id: string) => ({ "track-contact-1-solution": 1, "track-contact-2-solution": 2 })[id];
    expect(callEvent("sensor", request({ kind: "resolve", resolution: { keep: "ambiguous_bearing", cut_ids: ["c"] } }), ok)).toBe("sideKept");
    expect(callEvent("sensor", request({ kind: "resolve", resolution: { keep: "ambiguous", cut_ids: ["c"] } }), ok)).toBeUndefined();
    expect(callEvent("sensor", request({ kind: "import", name: "x.dsf" }), ok)).toBeUndefined();
    expect(callEvent("tma_change", request({ kind: "create", request: {} }), JSON.stringify({ ok: true, feature: "track-contact-1-solution" }))).toBe("solutionMade");
    expect(callEvent("track", request({ kind: "edit", feature: "track-contact-1-solution", edit: { action: "rotate" } }), ok, solution)).toBeUndefined();
    expect(callEvent("track", request({ kind: "edit", feature: "track-contact-1-solution", edit: { action: "move" } }), ok, solution)).toBe("solutionMoved");
    expect(callEvent("track", request({ kind: "edit", feature: "track-contact-1-solution", edit: { action: "shear" } }), ok, solution)).toBe("solutionSheared");
    expect(callEvent("track", request({ kind: "edit", feature: "track-contact-2-solution", edit: { action: "move", period: { start: "a", end: "b" } } }), ok, solution)).toBe("legDragged");
    expect(callEvent("track", request({ kind: "edit", feature: "track-blue-one", edit: { action: "shear" } }), ok, solution)).toBe("sheared");
    expect(callEvent("tma_change", request({ kind: "exclude", excluded: true }), JSON.stringify({ ok: true, notes: [] }))).toBe("cutLeftOut");
    expect(callEvent("tma_change", request({ kind: "exclude", excluded: true }), JSON.stringify({ ok: true, changed: false }))).toBeUndefined();
    expect(callEvent("tma_change", request({ kind: "exclude", excluded: false }), ok)).toBeUndefined();
    expect(callEvent("tma_change", request({ kind: "split", at: "t" }), ok)).toBeUndefined();
    expect(callEvent("track", request({ kind: "edit", feature: "track-contact-2-solution", edit: { action: "shear", period: { start: "a", end: "b" } } }), ok, solution)).toBe("legDragged");
  });

  it("in the playground, only in the walkthrough shown, only on its copy (panel review, 17 Oct 2026)", () => {
    const copy = "serial-1-tidy";
    const at = (item: string | undefined, active = "tidy", done: string[] = []) => ({ active, copy, item, done: new Set(done) });
    expect(counts("jumpsRemoved", at(copy))).toBe(true);
    expect(counts("jumpsRemoved", at("serial-1"))).toBe(false); // the analyst's own plot
    expect(counts("jumpsRemoved", at(copy, "explore"))).toBe(false); // another walkthrough shown
    expect(counts("jumpsRemoved", { ...at(copy), copy: undefined })).toBe(false); // no copy yet
    expect(counts("coverageShown", { active: "collate", copy: "serial-1-collate", item: "serial-1-collate", done: new Set() })).toBe(false);
    expect(counts("coverageShown", { active: "collate", copy: "serial-1-collate", item: "serial-1-collate", done: new Set(["imported"]) })).toBe(true);
    expect(tourOfEvent("sheared")).toBe("tidy");
    // A file of the reader's own is an import, as in VS Code, but not into the walkthrough's copy; a stretch is not a shear.
    expect(callEvent("import_file", ["mine.rep"], JSON.stringify({ item: "mine" }))).toBe("imported");
    expect(counts("imported", { active: "collate", copy: "serial-1-collate", item: "mine.rep", done: new Set() })).toBe(false);
    expect(callEvent("track", ["serial-1-tidy", JSON.stringify({ change: { kind: "edit", edit: { action: "stretch" } } })], JSON.stringify({ ok: true }))).toBeUndefined();
  });

  it("starting a walkthrough again unticks its steps, on the Get Started page too", () => {
    const ran: unknown[][] = [];
    const progress = new WalkthroughProgress(async (...call) => void ran.push(call), "debrief.debrief");
    progress.said("jumpsRemoved");
    progress.said("timeMoved");
    ran.length = 0;
    progress.forgetTour("tidy");
    expect(progress.seen()).toEqual(["timeMoved"]); // another walkthrough's step stays
    expect(ran).toContainEqual(["welcome.markStepIncomplete", "debrief.debrief#tidy#tidy.jumps"]);
    expect(ran).toContainEqual(["setContext", "debrief.walkthrough.jumpsRemoved", false]);
    progress.said("jumpsRemoved");
    expect(progress.seen()).toContain("jumpsRemoved"); // ticks again on the fresh copy
    expect(stepsFor("debrief.debrief", "jumpsRemoved")).toEqual(["debrief.debrief#tidy#tidy.jumps"]);
  });

  it("says plainly when Debrief's Python lacks the sample's packages, pyarrow included", () => {
    expect(whyNotPrepared("ModuleNotFoundError: No module named 'pyarrow'", "x")).toMatch(/debrief-sample Python package and its pyarrow/);
    expect(whyNotPrepared("/usr/bin/python3: No module named debrief_sample", "x")).toMatch(/not installed with Debrief's Python/);
    expect(whyNotPrepared("Traceback\nValueError: no room", "x")).toBe("ValueError: no room");
    expect(whyNotPrepared("", "exit 1")).toBe("exit 1");
  });

  it("says in the log when VS Code's own commands fail, rather than nothing", async () => {
    const lines: string[] = [];
    const progress = new WalkthroughProgress((command) => (command === "setContext" ? Promise.resolve() : Promise.reject(new Error("command 'welcome.markStepComplete' not found"))), "debrief.debrief", (line) => lines.push(line));
    progress.said("imported");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lines).toEqual(["walkthrough_mark_failed command=welcome.markStepComplete"]);
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

  it("says a walkthrough is finished by its last step done, once, and again after it starts afresh (§6, open issue 4)", () => {
    const finished: string[] = [];
    const progress = new WalkthroughProgress(async () => undefined, "debrief.debrief", () => undefined, (tour) => void finished.push(tour));
    const tidy = TOURS.find((t) => t.id === "tidy")!;
    const [last, ...rest] = [...tidy.steps].reverse();
    for (const step of rest) progress.said(step.event);
    expect(finished).toEqual([]);
    progress.said(last.event);
    progress.said(last.event);
    expect(finished).toEqual(["tidy"]);
    progress.forgetTour("tidy");
    for (const step of tidy.steps) progress.said(step.event);
    expect(finished).toEqual(["tidy", "tidy"]);
  });

  it("says a walkthrough is done in the same words in both hosts, and after the last that all are", () => {
    expect(doneLabel(tours.tours[0], tours.tours[1])).toBe(`${tours.tours[0].title}: done.`);
    expect(doneLabel(tours.tours.at(-1)!, undefined)).toBe(`${ALL_DONE}.`);
  });

  it("says how far through a walkthrough the reader is", () => {
    const tidy = tours.tours.find((t: Tour) => t.id === "tidy")!;
    expect(progressOf(tidy, new Set())).toEqual({ done: 0, total: 5, next: 0 });
    expect(progressOf(tidy, new Set(["tidyOpened", "smoothed"]))).toEqual({ done: 2, total: 5, next: 1 });
    expect(progressOf(tidy, new Set(tidy.steps.map((s) => s.event)))).toEqual({ done: 5, total: 5 });
  });
});

describe("package.json", () => {
  it("lists each command once, and puts in menus only commands it contributes, by id and when", () => {
    const contributes = JSON.parse(manifest).contributes;
    const ids = contributes.commands.map((c: { command: string }) => c.command);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [menu, entries] of Object.entries(contributes.menus) as [string, Record<string, unknown>[]][]) {
      for (const entry of entries) {
        expect(ids, `${menu}: ${entry.command}`).toContain(entry.command);
        expect(Object.keys(entry).filter((k) => !["command", "when", "group"].includes(k)), `${menu}: ${entry.command}`).toEqual([]);
      }
    }
  });
});

describe("the playground's hints on where things are", () => {
  // Panel review, 23 Oct 2026: the reader moves the panels, so a hint names the panel, and the
  // step's button brings it into view; it never says where the panel sits.
  it("name panels, never their place in the layout", () => {
    const where = TOURS.flatMap((t) => t.steps.map((s) => (s as { play?: { where?: string } }).play?.where ?? ""));
    expect(where.length).toBeGreaterThan(10);
    for (const text of where) expect(text, text).not.toMatch(/on the left|on the right|under the map|below the (Outline|Tote|time controller)|side column|right-hand/);
  });
});

describe("the web demo's page", () => {
  it("is the playground's page, every panel and the walkthroughs, on the playground's files", () => {
    const page = demoPage(index);
    expect(page).toContain('<base href="../play/">');
    expect(page).toContain("<title>Debrief web demo</title>");
    for (const panel of ["tour", "time", "tote", "outline", "timeline", "catalogue", "coverage", "tools", "history", "export", "try", "import"]) expect(page).toContain(`id="panel-${panel}"`);
    // The plot list, Import…, Export and Try in the top bar (product owner, 23 Oct 2026).
    for (const control of ["plots", "open-import", "open-export", "open-try", "reset-layout"]) expect(page).toContain(`id="${control}"`);
    expect(() => demoPage("<html></html>")).toThrow();
    expect(page).toContain(DEMO_META);
  });

  it("has a strict Content-Security-Policy, before anything it loads, as every playground page has (product owner, 17 Oct 2026)", () => {
    for (const name of CSP_PAGES) {
      const html = readFileSync(`play/${name}`, "utf8");
      expect(html, name).toContain(CSP_META);
      expect(html.indexOf(CSP_META), name).toBeLessThan(html.search(/<link|<script/));
    }
    const page = demoPage(index);
    expect(page.indexOf(CSP_META)).toBeLessThan(page.indexOf("<base"));
    for (const part of ["default-src 'self'", "connect-src 'self' https://cdn.jsdelivr.net", "form-action 'none'", "object-src 'none'", "base-uri 'self'"]) expect(CSP).toContain(part);
    expect(CSP).not.toMatch(/'unsafe-eval'|\*/);
  });

  it("keeps of the Timeline only what came from no plot: the kinds and the view's own settings (panel review, 17 Oct 2026)", () => {
    const kept = contentFree({ kinds: ["narrative"], sources: ["LOCALONLY"], types: ["Sonar"], view: { highlights: ["LOCALONLY phrase"], textSize: 14, wrap: false } });
    expect(JSON.stringify(kept)).not.toMatch(/LOCALONLY|Sonar/);
    expect(kept.kinds).toEqual(["narrative"]);
    expect(kept.view).toMatchObject({ textSize: 14, wrap: false });
    expect(contentFree(undefined).kinds).toEqual([]);
  });
});

describe("the first walkthrough, opened on install (product owner, 22 Oct 2026)", () => {
  const memento = () => {
    const values = new Map<string, unknown>();
    return { get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => void values.set(key, value), values };
  };

  it("opens Open and explore a serial on the first activation, and never on a later one", async () => {
    const state = memento();
    const calls: unknown[][] = [];
    const run = async (...args: unknown[]) => void calls.push(args);
    expect(FIRST_TOUR).toBe(TOURS[0].id);
    expect(await openOnFirstRun(state, run, "debrief.debrief")).toBe(true);
    expect(calls).toEqual([["workbench.action.openWalkthrough", "debrief.debrief#explore", true]]);
    expect(state.values.get(FIRST_RUN_KEY)).toBe(true);
    expect(await openOnFirstRun(state, run, "debrief.debrief")).toBe(false);
    expect(await openOnFirstRun(state, run, "debrief.debrief")).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("asks once even if the page fails to open, and says so in the log", async () => {
    const state = memento();
    const lines: string[] = [];
    let asked = 0;
    const failing = async () => {
      asked++;
      throw new Error("no Get Started page");
    };
    expect(await openOnFirstRun(state, failing, "debrief.debrief", (l) => lines.push(l))).toBe(false);
    expect(await openOnFirstRun(state, failing, "debrief.debrief", (l) => lines.push(l))).toBe(false);
    expect(asked).toBe(1);
    expect(lines).toEqual(["walkthrough_open_on_install_failed"]);
  });
});
