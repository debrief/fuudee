import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FigureSource } from "@debrief/schemas";
import { escapeXml, fileNameFor, fitText, footerPlace, haloColour, layoutFor, pixelsOf, PRESETS } from "../../webview/exportlogic.js";
import { CHANGING_METHODS, describeExported, describeSource, READ_ONLY, revisionOf } from "../../src/figures.js";
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
    expect(fileNameFor("Serial 1", "DBF-PTET-KG8R-B9E9", "png")).toBe("Serial-1 DBF-PTET-KG8R-B9E9.png");
    expect(fileNameFor("Ex: blue/red ", undefined, "svg")).toBe("Ex-bluered.svg");
    expect(fileNameFor("", undefined, "png")).toBe("plot.png");
  });
});

describe("what the hosts say", () => {
  const source: FigureSource = { store: "sample", store_title: "Sample", catalogue: "debrief-sample", item: "serial-1", title: "Serial 1", revision: `sha256:${"a".repeat(64)}`, step: 3, current: 5 };
  it("an export, with its ID and whether the plot's export log has it", () => {
    expect(describeExported({ file: "/tmp/Serial-1.png", short: "DBF-PTET-KG8R-B9E9", recorded: true }, true)).toBe(
      "Exported Serial-1.png. Its ID, DBF-PTET-KG8R-B9E9, is in its metadata and its corner. The plot's export log has it.",
    );
    expect(describeExported({ file: "C:\\figures\\a.svg", short: "DBF-PTET-KG8R-B9E9", recorded: false, note: "Not logged: read-only." }, false)).toBe(
      "Exported a.svg. Its ID, DBF-PTET-KG8R-B9E9, is in its metadata (no footer). Not logged: read-only.",
    );
  });
  it("a plot an image came from: the step it was exported at, and where the plot is now", () => {
    expect(describeSource(source)).toEqual({ label: "Serial 1, step 3; the plot is at step 5 now", detail: "Sample" });
    expect(describeSource({ ...source, current: 3, copied: true })).toEqual({ label: "Serial 1, step 3, as it is now", detail: "Sample · a copy, with the same content then" });
    expect(revisionOf(source, "DBF-PTET-KG8R-B9E9")).toEqual({ step: 3, latest: 5, revision: source.revision, figure: "DBF-PTET-KG8R-B9E9" });
  });
  it("refuses every change, and nothing else, while an earlier revision is shown", () => {
    for (const method of ["tools/call", "debrief/undo", "debrief/set_view", "debrief/edit_track", "debrief/take_new_data", "debrief/clear_review_flag"]) expect(CHANGING_METHODS.has(method)).toBe(true);
    for (const method of ["debrief/open", "debrief/figure_id", "debrief/export_image", "debrief/find_image_source", "debrief/open_revision", "debrief/tote", "debrief/history"]) expect(CHANGING_METHODS.has(method)).toBe(false);
    expect(READ_ONLY).toMatch(/read-only/);
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
