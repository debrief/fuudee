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
