/**
 * Integration test: real VS Code, the real extension, the real Python tool
 * service, on a demonstration catalogue. Run under a display (xvfb-run on CI);
 * set DEBRIEF_SCREENSHOTS to a folder to keep screenshots of each step.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { downloadAndUnzipVSCode, runTests } from "@vscode/test-electron";

const extension = path.resolve(__dirname, "..");
const repo = path.resolve(extension, "..");
const venvPython = path.join(repo, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = process.env.DEBRIEF_PYTHON || (existsSync(venvPython) ? venvPython : "python3");

const work = mkdtempSync(path.join(tmpdir(), "debrief-it-"));
const configFile = path.join(work, "config.json");
const catalogue = path.join(work, "exercise");

// The sample catalogue (DEP-08), built by the same code as everyone else's, and
// added to a configuration of its own.
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

// A clean, full-size window, so screenshots show Debrief and nothing else.
const userData = path.join(work, "user-data");
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
    "workbench.colorTheme": process.env.VSCODE_THEME || "Default Dark Modern",
  }),
);

const screenshots = process.env.DEBRIEF_SCREENSHOTS ? path.resolve(process.env.DEBRIEF_SCREENSHOTS) : "";
if (screenshots) mkdirSync(screenshots, { recursive: true });

async function main(): Promise<void> {
  const vscodeExecutablePath = await downloadAndUnzipVSCode(process.env.VSCODE_VERSION || "stable");
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: extension,
    extensionTestsPath: path.join(extension, "dist-test", "suite.js"),
    launchArgs: [
      work,
      `--extensions-dir=${path.join(work, "extensions")}`,
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-gpu",
      `--user-data-dir=${userData}`,
    ],
    extensionTestsEnv: {
      DEBRIEF_CONFIG: configFile,
      DEBRIEF_PYTHON: python,
      DEBRIEF_SCREENSHOTS: screenshots,
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
