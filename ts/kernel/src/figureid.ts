/**
 * Image IDs (SUB-25): the ID an image exported from Debrief carries, in full in its
 * metadata and in its short form in its footer, as debrief_stac.figures writes and
 * reads them. Held to schemas/vectors/figure-ids.json, as Python is.
 *
 *     DBF1-PPPPPPPP-RRRRRRRRRRRRRRRR-EEEEEEEE-C      in full
 *     DBF-PPPP-RRRR-RRRE-EC                          its short form (2 export symbols too)
 *
 * Crockford's base 32 (no I, L, O or U), most significant bit first: P the plot key
 * (the first 40 bits of the SHA-256 of "<catalogue>/<item>"), R the revision (the
 * first 80 bits of the plot's content hash), E the export (40 random bits) and C a
 * Luhn mod 32 check over the rest. Hashing stays in Python; here an ID is read as an
 * analyst types it, and built from its parts.
 */

export const FIGURE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const INDEX = new Map([...FIGURE_ALPHABET].map((c, i) => [c, i]));

export const NOT_AN_ID = "That is not a Debrief image ID. One looks like DBF-PTET-KG8R-B9EM-69, as in an image's corner.";
export const MISTYPED = "That image ID has a character wrong: check it against the image.";

export type FigureIdProblem = "not_an_id" | "mistyped";

export class FigureIdError extends Error {
  constructor(
    message: string,
    readonly code: FigureIdProblem,
  ) {
    super(message);
  }
}

/** An image ID as read: in full (export known) or its short form. */
export interface FigureRef {
  full: boolean;
  plot: string;
  revision: string;
  export?: string;
  /** As Debrief writes it: in full where known, else its short form. */
  text: string;
  short: string;
}

/** The first `count` symbols of the bytes' bits, most significant first. */
export function figureSymbols(data: Uint8Array, count: number): string {
  let out = "";
  for (let n = 0; n < count; n++) {
    let value = 0;
    for (let b = 0; b < 5; b++) {
      const bit = 5 * n + b;
      const byte = data[bit >> 3] ?? 0;
      value = (value << 1) | ((byte >> (7 - (bit & 7))) & 1);
    }
    out += FIGURE_ALPHABET[value];
  }
  return out;
}

/** Luhn mod 32 over the symbols: catches any one mistyped and most neighbours swapped. */
export function checkSymbol(payload: string): string {
  let factor = 2;
  let total = 0;
  for (let i = payload.length - 1; i >= 0; i--) {
    const addend = factor * INDEX.get(payload[i])!;
    factor = factor === 2 ? 1 : 2;
    total += Math.floor(addend / 32) + (addend % 32);
  }
  return FIGURE_ALPHABET[(32 - (total % 32)) % 32];
}

/** The 16 symbols naming a revision: the start of a content hash, sha256:<hex>. */
export function revisionSymbols(revision: string): string {
  const hex = /^sha256:([0-9a-f]{64})$/.exec(revision)?.[1];
  if (!hex) throw new Error(`${revision} is not a content hash`);
  const bytes = new Uint8Array(10);
  for (let i = 0; i < 10; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return figureSymbols(bytes, 16);
}

/** The short form of an ID's plot, revision and export symbols: 4, 7 and 2 of them and a check. */
function shortOf(plot: string, revision: string, exported: string): string {
  const payload = plot.slice(0, 4) + revision.slice(0, 7) + exported.slice(0, 2);
  return `DBF-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${payload.slice(12)}${checkSymbol(payload)}`;
}

/** An ID in full from its parts: the plot key's symbols, the revision's hash and the export's 5 bytes. */
export function figureId(plot: string, revision: string, exportBytes: Uint8Array): FigureRef {
  const r = revisionSymbols(revision);
  const e = figureSymbols(exportBytes, 8);
  return { full: true, plot, revision: r, export: e, text: `DBF1-${plot}-${r}-${e}-${checkSymbol(plot + r + e)}`, short: shortOf(plot, r, e) };
}

/** The plot key from the SHA-256 digest of "<catalogue>/<item>" in UTF-8. */
export function plotKeyOf(digest: Uint8Array): string {
  return figureSymbols(digest.slice(0, 5), 8);
}

/**
 * Read an image ID, in full or its short form, as typed or read from an image: case,
 * spaces, dashes and an ellipsis do not matter; O reads as 0, I and L as 1. Throws
 * FigureIdError, its message for the analyst.
 */
export function parseFigureId(typed: string): FigureRef {
  const plain = typed
    .trim()
    .toUpperCase()
    .replace(/[\s\-‐-―−._/:…]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (!plain || [...plain].some((c) => !INDEX.has(c))) throw new FigureIdError(NOT_AN_ID, "not_an_id");
  if (plain.startsWith("DBF1") && plain.length === 37) {
    const payload = plain.slice(4, 36);
    if (checkSymbol(payload) !== plain[36]) throw new FigureIdError(MISTYPED, "mistyped");
    const [plot, revision, exported] = [payload.slice(0, 8), payload.slice(8, 24), payload.slice(24)];
    return { full: true, plot, revision, export: exported, text: `DBF1-${plot}-${revision}-${exported}-${plain[36]}`, short: shortOf(plot, revision, exported) };
  }
  let body = plain;
  if (plain.startsWith("DBF") && plain.length === 17) body = plain.slice(3);
  else if (plain.startsWith("DBF")) throw new FigureIdError(NOT_AN_ID, "not_an_id"); // DBF and the wrong number of symbols
  if (body.length === 14) {
    const payload = body.slice(0, 13);
    if (checkSymbol(payload) !== body[13]) throw new FigureIdError(MISTYPED, "mistyped");
    const short = shortOf(payload.slice(0, 4), payload.slice(4, 11), payload.slice(11));
    return { full: false, plot: payload.slice(0, 4), revision: payload.slice(4, 11), export: payload.slice(11), text: short, short };
  }
  throw new FigureIdError(NOT_AN_ID, "not_an_id");
}

/** Why the text is not an image ID, for a box the analyst types in; undefined if it is one. */
export function figureIdProblem(typed: string): string | undefined {
  try {
    parseFigureId(typed);
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}
