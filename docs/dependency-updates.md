# Dependency update and review — September 19, 2026

Updated workspace dependencies, the lockfile, GitHub Actions, CI, and Docker build tooling. Resolved the review findings and compatibility errors exposed by the upgrades. Changes are local and have not been deployed.

## Breaking changes and deployment requirements

- The application and development toolchain now require **Node.js 24+ and pnpm 12.4.2**. `.nvmrc` selects Node.js 24.20.0; CI and Docker use Node.js 24.
- Apply `packages/api/drizzle/0012_overrated_toxin.sql` before serving the updated API. It adds persistent authentication rate limits. Node startup applies migrations automatically; production and staging Cloudflare workflows now migrate before deploying the API.
- Apply `packages/api/drizzle/0013_feed_fetch_attempts.sql` before serving the updated API. It adds and backfills the separate feed-attempt scheduling timestamp. Batches now run every minute, with `fetchIntervalMinutes` applied per feed.
- Node deployments ignore forwarded client IP headers by default. Enable `TRUST_PROXY_HEADERS` only behind a trusted proxy that overwrites those headers.
- Feed discovery and fetching reject private network destinations, including redirects and Node DNS resolution to private addresses.
- Session cookie caching is disabled so revoked sessions and role changes take effect on the next request.
- Vite 8 updates the default browser compatibility baseline. See the [Vite migration guide](https://vite.dev/guide/migration).

## Dependency updates

| Area                 | Selected version |
| -------------------- | ---------------- |
| Vite / React         | 8.3.0 / 19.3.0   |
| TanStack React Table | 9.2.4            |
| Better Auth          | 1.7.5            |
| Feedsmith / Undici   | 3.0.0 / 8.10.2   |
| React Email          | 6.9.5            |
| ESLint / TypeScript  | 10.10.0 / 6.0.3  |
| Vitest               | 5.0.1            |
| better-sqlite3       | 13.0.3           |

All workspace dependencies were checked against the npm registry, including major upgrades. Only two version families remain below the latest major, intentionally:

- TypeScript 6.0.3: the latest typescript-eslint parser supports `>=4.8.4 <6.1.0`; TypeScript 7 is outside its supported range. See the [official compatibility matrix](https://typescript-eslint.io/users/dependency-versions/).
- Node type definitions 24.13.5: match the supported Node.js 24 runtime rather than advertising Node 26 APIs.

Vitest 5, better-sqlite3 13, React 19.3, Feedsmith 3, and Vite 8.3 are installed with no peer dependency conflicts. Codecov, Docker build-push, and Docker Buildx GitHub Actions were updated to their latest public releases and pinned to immutable commit SHAs. Other Action pins were verified as current.

Removed the deprecated Rolldown Vite alias and React Email component package, migrated to pnpm's `allowBuilds` configuration, and refreshed vulnerable transitive dependencies. See [pnpm build settings](https://pnpm.io/settings/build) for the package-manager change.

## Fixes verified during the review

- Hardened authentication, session handling, telemetry redaction, public URL fetching, and authorization checks.
- Corrected subscription pagination, query invalidation, article counts and filtering, bulk read updates, and public feed limits.
- Migrated Better Auth database options, TanStack Table state/features, and the Undici response adapter.
- Centralized feed metadata extraction and parser-derived types; corrected JSON Feed site URLs and Atom alternate-link selection.
- Fixed subscription discovery races, duplicate URL decoding, controlled-state synchronization, and chart tooltip typing.
- Restored route tests after the router plugin upgrade and grouped production bundles into smaller cacheable chunks.
- Fixed staging database resets to remove the new authentication table before replaying migrations. A regression test covers wiping a populated database and recreating it from the complete migration history.

## September 19 review passes

### Bugs and release tooling

- Article counts now respect the same include/exclude content filters as the article list. Ordinary counts aggregate inside SQLite/D1 instead of transferring full article bodies four times. Filtered counts scan once in bounded chunks.
- Migrated Feedsmith 3 structured Atom titles, summaries and content, RSS authors, Dublin Core creators, and public type exports. Atom article links select the publisher's alternate link. See the [upstream migration guide](https://next.feedsmith.dev/migration/v2-to-v3).
- Public Sentry diagnostics are disabled outside development; HTTP 500 responses hide internal details in production.
- Server-side feed redirects share one timeout budget. Publisher links opened by article cards accept HTTP(S) only.
- Category discovery and subscription preview now include both feed-level and entry-level categories across RSS, Atom and JSON Feed.
- Fixed an error assertion helper that incorrectly passed when an operation did not throw. Released test focus before cleanup so jsdom does not send spurious window-blur events to the next Radix menu.
- Root route/icon generation scripts target the correct workspace package. `pnpm clean` preserves databases and removes all package build outputs. `clean:all` also removes Tricorder dependencies.
- Admin initialization failures are logged during Node startup instead of silently ignored.
- Tricorder emits Node-compatible ESM imports with `.js` extensions. Its compiler now uses NodeNext resolution to reject extensionless imports during builds and type checks; both published entry points were imported directly in Node.

### UI enhancements

- Loaded articles remain visible while counts are pending or unavailable and after a pagination error.
- Initial errors offer a retry action; pagination provides keyboard-accessible load-more and retry buttons with live status announcements.
- Mobile bulk actions have explicit accessible labels. The empty-state navigation uses one link rather than nested interactive controls.
- Shared date formatting handles invalid and future publication dates and correctly omits the suffix when requested.

### DRY and efficiency

- Shared feed metadata extraction between Tricorder validation and the API, and shared entry/category extraction between ingestion, category suggestions and AI context.
- Consolidated the four article panels into one rendering definition; only the active list mounts, with a single pagination observer.
- Reused the shared date formatter and article-query join helpers.
- Removed redundant reads before article-state upserts and bulk updates. SQLite's conflict clause preserves unchanged saved/audio state atomically; bulk IDs are deduplicated.

## Additional breaking changes

- Feedsmith 3 type exports use `RssFeed`, `AtomFeed`, `RdfFeed`, and `JsonFeed`; the old API type names are removed, without compatibility aliases.
- `/debug-sentry` returns HTTP 404 unless `NODE_ENV=development`.
- Test tooling uses Vitest 5; consumers of the discovery library must account for the Feedsmith 3 major dependency upgrade.

## Validation

Verified with Node.js 24.18.0 and pnpm 12.4.2:

| Check                                              | Result                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frozen lockfile installation and peer dependencies | Passed                                                                                                                                                       |
| Full tests and coverage                            | 1,560 passed, 5 existing skips across 104 test files                                                                                                         |
| Combined coverage                                  | 73.22% statements, 62.42% branches, 70.02% functions, 73.55% lines; configured thresholds passed                                                             |
| ESLint, Prettier, TypeScript                       | Passed                                                                                                                                                       |
| Production builds                                  | Passed for Tricorder, Node API, and frontend/PWA                                                                                                             |
| Cloudflare Worker bundle                           | Dry run passed; nothing deployed                                                                                                                             |
| Dependency audit                                   | Zero reported vulnerabilities across 1,424 dependencies                                                                                                      |
| Production API package                             | Assembled successfully; SQLite and bcrypt native-module smoke checks passed                                                                                  |
| Browser smoke tests                                | Desktop and 390px mobile layout, login, saved articles, share menu, keyboard pagination through 60 articles, and admin users table passed; no console errors |
| Tricorder ESM regression                           | Both built entry points import in Node; 46 library tests passed after the fix                                                                                |
| Diff whitespace                                    | Passed                                                                                                                                                       |

The browser checks used a temporary local database with synthetic users and articles. Temporary servers were stopped afterward.

Docker images could not be built because the local Docker daemon is unavailable. No production database or service was changed.

## Production missing-article follow-up

Sentry production logs on September 19 showed all 631 sources stale, with repeated batches reporting `0 succeeded, 20 failed out of 20`. The same failing sources repeatedly occupied the queue because selection was ordered by `lastFetched`, which never advanced on failures. This prevented healthy sources later in the queue from receiving articles.

- Schedule by a separate indexed `lastFetchAttemptAt`, written before external work, including blocked or failing feeds. Preserve `lastFetched` as the successful-refresh timestamp.
- Retry failed feeds after the per-feed cooldown and rotate by oldest attempt, with source ID as a deterministic tie breaker.
- Process a bounded batch every minute. The configured refresh interval applies to each source rather than pausing the whole queue between 20-source batches.
- Propagate monitored RSS-handler failures without executing the same batch again through the SDK-import fallback.
- Migration `0013_feed_fetch_attempts.sql` backfills attempts from existing successful timestamps. No production changes were applied during the investigation.

Evidence: production Sentry logs at `2026-09-19T18:51:52Z` reported `Starting fetch for 20 sources (631 stale feeds, 631 total...)`; repeated completion logs included `2026-09-19T18:52:04Z`, `18:36:52Z`, and `18:19:35Z`, each reporting 20 failures and zero successes. Repeated BleepingComputer HTTP 403 failures corroborated the lack of queue rotation. Queries used `sentry log list techsquidtv/tuvix-api --period 24h` with `environment:production`, `"Starting fetch"`, and `"Fetch complete"` filters.

Subscription 71 could not be mapped to its source: the browser required login and the configured Cloudflare credentials were denied read access to the production D1 database. The queue bug is confirmed, but a source-specific diagnosis for that subscription remains unverified. Publisher-side 403 errors and invalid feed responses can still require individual attention after queue progress is restored. Articles that have already disappeared from a publisher's RSS feed cannot be recovered by this scheduler change alone.

Follow-up validation passed: 1,566 tests across 105 files with five existing skips; lint, formatting, TypeScript, production builds, Worker dry run, and whitespace checks. This includes migration backfill, failed/blocked feed rotation, retry cooldown, batch cadence, and monitored-handler failure regressions. The coverage percentages above are from the release-review run before this follow-up.

## Additional release hardening

All six follow-up recommendations are implemented:

1. Article writes ignore only the `(source_id, guid)` duplicate constraint. Other storage errors propagate, keep the previous successful-fetch timestamp, and record a failed attempt. Partially completed chunks can be retried without duplicate articles. Missing article identity and extraction errors also prevent a false successful refresh.
2. Feed attempts acquire an atomic database lease shared by cron and manual refreshes. Leases expire after two minutes, renew during longer ingestion, and use ownership tokens to prevent an expired worker from completing or releasing a replacement worker's lease. This coordinates Node and D1 workers without process-local locks.
3. Subscription cards show the last successful update, a safe failure description, consecutive failures, and the next retry. Failed attempts use exponential retry delays capped at 24 hours. Persistent batch health emits a Sentry error after three unsuccessful batches with errors or three successive backlog increases, with a shared 30-minute alert throttle. Delivery of Sentry notifications follows the project's existing alert rules; no external notification configuration was changed.
4. Article infinite scrolling now uses a structured `{ publishedAt, id }` cursor returned as `nextCursor`. It handles timestamp ties, null dates, deleted anchors, new articles, and read-state changes. Filtered scans also use keyset pagination internally. Explicit offset pagination remains for numbered-page callers; numeric article cursors are rejected.
5. A shared Tricorder response reader caps feed/discovery responses at 5 MiB before parsing, checks both declared and actual streamed sizes, and cancels oversized/erroring bodies. RSS ingestion, previews, subscription creation/import, and discovery use the same helper.
6. All three cron handlers share one monitoring wrapper and one schedule definition. Only SDK import failures bypass monitoring; task failures propagate once. Monitoring uses the actual one-minute, one-day, and seven-day execution intervals.

**Deployment requirements:** Apply `0014_feed_reliability.sql` after migration 0013 before serving the API. Deploy the frontend and API together because article cursors and subscription health responses changed. There are no compatibility aliases for old article cursors. Feed responses above 5 MiB are now rejected. The retry policy can delay repeatedly failing feeds up to 24 hours; manual refreshes can still retry immediately when no active lease exists.

The investigation and implementation have not changed production data, deployed services, or Sentry alert configuration.

Validation for all six improvements: **1,584 tests passed across 108 files, five existing skips**. ESLint, Prettier, strict type checks, production builds, the Cloudflare Worker dry run, and diff whitespace checks passed. Automatic Node migrations were verified on the disposable smoke database. Browser checks confirmed feed health on desktop and 390px mobile, keyboard pagination through 60 articles using the new cursor, and no console errors. Temporary servers and browser tabs were closed afterward.
