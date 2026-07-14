#!/usr/bin/env bash
#
# Restore the peptides_dev database from a full dump created by db-backup.sh.
#
# WARNING: this OVERWRITES the current local database. It is guarded by an
# interactive confirmation. It only touches your LOCAL Docker Postgres.
#
# Usage:
#   scripts/db-restore.sh backups/peptides_dev_YYYYMMDD_HHMMSS.dump
#
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

CONTAINER="peptides-postgres"
DB_USER="dev"
DB_NAME="peptides_dev"

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: scripts/db-restore.sh <path-to-.dump>"
  echo "Available dumps:"
  ls -1t backups/peptides_dev_*.dump 2>/dev/null | head -10 || echo "  (none found in ./backups)"
  exit 1
fi

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "Error: container '$CONTAINER' is not running. Start it with: docker compose up -d"
  exit 1
fi

echo "!!  This will OVERWRITE the current '$DB_NAME' database with:"
echo "      $FILE"
read -r -p "Type 'yes' to continue: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }

# --clean --if-exists drops existing objects first so the restore is a clean replace.
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges < "$FILE"

echo "Restore complete from: $FILE"
