import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ConfettiCanvas } from './ConfettiCanvas';

describe('ConfettiCanvas', () => {
  it('renders a canvas element with fixed position and pointer-events-none styling', () => {
    const html = renderToString(<ConfettiCanvas />);

    expect(html).toContain('<canvas');
    expect(html).toContain('class="fixed inset-0 pointer-events-none z-50 w-full h-full"');
    expect(html).toContain('style="mix-blend-mode:normal"');
  });
});
