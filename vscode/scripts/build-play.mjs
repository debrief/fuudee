// Bundles the playground (vscode/play) into a folder of the site: Debrief's own
// webviews, unchanged, plus the page that hosts them and the Python worker.
// scripts/build_playground.sh adds the wheels and the sample exercise.
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "dist/play");
mkdirSync(out, { recursive: true });
const common = { bundle: true, minify: true, sourcemap: false, logLevel: "warning", target: "es2022" };

await build({
  ...common,
  entryPoints: {
    map: "webview/map.ts",
    form: "webview/form.tsx",
    annotation: "webview/annotationform.tsx",
    results: "webview/results.tsx",
    shim: "play/shim.ts",
    geodesic: "play/geodesic.ts",
  },
  outdir: out,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  loader: { ".png": "dataurl", ".svg": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"' },
});
await build({
  ...common,
  entryPoints: { host: "play/host.ts", "python.worker": "play/python.worker.ts" },
  outdir: out,
  platform: "browser",
  format: "esm",
  external: ["https://*"],
});
for (const file of ["index.html", "geodesic.html", "frame-map.html", "frame-form.html", "frame-annotation.html", "frame-results.html", "theme.css", "host.css", "play.py"]) {
  cpSync(path.join("play", file), path.join(out, file));
}
cpSync("webview/timecontrol.css", path.join(out, "timecontrol.css"));
cpSync("media/land.geojson", path.join(out, "land.geojson"));
console.log(`Playground bundled into ${out}`);
