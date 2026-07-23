import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ArticleEditor } from "./ArticleEditor";

test("renders the constrained Chinese article profile", async () => {
  render(
    <ArticleEditor
      value={[
        "## 形态特征",
        "",
        "*Ulva lactuca* 的分子式示例为 H~2~O，面积为 m^2^。",
        "",
        "| 字段 | 内容 |",
        "| --- | --- |",
        "| 名称 | 浒苔 |",
        "",
        "[安全来源](https://example.invalid/source)",
        "",
        "![显微图](media:fictional-image)",
        "",
      ].join("\n")}
      onChange={vi.fn()}
    />,
  );

  const editor = await screen.findByRole("textbox", { name: "中文正文编辑区" });
  expect(within(editor).getByRole("heading", { name: "形态特征", level: 2 })).toBeVisible();
  expect(editor.querySelector("em")).toHaveTextContent("Ulva lactuca");
  expect(editor.querySelector("sub")).toHaveTextContent("2");
  expect(editor.querySelector("sup")).toHaveTextContent("2");
  expect(editor.querySelector("table")).toBeInTheDocument();
  expect(within(editor).getByRole("link", { name: "安全来源" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  expect(within(editor).getByRole("link", { name: "安全来源" })).toHaveAttribute(
    "target",
    "_blank",
  );
  expect(editor.querySelector("[data-media-id='fictional-image']")).toHaveTextContent(
    "图片：显微图",
  );

  const blockStyles = screen.getByRole("combobox", { name: "段落格式" });
  expect(within(blockStyles).queryByRole("option", { name: "一级标题" })).toBeNull();
  expect(within(blockStyles).getByRole("option", { name: "五级标题" })).toBeVisible();
  expect(within(blockStyles).getByRole("option", { name: "六级标题" })).toBeVisible();
  for (const command of [
    "加粗",
    "斜体",
    "科学名称斜体",
    "下标",
    "上标",
    "无序列表",
    "有序列表",
    "引用",
    "设置链接",
    "插入图片占位",
    "插入表格",
  ]) {
    expect(screen.getByRole("button", { name: command })).toBeVisible();
  }
});

test("inserts only validated media placeholders", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const prompt = vi
    .spyOn(window, "prompt")
    .mockReturnValueOnce("Bad ID")
    .mockReturnValueOnce("fictional-image")
    .mockReturnValueOnce("显微图");
  render(<ArticleEditor value="" onChange={onChange} />);

  await screen.findByRole("textbox", { name: "中文正文编辑区" });
  onChange.mockClear();
  await user.click(screen.getByRole("button", { name: "插入图片占位" }));
  expect(screen.getByText("媒体 ID 必须由小写英文、数字和单个连字符组成。")).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "插入图片占位" }));
  await waitFor(() =>
    expect(onChange).toHaveBeenLastCalledWith(
      expect.stringContaining("![显微图](media:fictional-image)"),
      undefined,
    ),
  );
  expect(prompt).toHaveBeenCalledTimes(3);
});

test("rejects unsafe links before they enter the document", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "prompt").mockReturnValue("javascript:alert(1)");
  const onChange = vi.fn();
  render(<ArticleEditor value="安全文本" onChange={onChange} />);

  await screen.findByRole("textbox", { name: "中文正文编辑区" });
  onChange.mockClear();
  await user.click(screen.getByRole("button", { name: "设置链接" }));

  expect(screen.getByText("链接仅支持 HTTPS、站内绝对路径或页内锚点。")).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
});
