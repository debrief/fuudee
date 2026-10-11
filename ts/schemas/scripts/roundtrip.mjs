// Cross-language round trip, TypeScript leg: read each document Python wrote,
// validate it, and write it back for Python to compare. Used by
// scripts/cross_language_roundtrip.sh. Input and output are laid out as
// <dir>/<document kind>/<name>.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOCUMENT_KINDS, parseDocument, serialiseDocument } from "../dist/index.js";

const [inDir, outDir] = process.argv.slice(2);
for (const kind of DOCUMENT_KINDS) {
  const from = join(inDir, kind);
  if (!existsSync(from)) continue;
  const to = join(outDir, kind);
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).filter((n) => n.endsWith(".json"))) {
    const document = parseDocument(kind, readFileSync(join(from, name), "utf8"));
    writeFileSync(join(to, name), serialiseDocument(kind, document));
  }
}
