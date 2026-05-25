'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { createDraftOrderAction, getVendorProductsAction } from '@/app/actions/ordering/order';

interface Vendor {
  id: string;
  name: string;
  preferredCurrency: string;
  telegramUsername: string;
}

interface Suggestion {
  compoundId: string;
  compoundName: string;
  formCategory: 'Injectable' | 'Non-Injectable';
  dailyRateMg: string;
  totalRemainingMg: string;
  daysUntilDepletion: number;
  isDefaultConcentration: boolean;
}

interface Product {
  id: string;
  vendorId: string;
  compoundId: string;
  name: string;
  priceUsd: string;
  inStock: boolean;
  form?: string | null;
  vialSizeMg?: string | null;
}

interface CartItem {
  compoundId: string;
  compoundName: string;
  form: 'LYOPHILIZED_POWDER' | 'SOLUTION';
  vialSizeMg: string;
  quantity: number;
  productId?: string;
  unitPrice?: string;
  unitCurrency?: string;
}

interface Props {
  vendors: Vendor[];
  suggestions: Suggestion[];
  compounds: Array<{ id: string; name: string }>;
}

export function parsePackSize(productName: string): number {
  const match1 = productName.match(/(?<!-)\b(\d+)[-\s]*(?:x|pack|vials)\b/i);
  if (match1) return parseInt(match1[1], 10);
  const match2 = productName.match(/\b(?:pack of)\s*(\d+)\b/i);
  if (match2) return parseInt(match2[1], 10);
  return 1;
}

export function getCompoundNameForProduct(
  product: Product,
  compounds: Array<{ id: string; name: string }>
): string {
  const directMatch = compounds.find((c) => c.id === product.compoundId);
  if (directMatch) return directMatch.name;

  const normalizedProduct = product.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sortedCompounds = [...compounds].sort((a, b) => b.name.length - a.name.length);
  for (const c of sortedCompounds) {
    const normalizedCompound = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedCompound && normalizedProduct.includes(normalizedCompound)) {
      return c.name;
    }
  }

  const noiseWords = new Set([
    '10x', '5x', '2x', '3x', 'twin', 'pack', 'vial', 'vials', 'mg', 'ml', 'mcg'
  ]);
  const tokens = product.name.split(/[\s_-]+/);
  for (const token of tokens) {
    const cleanToken = token.replace(/[^a-zA-Z0-9]/g, '');
    if (
      cleanToken &&
      !noiseWords.has(cleanToken.toLowerCase()) &&
      !/^\d+(?:mg|ml|mcg|x)?$/i.test(cleanToken)
    ) {
      console.warn(`[OrderBuilder] Compound substring match failed for product "${product.name}". Falling back to token "${cleanToken}".`);
      return token;
    }
  }

  console.warn(`[OrderBuilder] All compound matching heuristics failed for product "${product.name}". Falling back to first token.`);
  return product.name.split(' ')[0] || 'Unknown Compound';
}

