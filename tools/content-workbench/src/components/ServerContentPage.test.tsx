import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ServerContentPage } from "./ServerContentPage";

const item = {
  stableId: "fixture-content",
  titleZh: "Fixture content",
  contentType: "team-news",
  urlZh: "https://sycszy.icu/zh/news/fixture-content",
  status: "published" as const,
  updatedAt: "2026-07-26T08:00:00Z",
};

test("exposes the Chinese URL as a direct link using the view action", async () => {
  const user = userEvent.setup();
  const onView = vi.fn();
  render(<ServerContentPage items={[item]} onView={onView} />);

  const link = screen.getByRole("link", {
    name: "https://sycszy.icu/zh/news/fixture-content",
  });
  expect(link).toHaveAttribute("href", item.urlZh);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");

  await user.click(link);
  expect(onView).toHaveBeenCalledOnce();
  expect(onView).toHaveBeenCalledWith(item);
});

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
