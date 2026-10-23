// Bundles the playground (vscode/play) into a folder of the site: Debrief's own
// webviews, unchanged, plus the page that hosts them and the Python worker.
// scripts/build_playground.sh adds the wheels and the sample exercise.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { demoPage } from "../play/demo.mjs";
import path from "node:path";

/** A stylesheet's top-level rules, less those only for Dockview's own themes (.dockview-theme-*). */
function withoutThemes(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) {
      rules.push(css.slice(start, i + 1));
      start = i + 1;
    }
  }
  const themed = (rule) => rule.trim().split("{")[0].split(",").every((selector) => /^\s*\.dockview-theme-/.test(selector));
  return rules.filter((rule) => !themed(rule)).join("") + "\n";
}

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
for (const file of ["index.html", "geodesic.html", "frame-map.html", "frame-form.html", "frame-annotation.html", "frame-results.html", "theme.css", "host.css", "dock.css", "play.py"]) {
  cpSync(path.join("play", file), path.join(out, file));
}
// Dockview's own styles (dockview-core, pinned in package.json), served from here like everything else,
// without its own themes: the page has one of its own, from the theme's variables (play/dock.css).
writeFileSync(path.join(out, "dockview.css"), withoutThemes(readFileSync("node_modules/dockview-core/dist/styles/dockview.css", "utf8")));
cpSync("webview/timecontrol.css", path.join(out, "timecontrol.css"));
cpSync("webview/tote.css", path.join(out, "tote.css"));
cpSync("webview/timeline.css", path.join(out, "timeline.css"));
cpSync("webview/coverage.css", path.join(out, "coverage.css"));
cpSync("media/land.geojson", path.join(out, "land.geojson"));
// The walkthroughs' pictures, the same as VS Code's Get Started page shows (CAP-25).
cpSync("media/walkthroughs", path.join(out, "walkthroughs"), { recursive: true });
// The web demo, full screen at /demo/ beside the playground (DEP-06).
const demo = path.join(out, "..", "demo");
mkdirSync(demo, { recursive: true });
writeFileSync(path.join(demo, "index.html"), demoPage(readFileSync(path.join("play", "index.html"), "utf8"), `../${path.basename(out)}/`));
console.log(`Playground bundled into ${out}, and the web demo into ${demo}`);
