// Bundles the extension host code (Node) and each webview (browser).
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { writeMessageValidator } from "./messagevalidator.mjs";

const production = process.argv.includes("--production");
// One geographiclib in each bundle, this folder's: @debrief/kernel (ts/kernel) is linked from outside
// it with node_modules of its own, so without this a bundle holding both would carry two.
const geographiclib = { "geographiclib-geodesic": path.resolve("node_modules/geographiclib-geodesic") };
const common = { bundle: true, sourcemap: !production, minify: production, logLevel: "warning", alias: geographiclib };
// The webview messages' validator, compiled now: each page checks what its host sends (CON-08) and
// may not compile code at run time (its Content-Security-Policy has no 'unsafe-eval').
const validator = writeMessageValidator(path.resolve("dist-gen"));

await build({
  ...common,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
});

await build({
  ...common,
  entryPoints: { map: "webview/map.ts", time: "webview/time.ts", tote: "webview/tote.ts", bearings: "webview/bearings.ts", timeline: "webview/timeline.ts", coverage: "webview/coverage.ts", form: "webview/form.tsx", annotation: "webview/annotationform.tsx", results: "webview/results.tsx" },
  outdir: "dist/webview",
  platform: "browser",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  loader: { ".png": "dataurl", ".svg": "dataurl" },
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
  alias: { ...geographiclib, "debrief-webview-message-validator": validator.file },
  nodePaths: validator.nodePaths,
});

mkdirSync("dist/webview", { recursive: true });
cpSync("media/land.geojson", "dist/webview/land.geojson");

await build({
  ...common,
  entryPoints: ["test/integration/run.ts", "test/integration/suite.ts", "test/integration/startup-run.ts", "test/integration/startup.ts"],
  outdir: "dist-test",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode", "@vscode/test-electron", "mocha"],
});
