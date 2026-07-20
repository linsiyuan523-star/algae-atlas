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

## IndexNow

IndexNow submission is an explicit post-deployment step. It is not connected to `build`, `build:next` or `test`, so an unavailable IndexNow service cannot break a normal website build or roll back an otherwise healthy release.

### Generate and configure the key

Generate a key with the [official Bing IndexNow generator](https://www.bing.com/indexnow/getstarted), or generate a UUID locally. A valid key is 8-128 characters long and contains only ASCII letters, numbers and hyphens. For example, PowerShell can generate a suitable value without sending it to a third party:

```powershell
[guid]::NewGuid().ToString()
```

Never commit the real value. For local use, copy `.env.example` to an ignored `.env.local` and replace the placeholder. In production, add the same value to the service environment file:

```text
INDEXNOW_KEY=<real-key>
```

The production file remains `/etc/algae-atlas/algae-atlas.env`. Restarting `algae-atlas.service` makes a newly added or rotated key available to the application. The application then serves the exact key, with no trailing newline, at:

```text
https://sycszy.icu/<real-key>.txt
```

Confirm the URL returns HTTP 200 and that its response body exactly equals the configured key before submitting URLs. The key is intentionally public through that verification URL, but it must not be stored in Git.

### Manual submission

`npm run indexnow` loads the current environment and the standard Next.js `.env*` files, reads every public URL directly from `app/sitemap.ts`, removes duplicates, verifies the live key URL, and submits protocol-compliant JSON batches of at most 10,000 URLs to `https://api.indexnow.org/indexnow`.

From a checkout whose `.env.local` contains the production key:

```bash
npm run indexnow
```

The command exits non-zero and prints an `[IndexNow] Submission failed:` message when configuration, key verification, the network request or the API response fails. HTTP 200 means the batch was received; HTTP 202 means it was received while key validation is still pending. Receipt does not guarantee crawling or indexing.

### Run after a production deployment

Run the submission only after `deploy-algae-atlas` has completed its health checks and the new release is publicly reachable:

```bash
ssh algae-server
sudo deploy-algae-atlas
sudo bash -c '
  set -a
  source /etc/algae-atlas/algae-atlas.env
  set +a
  runuser -u algae-atlas -- env INDEXNOW_KEY="$INDEXNOW_KEY" \
    /usr/bin/npm --prefix /srv/algae-atlas/current run indexnow
'
```

Keep this as a separate post-deployment command. If IndexNow submission fails, investigate and rerun `npm run indexnow`; do not redeploy or roll back a healthy website solely because the notification failed.

### Check the result in Bing Webmaster Tools

1. Sign in to [Bing Webmaster Tools](https://www.bing.com/webmasters/) and select the verified `https://sycszy.icu` property.
2. Open **IndexNow** (also presented as **IndexNow Insights** in some views).
3. Check the received URL count, recent submitted URLs, crawl/index status and any key, host, robots or content errors.
4. Use **URL Inspection** for an individual URL when deeper crawl or indexing details are needed.

Reporting can lag behind the API response. The dashboard confirms what Bing received and processed; it does not turn an accepted IndexNow notification into an indexing guarantee. See the [IndexNow protocol documentation](https://www.indexnow.org/documentation) for payload, key-file and response-code details.

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
