// Cross-language round trip, TypeScript leg: read each plot Python wrote,
// validate it, and write it back for Python to compare. Used by
// scripts/cross_language_roundtrip.sh.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsePlot, serialisePlot } from "../dist/index.js";

const [inDir, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(inDir).filter((n) => n.endsWith(".json"))) {
  const plot = parsePlot(readFileSync(join(inDir, name), "utf8"));
  writeFileSync(join(outDir, name), serialisePlot(plot));
}
