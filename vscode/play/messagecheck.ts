/**
 * Messages from the webview components, checked in the playground as in VS Code (PAR-13, CON-08):
 * the same rules (webview/messagecheck.ts) with the schema's validator compiled when the
 * playground is built (scripts/messagevalidator.mjs), its page not being allowed to compile code.
 */
import type { WebviewMessage } from "@debrief/schemas";
import validate from "debrief-webview-message-validator";
import { checkMessageWith } from "../webview/messagecheck.js";

/** A message refused, with its problems. */
export class MessageRefused extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("; "));
  }
}

export function checkMessage(raw: unknown): WebviewMessage {
  return checkMessageWith(
    (m) => {
      if (!validate(m)) throw new MessageRefused((validate.errors ?? []).map((e) => `${e.instancePath || "<root>"}: ${e.message}`));
      return m as WebviewMessage;
    },
    raw,
    (problems) => {
      throw new MessageRefused(problems);
    },
  );
}
