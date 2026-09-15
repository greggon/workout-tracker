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
