import type { FunnelGraph, FunnelOption, FunnelStep } from './types';
import graphJson from './graph.json';

export const graph = graphJson as FunnelGraph;

const stepIndex = new Map<string, FunnelStep>(graph.steps.map(step => [step.id, step]));

export function getStep(id: string): FunnelStep {
  const step = stepIndex.get(id);
  if (!step) throw new Error(`Unknown funnel step: ${id}`);
  return step;
}

export function hasStep(id: string): boolean {
  return stepIndex.has(id);
}

/** Resolves an option to its destination, honouring state-dependent branches. */
export function resolveTarget(option: FunnelOption, answers: Record<string, string>): string {
  const matches = option.when?.every(condition => answers[condition.step] === condition.equals);
  if (matches) return option.next;
  return option.fallback ?? option.next;
}

export function nextStepId(
  currentStepId: string,
  answer: string,
  answers: Record<string, string>
): string | null {
  const step = getStep(currentStepId);
  const option = step.options?.find(candidate => candidate.label === answer);
  if (!option) return null;
  return resolveTarget(option, answers);
}

export interface Progress {
  current: number;
  total: number;
  percent: number;
}

/**
 * The graph is a DAG, not a fixed-length quiz: branches differ in length.
 * `answered` is how many steps the user has completed; `remaining` is the
 * shortest distance from the current step to the result page.
 */
export function progressFor(currentStepId: string, answered: number): Progress {
  const step = getStep(currentStepId);
  const remaining = Math.max(step.remaining, 0);
  const total = Math.max(answered + remaining, 1);
  const current = Math.min(answered + 1, total);
  const percent = Math.round((answered / (answered + remaining || 1)) * 100);
  return { current, total, percent: step.kind === 'result' ? 100 : Math.min(percent, 99) };
}

export function countUnanswered(graphData: FunnelGraph, answers: Record<string, string>): number {
  return graphData.steps.filter(
    step => (step.kind === 'question' || step.kind === 'landing') && !answers[step.id]
  ).length;
}
