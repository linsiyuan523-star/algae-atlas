import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

function BrokenView(): null {
  throw new Error("intentional render failure");
}

test("shows a static fallback when a child render fails", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "工作台暂时无法显示" }),
    ).toBeVisible();
    expect(screen.getByText("请重新启动应用后再试。")).toBeVisible();
  } finally {
    consoleError.mockRestore();
  }
});
