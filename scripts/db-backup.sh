#!/usr/bin/env bash
#
# Full local backup of the peptides_dev database.
#
# Runs `pg_dump` (custom/compressed format) of the ENTIRE database into
# ./backups and prunes dumps older than the retention window. This is the
# disaster-recovery safety net: it captures every table for every user
# (not just one user's export) and does not depend on any app code, so it
# survives even if the Docker volume is deleted again.
#
# Usage:
#   pnpm db:backup                # manual run
#   (also runs daily via the com.peptides.db-backup launchd agent)
#
# Restore a dump with: scripts/db-restore.sh backups/<file>.dump
#
set -euo pipefail

# launchd runs jobs with a minimal PATH, so make sure the tools we need are found.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

CONTAINER="peptides-postgres"
DB_USER="dev"
DB_NAME="peptides_dev"
RETENTION_DAYS="${DB_BACKUP_RETENTION_DAYS:-14}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# If the database container isn't running there's nothing to dump. Exit 0 so
# the scheduled job doesn't record a spurious failure.
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  log "SKIP: container '$CONTAINER' is not running — nothing to back up."
  exit 0
fi

TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
OUT="$BACKUP_DIR/peptides_dev_${TIMESTAMP}.dump"

log "Starting pg_dump -> $(basename "$OUT")"
if docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
      --format=custom --no-owner --no-privileges > "$OUT"; then
  SIZE="$(du -h "$OUT" | cut -f1)"
  log "OK: wrote $(basename "$OUT") ($SIZE)"
else
  log "ERROR: pg_dump failed — removing partial file."
  rm -f "$OUT"
  exit 1
fi

# Prune old dumps beyond the retention window.
PRUNED="$(find "$BACKUP_DIR" -name 'peptides_dev_*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')"
log "Pruned ${PRUNED} dump(s) older than ${RETENTION_DAYS} days. Backup complete."
