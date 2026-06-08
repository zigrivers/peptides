// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompoundStorageStabilityGuide } from './CompoundStorageStabilityGuide';

describe('CompoundStorageStabilityGuide Component', () => {
  it('renders standard peptide cold chain information correctly', () => {
    const { container } = render(
      <CompoundStorageStabilityGuide
        compoundName="BPC-157"
        fridgeShelfLifeMonths={12}
        freezerShelfLifeMonths={24}
        reconstitutedShelfLifeDays={14}
      />
    );

    // Header exists
    const header = container.querySelector('#storage-stability-header');
    expect(header).toBeTruthy();
    expect(header?.textContent).toContain('Storage & Stability Guide');

    // Cold chain indicators should be visible
    expect(container.textContent).toContain('Freezer (-20°C)');
    expect(container.textContent).toContain('Refrigerator (2°C to 8°C)');
    expect(container.textContent).toContain('Discard After 14 Days');
    expect(container.textContent).toContain('Peptide Cold-Chain Advisory:');
    expect(container.textContent).not.toContain('Cold Storage Prohibited');
  });

  it('renders room-temperature specific alerts and guidelines correctly', () => {
    const { container } = render(
      <CompoundStorageStabilityGuide
        compoundName="Testosterone Cypionate"
        fridgeShelfLifeMonths={null}
        freezerShelfLifeMonths={null}
        reconstitutedShelfLifeDays={28}
      />
    );

    // Room-temp specific tags and warnings should be visible
    expect(container.textContent).toContain('Room Temp (20°C to 25°C)');
    expect(container.textContent).toContain('Cold Storage Prohibited');
    expect(container.textContent).toContain('Discard After 28 Days');
    expect(container.textContent).toContain('Testosterone Storage Advisory:');
    expect(container.textContent).toContain('Storing oil-based solutions in the refrigerator or freezer causes the compound to crash');
    expect(container.textContent).not.toContain('Freezer (-20°C)');
  });
});
