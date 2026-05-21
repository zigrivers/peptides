import { randomUUID } from 'crypto';

interface FlowEntry {
  userId: string;
  tempSession: string;
  expiresAt: number;
}

const FLOW_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-process store — adequate for single-server deployments. Auth flows complete
// within seconds; the TTL is a safety net, not a scaling concern.
const store = new Map<string, FlowEntry>();

export function createFlow(userId: string, tempSession: string): string {
  const flowId = randomUUID();
  store.set(flowId, { userId, tempSession, expiresAt: Date.now() + FLOW_TTL_MS });
  // Self-evict when TTL expires so abandoned flows don't leak memory indefinitely.
  // .unref() prevents this timer from keeping the Node.js event loop alive on shutdown.
  setTimeout(() => store.delete(flowId), FLOW_TTL_MS).unref();
  return flowId;
}

export function getAndValidateFlow(flowId: string, userId: string): FlowEntry {
  const entry = store.get(flowId);
  if (!entry || entry.userId !== userId || Date.now() > entry.expiresAt) {
    store.delete(flowId);
    throw new Error('flow_not_found_or_expired');
  }
  return entry;
}

// Called after SESSION_PASSWORD_NEEDED: GramJS produces a new session string that
// must replace the one stored before the password step.
export function updateFlowSession(flowId: string, tempSession: string): void {
  const entry = store.get(flowId);
  if (entry) entry.tempSession = tempSession;
}

export function deleteFlow(flowId: string): void {
  store.delete(flowId);
}
