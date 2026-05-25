'use client';

import { useState, useEffect, useRef } from 'react';

export function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  async function handleCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(address);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed — permissions denied or restricted environment
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-primary hover:underline"
    >
      {copied ? 'Copied!' : 'Copy address'}
    </button>
  );
}
