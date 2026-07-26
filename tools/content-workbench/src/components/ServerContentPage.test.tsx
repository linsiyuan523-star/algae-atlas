import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ServerContentPage } from "./ServerContentPage";

const item = {
  stableId: "fixture-content",
  titleZh: "Fixture content",
  contentType: "team-news",
  urlZh: "https://example.invalid/zh/fixture-content",
  status: "published" as const,
  updatedAt: "2026-07-26T08:00:00Z",
};

test("keeps server deletion disabled until the connection is available", async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn();
  const { rerender } = render(
    <ServerContentPage
      items={[item]}
      connectionState="unavailable"
      onDelete={onDelete}
    />,
  );

  const deleteButton = screen.getByRole("button", {
    name: "删除 Fixture content",
  });
  expect(deleteButton).toBeDisabled();
  await user.click(deleteButton);
  expect(onDelete).not.toHaveBeenCalled();

  rerender(
    <ServerContentPage
      items={[item]}
      connectionState="available"
      onDelete={onDelete}
    />,
  );
  expect(deleteButton).toBeEnabled();
  await user.click(deleteButton);
  expect(onDelete).toHaveBeenCalledWith(item);
});
