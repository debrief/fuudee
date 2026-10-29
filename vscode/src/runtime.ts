/**
 * Which Python Debrief runs (NFR-12, DEP-01, DEP-02). A VSIX for one platform carries its own
 * Python, with Debrief's Python packages installed in it, in the extension's python folder
 * (scripts/bundle-python.mjs): analysts need no Python of their own. A developer can point
 * Debrief at another with DEBRIEF_PYTHON or the Debrief: Python setting; running from source,
 * with nothing bundled, it is python3 (python on Windows), as before.
 */
import { accessSync, chmodSync, constants, existsSync, statSync } from "node:fs";
import path from "node:path";

/** The bundled interpreter's place in the extension, by platform: the real file, as a VSIX holds no links. */
export function bundledPythonPath(extensionPath: string, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? path.join(extensionPath, "python", "python.exe") : path.join(extensionPath, "python", "bin", "python3.12");
}

/** The bundled interpreter, if this install has one, made runnable should unpacking have lost that. */
export function bundledPython(extensionPath: string, platform: NodeJS.Platform = process.platform): string | undefined {
  const python = bundledPythonPath(extensionPath, platform);
  if (!existsSync(python)) return undefined;
  if (platform !== "win32") {
    try {
      accessSync(python, constants.X_OK);
    } catch {
      try {
        chmodSync(python, statSync(python).mode | 0o755);
      } catch {
        // Left as it is; starting it says why it cannot run.
      }
    }
  }
  return python;
}

export interface PythonChoice {
  python: string;
  /** Whether it is the Python bundled with this install. */
  bundled: boolean;
  /** Changes to the environment it runs in: for the bundled one, nothing of another Python's. */
  env: Record<string, string | undefined>;
}

/**
 * The Python to run: DEBRIEF_PYTHON, then the setting, then (installed from a VSIX) the bundled
 * one, then python3 or python on the PATH. Running from source (development or tests), the
 * bundled one is never chosen, so a python folder left by packaging changes nothing there.
 */
export function choosePython(options: {
  fromEnv?: string;
  fromSetting?: string;
  extensionPath: string;
  installed: boolean;
  platform?: NodeJS.Platform;
}): PythonChoice {
  const platform = options.platform ?? process.platform;
  const chosen = options.fromEnv || options.fromSetting;
  if (chosen) return { python: chosen, bundled: false, env: {} };
  const bundled = options.installed ? bundledPython(options.extensionPath, platform) : undefined;
  if (bundled) {
    // Another Python's settings would break this one or put its packages first.
    return { python: bundled, bundled: true, env: { PYTHONHOME: undefined, PYTHONPATH: undefined, PYTHONSTARTUP: undefined, PYTHONNOUSERSITE: "1" } };
  }
  return { python: platform === "win32" ? "python" : "python3", bundled: false, env: {} };
}
