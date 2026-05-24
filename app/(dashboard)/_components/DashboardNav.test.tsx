import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DashboardNav } from './DashboardNav';

// Mock next/navigation's usePathname to return a fixed path for layout rendering
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

describe('DashboardNav Component', () => {
  it('renders standard navigation and includes ordering link when enabled', () => {
    const html = renderToString(<DashboardNav orderingEnabled={true} />);
    
    // Semantic accessibility navigation containers
    expect(html).toContain('aria-label="Mobile Navigation"');
    expect(html).toContain('aria-label="Desktop Navigation"');
    
    // Core routes
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/tracker"');
    expect(html).toContain('href="/reconstitution"');
    expect(html).toContain('href="/reference"');
    expect(html).toContain('href="/settings"');
    
    // Ordering route
    expect(html).toContain('href="/ordering"');
  });

  it('excludes ordering link when disabled', () => {
    const html = renderToString(<DashboardNav orderingEnabled={false} />);
    
    // Core routes present
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/tracker"');
    expect(html).toContain('href="/reconstitution"');
    expect(html).toContain('href="/reference"');
    expect(html).toContain('href="/settings"');
    
    // Ordering route absent
    expect(html).not.toContain('href="/ordering"');
  });
});
