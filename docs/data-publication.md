# Data publication and Northern Ireland exclusion

The repository's current data files exclude the Northern Ireland records from
the pinned ONS Postcode Directory. ONS excludes these records from its general
free-reuse permission and supplies separate LPS terms for internal business use.
This project does not assert public redistribution permission for that subset.
See [ONS licensing guidance](https://www.ons.gov.uk/methodology/geography/licences).

## Retained data and attribution

The remaining official datasets retain the licences and attributions recorded in
`data/source-manifest.json`, `data/postcode-source-manifest.json` and each
release's `sources.json`. The original postcode source manifest describes the
upstream UK-wide input, not the coverage of the filtered files in this repository.
Hashes, source URLs, aggregate historical counts and licence notices are retained
as provenance. They do not contain the removed postcode records.

For the pinned 2025 postcode data:

- Contains OS data © Crown copyright and database right 2025.
- Contains Royal Mail data © Royal Mail copyright and database right 2025.
- Source: Office for National Statistics licensed under the Open Government Licence v.3.0.

Retain source-specific notices when reusing the data. This cleanup does not
change any third-party licence or select a software licence for the application.

## Cleaned releases

Each of the sample and England releases had 63,023 Northern Ireland postcode
records in 82 outward-code shards. All 328 JSON/gzip files across both releases
have been removed from the working tree. Each release now contains 2,651,940
postcode records in 3,039 shards.

`static/data/<release>/` contains the exact previously published `public-v1`
manifest, postcode index and permitted artifacts. The public manifest hashes are:

| Release | SHA-256 |
| --- | --- |
| `sample-2026-09-26-v1` | `c329cd5de9f574f5cacfaf1160aabe2560e54704a6804b4e58af3cd19fd70a2c` |
| `england-2026-09-26-v1` | `2b0d3b12fb4e04cc02e88e07b1ec22dc2b52521faab662cb5df5168d8ad3a85f` |

The website still serves `/data/public-v1/<release>/` with the same bytes. Tax
statistics, geometries and existing shared links retain their original meaning.
Historical validation reports are kept in `docs/evidence/`, outside website
assets; they contain aggregate counts and English geography evidence.

The build validates both the repository's source files and its generated public
assets. It rejects Northern Ireland records by filename, postcode prefix or
country marker, in JSON and gzip, even if their checksums match the manifest.
The offline Python pipeline also excludes those records before creating shards.
Tests use synthetic records to verify these exclusions.

## Private inputs and Git history

Raw downloads and source-archive blobs remain in ignored local directories.
They are not part of a normal Git clone and must not be force-added or distributed
with source exports. A private Git bundle outside the repository preserves the
pre-cleanup research state. `.gitignore` also excludes restricted shard paths,
research output directories and Git bundle files.

On 4 October 2026, all eight commits in the published `main` history were rewritten
to remove `static/data/*/postcodes/BT*` and all 164 identified restricted blobs.
The cleaned history was pushed with an explicit lease on the previous `main`,
then the local branch was aligned after checking that its working files were
identical. GitHub reported no other branches, tags, pull-request refs or forks.

**The existing GitHub repository must remain private for now.** A post-rewrite
API check still retrieved a removed file through its old commit ID. Rewriting
branches does not purge these retained objects. A fresh repository populated
only from the cleaned history, or a confirmed GitHub-side purge of the retained
objects, is needed before public release. Old local clones and private backups
also retain the original data; do not merge or push their history back. Review
[GitHub's history-removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
before changing repository visibility. Local reflogs and editor recovery refs
are private recovery state and must not be included in source exports or mirror
pushes; use the separately verified cleaned Git bundle when creating a new repo.

Deployment remains a manually started GitHub Action. Data cleanup does not run
the Action, deploy the website or change repository visibility.

## Validation on 4 October 2026

- 67 Python tests, 102 calculation tests, 34 app/data tests, seven publication
  tests and 52 browser tests passed.
- Type checks, production build, Cloudflare asset validation and deployment dry
  run passed. The final build contains 12,798 regular files.
- Both tracked release inventories pass `pipeline verify-release`; the source
  and built public manifest hashes match the published hashes above.
- A scan of the original `main` history identified 164 unique restricted Git
  blobs shared by the 328 deleted paths. No source ZIPs were found in that history.
- The cleaned history scan checked 6,902 unique blobs and found zero restricted
  dataset blobs. All 164 original restricted object IDs were also absent from
  the separate cleaned Git object database.
