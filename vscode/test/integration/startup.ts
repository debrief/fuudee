/**
 * One launch of the startup measurements (startup-run.ts; docs/notes/webview-startup.md).
 *
 * The Explorer shows at first. Activate, open serial 1 of the sample exercise (the map),
 * then open the Debrief sidebar, and wait until every view expected to be expanded has
 * drawn the plot. With DEBRIEF_STARTUP_SIDEBAR_FIRST, open the sidebar first instead, as
 * when VS Code starts with it showing, and the plot after. The first launch is on a fresh profile; the second, on the same one, has
 * the caches the first left (Chromium's code and script caches). VS Code keeps no layout
 * between launches under test (its storage is not written), and Developer: Reload Window
 * ends an extension test run, so the sidebar is opened the same way both times. Each
 * launch's marks (src/startup.ts) are appended to DEBRIEF_STARTUP_OUT as one line of JSON.
 */
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Milliseconds since the extension host started, as in src/startup.ts. */
const now = () => Math.round(performance.now() * 10) / 10;

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 30000): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value || Date.now() > deadline) return value;
    await sleep(25);
  }
}

export async function run(): Promise<void> {
  const out = process.env.DEBRIEF_STARTUP_OUT!;
  const expanded = (process.env.DEBRIEF_STARTUP_EXPANDED ?? "").split(",").filter(Boolean);
  const marker = `${out}.first`;
  const relaunch = existsSync(marker);
  // The sidebar first, as when VS Code starts with it showing: it activates the extension.
  const sidebarFirst = !!process.env.DEBRIEF_STARTUP_SIDEBAR_FIRST;
  const record: Record<string, unknown> = { phase: relaunch ? "relaunch" : "cold", expanded, sidebarFirst, suiteStart: now() };
  const extension = vscode.extensions.getExtension<DebriefApi>("debrief.debrief")!;
  if (sidebarFirst) {
    record.sidebarAsked = now();
    await vscode.commands.executeCommand("workbench.view.extension.debrief");
  }
  record.wasActive = extension.isActive;
  const api = await extension.activate();
  const marks = () => api.startupTimings().marks;
  const drawn = (view: string) => marks()[view]?.page_rendered;
  if (sidebarFirst) record.viewsLoaded = await waitFor(() => (expanded.every((v) => marks()[v]?.shown) ? now() : undefined));

  await api.ready;
  record.toolsReady = now();
  record.plotAsked = now();
  await vscode.commands.executeCommand("debrief.openPlot", "sample-exercise", "serial-1");
  await waitFor(() => drawn("map"));
  record.mapDrawn = now();
  if (!sidebarFirst) {
    await sleep(1000);
    record.sidebarAsked = now();
    await vscode.commands.executeCommand("workbench.view.extension.debrief");
  }
  record.allDrawn = await waitFor(() => (expanded.every(drawn) ? now() : undefined));
  // Long enough for a collapsed view to load, were VS Code to load it anyway.
  await sleep(3000);
  record.timings = api.startupTimings();
  appendFileSync(out, `${JSON.stringify(record)}\n`);
  if (!relaunch) writeFileSync(marker, "");
}
