/**
 * Exporting the map as an image (SUB-25, EXT-05): the sizes offered, where the footer
 * with the image's ID goes, and the small text helpers the SVG is written with. Pure,
 * so it is tested without a map; exportimage.ts draws the image.
 */

export type ImagePreset = "screen" | "slide" | "a4_landscape";
export type ImageFormat = "png" | "svg";
export type ImageTheme = "current" | "light";

/** How big the map is laid out to draw an image, in CSS pixels, and how much each is scaled. */
export interface ImageLayout {
  width: number;
  height: number;
  scale: number;
}

/** The sizes offered (decision, product owner, 16 Oct 2026): as on screen, a 16:9 slide, A4 landscape. */
export const PRESETS: { id: ImagePreset; label: string; detail: string }[] = [
  { id: "screen", label: "As on screen", detail: "The map as you see it, at twice its size for sharpness" },
  { id: "slide", label: "Slide, 1600 × 900", detail: "16:9, for a PowerPoint slide" },
  { id: "a4_landscape", label: "A4 landscape", detail: "1754 × 1240: A4 at 150 dots an inch, for a Word report" },
];

/**
 * The layout for a preset. On screen: the map's own size, twice over. A slide: laid out
 * 1200 × 675 and scaled by 4/3, so text reads at a slide's size. A4 landscape: laid out
 * 877 × 620 and doubled, A4's shape at 150 dots an inch.
 */
export function layoutFor(preset: ImagePreset, screen: { width: number; height: number }): ImageLayout {
  if (preset === "slide") return { width: 1200, height: 675, scale: 4 / 3 };
  if (preset === "a4_landscape") return { width: 877, height: 620, scale: 2 };
  return { width: Math.max(1, Math.round(screen.width)), height: Math.max(1, Math.round(screen.height)), scale: 2 };
}

