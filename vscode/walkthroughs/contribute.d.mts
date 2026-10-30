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
export declare const BESIDE: boolean;
export declare function commandLink(command: string, args?: unknown[]): string;
export declare function stepParts(step: TourStep, host: "vscode" | "play"): { text: string; where?: string; keys: string; button: string };
export declare const plainForVSCode: (text: string) => string;
export declare const OPEN: string;
export declare function vscodeButton(step: TourStep, tour: string): string;
export declare function vscodeDescription(step: TourStep, tour: string): string;
export declare function nextTour(tours: { tours: TourSource[] }, id: string): TourSource | undefined;
export declare const nextLabel: (tour: { title: string }) => string;
export declare const ALL_DONE: string;
export declare const doneLabel: (tour: { title: string }, after: unknown) => string;
export declare const EXTENSION: string;
export declare function vscodeNext(tours: { tours: TourSource[] }, tour: TourSource, extension?: string): string;
export declare function walkthroughsContribution(tours: { tours: TourSource[] }, extension?: string): unknown[];
export declare function withWalkthroughs(text: string, walkthroughs: unknown[]): string;
export declare const SOLUTION: string;
export declare function latestSolution(features: readonly { id: string; properties?: { kind?: string; tma?: unknown } }[] | undefined): string | undefined;
export declare function withSolution<T extends unknown[] | undefined>(args: T, features: readonly { id: string; properties?: { kind?: string; tma?: unknown } }[] | undefined): T | undefined;
export declare const NO_SOLUTION: string;
export declare function tmaDragEvent(legs: number | undefined, action: string | undefined, part: boolean): string | undefined | false;
