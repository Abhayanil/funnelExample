import type { LeadSubmission } from './schema';

export interface RequestContext {
  ip: string;
  userAgent: string;
  origin: string;
}

export interface LeadRow {
  submission_id: string;
  session_id: string;
  funnel_version: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_e164: string;
  answers: Record<string, string>;
  receiving_benefits: string | null;
  hours_per_week: string | null;
  last_worked: string | null;
  years_employed: string | null;
  assets: string | null;
  expects_out_of_work: boolean | null;
  condition_start: string | null;
  doctor_status: string | null;
  last_doctor_visit: string | null;
  pending_application: boolean | null;
  attorney_status: string | null;
  attorney_firm: string | null;
  application_denied: boolean | null;
  claim_stage: string | null;
  reconsideration_status: string | null;
  denial_age: string | null;
  hearing_status: string | null;
  hearing_month: string | null;
  waiting_period: string | null;
  gender: string | null;
  age_range: string | null;
  marital_status: string | null;
  attribution: Record<string, unknown>;
  meta: Record<string, unknown>;
  lead_event_id: string;
  status: 'new' | 'synced' | 'failed';
  submitted_at: string;
}

export interface ConsentRow {
  accepted: boolean;
  version: string;
  text: string;
  page_url?: string;
  ip: string;
  user_agent: string;
}

export interface DeadLetterInput {
  source: 'meta_capi' | 'n8n_webhook' | 'supabase' | 'unknown';
  dedupeKey: string;
  payload: unknown;
  error: string;
  attempts: number;
  status?: number;
}

export interface LeadStore {
  saveLead(row: LeadRow, consent: ConsentRow): Promise<{ leadId: string; duplicate: boolean }>;
  logEvent(event: {
    eventId: string;
    eventName: string;
    sessionId: string;
    stepId: string;
    source: 'pixel' | 'capi';
    payload: unknown;
  }): Promise<{ duplicate: boolean }>;
  enqueueDeadLetter(entry: DeadLetterInput): Promise<void>;
}

const yes = (value: string | undefined) => {
  if (!value) return null;
  return value.trim().toUpperCase() === 'YES';
};

/** Maps funnel step answers onto structured DB columns for reporting/CRM sync. */
export function buildLeadRow(submission: LeadSubmission, phoneE164: string): LeadRow {
  const a = submission.answers;
  return {
    submission_id: submission.submissionId,
    session_id: submission.sessionId,
    funnel_version: submission.funnelVersion,
    first_name: submission.contact.firstName,
    last_name: submission.contact.lastName,
    email: submission.contact.email.toLowerCase(),
    phone_e164: phoneE164,
    answers: a,
    receiving_benefits: a.receiving_ben ?? null,
    hours_per_week: a.page_sm72h5 ?? null,
    last_worked: a.lastworked ?? null,
    years_employed: a.fiveyearwork ?? null,
    assets: a.page_lyensr ?? null,
    expects_out_of_work: yes(a.outofwork),
    condition_start: a.conditionstart ?? null,
    doctor_status: a.visit ?? null,
    last_doctor_visit: a.page_zbkz5e ?? null,
    pending_application: yes(a.page_igxwft),
    attorney_status: a.attorney ?? null,
    attorney_firm: a.attorneyfirm ?? null,
    application_denied: yes(a.page_9rrpa3),
    claim_stage: a.page_sozf2w ?? null,
    reconsideration_status: a.page_reconstatus ?? null,
    denial_age: a.page_denialage ?? null,
    hearing_status: a.page_doic6e ?? null,
    hearing_month: a.page_6dkfid ?? null,
    waiting_period: a.page_ddujlp ?? null,
    gender: a.page_1kwm6b ?? null,
    age_range: a.page_uhs14w ?? null,
    marital_status: a.page_8w2qbu ?? null,
    attribution: submission.attribution,
    meta: submission.meta,
    lead_event_id: submission.eventId,
    status: 'new',
    submitted_at: new Date().toISOString(),
  };
}

/** n8n / CRM payload — deliberately flatter than the DB row. */
export function buildAutomationPayload(row: LeadRow, leadId: string) {
  return {
    lead_id: leadId,
    submission_id: row.submission_id,
    session_id: row.session_id,
    funnel_version: row.funnel_version,
    submitted_at: row.submitted_at,
    contact: {
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone_e164,
    },
    qualification: {
      receiving_benefits: row.receiving_benefits,
      hours_per_week: row.hours_per_week,
      years_employed: row.years_employed,
      assets: row.assets,
      expects_out_of_work: row.expects_out_of_work,
      condition_start: row.condition_start,
      doctor_status: row.doctor_status,
      pending_application: row.pending_application,
      attorney_status: row.attorney_status,
      attorney_firm: row.attorney_firm,
      application_denied: row.application_denied,
      claim_stage: row.claim_stage,
      hearing_status: row.hearing_status,
      waiting_period: row.waiting_period,
      denial_age: row.denial_age,
    },
    demographics: {
      gender: row.gender,
      age_range: row.age_range,
      marital_status: row.marital_status,
    },
    answers: row.answers,
    attribution: row.attribution,
  };
}
