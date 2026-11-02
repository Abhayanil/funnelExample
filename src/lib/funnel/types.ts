export type StepKind = 'landing' | 'question' | 'email' | 'contact' | 'result';

export interface Condition {
  step: string;
  equals: string;
}

export interface FunnelOption {
  label: string;
  next: string;
  /** When every condition matches, `next` is used instead of `fallback`. */
  when?: Condition[];
  fallback?: string;
  help?: string;
}

export interface FieldDef {
  name: string;
  type: 'text' | 'email' | 'tel';
  label: string;
  placeholder?: string;
  autocomplete?: string;
}

export interface FunnelStep {
  id: string;
  kind: StepKind;
  headline?: string;
  title?: string;
  question: string;
  help?: string;
  subhead?: string;
  options?: FunnelOption[];
  fields?: FieldDef[];
  submitLabel?: string;
  /** Shortest number of steps from this step to the result page. */
  remaining: number;
}

export interface FunnelGraph {
  version: string;
  generatedAt: string;
  source: string;
  start: string;
  terminal: string;
  steps: FunnelStep[];
}
