'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { graph, getStep, nextStepId, progressFor } from '@/lib/funnel/engine';
import type { ContactStepValues } from '@/lib/leads/schema';
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/leads/consent';
import {
  newEventId,
  readCookie,
  trackDualEvent,
  trackPixel,
} from '@/lib/telemetry/client';
import StepCard from './StepCard';
import EmailStep from './EmailStep';
import ContactStep from './ContactStep';
import ResultStep from './ResultStep';
import styles from './funnel.module.css';

const STORAGE_KEY = 'lexhive.funnel.v1';

interface Persisted {
  stepId: string;
  history: string[];
  answers: Record<string, string>;
  sessionId: string;
  submissionId: string;
  leadEventId: string;
  initEventId: string;
  initTracked: boolean;
  submitted: boolean;
  leadId?: string;
  startedAt: number;
}

const blank = (): Persisted => ({
  stepId: graph.start,
  history: [graph.start],
  answers: {},
  sessionId: '',
  submissionId: '',
  leadEventId: '',
  initEventId: '',
  initTracked: false,
  submitted: false,
  startedAt: Date.now(),
});

export default function Funnel() {
  const [state, setState] = useState<Persisted>(blank);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const prefersReducedMotion = useReducedMotion();
  const initFiredRef = useRef(false);
  const submitLock = useRef(false);
  const previousStep = useRef(state.stepId);
  const landingUrl = useRef<string>('');

  /* ---------- session bootstrap ---------- */
  useEffect(() => {
    landingUrl.current = window.location.href;

    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Persisted;
        if (typeof parsed.stepId === 'string' && graph.steps.some(step => step.id === parsed.stepId)) {
          setState({ ...blank(), ...parsed });
          setHydrated(true);
          return;
        }
      } catch {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    }

    setState({
      ...blank(),
      sessionId: newEventId(),
      submissionId: newEventId(),
      startedAt: Date.now(),
    });
    setHydrated(true);
  }, []);

  /* ---------- persistence ---------- */
  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  /* ---------- InitiateCheckout (browser + CAPI, shared event_id) ---------- */
  useEffect(() => {
    if (!hydrated || state.initTracked || initFiredRef.current) return;
    initFiredRef.current = true;

    const eventId = state.initEventId || newEventId();
    trackDualEvent({
      eventName: 'InitiateCheckout',
      eventId,
      sessionId: state.sessionId,
      stepId: graph.start,
      stepIndex: 0,
      params: { content_name: 'Disability benefits intake', funnel_version: graph.version },
    });
    setState(previous => ({ ...previous, initEventId: eventId, initTracked: true }));
  }, [hydrated, state.initTracked, state.initEventId, state.sessionId]);

  /* ---------- focus + scroll management ---------- */
  useEffect(() => {
    if (!hydrated || previousStep.current === state.stepId) return;
    previousStep.current = state.stepId;

    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-step-heading]')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.stepId, hydrated, prefersReducedMotion]);

  /* ---------- answer handling ---------- */
  const handleSelect = useCallback(
    (label: string) => {
      const step = getStep(state.stepId);
      if (!step.options?.some(option => option.label === label)) return;

      const answers = { ...state.answers, [step.id]: label };
      const next = nextStepId(step.id, label, answers);
      if (!next) return;

      const eventId = newEventId();
      const stepIndex = Math.max(state.history.length - 1, 0);

      trackDualEvent({
        eventName: 'FunnelStepComplete',
        eventId,
        sessionId: state.sessionId,
        stepId: step.id,
        stepIndex,
        params: { step_id: step.id, answer: label, next_step: next },
      });

      setState(previous => ({
        ...previous,
        answers,
        stepId: next,
        history: [...previous.history, next],
      }));
    },
    [state.answers, state.history.length, state.sessionId, state.stepId]
  );

  const handleBack = useCallback(() => {
    if (state.history.length <= 1) return;
    const history = state.history.slice(0, -1);
    const answers = { ...state.answers };
    delete answers[state.stepId];
    setState(previous => ({
      ...previous,
      stepId: history[history.length - 1],
      history,
      answers,
    }));
  }, [state.answers, state.history, state.stepId]);

  const handleEmail = useCallback(
    (email: string) => {
      const eventId = newEventId();
      trackDualEvent({
        eventName: 'FunnelStepComplete',
        eventId,
        sessionId: state.sessionId,
        stepId: 'email',
        stepIndex: Math.max(state.history.length - 1, 0),
        params: { step_id: 'email', email_captured: true },
        user: { email },
      });

      setState(previous => ({
        ...previous,
        answers: { ...previous.answers, email },
        stepId: 'contact',
        history: [...previous.history, 'contact'],
      }));
    },
    [state.history.length, state.sessionId]
  );

  const handleContact = useCallback(
    async (values: ContactStepValues) => {
      if (submitLock.current) return;
      submitLock.current = true;
      setSubmitting(true);
      setSubmitError(undefined);

      const eventId = state.leadEventId || newEventId();
      const email = state.answers.email ?? '';

      setState(previous => ({ ...previous, leadEventId: eventId }));

      // Pixel and CAPI share `eventId`, so Meta collapses the pair.
      trackPixel(
        'Lead',
        {
          content_name: 'Disability benefits intake',
          content_category: 'ssd_qualification',
          value: 1,
          currency: 'USD',
        },
        eventId
      );

      try {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            submissionId: state.submissionId,
            sessionId: state.sessionId,
            eventId,
            funnelVersion: graph.version,
            answers: state.answers,
            contact: { ...values, email },
            consent: {
              accepted: true,
              version: CONSENT_VERSION,
              text: CONSENT_TEXT,
              pageUrl: window.location.href,
            },
            attribution: {
              landingUrl: landingUrl.current,
              referrer: document.referrer || undefined,
              utm: Object.fromEntries(
                [...new URLSearchParams(window.location.search)].filter(([key]) =>
                  key.startsWith('utm_')
                )
              ),
            },
            meta: {
              fbp: readCookie('_fbp'),
              fbc: readCookie('_fbc'),
            },
          }),
        });

        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          leadId?: string;
          error?: string;
        };

        if (!response.ok || data.ok !== true || !data.leadId) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        setState(previous => ({
          ...previous,
          stepId: 'result',
          history: [...previous.history, 'result'],
          submitted: true,
          leadId: data.leadId,
        }));
        setSubmitting(false);
      } catch {
        setSubmitError(
          'We could not submit your details. Please check your connection and try again.'
        );
        setSubmitting(false);
      } finally {
        submitLock.current = false;
      }
    },
    [state.answers, state.history.length, state.leadEventId, state.sessionId, state.submissionId]
  );

  const handleRestart = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    initFiredRef.current = false;
    previousStep.current = graph.start;
    setSubmitError(undefined);
    setState({
      ...blank(),
      sessionId: newEventId(),
      submissionId: newEventId(),
      startedAt: Date.now(),
    });
  }, []);

  const step = getStep(state.stepId);
  const answered = Math.max(state.history.length - 1, 0);
  const progress = progressFor(state.stepId, answered);
  const canBack = state.history.length > 1 && step.kind !== 'result';

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className={styles.page} data-testid="funnel">
      <header className={styles.topbar}>
        <div className={`${styles.wrap} ${styles.topbarInner}`}>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden="true">
              LH
            </span>
            <span className={styles.brandText}>
              LexHive
              <span className={styles.brandSub}>Benefits qualification</span>
            </span>
          </div>
          <span className={styles.secure}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M10 2l6 2.5v5c0 4-2.5 7-6 8.5-3.5-1.5-6-4.5-6-8.5v-5L10 2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            Secure &amp; confidential
          </span>
        </div>
      </header>

      <main className={`${styles.wrap} ${styles.main}`} id="main">
        {!hydrated ? (
          <div className={styles.card} aria-busy="true">
            <div className={styles.skeleton} />
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={state.stepId}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 22, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -14, scale: 0.995 }}
              transition={transition}
            >
              <div className={styles.card}>
                {step.kind === 'landing' || step.kind === 'question' ? (
                  <StepCard
                    step={step}
                    selected={state.answers[step.id]}
                    progress={progress}
                    onSelect={handleSelect}
                    onBack={handleBack}
                    canBack={canBack}
                  />
                ) : step.kind === 'email' ? (
                  <EmailStep
                    title={step.title}
                    question={step.question}
                    submitLabel={step.submitLabel}
                    canBack={canBack}
                    onBack={handleBack}
                    onSubmit={handleEmail}
                  />
                ) : step.kind === 'contact' ? (
                  <ContactStep
                    question={step.question}
                    submitLabel={step.submitLabel}
                    canBack={canBack}
                    submitting={submitting}
                    serverError={submitError}
                    onBack={handleBack}
                    onSubmit={handleContact}
                  />
                ) : (
                  <ResultStep leadId={state.leadId} answers={state.answers} onRestart={handleRestart} />
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        <p className="sr-only" aria-live="polite">
          {hydrated ? `Step ${progress.current} of ${progress.total}: ${step.question}` : 'Loading form'}
        </p>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerInner}`}>
          <p>
            LexHive is a private company and is not affiliated with, endorsed by, or associated with the
            Social Security Administration or any government agency. Maximum possible benefit per SSA;
            individual amounts vary. This site does not provide legal advice.
          </p>
          <p className={styles.footerLinks}>
            <a href="#terms">Terms</a>
            <span aria-hidden="true">·</span>
            <a href="#privacy">Privacy policy</a>
            <span aria-hidden="true">·</span>
            <a href="#accessibility">Accessibility</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
