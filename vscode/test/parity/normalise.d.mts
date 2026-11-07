// Types for normalise.mjs, which node runs as it is (test/play/parity.mjs, compare.mjs).
export interface Projection {
  schema_version: string;
  features: unknown[];
  plot: Record<string, unknown>;
  view: Record<string, unknown> | null;
  named_sets: unknown[];
  provenance: unknown[];
  history: { current: number; steps: { seq: number; state: string; records: unknown[] }[] };
}
export declare function normalise(text: string): Projection;
export declare function differences(a: unknown, b: unknown, limit?: number): { path: string; a: string; b: string }[];
export declare function without<T>(projection: T, paths: readonly string[]): T;
