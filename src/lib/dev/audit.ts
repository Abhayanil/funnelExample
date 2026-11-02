/**
 * In-process audit trail for local verification only.
 * Production observability comes from Supabase + the alert webhook.
 */
interface AuditEntry {
  type: 'lead' | 'telemetry' | 'capi' | 'webhook' | 'dlq' | 'retry' | 'consent';
  at: string;
  data: Record<string, unknown>;
}

const key = '__lexhiveAudit';
const globalRef = globalThis as unknown as Record<string, AuditEntry[] | undefined>;

export function recordAudit(type: AuditEntry['type'], data: Record<string, unknown>) {
  if (!globalRef[key]) globalRef[key] = [];
  globalRef[key].push({ type, at: new Date().toISOString(), data });
  if (globalRef[key].length > 500) globalRef[key].splice(0, globalRef[key].length - 500);
}

export function readAudit(type?: AuditEntry['type']) {
  const entries = globalRef[key] ?? [];
  return type ? entries.filter(entry => entry.type === type) : entries;
}

export function resetAudit() {
  globalRef[key] = [];
}
