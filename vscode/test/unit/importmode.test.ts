/**
 * How each track imported is plotted, OTG or DR (CAP-01; decision, product owner, 14 Oct
 * 2026): asked of each track, unless a choice is remembered; a choice to remember applies
 * to the tracks still to come. The remembered choice is user state, held by the host.
 */
import { describe, expect, it } from "vitest";
import { chooseModes, modeChoices, modeQuestion, type ModeChoice } from "../../src/importmode.js";

const choice = (label: string): ModeChoice => modeChoices().find((c) => c.label.startsWith(label) && c.remember === label.includes("future"))!;

describe("how each track imported is plotted", () => {
  it("offers over the ground and dead reckoning, each once or for future imports", () => {
    expect(modeChoices().map((c) => [c.mode, c.remember])).toEqual([["otg", false], ["dr", false], ["otg", true], ["dr", true]]);
    expect(modeQuestion("RED ONE", 0, 3)).toBe("How is RED ONE plotted? (1 of 3)");
  });

  it("asks of each track, unless a choice is remembered", async () => {
    const asked: string[] = [];
    const answers = [choice("Dead reckoning"), choice("Over the ground")];
    const got = await chooseModes(["RED ONE", "BLUE ONE"], "ask", async (t) => (asked.push(t), answers.shift()), () => undefined);
    expect(asked).toEqual(["RED ONE", "BLUE ONE"]);
    expect(got).toEqual({ modes: { "RED ONE": "dr", "BLUE ONE": "otg" }, remembered: false });
    const remembered = await chooseModes(["RED ONE", "BLUE ONE"], "otg", async () => { throw new Error("not asked"); }, () => undefined);
    expect(remembered).toEqual({ modes: { "RED ONE": "otg", "BLUE ONE": "otg" }, remembered: true });
  });

  it("remembers a choice for future imports, and uses it for the tracks still to come", async () => {
    const kept: string[] = [];
    const future = modeChoices().find((c) => c.mode === "dr" && c.remember)!;
    const got = await chooseModes(["A", "B", "C"], "ask", async () => future, (m) => void kept.push(m));
    expect(got).toEqual({ modes: { A: "dr", B: "dr", C: "dr" }, remembered: false });
    expect(kept).toEqual(["dr"]);
  });

  it("stops, importing nothing, when the analyst does", async () => {
    expect(await chooseModes(["A"], "ask", async () => undefined, () => undefined)).toBeUndefined();
  });
});
