import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FigureSource } from "@debrief/schemas";
import { clipIdFor, escapeXml, fileNameFor, fitText, footerFontSize, footerPlace, haloColour, layoutFor, pixelsOf, PRESETS, svgFrame, textStyleAttributes } from "../../webview/exportlogic.js";
import { DEFAULT_EXPORT, describeExport, describeExported, describeSource, guardRequest, insideFolders, LEAVES_PLOT, READ_ONLY, rememberedOf, revisionOf, startingChoice } from "../../src/figures.js";
import { READ_ONLY_CODE, ToolService } from "../../src/service.js";
import { checkMessage } from "../../src/messages.js";

const repo = path.resolve(__dirname, "../../..");
const fixture = (name: string) => JSON.parse(readFileSync(path.join(repo, "schemas", "fixtures", "webview_message", name), "utf8"));

describe("the sizes an image is exported at (SUB-25)", () => {
  it("offers the map as on screen, a 16:9 slide and A4 landscape", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["screen", "slide", "a4_landscape"]);
    expect(pixelsOf(layoutFor("slide", { width: 900, height: 700 }))).toEqual({ width: 1600, height: 900 });
    expect(pixelsOf(layoutFor("a4_landscape", { width: 900, height: 700 }))).toEqual({ width: 1754, height: 1240 });
    expect(layoutFor("screen", { width: 812.4, height: 600 })).toEqual({ width: 812, height: 600, scale: 2 });
    expect(pixelsOf(layoutFor("screen", { width: 812, height: 600 }))).toEqual({ width: 1624, height: 1200 });
  });
  it("lays a slide out so its text reads at a slide's size, not a tiny one", () => {
    const slide = layoutFor("slide", { width: 1600, height: 900 });
    expect(slide.scale).toBeGreaterThan(1);
    expect(slide.width / slide.height).toBeCloseTo(16 / 9, 3);
    const a4 = layoutFor("a4_landscape", { width: 1, height: 1 });
    expect(a4.width / a4.height).toBeCloseTo(Math.SQRT2, 2);
  });
});

describe("where the footer goes", () => {
  const size = { width: 800, height: 450 };
  const footer = { width: 120, height: 16 };
  const scaleBar = { x0: 700, y0: 420, x1: 790, y1: 440 };
  it("bottom left when nothing is there", () => {
    expect(footerPlace(size, footer, [scaleBar], [])).toMatchObject({ corner: "bottom-left", x0: 6, y1: 444 });
  });
  it("the corner it covers least of the plot, never over the scale bar or the north arrow", () => {
    const busy = Array.from({ length: 30 }, (_, i) => ({ x: 10 + i * 3, y: 440 }));
    const place = footerPlace(size, footer, [scaleBar], busy);
    expect(place.corner).toBe("bottom-right");
    expect(place.x1).toBeLessThanOrEqual(scaleBar.x0); // beside the scale bar, not on it
  });
  it("beside a north arrow in its corner", () => {
    const busy = [...Array.from({ length: 30 }, (_, i) => ({ x: 10 + i * 3, y: 440 })), ...Array.from({ length: 30 }, (_, i) => ({ x: 560 + i * 3, y: 440 })), ...Array.from({ length: 30 }, (_, i) => ({ x: 10 + i * 3, y: 10 }))];
    const north = { x0: 760, y0: 6, x1: 794, y1: 50 };
    const place = footerPlace(size, footer, [scaleBar, north], busy);
    expect(place.corner).toBe("top-right");
    expect(place.x1).toBeLessThanOrEqual(north.x0);
  });
});

describe("text in an SVG", () => {
  it("is always escaped: plot content is never markup", () => expect(escapeXml(`<b>"A & B's"</b>`)).toBe("&lt;b&gt;&quot;A &amp; B&apos;s&quot;&lt;/b&gt;"));
  it("is cut to fit as the map cuts it, with an ellipsis", () => {
    const measure = (s: string) => s.length * 6;
    expect(fitText("short", 100, measure)).toBe("short");
    const cut = fitText("Contact gained bearing 045, closing", 100, measure);
    expect(cut.endsWith("…")).toBe(true);
    expect(measure(cut)).toBeLessThanOrEqual(100);
  });
  it("haloes a label in the first colour of its text shadow", () => {
    expect(haloColour("rgb(31, 31, 31) 0px 0px 3px, rgb(31, 31, 31) 0px 0px 3px")).toBe("rgb(31, 31, 31)");
    expect(haloColour("none")).toBeUndefined();
  });
  it("names the file for the plot and the image's ID", () => {
    expect(fileNameFor("Serial 1", "DBF-PTET-KG8R-B9EM-69", "png")).toBe("Serial-1 DBF-PTET-KG8R-B9EM-69.png");
    expect(fileNameFor("Ex: blue/red ", undefined, "svg")).toBe("Ex-bluered.svg");
    expect(fileNameFor("", undefined, "png")).toBe("plot.png");
  });
});

