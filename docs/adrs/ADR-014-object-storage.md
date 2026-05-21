# ADR-014: Use Cloudflare R2 for Object Storage

## Status
Accepted

## Context
Async data exports (PRD §5.7) for files >=10MB require a persistent, secure storage location where download links can be generated.

## Decision
We will use Cloudflare R2 as the object storage provider for data exports.

## Alternatives Considered
- **AWS S3**: Industry standard but has egress fees and more complex IAM configuration.
- **Local Disk Storage**: Unsuitable for multi-container deployments on Railway.
- **Supabase Storage**: Tied to the Supabase ecosystem.

## Object Lifecycle and Cleanup

PRD §5.7 specifies that the download link for an async export is emailed within 5 minutes of generation but doesn't specify how long the link remains valid. To prevent unbounded R2 storage growth and minimize the data-retention surface, the following lifecycle applies:

- **Download URL**: signed URL with a 7-day expiry, generated at export-completion time. The URL is included in the notification email.
- **Object retention**: export objects in R2 are retained for **7 days** from creation, then auto-deleted by a daily cleanup job (per ADR-012: `export-cleanup` cron job at 03:00 UTC). A user who needs a new export simply requests one again.
- **DataExportRequest record retention**: the `DataExportRequest` entity (per `docs/domain-models/auth.md`) is retained until account deletion, with `downloadUrl` nulled out after the 7-day window so a stale request shows "Expired — request a new export" in the UI.
- **R2 bucket lifecycle policy**: also configured at the bucket level as a defense-in-depth — if the cron job fails, R2's native lifecycle policy auto-deletes objects with `peptide-export/` prefix older than 14 days.

Account deletion also triggers an immediate purge of all that user's exports from R2.

## Consequences
- **Benefits**: S3-compatible API; zero egress fees; simple bucket management; high reliability. The 7-day window is short enough to limit storage cost and data-exposure surface, long enough that a user who lets the email sit doesn't lose their export.
- **Costs**: Dependency on Cloudflare; requires managing AWS SDK or S3-compatible client in the monolith. Users who don't download within 7 days must request a new export — minor inconvenience but explicit in the UI.

## Traces
- PRD §5.7 (Data Export & Privacy Controls)
- Stories: US-AUT-02 (Account Deletion + Data Export), US-ADM-04 (Delete Managed User — also generates an export)
- Domain model: `DataExportRequest` in `docs/domain-models/auth.md`
- ADR-012 (Railway Cron — runs the export-cleanup job)