/** The image's size in pixels. */
export function pixelsOf(layout: ImageLayout): { width: number; height: number } {
  return { width: Math.round(layout.width * layout.scale), height: Math.round(layout.height * layout.scale) };
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Corner = "bottom-left" | "bottom-right" | "top-left" | "top-right";
/** Bottom corners first: an ID at the foot of a figure is where a reader looks for a source. */
const CORNERS: Corner[] = ["bottom-left", "bottom-right", "top-left", "top-right"];

/**
 * Where the footer goes: the corner, of the four, where it covers the least of the plot
 * (the fewest points of its tracks, annotations and labels), and never over the scale
 * bar or the north arrow; the bottom left where nothing is covered, or where all are.
 * It sits margin pixels in from the edges, beside any furniture in its corner.
 */
export function footerPlace(
  size: { width: number; height: number },
  footer: { width: number; height: number },
  furniture: Box[],
  data: { x: number; y: number }[],
  margin = 6,
): Box & { corner: Corner } {
  let best: (Box & { corner: Corner; cost: number }) | undefined;
  for (const corner of CORNERS) {
    const box = cornerBox(corner, size, footer, furniture, margin);
    const covered = data.filter((p) => p.x >= box.x0 - 2 && p.x <= box.x1 + 2 && p.y >= box.y0 - 2 && p.y <= box.y1 + 2).length;
    const blocked = furniture.some((f) => overlaps(f, box)) || box.x0 < 0 || box.y0 < 0 || box.x1 > size.width || box.y1 > size.height;
    const cost = covered + (blocked ? 1e6 : 0);
    if (!best || cost < best.cost) best = { ...box, corner, cost };
  }
  const { cost: _cost, ...place } = best!;
  return place;
}

/** The footer's box in a corner, moved along the edge past furniture there. */
function cornerBox(corner: Corner, size: { width: number; height: number }, footer: { width: number; height: number }, furniture: Box[], margin: number): Box {
  const bottom = corner.startsWith("bottom");
  const left = corner.endsWith("left");
  const y0 = bottom ? size.height - margin - footer.height : margin;
  let x0 = left ? margin : size.width - margin - footer.width;
  // Furniture on the same edge: the footer goes beside it, inward.
  for (let i = 0; i < furniture.length; i++) {
    const box = { x0, y0, x1: x0 + footer.width, y1: y0 + footer.height };
    const hit = furniture.find((f) => overlaps(f, box));
    if (!hit) break;
    x0 = left ? hit.x1 + margin : hit.x0 - margin - footer.width;
  }
  return { x0, y0, x1: x0 + footer.width, y1: y0 + footer.height };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Text for an XML attribute or element: plot content is always escaped, never markup. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** The text cut to fit a width, ending in an ellipsis where it was cut, as the map's CSS shows it. */
export function fitText(text: string, width: number, measure: (s: string) => number): string {
  if (measure(text) <= width) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (measure(`${text.slice(0, middle).trimEnd()}…`) <= width) low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

/** The first colour in a CSS text-shadow, which is a label's halo; undefined for none. */
export function haloColour(textShadow: string): string | undefined {
  if (!textShadow || textShadow === "none") return undefined;
  return /(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b)/.exec(textShadow)?.[1];
}

/** A number for an SVG attribute: CSS pixels, a few decimals at most. */
export function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** A file name for an image: the plot's title and the image's short ID, which names it should the file outlive its metadata. */
export function fileNameFor(title: string, short: string | undefined, format: ImageFormat): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${[base || "plot", short].filter(Boolean).join(" ")}.${format}`;
}

/**
 * The footer's font size, in the layout's CSS pixels: a share of the image's width, so it
 * stays legible when Word shows the image at half a page's width, and never smaller than
 * 14 pixels in the image (expert panel, 16 Oct 2026). A 1600-pixel slide's footer is 32
 * pixels high in the image; A4's, 35: about 9 points across a page, 4.5 at half its width.
 */
export const FOOTER_SHARE = 0.02;
export const FOOTER_MIN_PIXELS = 14;
export function footerFontSize(layout: ImageLayout): number {
  const pixels = Math.max(FOOTER_MIN_PIXELS, pixelsOf(layout).width * FOOTER_SHARE);
  return Math.round((pixels / layout.scale) * 100) / 100;
}

/**
 * A label's spacing and figures as the page set them, as SVG attributes: letter-spacing,
 * and tabular figures (times and ranges line up), so the PNG drawn from the SVG keeps
 * them (expert panel, 16 Oct 2026). Empty where the page has neither.
 */
export function textStyleAttributes(style: { letterSpacing: string; fontVariantNumeric: string }): string {
  const parts: string[] = [];
  const spacing = style.letterSpacing.trim();
  if (spacing && spacing !== "normal" && parseFloat(spacing) !== 0) parts.push(` letter-spacing="${escapeXml(spacing.replace(/px$/, ""))}"`);
  const numeric = style.fontVariantNumeric.trim();
  if (numeric && numeric !== "normal") parts.push(` font-variant-numeric="${escapeXml(numeric)}" style="font-variant-numeric: ${escapeXml(numeric)}"`);
  return parts.join("");
}

/**
 * The image's SVG around what it draws: its size in pixels, its view in CSS pixels, and
 * everything clipped to the map. The clip's id is the image's own (clipId), so two
 * images pasted into one SVG document do not take each other's (expert panel, 16 Oct 2026).
 */
export function svgFrame(content: string, width: number, height: number, scale: number, clipId: string): string {
  const id = escapeXml(clipId);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * scale)}" height="${Math.round(height * scale)}" viewBox="0 0 ${n(width)} ${n(height)}">` +
    `<clipPath id="${id}"><rect width="${n(width)}" height="${n(height)}"/></clipPath><g clip-path="url(#${id})">` +
    content +
    "</g></svg>"
  );
}

/** A clip id for one image, its own: "debrief-map-" and eight random symbols. */
export function clipIdFor(random: () => number = Math.random): string {
  return `debrief-map-${Math.floor(random() * 36 ** 8).toString(36).padStart(8, "0")}`;
}
