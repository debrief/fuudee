/**
 * The Timeline's extras, the reader's own (product owner, 15 Oct 2026: legacy Debrief's
 * Narrative viewer's): highlighted phrases, the off switch for choosing an entry moving
 * current time, text size, wrapping and columns, kept between visits and checked.
 */
import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  DEFAULT_TEXT_SIZE,
  DEFAULT_VIEW,
  gridOf,
  lineHeight,
  marks,
  MAX_HIGHLIGHTS,
  parseHighlights,
  readView,
  stepTextSize,
  TEXT_SIZES,
  viewChanged,
} from "../../webview/timelinelogic.js";

describe("phrases to highlight", () => {
  it("are what the reader typed, separated by commas or lines, each once ignoring case", () => {
    expect(parseHighlights("contact,  CPA , torpedo\nContact lost,,contact")).toEqual(["contact", "CPA", "torpedo", "Contact lost"]);
    expect(parseHighlights(" ,\n ")).toEqual([]);
    expect(parseHighlights("two   spaces")).toEqual(["two spaces"]);
  });

  it("are a reader's list, not a document: at most twenty, each at most sixty characters", () => {
    const many = Array.from({ length: 30 }, (_, i) => `word${i}`).join(",");
    expect(parseHighlights(many)).toHaveLength(MAX_HIGHLIGHTS);
    expect(parseHighlights("x".repeat(100))[0]).toHaveLength(60);
  });

  it("are marked wherever they are, ignoring case, the longest phrase first", () => {
    expect(marks("Contact lost. Contact regained.", "", ["contact", "contact lost"])).toEqual([
      { start: 0, end: 12, kind: "highlight" },
      { start: 14, end: 21, kind: "highlight" },
    ]);
  });

  it("give way to what the search found, never overlapping it", () => {
    expect(marks("Contact lost on sonar", "lost", ["contact lost", "sonar"])).toEqual([
      { start: 8, end: 12, kind: "found" },
      { start: 16, end: 21, kind: "highlight" },
    ]);
    expect(marks("nothing here", "", ["absent"])).toEqual([]);
  });
});

describe("the reader's view", () => {
  it("starts as the Timeline's own: nothing highlighted, choosing moves time, 12 px, wrapped, every column", () => {
    expect(readView(undefined)).toEqual(DEFAULT_VIEW);
    expect(DEFAULT_VIEW).toEqual({ highlights: [], moveTime: true, textSize: 12, wrap: true, hidden: [] });
    expect(viewChanged(DEFAULT_VIEW)).toBe(false);
  });

  it("is read back from an earlier visit, and anything unreadable is the default", () => {
    const kept = { highlights: ["CPA", 3, "cpa"], moveTime: false, textSize: 16, wrap: false, hidden: ["type", "time", "text", "type"] };
    expect(readView(kept)).toEqual({ highlights: ["CPA"], moveTime: false, textSize: 16, wrap: false, hidden: ["time", "type"] });
    expect(readView({ textSize: 13, moveTime: "no" })).toEqual(DEFAULT_VIEW);
    expect(readView("garbage")).toEqual(DEFAULT_VIEW);
    expect(viewChanged(readView(kept))).toBe(true);
  });

  it("steps the text size through the sizes offered, stopping at either end", () => {
    expect(stepTextSize(12, 1)).toBe(14);
    expect(stepTextSize(12, -1)).toBe(11);
    expect(stepTextSize(TEXT_SIZES[0], -1)).toBe(TEXT_SIZES[0]);
    expect(stepTextSize(TEXT_SIZES.at(-1)!, 1)).toBe(TEXT_SIZES.at(-1));
    expect(stepTextSize(13, 1)).toBe(14); // an odd size kept from elsewhere steps from the default
    expect(lineHeight(DEFAULT_TEXT_SIZE)).toBe(16);
    expect(lineHeight(18)).toBe(24);
  });

  it("lays out the columns shown: wide, the text last; narrow, the text under them", () => {
    expect(gridOf([], false)).toEqual({ columns: "var(--tl-time) var(--tl-source) var(--tl-type) minmax(0, 1fr)", textFrom: 4 });
    expect(gridOf(["source"], false)).toEqual({ columns: "var(--tl-time) var(--tl-type) minmax(0, 1fr)", textFrom: 3 });
    expect(gridOf([...COLUMNS], false)).toEqual({ columns: "minmax(0, 1fr)", textFrom: 1 });
    // Narrow: the text aligned with the source, or from the left with the time hidden.
    expect(gridOf([], true)).toEqual({ columns: "var(--tl-time) minmax(0, 1fr) auto", textFrom: 2 });
    expect(gridOf(["time"], true)).toEqual({ columns: "minmax(0, 1fr) auto", textFrom: 1 });
    expect(gridOf(["type"], true)).toEqual({ columns: "var(--tl-time) minmax(0, 1fr)", textFrom: 2 });
  });
});
