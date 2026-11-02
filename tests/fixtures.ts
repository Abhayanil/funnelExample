import { randomUUID } from 'node:crypto';

export interface LeadPayload {
  submissionId: string;
  sessionId: string;
  eventId: string;
  funnelVersion: string;
  answers: Record<string, string>;
  contact: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  consent: {
    accepted: boolean;
    version: string;
    text: string;
    pageUrl: string;
  };
  attribution: {
    landingUrl: string;
    referrer?: string;
    utm: Record<string, string>;
  };
  meta: Record<string, string>;
}

export interface PayloadOverrides {
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  answers?: Record<string, string>;
  utm?: Record<string, string>;
}

const BASE_ANSWERS: Record<string, string> = {
  start: 'YES',
  receiving_ben: 'I am not receiving any disability benefits (SSD or SSI)',
  page_sm72h5: '20 hours or less per week',
  fiveyearwork: 'Between 4 and 6 years',
  outofwork: 'NO',
  visit: 'YES',
  page_igxwft: 'NO',
  page_1kwm6b: 'Male',
  page_uhs14w: '50-54',
  page_8w2qbu: 'Single',
};

/** Answers for a strong claimant: all six rubric dimensions are favourable. */
export const QUALIFIED_ANSWERS: Record<string, string> = {
  start: 'YES',
  receiving_ben: 'I am not receiving any disability benefits (SSD or SSI)',
  page_sm72h5: 'Not working',
  lastworked: 'More than 12 months ago',
  fiveyearwork: 'More than 6 years',
  page_lyensr: 'Less than $2000',
  outofwork: 'YES',
  conditionstart: 'More than 1 year ago',
  visit: 'YES',
  page_igxwft: 'NO',
  page_1kwm6b: 'Male',
  page_uhs14w: '55-63',
  page_8w2qbu: 'Single',
};

/** Same profile, but working over SGA hours: a hard disqualifier. */
export const DISQUALIFIED_ANSWERS: Record<string, string> = {
  ...QUALIFIED_ANSWERS,
  page_sm72h5: 'More than 20 hours per week',
  lastworked: 'Within the last 4 months',
};

export function buildPayload(overrides: PayloadOverrides = {}): LeadPayload {
  const email = overrides.email ?? 'jordan.rivera@example.com';
  return {
    submissionId: randomUUID(),
    sessionId: randomUUID(),
    eventId: randomUUID(),
    funnelVersion: 'qualification-v30',
    answers: {
      ...BASE_ANSWERS,
      email,
      ...overrides.answers,
    },
    contact: {
      firstName: overrides.firstName ?? 'Jordan',
      lastName: overrides.lastName ?? 'Rivera',
      phone: overrides.phone ?? '(555) 123-4567',
      email,
    },
    consent: {
      accepted: true,
      version: 'tcpa-2026-11',
      text:
        'I provide my electronic signature and express written consent for LexHive and its partners ' +
        'to contact me by phone, SMS, and email using automated technology.',
      pageUrl: 'http://127.0.0.1:3100/',
    },
    attribution: {
      landingUrl: 'http://127.0.0.1:3100/',
      utm: overrides.utm ?? { utm_source: 'playwright' },
    },
    meta: {},
  };
}

export function buildQualifiedPayload(overrides: PayloadOverrides = {}): LeadPayload {
  const email = overrides.email ?? 'jordan.rivera@example.com';
  return buildPayload({
    ...overrides,
    answers: { ...QUALIFIED_ANSWERS, email, ...overrides.answers },
  });
}

export function buildDisqualifiedPayload(overrides: PayloadOverrides = {}): LeadPayload {
  const email = overrides.email ?? 'jordan.rivera@example.com';
  return buildPayload({
    ...overrides,
    answers: { ...DISQUALIFIED_ANSWERS, email, ...overrides.answers },
  });
}
