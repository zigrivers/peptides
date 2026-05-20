# ADR-005: Use GramJS for Telegram MTProto Integration

## Status
Accepted

## Context
The Ordering module requires user-level Telegram access to send messages to vendors. Official Bot API is insufficient as bots cannot initiate conversations with arbitrary vendors.

## Decision
We will use GramJS (`telegram` npm package) to implement the MTProto client for ordering.

### Session Security
MTProto session strings will be:
1. **Encrypted**: AES-256-GCM encrypted server-side using a `TELEGRAM_SESSION_KEY` env var.
2. **Scoped**: Tied to the Power User's `userId` in the database.
3. **Excluded**: Never returned in API responses or included in data exports.
4. **Revocable**: Immediately deleted from the DB on account deletion or manual request.

### Manual Fallback
To mitigate MTProto session fragility:
1. Every order flow will generate a human-readable message text.
2. If the automated send fails, the UI will display the message and provide a `tg://resolve?domain={vendor}` deep-link for manual completion.
3. Order state can be manually advanced to "Sent" by the user.

## Consequences
- **Benefits**: Battle-tested; extensive documentation; standard patterns for session string serialization and restoration.
- **Costs**: Medium lock-in (switching libraries requires session migration); potential rate limits (mitigated by low transaction volume).
