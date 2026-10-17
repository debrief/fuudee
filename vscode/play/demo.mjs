// The web demo (DEP-06, DEP-07): the playground's page, every panel and the walkthroughs,
// served full screen at /demo/ beside the playground at /play/, whose files it uses (the
// <base> below). It opens the fixed sample serials; a file the reader chooses is read in the
// browser only, under Pyodide, never sent anywhere or stored (product owner, 17 Oct 2026).
import { CSP_META } from "./csp.mjs";

/** What tells host.ts this is the web demo: the walkthroughs open, nothing kept that came from a plot. */
export const DEMO_META = '<meta name="debrief-demo" content="web demo">';

/** The demo's page, made from the playground's index.html: its policy first, then the <base>, which the policy allows. */
export function demoPage(index, base = "../play/") {
  if (!index.includes(CSP_META) || !/<title>[^<]*<\/title>/.test(index)) throw new Error("index.html does not start as the web demo expects");
  return index.replace(CSP_META, `${CSP_META}\n<base href="${base}">\n${DEMO_META}`).replace(/<title>[^<]*<\/title>/, "<title>Debrief web demo</title>");
}
