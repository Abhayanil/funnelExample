import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type {
  ConsentRow,
  DeadLetterInput,
  LeadRow,
  LeadStore,
  SaveDispositionInput,
  StoredLead,
} from './types';

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

  async getLead(identifier: { leadId?: string; submissionId?: string }): Promise<StoredLead | null> {
    const state = memoryState();

    if (identifier.leadId) {
      for (const lead of state.leads.values()) {
        if (lead.id === identifier.leadId) return { id: lead.id, row: lead.row };
      }
    }

    if (identifier.submissionId) {
      const lead = state.leads.get(identifier.submissionId);
      if (lead) return { id: lead.id, row: lead.row };
    }

    return null;
  }

  async saveDisposition(input: SaveDispositionInput) {
    const state = memoryState();
    const lead = await this.getLead({ leadId: input.leadId, submissionId: input.submissionId });
    if (!lead) return null;

    const memoryLead = [...state.leads.values()].find(candidate => candidate.id === lead.id);
    if (!memoryLead) return null;

    const previousDisposition = memoryLead.row.disposition;
    const changed = previousDisposition !== input.disposition;
    const updatedAt = new Date().toISOString();

    memoryLead.row = {
      ...memoryLead.row,
      disposition: input.disposition,
      contract_value: input.contractValue,
      disposition_updated_at: updatedAt,
      offline_event_id: input.offlineEventId,
    };

    return {
      lead: { id: memoryLead.id, row: memoryLead.row },
      previousDisposition,
      changed,
    };
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

interface SupabaseDispositionResult {
  lead_id: string;
  submission_id: string;
  disposition: LeadRow['disposition'];
  previous_disposition: LeadRow['disposition'];
  contract_value: number | string | null;
  offline_event_id: string | null;
  changed: boolean;
}

function toLeadRow(value: unknown): LeadRow {
  const row = value as LeadRow & { contract_value?: number | string | null };
  return {
    ...row,
    qualification_reasons: Array.isArray(row.qualification_reasons)
      ? row.qualification_reasons
      : typeof row.qualification_reasons === 'string'
        ? (JSON.parse(row.qualification_reasons) as LeadRow['qualification_reasons'])
        : [],
    contract_value:
      row.contract_value === null || row.contract_value === undefined
        ? null
        : Number(row.contract_value),
  };
}

export class SupabaseLeadStore implements LeadStore {
  constructor(private readonly client: SupabaseClient) {}

  async getLead(identifier: { leadId?: string; submissionId?: string }): Promise<StoredLead | null> {
    let query = this.client.from('leads').select('*');

    if (identifier.leadId) {
      query = query.eq('id', identifier.leadId);
    } else if (identifier.submissionId) {
      query = query.eq('submission_id', identifier.submissionId);
    } else {
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`lead lookup failed: ${error.message}`);
    if (!data) return null;

    return { id: (data as { id: string }).id, row: toLeadRow(data) };
  }

  async saveDisposition(input: SaveDispositionInput) {
    const { data, error } = await this.client.rpc('apply_crm_disposition', {
      payload: {
        lead_id: input.leadId ?? null,
        submission_id: input.submissionId ?? null,
        disposition: input.disposition,
        contract_value: input.contractValue,
        offline_event_id: input.offlineEventId,
      },
    });

    if (error) throw new Error(`apply_crm_disposition failed: ${error.message}`);

    const result = (Array.isArray(data) ? data[0] : data) as SupabaseDispositionResult | null;
    if (!result?.lead_id) return null;

    const lead = await this.getLead({ leadId: result.lead_id });
    if (!lead) return null;

    return {
      lead,
      previousDisposition: result.previous_disposition ?? null,
      changed: Boolean(result.changed),
    };
  }

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
