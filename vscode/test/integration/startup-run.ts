/**
 * Startup measurements (docs/notes/webview-startup.md): how long the Debrief sidebar's
 * webviews take to load, launched in real VS Code as the integration test is. Each
 * scenario is a copy of the extension whose package.json expands or collapses the three
 * webview views; each run is a first launch on a fresh profile, then a second launch on
 * the same profile, with the caches the first left (startup.ts). Run under a display:
 *
 *   xvfb-run -a -s "-screen 0 1600x1000x24" npm run measure:startup -- [runs] [scenario...]
 *   node dist-test/startup-run.js --summarise <startup-timings.jsonl> [runs] [scenario...]
 *
 * Prints, for each scenario and launch, the median and 90th percentile of each time, and
 * keeps every launch's marks in startup-timings.jsonl in the work folder it names.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { downloadAndUnzipVSCode, runTests } from "@vscode/test-electron";

const extension = path.resolve(__dirname, "..");
const repo = path.resolve(extension, "..");
const venvPython = path.join(repo, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = process.env.DEBRIEF_PYTHON || (existsSync(venvPython) ? venvPython : "python3");

const VIEWS = ["debrief.time", "debrief.tote", "debrief.timeline"];
interface Scenario {
  /** The webview views expanded; the rest are collapsed. */
  expanded: string[];
  /** The sidebar opened before the plot, as when VS Code starts with it showing; else after. */
  sidebarFirst?: boolean;
}
const SCENARIOS: Record<string, Scenario> = {
  default: { expanded: ["debrief.time", "debrief.timeline"] }, // as package.json has it: the Tote collapsed
  all: { expanded: VIEWS },
  time: { expanded: ["debrief.time"] },
  tote: { expanded: ["debrief.tote"] },
  timeline: { expanded: ["debrief.timeline"] },
  "default-sidebar-first": { expanded: ["debrief.time", "debrief.timeline"], sidebarFirst: true },
};

const args = process.argv.slice(2);
const runs = Number(args.find((a) => /^\d+$/.test(a)) ?? 5);
const chosen = args.filter((a) => a in SCENARIOS);
const scenarios = chosen.length ? chosen : Object.keys(SCENARIOS);

const summariseOnly = args.indexOf("--summarise");
const work = summariseOnly >= 0 ? path.dirname(path.resolve(args[summariseOnly + 1])) : mkdtempSync(path.join(tmpdir(), "debrief-startup-"));
const configFile = path.join(work, "config.json");
const out = summariseOnly >= 0 ? path.resolve(args[summariseOnly + 1]) : path.join(work, "startup-timings.jsonl");

/** The sample catalogue (DEP-08), in a configuration of its own, as the integration test has it. */
function prepare(): void {
  const catalogue = path.join(work, "exercise");
  execFileSync(python, ["-m", "debrief_sample", "build", catalogue], { stdio: "inherit" });
  execFileSync(
    python,
    [
      "-c",
      "import sys; from pathlib import Path; from debrief_config import add_store, update_config; " +
        "update_config(lambda c: add_store(c, title='Sample exercise', location=sys.argv[1])[0], Path(sys.argv[2]))",
      catalogue,
      configFile,
    ],
    { stdio: "inherit" },
  );
}

/** A copy of the extension with this scenario's views expanded. */
function extensionFor(scenario: string): string {
  const folder = path.join(work, `extension-${scenario}`);
  if (existsSync(folder)) return folder;
  mkdirSync(folder);
  const manifest = JSON.parse(readFileSync(path.join(extension, "package.json"), "utf8"));
  for (const view of manifest.contributes.views.debrief) {
    if (!VIEWS.includes(view.id)) continue;
    if (SCENARIOS[scenario].expanded.includes(view.id)) delete view.visibility;
    else view.visibility = "collapsed";
  }
  writeFileSync(path.join(folder, "package.json"), JSON.stringify(manifest, null, 2));
  cpSync(path.join(extension, "dist"), path.join(folder, "dist"), { recursive: true });
  cpSync(path.join(extension, "media"), path.join(folder, "media"), { recursive: true });
  return folder;
}

async function launch(vscodeExecutablePath: string, scenario: string, run: number): Promise<void> {
  const launchWork = path.join(work, `${scenario}-${run}`);
  const userData = path.join(launchWork, "user-data");
  mkdirSync(path.join(userData, "User"), { recursive: true });
  writeFileSync(
    path.join(userData, "User", "settings.json"),
    JSON.stringify({
      "window.newWindowDimensions": "maximized",
      "workbench.startupEditor": "none",
      "workbench.secondarySideBar.defaultVisibility": "hidden",
      "workbench.tips.enabled": false,
      "chat.disableAIFeatures": true,
      "security.workspace.trust.enabled": false,
      "update.mode": "none",
      "telemetry.telemetryLevel": "off",
    }),
  );
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: extensionFor(scenario),
    extensionTestsPath: path.join(extension, "dist-test", "startup.js"),
    launchArgs: [
      launchWork,
      `--extensions-dir=${path.join(launchWork, "extensions")}`,
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-gpu",
      `--user-data-dir=${userData}`,
    ],
    extensionTestsEnv: {
      DEBRIEF_CONFIG: configFile,
      DEBRIEF_PYTHON: python,
      DEBRIEF_STARTUP_TIMING: "1",
      DEBRIEF_STARTUP_OUT: path.join(launchWork, "timings.jsonl"),
      DEBRIEF_STARTUP_EXPANDED: SCENARIOS[scenario].expanded.join(","),
      DEBRIEF_STARTUP_SIDEBAR_FIRST: SCENARIOS[scenario].sidebarFirst ? "1" : "",
    },
  });
}

