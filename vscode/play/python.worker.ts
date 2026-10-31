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

/** A file from this site, or a clear failure naming it: never a 404 page read as data. */
async function get(base: string, file: string): Promise<Response> {
  const response = await fetch(new URL(file, base));
  if (!response.ok) throw new Error(`${file} is missing from this site (${response.status})`);
  return response;
}

/**
 * Why Python could not be had, as the reader can act on it (a locked-down network, a browser
 * policy), never a cause guessed: the step that failed, and what was found when it was looked into.
 */
async function whyNot(step: string, file: string, error: unknown): Promise<string> {
  if (typeof WebAssembly === "undefined") return "Python couldn't start: WebAssembly is turned off in this browser, perhaps by your organisation's policy.";
  const host = new URL(PYODIDE).host;
  try {
    const response = await fetch(`${PYODIDE}${file}`, { method: "HEAD", cache: "no-store" });
    if (!response.ok) return `Python couldn't be downloaded: ${host} answered ${response.status} for ${file}; your network may block it.`;
  } catch {
    return `Python couldn't be downloaded: ${host} could not be reached; your network may block it.`;
  }
  const said = String((error as Error)?.message ?? error).split("\n")[0].slice(0, 200);
  return `Python couldn't start while ${step}: ${said}`;
}

/** Pyodide and its packages, from the CDN; what stopped it named plainly (whyNot). */
async function loadPython(say: (text: string) => void): Promise<Pyodide> {
  let step = "loading Python";
  let file = "pyodide.mjs";
  try {
    say("Loading Python…");
    const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`)) as {
      loadPyodide(options: { indexURL: string }): Promise<Pyodide>;
    };
    file = "pyodide.asm.wasm";
    // Asked for first: refused (a proxy's 403), Pyodide says so only on the console and waits for ever.
    const wasm = await fetch(`${PYODIDE}${file}`, { method: "HEAD" });
    if (!wasm.ok) throw new Error(`${file}: ${wasm.status}`);
    const pyodide = await Promise.race([
      loadPyodide({ indexURL: PYODIDE }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no answer in 3 minutes")), 180_000)),
    ]);
    step = "loading Python packages";
    file = "pyodide-lock.json";
    say("Loading Python packages…");
    await pyodide.loadPackage(PACKAGES);
    return pyodide;
  } catch (error) {
    throw new Error(await whyNot(step, file, error));
  }
}

async function start(base: string, say: (text: string) => void) {
  const pyodide = await loadPython(say);
  const manifest = (await (await get(base, "manifest.json")).json()) as Manifest;
  say("Installing Debrief…");
  // Without their dependencies: those are Pyodide's builds above (the desktop service's web
  // server, which the browser never needs, is left out).
  const urls = JSON.stringify(manifest.wheels.map((w) => new URL(`wheels/${w}`, base).href));
  await pyodide.runPythonAsync(`import json, micropip\nawait micropip.install(json.loads(${JSON.stringify(urls)}), deps=False)`);
  say("Opening the sample exercise…");
  await Promise.all(
    manifest.sample.map(async (file) => {
      const data = new Uint8Array(await (await get(base, `sample/${file}`)).arrayBuffer());
      // Twice: the catalogue the reader works in, and the sample as shipped, which only the
      // walkthroughs read, to copy (CAP-25): never changed, whatever the reader does.
      for (const target of [`/play/catalogue/${file}`, `/play/pristine/${file}`]) {
        pyodide.FS.mkdirTree(target.slice(0, target.lastIndexOf("/")));
        pyodide.FS.writeFile(target, data);
      }
    }),
  );
  pyodide.FS.mkdirTree("/play/code");
  pyodide.FS.writeFile("/play/code/play.py", await (await get(base, "play.py")).text());
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
      // Failed: asked again (Try again), it starts afresh.
      await ready.catch((error) => {
        ready = undefined;
        throw error;
      });
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
