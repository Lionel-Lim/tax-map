# Deploying to taxmap.limsight.com

The selected host is **Cloudflare Workers Static Assets, Free plan**, at
`https://taxmap.limsight.com/`. The app uses the whole subdomain, so SvelteKit's
base path stays empty and existing navigation, data URLs and share links work
at the root. The existing `limsight.com` website has its own hostname.

`wrangler.jsonc` uploads only `build/` and attaches the `taxmap.limsight.com`
custom domain. Cloudflare creates the DNS record and HTTPS certificate as part
of attaching that domain. The separate `workers.dev` and version-preview URLs
are disabled. No Worker script, database or external map-tile service is needed.

## Prepare and check locally

The website serves only the generated `.build/public-static/` assets. Run
`npm run prepare:public` to generate them; `npm run dev`, `npm run build` and
`npm run test:app` do this automatically. Do not deploy `static/` directly.
That directory contains the cleaned source data rather than the complete built
website. Restricted Northern Ireland records have also been removed from these
tracked sources; see [data publication](data-publication.md).

The public distribution lives at `/data/public-v1/<release-id>/`. All 63,023
Northern Ireland postcode rows per release are excluded, in both JSON and gzip
shards. The tracked releases now contain the exact previously published public
manifests and artifacts. The generator validates the source inventory, checksums
and postcode contents, then copies them byte-for-byte. It rejects contaminated
source data instead of silently filtering it. Share-link data versions, public
URLs and cached file bytes stay unchanged. Historical validation reports remain
in `docs/evidence/` and are not website assets. BT inputs return an out-of-scope message
without looking up or asserting the existence of that postcode.

The final asset check rejects raw release directories, unexpected releases,
checksum/inventory mismatches and Northern Ireland rows in JSON or gzip files.
The original `publicReleaseReady: false` research metadata is retained as source
provenance, not relabelled as complete coverage. `distribution` records the
publication filter. The website visibly describes the remaining coverage gaps.

Use Node 22.14.0 or newer and the pinned npm dependencies:

```sh
npm ci
npm run deploy:check
npm run preview:cloudflare
```

`deploy:check` builds the static app, checks the free-plan asset limits, then
asks Wrangler to validate the deployment with `--dry-run`. It does not upload
the app or change DNS. `preview:cloudflare` serves that build locally at
`http://127.0.0.1:4174/` using Cloudflare's local runtime. Stop it with Ctrl+C.
On macOS, the preview command polls files every ten seconds instead of using the
native file watcher. This avoids a Wrangler startup failure (`spawn EBADF`)
observed with the large postcode bundle. It affects local preview only.

Check the home page, methodology and sources pages, a postcode lookup, and a
created share link opened in a new tab. Refresh the shared page as well. An
unknown URL or missing data file should return HTTP 404, rather than the home
page. Page URLs use a trailing slash, matching SvelteKit's generated folders.

The build includes filtered distributions of both the England release and the
original sample so old versioned share links continue to work. Retained `.gz`
companions are checked as part of the public artifact inventory.

## GitHub source and manual publishing

