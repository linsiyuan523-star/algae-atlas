# Production deployment

## Authoritative source

Production deployments use only the repository's default branch:

```text
origin/main
```

Never deploy a `feature/*`, `fix/*`, `chore/*`, `docs/*`, Pull Request head or local worktree directly to production. Merge and verify the Pull Request first.

## Environment

- SSH host alias: `algae-server`
- Base directory: `/srv/algae-atlas`
- Source checkout: `/srv/algae-atlas/source`
- Releases: `/srv/algae-atlas/releases/<timestamp>`
- Current release: `/srv/algae-atlas/current`
- Previous release: `/srv/algae-atlas/previous`
- systemd unit: `algae-atlas.service`
- Application listener: `127.0.0.1:3000`

Nginx terminates HTTP/HTTPS and proxies requests to the loopback-only Next.js process. The systemd unit starts Next.js from the `current` symlink. Secrets and real environment values remain outside the repository.

## Standard deployment

After a Pull Request is merged into `main`:

```bash
ssh algae-server
sudo deploy-algae-atlas
```

The deployment command resolves `main` to a full commit SHA. It normally fetches `origin/main`; if GitHub's smart Git endpoint is unavailable, it may verify the same `main` ref through the official GitHub API and download the official commit tarball. It does not use third-party mirrors.

The script then:

1. verifies the source repository and origin URL;
2. creates an isolated release directory;
3. records the target in `.release-sha`;
4. runs `npm ci`, `npm run check` and `npm run build:next`;
5. atomically switches `current` only after the build succeeds;
6. restarts `algae-atlas.service` and performs health checks;
7. retains `previous` for rollback.

When the API fallback is used, `/srv/algae-atlas/source` may retain an older cached remote ref. The authoritative deployed identity is `current/.release-sha`, compared with GitHub's live `main` SHA.

## Verification

Confirm release metadata and service state:

```bash
ssh algae-server
readlink -f /srv/algae-atlas/current
readlink -f /srv/algae-atlas/previous 2>/dev/null || true
cat /srv/algae-atlas/current/.release-sha
sudo systemctl status algae-atlas --no-pager
```

Confirm the local application and public routes:

```bash
curl -I http://127.0.0.1:3000/zh
curl -I http://127.0.0.1:3000/en
curl -I https://sycszy.icu
curl -I https://sycszy.icu/zh
curl -I https://sycszy.icu/en
curl -I https://www.sycszy.icu/zh
```

Expected behavior:

- the root path redirects to `/zh`;
- `/zh` and `/en` return successful responses;
- `www.sycszy.icu` permanently redirects to `sycszy.icu` while preserving the path;
- systemd is active and stable;
- repeated 502 responses do not occur;
- `current/.release-sha` equals GitHub `main`.

For a release containing the ICP filing, also verify:

```bash
curl -s https://sycszy.icu/zh | grep '粤ICP备2026098454号'
curl -s https://sycszy.icu/en | grep '粤ICP备2026098454号'
```

## Rollback

If a deployed `main` release fails after switch-over:

```bash
ssh algae-server
sudo rollback-algae-atlas
```

After rollback, repeat the service, local application and public HTTPS checks. Do not rewrite `main` or force-push to simulate a rollback; fix the issue in a new branch and Pull Request.

## Safety

- Do not edit files directly under `current` or a release directory.
- Do not store server passwords, SSH keys, certificates, GitHub tokens or production environment files in this repository.
- Do not use `npm install` in production to bypass the lock file.
- Do not disable TypeScript, ESLint or build checks to force a deployment.
- Record the deployed SHA, release path, previous SHA and verification results in the release report.
