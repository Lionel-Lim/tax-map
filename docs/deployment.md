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

The build includes both the England release and the original sample so old
versioned share links continue to work. The `.gz` data companions remain in the
bundle because they are part of the versioned artifact inventory.

## GitHub and automatic Cloudflare publishing

The chosen workflow is **GitHub stores the project; Cloudflare builds and hosts
the app**. The selected private repository is
[`Lionel-Lim/tax-map`](https://github.com/Lionel-Lim/tax-map). GitHub Pages is not used.

Include the source code, `package-lock.json`, `.nvmrc`, `wrangler.jsonc`, tests,
fixtures and the complete `static/` directory in the repository. The versioned
files in `static/data/` are needed to build and run the app. They account for most
of the roughly 580 MB project payload; the largest is below GitHub's individual
file limit. Do not use the browser's drag-and-drop uploader for this bundle;
upload it with Git. Git LFS is not required for the current individual files.

The `.gitignore` excludes dependencies, generated builds, local credentials,
Wrangler state, raw-source downloads and the independent source archive. Keep
the raw data and archive backed up separately; a clone of the GitHub repository
will build the website from its pinned data but will not contain those originals.

After uploading the repository, connect it through Cloudflare **Workers & Pages**
using the GitHub integration. Grant access to the selected repository. Use these
settings for the production build. These examples assume the repository uses
`main`; use its actual production branch if different:

| Setting | Value |
| --- | --- |
| Worker/project name | `limsight-taxmap` (matches `wrangler.jsonc`) |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npx wrangler deploy` |
| Node version | `22.14.0`, pinned by `.nvmrc` |
| Non-production branch builds | Disabled for the initial setup |

Cloudflare installs the npm dependencies. The build command runs type checks,
domain tests, data/state tests, the static build, the free-plan asset check and a
Wrangler dry run. If one fails, it stops before deployment. The deploy command
then uploads the already-checked build. Do not use `npm run deploy` in that field:
that local convenience command would repeat the build.

The configuration names `taxmap.limsight.com` as the custom domain. Connecting and
starting the production build can publish immediately, so finish the first-launch
steps below before starting it. Later pushes to `main` will update the live app
automatically. Work on other branches until changes are ready to publish.

A separate GitHub Actions deployment workflow and Cloudflare token stored in
GitHub are not needed for this integration. Cloudflare handles deployment
credentials within its own build service. Browser tests remain part of local
release verification; the raw-data Python pipeline runs separately.

## First publication

The current data is still labelled an internal validation release. The existing
publication decisions on postcode reuse and usable neighbourhood coverage are
recorded in [the README](../README.md) and [England expansion](england-expansion.md).
Local hosting checks do not resolve those decisions.

When the release is ready to publish:

1. Sign in to the Cloudflare account that owns the active `limsight.com` zone.
   Select the Workers **Free** plan. No paid service is required by this setup.
2. Check whether `taxmap.limsight.com` already has a DNS record or attached
   service. Resolve any conflict deliberately before proceeding; do not replace
   an existing service just to complete deployment.
3. Connect the GitHub repository with the settings above. This may start the first
   deployment immediately. If publishing manually from this computer instead,
   run `npx wrangler login` and complete the browser sign-in. Run
   `npx wrangler whoami` to check the selected account. If there are multiple
   accounts, select the one containing `limsight.com` when prompted.
4. Start the Cloudflare production build after checking the domain and release.
   For a manual local deployment, run `npm run deploy` instead. Both paths validate
   the package before uploading it and attaching the subdomain. Domain setup can take time to finish issuing
   its HTTPS certificate.
5. Repeat the local checks at `https://taxmap.limsight.com/`, including direct
   page visits, postcode lookup, map rendering and a shared-result reload.

Authentication is handled by Wrangler. Never put credentials in the project or
commit Wrangler's local state. Only the built web files are deployed; the Python
pipeline and raw-source archive stay local.

## Updates, caching and rollback

Run `npm run check`, `npm test`, `npm run test:app` and the relevant browser checks
before publishing a changed release. Push approved changes to `main` to trigger
Cloudflare's checks and deployment. `npm run deploy` remains available for manual
local publishing and always makes a fresh build.

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

Cloudflare account connection, DNS changes and public-site verification remain
outstanding, along with production checks and the existing data publication
decisions.
