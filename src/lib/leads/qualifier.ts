import { createHash } from 'node:crypto';

/**
 * Deterministic SSA-style lead qualification.
 *
 * This is deliberately a pure function over the funnel `answers` map: the same
 * submission always produces the same tier, score, reasons and synthetic value.
 * It is a lead-quality heuristic, not a legal eligibility determination.
 *
 * Rubric (simplified SSA sequential evaluation):
 *   1. Substantial gainful activity  -> working >20 h/week is a hard stop.
 *   2. Medical determinable impairment -> current doctor/medication evidence.
 *   3. Duration                      -> condition expected/observed 12+ months.
 *   4. Past relevant work             -> work history / insured status.
 *   5. Age                            -> 50+ is favourable under the grids.
 *   6. SSI asset ceiling              -> >$2,000 is a risk signal.
 *   7. Representation                -> already represented is not a prospect.
 */

export const QUALIFICATION_TIERS = ['qualified', 'borderline', 'disqualified'] as const;
export type QualificationTier = (typeof QUALIFICATION_TIERS)[number];

export const QUALIFICATION_REASON_CODES = [
  // Hard disqualifiers
  'working_over_20_hours',
  'insufficient_work_history',
  'already_represented',
  'no_medical_evidence',
  // Borderline / risk signals
  'assets_over_2000',
  'assets_unknown',
  'condition_under_12_months',
  'condition_duration_unknown',
  'no_recent_doctor',
  'not_expecting_12_months',
  'limited_work_history',
  'reduced_hours',
  // Data / scoring
  'missing_qualification_data',
  'below_qualification_threshold',
] as const;

export type QualificationReasonCode = (typeof QUALIFICATION_REASON_CODES)[number];

export const QUALIFICATION_REASON_LABELS: Record<QualificationReasonCode, string> = {
  working_over_20_hours: 'Working more than 20 hrs/week (SGA)',
  insufficient_work_history: 'Less than 2 years of work history',
  already_represented: 'Already represented by an attorney',
  no_medical_evidence: 'No current medical evidence',
  assets_over_2000: 'Assets over $2,000',
  assets_unknown: 'Asset value unknown',
  condition_under_12_months: 'Condition under 12 months',
  condition_duration_unknown: 'Condition duration unknown',
  no_recent_doctor: 'No doctor visit in the last 12 months',
  not_expecting_12_months: 'Not expecting 12 months out of work',
  limited_work_history: 'Limited work history (2–4 years)',
  reduced_hours: 'Working 20 hrs/week or less',
  missing_qualification_data: 'Missing qualification answers',
  below_qualification_threshold: 'Score below the qualification threshold',
};

export const QUALIFICATION_TIER_LABELS: Record<QualificationTier, string> = {
  qualified: 'Qualified',
  borderline: 'Borderline',
  disqualified: 'Disqualified',
};

/** Synthetic conversion values used for value-based Meta optimisation (USD). */
export const QUALIFICATION_VALUES: Record<QualificationTier, number> = {
  qualified: 250,
  borderline: 100,
  disqualified: 0,
};

export const QUALIFIED_SCORE_THRESHOLD = 70;
export const BORDERLINE_SCORE_THRESHOLD = 45;

export interface QualificationResult {
  tier: QualificationTier;
  score: number;
  reasons: QualificationReasonCode[];
  value: number;
}

const lower = (value: string | undefined) => (value ?? '').trim().toLowerCase();

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function agePoints(label: string): number {
  switch (lower(label)) {
    case 'under 40':
      return 6;
    case '40-49':
      return 12;
    case '50-54':
      return 18;
    case '55-63':
      return 22;
    case '64 or older':
      return 20;
    default:
      return 0;
  }
}

function workHistoryPoints(label: string): number {
  switch (lower(label)) {
    case 'less than 2 years':
      return 4;
    case 'between 2 and 4 years':
      return 10;
    case 'between 4 and 6 years':
      return 18;
    case 'more than 6 years':
      return 20;
    default:
      return 0;
  }
}

function hoursPoints(label: string): number {
  switch (lower(label)) {
    case 'not working':
      return 15;
    case '20 hours or less per week':
      return 8;
    default:
      return 0;
  }
}

function assetPoints(label: string): number {
  switch (lower(label)) {
    case 'less than $2000':
      return 8;
    case 'not sure':
      return 3;
    default:
      return 0;
  }
}

function conditionPoints(label: string): number {
  switch (lower(label)) {
    case 'more than 1 year ago':
      return 8;
    case '6 to 12 months ago':
      return 4;
    case 'within the last 6 months':
      return 2;
    case "i'm not sure":
      return 3;
    default:
      return 0;
  }
}

/**
 * Scores a submission and assigns a tier.
 *
 * Hard disqualifiers always win over the numeric score. Borderline signals are
 * reported as reason codes so the dashboard and CRM can explain the decision.
 */
