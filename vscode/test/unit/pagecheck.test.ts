/**
 * What a page receives is checked as what it sends is (CON-08, PAR-13): the validator compiled
 * when the pages are built (scripts/messagevalidator.mjs, as VS Code's pages and the playground's
 * frames have it) accepts and refuses the schema's message fixtures as the host's check does.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkMessage } from "../../src/messages.js";
import { checkReceived, Refused } from "../../webview/pagecheck.js";

// The pages' validator, compiled now as the build compiles it.
vi.mock("debrief-webview-message-validator", async () => {
  const { writeMessageValidator } = await import("../../scripts/messagevalidator.mjs");
  const { file } = writeMessageValidator(path.resolve(__dirname, "../../dist-gen"));
  return import(file);
});

const fixtures = path.resolve(__dirname, "../../../schemas/fixtures/webview_message");
const read = (folder: string) =>
  readdirSync(path.join(fixtures, folder))
    .filter((name) => name.endsWith(".json"))
    .map((name) => [name, JSON.parse(readFileSync(path.join(fixtures, folder, name), "utf8")) as unknown] as const);

describe("a page's check of what its host sends", () => {
  it("accepts every valid message, as the host's check does", () => {
    const valid = read("valid");
    expect(valid.length).toBeGreaterThan(50);
    for (const [name, raw] of valid) {
      expect(() => checkMessage(raw), name).not.toThrow();
      expect(checkReceived(raw), name).toBe(raw);
    }
  });

  it("refuses every invalid one, by the schema or by a rule, as the host's check does", () => {
    for (const folder of ["invalid/schema", "invalid/semantic"]) {
      for (const [name, raw] of read(folder)) {
        expect(() => checkMessage(raw), name).toThrow();
        expect(() => checkReceived(raw), name).toThrow(Refused);
      }
    }
  });

  it("refuses without quoting the message (NFR-14)", () => {
    const secret = "RED ONE at 37.2N";
    try {
      checkReceived({ kind: "form_error", message: secret, plot: secret });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret);
    }
  });

  it("refuses what is not an object, which the schema's discriminator alone lets through", () => {
    for (const raw of ["not a message", 1, null, [], [{ kind: "ready" }]]) expect(() => checkReceived(raw), JSON.stringify(raw)).toThrow(Refused);
  });
});
