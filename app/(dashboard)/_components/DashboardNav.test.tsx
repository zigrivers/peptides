import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DashboardNav } from './DashboardNav';

let mockPathname = '/dashboard';

// Mock next/navigation for router and pathname
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe('DashboardNav Component', () => {
  it('renders standard navigation and includes ordering link when enabled', () => {
    mockPathname = '/dashboard';
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
    mockPathname = '/dashboard';
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

  it('renders an About nav item linking to /about', () => {
    mockPathname = '/dashboard';
    const html = renderToString(<DashboardNav orderingEnabled={false} />);
    expect(html).toContain('href="/about"');
    expect(html).toContain('About');
  });

  it('correctly maps active nav states for tracker vs regimen', () => {
    const isLinkActive = (html: string, href: string) => {
      const chunks = html.split('<a ');
      // Look at all chunks containing the href to find mobile or desktop links
      const targetChunks = chunks.filter(c => c.includes(`href="${href}"`));
      if (targetChunks.length === 0) return false;
      // Active if any target link matches active styling classes
      return targetChunks.some(c => c.includes('text-primary') || c.includes('bg-primary/10'));
    };

    // 1. When on /tracker, Tracker should be active and Regimen inactive
    mockPathname = '/tracker';
    let html = renderToString(<DashboardNav orderingEnabled={true} />);
    expect(isLinkActive(html, '/tracker')).toBe(true);
    expect(isLinkActive(html, '/regimen')).toBe(false);

    // 2. When on /tracker/cycles, Tracker should be active and Regimen inactive
    mockPathname = '/tracker/cycles';
    html = renderToString(<DashboardNav orderingEnabled={true} />);
    expect(isLinkActive(html, '/tracker')).toBe(true);
    expect(isLinkActive(html, '/regimen')).toBe(false);

    // 3. When on /tracker/outcomes, Tracker should be active and Regimen inactive
    mockPathname = '/tracker/outcomes';
    html = renderToString(<DashboardNav orderingEnabled={true} />);
    expect(isLinkActive(html, '/tracker')).toBe(true);
    expect(isLinkActive(html, '/regimen')).toBe(false);

    // 4. When on /tracker/protocols, Tracker should be INACTIVE and Regimen ACTIVE
    mockPathname = '/tracker/protocols';
    html = renderToString(<DashboardNav orderingEnabled={true} />);
    expect(isLinkActive(html, '/tracker')).toBe(false);
    expect(isLinkActive(html, '/regimen')).toBe(true);

    // 5. When on /tracker/protocols/new, Tracker should be INACTIVE and Regimen ACTIVE
    mockPathname = '/tracker/protocols/new';
    html = renderToString(<DashboardNav orderingEnabled={true} />);
    expect(isLinkActive(html, '/tracker')).toBe(false);
    expect(isLinkActive(html, '/regimen')).toBe(true);

    // 6. When on /tracker/protocols/123/edit, Tracker should be INACTIVE and Regimen ACTIVE
    mockPathname = '/tracker/protocols/123/edit';
    html = renderToString(<DashboardNav orderingEnabled={true} />);
    expect(isLinkActive(html, '/tracker')).toBe(false);
    expect(isLinkActive(html, '/regimen')).toBe(true);

    // 7. When on /regimen, Tracker should be INACTIVE and Regimen ACTIVE
    mockPathname = '/regimen';
    html = renderToString(<DashboardNav orderingEnabled={true} />);
    expect(isLinkActive(html, '/tracker')).toBe(false);
    expect(isLinkActive(html, '/regimen')).toBe(true);
  });
});

