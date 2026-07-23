import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import type {
  FormSchemaDefinition,
  FormValue,
  FormValues,
} from "../forms/form-engine";
import { SchemaForm } from "./SchemaForm";

const schema: FormSchemaDefinition = {
  id: "control-contract",
  label: "控件契约",
  sections: [
    {
      id: "controls",
      label: "通用控件",
      fields: [
        { id: "text", path: "text", label: "短文本", control: "text", required: true },
        { id: "notes", path: "notes", label: "多行文本", control: "textarea" },
        { id: "date", path: "date", label: "日期", control: "date" },
        { id: "number", path: "number", label: "整数", control: "number", min: 0, max: 10, step: 1 },
        {
          id: "kind",
          path: "kind",
          label: "枚举",
          control: "enum",
          options: [{ value: "first", label: "第一项" }],
        },
        { id: "enabled", path: "enabled", label: "布尔", control: "boolean" },
        { id: "url", path: "url", label: "链接", control: "url" },
        {
          id: "author",
          path: "authors[0]",
          label: "作者引用",
          control: "author-reference",
        },
      ],
    },
  ],
};

const initialValues: FormValues = {
  text: "",
  notes: "",
  date: "",
  number: "",
  kind: "",
  enabled: false,
  url: "",
  author: "",
};

function Harness() {
  const [values, setValues] = useState(initialValues);
  function update(fieldId: string, value: FormValue) {
    setValues((current) => ({ ...current, [fieldId]: value }));
  }
  return (
    <SchemaForm
      schema={schema}
      values={values}
      errors={{ url: "链接字段错误。" }}
      onChange={update}
    />
  );
}

test("renders and updates every common form control with a read-only structure preview", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  const text = screen.getByLabelText(/短文本/);
  const notes = screen.getByLabelText("多行文本");
  const date = screen.getByLabelText("日期");
  const number = screen.getByLabelText("整数");
  const enumControl = screen.getByLabelText("枚举");
  const booleanControl = screen.getByLabelText("布尔");
  const url = screen.getByLabelText("链接");
  const author = screen.getByLabelText("作者引用");

  expect(text).toHaveAttribute("type", "text");
  expect(notes.tagName).toBe("TEXTAREA");
  expect(date).toHaveAttribute("type", "date");
  expect(number).toHaveAttribute("type", "number");
  expect(number).toHaveAttribute("min", "0");
  expect(number).toHaveAttribute("max", "10");
  expect(within(enumControl).getByRole("option", { name: "第一项" })).toBeVisible();
  expect(booleanControl).toHaveAttribute("type", "checkbox");
  expect(url).toHaveAttribute("type", "url");
  expect(url).toHaveAttribute("aria-invalid", "true");
  expect(author).toHaveAttribute("type", "text");
  expect(screen.getByText("链接字段错误。")).toBeVisible();

  await user.type(text, "示例");
  await user.type(notes, "两行\n内容");
  await user.type(date, "2026-07-23");
  await user.selectOptions(enumControl, "first");
  await user.click(booleanControl);
  await user.type(url, "https://example.invalid/news");
  await user.type(author, "fictional-author");

  const preview = screen.getByLabelText("控件契约只读结构");
  expect(preview).toHaveTextContent('"text": "示例"');
  expect(preview).toHaveTextContent('"enabled": true');
  expect(preview).toHaveTextContent('"authors[0]": "fictional-author"');
});
