-- Enforce one ProtocolRating per (outcomeLog, protocol). Without this,
-- two concurrent OutcomeLog edits could both replace then re-insert the
-- same protocol's rating, producing duplicate rows.
CREATE UNIQUE INDEX "ProtocolRating_outcomeLogId_protocolId_key"
  ON "ProtocolRating" ("outcomeLogId", "protocolId");
