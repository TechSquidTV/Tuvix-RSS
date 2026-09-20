# Release checklist: ingestion reliability and dependency upgrades

This release fixes feed starvation, hardens ingestion and authentication, updates dependencies, and improves article pagination and feed health reporting. See [the review report](dependency-updates.md) for implementation details. Production deployment and migration are still pending.

## Breaking changes

- Require Node.js 24+ and pnpm 12.4.2; use the checked-in lockfile.
- Deploy API and frontend from the same release. Article cursors now contain a publication timestamp and ID; numeric cursors are no longer accepted. Open browser tabs may need a reload after deployment.
- Feed responses over 5 MiB and private-network feed destinations are rejected.
- Node trusts forwarded client IP headers only with `TRUST_PROXY_HEADERS` enabled. Enable it only behind a proxy that overwrites those headers.
- Session cookie caching is disabled so revocations and role changes take effect promptly.

## 1. Review and validate the PR

- [ ] Review the dependency changes, security changes, migration SQL, and API response changes.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm build:tricorder`, `pnpm pre-check`, and `pnpm test` with the supported toolchain. Build Tricorder first on a clean checkout, as CI does, so its workspace exports are available.
- [ ] Require CI success, including Docker validation. Local verification passed 1,584 tests across 108 files, with five existing skips; lint, formatting, types, builds, Worker dry-run, and desktop/mobile smoke checks passed. Docker validation remains pending because the local daemon was unavailable.
- [ ] Rehearse an upgrade on a disposable database with existing sources, articles, subscriptions, and read/saved state. Record row counts and representative timestamps before and after. Also verify a fresh installation.
- [ ] Check staging login/logout, article filters and pagination, read/saved state, feed refresh, error/retry display, and a healthy feed recovering after an induced failure.

**Staging warning:** `deploy-staging.yml` always wipes its database, even when `seed_data` is false. It tests a fresh installation; it does not replace the preserved-data upgrade rehearsal. Use a separate disposable database for that rehearsal. Never run `wipe-staging.sql` against production.

## 2. Migrate in order

Apply all pending migrations through the migration runner, including any older unapplied files. Do not run these SQL files manually and then run the migration runner: that would leave its ledger inconsistent.

| Migration                      | Change                                                              | Existing data                                                                  |
| ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `0012_overrated_toxin.sql`     | Adds persistent `auth_rate_limits`                                  | Starts empty; no account data rewrite                                          |
| `0013_feed_fetch_attempts.sql` | Adds `last_fetch_attempt_at` and its index                          | Backfills from `last_fetched`, preserving NULL and successful-fetch timestamps |
| `0014_feed_reliability.sql`    | Adds `feed_fetch_health`, leases, retry time, failure message/count | New optional fields start NULL; consecutive failures start at zero             |

These are additive migrations. They do not delete articles or subscriptions and have no down migrations. Migration 0013 updates every existing source, so include its duration in the rehearsal. Do not regenerate or rename migration files after release.

For a disposable local SQLite upgrade copy, use an absolute database path:

```sh
DATABASE_PATH=/absolute/path/to/upgrade-copy.db pnpm db:migrate
```

Verify that migrations finish, existing row counts and read/saved state are preserved, and `last_fetch_attempt_at` initially matches `last_fetched`. Start the new API against that copy and verify it starts without pending migration errors.

## 3. Prepare production

- [ ] Select the release version and merged commit after PR approval. Record the currently deployed API and Pages versions (or Docker image digests) for rollback.
- [ ] Verify production Cloudflare credentials can access the intended D1 database with D1 edit permissions. Live D1 access was not available during local review, so production migration state and subscription 71 still require verification.
- [ ] Take and verify a current D1 backup/export or recovery point. Store backups securely outside the repository. For SQLite, stop writers and take a consistent backup, accounting for WAL files; do not copy only a live database file.
- [ ] Verify API/frontend environment configuration, Sentry release/environment values, and that existing Sentry alert rules deliver the new ingestion-health error to the intended destination. Code emits the error; it does not create alert rules.
- [ ] Schedule a brief coordinated API/frontend rollout. Avoid leaving an old frontend against the new cursor contract.

With the production Wrangler configuration and credentials selected, the D1 preparation commands are:

```sh
cd packages/api
mkdir -p migrations
cp drizzle/*.sql migrations/
pnpm exec wrangler d1 migrations list tuvix --remote
pnpm exec wrangler d1 export tuvix --remote --output /secure/backup/location/tuvix-before-release.sql
```

Replace the backup path with an existing secure location. Review the database identity and pending migration list before release. The production workflow applies the migrations; do not apply them a second time manually. Remove the temporary `migrations/` directory after preparation.

## 4. Release and deploy

1. Merge the reviewed PR after required checks pass. Create the selected `vX.Y.Z` tag at that merged commit.
2. Publish the GitHub app release with the breaking changes and migration notes above. **Publishing triggers production Cloudflare deployment and Docker image publication.** Creating a draft PR or draft release does not perform this rollout.
3. Watch `deploy-cloudflare.yml`: API checks/build → D1 migrations → Worker deployment → frontend checks/build → Pages deployment. If migrations fail, stop and inspect the migration ledger; do not deploy the new API around that failure.
4. Watch `docker-publish.yml` and verify both images correspond to the same tag. Manual dispatch must also use that exact tag; both image builds now explicitly check out the requested version.
5. For self-hosted Node/Docker installations, back up the persistent database, stop the old services, and deploy matching API/app images. Node API startup applies pending migrations before serving traffic. Keep the persistent data volume intact.

## 5. Verify recovery before declaring success

- [ ] API `/health` responds successfully; login and authenticated article loading work after a browser reload.
- [ ] D1 migration list shows no pending migrations through 0014; source columns and the two new tables exist.
- [ ] Confirm each minute's fetch batches advance through different eligible sources. Healthy sources update `last_fetched`; failures update attempt/error/retry state without falsely advancing the last successful fetch.
- [ ] Confirm the stale backlog trends down across multiple batches. Publisher 403/invalid-feed failures may remain; they must no longer monopolize every batch.
- [ ] Open the originally reported subscription and confirm newly available articles arrive. Resolve its subscription ID to its source before diagnosing source-specific errors; subscription IDs and source IDs are different.
- [ ] Check filtered/unread article scrolling while marking articles read and while new articles arrive. Confirm no skipped pages, duplicate rows, or cursor errors.
- [ ] Verify read/saved state, feed health messages, manual retry, and responsive layouts.
- [ ] Inspect Sentry for ingestion/database errors and `RSS ingestion is stalled or falling behind`. Observe several batches and a normal per-feed refresh interval before closing the release.

The scheduler cannot recover articles a publisher has already removed from its feed. Validate recovery against articles still present upstream; do not promise historical backfill from this migration.

## 6. Failure and rollback

- If migration fails, retain the old application, inspect applied migrations and schema, and fix forward. D1 can have earlier migrations applied when a later one fails; do not blindly replay raw SQL.
- If API or frontend deployment fails, finish the matching rollout promptly or restore both prior application versions. A successful Worker deployment followed by failed Pages deployment leaves mixed versions.
- Retain additive schema changes during an application rollback. Verify the previous application against the migrated rehearsal database before relying on rollback; schema additivity alone does not prove dependency/authentication compatibility.
- Restore a database backup only for confirmed data corruption or an unrecoverable migration problem, with writers stopped and explicit acceptance of losing changes since the backup. Routine application rollback should not restore old data.
- Rolling back the API also restores the old starvation behavior. Treat rollback as temporary and monitor the feed backlog until the corrected release is deployed.
