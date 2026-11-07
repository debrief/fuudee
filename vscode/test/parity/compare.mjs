// The cross-host parity check's last step: the plot as VS Code left it and as the playground left
// it, after the same commands (sequence.mjs), held to each other. Each host's harness wrote its
// result; this fails, listing where they differ, unless they match but for KNOWN_DIFFERENCES.
// Usage: node test/parity/compare.mjs <vscode.json> <playground.json> [more VS Code results…]
// Each result is { host, sequence, commands: [{ command, problem? }], plot } (plot: normalise.mjs's).
import { readFileSync } from "node:fs";
import { differences, without } from "./normalise.mjs";
import { KNOWN_DIFFERENCES, SEQUENCE } from "./sequence.mjs";

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error("Usage: node test/parity/compare.mjs <result.json> <result.json> [more…]");
  process.exit(2);
}
const results = files.map((file) => ({ file, ...JSON.parse(readFileSync(file, "utf8")) }));
const known = KNOWN_DIFFERENCES.map((d) => d.path);
const expected = SEQUENCE.map((s) => s.command);
let failed = false;
for (const r of results) {
  // Each ran the sequence as it is now, all of it.
  const ran = (r.commands ?? []).map((c) => c.command);
  if (ran.join() !== expected.join()) {
    console.error(`${r.file} (${r.host}) ran ${ran.length} commands, not the sequence's ${expected.length}: rebuild and run it again.`);
    failed = true;
  }
}
const [first, ...rest] = results;
for (const other of rest) {
  const found = differences(without(first.plot, known), without(other.plot, known));
  if (!found.length) {
    console.log(`${first.host} and ${other.host} left the plot the same after ${expected.length} commands.`);
    continue;
  }
  failed = true;
  console.error(`${first.host} (a) and ${other.host} (b) left the plot differently after the same ${expected.length} commands:`);
  for (const d of found) console.error(`  ${d.path}\n    a: ${d.a}\n    b: ${d.b}`);
}
process.exit(failed ? 1 : 0);
