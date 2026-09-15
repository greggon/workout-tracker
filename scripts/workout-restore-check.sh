#!/usr/bin/env bash
#
# Proves the backup is restorable. A backup you have never restored is a
# feeling, not a backup.
#
# Restores the most recent snapshot into a scratch directory and checks that:
#   - the database is not corrupt
#   - no row has lost its parent
#   - it still holds a plausible amount of training history
#   - the newest session is recent enough that backups are actually running
#   - restic's own repository structure is intact
#
# Exits non-zero, loudly, if any of that fails.
set -Eeuo pipefail

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE must point at the repository password}"

HEALTHCHECK_URL="${RESTORE_CHECK_HEALTHCHECK_URL:-}"
# Reading a slice of the actual pack data catches bit-rot that a structural
# check alone would miss. 5% weekly covers the repository over a few months.
READ_DATA_SUBSET="${READ_DATA_SUBSET:-5%}"
# How stale the newest snapshot may be before it counts as a stopped backup.
MAX_SNAPSHOT_AGE_DAYS="${MAX_SNAPSHOT_AGE_DAYS:-3}"

log() { printf '%s  %s\n' "$(date -Is)" "$*"; }
ping_health() {
	[ -n "$HEALTHCHECK_URL" ] || return 0
	curl -fsS -m 10 --retry 3 -o /dev/null "${HEALTHCHECK_URL}${1:-}" || true
}

RESTORED=$(mktemp -d)
cleanup() { rm -rf "$RESTORED"; }
trap cleanup EXIT
trap 'log "RESTORE CHECK FAILED at line $LINENO"; ping_health "/fail"' ERR

for tool in restic sqlite3; do
	command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

ping_health "/start"

log "checking repository structure (reading ${READ_DATA_SUBSET} of pack data)"
restic check --read-data-subset="$READ_DATA_SUBSET"

log "restoring latest snapshot"
restic restore latest --tag workout --target "$RESTORED"

db=$(find "$RESTORED" -name 'workout.db' -type f | head -1)
[ -n "$db" ] || { echo "no workout.db in the restored snapshot" >&2; exit 1; }

log "verifying the restored database"
result=$(sqlite3 "$db" 'PRAGMA integrity_check;')
[ "$result" = "ok" ] || { echo "integrity_check returned: $result" >&2; exit 1; }

orphans=$(sqlite3 "$db" 'PRAGMA foreign_key_check;' | wc -l)
[ "$orphans" -eq 0 ] || { echo "restored database has ${orphans} orphaned row(s)" >&2; exit 1; }

users=$(sqlite3 "$db" 'SELECT count(*) FROM users;')
sessions=$(sqlite3 "$db" 'SELECT count(*) FROM sessions;')
set_logs=$(sqlite3 "$db" 'SELECT count(*) FROM set_logs;')
log "restored ${users} account(s), ${sessions} session(s), ${set_logs} logged set(s)"

MIN_EXPECTED="${MIN_EXPECTED_ROWS:-1}"
[ "$set_logs" -ge "$MIN_EXPECTED" ] || {
	echo "restored database holds only ${set_logs} sets, expected >= ${MIN_EXPECTED}" >&2
	exit 1
}

# ── the schema must still be the one the app expects ──────────────────────
#
# A snapshot taken mid-migration would restore, pass integrity_check, and still
# be useless. Every table the app writes to has to be there.
for table in users movements days day_exercises sessions set_logs; do
	found=$(sqlite3 "$db" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='${table}';")
	[ "$found" -eq 1 ] || { echo "restored database is missing the ${table} table" >&2; exit 1; }
done

# ── is the backup actually still running? ─────────────────────────────────
#
# A repository that verifies perfectly but stopped receiving snapshots three
# weeks ago is the failure mode this whole drill exists to catch. It looks
# healthy from every angle except the one that matters.
newest=$(restic snapshots --tag workout --latest 1 --json |
	sed -n 's/.*"time":"\([^"]*\)".*/\1/p' | head -1)
if [ -n "$newest" ]; then
	age_days=$((($(date +%s) - $(date -d "$newest" +%s)) / 86400))
	log "newest snapshot is ${age_days} day(s) old"
	[ "$age_days" -le "$MAX_SNAPSHOT_AGE_DAYS" ] || {
		echo "newest snapshot is ${age_days} days old; backups have stopped running" >&2
		exit 1
	}
fi

log "restore check passed"
ping_health
