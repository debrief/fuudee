// Types for panels.mjs, which node runs as it is (the playground tests).
export type Place = "left" | "centre" | "right";
export declare const PANELS: { id: string; title: string }[];
export declare const PANEL_TITLES: Record<string, string>;
export declare const DEFAULT_GROUPS: { place: Place; panels: string[] }[];
export declare const SIDE_FIRST: string[];
