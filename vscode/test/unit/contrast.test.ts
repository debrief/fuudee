// Context tracks (CAP-29, expert panel 12 Oct): every colour in the data palette
// reaches 3:1 against the map's background on VS Code's default themes, as drawn
// (desaturated, at its opacity), when context tracks are visible.
import { describe, expect, it } from "vitest";
import {
  VISIBLE_OPACITY,
  contextShown,
  contextStyle,
  contrast,
  DIMMED_FLOOR,
  FAINT_OPACITY,
  luminance,
  over,
  parseColour,
  type MapTheme,
  type Rgb,
} from "../../webview/contrast.js";
import { DATA_COLOURS, TRACK_COLOURS } from "../../webview/palette.js";

const THEMES: Record<string, MapTheme> = {
  "Dark+": { background: parseColour("#1e1e1e")!, foreground: parseColour("#d4d4d4")!, highContrast: false },
  "Light+": { background: parseColour("#ffffff")!, foreground: parseColour("#000000")!, highContrast: false },
  // VS Code's current defaults, as the playground uses them.
  "Dark Modern": { background: parseColour("#1f1f1f")!, foreground: parseColour("#cccccc")!, highContrast: false },
  "Light Modern": { background: parseColour("#ffffff")!, foreground: parseColour("#3b3b3b")!, highContrast: false },
};
const PALETTE = [...new Set([...Object.values(DATA_COLOURS), ...TRACK_COLOURS.map((c) => c.colour)])];

/** The contrast a context line reaches as drawn: its colour at its opacity over the background. */
function drawnContrast(colour: string, theme: MapTheme, mode: "visible" | "faint" = "visible"): number {
  const style = contextStyle(colour, mode, theme)!;
  return contrast(over(parseColour(style.colour)!, style.opacity, theme.background), theme.background);
}

describe("colour arithmetic", () => {
  it("reads CSS colours", () => {
    expect(parseColour("#fff")).toEqual([1, 1, 1]);
    expect(parseColour(" #00000080 ")).toEqual([0, 0, 0]);
    expect(parseColour("rgb(255, 0, 0)")).toEqual([1, 0, 0]);
    expect(parseColour("var(--x)")).toBeUndefined();
  });
  it("computes WCAG contrast", () => {
    const [white, black]: Rgb[] = [[1, 1, 1], [0, 0, 0]];
    expect(contrast(white, black)).toBeCloseTo(21, 5);
    expect(contrast(black, white)).toBeCloseTo(21, 5);
    expect(luminance(white)).toBeCloseTo(1, 5);
  });
});

describe("visible context tracks reach 3:1 against the map, as drawn", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    it.each(PALETTE)(`${name}: %s`, (colour) => {
      const style = contextStyle(colour, "visible", theme)!;
      expect(drawnContrast(colour, theme)).toBeGreaterThanOrEqual(3);
      expect(style.weight).toBe(1.5);
      expect(style.opacity).toBeGreaterThanOrEqual(VISIBLE_OPACITY);
      expect(style.opacity).toBeLessThanOrEqual(1);
    });
  }
  it("keeps each track's hue, quieter than its own colour", () => {
    const theme = THEMES["Dark+"];
    const red = parseColour(contextStyle("#e01c3e", "visible", theme)!.colour)!;
    const blue = parseColour(contextStyle("#0064bd", "visible", theme)!.colour)!;
    expect(red[0]).toBeGreaterThan(red[2]); // still red
    expect(blue[2]).toBeGreaterThan(blue[0]); // still blue
    const chroma = (c: Rgb) => Math.max(...c) - Math.min(...c);
    expect(chroma(red)).toBeLessThan(chroma(parseColour("#e01c3e")!));
  });
  it("holds for any colour a track might bring with it, such as a legacy REP colour", () => {
    for (const colour of ["#000000", "#ffffff", "#ffff00", "#000080", "#808080", "#ff00ff", "#202020", "#f0f0f0"]) {
      for (const theme of [THEMES["Dark+"], THEMES["Light+"]]) expect(drawnContrast(colour, theme)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("faint, hidden, dimmed and high contrast", () => {
  it("draws faint fainter, with no 3:1 promise, and hidden not at all", () => {
    const theme = THEMES["Dark+"];
    expect(contextStyle("#0064bd", "faint", theme)!.opacity).toBe(FAINT_OPACITY);
    expect(drawnContrast("#0064bd", theme, "faint")).toBeLessThan(drawnContrast("#0064bd", theme, "visible"));
    expect(contextStyle("#0064bd", "hidden", theme)).toBeUndefined();
  });
  it("dims for a selection elsewhere, never below 0.3", () => {
    for (const mode of ["visible", "faint"] as const) {
      const style = contextStyle("#00a000", mode, THEMES["Light+"])!;
      expect(style.dimmed).toBeGreaterThanOrEqual(DIMMED_FLOOR);
      expect(style.dimmed).toBeLessThanOrEqual(style.opacity);
    }
  });
  it("on a high-contrast theme: the track's own colour, opaque, 1 px, never dimmed", () => {
    const hc: MapTheme = { background: [0, 0, 0], foreground: [1, 1, 1], highContrast: true };
    for (const mode of ["visible", "faint"] as const) {
      expect(contextStyle("#e01c3e", mode, hc)).toEqual({ colour: "#e01c3e", opacity: 1, weight: 1, dimmed: 1 });
    }
    expect(contextStyle("#e01c3e", "hidden", hc)).toBeUndefined();
  });
  it("the analyst's minimum-contrast setting shows faint as visible, and leaves hidden alone", () => {
    expect(contextShown(undefined, false)).toBe("visible");
    expect(contextShown("faint", false)).toBe("faint");
    expect(contextShown("faint", true)).toBe("visible");
    expect(contextShown("hidden", true)).toBe("hidden");
  });
});
