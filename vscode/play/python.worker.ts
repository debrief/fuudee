/**
 * Debrief's Python in a Web Worker (CON-09): Pyodide, the site's own wheels of
 * the Debrief packages, and the sample exercise written to an in-memory file
 * system. The page sends {id, call, args}; this answers {id, result} or
 * {id, error}. Results are JSON text from play.py.
 */
/// <reference lib="webworker" />

export const PYODIDE_VERSION = "314.0.7";
const PYODIDE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
// Pyodide's own builds of the compiled dependencies; everything else from Debrief's wheels.
const PACKAGES = ["micropip", "pydantic", "jsonschema", "tzdata", "numpy", "pyproj"];

interface Manifest {
  wheels: string[];
  sample: string[];
}

type Pyodide = {
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: Uint8Array | string): void };
  loadPackage(names: string[]): Promise<void>;
  pyimport(name: string): Record<string, unknown>;
  runPythonAsync(code: string): Promise<unknown>;
  globals: { get(name: string): unknown };
  toPy(value: unknown): unknown;
};

type Call = (name: string, args: unknown[]) => unknown;
let ready: Promise<Call> | undefined;

async function start(base: string, say: (text: string) => void) {
  say("Loading Python…");
  const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`)) as {
    loadPyodide(options: { indexURL: string }): Promise<Pyodide>;
  };
  const pyodide = await loadPyodide({ indexURL: PYODIDE });
  say("Loading Python packages…");
  await pyodide.loadPackage(PACKAGES);
  const manifest = (await (await fetch(new URL("manifest.json", base))).json()) as Manifest;
  say("Installing Debrief…");
  // Without their dependencies: those are Pyodide's builds above (the desktop service's web
  // server, which the browser never needs, is left out).
  const urls = JSON.stringify(manifest.wheels.map((w) => new URL(`wheels/${w}`, base).href));
  await pyodide.runPythonAsync(`import json, micropip\nawait micropip.install(json.loads(${JSON.stringify(urls)}), deps=False)`);
  say("Opening the sample exercise…");
  await Promise.all(
    manifest.sample.map(async (file) => {
      const data = new Uint8Array(await (await fetch(new URL(`sample/${file}`, base))).arrayBuffer());
      const target = `/play/catalogue/${file}`;
      pyodide.FS.mkdirTree(target.slice(0, target.lastIndexOf("/")));
      pyodide.FS.writeFile(target, data);
    }),
  );
  pyodide.FS.mkdirTree("/play/code");
  pyodide.FS.writeFile("/play/code/play.py", await (await fetch(new URL("play.py", base))).text());
  await pyodide.runPythonAsync("import sys; sys.path.insert(0, '/play/code'); import play");
  const play = pyodide.pyimport("play") as unknown as Record<string, (...args: unknown[]) => unknown>;
  // A plain function, not an object: anything with a "then" would be taken for a promise.
  const call: Call = (name, args) => play[name](...args.map((a) => (a instanceof Uint8Array ? pyodide.toPy(a) : a)));
  return call;
}

self.onmessage = async (event: MessageEvent<{ id: number; call: string; args: unknown[]; base?: string }>) => {
  const { id, call, args, base } = event.data;
  try {
    if (call === "start") {
      ready ??= start(base!, (text) => self.postMessage({ progress: text }));
      await ready;
      self.postMessage({ id, result: "ready" });
      return;
    }
    const play = await ready!;
    const result = play(call, args);
    self.postMessage({ id, result: String(result) });
  } catch (error) {
    self.postMessage({ id, error: String((error as Error).message ?? error).split("\n").slice(-6).join("\n") });
  }
};
