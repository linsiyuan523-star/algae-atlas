import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import App from "./App";

const sections = [
  ["新建内容", "当前没有可创建的内容类型。"],
  ["草稿箱", "目前没有草稿。"],
  ["已提交", "目前没有已提交内容。"],
  ["设置", "当前没有可配置项。"],
  ["诊断", "当前没有诊断信息。"],
] as const;

test("switches between all static navigation pages", async () => {
  const user = userEvent.setup();
  render(<App />);

  expect(
    screen.getByRole("heading", { name: "藻类团队内容发布工作台" }),
  ).toBeInTheDocument();
  expect(screen.getByText("版本 0.1.0")).toBeVisible();

  const navigation = screen.getByRole("navigation", { name: "工作台导航" });
  expect(within(navigation).getAllByRole("button")).toHaveLength(sections.length);

  for (const [title, emptyState] of sections) {
    const navigationButton = within(navigation).getByRole("button", { name: title });
    await user.click(navigationButton);

    expect(navigationButton).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: title, level: 2 })).toBeVisible();
    expect(screen.getByText(emptyState)).toBeVisible();
  }
});
