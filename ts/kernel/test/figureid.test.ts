import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIGURE_ALPHABET, figureId, FigureIdError, figureIdProblem, parseFigureId, plotKeyOf } from "../src/index.js";

const vectors = JSON.parse(readFileSync(join(__dirname, "../../../schemas/vectors/figure-ids.json"), "utf8")) as {
  alphabet: string;
  encode: { catalogue: string; item: string; revision: string; export_hex: string; plot_key: string; id: string; short: string }[];
  parse: { typed: string; kind?: "full" | "short"; id?: string; short?: string; problem?: string }[];
};

const bytes = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));

describe("image IDs, held to the shared vectors (SUB-25)", () => {
  it("uses the shared alphabet", () => expect(FIGURE_ALPHABET).toBe(vectors.alphabet));

  it.each(vectors.encode.map((c) => [c.item, c] as const))("encodes %s", (_name, c) => {
    const key = plotKeyOf(new Uint8Array(createHash("sha256").update(`${c.catalogue}/${c.item}`, "utf8").digest()));
    expect(key).toBe(c.plot_key);
    const made = figureId(key, c.revision, bytes(c.export_hex));
    expect(made.text).toBe(c.id);
    expect(made.short).toBe(c.short);
  });

  it.each(vectors.parse.map((c) => [JSON.stringify(c.typed), c] as const))("reads %s", (_name, c) => {
    if (c.problem) {
      expect(() => parseFigureId(c.typed)).toThrow(FigureIdError);
      try {
        parseFigureId(c.typed);
      } catch (error) {
        expect((error as FigureIdError).code).toBe(c.problem);
      }
      expect(figureIdProblem(c.typed)).toBeTruthy();
      return;
    }
    const read = parseFigureId(c.typed);
    expect(read.full ? "full" : "short").toBe(c.kind);
    expect(read.text).toBe(c.id);
    expect(read.short).toBe(c.short);
    expect(figureIdProblem(c.typed)).toBeUndefined();
  });

  it("catches every single symbol mistyped in a short form", () => {
    const short = vectors.encode[2].short.replace(/-/g, "").slice(3);
    for (let at = 0; at < short.length; at++) {
      for (const symbol of FIGURE_ALPHABET) {
        if (symbol === short[at]) continue;
        expect(() => parseFigureId(short.slice(0, at) + symbol + short.slice(at + 1))).toThrow(FigureIdError);
      }
    }
  });
});
