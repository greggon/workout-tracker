# Workout Tracker

A weightlifting routine tracker: A/B/C day rotation, superset-aware set logging,
plate-loading diagrams, and per-movement history. Self-hosted on a Raspberry Pi,
behind Cloudflare Access, for a small number of accounts.

All weights are stored in **pounds**. There is no unit conversion layer.

## Setup

Requires Node 24+ and pnpm. This project has no `npm` dependency — every script
runs under pnpm.

```sh
pnpm install
cp .env.example .env     # then edit the seed emails
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`better-sqlite3` is a native module and pnpm blocks build scripts by default.
It is allowed explicitly in `pnpm-workspace.yaml`; if a fresh install leaves it
unbuilt, that file is why.

## Scripts

| Command                       |                                       |
| ----------------------------- | ------------------------------------- |
| `pnpm dev`                    | Dev server                            |
| `pnpm build` / `pnpm preview` | Production build via `adapter-node`   |
| `pnpm test`                   | Vitest, run once                      |
| `pnpm check`                  | `svelte-check`                        |
| `pnpm lint` / `pnpm format`   | Prettier + ESLint                     |
| `pnpm db:generate`            | Write a migration from schema changes |
| `pnpm db:migrate`             | Apply pending migrations              |
| `pnpm db:seed [--force]`      | Load the demo routine and history     |
| `pnpm db:studio`              | Drizzle Studio                        |

## Layout

```
src/lib/server/db/
  schema.ts     Tables, Tool and DayKey unions
  client.ts     createDb(url) + pragmas — no SvelteKit imports
  index.ts      App-facing db, reads $env
scripts/seed.ts Demo data for two accounts
drizzle/        Generated migrations
```

`client.ts` is deliberately separate from `index.ts`: anything importing
`$env/dynamic/private` can only run inside Vite, which would make the seed
script and any future CLI tooling unrunnable.

## Deploy

Runs on a Raspberry Pi 4B behind Cloudflare Access at
`https://workout.goncharov.app`.

GitHub Actions builds on native `ubuntu-24.04-arm` runners — no QEMU, no
cross-compilation — after a `verify` job runs lint, check and tests, so a red
suite never becomes the image the Pi pulls. The image is pushed to
`ghcr.io/greggon/workout-tracker:latest`.

On the Pi, in `~/apps/workout/`, place `docker-compose.yml` and a `.env` holding
`CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`, then:

```sh
mkdir -p data
docker compose pull && docker compose up -d
```

From here, `pnpm deploy` does the pull and restart over SSH.

The container joins the external `edge` network and publishes **no ports**.
`cloudflared` reaches it as `http://workout-tracker:3000`, which is also the
service URL in the tunnel's published application route. Nothing on the LAN can
reach the app, so the only way in is through Access.

Migrations are applied at boot by drizzle-orm's migrator, before the server
accepts a request. A failure crashes the container rather than serving queries
against a stale schema. `drizzle-kit` is a devDependency and is pruned from the
image, so the CLI is not available there — the generated SQL in `drizzle/` is
what ships.

### Environment

| Variable                |                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`          | Path to the SQLite file. `/data/workout.db` in the container.                                                                                                      |
| `ORIGIN`                | Public URL. **Required** — `adapter-node` uses it for SvelteKit's CSRF origin check, and without it every `POST` is rejected with a 403 while `GET`s keep working. |
| `CF_ACCESS_TEAM_DOMAIN` | Account-wide, shared with other apps on the same Cloudflare account.                                                                                               |
| `CF_ACCESS_AUD`         | Per-application. Must be this app's own tag — reusing another app's would make the two accept each other's tokens.                                                 |
| `AUTH_DEV_EMAIL`        | Local only. Read only when `dev` is true, so it is absent from a production build.                                                                                 |

## Schema notes

- **History is keyed by `movement_id`, never by name.** Renaming an exercise
  does not orphan its logs, and one account's spelling never affects another's.
- **`set_logs` stores raw reps and weight; volume is never stored.** Every chart
  is a `SUM()` over that table, so a corrected weight reflows history and a new
  chart costs a query rather than a migration.
- **`sessions.id` is a client-generated UUID** minted when the workout starts.
  It is the idempotency key for the offline sync queue: a replayed POST upserts.
- **Routine edits never destroy history.** Deleting a day nulls
  `sessions.day_id` but keeps `day_key`, so "the last four B days" still
  resolves years later.
- **Foreign keys are enforced per connection.** SQLite defaults them off; every
  `onDelete` rule in the schema is inert without the pragma in `client.ts`.

## Seed data

Two accounts drawn from `SEED_EMAIL` and `SEED_FRIEND_EMAIL`, each with the
three-day split and four weeks of back-dated sessions. The second account's
weights are scaled to 85% so that a query missing its `user_id` filter produces
obviously wrong numbers rather than plausible ones.

Seeding refuses to run against a database that already has sessions unless you
pass `--force`.