describe("what the hosts say", () => {
  const source: FigureSource = { store: "sample", store_title: "Sample", catalogue: "debrief-sample", item: "serial-1", title: "Serial 1", revision: `sha256:${"a".repeat(64)}`, step: 3, current: 5 };
  it("an export, with its ID and whether the plot's export log has it", () => {
    expect(describeExported({ file: "/tmp/Serial-1.png", short: "DBF-PTET-KG8R-B9EM-69", recorded: true }, true)).toBe(
      "Exported Serial-1.png. Its ID, DBF-PTET-KG8R-B9EM-69, is in its metadata and its corner. The plot's export log has it.",
    );
    expect(describeExported({ file: "C:\\figures\\a.svg", short: "DBF-PTET-KG8R-B9EM-69", recorded: false, note: "Not logged: read-only." }, false)).toBe(
      "Exported a.svg. Its ID, DBF-PTET-KG8R-B9EM-69, is in its metadata (no footer). Not logged: read-only.",
    );
  });
  it("a plot an image came from: the step it was exported at, and where the plot is now", () => {
    expect(describeSource(source)).toEqual({ label: "Serial 1, step 3; the plot is at step 5 now", detail: "Sample" });
    expect(describeSource({ ...source, current: 3, copied: true })).toEqual({ label: "Serial 1, step 3, as it is now", detail: "Sample · a copy, with the same content then" });
    expect(revisionOf(source, "DBF-PTET-KG8R-B9EM-69")).toEqual({ step: 3, latest: 5, revision: source.revision, figure: "DBF-PTET-KG8R-B9EM-69" });
  });
  it("lists two exports of one revision by when each was made and what it showed", () => {
    const entry = { id: "DBF1-X", revision: source.revision, at: "2026-10-16T10:42:07.000Z", format: "png" as const, footer: true, viewport: { bbox: [-4.2, 50.3, -4.0, 50.4] as [number, number, number, number] } };
    expect(describeExport(entry)).toBe("exported 16 Oct 2026 10:42 UTC, 50.30°N to 50.40°N, 4.20°W to 4.00°W");
    expect(describeSource({ ...source, export: entry }).detail).toBe("exported 16 Oct 2026 10:42 UTC, 50.30°N to 50.40°N, 4.20°W to 4.00°W · Sample");
  });
});

describe("a plot shown read-only (SUB-25; expert panel, 16 Oct 2026)", () => {
  const vectors = JSON.parse(readFileSync(path.join(repo, "schemas/vectors/service-methods.json"), "utf8")) as { changes_plot: string[]; leaves_plot: string[] };
  const shown = { store: "exercise", item: "serial" };
  it("allows only the methods that leave a plot alone, as Python lists them", () => {
    expect([...LEAVES_PLOT].sort()).toEqual([...vectors.leaves_plot].sort());
    for (const method of vectors.changes_plot) expect(LEAVES_PLOT.has(method)).toBe(false);
  });
  it("refuses every change aimed at it, and a method it does not know", () => {
    for (const method of vectors.changes_plot.filter((m) => m !== "tools/call")) expect(guardRequest(method, { ...shown }, shown)).toEqual({ refused: READ_ONLY });
    expect(guardRequest("tools/call", { name: "x", arguments: { ...shown } }, shown)).toEqual({ refused: READ_ONLY });
    expect(guardRequest("debrief/some_later_change", { ...shown }, shown)).toEqual({ refused: READ_ONLY });
    expect(READ_ONLY).toMatch(/read-only/);
  });
  it("leaves other plots, and reading this one, alone; opens it without recovering", () => {
    expect(guardRequest("debrief/set_colour", { store: "exercise", item: "other" }, shown)).toEqual({ params: { store: "exercise", item: "other" } });
    expect(guardRequest("debrief/set_colour", { ...shown }, undefined)).toEqual({ params: { ...shown } });
    expect(guardRequest("debrief/tote", { ...shown, time: "t" }, shown)).toEqual({ params: { ...shown, time: "t" } });
    expect(guardRequest("debrief/open", { ...shown }, shown)).toEqual({ params: { ...shown, read_only: true } });
  });
  it("is refused in the tool service's client, before anything is sent", async () => {
    const service = Object.create(ToolService.prototype) as unknown as { shownReadOnly: ToolService["shownReadOnly"]; request: (method: string, params: object) => Promise<unknown> };
    service.shownReadOnly = () => shown;
    await expect(service.request("debrief/undo", { ...shown })).rejects.toMatchObject({ code: READ_ONLY_CODE, message: READ_ONLY });
  });
});

