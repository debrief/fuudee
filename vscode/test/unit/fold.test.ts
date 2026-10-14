// The playground's side panels remember which are folded in the browser's storage, and work
// without it (decision, 14 Oct 2026). Folding itself is played in test/play/tote.mjs.
import { describe, expect, it } from "vitest";
import { FOLDED_KEY, readFolded, writeFolded, type FoldStorage } from "../../play/fold.js";

const memory = (): FoldStorage & { items: Map<string, string> } => {
  const items = new Map<string, string>();
  return { items, getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
};
const refusing: FoldStorage = {
  getItem: () => {
    throw new DOMException("refused", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
};

describe("remembering folded panels", () => {
  it("keeps the folded panels' ids, and reads them back", () => {
    const storage = memory();
    writeFolded(() => storage, new Set(["panel-tote", "panel-history"]));
    expect(storage.items.get(FOLDED_KEY)).toBe('["panel-history","panel-tote"]');
    expect(readFolded(() => storage)).toEqual(new Set(["panel-history", "panel-tote"]));
  });
  it("starts with every panel open where nothing is remembered", () => {
    expect(readFolded(() => memory())).toEqual(new Set());
    expect(readFolded(() => undefined)).toEqual(new Set());
  });
  it("ignores what it cannot read", () => {
    const storage = memory();
    for (const text of ["not json", '{"panel-tote": true}', '["panel-tote", 3]']) {
      storage.items.set(FOLDED_KEY, text);
      expect([...readFolded(() => storage)]).toEqual(text.startsWith("[") ? ["panel-tote"] : []);
    }
  });
  it("works without storage: refused, full or missing", () => {
    expect(readFolded(() => refusing)).toEqual(new Set());
    expect(() => writeFolded(() => refusing, new Set(["panel-tote"]))).not.toThrow();
    expect(() =>
      writeFolded(() => {
        throw new DOMException("refused", "SecurityError");
      }, new Set()),
    ).not.toThrow();
  });
});
