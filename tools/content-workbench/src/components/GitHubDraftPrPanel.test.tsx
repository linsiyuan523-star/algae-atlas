import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { createGitHubPublishApi } from "../github-publish";
import type { RepositoryLocalCommitResult } from "../repository";
import { GitHubDraftPrPanel } from "./GitHubDraftPrPanel";

const commit: RepositoryLocalCommitResult = {
  branchName: "content/20260724-fictional-news",
  previousHeadSha: "9".repeat(40),
  commitSha: "a".repeat(40),
  commitMessage: "content: publish fictional-news",
  committedPaths: [
    "content/records/team-news/fictional-news/record.json",
    "content/records/team-news/fictional-news/zh.md",
  ],
};

test("preflights and runs the default Draft PR mock from a local commit", async () => {
  const user = userEvent.setup();
  const api = createGitHubPublishApi({
    allowedRepositories: [
      { owner: "fictional-algae-team", name: "algae-atlas" },
    ],
  });

  render(<GitHubDraftPrPanel api={api} commit={commit} />);

  expect(screen.getByLabelText("目标仓库")).toHaveValue(
    "fictional-algae-team/algae-atlas",
  );
  expect(screen.getByLabelText("基础分支")).toHaveValue("main");
  expect(screen.getByLabelText("Draft PR 标题")).toHaveValue(
    "content: publish fictional-news",
  );
  const integrationSwitch = screen.getByRole("checkbox", {
    name: /Integration 模式/,
  });
  expect(integrationSwitch).not.toBeChecked();
  expect(integrationSwitch).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "预检 Draft PR" }));

  expect(await screen.findByText("Draft PR 预检通过")).toBeVisible();
  expect(screen.getByText("mock")).toBeVisible();
  expect(screen.getByText("not-required")).toBeVisible();
  expect(screen.getByText("content/20260724-fictional-news")).toBeVisible();

  await user.click(
    screen.getByRole("checkbox", {
      name: "确认仅运行 Mock，不执行真实 push 或远程 PR",
    }),
  );
  await user.click(screen.getByRole("button", { name: "运行 Mock" }));

  expect(await screen.findByText("Draft PR 模拟完成")).toBeVisible();
  expect(
    screen.getByText(
      "https://github.invalid/fictional-algae-team/algae-atlas/pull/1",
    ),
  ).toBeVisible();
});
