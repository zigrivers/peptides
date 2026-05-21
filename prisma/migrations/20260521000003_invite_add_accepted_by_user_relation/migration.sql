-- Add referential integrity to Invite.acceptedByUserId
-- The column was added in 20260521000002 as a bare String; this adds the FK constraint.
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
