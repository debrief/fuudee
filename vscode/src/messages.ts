/**
 * Messages to and from webviews are boundary types (CON-08): every message is
 * validated against the schema, and against the members its kind must carry,
 * before it is acted on.
 */
import { DocumentValidationError, validateDocument, type WebviewMessage } from "@debrief/schemas";
import table from "../../schemas/vectors/webview-messages.json";

const MEMBERS = table.members as Record<string, string[]>;

export function checkMessage(raw: unknown): WebviewMessage {
  const message = validateDocument("webview_message", raw);
  const members = MEMBERS[message.kind] ?? [];
  const needed = members.filter((m) => !m.endsWith("?"));
  const allowed = members.map((m) => m.replace(/\?$/, ""));
  const present = Object.keys(message).filter((k) => k !== "kind");
  const problems = [
    ...needed.filter((m) => !(m in message)).map((m) => `${message.kind} needs ${m}`),
    ...present.filter((m) => !allowed.includes(m)).map((m) => `${message.kind} does not carry ${m}`),
  ];
  if (problems.length) throw new DocumentValidationError(problems);
  return message;
}
