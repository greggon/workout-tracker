#!/usr/bin/env bash
#
# Restore the workout database from a snapshot.
#
# Deliberately does NOT write over the live data directory. It restores beside
# it and tells you the commands to swap them, so the destructive step stays a
# decision you make with the restored copy already in front of you.
#
#   ./workout-restore.sh                  # latest snapshot
#   ./workout-restore.sh <snapshot-id>    # a specific one; see: restic snapshots
set -Eeuo pipefail

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE must point at the repository password}"
: "${DATA_DIR:?DATA_DIR must point at the live data directory}"

SNAPSHOT="${1:-latest}"
TARGET="${RESTORE_TARGET:-${DATA_DIR}.restored-$(date +%Y%m%d-%H%M%S)}"

command -v restic >/dev/null || { echo "restic is not installed" >&2; exit 1; }

echo "Snapshots available:"
restic snapshots --tag workout --compact || true
echo

echo "Restoring '${SNAPSHOT}' to ${TARGET}"
mkdir -p "$TARGET"
restic restore "$SNAPSHOT" --tag workout --target "$TARGET"

# restic recreates the absolute paths it backed up, so the file arrives as
# $TARGET/var/tmp/workout-backup/workout.db. Flatten it to a plain workout.db at
# the top, which is the shape the app wants and the shape you can copy straight
# into place — on this machine or any other.
raw_db=$(find "$TARGET" -name 'workout.db' -type f | head -1)
[ -n "$raw_db" ] || { echo "no workout.db in the restored snapshot" >&2; exit 1; }

db="$TARGET/workout.db"
[ "$raw_db" = "$db" ] || mv "$raw_db" "$db"

# Drop the now-empty scaffolding the absolute paths left behind.
find "$TARGET" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +

if command -v sqlite3 >/dev/null; then
	echo
	echo "Restored database:"
	echo "  integrity   : $(sqlite3 "$db" 'PRAGMA integrity_check;')"
	echo "  orphan rows : $(sqlite3 "$db" 'PRAGMA foreign_key_check;' | wc -l)"
	echo "  accounts    : $(sqlite3 "$db" 'SELECT count(*) FROM users;')"
	echo "  sessions    : $(sqlite3 "$db" 'SELECT count(*) FROM sessions;')"
	echo "  logged sets : $(sqlite3 "$db" 'SELECT count(*) FROM set_logs;')"
	echo "  last session: $(sqlite3 "$db" "SELECT coalesce(max(datetime(started_at/1000,'unixepoch')),'none') FROM sessions;")"
fi

cat <<INSTRUCTIONS

Restored to ${TARGET}:

  ${TARGET}/workout.db

NOT yet live. Inspect it first.

To run the app against it without touching anything else — works on any
machine, which is what makes this a real recovery test:

  DATABASE_URL=${TARGET}/workout.db AUTH_DEV_EMAIL=you@example.com pnpm dev

To put it into service on the Pi:

  docker compose down
  mv ${DATA_DIR} ${DATA_DIR}.broken-$(date +%Y%m%d-%H%M%S)
  mkdir -p ${DATA_DIR}
  cp ${TARGET}/workout.db ${DATA_DIR}/workout.db
  docker compose up -d

Keep the .broken copy until you are satisfied. The restored database has no
-wal or -shm sidecar, which is correct: SQLite recreates them on first open.

Note that the container applies any pending migrations on boot. If you are
restoring to escape a bad migration, pin the image to the tag that matches the
snapshot before starting it.
INSTRUCTIONS
