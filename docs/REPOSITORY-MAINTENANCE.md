# Repository maintenance

## Branch policy

`main` is the only long-lived branch and the only production source. Use short-lived `feature/*`, `fix/*`, `chore/*` and `docs/*` branches, merge them through Pull Requests, and delete them after merge.

Do not add a long-lived `develop` branch. Names such as `old`, `new`, `final`, `final2`, `backup`, `copy` and `agent/*` are not a version-management system; use commits, annotated tags, Pull Requests and Releases.

## Audit remote state

```bash
git fetch --all --prune --tags
git status
git remote -v
git branch --show-current
git branch -vv
git branch -r
git tag --list --sort=-creatordate
git log --graph --decorate --oneline --all --date-order
```

Use GitHub to inspect all open, draft, closed and merged Pull Requests, Releases, the default branch and repository settings. For every remote branch record its latest SHA, update date, Pull Request, relation to `main`, unique commits and any production dependency.

## Compare a branch with `main`

```bash
git merge-base origin/main origin/<branch>
git rev-list --left-right --count origin/main...origin/<branch>
git log --oneline origin/main..origin/<branch>
git diff --stat origin/main...origin/<branch>
```

Do not decide from the branch name alone. A branch may be old but still contain deployed or otherwise valuable work.

## Confirm the production commit

Production releases may be official GitHub tarballs rather than Git worktrees. Use the persistent metadata:

```bash
ssh algae-server
readlink -f /srv/algae-atlas/current
cat /srv/algae-atlas/current/.release-sha
readlink -f /srv/algae-atlas/previous 2>/dev/null || true
cat /srv/algae-atlas/previous/.release-sha 2>/dev/null || true
sudo systemctl status algae-atlas --no-pager
```

Compare `current/.release-sha` with GitHub's live `main` SHA. Do not delete the only branch or commit from which production can be restored.

## Branch deletion requirements

Delete a remote branch only when all conditions are true:

1. its work is merged into `main`, or all unique valuable commits are preserved by an annotated tag;
2. no open Pull Request uses it;
3. production does not use it;
4. its files have been reviewed;
5. the action is recorded in the cleanup report;
6. the state can be restored from Git history, a tag or the Pull Request.

Delete branches individually, without wildcards:

```bash
git push origin --delete <branch-name>
git fetch --prune
git branch -r
```

Keep the GitHub Pull Request record.

## Annotated archive tags

When a branch contains useful unique history that will not remain as direct ancestors after a squash merge, archive the branch tip before deletion:

```bash
git tag -a archive/<description>-YYYY-MM-DD <branch-sha> -m "Original branch: <name>
Original PR: #<number>
Commit: <sha>
Archive reason: <reason>
Superseded by main: <yes-or-no>"
git push origin archive/<description>-YYYY-MM-DD
```

Archive tags are recovery points, not new development bases.

## Restore a deleted branch

Inspect the archived commit first, then create a deliberately named recovery branch:

```bash
git fetch origin --tags
git show archive/<tag>
git switch -c fix/recover-<topic> archive/<tag>
```

Open a new Pull Request for any recovered work; do not move `main` backward.

## Unmerged code found in production

1. Do not delete the source branch or commit.
2. Record the production SHA and compare it with `main`.
3. Review and validate the code.
4. Prefer merging its Pull Request into `main`.
5. Redeploy from `origin/main` and verify the production SHA.
6. Archive unique history if needed, then delete the temporary branch.

If direct merge is unsafe, create a replacement Pull Request or an annotated recovery tag before changing production. Never solve the divergence by force-moving `main`.

## Codex and automation branches

Codex-created branches follow the same rules as any other short-lived branch. Before deletion, inspect the associated task, Pull Request, commit difference and production relation. Remove merged branches promptly; leave ambiguous branches for human confirmation.

## Why force push is prohibited

Force pushing can invalidate reviews, tags, deployment evidence and recovery instructions. Use additive fixes, revert commits or a new Pull Request. Do not use `git reset --hard`, `git filter-branch`, `git filter-repo` or BFG for routine cleanup.

If a secret was committed, rotate it immediately and document a separate, explicitly approved history-remediation plan; do not rewrite the repository during ordinary maintenance.
