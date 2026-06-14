'use client';

import { useCallback, useState } from 'react';
import type { ResearchAnswer } from '@/lib/research/domain/types';

type Phase = 'idle' | 'planning' | 'searching' | 'sources_found' | 'synthesizing' | 'gap_filling' | 'done' | 'error';

export interface TimelineState {
  phase: Phase;
  queries: string[];
  sourceCount: number | null;
  gapQuery: string | null;
}

type StreamEvent =
  | { phase: 'planning' | 'synthesizing' }
  | { phase: 'searching'; queries: string[] }
  | { phase: 'sources_found'; count: number }
  | { phase: 'gap_filling'; query: string }
  | { phase: 'result'; result: ResearchAnswer }
  | { phase: 'error'; code: string };

const initial: TimelineState = { phase: 'idle', queries: [], sourceCount: null, gapQuery: null };

export function useCompoundResearch(catalogItemId: string) {
  const [state, setState] = useState<TimelineState>(initial);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchAnswer | null>(null);

  const run = useCallback(
    async (question: string) => {
      setState({ ...initial, phase: 'planning' });
      setErrorCode(null);
      setResult(null);
      try {
        const res = await fetch(`/api/reference/${catalogItemId}/research`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        if (!res.ok || !res.body) {
          setState((s) => ({ ...s, phase: 'error' }));
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
            if (evt.phase === 'searching') setState((s) => ({ ...s, phase: 'searching', queries: evt.queries }));
            else if (evt.phase === 'sources_found') setState((s) => ({ ...s, phase: 'sources_found', sourceCount: evt.count }));
            else if (evt.phase === 'gap_filling') setState((s) => ({ ...s, phase: 'gap_filling', gapQuery: evt.query }));
            else if (evt.phase === 'planning' || evt.phase === 'synthesizing') setState((s) => ({ ...s, phase: evt.phase }));
            else if (evt.phase === 'result') { setResult(evt.result); setState((s) => ({ ...s, phase: 'done' })); }
            else if (evt.phase === 'error') { setErrorCode(evt.code); setState((s) => ({ ...s, phase: 'error' })); }
          }
        }
      } catch {
        setState((s) => ({ ...s, phase: 'error' }));
        setErrorCode('network');
      }
    },
    [catalogItemId]
  );

  return { state, errorCode, result, run };
}
