/**
 * How each track imported is plotted, OTG or DR (CAP-01; decision, product owner, 14 Oct
 * 2026): asked of each track, unless a choice is remembered; a choice to remember applies
 * to the tracks still to come. The remembered choice is user state, held by the host.
 */
import { describe, expect, it } from "vitest";
import { chooseModes, modeChoices, modeQuestion, REMEMBER_LABEL, rememberItem, type ModeChoice } from "../../src/importmode.js";

const once = (mode: "otg" | "dr"): ModeChoice => ({ mode, remember: false });

describe("how each track imported is plotted", () => {
  it("offers over the ground or dead reckoning, and apart from that a box to use the choice for future imports, as legacy Debrief did", () => {
    expect(modeChoices().map((c) => [c.mode, c.label])).toEqual([
      ["otg", "Over the ground (OTG)"],
      ["dr", "Dead reckoning (DR)"],
    ]);
    expect(modeQuestion("RED ONE", 0, 3)).toBe("How is RED ONE plotted? (1 of 3)");
    expect(REMEMBER_LABEL).toBe("Use this choice for future track imports");
    // In a Quick Pick, the box is a line that says, in words too, whether it is ticked.
    expect(rememberItem(false)).toEqual({ label: `$(circle-large-outline) ${REMEMBER_LABEL}`, description: "off: choose it to turn on" });
    expect(rememberItem(true).label).toBe(`$(pass-filled) ${REMEMBER_LABEL}`);
    expect(rememberItem(true).description).toMatch(/^on: /);
  });

  it("asks of each track, unless a choice is remembered", async () => {
    const asked: string[] = [];
    const answers = [once("dr"), once("otg")];
    const got = await chooseModes(["RED ONE", "BLUE ONE"], "ask", async (t) => (asked.push(t), answers.shift()), () => undefined);
    expect(asked).toEqual(["RED ONE", "BLUE ONE"]);
    expect(got).toEqual({ modes: { "RED ONE": "dr", "BLUE ONE": "otg" }, remembered: false });
    const remembered = await chooseModes(["RED ONE", "BLUE ONE"], "otg", async () => { throw new Error("not asked"); }, () => undefined);
    expect(remembered).toEqual({ modes: { "RED ONE": "otg", "BLUE ONE": "otg" }, remembered: true });
  });

  it("remembers a choice for future imports, and uses it for the tracks still to come", async () => {
    const kept: string[] = [];
    const got = await chooseModes(["A", "B", "C"], "ask", async () => ({ mode: "dr", remember: true }), (m) => void kept.push(m));
    expect(got).toEqual({ modes: { A: "dr", B: "dr", C: "dr" }, remembered: false });
    expect(kept).toEqual(["dr"]);
  });

  it("stops, importing nothing, when the analyst does", async () => {
    expect(await chooseModes(["A"], "ask", async () => undefined, () => undefined)).toBeUndefined();
  });
});
