// Generates TypeScript types from the JSON Schema that LinkML produces (PRN-04).
// LinkML's own TypeScript generator drops arrays and enum types, so this
// package goes LinkML -> JSON Schema -> TypeScript. See docs/spikes/linkml.md.
// Run with --check to fail if committed output is stale.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "../../../schemas/generated/debrief.schema.json");
const outDir = join(here, "../src/generated");
const header =
  "// Generated from schemas/linkml/debrief.yaml via JSON Schema by ts/schemas/scripts/generate.mjs. Do not edit.\n";

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
// Emit every definition once; the root is the LinkML tree_root, already in $defs.
const typeSource = { $defs: schema.$defs, title: "DebriefSchemaDefinitions", type: "object" };
const types = await compile(typeSource, "DebriefFeatureCollection", {
  bannerComment: "",
  additionalProperties: false,
  format: true,
  unreachableDefinitions: true,
});

const outputs = {
  "debrief.ts": header + types,
  "schemaVersion.ts": header + `export const SCHEMA_VERSION = ${JSON.stringify(schema.version)};\n`,
  "debrief.schema.json": JSON.stringify(schema, null, 2) + "\n",
};

const check = process.argv.includes("--check");
const stale = [];
for (const [name, content] of Object.entries(outputs)) {
  const path = join(outDir, name);
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === content) continue;
  if (check) stale.push(name);
  else {
    writeFileSync(path, content);
    console.log(`wrote src/generated/${name}`);
  }
}
if (stale.length) {
  console.error(`Generated files are stale; run npm run generate: ${stale.join(", ")}`);
  process.exit(1);
}
