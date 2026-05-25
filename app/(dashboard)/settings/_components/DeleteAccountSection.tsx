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
      <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
        {delayedState?.success ?? immediateState?.success}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-destructive/80 mb-4">
        Permanently delete your account, protocols, doses, vials, orders, and history. We&apos;ll email you a complete JSON export first.
      </p>
      <button
        type="button"
        onClick={openModal}
        className="rounded-md bg-destructive text-destructive-foreground px-4 py-2.5 text-sm font-semibold hover:bg-destructive/90 transition-colors focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus:outline-none"
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
            className="relative bg-card text-card-foreground border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 id="modal-title" className="text-lg font-bold text-foreground">
                {step === 1 ? 'Delete Account' : 'Final Confirmation'}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground rounded-md p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus:outline-none"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {step === 1 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Permanently delete your account, protocols, doses, vials, orders, and history. We&apos;ll email you a complete JSON export first.
                </p>

                {/* Mode Select Radio Buttons */}
                <div className="space-y-2.5">
                  <span className="block text-sm font-semibold text-foreground">
                    When should we delete it?
                  </span>
                  
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors focus-within:ring-2 focus-within:ring-primary">
                      <input
                        type="radio"
                        name="deleteMode"
                        value="delayed"
                        checked={mode === 'delayed'}
                        onChange={() => setMode('delayed')}
                        className="mt-1 text-primary focus:ring-primary h-4 w-4 border-input bg-background"
                      />
                      <div className="flex-1 text-sm">
                        <strong className="block text-foreground">Delay 48 hours (Recommended)</strong>
                        <span className="text-xs text-muted-foreground">Sign back in any time within the window to cancel.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 cursor-pointer hover:bg-destructive/20 transition-colors focus-within:ring-2 focus-within:ring-destructive">
                      <input
                        type="radio"
                        name="deleteMode"
                        value="immediate"
                        checked={mode === 'immediate'}
                        onChange={() => setMode('immediate')}
                        className="mt-1 text-destructive focus:ring-destructive h-4 w-4 border-input bg-background"
                      />
                      <div className="flex-1 text-sm">
                        <strong className="block text-destructive">Delete immediately</strong>
                        <span className="text-xs text-destructive/80">Irreversible. Requires a second confirmation screen.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 5-Character "DELETE" text confirmation */}
                <div className="space-y-2">
                  <label htmlFor="confirm-delete-text" className="block text-sm font-medium text-foreground">
                    To proceed, please type <span className="font-mono font-bold text-destructive bg-destructive/10 px-1 py-0.5 rounded">DELETE</span> below:
                  </label>
                  <input
                    id="confirm-delete-text"
                    type="text"
                    required
                    autoComplete="off"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 text-foreground uppercase"
                  />
                </div>

                {delayedState?.error && (
                  <p role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
                    {delayedState.error}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:outline-none"
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
                        className="rounded-md bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus:outline-none"
                      >
                        {delayedPending ? 'Scheduling…' : 'Confirm & Schedule'}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      disabled={isStep1SubmitDisabled}
                      className="rounded-md bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus:outline-none"
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

                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive space-y-2">
                  <p className="font-semibold">⚠️ WARNING: Irreversible Action</p>
                  <p>
                    This will permanently delete your account immediately. We&apos;ll send your data export first, but the deletion cannot be undone.
                  </p>
                </div>

                {/* Second-step checkbox confirmation */}
                <label className="flex items-start gap-2.5 text-sm text-muted-foreground cursor-pointer focus-within:ring-2 focus-within:ring-destructive rounded p-1">
                  <input
                    type="checkbox"
                    name="acknowledged"
                    required
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-input bg-background text-destructive focus:ring-destructive"
                  />
                  <span>
                    I understand this is irreversible and I want to delete my account now.
                  </span>
                </label>

                {immediateState?.error && (
                  <p role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
                    {immediateState.error}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:outline-none"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={!acknowledged || immediatePending}
                    className="rounded-md bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus:outline-none"
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
