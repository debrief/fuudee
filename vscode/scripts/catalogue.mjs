// The action catalogue (webview/panels/actions.ts) for the build's scripts: bundled by esbuild
// to a module in memory, so the scripts read the same TypeScript the extension and the
// playground are built from.
import { build } from "esbuild";

export async function loadCatalogue() {
  const out = await build({ entryPoints: ["webview/panels/actions.ts"], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}
