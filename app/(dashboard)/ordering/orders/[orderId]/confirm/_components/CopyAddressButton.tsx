'use client';

import { useState } from 'react';

export function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-indigo-600 hover:underline"
    >
      {copied ? 'Copied!' : 'Copy address'}
    </button>
  );
}
