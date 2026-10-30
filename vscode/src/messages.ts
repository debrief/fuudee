/**
 * Messages to and from webviews are boundary types (CON-08): every message is validated
 * against the schema, and against the members its kind must carry, before it is acted on.
 * The rules are host-neutral (webview/messagecheck.ts), shared with the playground; here the
 * schema's validator is the one the extension host compiles.
 */
import { DocumentValidationError, validateDocument, type WebviewMessage } from "@debrief/schemas";
import { checkMessageWith } from "../webview/messagecheck.js";

export { panesProblems, toteViewProblems, trackEditProblems } from "../webview/messagecheck.js";

export function checkMessage(raw: unknown): WebviewMessage {
  return checkMessageWith((m) => validateDocument("webview_message", m), raw, (problems) => {
    throw new DocumentValidationError(problems);
  });
}
