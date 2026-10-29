// Writes package.json's contributes.commands and contributes.menus from the action catalogue,
// webview/panels/actions.ts, the one place each action is declared (PAR-06). With --check,
// changes nothing and fails if package.json is out of date, as the unit tests run it: a menu
// entry edited by hand in package.json fails them.
import { readFileSync, writeFileSync } from "node:fs";
import { withContribution } from "./menutext.mjs";
import { loadCatalogue } from "./catalogue.mjs";

const { contribution } = await loadCatalogue();
const before = readFileSync("package.json", "utf8");
const after = withContribution(before, contribution());
JSON.parse(after); // still valid JSON
if (process.argv.includes("--check")) {
  if (after !== before) {
    console.error("package.json's commands or menus differ from the action catalogue (webview/panels/actions.ts): run npm run menus.");
    process.exit(1);
  }
  console.log("package.json's commands and menus match the action catalogue.");
} else if (after !== before) {
  writeFileSync("package.json", after);
  console.log("Wrote package.json's commands and menus from the action catalogue.");
}