export function qualifyLead(answers: Record<string, string>): QualificationResult {
  const reasons: QualificationReasonCode[] = [];
  const hard: QualificationReasonCode[] = [];
  const borderline: QualificationReasonCode[] = [];

  const addHard = (reason: QualificationReasonCode) => {
    if (!hard.includes(reason)) hard.push(reason);
  };
  const addBorderline = (reason: QualificationReasonCode) => {
    if (!borderline.includes(reason)) borderline.push(reason);
  };

  const age = answers.page_uhs14w;
  const work = answers.fiveyearwork;
  const hours = answers.page_sm72h5;
  const assets = answers.page_lyensr;
  const attorney = answers.attorney;
  const attorneyFirm = answers.attorneyfirm;
  const doctor = answers.visit;
  const lastDoctor = answers.page_zbkz5e;
  const condition = answers.conditionstart;
  const outOfWork = answers.outofwork;

  let score = 0;
  let missingCore = false;

  // --- 1. Substantial gainful activity -------------------------------------
  if (hours === undefined || hours.trim() === '') {
    missingCore = true;
  } else if (lower(hours) === 'more than 20 hours per week') {
    addHard('working_over_20_hours');
  } else {
    score += hoursPoints(hours);
    if (lower(hours) === '20 hours or less per week') addBorderline('reduced_hours');
  }

  // --- 2. Past relevant work / insured status ------------------------------
  if (work === undefined || work.trim() === '') {
    missingCore = true;
  } else {
    score += workHistoryPoints(work);
    if (lower(work) === 'less than 2 years') {
      addHard('insufficient_work_history');
    } else if (lower(work) === 'between 2 and 4 years') {
      addBorderline('limited_work_history');
    }
  }

  // --- 3. Representation ----------------------------------------------------
  if (lower(attorney) === 'yes' || (attorneyFirm ?? '').trim() !== '') {
    addHard('already_represented');
  } else if (lower(attorney) === 'no') {
    score += 10;
  }

  // --- 4. Medical determinable impairment ----------------------------------
  if (doctor === undefined || doctor.trim() === '') {
    missingCore = true;
  } else if (lower(doctor) === 'yes') {
    score += 18;
  } else {
    const visit = lower(lastDoctor);
    if (visit.startsWith('within last 12')) {
      score += 8;
    } else if (visit.startsWith('more than 12')) {
      addBorderline('no_recent_doctor');
    } else if (visit.includes("haven't had one")) {
      addHard('no_medical_evidence');
    } else {
      missingCore = true;
    }
  }

  // --- 5. Duration ----------------------------------------------------------
  if (condition !== undefined && condition.trim() !== '') {
    score += conditionPoints(condition);
    if (lower(condition) === '6 to 12 months ago') addBorderline('condition_under_12_months');
    if (lower(condition) === 'within the last 6 months') {
      addBorderline('condition_under_12_months');
    }
    if (lower(condition) === "i'm not sure") addBorderline('condition_duration_unknown');
  }

  // --- 6. Age ---------------------------------------------------------------
  if (age === undefined || age.trim() === '') {
    missingCore = true;
  } else {
    score += agePoints(age);
  }

  // --- 7. SSI asset ceiling -------------------------------------------------
  if (assets !== undefined && assets.trim() !== '') {
    if (lower(assets) === 'more than $2000') {
      addBorderline('assets_over_2000');
    } else {
      score += assetPoints(assets);
      if (lower(assets) === 'not sure') addBorderline('assets_unknown');
    }
  }

  // --- 8. 12-month out-of-work expectation ---------------------------------
  if (outOfWork !== undefined && outOfWork.trim() !== '') {
    if (lower(outOfWork) === 'yes') {
      score += 8;
    } else {
      addBorderline('not_expecting_12_months');
    }
  }

  if (missingCore) addBorderline('missing_qualification_data');

  score = clampScore(score);

  let tier: QualificationTier;
  if (hard.length > 0) {
    tier = 'disqualified';
  } else if (score >= QUALIFIED_SCORE_THRESHOLD) {
    tier = 'qualified';
  } else if (score >= BORDERLINE_SCORE_THRESHOLD) {
    tier = 'borderline';
  } else {
    tier = 'disqualified';
    addBorderline('below_qualification_threshold');
  }

  reasons.push(...hard, ...borderline);

  return {
    tier,
    score,
    reasons,
    value: QUALIFICATION_VALUES[tier],
  };
}

/**
 * Deterministic UUID used for server-generated conversion events. Retrying the
 * same lead/disposition therefore produces the same `event_id`, which Meta
 * deduplicates exactly like the Pixel/CAPI pair.
 */
export function deterministicUuid(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);

  return [
    hex.slice(0, 8).join(''),
    hex.slice(8, 12).join(''),
    hex.slice(12, 16).join(''),
    hex.slice(16, 20).join(''),
    hex.slice(20, 32).join(''),
  ].join('-');
}
