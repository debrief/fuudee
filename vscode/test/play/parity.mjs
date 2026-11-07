// The cross-host parity check, the playground's half (test/parity): from serial 1 as the sample
// builder made it (the page opens it), the shared commands in sequence.mjs run as an agent runs
// them, given what each would otherwise ask; then the plot's file as Python saved it, projected
// (normalise.mjs), written to DEBRIEF_PARITY_OUT (a folder) as playground.json, for compare.mjs to
// hold to VS Code's.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalise } from "../parity/normalise.mjs";
import { EXPECTED, FIXTURE, SEQUENCE } from "../parity/sequence.mjs";

/** The sequence run on a fresh page (serial 1 open, Python ready); errors on the page are the caller's. */
export async function playParity(page) {
  const open = await page.evaluate(() => document.querySelector("#plots")?.value);
  assert.equal(open, FIXTURE.item, "the playground opens serial 1");
  assert.equal(await page.evaluate((item) => window.debriefStepsOf(item), FIXTURE.item), 1, "serial 1 as built: one step");
  // Each command's warnings, shown as toasts, are its refusals (VS Code's commands answer with theirs).
  const commands = [];
  for (const step of SEQUENCE) {
    const said = await page.evaluate(({ command, args }) => window.debriefCommand(command, ...args), step);
    const problem = said.join(" ").trim();
    commands.push({ command: step.command, ...(problem && { problem }) });
  }
  const plot = normalise(await page.evaluate((item) => window.debriefPlotFile(item), FIXTURE.item));
  const result = { host: "the playground", sequence: SEQUENCE.length, commands, plot };
  const out = process.env.DEBRIEF_PARITY_OUT;
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(path.resolve(out), "playground.json"), `${JSON.stringify(result, null, 1)}\n`);
  }
  assert.deepEqual(commands.filter((c) => c.problem), []);
  assert.deepEqual({ current: plot.history.current, steps: plot.history.steps.length }, EXPECTED);
}
