/**
 * Performance budgets in the unit tests (review, 7 Nov 2026, finding 10). The work is done and
 * its result checked on every run; how long it took is asserted only with DEBRIEF_PERF=1, as a
 * budget on shared hardware fails with the machine's load, not the code. CI runs them so in a
 * step that reports and never blocks (docs/engineering.md, "Performance budgets"). The same as
 * vscode/test/unit/budget.ts, for the kernel's own tests.
 */
import { expect } from "vitest";

export const PERF = process.env.DEBRIEF_PERF === "1";

/** Within budget, ms: asserted with DEBRIEF_PERF=1. */
export function withinBudget(took: number, budget: number, what: string): void {
  if (PERF) expect(took, `${what}: ${took.toFixed(1)} ms of ${budget} ms`).toBeLessThan(budget);
}
