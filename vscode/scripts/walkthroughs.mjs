// Writes package.json's contributes.walkthroughs from walkthroughs/tours.json, the one
// source of the walkthroughs' words (CAP-25). With --check, changes nothing and fails if
// package.json is out of date, as the unit tests run it.
import { readFileSync, writeFileSync } from "node:fs";
import { walkthroughsContribution, withWalkthroughs } from "../walkthroughs/contribute.mjs";

const tours = JSON.parse(readFileSync("walkthroughs/tours.json", "utf8"));
const before = readFileSync("package.json", "utf8");
const { publisher, name } = JSON.parse(before);
const after = withWalkthroughs(before, walkthroughsContribution(tours, `${publisher}.${name}`));
JSON.parse(after); // still valid JSON
if (process.argv.includes("--check")) {
  if (after !== before) {
    console.error("package.json's walkthroughs differ from walkthroughs/tours.json: run npm run walkthroughs.");
    process.exit(1);
  }
  console.log("package.json's walkthroughs match walkthroughs/tours.json.");
} else if (after !== before) {
  writeFileSync("package.json", after);
  console.log("Wrote package.json's walkthroughs from walkthroughs/tours.json.");
}
