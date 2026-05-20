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

## Consequences
- **Benefits**: S3-compatible API; zero egress fees; simple bucket management; high reliability.
- **Costs**: Dependency on Cloudflare; requires managing AWS SDK or S3-compatible client in the monolith.
