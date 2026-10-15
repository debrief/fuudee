// Bundles the extension host code (Node) and each webview (browser).
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const production = process.argv.includes("--production");
const common = { bundle: true, sourcemap: !production, minify: production, logLevel: "warning" };

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
  entryPoints: { map: "webview/map.ts", time: "webview/time.ts", tote: "webview/tote.ts", timeline: "webview/timeline.ts", form: "webview/form.tsx", annotation: "webview/annotationform.tsx", results: "webview/results.tsx" },
  outdir: "dist/webview",
  platform: "browser",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  loader: { ".png": "dataurl", ".svg": "dataurl" },
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
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
  external: ["vscode", "@vscode/test-electron"],
});
