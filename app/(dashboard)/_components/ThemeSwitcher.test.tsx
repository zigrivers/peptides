// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ThemeSwitcher } from './ThemeSwitcher';

describe('ThemeSwitcher Component', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            theme: 'dark',
            accentColor: 'emerald',
            personalizationVersion: 2,
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', mockFetch);

    // Set initial DOM elements
    document.documentElement.setAttribute('data-theme', 'system');
    document.documentElement.setAttribute('data-accent', 'indigo');
    document.documentElement.setAttribute('data-personalization-version', '1');
    document.cookie = '';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-accent');
    document.documentElement.removeAttribute('data-personalization-version');
    document.cookie = '';
  });

  it('renders switcher components correctly on mount', () => {
    render(<ThemeSwitcher />);
    
    expect(screen.getByLabelText('Light Theme')).toBeDefined();
    expect(screen.getByLabelText('Dark Theme')).toBeDefined();
    expect(screen.getByLabelText('System Theme')).toBeDefined();
    expect(screen.getByLabelText('Accent Indigo')).toBeDefined();
  });

  it('renders touch-sized controls for mobile use', () => {
    render(<ThemeSwitcher />);

    expect(screen.getByLabelText('Light Theme').className).toContain('min-h-9');
    expect(screen.getByLabelText('Dark Theme').className).toContain('min-h-9');
    expect(screen.getByLabelText('System Theme').className).toContain('min-h-9');
    expect(screen.getByLabelText('Accent Indigo').className).toContain('h-9');
    expect(screen.getByLabelText('Accent Indigo').className).toContain('w-9');
  });

  it('renders a compact popover variant for constrained mobile headers', () => {
    render(<ThemeSwitcher variant="popover" />);

    const trigger = screen.getByLabelText('Customize appearance');
    expect(trigger).toBeDefined();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Light Theme')).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Light Theme')).toBeDefined();
    expect(screen.getByLabelText('Accent Indigo')).toBeDefined();
  });

  it('synchronizes cookies with DOM attributes on mount', () => {
    render(<ThemeSwitcher />);
    expect(document.cookie).toContain('theme=system');
    expect(document.cookie).toContain('accent=indigo');
  });

  it('updates local state, DOM attributes, and cookies instantly on click, and debounces sync call', async () => {
    render(<ThemeSwitcher />);
    
    const darkBtn = screen.getByLabelText('Dark Theme');
    fireEvent.click(darkBtn);

    // Instant update to DOM and cookies
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.cookie).toContain('theme=dark');

    // fetch shouldn't be called yet
    expect(mockFetch).not.toHaveBeenCalled();

    // Fast-forward time to trigger debounce
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/account/personalization',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          theme: 'dark',
          accentColor: 'indigo',
          clientVersion: 2,
        }),
      })
    );
  });

  it('reconciles state with higher version from server response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          theme: 'dark',
          accentColor: 'emerald',
          personalizationVersion: 3,
        }),
    } as Response);

    render(<ThemeSwitcher />);

    const darkBtn = screen.getByLabelText('Dark Theme');
    fireEvent.click(darkBtn);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Should reconcile accent to emerald because server returned personalizationVersion: 3 (higher than client's 2)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-accent')).toBe('emerald');
    expect(document.cookie).toContain('accent=emerald');
  });

  it('flushes pending changes on unmount via keepalive', () => {
    const { unmount } = render(<ThemeSwitcher />);

    const darkBtn = screen.getByLabelText('Dark Theme');
    fireEvent.click(darkBtn);

    expect(mockFetch).not.toHaveBeenCalled();

    unmount();

    // Should immediately trigger fetch with keepalive: true
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/account/personalization',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        body: JSON.stringify({
          theme: 'dark',
          accentColor: 'indigo',
          clientVersion: 2,
        }),
      })
    );
  });

  it('does not sync on unmount when preferences have not changed', () => {
    const { unmount } = render(<ThemeSwitcher />);

    unmount();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not log expected keepalive aborts during navigation', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<ThemeSwitcher />);

    fireEvent.click(screen.getByLabelText('Dark Theme'));
    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