The chosen workflow is **GitHub stores the project; Cloudflare hosts the app;
updates are deployed through a manually started GitHub Action**. The user selected
manual Actions runs on 4 October 2026. The private source repository is
[`Lionel-Lim/tax-map`](https://github.com/Lionel-Lim/tax-map).
GitHub Pages and Cloudflare's automatic GitHub build integration are not enabled.
The [deployment workflow](../.github/workflows/deploy.yml) uses only
`workflow_dispatch`: pushes, pull requests and schedules do not start it.
Pushing a commit does not update the live website.

Keep source, dependencies' lockfile, tests, Wrangler configuration and cleaned
`static/` releases in the repository. Deploy generated `build/`, which contains
the application and the filtered public distribution.
The `.gitignore` excludes generated files, local credentials, Wrangler state,
raw-source downloads and the independent source archive. Back up the raw data
and archive separately; they are not included in a repository clone.

### Run the GitHub Action

One-time setup:

1. Commit and push `.github/workflows/deploy.yml` to the default branch, `main`.
   GitHub only shows **Run workflow** once the workflow is on the default branch.
2. In the repository's **Settings → Secrets and variables → Actions**, add the
   repository secret `CLOUDFLARE_API_TOKEN` using a securely supplied deployment
   token with the account and zone scope described below. The account ID is
   already in `wrangler.jsonc`; no separate account-ID secret is needed.

For an update, push the changes to `main`, then open **Actions → Deploy to
Cloudflare → Run workflow**, select `main`, and start the run. The deployment job
only runs for `main`. It installs pinned dependencies, runs `build:cloudflare`
(type checks, unit/app/publication tests, static build, asset validation and
Wrangler dry run), then runs the Chromium browser tests before publishing the
checked `build/` directory. Failed checks prevent deployment. Production runs
share a concurrency group so deployments cannot overlap.

The token is passed only to the deployment step. Keep it in Actions secrets,
never in the workflow or other committed files. No action has been dispatched
as part of adding this workflow; its first hosted run remains to be verified.
After a successful run, verify pages, a postcode lookup and a shared-result
reload on the live domain.

### Local deployment alternative

To publish from a local checkout:

1. Make and verify the changes, then save the source to GitHub.
2. Authenticate Wrangler to the selected account using a securely supplied API
   token. The approved scope is Workers Scripts Edit for account
   `1c4ef6d41930057ec9ec8b51db2eac11`, plus Zone Read and Workers Routes Edit for
   `limsight.com` only. This still permits editing other Workers in the account;
   it is not a per-Worker credential. No additional build-management permission
   is needed for manual publication.
3. Run `npm run build:cloudflare` for the checks and build, then
   `npx wrangler deploy` to publish that checked build. The `npm run deploy`
   convenience command rebuilds, checks the public assets and publishes, but
   does not run all unit tests.
4. Verify pages, a postcode lookup and a shared-result reload on the live domain.

Supply an API token through `CLOUDFLARE_API_TOKEN` using secure local credential
handling, never in source, command history, public assets or GitHub source files.
The temporary owner-readable token file used for initial deployment was removed after use.
The token remains active in Cloudflare with its original three permissions.

Automatic publishing can be reconsidered separately. During setup, a custom user
token did not appear in Cloudflare's build-token dropdown: it must first be
registered with Workers Builds. The registration API requires Workers Builds
Configuration Edit. That extra permission was prepared but never applied, and
the pending GitHub connection was cancelled when manual deployment was chosen.
No broader default build token was created.

## First publication

The user approved preparing the filtered public preview after the security and
licensing review on 28 September 2026. Northern Ireland data is excluded rather
than relying on permission to redistribute it. Coverage gaps remain clearly
labelled and unavailable estimates stay unavailable. Production verification passed as recorded below.

The first release was published manually using the restricted token. Wrangler
attached the previously unused `taxmap.limsight.com` custom domain and Cloudflare
provided HTTPS. The existing apex website and other domains were not changed.
Only built public web files were uploaded; the Python pipeline, original
research data and source archive were not deployed.

## Updates, caching and rollback

Run `npm run check`, `npm test`, `npm run test:app` and the relevant browser checks
before publishing a changed release. Push source changes to `main` to save them, then manually publish as described
above. GitHub pushes do not trigger a deployment.

`static/_headers` gives hashed application assets and the two immutable data
releases a one-year browser cache lifetime. HTML retains Cloudflare's default
revalidation behaviour. The active `data/manifest.json` pointer explicitly
revalidates. Publish corrected data under a new release ID, preserve releases
referenced by shared links, and add a matching cache rule for each new immutable
release. Do not overwrite files under an existing immutable release URL.

Before an update, record the current version in Cloudflare's deployment history.
If needed, select that previous version and use Rollback from the Worker’s
Deployments page. Verify the homepage and shared links after rollback; retaining
old release files is still necessary for links created before the update.

Expected hosting cost is **£0/month**, excluding the existing domain renewal:
static asset requests are free and unlimited, with no extra asset-storage fee.
The Free plan allows 20,000 files per Worker version and 25 MiB per file. The
asset check enforces those limits on every deployment. Extra archived releases
increase the file count. There is no paid storage or request-processing script
in this configuration.

References (checked 28 September 2026):

- [Static asset pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Asset limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets)
- [Custom domains and HTTPS](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
- [Static response headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Cloudflare GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Workers build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

Manual Actions references (checked 4 October 2026):

- [Manually running a GitHub workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [Deploying Workers with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

## Local validation recorded 28 September 2026

- `npm run build:cloudflare`: the complete automatic-build command passed locally,
  including 99 calculation tests, 32 data/state tests, type checks, the build,
  asset limits and deployment dry run. Cloudflare's hosted build is still to be run.
- `npm run check`: zero errors and warnings.
- `npm run deploy:check`: build, free-plan asset check and Wrangler dry run passed;
  13,127 files including `_headers`, largest file 11.21 MiB.
- `npm run preview:cloudflare`: starts successfully with the macOS polling fix.
- Browser checks against that Cloudflare preview: rendered map, `LE4 0DD`
  postcode lookup, shared-result navigation and reload, methodology and sources
  navigation all passed with no page errors.
- HTTP checks: all four pages and representative data files return 200; unknown
  pages and missing JSON return 404. `/map?…` redirects to `/map/?…` with the
  query intact. Immutable assets and data receive one-year caching; HTML and the
  active release pointer revalidate.
- The local runtime returned a full 200 response to a byte-range probe, including
  with `Accept-Encoding: identity`. The current app fetches whole GeoJSON files
  and does not need byte ranges. Recheck deployed range support before any future
  move to PMTiles; this result does not establish that capability.

These were the original local checks before the filtered release. See the
publication record below for current production status.

### Filtered public preview verification — 28 September 2026

The filtered distribution passed type checks, 99 domain tests, 33 app tests,
2 publication-boundary tests, and 39 browser tests. The final build has 12,797
regular files (Wrangler reports 12,818 asset-directory entries), below the free
20,000-file limit; its largest file is 11.21 MiB. Wrangler dry run passed.
The credential-pattern scan found no matches across all 12,797 built files.

Cloudflare's local runtime returned 200 for the pages and an England postcode
shard, and 404 for Northern Ireland JSON/gzip, original unfiltered release URLs,
and `/.env`. Each filtered release contains 2,651,940 postcode records in 3,039
shards. Original files and tax statistics were not changed. These are local
checks; production verification is recorded below.

### First public deployment — 28 September 2026

Published commit `812737af46d32199f7c19c683986c79202f5fe50` using Wrangler and
the approved `taxmap-deploy` token with the three deployment permissions above.
Cloudflare version: `e6dfbe4d-7b87-4385-9972-bc054d26078d`.
The live custom domain is https://taxmap.limsight.com/; HTTPS responds successfully.

Production checks passed:

- Homepage, map, methodology, sources and England postcode shard return 200.
- The rendered map and `LE4 0DD` lookup select Bradgate Heights & Beaumont Leys.
- A generated share link opens directly at `/map/` and restores the comparison.
  The full postcode is excluded by default.
- Northern Ireland JSON/gzip, original unfiltered release URLs and `/.env`
  return 404.

The user chose manual deployment after this verification. GitHub automatic
publishing is disconnected. The build-management permission was never granted;
the token retains only the original three deployment permissions.
