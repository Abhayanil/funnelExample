import { createHash, createHmac } from 'node:crypto';

/**
 * Meta normalisation rules:
 *  - email: trim, lowercase
 *  - phone: digits only, E.164 without the leading "+" before hashing
 *  - names: trim, lowercase, strip punctuation, collapse whitespace
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toE164(phone: string, defaultCountry = '1'): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith(defaultCountry)) return `+${digits}`;
  if (phone.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function normalizePhone(phone: string): string | null {
  const e164 = toE164(phone);
  return e164 ? e164.slice(1) : null;
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Optional(value: string | null | undefined): string | undefined {
  return value ? sha256(value) : undefined;
}

export function hmacSha256(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export interface MetaUserInput {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  country?: string | null;
  zip?: string | null;
  city?: string | null;
  state?: string | null;
}

/** Builds the `user_data` block Meta expects, hashing every PII field. */
export function buildMetaUserData(input: MetaUserInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  const email = input.email ? sha256(normalizeEmail(input.email)) : undefined;
  const phone = input.phone ? sha256Optional(normalizePhone(input.phone)) : undefined;
  const firstName = input.firstName ? sha256Optional(normalizeName(input.firstName)) : undefined;
  const lastName = input.lastName ? sha256Optional(normalizeName(input.lastName)) : undefined;

  if (email) data.em = [email];
  if (phone) data.ph = [phone];
  if (firstName) data.fn = [firstName];
  if (lastName) data.ln = [lastName];
  if (input.externalId) data.external_id = [sha256(input.externalId)];

  if (input.fbp) data.fbp = input.fbp;
  if (input.fbc) data.fbc = input.fbc;
  if (input.clientIp) data.client_ip_address = input.clientIp;
  if (input.userAgent) data.client_user_agent = input.userAgent;

  const country = input.country ? sha256(input.country.toLowerCase()) : undefined;
  const zip = input.zip ? sha256(input.zip.replace(/\s+/g, '').toLowerCase()) : undefined;
  const city = input.city ? sha256(normalizeName(input.city)) : undefined;
  const state = input.state ? sha256(input.state.trim().toLowerCase()) : undefined;
  if (country) data.country = [country];
  if (zip) data.zp = [zip];
  if (city) data.ct = [city];
  if (state) data.st = [state];

  return data;
}
