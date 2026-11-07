// Types for sequence.mjs, which node runs as it is (test/play/parity.mjs, compare.mjs).
export interface ParityStep {
  command: `debrief.${string}`;
  args: unknown[];
  what: string;
}
export declare const FIXTURE: { item: string };
export declare const SEQUENCE: readonly ParityStep[];
export declare const LEFT_OUT: readonly { command: string; why: string }[];
export declare const KNOWN_DIFFERENCES: readonly { path: string; why: string }[];
export declare const EXPECTED: { current: number; steps: number };
