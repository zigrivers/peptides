---
description: Security and fallback rules for Telegram MTProto ordering
globs: ["lib/ordering/**", "app/**/ordering/**"]
---

# Ordering & MTProto Rules

- **Session Security**: Never log or return `sessionString`. Use AES-256-GCM for storage.
- **Manual Fallback**: Every automated order action must have a UI path for manual message copy-paste + deep-link.
- **Safety Gate**: The "Mark Paid" button must be physically blocked until the Quote Confirmation step is acknowledged.
- **Idempotency**: Use the `idempotencyKey` from the request to prevent duplicate vendor messages.
