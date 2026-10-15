/**
 * What VS Code and the playground ask before reading a Word or PDF narrative into the
 * open plot, as legacy Debrief asked (CAP-19): types, the plot's period, tracks.
 */
import { describe, expect, it } from "vitest";
import { choicesOf, MAX_ASKED_PLATFORMS, periodChoices, questionsFor, readSummary, typeWords, type NarrativePreview } from "../../src/narrativeimport.js";
import { count } from "../../src/format.js";

const preview = (over: Partial<NarrativePreview> = {}): NarrativePreview => ({
  name: "red-one-log.docx",
  format: "docx",
  dialect: "narrative-document",
  described: "Word document, read as a narrative log",
  entries: 7,
  fixes: 0,
  types: [
    { name: "OOW COMMENT", count: 3 },
    { name: "SONAR", count: 2 },
    { name: "", count: 2 },
  ],
  sources: [
    { name: "RED ONE", count: 6, track_id: "track-red-one" },
    { name: "BLUE TWO", count: 1, track_id: null },
  ],
  unnamed: 0,
  platform: null,
  start: "2023-06-15T17:05:00.000Z",
  end: "2023-06-16T01:30:00.000Z",
  plot_start: "2023-06-15T17:00:00.000Z",
  plot_end: "2023-06-15T23:00:00.000Z",
  outside: 1,
  omitted: [],
  notes: [],
  ...over,
});
const tracks = [{ id: "track-red-one" }, { id: "track-blue-one" }];

describe("what to ask", () => {
  it("asks about types when there are several, the period when entries fall outside it, and platforms with no track", () => {
    expect(questionsFor(preview(), tracks)).toEqual({ types: true, period: true, platforms: ["BLUE TWO"] });
  });

  it("asks nothing it need not", () => {
    const plain = preview({ types: [{ name: "Rider", count: 7 }], outside: 0, sources: [{ name: "RED ONE", count: 7, track_id: "track-red-one" }] });
    expect(questionsFor(plain, tracks)).toEqual({ types: false, period: false, platforms: [] });
    // A plot with no tracks has none to choose from; a plot with no period, nothing to be within.
    expect(questionsFor(preview({ plot_start: null }), []).platforms).toEqual([]);
    expect(questionsFor(preview({ plot_start: null }), []).period).toBe(false);
  });

  it("asks about five platforms at most", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, count: 1, track_id: null }));
    expect(questionsFor(preview({ sources: many }), tracks).platforms).toHaveLength(MAX_ASKED_PLATFORMS);
  });

  it("says the period choices in words", () => {
    const words = periodChoices(preview(), (iso) => iso.slice(11, 16));
    expect(words).toEqual({ all: "All 7 entries", within: "Only the 6 within the plot's period (17:00 to 23:00)" });
    expect(typeWords("")).toBe("No type");
  });
});

describe("the answers", () => {
  it("leave the types out when all are chosen, so the service reads every type", () => {
    expect(choicesOf(preview(), { types: ["OOW COMMENT", "SONAR", ""] })).toEqual({});
    expect(choicesOf(preview(), { types: ["SONAR", ""], withinPeriod: true, tracks: { "BLUE TWO": null } })).toEqual({
      types: ["SONAR", ""],
      within_period: true,
      tracks: { "BLUE TWO": null },
    });
  });

  it("are summed up after reading", () => {
    expect(readSummary({ entries: 5, omitted: ["a", "b", "c"] }, count)).toBe("Read 5 narrative entries into the plot. 3 things were not read; see the History.");
    expect(readSummary({ entries: 1, omitted: [] }, count)).toBe("Read 1 narrative entry into the plot.");
  });
});
