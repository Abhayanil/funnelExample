import type { LeadSubmission } from './schema';
import { qualifyLead, type QualificationReasonCode, type QualificationTier } from './qualifier';

export const DISPOSITIONS = ['consult_scheduled', 'retained', 'disqualified'] as const;
export type DispositionStatus = (typeof DISPOSITIONS)[number];

export const DISPOSITION_LABELS: Record<DispositionStatus, string> = {
  consult_scheduled: 'Consult scheduled',
  retained: 'Retained',
  disqualified: 'Disqualified',
};

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
  qualification_tier: QualificationTier | null;
  qualification_score: number | null;
  qualification_reasons: QualificationReasonCode[];
  disposition: DispositionStatus | null;
  contract_value: number | null;
  disposition_updated_at: string | null;
  offline_event_id: string | null;
}

export interface StoredLead {
  id: string;
  row: LeadRow;
}

export interface LeadIdentifier {
  leadId?: string;
  submissionId?: string;
}

export interface SaveDispositionInput {
  leadId?: string;
  submissionId?: string;
  disposition: DispositionStatus;
  contractValue: number | null;
  offlineEventId: string | null;
}

export interface SaveDispositionResult {
  lead: StoredLead;
  previousDisposition: DispositionStatus | null;
  changed: boolean;
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
  getLead(identifier: LeadIdentifier): Promise<StoredLead | null>;
  saveDisposition(input: SaveDispositionInput): Promise<SaveDispositionResult | null>;
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
  const qualification = qualifyLead(a);
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
    qualification_tier: qualification.tier,
    qualification_score: qualification.score,
    qualification_reasons: qualification.reasons,
    disposition: null,
    contract_value: null,
    disposition_updated_at: null,
    offline_event_id: null,
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
      tier: row.qualification_tier,
      score: row.qualification_score,
      reasons: row.qualification_reasons,
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
    disposition: {
      status: row.disposition,
      contract_value: row.contract_value,
      updated_at: row.disposition_updated_at,
      offline_event_id: row.offline_event_id,
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
