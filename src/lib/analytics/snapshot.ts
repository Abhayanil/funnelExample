import { env } from '@/lib/env';
import { getStep, graph } from '@/lib/funnel/engine';
import { getSupabaseAdmin, memoryLeadStore } from '@/lib/leads/store';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_STEP_SECONDS = 30 * 60;

export type RangeDays = 7 | 30 | 90;

export interface AnalyticsLead {
  id: string;
  sessionId: string;
  submittedAt: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  answers: Record<string, string>;
  status: string;
  attribution: {
    utm?: Record<string, string>;
    referrer?: string;
    landingUrl?: string;
  };
}

export interface AnalyticsEvent {
  eventId: string;
  eventName: string;
  sessionId: string;
  stepId: string;
  createdAt: string;
}

export interface AnalyticsSnapshot {
  rangeDays: RangeDays;
  generatedAt: string;
  dataSource: 'supabase' | 'memory';
  totals: {
    leads: number;
    sessions: number;
    trackedEvents: number;
    conversionRate: number;
    failedLeads: number;
    medianTimeToLeadSeconds: number | null;
  };
  trend: Array<{ label: string; leads: number; sessions: number }>;
  steps: Array<{
    stepId: string;
    question: string;
    sessions: number;
    reachRate: number;
    medianSeconds: number | null;
  }>;
  answers: Array<{
    stepId: string;
    question: string;
    total: number;
    options: Array<{ label: string; count: number; share: number }>;
  }>;
  sources: Array<{ source: string; leads: number; share: number }>;
  statuses: Array<{ status: string; count: number }>;
  recentLeads: Array<{
    id: string;
    submittedAt: string;
    name: string;
    email: string;
    phone: string;
    ageRange: string | null;
    maritalStatus: string | null;
    attorneyStatus: string | null;
    status: string;
  }>;
}

interface SupabaseLeadRow {
  id: string;
  session_id: string;
  submitted_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_e164: string | null;
  answers: Record<string, string> | null;
  status: string | null;
  attribution: AnalyticsLead['attribution'] | null;
}

interface SupabaseEventRow {
  event_id: string;
  event_name: string;
  session_id: string;
  step_id: string;
  created_at: string;
}

function asUtm(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  return Object.fromEntries(entries);
}

function parseAttribution(value: unknown): AnalyticsLead['attribution'] {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  return {
    utm: asUtm(record.utm),
    referrer: typeof record.referrer === 'string' ? record.referrer : undefined,
    landingUrl: typeof record.landingUrl === 'string' ? record.landingUrl : undefined,
  };
}

async function loadRange(rangeDays: RangeDays): Promise<{
  leads: AnalyticsLead[];
  events: AnalyticsEvent[];
  dataSource: 'supabase' | 'memory';
  since: Date;
}> {
  const now = Date.now();
  const since = new Date(now - rangeDays * DAY_MS);

  const client = getSupabaseAdmin();
  if (!client) {
    if (!env.allowMemoryFallback) {
      throw new Error(
        'Analytics requires Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
      );
    }

    const snapshot = memoryLeadStore.snapshot();
    return {
      since,
      dataSource: 'memory',
      leads: snapshot.leads
        .filter(lead => new Date(lead.createdAt) >= since)
        .map(lead => ({
          id: lead.id,
          sessionId: lead.row.session_id,
          submittedAt: lead.createdAt,
          firstName: lead.row.first_name,
          lastName: lead.row.last_name,
          email: lead.row.email,
          phone: lead.row.phone_e164,
          answers: lead.row.answers,
          status: lead.row.status,
          attribution: parseAttribution(lead.row.attribution),
        })),
      events: snapshot.events
        .filter(event => new Date(event.createdAt) >= since)
        .map(event => ({
          eventId: event.eventId,
          eventName: event.eventName,
          sessionId: event.sessionId,
          stepId: event.stepId,
          createdAt: event.createdAt,
        })),
    };
  }

  const [leadResult, eventResult] = await Promise.all([
    client
      .from('leads')
      .select(
        'id, session_id, submitted_at, first_name, last_name, email, phone_e164, answers, status, attribution'
      )
      .gte('submitted_at', since.toISOString())
      .order('submitted_at', { ascending: false })
      .limit(10_000),
    client
      .from('telemetry_events')
      .select('event_id, event_name, session_id, step_id, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })
      .limit(50_000),
  ]);

  if (leadResult.error) throw new Error(`leads query failed: ${leadResult.error.message}`);
  if (eventResult.error) {
    throw new Error(`telemetry query failed: ${eventResult.error.message}`);
  }

  const leadRows = (leadResult.data ?? []) as unknown as SupabaseLeadRow[];
  const eventRows = (eventResult.data ?? []) as unknown as SupabaseEventRow[];

  return {
    since,
    dataSource: 'supabase',
    leads: leadRows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      submittedAt: row.submitted_at,
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      email: row.email ?? '',
      phone: row.phone_e164 ?? '',
      answers: row.answers ?? {},
      status: row.status ?? 'new',
      attribution: parseAttribution(row.attribution),
    })),
    events: eventRows.map(row => ({
      eventId: row.event_id,
      eventName: row.event_name,
      sessionId: row.session_id,
      stepId: row.step_id,
      createdAt: row.created_at,
    })),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return Math.round(value);
}

