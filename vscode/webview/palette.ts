/**
 * Data colours (DEV-07): what the data means, so they do not change with the
 * theme. Interface colours come only from --vscode-* variables; this file is
 * the one place a hard-coded colour is allowed (scripts/check-theme.mjs).
 */
export const DATA_COLOURS = {
  /** A track with no colour of its own. */
  track: "#e01c3e",
  /** Annotations drawn by analysts and tools. */
  annotation: "#c7820a",
  /** Land on the reference map: neutral, so tracks stand out on any theme. */
  land: "#8c8c7a",
  /** Graticule lines: neutral, faint on any theme. */
  graticule: "#7f7f7f",
} as const;

/** Colours an analyst can give a track, by name (SUB-22): distinct from each other and from the annotation colour. */
export const TRACK_COLOURS: { name: string; colour: string }[] = [
  { name: "Red", colour: "#e01c3e" },
  { name: "Blue", colour: "#0064bd" },
  { name: "Green", colour: "#00a000" },
  { name: "Purple", colour: "#8a3ffc" },
  { name: "Teal", colour: "#00a3a3" },
  { name: "Grey", colour: "#8a8a8a" },
];

/** Colours an analyst can give one fix of a track (EXT-14): the track colours, then amber and yellow, which stand out on any of them. */
export const FIX_COLOURS: { name: string; colour: string }[] = [...TRACK_COLOURS, { name: "Amber", colour: DATA_COLOURS.annotation }, { name: "Yellow", colour: "#ffd700" }];

/** Colours an analyst can give an annotation by name: the annotation colour, then the track colours. Any other may be typed. */
export const ANNOTATION_COLOURS: { name: string; colour: string }[] = [{ name: "Amber", colour: DATA_COLOURS.annotation }, ...TRACK_COLOURS];

/**
 * The colours an image is drawn in when the analyst asks for light (SUB-25): VS Code's
 * Light Modern, whatever the editor's theme, so a figure prints and sits on a white slide.
 * Only the theme variables the map draws with; data colours stay as they are.
 */
export const LIGHT_EXPORT_THEME: Record<string, string> = {
  "--vscode-editor-background": "#ffffff",
  "--vscode-editor-foreground": "#3b3b3b",
  "--vscode-foreground": "#3b3b3b",
  "--vscode-descriptionForeground": "#6b6b6b",
  "--vscode-editorWidget-background": "#f8f8f8",
  "--vscode-editorWidget-foreground": "#3b3b3b",
  "--vscode-editorWidget-border": "#e5e5e5",
  "--vscode-widget-border": "#e5e5e5",
  "--vscode-panel-border": "#e5e5e5",
  "--vscode-editorHoverWidget-background": "#f8f8f8",
  "--vscode-editorHoverWidget-foreground": "#3b3b3b",
  "--vscode-editorHoverWidget-border": "#c8c8c8",
  "--vscode-editorWarning-foreground": "#bf8803",
  "--vscode-focusBorder": "#005fb8",
};
