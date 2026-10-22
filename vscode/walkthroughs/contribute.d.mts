// Types for contribute.mjs, which node runs as it is (scripts/walkthroughs.mjs).
export interface HostPart {
  where?: string;
  keys?: string;
  button: string;
  command?: string;
  args?: unknown[];
  action?: string;
}
export interface TourStep {
  id: string;
  event: string;
  title: string;
  text: string;
  keys: string;
  vscode: HostPart;
  play: HostPart;
  media: string;
  alt: string;
}
export interface TourSource {
  id: string;
  title: string;
  description: string;
  steps: TourStep[];
}
export declare const contextKey: (event: string) => string;
export declare const MEDIA: string;
export declare function commandLink(command: string, args?: unknown[]): string;
export declare function stepParts(step: TourStep, host: "vscode" | "play"): { text: string; where?: string; keys: string; button: string };
export declare const plainForVSCode: (text: string) => string;
export declare const OPEN: string;
export declare function vscodeButton(step: TourStep, tour: string): string;
export declare function vscodeDescription(step: TourStep, tour: string): string;
export declare function walkthroughsContribution(tours: { tours: TourSource[] }): unknown[];
export declare function withWalkthroughs(text: string, walkthroughs: unknown[]): string;
