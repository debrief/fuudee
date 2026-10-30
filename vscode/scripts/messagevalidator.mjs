// The webview messages' schema validator, compiled to code when the playground is built (PAR-13):
// the playground's page may not compile code at run time (its Content-Security-Policy has no
// 'unsafe-eval'), so it cannot compile the schema as the extension host does. The same schema
// (ts/schemas' generated JSON Schema), the same root (WebviewMessage), the same Ajv settings as
// @debrief/schemas' validateDocument; written as an ES module that play/messagecheck.ts imports.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const schemas = path.resolve("../ts/schemas");
const require = createRequire(path.join(schemas, "package.json"));
const Ajv2019 = require("ajv/dist/2019.js").default;
const standalone = require("ajv/dist/standalone/index.js").default;

/** Write the validator's module, and return where it is and where the runtime it needs is found. */
export function writeMessageValidator(folder) {
  const schema = JSON.parse(readFileSync(path.join(schemas, "src/generated/debrief.schema.json"), "utf8"));
  const ajv = new Ajv2019({ allErrors: true, strict: false, code: { source: true, esm: true } });
  ajv.addSchema(schema, "debrief");
  const validate = ajv.compile({ $id: "webview-message", $ref: "debrief#/$defs/WebviewMessage" });
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, "webview-message.mjs");
  writeFileSync(file, standalone(ajv, validate));
  return { file, nodePaths: [path.join(schemas, "node_modules")] };
}
