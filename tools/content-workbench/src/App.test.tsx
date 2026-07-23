import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";

test("renders the workbench identity and local availability", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: "Algae Atlas Content Workbench" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Local / Offline-ready")).toBeVisible();
});
