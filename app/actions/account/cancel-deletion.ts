'use server';

import { revalidatePath } from 'next/cache';
import { auth, signOut } from '@/lib/auth';
import { cancelSelfDeletion } from '@/lib/auth/application/scheduleAccountDeletion';

export interface CancelDeletionState {
  error?: string;
  success?: string;
}

export async function cancelDeletionAction(
  _prev: CancelDeletionState | null,
  _formData: FormData
): Promise<CancelDeletionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Please sign in again.' };
  try {
    await cancelSelfDeletion(session.user.id);
    revalidatePath('/settings');
    revalidatePath('/dashboard');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg === 'no_pending_deletion') {
      return { error: 'There is no pending deletion to cancel.' };
    }
    return { error: 'Could not cancel the deletion. Please try again.' };
  }
  // Sign out so the JWT (which still carries status=DELETION_PENDING) is
  // replaced. After re-authentication, middleware sees status=ACTIVE and
  // unblocks the full app. Without this, the user's stale JWT would keep
  // redirecting them to /settings even though the DB now reflects ACTIVE.
  await signOut({ redirectTo: '/login?deletionCancelled=1' });
  // Unreachable — signOut redirects. Returning to satisfy the type contract.
  return { success: 'Account deletion cancelled. Your account is active.' };
}
