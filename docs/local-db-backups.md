# Local Database Backups

The local dev database (`peptides_dev`, running in Docker via `docker-compose.yml`)
is now backed up automatically so a stray Docker cleanup (`docker system prune
--volumes`, `docker compose down -v`, etc.) can never silently wipe your captured
data again.

> **Why this exists:** the Docker *volume* that stores every row is separate from
> the container. Deleting the volume deletes the data with no undo. These dumps are
> plain files on disk, outside Docker, so they survive volume deletion.

## What runs

| Piece | Purpose |
|-------|---------|
| `scripts/db-backup.sh` | Full `pg_dump` of the whole database → `backups/peptides_dev_<timestamp>.dump` (compressed, custom format). Prunes dumps older than 14 days. |
| `scripts/db-restore.sh` | Restore the database from a chosen dump (guarded by a confirmation). |
| `scripts/com.peptides.db-backup.plist` | macOS `launchd` agent that runs the backup **daily at 12:30 local**. |

Dumps live in `./backups` (git-ignored). Each is a complete snapshot of every
table for every user — not just one user's export.

## Everyday use

```bash
pnpm db:backup                              # make a backup right now
pnpm db:restore backups/peptides_dev_XXX.dump   # restore from a backup (asks to confirm)
```

## Install / reinstall the daily schedule

Already installed on this machine. To (re)install on a fresh clone:

```bash
cp scripts/com.peptides.db-backup.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.peptides.db-backup.plist
```

Check / disable:

```bash
launchctl list | grep peptides                       # confirm it's registered
launchctl kickstart -k gui/$(id -u)/com.peptides.db-backup   # run it once now
launchctl bootout gui/$(id -u)/com.peptides.db-backup        # turn it off
```

Run logs: `backups/backup.log` (and `backups/launchd.{out,err}.log`).

## Related: per-user export

`scripts/backup_user.ts` / `scripts/restore_user.ts` export/import a **single
user's** data as portable JSON (via the app's own export logic). Useful for moving
one account's data around. The full-DB dump above is the disaster-recovery net;
the per-user JSON is a convenience for one account.

## The dedicated port

The local Postgres publishes host port **5433** (not the default 5432) to avoid
colliding with other local Postgres projects on this machine. `DATABASE_URL` in
`.env` and the `ports:` mapping in `docker-compose.yml` both reflect this. If you
connect with a GUI (e.g. Beekeeper Studio), use `localhost:5433`, user `dev`,
password `dev`, database `peptides_dev`.
