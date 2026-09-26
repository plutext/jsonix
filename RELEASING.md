# Releasing @docx4j/jsonix

The npm package is `nodejs/scripts`. Publishing is done by `.github/workflows/push-to-npm.yml`
when a GitHub release is **published** (not drafted), through npm trusted publishing; no token is
involved and nobody runs `npm publish` by hand after the first release. The procedure below follows
the one core-ts uses (its `RELEASING.md`), adapted to this repository.

## Steps

1. **Clean tree on master, CI green** on the commit to release: `git status --short` is empty, and
   the `Jsonix tests` workflow for that commit has passed.
2. **Version.** The next version after `npm view @docx4j/jsonix version` (npm is the authority, not
   the last tag). Set it in `nodejs/scripts/package.json` and regenerate the lock file with
   `npm install --package-lock-only`. It may be part of the implementing commit or its own
   `Version x.y.z` commit; either way the released commit's `package.json` must carry the version.
3. **Clean install and checks**, in `nodejs/scripts`:
   ```
   rm -rf node_modules && npm ci
   npm run typecheck && npm test && npm run test:esm && npm run test:bundle
   ```
   The `Request` suite needs port 8080 free; a failure there alone is environmental.
4. **Inspect the tarball**: `npm pack --dry-run` and read the file list. Expected: `jsonix.js`,
   `jsonix-factory.js`, `jsonix.mjs`, `jsonix.node.mjs`, `types/main.d.ts`, `jsonschemas/`,
   `LICENSE`, `README.md`, `package.json`; no `tests/`, no `node_modules/`.
5. **Install the tarball in an empty directory and exercise what the release is for**:
   `npm pack` here, then in a scratch directory `npm init -y && npm install <path>/docx4j-jsonix-x.y.z.tgz`,
   and run a `require('@docx4j/jsonix')` and an `import { Jsonix } from '@docx4j/jsonix'` that
   unmarshal something touching the new behaviour. This is the only step that shows what a consumer
   actually receives (dependencies pulled in, entry resolution, licence field).
6. **Tag**: annotated, bare version, no `v`:
   ```
   git tag -a x.y.z <commit> -m "@docx4j/jsonix x.y.z: <one line>"
   ```
7. **Push master and the tag together**, before the release exists:
   ```
   git push origin master x.y.z
   ```
   The GitHub release must then *select the existing tag*. A release that creates its own tag
   points at whatever master's head is at that moment, which is how 3.2.1's tag came to name a
   later commit than the one it released.
8. **Wait for CI** on the pushed commit.
9. **Create the release** on GitHub from the existing tag: title is the bare version, body is the
   release notes (see below), pre-release unticked. Publishing it triggers the workflow, which
   refuses unless the tag equals `package.json`'s version, runs the checks again, packs, and
   publishes.

## Consumer verification, and moving a tag afterwards

The dependent packages (`docx4j-generated-objects-ts`, `docx4j-core-ts`) test a release candidate
against the **checkout**, not a tarball, before it is released: `npm install --no-save
../jsonix/nodejs/scripts`, their full suites, one check aimed at the specific claim the change
makes (for a marshal-path change, byte-identity of every re-marshalled part under old and new), the
real consumer case on real data, then `npm ci` to restore. Tell them when there is a commit to test
and wait for their report; their pattern is written up in core-ts's `RELEASING.md`.

If anything is then amended and the tag moved (even a one-line message change), **tell the
consumers which commit the tag now names and what changed**, and let them re-verify. The publish
workflow's guard catches a tag that does not match `package.json`; it cannot catch a tag that no
longer matches what somebody tested. Their trial against the checkout is also not evidence about
the published tarball, so they run their suites again against the npm artifact when they bump.

## After publishing

- `npm view @docx4j/jsonix version dist-tags dependencies license`: `latest` moved, the dependency
  list is `@xmldom/xmldom` and `xmlhttprequest` only, the licence is `(Apache-2.0 AND BSD-2-Clause)`.
- Check the publish workflow's conclusion, not only npm.
- Tell the dependents (`docx4j-generated-objects-ts`, `docx4j-core-ts`, the editor) the version is up.
- Update `../docx4j-portfolio/tasks.yaml` where a CR's status moved, then `scripts/tasks.py check`
  and, after reviewing what changed, `accept`.
- No next-version bump; `package.json` stays at the released version until the next release.

## Release notes

There is no `CHANGELOG.md`. The reasoning for each change lives in `docs/change-requests/`; the
release body is the consumer-facing summary: what changed, why, what a consumer must do, and the
CR paths. Draft it before step 9.

## Never republish a version

A version cannot be published twice. If a release fails after the tag exists, fix, bump, and tag
again; do not create a GitHub release for a version that is already on npm (3.2.0 was published by
hand before trusted publishing existed and has no GitHub release for that reason).
