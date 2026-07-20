# Release process

## Versioning

Use Semantic Versioning tags in the form `vMAJOR.MINOR.PATCH`:

- MAJOR: incompatible architecture or major site-structure change;
- MINOR: new pages, sections or substantial features;
- PATCH: fixes, verified copy updates or small presentation changes.

Every formal version is an annotated Git tag and a GitHub Release. Do not move or recreate a published version tag.

## 1. Prepare a short-lived branch

Start from the current remote default branch:

```bash
git fetch origin main --tags
git switch main
git pull --ff-only origin main
git switch -c feature/<name>
```

Use `fix/*`, `chore/*` or `docs/*` when appropriate. Keep `main` as the only long-lived branch.

## 2. Implement and validate

Make one reviewable change, synchronize Chinese and English content, and update `CHANGELOG.md` under `[Unreleased]`.

```bash
npm ci
npm run check
npm test
npm run build:next
```

Fix failures at their source. Do not disable checks or reuse stale build output.

## 3. Open and review a Pull Request

Push the branch and open a Draft Pull Request using the repository template. Record validation results, content and image risks, deployment impact and rollback method. Inspect both locales and relevant mobile/desktop layouts.

When review is complete, mark the PR ready and prefer squash merge into `main`. A sole maintainer does not need to invent a second approval, but the PR and passing checks remain mandatory.

## 4. Deploy `main`

After merge, deploy only the default branch:

```bash
ssh algae-server
sudo deploy-algae-atlas
```

Never deploy the Pull Request branch. Record GitHub `main`, `current/.release-sha`, the release path and the previous SHA.

## 5. Verify production

Check systemd, `/zh`, `/en`, the root redirect, the www redirect, HTTPS and the feature changed by the release. See [DEPLOYMENT.md](DEPLOYMENT.md) for exact commands.

If verification fails, run the documented rollback and open a new fix branch. Do not rewrite history.

## 6. Tag the verified commit

Only after the production SHA is confirmed to equal `main`, create an annotated tag:

```bash
git tag -a vMAJOR.MINOR.PATCH <production-sha> -m "<release summary>"
git push origin vMAJOR.MINOR.PATCH
```

Before pushing, confirm that the tag name does not already exist and that `<production-sha>` is the exact deployed commit.

## 7. Create the GitHub Release

Release notes include:

- version and publication date;
- exact commit SHA;
- production domain and main routes;
- bilingual support;
- principal changes;
- known issues and deferred work;
- previous production SHA and rollback command.

Verify that the Release points to the annotated tag rather than creating a lightweight replacement.

## 8. Finish maintenance

- Move the released notes from `[Unreleased]` to the dated version section when preparing the release commit.
- Confirm the GitHub Release and production SHA agree.
- Delete the merged temporary branch.
- If squash merging left unique branch history worth retaining, create an annotated archive tag before branch deletion.
- Keep the Pull Request and Release records permanently.