function sourceOf(lead: AnalyticsLead): string {
  const utmSource = lead.attribution.utm?.utm_source?.trim().toLowerCase();
  if (utmSource) return utmSource;

  if (lead.attribution.referrer) {
    try {
      return new URL(lead.attribution.referrer).hostname.replace(/^www\./, '');
    } catch {
      return 'referral';
    }
  }

  return 'direct';
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '—';
  const local = email.slice(0, at);
  return `${local.slice(0, 1)}${'*'.repeat(Math.min(6, Math.max(2, local.length - 1)))}${email.slice(at)}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : '—';
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function buildTrend(
  rangeDays: RangeDays,
  leads: AnalyticsLead[],
  firstEventBySession: Map<string, number>
): AnalyticsSnapshot['trend'] {
  const bucketDays = rangeDays <= 30 ? 1 : 7;
  const bucketMs = bucketDays * DAY_MS;
  const today = startOfUtcDay(Date.now());
  const bucketCount = Math.ceil(rangeDays / bucketDays);
  const firstBucket = today - (bucketCount - 1) * bucketMs;

  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = firstBucket + index * bucketMs;
    return {
      start,
      label: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(start)),
      leads: 0,
      sessions: new Set<string>(),
    };
  });

  const indexFor = (timestamp: number) => {
    const index = Math.floor((startOfUtcDay(timestamp) - firstBucket) / bucketMs);
    return index >= 0 && index < buckets.length ? index : -1;
  };

  for (const lead of leads) {
    const index = indexFor(Date.parse(lead.submittedAt));
    if (index >= 0) buckets[index].leads += 1;
  }

  for (const [sessionId, timestamp] of firstEventBySession) {
    const index = indexFor(timestamp);
    if (index >= 0) buckets[index].sessions.add(sessionId);
  }

  // A lead without telemetry still represents a session.
  for (const lead of leads) {
    if (!firstEventBySession.has(lead.sessionId)) {
      const index = indexFor(Date.parse(lead.submittedAt));
      if (index >= 0) buckets[index].sessions.add(lead.sessionId);
    }
  }

  return buckets.map(bucket => ({
    label: bucket.label,
    leads: bucket.leads,
    sessions: bucket.sessions.size,
  }));
}

export async function getAnalyticsSnapshot(rangeDays: RangeDays): Promise<AnalyticsSnapshot> {
  const { leads, events, dataSource } = await loadRange(rangeDays);

  const sessionEvents = new Map<string, AnalyticsEvent[]>();
  const firstEventBySession = new Map<string, number>();

  for (const event of events) {
    const list = sessionEvents.get(event.sessionId) ?? [];
    list.push(event);
    sessionEvents.set(event.sessionId, list);

    const timestamp = Date.parse(event.createdAt);
    const first = firstEventBySession.get(event.sessionId);
    if (first === undefined || timestamp < first) {
      firstEventBySession.set(event.sessionId, timestamp);
    }
  }

  for (const list of sessionEvents.values()) {
    list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  // Sessions that reached a step. InitiateCheckout counts as reaching `start`.
  const sessionsByStep = new Map<string, Set<string>>();
  const addReach = (stepId: string, sessionId: string) => {
    const set = sessionsByStep.get(stepId) ?? new Set<string>();
    set.add(sessionId);
    sessionsByStep.set(stepId, set);
  };

  for (const event of events) {
    if (event.eventName === 'InitiateCheckout') {
      addReach(event.stepId || graph.start, event.sessionId);
    } else if (event.eventName === 'FunnelStepComplete' || event.eventName === 'Lead') {
      addReach(event.stepId, event.sessionId);
    }
  }

  // Every session that submitted a lead has, by definition, reached contact.
  for (const lead of leads) addReach('contact', lead.sessionId);

  const sessionIds = new Set<string>([...firstEventBySession.keys(), ...leads.map(l => l.sessionId)]);
  const totalSessions = sessionIds.size;

  // Time between consecutive tracked events is attributed to the step the user
  // just answered, capped to ignore idle tabs.
  const durationsByStep = new Map<string, number[]>();
  const timeToLeadSeconds: number[] = [];

  for (const [, list] of sessionEvents) {
    for (let index = 1; index < list.length; index += 1) {
      const previous = Date.parse(list[index - 1].createdAt);
      const current = Date.parse(list[index].createdAt);
      const seconds = (current - previous) / 1000;
      if (seconds < 0 || seconds > MAX_STEP_SECONDS) continue;

      const stepId = list[index].stepId;
      const bucket = durationsByStep.get(stepId) ?? [];
      bucket.push(seconds);
      durationsByStep.set(stepId, bucket);
    }

    const leadEvent = list.find(event => event.eventName === 'Lead');
    if (leadEvent) {
      const duration = (Date.parse(leadEvent.createdAt) - Date.parse(list[0].createdAt)) / 1000;
      if (duration >= 0 && duration <= MAX_STEP_SECONDS) timeToLeadSeconds.push(duration);
    }

  }

  const steps = [...sessionsByStep.entries()]
    .map(([stepId, sessions]) => {
      let question = stepId;
      try {
        question = getStep(stepId).question;
      } catch {
        question = stepId;
      }
      return {
        stepId,
        question,
        sessions: sessions.size,
        reachRate: totalSessions > 0 ? sessions.size / totalSessions : 0,
        medianSeconds: median(durationsByStep.get(stepId) ?? []),
      };
    })
    .sort((a, b) => b.sessions - a.sessions);

  const answers = graph.steps
    .filter(step => (step.kind === 'landing' || step.kind === 'question') && step.options?.length)
    .map(step => {
      const counts = new Map<string, number>();
      let total = 0;

      for (const lead of leads) {
        const answer = lead.answers[step.id];
        if (!answer) continue;
        counts.set(answer, (counts.get(answer) ?? 0) + 1);
        total += 1;
      }

      return {
        stepId: step.id,
        question: step.question,
        total,
        options: [...counts.entries()]
          .map(([label, count]) => ({ label, count, share: total ? count / total : 0 }))
          .sort((a, b) => b.count - a.count),
      };
    })
    .filter(entry => entry.total > 0)
    .sort((a, b) => b.total - a.total);

  const sourceCounts = new Map<string, number>();
  for (const lead of leads) {
    const source = sourceOf(lead);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }

  const statusCounts = new Map<string, number>();
  for (const lead of leads) {
    statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);
  }

  return {
    rangeDays,
    generatedAt: new Date().toISOString(),
    dataSource,
    totals: {
      leads: leads.length,
      sessions: totalSessions,
      trackedEvents: events.length,
      conversionRate: totalSessions > 0 ? Math.min(leads.length / totalSessions, 1) : 0,
      failedLeads: leads.filter(lead => lead.status === 'failed').length,
      medianTimeToLeadSeconds: median(timeToLeadSeconds),
    },
    trend: buildTrend(rangeDays, leads, firstEventBySession),
    steps,
    answers,
    sources: [...sourceCounts.entries()]
      .map(([source, count]) => ({
        source,
        leads: count,
        share: leads.length ? count / leads.length : 0,
      }))
      .sort((a, b) => b.leads - a.leads),
    statuses: [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    recentLeads: leads.slice(0, 12).map(lead => ({
      id: lead.id,
      submittedAt: lead.submittedAt,
      name: `${lead.firstName} ${lead.lastName}`.trim() || 'Unknown',
      email: maskEmail(lead.email),
      phone: maskPhone(lead.phone),
      ageRange: lead.answers.page_uhs14w ?? null,
      maritalStatus: lead.answers.page_8w2qbu ?? null,
      attorneyStatus: lead.answers.attorney ?? null,
      status: lead.status,
    })),
  };
}
