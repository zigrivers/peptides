// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('React', React);

const h = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetManagedUsersWithAdherence: vi.fn(),
  mockRedirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => h.mockRedirect(url),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  auth: () => h.mockAuth(),
}));

vi.mock('@/lib/shared/featureFlags', () => ({
  isOrderingDisabled: () => false,
}));

vi.mock('@/lib/admin/application/AdminService', () => ({
  getManagedUsersWithAdherence: (...args: unknown[]) => h.mockGetManagedUsersWithAdherence(...args),
}));

vi.mock('./_actions', () => ({
  cancelDeletionAction: vi.fn(),
  deactivateManagedUserAction: vi.fn(),
  requestDeletionAction: vi.fn(),
  triggerPasswordResetAction: vi.fn(),
}));

vi.mock('./_components/InviteUserForm', () => ({
  InviteUserForm: () => <div>Invite Managed User</div>,
}));

vi.mock('./_components/DeactivateUserButton', () => ({
  DeactivateUserButton: () => null,
}));

vi.mock('./_components/ResetPasswordButton', () => ({
  ResetPasswordButton: () => null,
}));

vi.mock('./_components/DeleteUserButton', () => ({
  DeleteUserButton: () => null,
}));

vi.mock('./_components/CancelDeletionButton', () => ({
  CancelDeletionButton: () => null,
}));

import AdminPage from './page';

beforeEach(() => {
  h.mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'POWER_USER' } });
  h.mockGetManagedUsersWithAdherence.mockResolvedValue({ activeUsers: [], pendingInvites: [] });
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('AdminPage', () => {
  it('keeps the empty-state invitation guidance on the admin page', async () => {
    render(await AdminPage());

    expect(screen.getByText(/use the invite form above to send your first registration link/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /go to settings/i })).toBeNull();
  });
});
