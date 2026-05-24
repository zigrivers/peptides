'use client';

import { useActionState, useState, useEffect, useRef } from 'react';
import type { ScheduleDeletionState } from '@/app/actions/account/schedule-deletion';

interface Props {
  scheduleAction: (
    prev: ScheduleDeletionState | null,
    formData: FormData
  ) => Promise<ScheduleDeletionState>;
  immediateAction: (
    prev: ScheduleDeletionState | null,
    formData: FormData
  ) => Promise<ScheduleDeletionState>;
  userEmail: string;
}

type Mode = 'delayed' | 'immediate';

export function DeleteAccountSection({ scheduleAction, immediateAction, userEmail }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<Mode>('delayed');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  const [delayedState, delayedFormAction, delayedPending] = useActionState(scheduleAction, null);
  const [immediateState, immediateFormAction, immediatePending] = useActionState(immediateAction, null);

  const modalRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus trapping and escape key listener when open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]):not([type="hidden"]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // Focus the text input in step 1, or checkbox in step 2
    const timer = setTimeout(() => {
      if (modalRef.current) {
        if (step === 1) {
          const input = modalRef.current.querySelector('input[type="text"]') as HTMLElement;
          input?.focus();
        } else {
          const checkbox = modalRef.current.querySelector('input[type="checkbox"]') as HTMLElement;
          checkbox?.focus();
        }
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, step]);

  const openModal = () => {
    setIsOpen(true);
    setStep(1);
    setMode('delayed');
    setDeleteConfirmText('');
    setAcknowledged(false);
  };

  const isStep1SubmitDisabled = deleteConfirmText.trim().toUpperCase() !== 'DELETE';

  if (delayedState?.success || immediateState?.success) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-4 text-sm text-green-800 dark:text-green-400">
        {delayedState?.success ?? immediateState?.success}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-red-800/80 mb-4">
        Permanently delete your account, protocols, doses, vials, orders, and history. We&apos;ll email you a complete JSON export first.
      </p>
      <button
        type="button"
        onClick={openModal}
        className="rounded-md bg-red-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-red-700 transition-colors focus:ring-2 focus:ring-red-500 focus:outline-none"
      >
        Delete my account
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop Blur Overlay */}
          <div 
            className="fixed inset-0 bg-black/45 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsOpen(false)} 
          />

          {/* Modal Card container */}
          <div
            ref={modalRef}
            className="relative bg-white dark:bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 id="modal-title" className="text-lg font-bold text-gray-900 dark:text-foreground">
                {step === 1 ? 'Delete Account' : 'Final Confirmation'}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 rounded-md p-1 hover:bg-gray-100 dark:hover:bg-muted focus:ring-2 focus:ring-primary focus:outline-none"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {step === 1 ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-muted-foreground">
                  Permanently delete your account, protocols, doses, vials, orders, and history. We&apos;ll email you a complete JSON export first.
                </p>

                {/* Mode Select Radio Buttons */}
                <div className="space-y-2.5">
                  <span className="block text-sm font-semibold text-gray-700 dark:text-foreground">
                    When should we delete it?
                  </span>
                  
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-muted/30 transition-colors focus-within:ring-2 focus-within:ring-primary">
                      <input
                        type="radio"
                        name="deleteMode"
                        value="delayed"
                        checked={mode === 'delayed'}
                        onChange={() => setMode('delayed')}
                        className="mt-1 text-primary focus:ring-primary h-4 w-4 border-gray-300"
                      />
                      <div className="flex-1 text-sm">
                        <strong className="block text-gray-900 dark:text-foreground">Delay 48 hours (Recommended)</strong>
                        <span className="text-xs text-gray-500 dark:text-muted-foreground">Sign back in any time within the window to cancel.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/10 p-3 cursor-pointer hover:bg-red-50/20 transition-colors focus-within:ring-2 focus-within:ring-red-500">
                      <input
                        type="radio"
                        name="deleteMode"
                        value="immediate"
                        checked={mode === 'immediate'}
                        onChange={() => setMode('immediate')}
                        className="mt-1 text-red-600 focus:ring-red-500 h-4 w-4 border-gray-300"
                      />
                      <div className="flex-1 text-sm">
                        <strong className="block text-red-700 dark:text-red-400">Delete immediately</strong>
                        <span className="text-xs text-red-600/80 dark:text-red-300/80">Irreversible. Requires a second confirmation screen.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 5-Character "DELETE" text confirmation */}
                <div className="space-y-2">
                  <label htmlFor="confirm-delete-text" className="block text-sm font-medium text-gray-700 dark:text-foreground">
                    To proceed, please type <span className="font-mono font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-1 py-0.5 rounded">DELETE</span> below:
                  </label>
                  <input
                    id="confirm-delete-text"
                    type="text"
                    required
                    autoComplete="off"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 uppercase"
                  />
                </div>

                {delayedState?.error && (
                  <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {delayedState.error}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    Cancel
                  </button>

                  {mode === 'delayed' ? (
                    <form action={delayedFormAction}>
                      <input type="hidden" name="confirmEmail" value={userEmail} />
                      <input type="hidden" name="confirmText" value={deleteConfirmText} />
                      <button
                        type="submit"
                        disabled={isStep1SubmitDisabled || delayedPending}
                        className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 focus:ring-2 focus:ring-red-500 focus:outline-none"
                      >
                        {delayedPending ? 'Scheduling…' : 'Confirm & Schedule'}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      disabled={isStep1SubmitDisabled}
                      className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 focus:ring-2 focus:ring-red-500 focus:outline-none"
                    >
                      Continue
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form action={immediateFormAction} className="space-y-4">
                <input type="hidden" name="confirmEmail" value={userEmail} />
                <input type="hidden" name="confirmText" value={deleteConfirmText} />

                <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800 space-y-2">
                  <p className="font-semibold">⚠️ WARNING: Irreversible Action</p>
                  <p>
                    This will permanently delete your account immediately. We&apos;ll send your data export first, but the deletion cannot be undone.
                  </p>
                </div>

                {/* Second-step checkbox confirmation */}
                <label className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-muted-foreground cursor-pointer focus-within:ring-2 focus-within:ring-red-500 rounded p-1">
                  <input
                    type="checkbox"
                    name="acknowledged"
                    required
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span>
                    I understand this is irreversible and I want to delete my account now.
                  </span>
                </label>

                {immediateState?.error && (
                  <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {immediateState.error}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={!acknowledged || immediatePending}
                    className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  >
                    {immediatePending ? 'Deleting…' : 'Delete account now'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
