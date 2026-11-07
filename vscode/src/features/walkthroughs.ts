/**
 * VS Code's walkthroughs (CAP-25): the Get Started page, each walkthrough on a fresh copy of the
 * sample in the extension's own storage; the first opened on the first run after install; and a
 * step's command run on that copy. VS Code's own (the playground has its tours); out of activate()
 * (review of 7 Nov 2026, finding 2), given what it needs of it.
 */
import * as vscode from "vscode";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { addStore, removeStore, updateConfig } from "@debrief/config";
import type { KnownStore } from "@debrief/schemas";
import { AFTER_OPEN, BESIDE, LOG_FILE, openedEvent, openOnFirstRun, prepare, TOURS, type WalkthroughProgress } from "../walkthroughs.js";
import { NO_SOLUTION, withSolution } from "../../walkthroughs/contribute.mjs";
import type { BearingsView } from "../panels/bearingsview.js";
import type { ToolService } from "../service.js";
import type { Session } from "../session.js";
import type { CataloguesProvider } from "../views/catalogues.js";

/** What the walkthroughs need of activate(). */
export interface WalkthroughDeps {
  context: vscode.ExtensionContext;
  session: Session;
  configFile: string | undefined;
  walkthroughs: WalkthroughProgress;
  catalogues: CataloguesProvider;
  bearingsView: BearingsView;
  /** A command registered with VS Code (VS Code's own: the playground has none of these). */
  command(name: string, handler: (...args: never[]) => unknown): void;
  /** A problem said as a warning, and returned. */
  report(problem: string | undefined): string | undefined;
  log(line: string): void;
  /** The Python the tool service runs, to make a walkthrough's copy. */
  python(): string;
  /** The tool service, or undefined with the analyst told how to start it. */
  needService(): ToolService | undefined;
  walkthroughFolder(tour: string): string;
  walkthroughStore(tour: string): KnownStore | undefined;
  tickHere(event: string): void;
}

