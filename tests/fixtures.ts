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

export function buildPayload(overrides: { phone?: string; email?: string } = {}): LeadPayload {
  return {
    submissionId: randomUUID(),
    sessionId: randomUUID(),
    eventId: randomUUID(),
    funnelVersion: 'qualification-v30',
    answers: {
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
      email: overrides.email ?? 'jordan.rivera@example.com',
    },
    contact: {
      firstName: 'Jordan',
      lastName: 'Rivera',
      phone: overrides.phone ?? '(555) 123-4567',
      email: overrides.email ?? 'jordan.rivera@example.com',
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
      utm: { utm_source: 'playwright' },
    },
    meta: {},
  };
}
