import { Braces, UserRound } from "lucide-react";
import type {
  FormErrors,
  FormFieldDefinition,
  FormSchemaDefinition,
  FormValue,
  FormValues,
} from "../forms/form-engine";
import { formFields, FORM_ERROR_KEY } from "../forms/form-engine";

type SchemaFormProps = {
  schema: FormSchemaDefinition;
  values: FormValues;
  errors: FormErrors;
  disabled?: boolean;
  onChange: (fieldId: string, value: FormValue) => void;
};

export function SchemaForm({
  schema,
  values,
  errors,
  disabled = false,
  onChange,
}: SchemaFormProps) {
  return (
    <section className="schema-form" aria-labelledby={`${schema.id}-form-title`}>
      <header className="schema-form-heading">
        <h4 id={`${schema.id}-form-title`}>{schema.label}</h4>
      </header>

      {errors[FORM_ERROR_KEY] ? (
        <p className="operation-error" role="alert">
          {errors[FORM_ERROR_KEY]}
        </p>
      ) : null}

      {schema.sections.map((section) => (
        <fieldset className="schema-form-section" key={section.id}>
          <legend>{section.label}</legend>
          <div className="schema-form-grid">
            {section.fields.map((field) => (
              <SchemaField
                key={field.id}
                schemaId={schema.id}
                field={field}
                value={values[field.id]}
                error={errors[field.id]}
                disabled={disabled}
                onChange={onChange}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <StructurePreview schema={schema} values={values} />
    </section>
  );
}

type SchemaFieldProps = {
  schemaId: string;
  field: FormFieldDefinition;
  value: FormValue | undefined;
  error?: string;
  disabled: boolean;
  onChange: (fieldId: string, value: FormValue) => void;
};

function SchemaField({
  schemaId,
  field,
  value,
  error,
  disabled,
  onChange,
}: SchemaFieldProps) {
  const inputId = `${schemaId}-${field.id}`;
  const errorId = `${inputId}-error`;
  const stringValue = typeof value === "string" ? value : "";

  if (field.control === "boolean") {
    return (
      <div className="field-group schema-boolean-field">
        <label htmlFor={inputId}>
          <input
            id={inputId}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => onChange(field.id, event.target.checked)}
          />
          <span>{field.label}</span>
        </label>
        <FieldError id={errorId} message={error} />
      </div>
    );
  }

  return (
    <div className="field-group">
      <label htmlFor={inputId}>
        {field.label}
        {field.required ? <span className="required-field">必填</span> : null}
      </label>
      {renderControl({
        field,
        inputId,
        errorId,
        value: stringValue,
        error,
        disabled,
        onChange,
      })}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

type ControlProps = {
  field: FormFieldDefinition;
  inputId: string;
  errorId: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (fieldId: string, value: FormValue) => void;
};

function renderControl({
  field,
  inputId,
  errorId,
  value,
  error,
  disabled,
  onChange,
}: ControlProps) {
  const accessibility = {
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? errorId : undefined,
  };

  if (field.control === "textarea") {
    return (
      <textarea
        id={inputId}
        rows={field.rows ?? 4}
        maxLength={field.maxLength}
        value={value}
        disabled={disabled}
        placeholder={field.placeholder}
        {...accessibility}
        onChange={(event) => onChange(field.id, event.target.value)}
      />
    );
  }

  if (field.control === "enum") {
    return (
      <select
        id={inputId}
        value={value}
        disabled={disabled}
        {...accessibility}
        onChange={(event) => onChange(field.id, event.target.value)}
      >
        <option value="">请选择</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const input = (
    <input
      id={inputId}
      type={
        field.control === "date"
          ? "date"
          : field.control === "number"
            ? "number"
          : field.control === "url"
            ? "url"
            : "text"
      }
      autoComplete="off"
      spellCheck={field.control !== "url" && field.control !== "author-reference"}
      maxLength={field.maxLength}
      min={field.min}
      max={field.max}
      step={field.step}
      value={value}
      disabled={disabled}
      placeholder={field.placeholder}
      {...accessibility}
      onChange={(event) => onChange(field.id, event.target.value)}
    />
  );

  return field.control === "author-reference" ? (
    <div className="author-reference-control">
      <UserRound aria-hidden="true" size={17} />
      {input}
    </div>
  ) : (
    input
  );
}

function StructurePreview({
  schema,
  values,
}: {
  schema: FormSchemaDefinition;
  values: FormValues;
}) {
  const preview = Object.fromEntries(
    formFields(schema).map((field) => [
      field.path,
      values[field.id] ?? (field.control === "boolean" ? false : ""),
    ]),
  );

  return (
    <section className="structure-preview" aria-labelledby={`${schema.id}-preview-title`}>
      <h5 id={`${schema.id}-preview-title`}>
        <Braces aria-hidden="true" size={17} />
        只读结构预览
      </h5>
      <pre aria-label={`${schema.label}只读结构`}>{JSON.stringify(preview, null, 2)}</pre>
    </section>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id} role="alert">
      {message}
    </span>
  ) : null;
}