export function walkthroughCommands(deps: WalkthroughDeps) {
  const { context, session, configFile, walkthroughs, catalogues, bearingsView, command, report, log, python, needService, walkthroughFolder, walkthroughStore, tickHere } = deps;
  // --- Walkthroughs (CAP-25): the Get Started page, each on a fresh copy of the sample -----------
  // The steps are package.json's contributes.walkthroughs, written from walkthroughs/tours.json.
  /** Which walkthrough: the one named, or one the analyst picks. */
  const pickTour = async (tour?: string) =>
    TOURS.find((t) => t.id === tour) ??
    (
      await vscode.window.showQuickPick(
        TOURS.map((t) => ({ label: t.title, detail: t.description, t })),
        { title: "Debrief walkthroughs", placeHolder: "Each works on a fresh copy of the sample exercise; the sample itself never changes" },
      )
    )?.t;
  /**
   * The editor group showing the Get Started page, if one does. VS Code's API has no type for the
   * page's tab (its input is undefined), so it is known by that and its label.
   */
  const walkthroughGroup = () =>
    vscode.window.tabGroups.all.find((g) => g.tabs.some((t) => t.input === undefined && (/^(Welcome|Get Started|Walkthrough)/.test(t.label) || TOURS.some((w) => t.label === w.title))));
  const FOCUS_GROUP = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"].map((n) => `workbench.action.focus${n}EditorGroup`);
  const focusWalkthrough = async () => {
    // The tabs reach the extension a moment after the page opens: wait for it, up to 2 s.
    let group = walkthroughGroup();
    for (let i = 0; !group && i < 20; i++) group = await new Promise<vscode.TabGroup | undefined>((done) => setTimeout(() => done(walkthroughGroup()), 100));
    if (group && !group.isActive && FOCUS_GROUP[group.viewColumn - 1]) await vscode.commands.executeCommand(FOCUS_GROUP[group.viewColumn - 1]);
  };
  /**
   * Open a walkthrough beside the map, the keyboard on it (product owner, 28 Oct 2026). Opened
   * beside (toSide), VS Code keeps the focus where it was, so Debrief then focuses the page's
   * group. A page open already is reused where it is: its group focused, the walkthrough opened there.
   */
  const showWalkthrough = async (tour: string) => {
    const id = `${context.extension.id}#${tour}`;
    if (walkthroughGroup()) {
      await focusWalkthrough();
      await vscode.commands.executeCommand("workbench.action.openWalkthrough", id, false);
    } else {
      await vscode.commands.executeCommand("workbench.action.openWalkthrough", id, BESIDE);
      await focusWalkthrough();
    }
  };
  command("debrief.walkthroughs", async (tour?: string) => {
    const chosen = await pickTour(tour);
    if (chosen) await showWalkthrough(chosen.id);
  });
  // The first activation after install opens the first walkthrough on the Get Started page, once
  // only, by a flag in global state: where a newcomer gains an overall understanding (product
  // owner, 22 Oct 2026). Later starts leave it closed. Beside, the keyboard on it, as above.
  const firstRun = () =>
    openOnFirstRun(context.globalState, async (command, ...args) => {
      await vscode.commands.executeCommand(command, ...args);
      await focusWalkthrough();
    }, context.extension.id, (line) => log(line));
  const openedOnActivation = firstRun();
  /**
   * Open the copy of serial 1 a walkthrough works on: a fresh one, built by debrief-sample
   * into a catalogue of its own (Walkthrough: …), or the analyst's copy from before, as they
   * choose. Agents and tests pass fresh. Returns the problem, if there is one.
   */
  /** Walkthroughs whose copy is being made: pressing the button again meanwhile makes no second one. */
  const making = new Set<string>();
  command("debrief.walkthrough.open", async (tour?: string, given?: { fresh?: boolean }) => {
    const chosen = await pickTour(tour);
    if (!chosen) return undefined;
    if (!needService()) return "Debrief's tool service is not running.";
    if (making.has(chosen.id)) return "The copy is being made already.";
    making.add(chosen.id);
    try {
      return await openWalkthroughCopy(chosen, given);
    } finally {
      making.delete(chosen.id);
    }
  });
  async function openWalkthroughCopy(chosen: (typeof TOURS)[number], given?: { fresh?: boolean }): Promise<string | undefined> {
    const folder = walkthroughFolder(chosen.id);
    let store = walkthroughStore(chosen.id);
    let fresh = !store || !existsSync(path.join(folder, "catalogue"));
    if (!fresh) {
      if (given?.fresh !== undefined) fresh = given.fresh;
      else {
        const again = "Start again with a fresh copy";
        const choice = await vscode.window.showInformationMessage(
          `You have a copy of serial 1 for ${chosen.title} already.`,
          { modal: true, detail: "A fresh copy starts the walkthrough again, and your changes to the old copy are lost. The sample itself never changes." },
          again,
          "Carry on with my copy",
        );
        if (!choice) return undefined;
        fresh = choice === again;
      }
    }
    if (fresh) {
      // Starting again: its steps unticked, on the Get Started page too (panel review, 17 Oct 2026).
      walkthroughs.forgetTour(chosen.id);
      try {
        if (store) {
          const old = store.id;
          updateConfig((c) => removeStore(c, old), configFile);
        }
        await rm(folder, { recursive: true, force: true });
        await mkdir(path.dirname(folder), { recursive: true });
        const made = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Making a fresh copy of serial 1 for ${chosen.title}…` },
          () => prepare(python(), folder, chosen.id),
        );
        updateConfig((c) => {
          const [next, added] = addStore(c, { title: made.catalogue_title, location: made.catalogue });
          store = added;
          return next;
        }, configFile);
      } catch (error) {
        return report(`The walkthrough's copy could not be made: ${(error as Error).message}.`);
      }
    }
    catalogues.refresh();
    const item = `serial-1-${chosen.id}`;
    await vscode.commands.executeCommand("debrief.openPlot", store!.id, item);
    const opened = session.current;
    if (opened?.store.id !== store!.id || opened.item.id !== item) return "The walkthrough's copy could not be opened.";
    tickHere(openedEvent(chosen.id));
    const after = AFTER_OPEN[chosen.id];
    if (after) await vscode.commands.executeCommand(...after);
    return undefined;
  }
  /**
   * A walkthrough step's button: on the walkthrough's copy, opened first if another plot is open,
   * then the command the step names (panel review, 17 Oct 2026). Refused, and said, before the
   * copy is made.
   */
  command("debrief.walkthrough.do", async (tour?: string, name?: string, ...args: unknown[]) => {
    const chosen = TOURS.find((t) => t.id === tour);
    const store = chosen && walkthroughStore(chosen.id);
    if (!chosen || !name?.startsWith("debrief.")) return report("That is not a walkthrough's step.");
    if (!store || !existsSync(path.join(walkthroughFolder(chosen.id), "catalogue"))) return report(`Open a copy of serial 1 for ${chosen.title} first: its first step.`);
    const item = `serial-1-${chosen.id}`;
    if (session.current?.store.id !== store.id || session.current.item.id !== item) {
      await vscode.commands.executeCommand("debrief.openPlot", store.id, item);
      if (session.current?.item.id !== item) return report("The walkthrough's copy could not be opened.");
      void vscode.window.showInformationMessage(`${session.current.item.properties.title ?? item} is open: the walkthrough works on its copy, not on the plot that was open.`);
    }
    // A step that needs the walkthrough's TMA solution: the latest in its copy, once made.
    const given = withSolution(args, session.current?.plot.features);
    if (!given) return report(NO_SOLUTION);
    // Bearings and TMA is read in Bearings, in the panel below the editor: a step's button that
    // opens a form shows it too, if it was closed (showBearings brings it there itself).
    if (chosen.id === "tma" && name !== "debrief.showBearings") await bearingsView.reveal();
    return vscode.commands.executeCommand(name, ...given);
  });
  /** Import and collate: import BLUE ONE's navigation log, waiting beside the walkthrough's catalogue, as any REP file is imported. */
  command("debrief.walkthrough.importLog", async (given?: { modes?: string }) => {
    const store = walkthroughStore("collate");
    const log = path.join(walkthroughFolder("collate"), LOG_FILE);
    if (!store || !existsSync(log)) return report("Open the copy of serial 1 for Import and collate first: it brings the navigation log with it.");
    return vscode.commands.executeCommand("debrief.importRep", undefined, { store: store.id, path: log, ...given });
  });

  return { openedOnActivation, firstRun };
}
