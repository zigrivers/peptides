const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-teal-100 text-teal-700',
  PAYMENT_SENT: 'bg-orange-100 text-orange-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  STALE: 'bg-amber-100 text-amber-700',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  CONFIRMED: 'Confirmed',
  PAYMENT_SENT: 'Payment Sent',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
  STALE: 'Stale',
};

export function OrderStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
