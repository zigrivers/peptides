# ADR-011: Use Resend for Transactional Email

## Status
Accepted

## Context
The application requires reliable email delivery for invitation links, password resets, and async data exports. Deliverability and ease of use for a solo developer are primary concerns.

## Decision
We will use Resend as the primary transactional email provider.

## Alternatives Considered
- **AWS SES**: Cheap but difficult to set up and manage (sandbox, identity verification).
- **Postmark**: Excellent deliverability but more expensive for low-volume v1 usage.
- **SendGrid**: Known for deliverability issues in recent years.

## Consequences
- **Benefits**: Clean API; excellent DX; generous free tier; simple React-based template support (via React Email).
- **Costs**: Lock-in to Resend's API; dependency on a third-party service for critical auth flows.
