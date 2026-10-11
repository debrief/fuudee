/**
 * Debrief's interface components. Webviews use vscrui (CON-06) only through
 * these wrappers, so the library can be replaced in one place (PRN-09).
 */
import type { ReactNode } from "react";
import { Button, Checkbox, Dropdown, TextField } from "vscrui";
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

export function TextInput(props: { id?: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <TextField id={props.id} value={props.value} placeholder={props.placeholder} onChange={props.onChange} />;
}

export function Choice(props: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const selected = props.options.find((o) => o.value === props.value);
  return (
    <Dropdown
      value={selected}
      options={props.options}
      onChange={(choice) => choice && props.onChange(typeof choice === "string" ? choice : choice.value)}
    />
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
