'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { type Theme, type AccentColor, SUPPORTED_ACCENTS } from '@/lib/shared/personalization';

function getEffectiveIsDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  }
  return false;
}

function syncThemeClass(theme: Theme) {
  if (typeof document === 'undefined') return;
  const isDark = getEffectiveIsDark(theme);
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [activeTheme, setActiveTheme] = useState<Theme>('system');
  const [activeAccent, setActiveAccent] = useState<AccentColor>('indigo');

  const versionRef = useRef<number>(1);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const didFlushRef = useRef(false);

  // Store variables in refs so the unmount cleanup can read latest values without stale closure
  const stateRef = useRef({ theme: activeTheme, accent: activeAccent });

  // Read cookies client-side helper
  const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  };

  // Safe client-side cookie setter helper
  const setCookie = (name: string, val: string) => {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${val}; path=/; max-age=31536000; Secure; SameSite=Lax`;
  };

  // Perform database sync via api
  const syncSettings = async (themeToSync: Theme, accentToSync: AccentColor, versionToSync: number, isKeepalive = false) => {
    try {
      const payload = {
        theme: themeToSync,
        accentColor: accentToSync,
        clientVersion: versionToSync,
      };

      const options: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      };

      if (isKeepalive) {
        options.keepalive = true;
      }

      const res = await fetch('/api/account/personalization', options);
      if (!res.ok) return;

      const data = await res.json();
      if (data && typeof data.personalizationVersion === 'number') {
        const returnedVersion = data.personalizationVersion;
        const returnedTheme = data.theme as Theme;
        const returnedAccent = data.accentColor as AccentColor;

        // Perform monotonic version recovery and state reconciliation
        versionRef.current = Math.max(versionRef.current, returnedVersion);

        if (returnedVersion >= versionRef.current) {
          // If server preference differs, reconcile local state and cookies
          if (returnedTheme !== stateRef.current.theme) {
            setActiveTheme(returnedTheme);
            document.documentElement.setAttribute('data-theme', returnedTheme);
            syncThemeClass(returnedTheme);
            setCookie('theme', returnedTheme);
          }
          if (returnedAccent !== stateRef.current.accent) {
            setActiveAccent(returnedAccent);
            document.documentElement.setAttribute('data-accent', returnedAccent);
            setCookie('accent', returnedAccent);
          }
        }
      }
    } catch (err) {
      console.error('[ThemeSwitcher sync error]:', err);
    }
  };

  // Schedule background database update
  const scheduleSync = (themeToSync: Theme, accentToSync: AccentColor) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      syncSettings(themeToSync, accentToSync, versionRef.current);
    }, 500);
  };

  useEffect(() => {
    setMounted(true);

    const domTheme = (document.documentElement.getAttribute('data-theme') || 'system') as Theme;
    const domAccent = (document.documentElement.getAttribute('data-accent') || 'indigo') as AccentColor;
    const domVersion = Number(document.documentElement.getAttribute('data-personalization-version') || 1);

    setActiveTheme(domTheme);
    setActiveAccent(domAccent);
    stateRef.current = { theme: domTheme, accent: domAccent };
    versionRef.current = domVersion;

    // Double check class synchronization on mount
    syncThemeClass(domTheme);

    // Cookie DOM synchronization (run once on mount to align cookie value to DB state without DB call)
    const currentThemeCookie = getCookie('theme');
    const currentAccentCookie = getCookie('accent');

    if (currentThemeCookie !== domTheme) {
      setCookie('theme', domTheme);
    }
    if (currentAccentCookie !== domAccent) {
      setCookie('accent', domAccent);
    }

    // System theme change listener
    let mediaQuery: MediaQueryList | null = null;
    let handleSystemThemeChange: (() => void) | null = null;

    if (typeof window !== 'undefined' && window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      handleSystemThemeChange = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'system';
        if (currentTheme === 'system') {
          syncThemeClass('system');
        }
      };
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleSystemThemeChange);
      } else {
        mediaQuery.addListener(handleSystemThemeChange);
      }
    }

    return () => {
      // Flush on unmount logic
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (mediaQuery && handleSystemThemeChange) {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleSystemThemeChange);
        } else {
          mediaQuery.removeListener(handleSystemThemeChange);
        }
      }

      if (!didFlushRef.current) {
        didFlushRef.current = true;
        // Immediate database update on unmount using latest values in stateRef
        const latestState = stateRef.current;
        syncSettings(latestState.theme, latestState.accent, versionRef.current, true);
      }
    };
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    stateRef.current.theme = newTheme;
    setActiveTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    
    syncThemeClass(newTheme);
    
    setCookie('theme', newTheme);
    versionRef.current += 1;
    scheduleSync(newTheme, stateRef.current.accent);
  };

  const handleAccentChange = (newAccent: AccentColor) => {
    stateRef.current.accent = newAccent;
    setActiveAccent(newAccent);
    document.documentElement.setAttribute('data-accent', newAccent);
    setCookie('accent', newAccent);
    versionRef.current += 1;
    scheduleSync(stateRef.current.theme, newAccent);
  };

  if (!mounted) {
    // Glassmorphic hydration skeleton placeholder to prevent flash of content
    return (
      <div className="flex flex-col gap-3 p-3 bg-white/40 dark:bg-card/40 backdrop-blur-md rounded-xl border border-border/50 animate-pulse w-full max-w-[240px] h-[98px]">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700"></div>
          <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700"></div>
          <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700"></div>
        </div>
      </div>
    );
  }

  // Accent color hex mappings for premium visual display dots
  const accentDetails: Record<AccentColor, { name: string; bgClass: string }> = {
    indigo: { name: 'Indigo', bgClass: 'bg-indigo-500 ring-indigo-500' },
    emerald: { name: 'Emerald', bgClass: 'bg-emerald-500 ring-emerald-500' },
    violet: { name: 'Violet', bgClass: 'bg-violet-500 ring-violet-500' },
    amber: { name: 'Amber', bgClass: 'bg-amber-500 ring-amber-500' },
    rose: { name: 'Rose', bgClass: 'bg-rose-500 ring-rose-500' },
    slate: { name: 'Slate', bgClass: 'bg-slate-500 ring-slate-500' },
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-white/70 dark:bg-card/60 backdrop-blur-md rounded-xl border border-border/80 shadow-sm w-full max-w-[240px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Theme</span>
        <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-border/50">
          <button
            onClick={() => handleThemeChange('light')}
            className={`p-1.5 rounded-md transition-all duration-150 ${
              activeTheme === 'light'
                ? 'bg-white dark:bg-card shadow-sm text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Light Theme"
            title="Light Theme"
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleThemeChange('dark')}
            className={`p-1.5 rounded-md transition-all duration-150 ${
              activeTheme === 'dark'
                ? 'bg-white dark:bg-card shadow-sm text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Dark Theme"
            title="Dark Theme"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleThemeChange('system')}
            className={`p-1.5 rounded-md transition-all duration-150 ${
              activeTheme === 'system'
                ? 'bg-white dark:bg-card shadow-sm text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="System Theme"
            title="System Theme"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Accent</span>
        <div className="flex gap-1.5">
          {SUPPORTED_ACCENTS.map((accent) => {
            const { name, bgClass } = accentDetails[accent];
            const isSelected = activeAccent === accent;
            return (
              <button
                key={accent}
                onClick={() => handleAccentChange(accent)}
                className={`w-3.5 h-3.5 rounded-full ${bgClass} transition-all duration-150 relative ${
                  isSelected ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-card ring-primary scale-110' : 'hover:scale-105'
                }`}
                aria-label={`Accent ${name}`}
                title={`Accent ${name}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
