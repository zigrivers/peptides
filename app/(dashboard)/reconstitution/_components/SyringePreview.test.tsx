// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { SyringePreview } from './SyringePreview';

describe('SyringePreview', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders standard syringe correctly with unit value', () => {
    render(<SyringePreview units={25.5} warnings={[]} />);
    
    // Check if the label displays the unit value
    expect(screen.getByText('25.5 U')).toBeDefined();

    // Check SVG wrapper has the correct accessibility attributes
    const svg = screen.getByRole('img');
    expect(svg).toBeDefined();
    expect(svg.getAttribute('aria-label')).toBe('Visual syringe showing 25.5 units filled.');
  });

  it('uses primary theme classes for safe level (no warnings)', () => {
    const { container } = render(<SyringePreview units={10} warnings={[]} />);
    const rects = container.querySelectorAll('rect');
    const fluidRect = Array.from(rects).find(r => r.getAttribute('class')?.includes('fill-primary'));
    
    expect(fluidRect).toBeDefined();
    const className = fluidRect?.getAttribute('class') || '';
    expect(className).toContain('fill-primary');
    expect(className).toContain('stroke-primary');
  });

  it('uses warning theme classes when warning occurs', () => {
    const { container } = render(<SyringePreview units={10} warnings={['HIGH_VOLUME']} />);
    const rects = container.querySelectorAll('rect');
    const fluidRect = Array.from(rects).find(r => r.getAttribute('class')?.includes('fill-warning'));
    
    expect(fluidRect).toBeDefined();
    const className = fluidRect?.getAttribute('class') || '';
    expect(className).toContain('fill-warning');
    expect(className).toContain('stroke-warning');
  });

  it('uses destructive theme classes when capacity is exceeded', () => {
    const { container } = render(<SyringePreview units={10} warnings={['EXCEEDS_VIAL_CAPACITY']} />);
    const rects = container.querySelectorAll('rect');
    const fluidRect = Array.from(rects).find(r => r.getAttribute('class')?.includes('fill-destructive'));
    
    expect(fluidRect).toBeDefined();
    const className = fluidRect?.getAttribute('class') || '';
    expect(className).toContain('fill-destructive');
    expect(className).toContain('stroke-destructive');
  });

  it('caps fluid level percentage between 0 and 100', () => {
    // When units are 120 (above 100), fluid height should be 180 (barrel height)
    // Exceeding 100 units triggers the destructive warning color theme
    const { container: containerHigh } = render(<SyringePreview units={120} warnings={[]} />);
    const rectsHigh = containerHigh.querySelectorAll('rect');
    const fluidRectHigh = Array.from(rectsHigh).find(r => r.getAttribute('class')?.includes('fill-destructive'));
    expect(fluidRectHigh).toBeDefined();
    expect(fluidRectHigh?.getAttribute('height')).toBe('180');

    // When units are negative, fluid height should be 0 (clamped to 0, meaning fluid rect shouldn't render)
    const { container: containerLow } = render(<SyringePreview units={-10} warnings={[]} />);
    const rectsLow = containerLow.querySelectorAll('rect');
    const fluidRectLow = Array.from(rectsLow).find(r => r.getAttribute('class')?.includes('fill-primary'));
    expect(fluidRectLow).toBeUndefined();
  });

  it('supports alternative U-100 syringe capacities (e.g. 0.5 mL = 50 U limit)', () => {
    const { container } = render(<SyringePreview units={25} warnings={[]} syringeStandard="U100" syringeSize="0.5" />);
    // Under 50 U limit, 25 units is exactly 50% capacity (height = 90)
    const rects = container.querySelectorAll('rect');
    const fluidRect = Array.from(rects).find(r => r.getAttribute('class')?.includes('fill-primary'));
    expect(fluidRect).toBeDefined();
    expect(fluidRect?.getAttribute('height')).toBe('90');
    // Verify maximum capacity warnings is not present
    const warningText = screen.queryByText(/max 50 U capacity/);
    expect(warningText).toBeNull();
  });

  it('supports U-40 syringe standard and capacities (e.g. 1.0 mL = 40 U limit)', () => {
    const { container } = render(<SyringePreview units={20} warnings={[]} syringeStandard="U40" syringeSize="1.0" />);
    // Under 40 U limit, 20 units is exactly 50% capacity (height = 90)
    const rects = container.querySelectorAll('rect');
    const fluidRect = Array.from(rects).find(r => r.getAttribute('class')?.includes('fill-primary'));
    expect(fluidRect).toBeDefined();
    expect(fluidRect?.getAttribute('height')).toBe('90');
  });

  it('displays a warning when units exceed standard/size capacity', () => {
    render(<SyringePreview units={15} warnings={[]} syringeStandard="U40" syringeSize="0.3" />);
    // U40 + 0.3 mL has 12 U limit. 15 units exceeds this.
    expect(screen.getByText(/max 12 U capacity/)).toBeDefined();
  });
});
