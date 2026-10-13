/**
 * The annotation form (CAP-03 to CAP-05): add a line, area, circle, ellipse,
 * label, marker or note, or change one, its appearance and its time included.
 * Saving is one recorded, undoable step in the plot's history; so is Delete.
 *
 * The form reads what the analyst types as they type it, and says what it
 * understood (positions and times) or what is wrong, beside the field. The
 * host sends the description to the Python service, which checks it again
 * and makes the annotation.
 */
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { UNIT_LABELS } from "@debrief/kernel";
import type { AnnotationSpec, TimeRange } from "@debrief/schemas";
import { parseTime } from "../src/timeinput.js";
import { type AnnotationDraft, draftOf, EXAMPLE_COLOUR, echoPositions, FILLED, type Field as DraftField, LENGTH_UNITS, newDraft, positionsLabel, SHAPES, specOf } from "./annotationdraft.js";
import type { Shape } from "./annotationlook.js";
import { showTime } from "./formdraft.js";
import { ANNOTATION_COLOURS } from "./palette.js";
import { Action, Choice, Field, TextBox, TextInput } from "./ui.js";
import { host, onMessage } from "./vscode.js";
import "./form.css";

const OTHER = "other";

function Form() {
  const [draft, setDraft] = useState<AnnotationDraft>();
  const [featureId, setFeatureId] = useState<string>();
  const [range, setRange] = useState<TimeRange>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [tried, setTried] = useState(false);
  const [otherColour, setOtherColour] = useState(false);
  const [otherFill, setOtherFill] = useState(false);

  useEffect(() => {
    onMessage((message) => {
      if (message.kind === "show_annotation_form") {
        const spec = message.annotation as AnnotationSpec | undefined;
        const id = message.feature_id as string | undefined;
        setFeatureId(id);
        setRange(message.time_range as TimeRange | undefined);
        const next = id && spec ? draftOf(spec) : newDraft(spec?.positions?.[0] as [number, number] | undefined, spec?.shape ?? "circle");
        // A new annotation's time starts at current time, as a tool form's does (SUB-26).
        const now = message.current_time as string | undefined;
        if (!id && now) next.time = showTime(Date.parse(now));
        setDraft(next);
        setOtherColour(!!next.colour && !ANNOTATION_COLOURS.some((c) => c.colour === next.colour));
        setOtherFill(!!next.fillColour && !ANNOTATION_COLOURS.some((c) => c.colour === next.fillColour));
        setBusy(false);
        setProblem(undefined);
        setTried(false);
      } else if (message.kind === "form_busy") {
        setBusy(true);
      } else if (message.kind === "form_error") {
        setBusy(false);
        setProblem(message.message as string);
      }
    });
    host.postMessage({ kind: "ready" });
  }, []);

  if (!draft) return null;
  const shape = draft.shape;
  const adding = !featureId;
  const title = SHAPES.find((s) => s.value === shape)!.label;
  // Problems are shown once the analyst has tried to save, then as they correct them.
  const live = specOf(draft, range).problems;
  const problemOf = (field: DraftField) => (tried ? live[field] : undefined);
  const update = (change: Partial<AnnotationDraft>) => setDraft((d) => ({ ...d!, ...change }));

  const save = () => {
    const { spec } = specOf(draft, range);
    setTried(true);
    if (!spec) return setProblem("Some fields need correcting; each says what is wrong.");
    setProblem(undefined);
    host.postMessage({ kind: "save_annotation", annotation: spec, ...(featureId && { feature_id: featureId }) });
  };

  const text = (field: DraftField, label: string, options: { placeholder?: string; explanation?: string; echo?: string } = {}) => (
    <Field label="" explanation={options.explanation} problem={problemOf(field)}>
      <div id={`field-${field}`}>
        <TextInput label={label} value={String(draft[field])} placeholder={options.placeholder} onChange={(value) => update({ [field]: value } as Partial<AnnotationDraft>)} />
      </div>
      {options.echo && <div className="field-echo">{options.echo}</div>}
    </Field>
  );

  const time = (field: "time" | "start" | "end", label: string) => {
    const typed = draft[field].trim();
    const ms = typed ? parseTime(typed, range) : undefined;
    return text(field, label, {
      placeholder: "Such as 09:30Z",
      echo: typed ? (ms === undefined ? "Not a time Debrief understands" : `Means ${showTime(ms)}`) : undefined,
    });
  };

  const colourChoice = (label: string, value: string, other: boolean, setOther: (on: boolean) => void, field: "colour" | "fillColour", none: string) => (
    <Field label={label} problem={problemOf(field)}>
      <div className="colour-row" id={`field-${field}`}>
        <Choice
          value={other ? OTHER : value}
          options={[{ value: "", label: none }, ...ANNOTATION_COLOURS.map((c) => ({ value: c.colour, label: c.name })), { value: OTHER, label: "Other colour…" }]}
          onChange={(chosen) => {
            setOther(chosen === OTHER);
            update({ [field]: chosen === OTHER ? value : chosen } as Partial<AnnotationDraft>);
          }}
        />
        {/* The colour itself, as the map will draw it: a data colour, not the theme's. */}
        {value && <span className="swatch" style={{ background: value }} aria-hidden="true" />}
      </div>
      {other && (
        <div id={`field-${field}-other`}>
          <TextInput label="As #rrggbb" value={value} placeholder={EXAMPLE_COLOUR} onChange={(typed) => update({ [field]: typed } as Partial<AnnotationDraft>)} />
        </div>
      )}
    </Field>
  );

  const echoes = draft.positions.trim() ? echoPositions(draft.positions) : [];
  const units = LENGTH_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] ?? u }));

  return (
    <form
      className="tool-form annotation-form"
      aria-label={adding ? "Add annotation" : `${title} ${draft.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h1>{adding ? "Add annotation" : `${title}: ${draft.name || "unnamed"}`}</h1>
      <p className="explanation">
        {adding ? "Adds an annotation to the plot as one step in its history, so Undo takes it away again." : "Changes are saved as one step in the plot's history, so Undo puts it back as it was."}
      </p>

      <h2>Annotation</h2>
      {adding ? (
        <Field label="Kind" explanation={SHAPES.find((s) => s.value === shape)!.explanation}>
          <div id="field-shape">
            <Choice value={shape} options={SHAPES.map((s) => ({ value: s.value, label: s.label }))} onChange={(value) => update({ shape: value as Shape, when: value === "note" && draft.when === "none" ? "time" : draft.when })} />
          </div>
        </Field>
      ) : (
        <p className="applies">Kind: {title}</p>
      )}
      {text("name", "Name", { explanation: "How the outline and the History view name it." })}
      {(shape === "label" || shape === "note") && (
        <Field label="" problem={problemOf("text")} explanation={shape === "label" ? "Shown on the map. Leave empty to show the name." : undefined}>
          <div id="field-text">
            <TextBox label="Text" value={draft.text} onChange={(value) => update({ text: value })} />
          </div>
        </Field>
      )}

      {shape !== "note" && (
        <>
          <h2>{shape === "line" ? "Positions" : shape === "area" ? "Corners" : "Position"}</h2>
          <Field label="" problem={problemOf("positions")} explanation="In any notation: 50°20.120'N 004°07.210'W, 50 20.12 N 4 7.21 W, or 50.335, -4.120.">
            <div id="field-positions">
              {shape === "line" || shape === "area" ? (
                <TextBox label={positionsLabel(shape)} value={draft.positions} onChange={(value) => update({ positions: value })} />
              ) : (
                <TextInput label={positionsLabel(shape)} value={draft.positions} onChange={(value) => update({ positions: value })} />
              )}
            </div>
            {echoes.map((echo, i) => (
              <div key={i} className="field-echo">
                {echo}
              </div>
            ))}
          </Field>
        </>
      )}

      {(shape === "circle" || shape === "ellipse") && (
        <>
          <h2>Size</h2>
          <div className="quantity">
            {shape === "circle"
              ? text("radius", "Radius")
              : (
                <>
                  {text("semiMajor", "Semi-major axis")}
                  {text("semiMinor", "Semi-minor axis")}
                </>
              )}
            <Field label="Unit">
              <div id="field-unit">
                <Choice value={draft.unit} options={units} onChange={(unit) => update({ unit })} />
              </div>
            </Field>
          </div>
          {shape === "ellipse" && text("orientation", "Orientation of the longer axis (°T)", { explanation: "True bearing from the centre, clockwise from north." })}
        </>
      )}

      <h2>Time</h2>
      <Field label="" explanation={shape === "note" ? "A note has no position, so it needs a time. It is listed in the Timeline." : "With a time or a period, it is drawn only while that falls in the time window; with none, always."}>
        <div id="field-when">
          <Choice
            value={draft.when}
            options={[...(shape === "note" ? [] : [{ value: "none", label: "No time: always shown" }]), { value: "time", label: "At a time" }, { value: "period", label: "Over a period" }]}
            onChange={(when) => update({ when: when as AnnotationDraft["when"] })}
          />
        </div>
      </Field>
      {(draft.when === "time" || (shape === "note" && draft.when === "none")) && time("time", "Time")}
      {draft.when === "period" && (
        <>
          {time("start", "Start")}
          {time("end", "End")}
        </>
      )}

      {shape !== "note" && (
        <>
          <h2>Style</h2>
          {colourChoice("Colour", draft.colour, otherColour, setOtherColour, "colour", "Annotation colour (amber)")}
          {shape !== "label" && (
            <div className="quantity">
              <Field label="Line">
                <div id="field-lineStyle">
                  <Choice
                    value={draft.lineStyle}
                    options={[
                      { value: "", label: "Dashed (the default)" },
                      { value: "solid", label: "Solid" },
                      { value: "dashed", label: "Dashed" },
                      { value: "dotted", label: "Dotted" },
                    ]}
                    onChange={(lineStyle) => update({ lineStyle: lineStyle as AnnotationDraft["lineStyle"] })}
                  />
                </div>
              </Field>
              {text("lineWidth", "Width (px)", { placeholder: FILLED.includes(shape) ? "1.5" : "2" })}
            </div>
          )}
          {FILLED.includes(shape) && (
            <>
              {colourChoice("Fill", draft.fillColour, otherFill, setOtherFill, "fillColour", "The line's colour")}
              {text("fillOpacity", "Fill opacity (%)", { placeholder: draft.fillColour ? "25" : "5", explanation: "0 for no fill, 100 for solid." })}
            </>
          )}
          <div className="quantity">
            {text("labelSize", "Label size (px)", { placeholder: "11" })}
            <Field label="Label">
              <div id="field-labelPosition">
                <Choice
                  value={draft.labelPosition}
                  options={[
                    { value: "", label: "Where Debrief puts it" },
                    { value: "above", label: "Above" },
                    { value: "below", label: "Below" },
                    { value: "left", label: "Left" },
                    { value: "right", label: "Right" },
                    { value: "centre", label: "Centre" },
                    { value: "none", label: "Not shown" },
                  ]}
                  onChange={(labelPosition) => update({ labelPosition: labelPosition as AnnotationDraft["labelPosition"] })}
                />
              </div>
            </Field>
          </div>
        </>
      )}

      {problem && (
        <div className="problem" role="alert">
          {problem}
        </div>
      )}
      <div className="actions">
        <Action primary disabled={busy} onClick={save}>
          {busy ? "Saving…" : adding ? "Add" : "Save changes"}
        </Action>
        {!adding && (
          <Action disabled={busy} onClick={() => host.postMessage({ kind: "delete_annotation", feature_id: featureId })}>
            Delete
          </Action>
        )}
        <Action disabled={busy} onClick={() => host.postMessage({ kind: "cancel" })}>
          Cancel
        </Action>
      </div>
    </form>
  );
}

createRoot(document.getElementById("root")!).render(<Form />);
