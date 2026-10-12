/**
 * A tool's form, generated from its declaration (TL-07). It shows the tool's
 * explanation and any judgement it involves (CAP-24), what it will act on,
 * and one field per parameter. Values are checked again in Python before the
 * tool runs, so this form only needs to collect them.
 */
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { FACTORS, UNIT_LABELS } from "@debrief/kernel";
import type { ParameterDeclaration, ParameterValue, TimeRange, ToolDeclaration } from "@debrief/schemas";
import { parseTime, TIME_EXAMPLES } from "../src/timeinput.js";
import { type Draft, initial, showTime } from "./formdraft.js";
import { Action, Choice, Field, TextInput, YesNo } from "./ui.js";
import { host, onMessage } from "./vscode.js";
import "./form.css";

function toValue(param: ParameterDeclaration, draft: Draft[string], range?: TimeRange): ParameterValue["value"] | undefined | Error {
  if (param.kind === "boolean") return draft.checked ?? false;
  const text = draft.text.trim();
  if (!text) return undefined;
  if (param.kind === "number" || param.kind === "integer" || param.kind === "quantity") {
    const n = Number(text);
    if (!Number.isFinite(n)) return new Error(`${param.title} must be a number`);
    return param.kind === "quantity" ? ({ value: n, unit: draft.unit! } as ParameterValue["value"]) : n;
  }
  if (param.kind === "time") {
    // Checked here so the analyst sees the problem at once; the host converts it.
    return parseTime(text, range) === undefined ? new Error(`${param.title} must be a UTC time, such as ${TIME_EXAMPLES}`) : text;
  }
  return text;
}

function Form() {
  const [tool, setTool] = useState<ToolDeclaration>();
  const [names, setNames] = useState<string[]>([]);
  const [range, setRange] = useState<TimeRange>();
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    onMessage((message) => {
      if (message.kind === "show_form") {
        const declaration = message.tool as ToolDeclaration;
        setNames(message.selected_names as string[]);
        setRange(message.time_range as TimeRange | undefined);
        // Re-sent when only the selection changed: keep what the analyst typed.
        setTool((previous) => {
          if (previous?.name !== declaration.name) {
            const now = message.current_time as string | undefined;
            setDraft(Object.fromEntries((declaration.parameters ?? []).map((p) => [p.name, initial(p, now)])));
            setBusy(false);
            setProblem(undefined);
          }
          return declaration;
        });
      } else if (message.kind === "form_busy") {
        setBusy(true);
      } else if (message.kind === "form_error") {
        setBusy(false);
        setProblem(message.message as string);
      }
    });
    host.postMessage({ kind: "ready" });
  }, []);

  if (!tool) return null;
  const params = tool.parameters ?? [];
  const update = (name: string, change: Partial<Draft[string]>) => setDraft((d) => ({ ...d, [name]: { ...d[name], ...change } }));

  const run = () => {
    const values: ParameterValue[] = [];
    for (const param of params) {
      const value = toValue(param, draft[param.name], range);
      if (value instanceof Error) return setProblem(value.message);
      if (value !== undefined) values.push({ name: param.name, value });
    }
    setProblem(undefined);
    host.postMessage({ kind: "run_tool", tool_name: tool.name, parameters: values });
  };

  return (
    <form
      className="tool-form"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <h1>{tool.title}</h1>
      <p className="explanation">{tool.explanation}</p>
      {tool.judgement && <p className="judgement">{tool.judgement}</p>}
      <p className="applies">{names.length ? `Applies to: ${names.join(", ")}` : "Applies to the plot as a whole."}</p>
      {params.map((param) => {
        const d = draft[param.name] ?? { text: "" };
        const id = `p-${param.name}`;
        const optional = param.required === false ? " (optional)" : "";
        if (param.kind === "boolean") {
          return (
            <Field key={param.name} label="" explanation={param.explanation ?? undefined}>
              <YesNo checked={d.checked ?? false} label={param.title} onChange={(checked) => update(param.name, { checked })} />
            </Field>
          );
        }
        if (param.kind === "choice") {
          return (
            <Field key={param.name} label={param.title + optional} explanation={param.explanation ?? undefined}>
              <Choice
                value={d.text}
                options={(param.choices ?? []).map((c) => ({ value: c, label: c.replace(/_/g, " ") }))}
                onChange={(text) => update(param.name, { text })}
              />
            </Field>
          );
        }
        if (param.kind === "quantity") {
          const units = Object.keys(FACTORS[param.quantity_kind as keyof typeof FACTORS]);
          return (
            <Field key={param.name} label={param.title + optional} explanation={param.explanation ?? undefined} htmlFor={id}>
              <div className="quantity">
                <TextInput id={id} value={d.text} onChange={(text) => update(param.name, { text })} />
                <Choice
                  value={d.unit ?? units[0]}
                  options={units.map((u) => ({ value: u, label: UNIT_LABELS[u] ?? u }))}
                  onChange={(unit) => update(param.name, { unit })}
                />
              </div>
            </Field>
          );
        }
        if (param.kind === "time") {
          const ms = d.text.trim() ? parseTime(d.text, range) : undefined;
          const echo = d.text.trim() ? (ms === undefined ? "Not a time Debrief understands" : `Means ${showTime(ms)}`) : undefined;
          return (
            <Field key={param.name} label={param.title + optional} explanation={param.explanation ?? undefined} htmlFor={id}>
              <TextInput id={id} value={d.text} placeholder="Such as 09:30Z" onChange={(text) => update(param.name, { text })} />
              {echo && <div className="field-echo">{echo}</div>}
            </Field>
          );
        }
        return (
          <Field key={param.name} label={param.title + optional} explanation={param.explanation ?? undefined} htmlFor={id}>
            <TextInput id={id} value={d.text} onChange={(text) => update(param.name, { text })} />
          </Field>
        );
      })}
      {problem && (
        <div className="problem" role="alert">
          {problem}
        </div>
      )}
      <div className="actions">
        <Action primary disabled={busy} onClick={run}>
          {busy ? "Running…" : "Run"}
        </Action>
        <Action disabled={busy} onClick={() => host.postMessage({ kind: "cancel" })}>
          Cancel
        </Action>
      </div>
    </form>
  );
}

createRoot(document.getElementById("root")!).render(<Form />);
