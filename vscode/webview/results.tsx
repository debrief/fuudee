/**
 * Non-spatial results (TL-13): numbers and tables, each value shown through
 * the formatting service in the analyst's units (SUB-04). Graphs arrive later;
 * until then a graph is shown as its table.
 */
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, formatQuantity, formatTime, kindOf } from "@debrief/kernel";
import type { NonSpatialResult, ResultColumn, ToolDeclaration, ToolResult } from "@debrief/schemas";
import { describeChanges } from "../src/format.js";
import { Action } from "./ui.js";
import { host, onMessage } from "./vscode.js";
import "./results.css";

function cell(column: ResultColumn, row: number): string {
  if (column.strings) {
    const text = column.strings[row];
    // UTC timestamps are shown as the analyst's time format.
    return /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(text) ? formatTime(Date.parse(text), DEFAULT_SETTINGS) : text;
  }
  const value = column.numbers?.[row];
  if (value === undefined) return "";
  if (column.unit && column.quantity_kind) {
    try {
      kindOf(column.unit);
      return formatQuantity({ value, unit: column.unit }, DEFAULT_SETTINGS);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** A table as tab-separated text, as shown, for pasting into a report or spreadsheet. */
function asText(table: NonSpatialResult): string {
  const rows = Math.max(...table.columns.map((c) => (c.numbers ?? c.strings ?? []).length));
  const lines = [table.columns.map((c) => c.name).join("\t")];
  for (let r = 0; r < rows; r++) lines.push(table.columns.map((c) => cell(c, r)).join("\t"));
  return lines.join("\n");
}

function Results() {
  const [state, setState] = useState<{ tool: ToolDeclaration; result: ToolResult }>();
  const [copied, setCopied] = useState<number>();
  useEffect(() => {
    onMessage((message) => {
      if (message.kind === "show_results") {
        setState({ tool: message.tool as ToolDeclaration, result: message.result as ToolResult });
        setCopied(undefined);
      }
    });
    host.postMessage({ kind: "ready" });
  }, []);
  if (!state) return null;
  const saved = describeChanges(state.result);
  return (
    <main>
      {state.tool.judgement && <p className="judgement">{state.tool.judgement}</p>}
      {(state.result.non_spatial ?? []).map((table, index) => {
        const rows = Math.max(...table.columns.map((c) => (c.numbers ?? c.strings ?? []).length));
        if (table.presentation === "number") {
          return (
            <section key={index}>
              <h1>{table.title}</h1>
              <p className="number">{cell(table.columns[0], 0)}</p>
            </section>
          );
        }
        return (
          <section key={index}>
            <div className="heading">
              <h1>{table.title}</h1>
              <Action
                onClick={() =>
                  void navigator.clipboard.writeText(asText(table)).then(() => setCopied(index), () => setCopied(undefined))
                }
              >
                {copied === index ? "Copied" : "Copy"}
              </Action>
            </div>
            <table>
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c.name} className={c.numbers ? "numeric" : undefined}>
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }, (_, r) => (
                  <tr key={r}>
                    {table.columns.map((c) => (
                      <td key={c.name} className={c.numbers ? "numeric" : undefined}>
                        {cell(c, r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="note">
        {saved ? `${state.tool.title} ${saved} to the plot. ` : ""}
        These figures are not saved with the plot; copy them if you need them later.
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Results />);
