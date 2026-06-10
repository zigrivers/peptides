// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductList } from './ProductList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/app/actions/ordering/vendor-product', () => ({
  archiveVendorProductAction: vi.fn(),
  updateVendorProductAction: vi.fn(),
}));

describe('ProductList', () => {
  it('renders product row actions as touch-sized controls', () => {
    render(
      <ProductList
        vendorId="vendor-1"
        products={[
          {
            id: 'product-1',
            vendorId: 'vendor-1',
            compoundId: 'compound-1',
            name: 'BPC-157 5mg vial',
            priceUsd: '35.00',
            inStock: true,
            form: 'LYOPHILIZED_POWDER',
            vialSizeMg: '5',
          },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Edit' }).className).toContain('min-h-9');
    expect(screen.getByRole('button', { name: 'Archive' }).className).toContain('min-h-9');
  });
});
