# ADR-013: Use Sentry for Error Tracking and Observability

## Status
Accepted

## Context
A solo developer needs to be alerted to silent failures in safety-critical math or ordering flows within 15 minutes (PRD §8.7).

## Decision
We will use Sentry for error tracking and performance monitoring.

## Alternatives Considered
- **LogRocket**: Great for UI replay, but more expensive and less focused on backend error tracking.
- **Axiom / Datadog**: Robust logging platforms but higher configuration overhead.
- **Standard Console Logs**: Unsuitable for proactive alerting.

## Consequences
- **Benefits**: Automatic exception capture; detailed stack traces; integration with Next.js; P0 alerting via email/Slack.
- **Costs**: Slight performance overhead; dependency on Sentry's SDK and ingestion limits.
