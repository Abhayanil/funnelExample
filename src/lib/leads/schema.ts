import { z } from 'zod';

export const US_PHONE_REGEX = /^\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;

export const emailField = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .max(254)
  .email('Enter a valid email address');

export const phoneField = z
  .string()
  .trim()
  .min(10, 'Enter a 10-digit phone number')
  .max(20)
  .regex(US_PHONE_REGEX, 'Enter a valid US phone number');

export const nameField = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters')
  .max(60, 'Keep this under 60 characters')
  .regex(/^[\p{L}][\p{L}\s'.-]*$/u, 'Letters, spaces, apostrophes and hyphens only');

export const emailStepSchema = z.object({ email: emailField });
export type EmailStepValues = z.infer<typeof emailStepSchema>;

export const contactStepSchema = z.object({
  firstName: nameField,
  lastName: nameField,
  phone: phoneField,
  consent: z.boolean().refine(value => value === true, {
    message: 'You must agree to be contacted before continuing',
  }),
});
export type ContactStepValues = z.infer<typeof contactStepSchema>;

export const leadSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  sessionId: z.string().uuid(),
  eventId: z.string().uuid(),
  funnelVersion: z.string().min(1).max(64),
  answers: z.record(z.string().max(64), z.string().max(200)).default({}),
  contact: z.object({
    firstName: nameField,
    lastName: nameField,
    phone: phoneField,
    email: emailField,
  }),
  consent: z.object({
    accepted: z.literal(true),
    version: z.string().min(1).max(64),
    text: z.string().min(20, 'Consent text is required for the audit log'),
    pageUrl: z.string().url().optional(),
  }),
  attribution: z
    .object({
      landingUrl: z.string().url().optional(),
      referrer: z.string().max(2048).optional(),
      utm: z.record(z.string(), z.string()).default({}),
    })
    .default({ utm: {} }),
  meta: z
    .object({
      fbp: z.string().max(256).optional(),
      fbc: z.string().max(512).optional(),
    })
    .default({}),
});

export type LeadSubmission = z.infer<typeof leadSubmissionSchema>;

export const telemetryEventSchema = z.object({
  eventName: z.enum(['InitiateCheckout', 'FunnelStepComplete', 'Lead']),
  eventId: z.string().uuid(),
  sessionId: z.string().uuid(),
  stepId: z.string().min(1).max(64),
  stepIndex: z.number().int().min(0).max(64).optional(),
  eventSourceUrl: z.string().url().optional(),
  customData: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  user: z
    .object({
      email: z.string().max(254).optional(),
      phone: z.string().max(32).optional(),
      firstName: z.string().max(60).optional(),
      lastName: z.string().max(60).optional(),
    })
    .default({}),
  fbp: z.string().max(256).optional(),
  fbc: z.string().max(512).optional(),
});

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
