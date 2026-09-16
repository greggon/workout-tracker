#!/usr/bin/env bash
#
# Nightly backup of the workout database to Cloudflare R2.
#
# Runs on the Pi host rather than inside the container, so it still works when
# the app is stopped or broken — which is exactly when you are most likely to
# want a backup.
#
# Configuration comes from the environment; see backup.env.example.
set -Eeuo pipefail

: "${DATA_DIR:?DATA_DIR must point at the directory holding workout.db}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set (e.g. s3:https://<account>.r2.cloudflarestorage.com/<bucket>)}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE must point at the repository password}"

# A fixed staging path, not mktemp: restic records absolute paths, and a stable
# one keeps snapshots directly comparable and restores predictable.
STAGING="${STAGING_DIR:-/var/tmp/workout-backup}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-24}"

log() { printf '%s  %s\n' "$(date -Is)" "$*"; }

ping_health() {
	[ -n "$HEALTHCHECK_URL" ] || return 0
	curl -fsS -m 10 --retry 3 -o /dev/null "${HEALTHCHECK_URL}${1:-}" || true
}

on_error() {
	local line=$1
	log "FAILED at line ${line}"
	ping_health "/fail"
}
trap 'on_error $LINENO' ERR

for tool in restic sqlite3; do
	command -v "$tool" >/dev/null || {
		echo "missing required tool: $tool (apt install restic sqlite3)" >&2
		exit 1
	}
done

ping_health "/start"
mkdir -p "$STAGING"
chmod 700 "$STAGING"

# ── 1. a consistent copy of the database ──────────────────────────────────
#
# The app runs SQLite in WAL mode, so recent sets live in workout.db-wal and a
# plain `cp` of workout.db silently loses them. `.backup` uses SQLite's online
# backup API, which is safe against a live writer.
log "dumping database"
rm -f "$STAGING/workout.db"
sqlite3 "$DATA_DIR/workout.db" ".backup '$STAGING/workout.db'"

# Verify before shipping it: a corrupt dump backed up faithfully is worse than
# no backup, because it looks like success.
log "verifying dump"
result=$(sqlite3 "$STAGING/workout.db" 'PRAGMA integrity_check;')
[ "$result" = "ok" ] || {
	echo "integrity_check on the dump returned: $result" >&2
	exit 1
}

# Foreign keys specifically, because a table rebuild during a migration is the
# one failure this project has actually seen: with enforcement left on, the
# drop cascades and children vanish. Orphans here mean the schema change went
# wrong, and this snapshot must not become the newest good copy.
orphans=$(sqlite3 "$STAGING/workout.db" 'PRAGMA foreign_key_check;' | wc -l)
[ "$orphans" -eq 0 ] || {
	echo "refusing to back up: ${orphans} row(s) with a broken foreign key" >&2
	exit 1
}

sessions=$(sqlite3 "$STAGING/workout.db" 'SELECT count(*) FROM sessions;')
set_logs=$(sqlite3 "$STAGING/workout.db" 'SELECT count(*) FROM set_logs;')
log "dump holds ${sessions} session(s), ${set_logs} logged set(s)"

# Training history does not spontaneously empty. If it has, something upstream
# went wrong and this run must not quietly overwrite the good history with it —
# seven nightly retentions would otherwise age out every usable snapshot.
MIN_EXPECTED="${MIN_EXPECTED_ROWS:-1}"
if [ "$MIN_EXPECTED" -le 0 ]; then
	# Nagging every night beats a guard everyone forgot to turn on.
	log "WARNING: MIN_EXPECTED_ROWS is 0, so a wiped database would be backed up"
fi
if [ "$set_logs" -lt "$MIN_EXPECTED" ]; then
	echo "refusing to back up: only ${set_logs} logged sets, expected at least ${MIN_EXPECTED}" >&2
	echo "set MIN_EXPECTED_ROWS=0 to override if this is genuinely a fresh install" >&2
	exit 1
fi

# ── 2. snapshot ───────────────────────────────────────────────────────────
restic snapshots >/dev/null 2>&1 || {
	log "initializing repository"
	restic init
}

log "backing up"
restic backup \
	--tag workout \
	--host "${BACKUP_HOST:-$(hostname)}" \
	"$STAGING/workout.db"

# ── 3. retention ──────────────────────────────────────────────────────────
#
# Generous on purpose: the failure this guards against is a deletion you do not
# notice for weeks, so keeping two years of monthlies costs almost nothing and
# buys the ability to go back further than you thought you needed.
log "applying retention policy"
restic forget \
	--tag workout \
	--keep-daily "$KEEP_DAILY" \
	--keep-weekly "$KEEP_WEEKLY" \
	--keep-monthly "$KEEP_MONTHLY" \
	--prune

rm -f "$STAGING/workout.db"
log "done"
ping_health