describe("what an export starts from", () => {
  it("the size and colours chosen last; the footer on, every time", () => {
    const last = rememberedOf({ format: "svg", preset: "a4_landscape", theme: "light", footer: false });
    expect(last).toEqual({ preset: "a4_landscape", theme: "light" });
    expect(startingChoice(last)).toEqual({ ...DEFAULT_EXPORT, preset: "a4_landscape", theme: "light", footer: true });
    // Remembered before this rule, with the footer off: on again.
    expect(startingChoice({ preset: "screen", theme: "current", footer: false, format: "svg" })).toEqual({ ...DEFAULT_EXPORT, preset: "screen" });
    expect(startingChoice(undefined)).toEqual(DEFAULT_EXPORT);
    expect(startingChoice({ preset: "huge" })).toEqual(DEFAULT_EXPORT);
  });
});

describe("where an agent may write an image", () => {
  it("inside the workspace's folders or the exports folder, nowhere else", () => {
    expect(insideFolders("/work/figures/a.png", ["/work"])).toBe(true);
    expect(insideFolders("/work-other/a.png", ["/work"])).toBe(false);
    expect(insideFolders("/etc/a.png", ["/work", "/exports"])).toBe(false);
    expect(insideFolders("/exports/a.png", ["/work", "/exports/"])).toBe(true);
    expect(insideFolders("C:\\Work\\a.png", ["c:\\work"], true)).toBe(true);
    expect(insideFolders("C:\\Work\\a.png", ["c:\\work"], false)).toBe(false);
    expect(insideFolders("/a.png", [""])).toBe(false);
  });
});

describe("the export's messages are boundary types (CON-08)", () => {
  it.each(["export-image", "export-image-no-footer", "image-rendered", "image-not-rendered", "latest-asked", "show-plot-earlier-revision"])("accepts %s", (name) => {
    const raw = fixture(`valid/${name}.json`);
    expect(checkMessage(raw)).toEqual(raw);
  });
  it.each(["image-rendered-without-image", "export-image-without-request", "latest-asked-carrying-plot-title"])("refuses %s, which Python refuses too", (name) => {
    expect(() => checkMessage(fixture(`invalid/semantic/${name}.json`))).toThrow();
  });
  it.each(["export-image-footer-not-short-id", "export-image-unknown-preset"])("refuses %s by its schema", (name) => {
    expect(() => checkMessage(fixture(`invalid/schema/${name}.json`))).toThrow();
  });
});

describe("the parts the image's SVG is written with (expert panel, 16 Oct 2026)", () => {
  it("a footer sized to the image, so it reads at half a page's width, never under 14 pixels", () => {
    const slide = layoutFor("slide", { width: 900, height: 700 });
    expect(footerFontSize(slide) * slide.scale).toBeCloseTo(32, 1);
    const a4 = layoutFor("a4_landscape", { width: 900, height: 700 });
    expect(footerFontSize(a4) * a4.scale).toBeCloseTo(35.08, 1);
    const small = layoutFor("screen", { width: 300, height: 200 });
    expect(footerFontSize(small) * small.scale).toBeCloseTo(14, 1);
  });
  it("keeps a label's letter-spacing and tabular figures, and adds nothing where it has neither", () => {
    expect(textStyleAttributes({ letterSpacing: "0.5px", fontVariantNumeric: "tabular-nums" })).toBe(' letter-spacing="0.5" font-variant-numeric="tabular-nums" style="font-variant-numeric: tabular-nums"');
    expect(textStyleAttributes({ letterSpacing: "normal", fontVariantNumeric: "normal" })).toBe("");
    expect(textStyleAttributes({ letterSpacing: "0px", fontVariantNumeric: "" })).toBe("");
  });
  it("clips each image to its own id, so two in one document do not share one", () => {
    const a = clipIdFor(() => 0.25);
    const b = clipIdFor(() => 0.75);
    expect(a).toMatch(/^debrief-map-[0-9a-z]{8}$/);
    expect(a).not.toBe(b);
    const svg = svgFrame("<path/>", 800, 450, 2, a);
    expect(svg).toBe(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 800 450"><clipPath id="${a}"><rect width="800" height="450"/></clipPath><g clip-path="url(#${a})"><path/></g></svg>`);
    expect(svg).not.toContain('id="debrief-map"');
  });
});
