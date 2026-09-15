# Backups

Nightly snapshots of the workout database to Cloudflare R2, plus a weekly drill
that proves they can actually be restored.

Uses [restic](https://restic.net): encrypted, deduplicated, **snapshotted**.
The snapshot part is the point — a plain `rclone sync` mirrors deletions, so a
wipe would be faithfully copied over the only good copy you had.

## What runs

|                            | When           | What it does                                   |
| -------------------------- | -------------- | ---------------------------------------------- |
| `workout-backup.sh`        | nightly, 03:47 | consistent DB dump → R2, then prunes           |
| `workout-restore-check.sh` | Sundays, 04:53 | restores the latest snapshot and verifies it   |
| `workout-restore.sh`       | by hand        | restores _beside_ the live data, never over it |

Retention: 7 daily, 8 weekly, 24 monthly. The database is a few hundred KB, so
the whole history costs almost nothing.

The nightly timer is half an hour after hsa-tracker's, so the two never contend
for the SD card. Each app has its own restic repository and its own password:
losing one must not cost you the other.

## Three things that are easy to get wrong

**The database must be dumped, not copied.** SQLite runs in WAL mode here, so
recent sets live in `workout.db-wal` and a plain `cp workout.db` loses them.
The script uses `sqlite3 .backup`, which is safe against a live writer.

**A backup that runs on an emptied database is worse than none.** If the dump
holds fewer than `MIN_EXPECTED_ROWS` logged sets, or any row has lost its
parent, the backup _refuses to run_. Seven nightly retentions would otherwise
age out every good snapshot within a week. This is not hypothetical: a
migration cascaded and emptied `days`, `sessions` and `set_logs` twice during
development.

**A repository that verifies perfectly but stopped receiving snapshots is the
failure this drill exists to catch.** The restore check fails if the newest
snapshot is older than `MAX_SNAPSHOT_AGE_DAYS`, because everything else about a
stalled backup looks healthy.

## Setting it up on the Pi

```sh
sudo apt install -y restic sqlite3

# Repository password. Store it somewhere else too — without it the backups
# are unreadable ciphertext.
openssl rand -base64 32 | sudo tee /etc/workout-backup.key
sudo chown greggon:greggon /etc/workout-backup.key && sudo chmod 600 /etc/workout-backup.key

# Configuration.
sudo cp scripts/backup.env.example /etc/workout-backup.env
sudo chown greggon:greggon /etc/workout-backup.env && sudo chmod 600 /etc/workout-backup.env
sudo -e /etc/workout-backup.env

sudo cp scripts/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now workout-backup.timer workout-restore-check.timer
```

`pnpm deploy` pushes these scripts before it uses them, so the Pi only needs
the directory to exist. `pnpm deploy:scripts` pushes them on their own,
`pnpm backup:now` runs a backup, and `pnpm backup:check` runs the restore drill.

**`MIN_EXPECTED_ROWS` ships at 0** so the first backup on an empty database
does not block the first deploy. Raise it once you have real history — the
nightly log warns until you do.

## Restoring

```sh
set -a; . /etc/workout-backup.env; set +a
~/apps/workout/scripts/workout-restore.sh          # latest
~/apps/workout/scripts/workout-restore.sh <id>     # a specific snapshot
```

It restores beside the live data and prints the commands to swap them, so the
destructive step stays a decision you make with the restored copy in front of
you.

**If you are restoring to escape a bad migration**, pin the image to the tag
that matches the snapshot first. The container applies pending migrations on
boot, so starting `:latest` against an old database will simply re-apply the
migration you were trying to get away from.

## Why a snapshot before every deploy

`pnpm deploy` takes a backup before pulling the new image. Migrations run at
container boot, and a nightly backup can be up to 24 hours stale at exactly the
moment a schema change goes wrong.
