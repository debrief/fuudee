/**
 * The cross-host parity check, VS Code's half (test/parity): from serial 1 as the sample builder
 * made it, the shared commands in sequence.mjs run as an agent runs them, given what each would
 * otherwise ask; then the plot's file as saved, projected (normalise.mjs), written to
 * DEBRIEF_PARITY_OUT (a folder) as vscode.json, for compare.mjs to hold to the playground's.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import { normalise } from "../parity/normalise.mjs";
import { EXPECTED, FIXTURE, SEQUENCE } from "../parity/sequence.mjs";
import { feature, openSerial1, sample } from "./fixture.js";

/** A command's answer, as a problem said, if it was one. */
const problemOf = (answer: unknown): string | undefined =>
  typeof answer === "string" ? answer : answer && typeof answer === "object" && "problem" in answer && typeof answer.problem === "string" ? answer.problem : undefined;

export function parity(): void {
  feature("parity", () => {
    test("runs the shared sequence and saves the plot as the playground must", async () => {
      await openSerial1();
      assert.equal(FIXTURE.item, "serial-1");
      const commands: { command: string; problem?: string }[] = [];
      for (const step of SEQUENCE) {
        const answer = await vscode.commands.executeCommand(step.command, ...step.args);
        const problem = problemOf(answer);
        commands.push({ command: step.command, ...(problem && { problem }) });
      }
      const plot = normalise(readFileSync(path.join(sample.location, FIXTURE.item, "plot.geojson"), "utf8"));
      const result = { host: `VS Code ${vscode.version}`, sequence: SEQUENCE.length, commands, plot };
      const out = process.env.DEBRIEF_PARITY_OUT;
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(path.join(out, "vscode.json"), `${JSON.stringify(result, null, 1)}\n`);
      }
      // None refused, and something happened: the steps the sequence makes.
      assert.deepEqual(commands.filter((c) => c.problem), []);
      assert.deepEqual({ current: plot.history.current, steps: plot.history.steps.length }, EXPECTED);
    });
  });
}
