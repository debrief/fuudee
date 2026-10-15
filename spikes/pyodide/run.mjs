// Pyodide spike runner (CON-09). Builds nothing itself: expects wheels for
// debrief-schemas, debrief-kernel and geographiclib in ./wheels (see
// run.sh). Loads them into Pyodide under Node, runs smoke.py over the shared
// fixtures, and compares the report with the one CPython produced.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "pyodide";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const [cpythonReportPath, outPath] = process.argv.slice(2);

function copyTree(pyodide, from, to) {
  pyodide.FS.mkdirTree(to);
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = `${to}/${entry.name}`;
    if (entry.isDirectory()) copyTree(pyodide, source, target);
    else pyodide.FS.writeFile(target, readFileSync(source));
  }
}

const started = performance.now();
const pyodide = await loadPyodide({ packageCacheDir: join(here, ".pyodide-cache") });
const bootMs = performance.now() - started;

// Pyodide's own builds of compiled dependencies; everything else from local wheels.
await pyodide.loadPackage(["micropip", "pydantic", "jsonschema", "tzdata", "numpy", "pyproj"]);
copyTree(pyodide, join(here, "wheels"), "/wheels");
copyTree(pyodide, join(root, "schemas/fixtures"), "/fixtures");
// The synthetic Word 97 documents the narrative dialects' tests read (CAP-19).
copyTree(pyodide, join(root, "python/debrief-io/tests/data"), "/docs");
pyodide.FS.writeFile("/smoke.py", readFileSync(join(here, "smoke.py")));
const wheels = readdirSync(join(here, "wheels"))
  .filter((name) => name.endsWith(".whl"))
  .map((name) => `emfs:/wheels/${name}`);
const micropip = pyodide.pyimport("micropip");
try {
  await micropip.install(wheels, { deps: false });
} catch (error) {
  console.error(String(error.message ?? error).split("\n").slice(-15).join("\n"));
  process.exit(1);
}
const readyMs = performance.now() - started;

let output;
try {
  output = await pyodide.runPythonAsync(`
import json, sys
sys.path.insert(0, "/")
import smoke, pydantic, platform
from pathlib import Path
result = smoke.main(Path("/fixtures"), Path("/docs"))
result["environment"] = {"python": platform.python_version(), "pydantic": pydantic.VERSION}
json.dumps(result, sort_keys=True)
`);
} catch (error) {
  console.error(String(error.message ?? error).split("\n").slice(-25).join("\n"));
  process.exit(1);
}
const result = JSON.parse(output);
result.timings.boot_ms = bootMs;
result.timings.ready_ms = readyMs;
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");

const cpython = JSON.parse(readFileSync(cpythonReportPath, "utf8")).report;
const same = JSON.stringify(cpython) === JSON.stringify(result.report);
const failures = Object.entries(result.report.documents).filter(([, ok]) => !ok);
if (!result.report.kernel_arrays.matches_per_point) failures.push(["kernel_arrays.matches_per_point", false]);
console.log(`Pyodide: Python ${result.environment.python}, pydantic ${result.environment.pydantic}`);
console.log(`Boot ${bootMs.toFixed(0)} ms, ready ${readyMs.toFixed(0)} ms, fixtures ${result.timings.all_fixtures_ms.toFixed(0)} ms, range_bearing ${result.timings.range_bearing_us.toFixed(0)} µs, Tote ${result.timings.tote_ms.toFixed(2)} ms a call, 5,000 narrative entries in one step ${result.timings.narrative_5000_ms.toFixed(0)} ms, Word and PDF narrative read ${result.timings.narrative_documents_ms.toFixed(0)} ms`);
console.log(`Document checks: ${Object.keys(result.report.documents).length - failures.length}/${Object.keys(result.report.documents).length} passed`);
console.log(`Report identical to CPython: ${same}`);
for (const [name] of failures) console.log(`  FAILED ${name}`);
if (!same) {
  for (const key of Object.keys(cpython.kernel_arrays)) {
    if (JSON.stringify(cpython.kernel_arrays[key]) !== JSON.stringify(result.report.kernel_arrays[key])) {
      console.log(`  kernel_arrays.${key}: CPython ${JSON.stringify(cpython.kernel_arrays[key])}, Pyodide ${JSON.stringify(result.report.kernel_arrays[key])}`);
    }
  }
  for (const key of Object.keys(cpython.kernel)) {
    if (JSON.stringify(cpython.kernel[key]) !== JSON.stringify(result.report.kernel[key])) {
      console.log(`  kernel.${key}: CPython ${JSON.stringify(cpython.kernel[key])}, Pyodide ${JSON.stringify(result.report.kernel[key])}`);
    }
  }
}
process.exit(same && failures.length === 0 ? 0 : 1);
