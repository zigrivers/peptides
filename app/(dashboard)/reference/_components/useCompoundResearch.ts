'use client';

import { useCallback, useState } from 'react';
import type { ResearchResult } from '@/lib/research/domain/types';

type Phase = 'idle' | 'planning' | 'searching' | 'synthesizing' | 'done' | 'error';

type StreamEvent =
  | { phase: 'planning' | 'searching' | 'synthesizing' }
  | { phase: 'result'; result: ResearchResult }
  | { phase: 'error'; code: string };

export function useCompoundResearch(catalogItemId: string) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);

  const run = useCallback(
    async (question: string) => {
      setPhase('planning');
      setErrorCode(null);
      setResult(null);
      try {
        const res = await fetch(`/api/reference/${catalogItemId}/research`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        if (!res.ok || !res.body) {
          setPhase('error');
          setErrorCode(res.status === 401 ? 'unauthorized' : 'request_failed');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const evt = JSON.parse(line) as StreamEvent;
            if (evt.phase === 'planning' || evt.phase === 'searching' || evt.phase === 'synthesizing') {
              setPhase(evt.phase);
            } else if (evt.phase === 'result') {
              setResult(evt.result);
              setPhase('done');
            } else if (evt.phase === 'error') {
              setErrorCode(evt.code);
              setPhase('error');
            }
          }
        }
      } catch {
        setPhase('error');
        setErrorCode('network');
      }
    },
    [catalogItemId]
  );

  return { phase, errorCode, result, run };
}
