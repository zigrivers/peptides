import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { isOrderingDisabled } from '@/lib/shared/featureFlags';
import { getManagedUsersWithAdherence } from '@/lib/admin/application/AdminService';
import type { InviteStatus, ManagedUserRow, PendingInviteRow } from '@/lib/admin/application/AdminService';
import { deactivateManagedUserAction, triggerPasswordResetAction, requestDeletionAction, cancelDeletionAction } from './_actions';
import { DeactivateUserButton } from './_components/DeactivateUserButton';
import { ResetPasswordButton } from './_components/ResetPasswordButton';
import { DeleteUserButton } from './_components/DeleteUserButton';
import { CancelDeletionButton } from './_components/CancelDeletionButton';

const BADGE_STYLES: Record<InviteStatus, string> = {
  ACTIVE: 'bg-green-50 text-green-700 border-green-200',
  DEACTIVATED: 'bg-gray-100 text-gray-500 border-gray-200',
  DELETION_PENDING: 'bg-orange-50 text-orange-700 border-orange-200',
  INVITED: 'bg-blue-50 text-blue-700 border-blue-200',
  INVITE_EXPIRED: 'bg-red-50 text-red-700 border-red-200',
};

const BADGE_LABELS: Record<InviteStatus, string> = {
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
  DELETION_PENDING: 'Deletion Pending',
  INVITED: 'Invited',
  INVITE_EXPIRED: 'Invite Expired',
};

function AdherenceBar({ result, label }: { result: { logged: number; total: number; percent: number }; label: string }) {
  const pct = Math.round(result.percent);
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <span className="font-medium text-gray-700">{result.total === 0 ? '—' : `${pct}%`}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-indigo-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {result.total > 0 && (
        <p className="text-xs text-gray-400 mt-0.5">{result.logged}/{result.total} doses</p>
      )}
    </div>
  );
}

function InviteBadge({ status, expiresAt }: { status: InviteStatus; expiresAt?: Date | null }) {
  const label =
    status === 'INVITED' && expiresAt
      ? `Invited (expires ${expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })})`
      : BADGE_LABELS[status];
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 border font-medium whitespace-nowrap ${BADGE_STYLES[status]}`}>
      {label}
    </span>
  );
}

function ManagedUserCard({ user }: { user: ManagedUserRow }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white px-4 py-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900 text-sm">{user.name ?? user.email}</p>
          {user.name && <p className="text-xs text-gray-400">{user.email}</p>}
        </div>
        <InviteBadge status={user.inviteStatus} expiresAt={user.inviteExpiresAt} />
      </div>
      <div className="space-y-2">
        <AdherenceBar result={user.adherence7Day} label="7-day adherence" />
        <AdherenceBar result={user.adherence30Day} label="30-day adherence" />
      </div>
      {user.inviteStatus === 'ACTIVE' && (
        <div className="flex items-center justify-between pt-1">
          <Link href={`/admin/users/${user.id}`} className="text-xs text-indigo-600 hover:underline">
            View dose history →
          </Link>
          <div className="flex gap-3">
            <ResetPasswordButton action={triggerPasswordResetAction.bind(null, user.id)} />
            <DeactivateUserButton action={deactivateManagedUserAction.bind(null, user.id)} />
          </div>
        </div>
      )}
      {user.inviteStatus === 'DEACTIVATED' && (
        <div className="flex items-center justify-end pt-1">
          <DeleteUserButton action={requestDeletionAction.bind(null, user.id)} userEmail={user.email} />
        </div>
      )}
      {user.inviteStatus === 'DELETION_PENDING' && (
        <div className="flex items-center justify-end pt-1">
          <CancelDeletionButton action={cancelDeletionAction.bind(null, user.id)} />
        </div>
      )}
    </li>
  );
}

function PendingInviteCard({ invite }: { invite: PendingInviteRow }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-700">{invite.email}</p>
        <InviteBadge status={invite.inviteStatus} expiresAt={invite.inviteExpiresAt} />
      </div>
    </li>
  );
}

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role === 'MANAGED_USER') redirect('/dashboard?error=forbidden');

  const { activeUsers, pendingInvites } = await getManagedUsersWithAdherence(session.user.id);
  const activeCount = activeUsers.filter((u) => u.inviteStatus === 'ACTIVE').length;
  const total = activeUsers.length + pendingInvites.length;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Managed Users</h1>
        <p className="text-sm text-gray-500 mt-1">
          {total === 0
            ? 'No managed users yet. Invite someone to get started.'
            : `${activeCount} active · ${pendingInvites.length} pending invite${pendingInvites.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {activeUsers.length > 0 && (
        <ul className="space-y-3">
          {activeUsers.map((u) => (
            <ManagedUserCard key={u.id} user={u} />
          ))}
        </ul>
      )}

      {pendingInvites.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Pending Invites</h2>
          <ul className="space-y-3">
            {pendingInvites.map((inv) => (
              <PendingInviteCard key={inv.id} invite={inv} />
            ))}
          </ul>
        </section>
      )}

      {total === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">
          No managed users yet.{' '}
          {!isOrderingDisabled() && (
            <>
              <Link href="/settings/telegram" className="text-indigo-600 hover:underline">
                Go to Settings
              </Link>{' '}
              to invite someone.
            </>
          )}
        </p>
      )}
    </main>
  );
}
