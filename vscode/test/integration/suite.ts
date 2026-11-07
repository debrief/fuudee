/**
 * The tracer, driven inside VS Code: open a plot from a catalogue, select tracks, see the tools
 * on offer, fill in a form, run tools, and see the results on the map and in the results panel;
 * then each feature since, as a Mocha suite of its own. A short smoke suite runs first, always;
 * each suite after it sets up what it needs (most open a fresh serial 1), so one failing does
 * not hide the rest. DEBRIEF_IT_ONLY runs the named suites only (a comma list), after the smoke suite.
 */
import Mocha from "mocha";
import { annotations } from "./annotations.js";
import { bearings } from "./bearings.js";
import { collation } from "./collation.js";
import { known, only, reached } from "./fixture.js";
import { parity } from "./parity.js";
import { smoke } from "./smoke.js";
import { time } from "./time.js";
import { tools } from "./tools.js";
import { tracks } from "./tracks.js";
import { walkthroughs } from "./walkthroughs.js";

/** Every suite, in the order they run. */
function register(): void {
  smoke(); // smoke
  time(); // time, tote
  tools(); // tools, history
  annotations(); // annotations, narrative
  bearings(); // sensors, tma, tma-outline, bearings-pop-out, outline-toolbar
  tracks(); // tracks, cleaning, shear, fixes, import, labels
  collation(); // collation, exports, dpf
  walkthroughs(); // walkthroughs
  parity(); // parity
}

/**
 * One await that never settles would hold the job until CI cancels it, saying nothing. Each test
 * has a time limit of its own, and the whole run a deadline that fails it instead, naming the
 * last test and screenshot reached. A full run takes about five minutes; DEBRIEF_IT_MINUTES
 * overrides the limit.
 */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 5 * 60000, slow: 30000 });
  mocha.suite.emit(Mocha.Suite.constants.EVENT_FILE_PRE_REQUIRE, globalThis, "suite.js", mocha);
  register();
  const unknown = only.filter((name) => !known.includes(name));
  if (unknown.length) throw new Error(`DEBRIEF_IT_ONLY names no suite called ${unknown.join(", ")}; the suites are ${known.join(", ")}`);

  const minutes = Number(process.env.DEBRIEF_IT_MINUTES) || 20;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let runner: Mocha.Runner | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      runner?.abort();
      reject(new Error(`The tracer did not finish in ${minutes} minutes; the last test reached was "${reached.test}", the last screenshot ${reached.screenshot}`));
    }, minutes * 60000);
  });
  const finished = new Promise<number>((resolve) => {
    runner = mocha.run(resolve);
    runner.on(Mocha.Runner.constants.EVENT_TEST_BEGIN, (test) => (reached.test = test.fullTitle()));
  });
  try {
    const failures = await Promise.race([finished, deadline]);
    if (failures) throw new Error(`${failures} of the tracer's tests failed`);
  } finally {
    clearTimeout(timer);
  }
}
