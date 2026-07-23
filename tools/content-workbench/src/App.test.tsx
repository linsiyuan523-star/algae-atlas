import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";

test("renders the minimal Stage 4A workbench shell", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: "藻类团队内容发布工作台" }),
  ).toBeInTheDocument();
  expect(screen.getByText("用于在本机准备团队网站内容。")).toBeVisible();
  expect(screen.getByText("0.1.0")).toBeVisible();
  expect(screen.getByRole("button", { name: "新建内容" })).toBeDisabled();
});
