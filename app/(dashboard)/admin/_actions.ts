'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { deactivateManagedUser, triggerManagedUserPasswordReset } from '@/lib/admin/application/AdminService';

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
