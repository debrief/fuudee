/**
 * Debrief's interface components. Webviews use vscrui (CON-06) only through
 * these wrappers, so the library can be replaced in one place (PRN-09).
 */
import type { ReactNode } from "react";
import { Button, Checkbox, Dropdown, TextArea, TextField } from "vscrui";
import "vscrui/dist/_name_.css";

export function Field(props: { label: string; explanation?: string; problem?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={props.htmlFor}>
        {props.label}
      </label>
      {props.children}
      {props.explanation && <div className="field-explanation">{props.explanation}</div>}
      {props.problem && <div className="field-problem">{props.problem}</div>}
    </div>
  );
}

/** A text field. label, when given, is joined to the field itself, so screen readers name it. */
export function TextInput(props: { id?: string; value: string; placeholder?: string; label?: string; onChange: (value: string) => void }) {
  return (
    <TextField id={props.id} value={props.value} placeholder={props.placeholder} onChange={props.onChange}>
      {props.label}
    </TextField>
  );
}

/** A text box of several lines, such as positions one per line. */
export function TextBox(props: { id?: string; value: string; placeholder?: string; label?: string; onChange: (value: string) => void }) {
  return (
    <TextArea id={props.id} value={props.value} placeholder={props.placeholder} onChange={props.onChange} resize="vertical">
      {props.label}
    </TextArea>
  );
}

// vscrui shows no label for an option whose value is empty, so "" travels as this instead.
const EMPTY = "⁣empty";

/** A list to choose from. label, when given, names it for screen readers: vscrui's list button has no label of its own. */
export function Choice(props: { value: string; options: { value: string; label: string }[]; label?: string; onChange: (value: string) => void }) {
  const options = props.options.map((o) => (o.value === "" ? { ...o, value: EMPTY } : o));
  const selected = options.find((o) => o.value === (props.value === "" ? EMPTY : props.value));
  // The list's buttons would submit a form they sit in: choosing is never submitting.
  return (
    <div className="choice" role={props.label ? "group" : undefined} aria-label={props.label} onClick={(event) => event.preventDefault()}>
      <Dropdown
        value={selected}
        options={options}
        onChange={(choice) => {
          if (!choice) return;
          const value = typeof choice === "string" ? choice : choice.value;
          props.onChange(value === EMPTY ? "" : value);
        }}
      />
    </div>
  );
}

export function YesNo(props: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <Checkbox checked={props.checked} onChange={props.onChange}>
      {props.label}
    </Checkbox>
  );
}

export function Action(props: { primary?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button appearance={props.primary ? "primary" : "secondary"} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </Button>
  );
}