/** A first launch on a fresh profile, then a second on the same one; both launches' marks kept. */
async function launchTwice(vscodeExecutablePath: string, scenario: string, run: number): Promise<void> {
  await launch(vscodeExecutablePath, scenario, run);
  await launch(vscodeExecutablePath, scenario, run);
  for (const line of readFileSync(path.join(work, `${scenario}-${run}`, "timings.jsonl"), "utf8").split("\n").filter(Boolean)) {
    writeFileSync(out, `${JSON.stringify({ scenario, run, ...JSON.parse(line) })}\n`, { flag: "a" });
  }
}

interface Row {
  scenario: string;
  phase: "cold" | "relaunch";
  expanded: string[];
  sidebarFirst: boolean;
  sidebarAsked: number;
  plotAsked: number;
  allDrawn?: number;
  timings: { marks: Record<string, Record<string, number>> };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** The times each launch gives, by name: milliseconds, from the moment the name says. */
function measures(row: Row): Record<string, number | undefined> {
  const m = row.timings.marks;
  const ext = m.extension ?? {};
  const since = (at: number | undefined, zero: number) => (at === undefined ? undefined : at - zero);
  const result: Record<string, number | undefined> = {
    "activation (activate_start to activate_end)": ext.activate_end - ext.activate_start,
    "activation done, from extension host start": ext.activate_end,
    "map: ready, from panel created": since(m.map?.ready, m.map?.resolve),
    "map: plot drawn, from panel created": since(m.map?.page_rendered, m.map?.resolve),
  };
  // From the sidebar being opened: with the plot open, or (sidebar first) before the extension is active.
  for (const view of VIEWS) {
    const v = m[view];
    const name = view.replace("debrief.", "");
    result[`${name}: resolved, from sidebar opened`] = since(v?.resolve, row.sidebarAsked);
    result[`${name}: script started, from sidebar opened`] = since(v?.page_script, row.sidebarAsked);
    result[`${name}: ready, from sidebar opened`] = since(v?.ready, row.sidebarAsked);
    result[`${name}: page load (resolved to ready)`] = since(v?.ready, v?.resolve);
    if (!row.sidebarFirst) result[`${name}: plot drawn, from sidebar opened`] = since(v?.page_rendered, row.sidebarAsked);
    else result[`${name}: plot drawn, from plot opened`] = since(v?.page_rendered, row.plotAsked);
  }
  const ready = row.expanded.map((v) => m[v]?.ready);
  result["sidebar loaded (every expanded view ready), from sidebar opened"] = ready.every((r) => r !== undefined)
    ? Math.max(...ready) - row.sidebarAsked
    : undefined;
  const drawn = row.expanded.map((v) => m[v]?.page_rendered);
  const allDrawn = drawn.every((d) => d !== undefined) ? Math.max(...drawn) : undefined;
  if (!row.sidebarFirst) result["sidebar usable (every expanded view drew the plot), from sidebar opened"] = since(allDrawn, row.sidebarAsked);
  else result["sidebar usable (every expanded view drew the plot), from plot opened"] = since(allDrawn, row.plotAsked);
  return result;
}

function summarise(): void {
  const rows: Row[] = readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  console.log(`\nStartup measurements: ${cpus().length} CPUs (${cpus()[0]?.model}). Milliseconds: median / 90th percentile.`);
  for (const scenario of scenarios) {
    for (const phase of ["cold", "relaunch"] as const) {
      const these = rows.filter((r) => r.scenario === scenario && r.phase === phase);
      if (!these.length) continue;
      console.log(`\n${scenario} (${phase}, ${these.length} runs; expanded: ${these[0].expanded.join(", ")})`);
      for (const name of Object.keys(measures(these[0]))) {
        const values = these.map((r) => measures(r)[name]).filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
        const shown = values.length ? `${percentile(values, 50).toFixed(0)} / ${percentile(values, 90).toFixed(0)}` : "not loaded";
        console.log(`  ${name.padEnd(80)} ${shown}${values.length && values.length < these.length ? ` (${values.length} runs)` : ""}`);
      }
    }
  }
  console.log(`\nEvery launch's marks: ${out}`);
}

async function main(): Promise<void> {
  if (summariseOnly >= 0) return summarise();
  prepare();
  const vscodeExecutablePath = await downloadAndUnzipVSCode(process.env.VSCODE_VERSION || "1.141.0");
  for (let run = 1; run <= runs; run++) {
    // Scenarios interleaved, so a slow moment on the machine does not fall on one scenario's runs.
    for (const scenario of scenarios) await launchTwice(vscodeExecutablePath, scenario, run);
  }
  summarise();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
