import { chmodSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bundledPython, bundledPythonPath, choosePython } from "../../src/runtime.js";

/** An extension folder with a stand-in for the bundled interpreter. */
function withBundled(platform: NodeJS.Platform): string {
  const extension = mkdtempSync(path.join(tmpdir(), "debrief-runtime-"));
  const python = bundledPythonPath(extension, platform);
  mkdirSync(path.dirname(python), { recursive: true });
  writeFileSync(python, "");
  return extension;
}

describe("the Python Debrief runs", () => {
  it("is found where the VSIX puts it, by platform", () => {
    expect(bundledPythonPath("/ext", "linux")).toBe(path.join("/ext", "python", "bin", "python3.12"));
    expect(bundledPythonPath("/ext", "darwin")).toBe(path.join("/ext", "python", "bin", "python3.12"));
    expect(bundledPythonPath("/ext", "win32")).toBe(path.join("/ext", "python", "python.exe"));
  });

  it("is the bundled one when installed, with nothing of another Python's", () => {
    const extension = withBundled("linux");
    const choice = choosePython({ extensionPath: extension, installed: true, platform: "linux" });
    expect(choice.python).toBe(bundledPythonPath(extension, "linux"));
    expect(choice.bundled).toBe(true);
    expect(choice.env).toMatchObject({ PYTHONHOME: undefined, PYTHONPATH: undefined, PYTHONNOUSERSITE: "1" });
  });

  it("is a developer's choice before the bundled one: DEBRIEF_PYTHON, then the setting", () => {
    const extension = withBundled("linux");
    expect(choosePython({ fromEnv: "/venv/python", fromSetting: "/other", extensionPath: extension, installed: true, platform: "linux" })).toEqual({ python: "/venv/python", bundled: false, env: {} });
    expect(choosePython({ fromEnv: "", fromSetting: "/other", extensionPath: extension, installed: true, platform: "linux" }).python).toBe("/other");
  });

  it("is python3, or python on Windows, from source or with nothing bundled, as before", () => {
    const extension = withBundled("linux");
    expect(choosePython({ extensionPath: extension, installed: false, platform: "linux" }).python).toBe("python3");
    const empty = mkdtempSync(path.join(tmpdir(), "debrief-runtime-"));
    expect(choosePython({ extensionPath: empty, installed: true, platform: "linux" })).toEqual({ python: "python3", bundled: false, env: {} });
    expect(choosePython({ extensionPath: empty, installed: true, platform: "win32" }).python).toBe("python");
  });

  it.skipIf(process.platform === "win32")("is made runnable if unpacking lost that", () => {
    const extension = withBundled(process.platform);
    const python = bundledPythonPath(extension);
    chmodSync(python, 0o644);
    expect(bundledPython(extension)).toBe(python);
    expect(statSync(python).mode & 0o111).toBe(0o111);
  });
});