export function OrderBuilderContainer({ vendors, suggestions, compounds }: Props) {
  const router = useRouter();
  
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Custom manual item inputs
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [manualCompoundId, setManualCompoundId] = useState<string>('');
  const [manualForm, setManualForm] = useState<'LYOPHILIZED_POWDER' | 'SOLUTION'>('LYOPHILIZED_POWDER');
  const [manualVialSizeMg, setManualVialSizeMg] = useState<string>('5.0');
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualPrice, setManualPrice] = useState<string>('20.00');

  // Load stable idempotency key on mount
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  // Fetch products when vendor changes
  useEffect(() => {
    if (!selectedVendorId) {
      setProducts([]);
      setCart([]);
      return;
    }

    async function loadProducts() {
      setLoadingProducts(true);
      setError(null);
      setCart([]); // Clear cart when switching vendor
      const res = await getVendorProductsAction(selectedVendorId);
      if (!res.ok) {
        setError(res.message || 'Failed to load catalog products.');
        setProducts([]);
      } else {
        setProducts(res.products || []);
      }
      setLoadingProducts(false);
    }

    loadProducts();
  }, [selectedVendorId]);

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);

  // Cart item merge resolver
  const addToCart = (item: CartItem) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (i) =>
          i.compoundId === item.compoundId &&
          i.form === item.form &&
          new Decimal(i.vialSizeMg).eq(new Decimal(item.vialSizeMg))
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        const existing = updated[existingIndex];

        let productId = existing.productId || item.productId;
        let unitPrice = existing.unitPrice || item.unitPrice;
        let unitCurrency = existing.unitCurrency || item.unitCurrency;

        // Deterministic Tie-Breaker (F-004)
        if (existing.productId && item.productId && existing.productId !== item.productId) {
          const existingPrice = new Decimal(existing.unitPrice || '0');
          const itemPrice = new Decimal(item.unitPrice || '0');
          if (itemPrice.lt(existingPrice)) {
            productId = item.productId;
            unitPrice = item.unitPrice;
            unitCurrency = item.unitCurrency;
          }
        }

        updated[existingIndex] = {
          ...existing,
          quantity: existing.quantity + item.quantity,
          productId,
          unitPrice,
          unitCurrency,
        };
        return updated;
      } else {
        return [...prev, item];
      }
    });
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index] = { ...updated[index], quantity: newQty };
      }
      return updated;
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Submit cart
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !selectedVendorId || submitting) return;

    setSubmitting(true);
    setError(null);

    const formattedItems = cart.map((item) => ({
      compoundId: item.compoundId,
      form: item.form,
      vialSizeMg: item.vialSizeMg,
      quantity: item.quantity,
      productId: item.productId || null,
      unitPrice: item.unitPrice || null,
      unitCurrency: item.unitCurrency || null,
    }));

    const res = await createDraftOrderAction({
      vendorId: selectedVendorId,
      items: formattedItems,
      idempotencyKey,
    });

    if (!res.ok) {
      setError(res.message || 'Failed to submit order draft.');
      setSubmitting(false);
    } else {
      router.push(`/ordering/orders/${res.orderId}`);
    }
  };

  // Extract compounds from catalog to use as options in custom manual selector
  const compoundsInCatalog = Array.from(
    new Map(products.map((p) => [p.compoundId, getCompoundNameForProduct(p, compounds)])).entries()
  ).map(([id, name]) => ({ id, name }));

  // Helper to get suggestions mapped to vendor catalog products
  const mappedSuggestions = suggestions.map((s) => {
    const formToMatch = s.formCategory === 'Injectable' ? 'LYOPHILIZED_POWDER' : 'SOLUTION';
    
    // Find matching products in selected vendor's catalog and sort them
    const candidates = products.filter(
      (p) =>
        p.compoundId === s.compoundId &&
        (p.form === formToMatch || (s.formCategory === 'Injectable' && p.form === 'SOLUTION'))
    );

    // Sort by pack size ascending, then by vial size ascending to prefer smaller packs/individual vials
    candidates.sort((a, b) => {
      const packA = parsePackSize(a.name);
      const packB = parsePackSize(b.name);
      if (packA !== packB) return packA - packB;

      const sizeA = parseFloat(a.vialSizeMg || '0');
      const sizeB = parseFloat(b.vialSizeMg || '0');
      return sizeA - sizeB;
    });

    const matchedProduct = candidates[0];

    let calculatedQty = 2; // Default fallback safety stock quantity
    if (matchedProduct && matchedProduct.vialSizeMg) {
      const dailyRateMg = new Decimal(s.dailyRateMg);
      const vialSizeMg = new Decimal(matchedProduct.vialSizeMg);
      const packSize = parsePackSize(matchedProduct.name);
      const totalMgPerUnit = vialSizeMg.times(packSize);
      if (totalMgPerUnit.gt(0)) {
        calculatedQty = dailyRateMg.times(30).dividedBy(totalMgPerUnit).ceil().toNumber();
      }
    }

    return {
      ...s,
      matchedProduct,
      calculatedQty: calculatedQty > 0 ? calculatedQty : 1,
    };
  });

  // Filter suggestions to those having a matched product in this vendor's catalog
  const vendorSuggestions = selectedVendorId
    ? mappedSuggestions.filter((s) => s.matchedProduct !== undefined)
    : [];

  const cartSubtotal = cart.reduce((sum, item) => {
    const price = new Decimal(item.unitPrice || '0');
    return sum.plus(price.times(item.quantity));
  }, new Decimal(0));

  return (
    <div className="space-y-6 mt-4">
      {error && (
        <div role="alert" className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Step 1: Select Vendor */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <label htmlFor="vendor-select" className="block text-sm font-semibold text-foreground mb-2">
          1. Select Vendor
        </label>
        <select
          id="vendor-select"
          value={selectedVendorId}
          onChange={(e) => setSelectedVendorId(e.target.value)}
          className="w-full max-w-md h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none transition-all"
        >
          <option value="">-- Choose an active vendor --</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} (@{v.telegramUsername})
            </option>
          ))}
        </select>
      </section>

      {selectedVendorId && (
        <>
          {/* Step 2: Replenishment Suggestions */}
          {vendorSuggestions.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold text-foreground">
                2. Inventory Replenishment Suggestions
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compounds below are projected to deplete within 14 days based on active protocols.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {vendorSuggestions.map((s) => {
                  const product = s.matchedProduct!;
                  return (
                    <div
                      key={`${s.compoundId}:${s.formCategory}`}
                      className="flex flex-col justify-between p-4 rounded-lg border border-border bg-muted/20 hover:border-primary/30 transition-all space-y-3"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-foreground">
                            {s.compoundName} ({s.formCategory})
                          </span>
                          {s.isDefaultConcentration && (
                            <span
                              className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-bold cursor-help"
                              title="Estimated using a default concentration of 2.0 mg/mL. Please verify your required dosage amount."
                            >
                              i
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Remaining: <span className="font-mono">{s.totalRemainingMg} mg</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Depletes in:{' '}
                          <span className="font-semibold text-orange-600 dark:text-orange-400">
                            {s.daysUntilDepletion} days
                          </span>
                        </p>
                        <p className="text-xs text-primary/80 mt-2 font-medium">
                          Suggested: {product.name} × {s.calculatedQty} (30-day supply)
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          addToCart({
                            compoundId: s.compoundId,
                            compoundName: s.compoundName,
                            form: product.form === 'SOLUTION' ? 'SOLUTION' : 'LYOPHILIZED_POWDER',
                            vialSizeMg: product.vialSizeMg ? product.vialSizeMg.toString() : '5.0',
                            quantity: s.calculatedQty,
                            productId: product.id,
                            unitPrice: product.priceUsd,
                            unitCurrency: selectedVendor?.preferredCurrency || 'USD',
                          })
                        }
                        className="w-full text-center h-9 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 text-xs transition-colors"
                      >
                        Add Suggestion
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Step 3: Browse Catalog */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-foreground">3. Vendor Products</h2>
              <button
                type="button"
                onClick={() => setShowManualForm(!showManualForm)}
                className="text-xs text-primary hover:underline font-medium"
              >
                {showManualForm ? 'Hide Custom Form' : '+ Add Custom Line Item'}
              </button>
            </div>

            {/* Custom manual form */}
            {showManualForm && (
              <div className="p-4 rounded-lg border border-dashed border-border bg-muted/10 space-y-3 max-w-lg">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Add Custom Item
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="custom-compound" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                      Compound
                    </label>
                    <select
                      id="custom-compound"
                      value={manualCompoundId}
                      onChange={(e) => setManualCompoundId(e.target.value)}
                      className="w-full h-9 rounded border border-input bg-background text-xs px-2 outline-none"
                    >
                      <option value="">-- Select Compound --</option>
                      {compoundsInCatalog.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="custom-form" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                      Form
                    </label>
                    <select
                      id="custom-form"
                      value={manualForm}
                      onChange={(e) => setManualForm(e.target.value as 'LYOPHILIZED_POWDER' | 'SOLUTION')}
                      className="w-full h-9 rounded border border-input bg-background text-xs px-2 outline-none"
                    >
                      <option value="LYOPHILIZED_POWDER">Lyophilized Powder</option>
                      <option value="SOLUTION">Solution</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="custom-vial-size" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                      Vial Size (mg)
                    </label>
                    <input
                      id="custom-vial-size"
                      type="number"
                      step="0.1"
                      value={manualVialSizeMg}
                      onChange={(e) => setManualVialSizeMg(e.target.value)}
                      className="w-full h-9 rounded border border-input bg-background text-xs px-2 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-price" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                      Price (USD)
                    </label>
                    <input
                      id="custom-price"
                      type="number"
                      step="0.01"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      className="w-full h-9 rounded border border-input bg-background text-xs px-2 outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="flex gap-2 items-end pt-2">
                  <div className="w-24">
                    <label htmlFor="custom-quantity" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                      Quantity
                    </label>
                    <input
                      id="custom-quantity"
                      type="number"
                      min="1"
                      value={manualQty}
                      onChange={(e) => setManualQty(parseInt(e.target.value, 10) || 1)}
                      className="w-full h-9 rounded border border-input bg-background text-xs px-2 outline-none font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!manualCompoundId) return;
                      const matchedCompoundName =
                        compoundsInCatalog.find((c) => c.id === manualCompoundId)?.name || 'Custom';
                      addToCart({
                        compoundId: manualCompoundId,
                        compoundName: matchedCompoundName,
                        form: manualForm,
                        vialSizeMg: manualVialSizeMg,
                        quantity: manualQty,
                        unitPrice: manualPrice,
                        unitCurrency: selectedVendor?.preferredCurrency || 'USD',
                      });
                    }}
                    className="h-9 px-4 rounded bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 text-xs transition-colors"
                  >
                    Add custom item
                  </button>
                </div>
              </div>
            )}

            {loadingProducts ? (
              <p className="text-sm text-muted-foreground animate-pulse">Loading catalog products…</p>
            ) : products.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active products found in this vendor&apos;s catalog.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/20 hover:bg-muted/10 transition-all text-xs"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{p.name}</p>
                      <p className="text-muted-foreground mt-0.5">
                        ${p.priceUsd} {selectedVendor?.preferredCurrency}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        addToCart({
                          compoundId: p.compoundId,
                          compoundName: getCompoundNameForProduct(p, compounds),
                          form: p.form === 'SOLUTION' ? 'SOLUTION' : 'LYOPHILIZED_POWDER',
                          vialSizeMg: p.vialSizeMg ? p.vialSizeMg.toString() : '5.0',
                          quantity: 1,
                          productId: p.id,
                          unitPrice: p.priceUsd,
                          unitCurrency: selectedVendor?.preferredCurrency || 'USD',
                        })
                      }
                      className="px-3 h-8 rounded bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Step 4: Review Cart & Submit */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-foreground">4. Review Order Draft</h2>
            {cart.length === 0 ? (
              <p className="text-xs text-muted-foreground">Your cart is empty. Add catalog items or suggestions to proceed.</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="divide-y divide-border border-b border-border">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-3 text-xs">
                      <div>
                        <p className="font-semibold text-foreground">
                          {item.compoundName} (
                          {item.form === 'LYOPHILIZED_POWDER' ? 'Lyophilized' : 'Solution'})
                        </p>
                        <p className="text-muted-foreground mt-0.5">
                          Size: <span className="font-mono">{item.vialSizeMg} mg</span> · Price:{' '}
                          <span className="font-mono">
                            ${item.unitPrice} {item.unitCurrency}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center border border-border rounded">
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, -1)}
                            className="w-7 h-7 flex items-center justify-center font-bold text-muted-foreground hover:bg-muted transition-colors"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-mono font-semibold text-foreground">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, 1)}
                            className="w-7 h-7 flex items-center justify-center font-bold text-muted-foreground hover:bg-muted transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(idx)}
                          className="text-destructive hover:underline font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-semibold text-foreground">Total Cost:</span>
                  <span className="text-base font-black text-foreground font-mono">
                    ${cartSubtotal.toFixed(2)} {selectedVendor?.preferredCurrency}
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full md:w-auto px-6 h-11 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-lg shadow-primary/20 flex items-center justify-center"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                        Submitting Order Draft…
                      </span>
                    ) : (
                      'Submit Order Draft'
                    )}
                  </button>
                </div>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
