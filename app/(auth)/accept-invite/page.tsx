import Link from 'next/link';
import { InviteRepo } from '@/lib/auth/infrastructure/InviteRepo';
import { InviteToken } from '@/lib/auth/domain/InviteToken';
import { acceptInviteAction } from '@/app/actions/auth/accept-invite';
import { AcceptInviteForm } from './_components/AcceptInviteForm';

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Public route — gated as PUBLIC_ROUTES in middleware. Users land here from
 * an invite email link: /accept-invite?token=<raw-token>. The page validates
 * the token via the approved InviteRepo boundary, looks up the invite, and
 * renders the acceptance form (which shows the consent copy + name/password
 * inputs). On submit, the server action creates the managed-user account and
 * marks the invite ACCEPTED.
 *
 * This is the Phase 2 Legal Gate item-1 implementation (Task 1.6c).
 */
export default async function AcceptInvitePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawToken = params.token?.toString().trim() ?? '';

  if (!rawToken) {
    return <InvalidInvite reason="missing" />;
  }

  const tokenHash = await InviteToken.hash(rawToken);
  const invite = await InviteRepo.findByTokenHashWithInviter(tokenHash);

  if (!invite) return <InvalidInvite reason="not_found" />;
  if (invite.status === 'ACCEPTED') return <InvalidInvite reason="used" />;
  if (invite.status === 'REVOKED') return <InvalidInvite reason="revoked" />;
  if (invite.expiresAt <= new Date()) return <InvalidInvite reason="expired" />;
  if (invite.status !== 'PENDING') return <InvalidInvite reason="not_found" />;

  const inviterLabel = invite.powerUser?.name ?? invite.powerUser?.email ?? 'Your administrator';

  return (
    <main className="max-w-md mx-auto px-4 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Accept invitation</h1>
        <p className="text-sm text-gray-500 mt-1">
          {inviterLabel} invited you to join Peptides as a managed user.
        </p>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6">
        <p className="text-sm text-slate-800 dark:text-slate-200">
          <strong>What this means:</strong> {inviterLabel} configures your protocols and can view
          your adherence data. You can request a data export or account deletion at any time.
          Submitting this form confirms you agree to this arrangement.
        </p>
      </div>

      <AcceptInviteForm
        action={acceptInviteAction.bind(null, rawToken)}
        email={invite.email}
      />

      <p className="text-xs text-gray-500 mt-6 text-center">
        Already accepted?{' '}
        <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
      </p>
    </main>
  );
}

/**
 * Distinct messages per failure reason are intentional for UX clarity. The
 * /accept-invite endpoint is reached only by users who already hold a raw
 * token (32 bytes of entropy from `InviteToken.generate`); the value of telling
 * an honest user "this expired, ask for a new one" outweighs the negligible
 * enumeration risk for an attacker who already has a valid token in hand.
 */
function InvalidInvite({
  reason,
}: {
  reason: 'missing' | 'not_found' | 'used' | 'revoked' | 'expired';
}) {
  const messages = {
    missing: 'This invitation link is missing its token.',
    not_found: 'This invitation link is not valid.',
    used: 'This invitation has already been used.',
    revoked: 'This invitation has been revoked.',
    expired: 'This invitation has expired.',
  };
  return (
    <main className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Invitation no longer valid</h1>
      <p className="text-sm text-gray-600 mb-6">{messages[reason]}</p>
      {reason === 'used' && (
        <p className="text-sm text-gray-600 mb-6">
          If this is your account, please <Link href="/login" className="text-primary hover:underline font-medium">sign in</Link> instead.
        </p>
      )}
      {reason === 'expired' && (
        <p className="text-sm text-gray-600 mb-6">
          Ask your administrator to send a new invitation.
        </p>
      )}
      <Link href="/login" className="text-sm text-primary hover:underline font-medium">
        ← Back to sign in
      </Link>
    </main>
  );
}

// Mark this page as dynamic — token lookup hits the DB and must not be statically prerendered.
export const dynamic = 'force-dynamic';
