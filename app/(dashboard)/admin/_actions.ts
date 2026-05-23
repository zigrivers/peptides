'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import {
  deactivateManagedUser,
  triggerManagedUserPasswordReset,
  requestManagedUserDeletion,
  cancelManagedUserDeletion,
} from '@/lib/admin/application/AdminService';

export interface AdminActionResult {
  error?: string;
  warning?: string;
  activeProtocolCount?: number;
  success?: string;
}

export async function deactivateManagedUserAction(
  managedUserId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult | null> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };
  if (session.user.role === 'MANAGED_USER') return { error: 'Forbidden' };

  const confirmed = formData.get('confirmed') === 'true';
  try {
    const result = await deactivateManagedUser(session.user.id, managedUserId, confirmed);
    if (result.status === 'needs_confirmation') {
      return {
        warning: `This user has ${result.activeProtocolCount} active protocol${result.activeProtocolCount !== 1 ? 's' : ''}. Deactivating their account will prevent them from logging doses. Continue?`,
        activeProtocolCount: result.activeProtocolCount,
      };
    }
    revalidatePath('/admin', 'layout');
    return { success: 'User deactivated.' };
  } catch (err) {
    if (err instanceof Error && err.message === 'managed_user_not_found') {
      return { error: 'User not found.' };
    }
    return { error: 'Something went wrong.' };
  }
}

export async function triggerPasswordResetAction(
  managedUserId: string,
  _prevState: AdminActionResult | null,
  _formData: FormData
): Promise<AdminActionResult | null> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };
  if (session.user.role === 'MANAGED_USER') return { error: 'Forbidden' };

  try {
    await triggerManagedUserPasswordReset(session.user.id, managedUserId);
    return { success: 'Password reset email sent.' };
  } catch (err) {
    if (err instanceof Error && err.message === 'managed_user_not_found') {
      return { error: 'User not found.' };
    }
    return { error: 'Something went wrong.' };
  }
}

export async function requestDeletionAction(
  managedUserId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult | null> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };
  if (session.user.role === 'MANAGED_USER') return { error: 'Forbidden' };

  const immediate = formData.get('immediate') === 'true';
  const secondConfirm = formData.get('secondConfirm') === 'true';
  try {
    const result = await requestManagedUserDeletion(session.user.id, managedUserId, immediate, secondConfirm);
    if (result.status === 'needs_second_confirm') {
      return { warning: 'This will permanently delete all data. Are you sure? Click again to confirm.' };
    }
    if (result.status === 'scheduled') {
      const dateStr = result.scheduledFor!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      revalidatePath('/admin', 'layout');
      return { success: `Deletion scheduled for ${dateStr}. A data export has been emailed to you.` };
    }
    revalidatePath('/admin', 'layout');
    return { success: 'User deleted. A data export has been emailed to you.' };
  } catch (err) {
    if (err instanceof Error && err.message === 'managed_user_not_found') {
      return { error: 'User not found.' };
    }
    return { error: 'Something went wrong.' };
  }
}

export async function cancelDeletionAction(
  managedUserId: string,
  _prevState: AdminActionResult | null,
  _formData: FormData
): Promise<AdminActionResult | null> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };
  if (session.user.role === 'MANAGED_USER') return { error: 'Forbidden' };

  try {
    await cancelManagedUserDeletion(session.user.id, managedUserId);
    revalidatePath('/admin', 'layout');
    return { success: 'Deletion cancelled.' };
  } catch (err) {
    if (err instanceof Error && err.message === 'no_pending_deletion') {
      return { error: 'No pending deletion found.' };
    }
    if (err instanceof Error && err.message === 'managed_user_not_found') {
      return { error: 'User not found.' };
    }
    return { error: 'Something went wrong.' };
  }
}
