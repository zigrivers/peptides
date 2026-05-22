export type OrderStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'PAYMENT_SENT' | 'RECEIVED' | 'CANCELLED' | 'STALE';
export type SendMethod = 'AUTOMATED' | 'MANUAL_FALLBACK';
export const ITEM_FORMS = ['LYOPHILIZED_POWDER', 'SOLUTION'] as const;
export type ItemForm = (typeof ITEM_FORMS)[number];

export interface OrderLineItemInput {
  compoundId: string;
  compoundName?: string;
  form: ItemForm;
  vialSizeMg: string;
  quantity: number;
  productId?: string;
  unitPrice?: string;
  unitCurrency?: string;
}

export type VendorStatus = 'ACTIVE' | 'DISABLED';

export const VENDOR_CURRENCIES = ['USDT', 'BTC', 'ETH', 'USD', 'Other'] as const;
export type VendorCurrency = (typeof VENDOR_CURRENCIES)[number];

export interface Vendor {
  id: string;
  userId: string;
  name: string;
  telegramUsername: string;
  messageTemplate: string | null;
  preferredCurrency: string;
  status: VendorStatus;
  createdAt: Date;
}

export interface VendorProduct {
  id: string;
  vendorId: string;
  compoundId: string;
  name: string;
  priceUsd: string;
  inStock: boolean;
  form?: string | null;
  vialSizeMg?: string | null;
}
