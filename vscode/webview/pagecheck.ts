/**
 * What a page receives is checked as what it sends is (CON-08): the schema, where each kind is a
 * class of its own, and the rules the schema cannot express (messagecheck.ts), the same in VS Code's
 * pages and the playground's frames (PAR-13). A page may not compile code (its
 * Content-Security-Policy has no 'unsafe-eval'), so the schema's validator is compiled when the
 * pages are built (scripts/messagevalidator.mjs) and imported here.
 */
import type { WebviewMessage } from "@debrief/schemas";
import validate from "debrief-webview-message-validator";
import { checkMessageWith } from "./messagecheck.js";

/** A message refused. Without its problems: they can quote plot content (NFR-14). */
export class Refused extends Error {}

/** A message from the host: the message, or it throws Refused. */
export function checkReceived(raw: unknown): WebviewMessage {
  return checkMessageWith(
    (m) => {
      if (!validate(m)) throw new Refused("not a webview message");
      return m as WebviewMessage;
    },
    raw,
    () => {
      throw new Refused("against the rules on a webview message");
    },
  );
}
