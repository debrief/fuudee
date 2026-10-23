// Dockview's stylesheet, less its own themes (scripts/csstrim.mjs): a brace in a comment or a
// string is text, not a rule's edge; only rules all of whose selectors are a theme's go.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withoutThemes } from "../../scripts/csstrim.mjs";

describe("trimming Dockview's themes", () => {
  it("leaves out a theme's rules and keeps the rest", () => {
    const css = ".dv-tab { color: red; }\n.dockview-theme-dark { --dv-x: 1; }\n.dockview-theme-dark .dv-tab, .dv-sash { width: 4px; }\n@media (pointer: coarse) { .dv-sash { width: 8px; } }\n";
    const out = withoutThemes(css);
    expect(out).toContain(".dv-tab { color: red; }");
    expect(out).not.toContain("--dv-x");
    expect(out).toContain(".dockview-theme-dark .dv-tab, .dv-sash"); // one selector is not a theme's
    expect(out).toContain("@media (pointer: coarse)");
  });
  it("is not misled by braces in comments or strings", () => {
    const css = '/* a { in a comment */ .dv-a { content: "}"; }\n.dockview-theme-x { a: b; }\n.dv-b::before { content: \'{\'; }\n';
    const out = withoutThemes(css);
    expect(out).toContain('.dv-a { content: "}"; }');
    expect(out).toContain(".dv-b::before { content: '{'; }");
    expect(out).not.toContain("dockview-theme-x");
  });
  it("refuses a stylesheet whose braces do not balance, rather than trim it wrongly", () => {
    expect(() => withoutThemes(".a { b: c;")).toThrow();
  });
  it("trims the pinned Dockview's stylesheet to its layout rules", () => {
    const css = readFileSync("node_modules/dockview-core/dist/styles/dockview.css", "utf8");
    const out = withoutThemes(css);
    expect(out.length).toBeLessThan(css.length / 2);
    expect(out).not.toMatch(/\.dockview-theme-/);
    expect(out).toContain(".dv-render-overlay");
  });
});
