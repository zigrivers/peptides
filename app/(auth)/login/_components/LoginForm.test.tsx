// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from './LoginForm';

vi.stubGlobal('React', React);

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}));

vi.mock('@/app/actions/auth/login', () => ({
  loginAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe('LoginForm', () => {
  it('hides the Google sign-in action when Google OAuth is not configured', () => {
    render(<LoginForm googleEnabled={false} />);

    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
  });
});
