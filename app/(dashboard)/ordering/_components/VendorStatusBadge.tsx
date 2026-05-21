interface Props {
  status: string;
}

export function VendorStatusBadge({ status }: Props) {
  return (
    <span
      className={`text-xs rounded-full px-2 py-0.5 font-medium ${
        status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {status === 'ACTIVE' ? 'Active' : 'Disabled'}
    </span>
  );
}
