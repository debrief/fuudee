/// <reference types="mocha" />
/**
 * What the tracer's suites share: the activated extension, serial 1 of the sample catalogue
 * opened (fresh, as the sample builder made it, where a suite needs that), screenshots, and
 * the waiting. Each feature is a Mocha suite of its own; DEBRIEF_IT_ONLY chooses some of them.
 */
import { execFileSync } from "node:child_process";
import { cpSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import type { OpenedPlot } from "../../src/catalogue.js";
import type { DebriefApi } from "../../src/extension.js";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The last step reached, by its test and screenshot: what a run that never finishes says it was doing. */
export const reached = { test: "starting", screenshot: "none yet" };

export async function screenshot(name: string, keepNotifications = false): Promise<void> {
  reached.screenshot = name;
  const folder = process.env.DEBRIEF_SCREENSHOTS;
  if (!folder || !process.env.DISPLAY) return;
  if (!keepNotifications) await vscode.commands.executeCommand("notifications.clearAll");
  await sleep(500);
  // The window does not fill the virtual screen; trim the empty border.
  execFileSync("import", ["-window", "root", "-trim", "+repage", path.join(folder, `${name}.png`)]);
}

export async function waitFor<T>(what: string, probe: () => T | undefined | Promise<T | undefined>, timeoutMs = 30000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(200);
  }
}

export const helpers = { waitFor, screenshot, sleep };

/**
 * Bearings' popped-out window, sized to fill the screen or moved off it, where xdotool is installed
 * (there is no window manager under xvfb to maximise it): the one visible X window that was not
 * there before it popped out ("before" notes them). Whether it was done.
 */
let windowsBefore: string[] | undefined;
export function poppedWindow(how: "before" | "fill" | "aside"): boolean {
  if (!process.env.DISPLAY) return false;
  try {
    const run = (...args: string[]) => execFileSync("xdotool", args, { encoding: "utf8" }).trim();
    const ids = run("search", "--onlyvisible", "--class", ".").split("\n").filter(Boolean);
    if (how === "before") return !!(windowsBefore = ids);
    const added = ids.filter((i) => !windowsBefore?.includes(i));
    console.log(`Windows that appeared on popping out: ${added.map((i) => `${i} ${run("getwindowgeometry", i).replace(/\s+/g, " ")}`).join("; ")}`);
    if (added.length !== 1) return false;
    const id = added[0];
    const [width, height] = run("getdisplaygeometry").split(" ");
    if (how === "fill") {
      run("windowmove", id, "0", "0");
      run("windowsize", id, width, height);
    } else run("windowmove", id, width, "0");
    return true;
  } catch {
    return false;
  }
}

export const extension = () => vscode.extensions.getExtension<DebriefApi>("debrief.debrief")!;

let activated: Promise<DebriefApi> | undefined;
/** The extension, activated, its tool service started. The first call is the window's first activation. */
export function debrief(): Promise<DebriefApi> {
  activated ??= (async () => {
    const api = await extension().activate();
    await api.ready;
    await waitFor("tools", () => {
      if (api.toolsProblem()) throw new Error(`Tools did not start: ${api.toolsProblem()}`);
      return api.tools();
    }, 120000);
    return api;
  })();
  return activated;
}

/** The sample catalogue (DEP-08), as run.ts built and configured it. */
export const sample = { id: "sample-exercise", location: process.env.DEBRIEF_SAMPLE ?? "" };
const serial1Folder = () => path.join(sample.location, "serial-1");

/** Serial 1's plot file, read as it is on disk now: its view (the island). */
export function island(): Record<string, unknown> & { time_window?: unknown; context_tracks?: string; tote?: unknown; narrative_on_map?: boolean } {
  return JSON.parse(readFileSync(path.join(serial1Folder(), "plot.geojson"), "utf8")).features.find((f: { properties: { kind: string } }) => f.properties.kind === "plot").properties.view;
}

export type Step = { seq: number; status: string; tool: string | null; notes?: string[] };
export const steps = () => vscode.commands.executeCommand<Step[]>("debrief.historySteps");
export type Row = { kind: string; current: boolean; nextToUndo: boolean; step: { seq: number } };
export const rows = () => vscode.commands.executeCommand<Row[]>("debrief.historyRows");

/** Every file under a folder, by its path under it. */
/**
 * Serial 1's files put back as the sample builder made them (run.ts kept a copy), and anything
 * added since removed. Everything in the folder goes first: the builder writes sources and media
 * read-only (SUB-10), and a copy cannot overwrite a read-only file except as root, whereas
 * removing one needs only its folder to be writable.
 */
function restoreSerial1(): void {
  const pristine = process.env.DEBRIEF_PRISTINE;
  if (!pristine) throw new Error("DEBRIEF_PRISTINE is not set: run the tracer through dist-test/run.js");
  const folder = serial1Folder();
  for (const entry of readdirSync(folder)) rmSync(path.join(folder, entry), { recursive: true, force: true });
  cpSync(pristine, folder, { recursive: true });
}

/**
 * Serial 1 of the sample, opened from the catalogue and drawn on the map. Fresh: as the sample
 * builder made it, one step in its history, whatever the suites before did to it; another plot
 * is opened while its files are put back, so no change is noticed as made elsewhere.
 */
export async function openSerial1({ fresh = true } = {}): Promise<OpenedPlot> {
  const api = await debrief();
  if (fresh) {
    const current = api.session.current;
    if (current?.store.id === sample.id && current.item.id === "serial-1") {
      await vscode.commands.executeCommand("debrief.openPlot", sample.id, "serial-2");
      await waitFor("serial 2, while serial 1 is put back", () => (api.session.current?.item.id === "serial-2" && api.mapShowing() === "serial-2") || undefined, 60000);
    }
    restoreSerial1();
  }
  await vscode.commands.executeCommand("debrief.openPlot", sample.id, "serial-1");
  const opened = await waitFor("serial 1", () => (api.session.current?.store.id === sample.id && api.session.current.item.id === "serial-1" && !api.session.current.revision ? api.session.current : undefined), 60000);
  if (fresh) await waitFor("serial 1's history as built", async () => (await steps()).length === 1 || undefined);
  await waitFor("the map to draw serial 1", () => api.mapShowing() === "serial-1" || undefined, 60000);
  await vscode.commands.executeCommand("notifications.clearAll");
  return opened;
}

/** The suites' names, in the order they run; the ones DEBRIEF_IT_ONLY asked for. */
export const known: string[] = [];
export const only = (process.env.DEBRIEF_IT_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * A feature's suite, run if DEBRIEF_IT_ONLY names it or names nothing; the smoke suite always.
 * Its tests run in order, and by default each builds on the ones before: once one fails, the
 * rest of its suite are skipped (they would fail for its reason), and the next suite runs.
 * An independent suite's tests run whatever the others did.
 */
export function feature(name: string, body: () => void, { independent = false } = {}): void {
  known.push(name);
  if (only.length && name !== "smoke" && !only.includes(name)) return;
  suite(name, function () {
    if (!independent) {
      let failed: string | undefined;
      setup(function () {
        if (failed) {
          console.log(`    (skipped: it builds on "${failed}", which failed)`);
          this.skip();
        }
      });
      teardown(function () {
        if (this.currentTest?.state === "failed") failed ??= this.currentTest.title;
      });
    }
    body();
  });
}
