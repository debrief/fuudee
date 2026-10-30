/**
 * A change to the open plot, as every flow makes one (PAR-09): saved through the service with the
 * plot the analyst is looking at as its base, a newer schema confirmed first ("Save anyway",
 * SUB-35), a change made elsewhere meanwhile never overwritten (SUB-28), then the plot shown as it
 * now is. One at a time, after every change before it.
 */
import { confirmNewerSchema } from "./runtool.js";
import { isRefusal, type FlowHost } from "./host.js";

/** Said when the plot changed elsewhere and so nothing was changed. */
export const CHANGED_ELSEWHERE = "The plot was changed elsewhere, so nothing was changed. Debrief is showing the latest; try again if you still want to.";
/** Said when the newer schema was not confirmed. */
export const NOTHING_CHANGED = "Nothing was changed.";

/**
 * Save a change: save throws a Refusal for a conflict or a newer schema. after says what follows
 * (the plot shown again, by default) and the problem then, if any. The problem, or the answer.
 */
export function changeStep<T>(host: FlowHost, save: (allowNewerSchema: boolean) => Promise<T>, after: (answer: T) => Promise<string | undefined> = () => host.reloadPlot()): Promise<{ problem?: string; answer?: T }> {
  return host.oneAtATime(async () => {
    let answer: T;
    try {
      try {
        answer = await save(false);
      } catch (error) {
        if (!isRefusal(error, "newer_schema")) throw error;
        if (!(await confirmNewerSchema(host, (error as Error).message))) return { problem: NOTHING_CHANGED };
        answer = await save(true);
      }
    } catch (error) {
      if (isRefusal(error, "conflict")) {
        await host.reloadPlot();
        return { problem: CHANGED_ELSEWHERE };
      }
      return { problem: (error as Error).message };
    }
    const problem = await after(answer);
    return problem ? { problem, answer } : { answer };
  });
}
