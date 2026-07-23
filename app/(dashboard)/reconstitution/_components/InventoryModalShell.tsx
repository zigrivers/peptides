'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type InventoryModalShellProps = {
  children: ReactNode;
  /** Extra classes on the fixed positioning root (e.g. overflow-y-auto). */
  className?: string;
};

/**
 * Shared Inventory modal portal shell.
 *
 * Root cause of Chrome backdrop flicker: the previous full-screen layer combined
 * `backdrop-filter` (backdrop-blur-*) with an opacity enter animation
 * (`animate-fade-in`) over inventory UI that also uses backdrop-blur. Chrome
 * intermittently recomposites those filter layers and the mask appears to flash
 * on/off. Nested blur (scrim + glass panel) makes it worse under live form
 * re-renders.
 *
 * Fix: keep a stable, non-filter, non-animated scrim for the open lifetime;
 * glass/blur stays on the dialog panel only.
 */
export function InventoryModalShell({ children, className = '' }: InventoryModalShellProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return createPortal(
    <div
      className={['fixed inset-0 z-50 flex items-center justify-center p-4', className]
        .filter(Boolean)
        .join(' ')}
      data-inventory-modal-shell=""
    >
      {/* Scrim: solid opacity only — no backdrop-filter, no enter animation. */}
      <div
        className="absolute inset-0 bg-background/80"
        aria-hidden="true"
        data-inventory-modal-scrim=""
      />
      <div className="relative z-10 flex w-full items-center justify-center">{children}</div>
    </div>,
    document.body
  );
}
