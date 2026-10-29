/**
 * Inside VS Code with Debrief installed from its VSIX (vsix-run.ts): the installed extension,
 * of this version, starts its own Python with none on the PATH; that Python answers (the
 * tools listed), makes the walkthrough's copy of the sample, which opens on the map, and runs
 * a tool on it.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function screenshot(name: string): Promise<void> {
  const folder = process.env.DEBRIEF_SCREENSHOTS;
  if (!folder || process.platform !== "linux" || !process.env.DISPLAY) return;
  await vscode.commands.executeCommand("notifications.clearAll");
  await sleep(500);
  try {
    execFileSync("import", ["-window", "root", "-trim", "+repage", path.join(folder, `${name}.png`)]);
  } catch (error) {
    console.log(`No screenshot ${name}: ${(error as Error).message}`);
  }
}

async function waitFor<T>(what: string, probe: () => T | undefined | Promise<T | undefined>, timeoutMs = 30000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(200);
  }
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<DebriefApi>("debrief.debrief");
  assert.ok(extension, "Debrief is installed");
  const extensionsDir = path.resolve(process.env.DEBRIEF_EXTENSIONS_DIR ?? "");
  assert.ok(path.resolve(extension.extensionPath).startsWith(extensionsDir + path.sep), `installed from the VSIX, not run from source: ${extension.extensionPath}`);
  assert.equal(extension.packageJSON.version, process.env.DEBRIEF_EXPECTED_VERSION);
  console.log(`Debrief ${extension.packageJSON.version} at ${extension.extensionPath}`);

  // No Python for the extension host but the one in the VSIX.
  for (const name of process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"]) {
    const probe = spawnSync(name, ["--version"], { encoding: "utf8" });
    assert.ok(probe.error || probe.status !== 0, `${name} is on the PATH: ${probe.stdout}${probe.stderr}`);
  }
  assert.equal(process.env.DEBRIEF_PYTHON ?? "", "");

  const api = await extension.activate();
  await api.ready;
  const chosen = api.python();
  console.log(`Python: ${chosen.python}`);
  assert.equal(chosen.bundled, true, "the bundled Python is chosen");
  assert.ok(path.resolve(chosen.python).startsWith(path.resolve(extension.extensionPath) + path.sep));

  // The Python side answers: the tool service starts and lists its tools.
  const listing = await waitFor(
    "tools",
    () => {
      if (api.toolsProblem()) throw new Error(`Tools did not start: ${api.toolsProblem()}`);
      return api.tools();
    },
    120000,
  );
  const names = listing.tools.map((t) => t.name);
  for (const tool of ["core.closest_approach", "core.track_summary"]) assert.ok(names.includes(tool), `${tool} is listed: ${names.join(", ")}`);

  // The installed version, in the Extensions view.
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.commands.executeCommand("workbench.view.extensions");
  await vscode.commands.executeCommand("workbench.extensions.search", "@installed");
  await vscode.commands.executeCommand("extension.open", "debrief.debrief");
  await sleep(4000);
  await screenshot("vsix-01-installed");

  // A plot: the first walkthrough's copy of serial 1, made by the bundled Python's debrief-sample.
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  assert.equal(await vscode.commands.executeCommand("debrief.walkthrough.open", "explore", { fresh: true }), undefined);
  await waitFor("the copy of serial 1 on the map", () => (api.session.current?.item.id === "serial-1-explore" && api.mapShowing() === "serial-1-explore") || undefined, 120000);
  await vscode.commands.executeCommand("workbench.view.extension.debrief");
  await sleep(3000);
  await screenshot("vsix-02-plot");

  // A tool run by that Python: closest approach of BLUE ONE and RED ONE, one step in the history.
  await vscode.commands.executeCommand("debrief.select", ["track-blue-one", "track-red-one"]);
  await waitFor("closest approach on offer", () => api.offered().includes("core.closest_approach") || undefined);
  assert.equal(await vscode.commands.executeCommand("debrief.runTool", "core.closest_approach", {}), undefined);
  await waitFor("the closest approach line", () => api.session.current?.plot.features.some((f) => f.id.startsWith("cpa-")) || undefined, 60000);
  assert.equal(api.session.current!.plot.provenance.at(-1)?.tool?.name, "core.closest_approach");
  await sleep(3000);
  await screenshot("vsix-03-tool");
  console.log("The installed VSIX started its own Python, opened a plot and ran a tool.");
}
