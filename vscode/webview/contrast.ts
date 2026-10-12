/**
 * How tracks outside the time window are drawn: their context (CAP-29,
 * expert panel 12 Oct). Kept free of the page so it can be tested.
 *
 * - Clear: a solid, thin line in the track's hue, desaturated toward the
 *   theme's text colour, at an opacity that keeps it behind the part in the
 *   window. Every colour reaches at least 3:1 against the map's background
 *   (the theme's editor background) as drawn, opacity included. Where a
 *   colour falls short, its lightness (OKLCH) moves away from the
 *   background until it doesn't; only if that is not enough does the
 *   opacity rise.
 * - Faint: the same colour, fainter, for a busy plot. No 3:1 promise.
 * - Off: not drawn.
 * - High-contrast themes: the track's own colour, fully opaque, 1 px; never
 *   dimmed, not even for a selection elsewhere.
 *
 * Colours are sRGB triples from 0 to 1.
 */
export type Rgb = [number, number, number];
export type ContextTracks = "clear" | "faint" | "off";

/** The contrast every context track reaches on a clear setting. */
export const MINIMUM_CONTRAST = 3;
/** Opacity of a clear context track, before any rise a theme needs. */
export const CLEAR_OPACITY = 0.6;
export const FAINT_OPACITY = 0.35;
export const CONTEXT_WEIGHT = 1.5;
export const WINDOW_WEIGHT = 2.5;
/** How far a context track's colour moves toward the theme's text colour, in lightness and chroma. */
const TOWARD_FOREGROUND = 0.35;
/** The least opacity a track dimmed for a selection elsewhere keeps, so it never vanishes. */
export const DIMMED_FLOOR = 0.3;

/** A colour as CSS gives it (hex, or the rgb function), or undefined if it is neither. */
export function parseColour(text: string): Rgb | undefined {
  const t = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]+)$/.exec(t)?.[1];
  if (hex) {
    const full = hex.length === 3 || hex.length === 4 ? [...hex.slice(0, 3)].map((c) => c + c).join("") : hex.slice(0, 6);
    if (![3, 4, 6, 8].includes(hex.length)) return undefined;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
  }
  const parts = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(t);
  return parts ? (parts.slice(1, 4).map((p) => Math.min(1, Number(p) / 255)) as Rgb) : undefined;
}

export function toHex(rgb: Rgb): string {
  return "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Relative luminance (WCAG 2). */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours (WCAG 2), from 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** A colour drawn at an opacity over a background, as the browser blends it. */
export function over(colour: Rgb, opacity: number, background: Rgb): Rgb {
  return colour.map((c, i) => opacity * c + (1 - opacity) * background[i]) as Rgb;
}

// OKLab (Björn Ottosson), through linear sRGB.
function toOklch(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function fromOklch([L, C, h]: [number, number, number]): Rgb {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.map((c) => gamma(Math.min(1, Math.max(0, c)))) as Rgb;
}

/** The theme a map is drawn on: its editor background and text colour, and whether it is a high-contrast theme. */
export interface MapTheme {
  background: Rgb;
  foreground: Rgb;
  highContrast: boolean;
}

export interface ContextStyle {
  colour: string;
  opacity: number;
  weight: number;
  /** Opacity while something else is selected. */
  dimmed: number;
}

/** The track's hue, its lightness and chroma moved toward the theme's text colour. */
export function desaturate(colour: Rgb, foreground: Rgb): [number, number, number] {
  const [L, C, h] = toOklch(colour);
  const [Lf] = toOklch(foreground);
  return [L + (Lf - L) * TOWARD_FOREGROUND, C * (1 - TOWARD_FOREGROUND), h];
}

/**
 * How a track's context line is drawn on a theme; undefined when context
 * tracks are off. Opacity and lightness are chosen so that a clear line
 * reaches 3:1 against the background as drawn.
 */
export function contextStyle(trackColour: string, mode: ContextTracks, theme: MapTheme): ContextStyle | undefined {
  if (mode === "off") return undefined;
  const own = parseColour(trackColour);
  if (theme.highContrast || !own) {
    const opacity = theme.highContrast ? 1 : mode === "clear" ? CLEAR_OPACITY : FAINT_OPACITY;
    return { colour: trackColour, opacity, weight: theme.highContrast ? 1 : CONTEXT_WEIGHT, dimmed: theme.highContrast ? 1 : dim(opacity) };
  }
  let [L, C, h] = desaturate(own, theme.foreground);
  if (mode === "faint") return { colour: toHex(fromOklch([L, C, h])), opacity: FAINT_OPACITY, weight: CONTEXT_WEIGHT, dimmed: dim(FAINT_OPACITY) };
  // Lighter on a dark background, darker on a light one, until it reaches 3:1.
  const away = luminance(theme.background) < 0.18 ? 0.01 : -0.01;
  let opacity = CLEAR_OPACITY;
  const reaches = () => contrast(over(fromOklch([L, C, h]), opacity, theme.background), theme.background) >= MINIMUM_CONTRAST;
  while (!reaches() && L + away >= 0 && L + away <= 1) L += away;
  while (!reaches() && opacity < 1) opacity = Math.min(1, opacity + 0.05);
  return { colour: toHex(fromOklch([L, C, h])), opacity, weight: CONTEXT_WEIGHT, dimmed: dim(opacity) };
}

/** Dimmed for a selection elsewhere: half as strong, never below the floor. */
function dim(opacity: number): number {
  return Math.min(opacity, Math.max(DIMMED_FLOOR, opacity / 2));
}

/**
 * The mode drawn: the plot's choice, with the analyst's setting for the
 * minimum contrast showing faint as clear. Off stays off: it hides nothing
 * the analyst could mistake for absent data, since nothing is drawn.
 */
export function contextShown(plot: ContextTracks | undefined, minimumContrast: boolean): ContextTracks {
  const mode = plot ?? "clear";
  return minimumContrast && mode === "faint" ? "clear" : mode;
}
