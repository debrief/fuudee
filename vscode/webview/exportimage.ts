/**
 * The map as an image (SUB-25, EXT-05): what the analyst sees, written as SVG from the
 * map as drawn, so what is exported is what is on screen, labels where the map placed
 * them after keeping them clear of one another. Then, for a PNG, that SVG drawn onto a
 * canvas.
 *
 * In it: land and the graticule; tracks, annotations, the selection's
 * plot features as unselected; symbols and arrows (the map's canvas, drawn again as
 * vectors); time labels, track names, fix and annotation labels; current time's
 * markers, the Tote's lines and the narrative box; the north arrow and the scale bar;
 * and the footer with the image's short ID. Not in it: the map's controls, its key, its
 * notes, the drawing toolbar, handles, fixes ringed to check, and the selection's
 * outline and dimming, which are for working, not for a report. The map draws no
 * reference tiles; were one shown, it would be left out and said so.
 */
import { escapeXml, fitText, footerPlace, haloColour, n, svgFrame, textStyleAttributes, type Box } from "./exportlogic.js";

/** A symbol or an arrow from the map's canvas, where it is on the map (container pixels). */
export interface PaintedMark {
  kind: "symbol" | "arrow";
  x: number;
  y: number;
  colour: string;
  course?: number;
}

export interface ComposeOptions {
  root: HTMLElement;
  width: number;
  height: number;
  scale: number;
  background: string;
  marks: PaintedMark[];
  /** The footer's text, colours and font size (footerFontSize); none for no footer. */
  footer?: { text: string; colour: string; halo: string; size: number };
  /** The size of the chevron the map draws arrows with (map.ts TICK_SIZE). */
  tickSize: number;
  /** The image's own clip id (clipIdFor). */
  clipId: string;
}

