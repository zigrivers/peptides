'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendOrderAction, confirmManualSentAction } from '../../_actions';

interface Props {
  orderId: string;
  initialSendMethod: string | null;
  initialMessageText: string | null;
  telegramDeepLink: string;
  isTelegramLinked: boolean;
}

export function SendOrderPanel({
  orderId,
  initialSendMethod,
  initialMessageText,
  telegramDeepLink,
  isTelegramLinked,
}: Props) {
  const router = useRouter();
  const [sendMethod, setSendMethod] = useState<string | null>(initialSendMethod);
  const [messageText, setMessageText] = useState<string | null>(initialMessageText);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSend = async () => {
    setIsSending(true);
    setError(null);
    try {
      const res = await sendOrderAction(orderId);
      if ('error' in res && typeof res.error === 'string') {
        setError(res.error);
      } else {
        if (res.sendMethod === 'AUTOMATED') {
          setSendMethod('AUTOMATED');
          router.refresh();
        } else if (res.sendMethod === 'MANUAL_FALLBACK' && res.fallbackText) {
          setSendMethod('MANUAL_FALLBACK');
          setMessageText(res.fallbackText);
          router.refresh();
        }
      }
    } catch {
      setError('An unexpected error occurred while sending the order.');
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmSent = async () => {
    setIsConfirming(true);
    setError(null);
    try {
      const res = await confirmManualSentAction(orderId);
      if (res && 'error' in res && res.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    } catch {
      setError('Failed to confirm order as sent.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCopy = async () => {
    if (messageText) {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-xs text-red-600 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      {sendMethod === null && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Send Order</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isTelegramLinked
                ? 'Your Telegram account is linked. We will send the order directly to the vendor.'
                : 'Your Telegram account is not linked. You can send the order details manually.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {isTelegramLinked ? (
              <button
                onClick={handleSend}
                disabled={isSending}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isSending ? 'Sending via Telegram…' : 'Send via Telegram'}
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={isSending}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isSending ? 'Preparing…' : 'Prepare Manual Send'}
              </button>
            )}
          </div>
        </div>
      )}

      {sendMethod === 'MANUAL_FALLBACK' && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4 animate-page-enter">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Manual Fallback Messaging</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Copy the order details below and send them to the vendor on Telegram.
            </p>
          </div>

          {messageText && (
            <div className="relative rounded-lg bg-secondary/30 border border-border p-3">
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap select-all">
                {messageText}
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 text-xs bg-card hover:bg-secondary border border-border px-2 py-1 rounded shadow-sm text-muted-foreground transition-all active:scale-95 duration-100"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={telegramDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Open Telegram Chat ↗
            </a>
            <button
              onClick={handleConfirmSent}
              disabled={isConfirming}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {isConfirming ? 'Confirming…' : 'Mark Order as Sent'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
