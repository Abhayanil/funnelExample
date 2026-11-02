import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { ConsentRow, DeadLetterInput, LeadRow, LeadStore } from './types';

/* ------------------------------------------------------------------ */
/* Memory store (local dev / tests without Supabase credentials)       */
/* ------------------------------------------------------------------ */

interface MemoryLead {
  id: string;
  row: LeadRow;
  consent: ConsentRow;
  createdAt: string;
}

interface MemoryEvent {
  eventId: string;
  eventName: string;
  sessionId: string;
  stepId: string;
  source: 'pixel' | 'capi';
  payload: unknown;
  createdAt: string;
}

interface MemoryState {
  leads: Map<string, MemoryLead>; // submission_id -> lead
  events: Map<string, MemoryEvent>;
  deadLetters: Map<string, DeadLetterInput & { createdAt: string; attempts: number }>;
}

const globalKey = '__lexhiveLeadMemory';
const globalRef = globalThis as unknown as Record<string, MemoryState | undefined>;

function memoryState(): MemoryState {
  if (!globalRef[globalKey]) {
    globalRef[globalKey] = { leads: new Map(), events: new Map(), deadLetters: new Map() };
  }
  return globalRef[globalKey];
}

function uuid(): string {
  return crypto.randomUUID();
}

export class MemoryLeadStore implements LeadStore {
  async saveLead(row: LeadRow, consent: ConsentRow) {
    const state = memoryState();
    const existing = state.leads.get(row.submission_id);
    if (existing) return { leadId: existing.id, duplicate: true };

    const id = uuid();
    state.leads.set(row.submission_id, { id, row, consent, createdAt: new Date().toISOString() });
    return { leadId: id, duplicate: false };
  }

  async logEvent(event: Parameters<LeadStore['logEvent']>[0]) {
    const state = memoryState();
    if (state.events.has(event.eventId)) return { duplicate: true };
    state.events.set(event.eventId, { ...event, createdAt: new Date().toISOString() });
    return { duplicate: false };
  }

  async enqueueDeadLetter(entry: DeadLetterInput) {
    const state = memoryState();
    const existing = state.deadLetters.get(entry.dedupeKey);
    state.deadLetters.set(entry.dedupeKey, {
      ...entry,
      attempts: (existing?.attempts ?? 0) + 1,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
  }

  snapshot() {
    const state = memoryState();
    return {
      leads: [...state.leads.values()],
      events: [...state.events.values()],
      deadLetters: [...state.deadLetters.values()],
    };
  }

  reset() {
    const state = memoryState();
    state.leads.clear();
    state.events.clear();
    state.deadLetters.clear();
  }
}

export const memoryLeadStore = new MemoryLeadStore();

/* ------------------------------------------------------------------ */
/* Supabase store                                                      */
/* ------------------------------------------------------------------ */

export class SupabaseLeadStore implements LeadStore {
  constructor(private readonly client: SupabaseClient) {}

  async saveLead(row: LeadRow, consent: ConsentRow) {
    const { data, error } = await this.client.rpc('capture_lead', {
      payload: { ...row, consent },
    });

    if (error) throw new Error(`capture_lead failed: ${error.message}`);

    const result = (Array.isArray(data) ? data[0] : data) as
      | { lead_id: string; inserted: boolean }
      | null;

    if (!result?.lead_id) throw new Error('capture_lead returned no lead id');
    return { leadId: result.lead_id, duplicate: result.inserted === false };
  }

  async logEvent(event: Parameters<LeadStore['logEvent']>[0]) {
    const { data, error } = await this.client
      .from('telemetry_events')
      .select('id')
      .eq('event_id', event.eventId)
      .maybeSingle();

    if (error) throw new Error(`telemetry lookup failed: ${error.message}`);
    if (data) return { duplicate: true };

    const { error: insertError } = await this.client.from('telemetry_events').insert({
      event_id: event.eventId,
      event_name: event.eventName,
      session_id: event.sessionId,
      step_id: event.stepId,
      source: event.source,
      payload: event.payload,
    });

    // Unique violation = a concurrent request already logged this event.
    if (insertError && insertError.code !== '23505') {
      throw new Error(`telemetry insert failed: ${insertError.message}`);
    }
    return { duplicate: Boolean(insertError) };
  }

  async enqueueDeadLetter(entry: DeadLetterInput) {
    const { error } = await this.client.rpc('enqueue_dead_letter', {
      payload: {
        source: entry.source,
        dedupe_key: entry.dedupeKey,
        payload: entry.payload,
        error: entry.error,
        attempts: entry.attempts,
        status: entry.status ?? null,
      },
    });
    if (error) throw new Error(`enqueue_dead_letter failed: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

let cachedClient: SupabaseClient | null | undefined;
let cachedStore: LeadStore | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    cachedClient = null;
    return null;
  }

  cachedClient = createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'lexhive-funnel' } },
  });
  return cachedClient;
}

export function getLeadStore(): LeadStore {
  if (cachedStore) return cachedStore;

  const client = getSupabaseAdmin();
  if (client) {
    cachedStore = new SupabaseLeadStore(client);
    return cachedStore;
  }

  if (!env.allowMemoryFallback) {
    throw new Error('Supabase is not configured and ALLOW_IN_MEMORY_FALLBACK is disabled');
  }

  if (env.nodeEnv !== 'test') {
    console.warn('[lexhive] Supabase not configured — using in-memory lead store');
  }
  cachedStore = memoryLeadStore;
  return cachedStore;
}