/** Paths that are for working, never in an image: handles, fixes to check, a change previewed, the wide invisible edge that takes clicks. */
const WORKING = /\b(edit-handle|track-handle|track-arm|fix-check|fix-preview|area-edge)\b/;
const LABELS = ".leaflet-tooltip.track-label, .leaflet-tooltip.annotation-label, .leaflet-tooltip.fix-label";
const PATH_STYLE = ["stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "fill", "fill-opacity", "fill-rule", "opacity"] as const;

function shown(element: Element): boolean {
  const check = (element as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
  if (check && !check.call(element, { opacityProperty: true, visibilityProperty: true })) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && element.getClientRects().length > 0;
}

/** Everything the image holds, as SVG text, and what it leaves out that the map shows. */
export function composeSvg(options: ComposeOptions): { svg: string; notes: string[]; covered: { x: number; y: number }[] } {
  const { root, width, height, scale } = options;
  const origin = root.getBoundingClientRect();
  const at = (r: DOMRect) => ({ x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height });
  const out: string[] = [];
  const notes: string[] = [];
  /** Points the footer should keep off: what the plot draws, sampled. */
  const covered: { x: number; y: number }[] = [];
  out.push(`<rect width="${n(width)}" height="${n(height)}" fill="${escapeXml(options.background)}"/>`);

  // Reference tiles: the map draws none; any shown is left out (another page's picture can
  // neither be read back from a canvas nor be fetched under the webview's policy), and said.
  const tiles = Array.from(root.querySelectorAll<HTMLImageElement>(".leaflet-tile-pane img")).filter(shown).length;
  if (tiles) notes.push("The map's reference tiles are not in the image.");

  // Leaflet's vector layers: land, the graticule, tracks, annotations, the Tote's lines.
  for (const layer of Array.from(root.querySelectorAll<SVGSVGElement>(".leaflet-pane svg.leaflet-zoom-animated, .leaflet-overlay-pane > svg"))) {
    if (layer.closest(".leaflet-control-container") || !shown(layer)) continue;
    const r = at(layer.getBoundingClientRect());
    const viewBox = layer.getAttribute("viewBox") ?? `0 0 ${r.width} ${r.height}`;
    out.push(`<svg x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" viewBox="${escapeXml(viewBox)}" overflow="visible">`);
    const [vx, vy, vw, vh] = viewBox.split(/[\s,]+/).map(Number);
    for (const path of Array.from(layer.querySelectorAll<SVGPathElement>("path"))) {
      if (WORKING.test(path.getAttribute("class") ?? "")) continue;
      const style = getComputedStyle(path);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      if ((style.stroke === "none" || Number(style.strokeOpacity) === 0) && (style.fill === "none" || Number(style.fillOpacity) === 0)) continue;
      const d = path.getAttribute("d");
      if (!d || d === "M0 0") continue;
      const attributes = PATH_STYLE.map((name) => {
        const value = style.getPropertyValue(name).replace(/px\b/g, "").trim();
        return value && value !== "none" ? ` ${name}="${escapeXml(value)}"` : name === "fill" || name === "stroke" ? ` ${name}="none"` : "";
      }).join("");
      out.push(`<path d="${escapeXml(d)}"${attributes}/>`);
      // A few points along it, for where the footer goes.
      try {
        const length = path.getTotalLength();
        for (let i = 0; i <= 24 && length > 0; i++) {
          const p = path.getPointAtLength((length * i) / 24);
          covered.push({ x: r.x + ((p.x - vx) * r.width) / (vw || 1), y: r.y + ((p.y - vy) * r.height) / (vh || 1) });
        }
      } catch {
        // A path the browser cannot measure: the footer simply does not avoid it.
      }
    }
    out.push("</svg>");
  }

  // Symbols and arrows, from the map's canvas, as vectors.
  const k = options.tickSize / 16;
  for (const mark of options.marks) {
    if (mark.x < -20 || mark.y < -20 || mark.x > width + 20 || mark.y > height + 20) continue;
    covered.push({ x: mark.x, y: mark.y });
    if (mark.kind === "symbol") {
      out.push(`<circle cx="${n(mark.x)}" cy="${n(mark.y)}" r="2.5" fill="${escapeXml(mark.colour)}" stroke="${escapeXml(options.background)}" stroke-width="1"/>`);
      continue;
    }
    const chevron = `M${n(-5 * k)} ${n(3 * k)} L0 ${n(-3 * k)} L${n(5 * k)} ${n(3 * k)}`;
    const turn = `translate(${n(mark.x)} ${n(mark.y)}) rotate(${n(mark.course ?? 0)})`;
    out.push(`<g transform="${turn}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${chevron}" stroke="${escapeXml(options.background)}" stroke-width="${n(4.5 * k)}" opacity="0.8"/><path d="${chevron}" stroke="${escapeXml(mark.colour)}" stroke-width="${n(2.5 * k)}"/></g>`);
  }

  // The default direction arrows: chevrons in their own small SVGs, turned to the course.
  for (const tick of Array.from(root.querySelectorAll<HTMLElement>(".leaflet-marker-icon.tick"))) {
    if (!shown(tick)) continue;
    const r = at(tick.getBoundingClientRect());
    const svg = tick.querySelector("svg");
    if (!svg) continue;
    const box = at(svg.getBoundingClientRect());
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const rotation = parseFloat(tick.style.getPropertyValue("--tick-rotation")) || 0;
    const colour = tick.style.getPropertyValue("--tick-colour") || getComputedStyle(tick.querySelector(".tick-mark")!).stroke;
    const halo = getComputedStyle(tick.querySelector(".tick-halo")!).stroke;
    const s = options.tickSize / 16;
    covered.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    out.push(
      `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${n(rotation)}) translate(${n(-8 * s)} ${n(-8 * s)}) scale(${n(s)})" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M3 11 L8 5 L13 11" stroke="${escapeXml(halo)}" stroke-width="4.5" opacity="0.8"/><path d="M3 11 L8 5 L13 11" stroke="${escapeXml(colour)}" stroke-width="2.5"/></g>`,
    );
  }

  // Current time: a square in each track's colour, outlined in the text colour.
  for (const marker of Array.from(root.querySelectorAll<HTMLElement>(".leaflet-marker-icon.now"))) {
    if (!shown(marker)) continue;
    const r = at(marker.getBoundingClientRect());
    const after = getComputedStyle(marker, "::after");
    const fill = marker.style.getPropertyValue("--now-colour") || after.backgroundColor;
    const border = parseFloat(after.borderTopWidth) || 1.5;
    covered.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    out.push(
      `<rect x="${n(r.x + border / 2)}" y="${n(r.y + border / 2)}" width="${n(r.width - border)}" height="${n(r.height - border)}" fill="${escapeXml(fill)}" stroke="${escapeXml(after.borderTopColor)}" stroke-width="${n(border)}"/>`,
    );
  }

  // Time labels: a short leader in the track's colour, then the time, haloed.
  for (const label of Array.from(root.querySelectorAll<HTMLElement>(".fix-time"))) {
    const anchor = label.closest<HTMLElement>(".leaflet-marker-icon");
    if (!anchor || !shown(anchor)) continue;
    const leader = label.querySelector<HTMLElement>(".fix-time-leader");
    const words = label.querySelector<HTMLElement>(".fix-time-text");
    const opacity = Number(getComputedStyle(anchor).opacity) || 1;
    if (leader) {
      const a = at(anchor.getBoundingClientRect());
      const angle = (parseFloat(/rotate\(([-\d.e]+)deg\)/.exec(leader.style.transform)?.[1] ?? "0") * Math.PI) / 180;
      const length = leader.offsetWidth || 7;
      const style = getComputedStyle(leader);
      out.push(
        `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(a.x + Math.cos(angle) * length)}" y2="${n(a.y + Math.sin(angle) * length)}" stroke="${escapeXml(style.backgroundColor)}" stroke-width="${n(leader.offsetHeight || 1.5)}" opacity="${n(Number(style.opacity) * opacity)}"/>`,
      );
    }
    if (words) out.push(textElement(words, at, opacity, covered));
  }

  // Track names, fixes' own labels and annotations' labels, as the map placed them.
  for (const label of Array.from(root.querySelectorAll<HTMLElement>(LABELS))) {
    if (!shown(label)) continue;
    out.push(textElement(label, at, 1, covered));
  }

  // The narrative entry at current time, in its small box.
  for (const box of Array.from(root.querySelectorAll<HTMLElement>(".narrative-box"))) {
    if (!shown(box)) continue;
    out.push(narrativeBox(box, at, covered));
  }

  // Chart furniture: the north arrow and the scale bar.
  const furniture: Box[] = [];
  const north = root.querySelector<HTMLElement>(".north-arrow");
  if (north && !north.hidden && shown(north)) {
    const r = at(north.getBoundingClientRect());
    out.push(panel(north, r));
    const svg = north.querySelector("svg");
    if (svg) {
      const s = at(svg.getBoundingClientRect());
      const colour = getComputedStyle(north).color;
      const font = getComputedStyle(svg.querySelector("text") ?? north);
      out.push(
        `<svg x="${n(s.x)}" y="${n(s.y)}" width="${n(s.width)}" height="${n(s.height)}" viewBox="0 0 24 36"><path d="M12 2 L20 26 L12 21 L4 26 Z" fill="${escapeXml(colour)}"/>` +
          `<text x="12" y="35" text-anchor="middle" font-size="10" font-weight="${escapeXml(font.fontWeight)}" font-family="${escapeXml(font.fontFamily)}" fill="${escapeXml(colour)}">N</text></svg>`,
      );
    }
    furniture.push({ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height });
  }
  const scaleBar = root.querySelector<HTMLElement>(".scale-bar");
  if (scaleBar && shown(scaleBar)) {
    const r = at(scaleBar.getBoundingClientRect());
    const style = getComputedStyle(scaleBar);
    const edge = parseFloat(style.borderLeftWidth) || 2;
    out.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" fill="${escapeXml(style.backgroundColor)}"/>`);
    out.push(
      `<path d="M${n(r.x + edge / 2)} ${n(r.y)} V${n(r.y + r.height - edge / 2)} H${n(r.x + r.width - edge / 2)} V${n(r.y)}" fill="none" stroke="${escapeXml(style.borderLeftColor)}" stroke-width="${n(edge)}"/>`,
    );
    out.push(textElement(scaleBar, at, 1, [], "middle"));
    furniture.push({ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height });
  }

  // The footer: the image's short ID, small and haloed, in the corner it covers least of.
  if (options.footer) {
    const family = getComputedStyle(root).fontFamily;
    const size = options.footer.size;
    const font = `${size}px ${family}`;
    const width = measureText(options.footer.text, font) + 6;
    const metrics = fontMetrics(font);
    const place = footerPlace({ width: options.width, height: options.height }, { width, height: metrics.ascent + metrics.descent + 4 }, furniture, covered);
    const baseline = place.y0 + 2 + metrics.ascent;
    out.push(
      `<text class="debrief-footer" x="${n(place.x0 + 3)}" y="${n(baseline)}" style="font-variant-numeric: tabular-nums" font-family="${escapeXml(family)}" font-size="${n(size)}" letter-spacing="${n(size * 0.03)}" fill="${escapeXml(options.footer.colour)}" stroke="${escapeXml(options.footer.halo)}" stroke-width="${n(Math.max(3, size * 0.28))}" stroke-linejoin="round" paint-order="stroke">${escapeXml(options.footer.text)}</text>`,
    );
  }

  return { svg: svgFrame(out.join(""), width, height, scale, options.clipId), notes, covered };
}

/** A box's background and border, as the map draws a control. */
function panel(element: HTMLElement, r: { x: number; y: number; width: number; height: number }): string {
  const style = getComputedStyle(element);
  const border = parseFloat(style.borderTopWidth) || 0;
  const stroke = border ? ` stroke="${escapeXml(style.borderTopColor)}" stroke-width="${n(border)}"` : "";
  return `<rect x="${n(r.x + border / 2)}" y="${n(r.y + border / 2)}" width="${n(r.width - border)}" height="${n(r.height - border)}" rx="${n(parseFloat(style.borderTopLeftRadius) || 0)}" fill="${escapeXml(style.backgroundColor)}"${stroke}/>`;
}

const measurer = document.createElement("canvas").getContext("2d");
function measureText(text: string, font: string): number {
  if (!measurer) return text.length * 7;
  measurer.font = font;
  return measurer.measureText(text).width;
}
function fontMetrics(font: string): { ascent: number; descent: number } {
  const size = parseFloat(/([\d.]+)px/.exec(font)?.[1] ?? "12");
  if (!measurer) return { ascent: size * 0.8, descent: size * 0.2 };
  measurer.font = font;
  const m = measurer.measureText("Hg");
  return { ascent: m.fontBoundingBoxAscent || size * 0.8, descent: m.fontBoundingBoxDescent || size * 0.2 };
}

/** One line of text as the page laid it out: its font, colour and halo, at its baseline. */
function textElement(
  element: HTMLElement,
  at: (r: DOMRect) => { x: number; y: number; width: number; height: number },
  opacity: number,
  covered: { x: number; y: number }[],
  anchor: "start" | "middle" = "start",
): string {
  const style = getComputedStyle(element);
  const range = document.createRange();
  range.selectNodeContents(element);
  const r = at(range.getBoundingClientRect());
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const { ascent, descent } = fontMetrics(font);
  const baseline = r.y + (r.height - (ascent + descent)) / 2 + ascent;
  const x = anchor === "middle" ? r.x + r.width / 2 : r.x;
  const halo = haloColour(style.textShadow);
  const haloed = halo ? ` stroke="${escapeXml(halo)}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"` : "";
  const alpha = Number(style.opacity) * opacity;
  covered.push({ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
  return (
    `<text x="${n(x)}" y="${n(baseline)}"${anchor === "middle" ? ' text-anchor="middle"' : ""} font-family="${escapeXml(style.fontFamily)}" font-size="${escapeXml(style.fontSize.replace("px", ""))}" font-weight="${escapeXml(style.fontWeight)}"${textStyleAttributes(style)}` +
    ` fill="${escapeXml(style.color)}"${haloed}${alpha < 1 ? ` opacity="${n(alpha)}"` : ""} xml:space="preserve">${escapeXml(element.textContent ?? "")}</text>` // not user-facing
  );
}

/** The narrative box: its panel, then its source in bold and its text, cut to fit as the map cuts it. */
function narrativeBox(box: HTMLElement, at: (r: DOMRect) => { x: number; y: number; width: number; height: number }, covered: { x: number; y: number }[]): string {
  const r = at(box.getBoundingClientRect());
  const style = getComputedStyle(box);
  const source = box.querySelector("b")?.textContent ?? "";
  const rest = (box.textContent ?? "").slice(source.length);
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const bold = `600 ${style.fontSize} ${style.fontFamily}`;
  const padding = parseFloat(style.paddingLeft) || 6;
  const room = r.width - 2 * padding;
  const sourceWidth = measureText(source, bold) + 2;
  const text = fitText(rest, Math.max(0, room - sourceWidth), (s) => measureText(s, font));
  const { ascent, descent } = fontMetrics(font);
  const baseline = r.y + (r.height - (ascent + descent)) / 2 + ascent;
  covered.push({ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height });
  return (
    `<g opacity="${n(Number(style.opacity) || 1)}">${panel(box, r)}` +
    `<text x="${n(r.x + padding)}" y="${n(baseline)}" font-family="${escapeXml(style.fontFamily)}" font-size="${escapeXml(style.fontSize.replace("px", ""))}" fill="${escapeXml(style.color)}"${textStyleAttributes(style)} xml:space="preserve">` + // not user-facing
    `<tspan font-weight="600">${escapeXml(source)}</tspan><tspan dx="2">${escapeXml(text)}</tspan></text></g>`
  );
}

/** The SVG drawn onto a canvas at its size, as a PNG in base 64. */
export async function rasterise(svg: string, width: number, height: number): Promise<string> {
  const image = new Image();
  image.decoding = "sync";
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
