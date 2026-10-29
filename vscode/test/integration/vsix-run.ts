/**
 * The packaged extension, as an analyst gets it (DEP-01, DEP-02): a platform's VSIX installed
 * into a clean VS Code with --install-extension, then started with no Python on the PATH and
 * nothing of a developer's set, so only the Python inside the VSIX can answer. Runs
 * vsix-smoke.ts in that window. On Linux run it under a display (xvfb-run on CI); set
 * DEBRIEF_SCREENSHOTS to a folder to keep screenshots.
 *
 *   node dist-test/vsix-run.js vsix/debrief-linux-x64-0.1.0.vsix
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";

const extension = path.resolve(__dirname, "..");
const vsix = path.resolve(process.argv[2] ?? process.env.DEBRIEF_VSIX ?? "");
if (!vsix.endsWith(".vsix") || !existsSync(vsix)) {
  console.error(`No VSIX at ${vsix}: give its path, as node dist-test/vsix-run.js vsix/debrief-linux-x64-0.1.0.vsix`);
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(path.join(extension, "package.json"), "utf8")) as { version: string };

const work = mkdtempSync(path.join(tmpdir(), "debrief-vsix-"));
const extensionsDir = path.join(work, "extensions");
const userData = path.join(work, "user-data");
const folder = path.join(work, "workspace");
for (const made of [extensionsDir, path.join(userData, "User"), folder]) mkdirSync(made, { recursive: true });
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
    "extensions.autoUpdate": false,
    "extensions.autoCheckUpdates": false,
    "telemetry.telemetryLevel": "off",
    "workbench.colorTheme": process.env.VSCODE_THEME || "Default Dark Modern",
  }),
);
// The test runner needs an extension under development; this one is empty, so Debrief itself
// is the installed one.
const runner = path.join(work, "runner");
mkdirSync(runner);
writeFileSync(path.join(runner, "package.json"), JSON.stringify({ name: "vsix-smoke", publisher: "debrief-test", version: "0.0.0", engines: { vscode: "^1.95.0" } }));

// A PATH with no Python on it: an empty folder, with only the screenshot tools on Linux and
// Windows' own system folder.
const bin = path.join(work, "bin");
mkdirSync(bin);
if (process.platform === "linux") {
  for (const tool of ["import", "xdotool"]) {
    try {
      const found = execFileSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).trim();
      if (found) symlinkSync(found, path.join(bin, tool));
    } catch {
      // Not installed: no screenshots, and the smoke test runs the same.
    }
  }
}
const cleanPath = process.platform === "win32" ? [bin, path.join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(";") : bin;

const screenshots = process.env.DEBRIEF_SCREENSHOTS ? path.resolve(process.env.DEBRIEF_SCREENSHOTS) : "";
if (screenshots) mkdirSync(screenshots, { recursive: true });

async function main(): Promise<void> {
  const vscodeExecutablePath = await downloadAndUnzipVSCode(process.env.VSCODE_VERSION || "1.141.0");
  // Installed as an analyst would: code --install-extension debrief-<platform>-<version>.vsix.
  const [cli] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const install = [`--extensions-dir=${extensionsDir}`, `--user-data-dir=${userData}`, "--install-extension", vsix];
  if (process.platform === "win32") execFileSync(`"${cli}" ${install.map((a) => `"${a}"`).join(" ")}`, { stdio: "inherit", shell: "cmd.exe" });
  else execFileSync(cli, install, { stdio: "inherit" });
  const installed = readdirSync(extensionsDir).filter((name) => name.startsWith("debrief.debrief-"));
  console.log(`Installed: ${installed.join(", ")}`);
  if (installed.length !== 1) throw new Error(`Expected Debrief installed once in ${extensionsDir}, found ${installed.length}`);

  // Nothing of a developer's Python reaches the window: no Python on the PATH, no DEBRIEF_PYTHON,
  // and VS Code does not read a login shell's PATH back in (--force-disable-user-env).
  for (const name of ["DEBRIEF_PYTHON", "PYTHONHOME", "PYTHONPATH", "VIRTUAL_ENV", "CONDA_PREFIX"]) delete process.env[name];
  process.env.PATH = cleanPath;
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: runner,
    extensionTestsPath: path.join(extension, "dist-test", "vsix-smoke.js"),
    launchArgs: [
      folder,
      `--extensions-dir=${extensionsDir}`,
      `--user-data-dir=${userData}`,
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-gpu",
      "--force-disable-user-env",
    ],
    extensionTestsEnv: {
      DEBRIEF_CONFIG: path.join(work, "config.json"),
      DEBRIEF_EXTENSIONS_DIR: extensionsDir,
      DEBRIEF_EXPECTED_VERSION: version,
      DEBRIEF_SCREENSHOTS: screenshots,
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
