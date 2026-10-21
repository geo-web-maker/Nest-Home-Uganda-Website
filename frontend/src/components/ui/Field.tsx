import { forwardRef, useId } from 'react';
import type {
  ForwardedRef,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from '../../lib/cx';
import styles from './Field.module.css';

/** A required field must also say how the word "required" reads, so it is never colour alone. */
export type RequiredProps =
  { required: true; requiredLabel: string } | { required?: false; requiredLabel?: undefined };

/** Spread into a Field: required with its label, or neither. */
export function requiredProps(required: boolean | undefined, requiredLabel: string): RequiredProps {
  return required ? { required: true, requiredLabel } : {};
}

type BaseProps = {
  label: string;
  /** Error message. Shown below the control and linked with aria-describedby. */
  error?: string;
  className?: string;
} & RequiredProps;

type InputFieldProps = BaseProps & { kind?: 'input' } & Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'className' | 'required'
  >;
type SelectFieldProps = BaseProps & { kind: 'select'; children: ReactNode } & Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'className' | 'required' | 'children'
  >;
type TextareaFieldProps = BaseProps & { kind: 'textarea' } & Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'className' | 'required'
  >;

export type FieldProps = InputFieldProps | SelectFieldProps | TextareaFieldProps;
export type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Label, control and error message in one block. The ref goes to the control,
 * so it works with react-hook-form `register`.
 */
export const Field = forwardRef<FieldElement, FieldProps>(function Field(props, ref) {
  const autoId = useId();
  const id = props.id ?? autoId;
  const errorId = `${id}-error`;
  const { label, error, className, required, requiredLabel } = props;

  const shared = {
    id,
    'aria-required': required ? true : undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  } as const;
  const controlClass = (extra?: string) => cx(styles.control, extra, error && styles.invalid);

  let control: ReactNode;
  if (props.kind === 'select') {
    const {
      kind: _kind,
      label: _label,
      error: _error,
      className: _className,
      required: _required,
      requiredLabel: _requiredLabel,
      children,
      ...rest
    } = props;
    control = (
      <select
        ref={ref as ForwardedRef<HTMLSelectElement>}
        {...rest}
        {...shared}
        className={controlClass()}
      >
        {children}
      </select>
    );
  } else if (props.kind === 'textarea') {
    const {
      kind: _kind,
      label: _label,
      error: _error,
      className: _className,
      required: _required,
      requiredLabel: _requiredLabel,
      ...rest
    } = props;
    control = (
      <textarea
        ref={ref as ForwardedRef<HTMLTextAreaElement>}
        {...rest}
        {...shared}
        className={controlClass(styles.textarea)}
      />
    );
  } else {
    const {
      kind: _kind,
      label: _label,
      error: _error,
      className: _className,
      required: _required,
      requiredLabel: _requiredLabel,
      ...rest
    } = props;
    control = (
      <input
        ref={ref as ForwardedRef<HTMLInputElement>}
        {...rest}
        {...shared}
        className={controlClass()}
      />
    );
  }

  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? ` ${requiredLabel}` : ''}
      </label>
      {control}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
