/**
 * build-funnel-graph.js
 *
 * Converts the Playwright crawl (funnel_report.json) into the declarative
 * graph the React funnel is driven by (src/lib/funnel/graph.json).
 *
 * Run: npm run graph:build
 */
const fs = require('fs');
const path = require('path');

const report = JSON.parse(fs.readFileSync('funnel_report.json', 'utf8'));
const OUT = path.join('src', 'lib', 'funnel', 'graph.json');

const terminalIds = new Set(['email', 'contact', 'result']);

const edgesFrom = id => report.edges.filter(e => e.from === id);

const nodes = report.nodes.filter(n => n.phase !== 'email' && n.phase !== 'contact' && n.phase !== 'result');

// Steps in crawl order, but the terminal chain is appended explicitly.
const steps = nodes.map(node => {
  const step = {
    id: node.id,
    kind: node.phase === 'start' ? 'landing' : 'question',
    headline: node.headline || undefined,
    question: node.question,
  };

  // The crawl captured the condition-start hint inside the question <h2>.
  if (node.id === 'conditionstart') {
    const [q, ...rest] = node.question.split(/(?=An approximate date is fine)/);
    step.question = q.trim();
    step.help = rest.join(' ').trim();
  }

  if (node.phase === 'start') {
    step.subhead = 'You may be eligible for up to $4,152 every month in disability benefits. Answer a few questions to see if you qualify.';
  }

  // Merge duplicate option labels: the crawl records the default destination
  // first and the state-dependent destination as an extra edge with a note.
  const byLabel = new Map();
  for (const edge of edgesFrom(node.id)) {
    const existing = byLabel.get(edge.option);
    if (!existing) {
      byLabel.set(edge.option, { label: edge.option, next: edge.to });
      continue;
    }
    if (edge.viaReplay) {
      existing.conditionalNext = { next: edge.to, note: edge.note };
    }
  }

  step.options = [...byLabel.values()].map(o => {
    if (!o.conditionalNext) return { label: o.label, next: o.next };
    // Conditional destination wins when its condition matches (see engine).
    return {
      label: o.label,
      next: o.conditionalNext.next,
      when: [{ step: 'page_sm72h5', equals: 'Not working' }],
      help: o.conditionalNext.note,
      fallback: o.next,
    };
  });

  return step;
});

// Terminal steps, described from the captured pages.
steps.push(
  {
    id: 'email',
    kind: 'email',
    title: "You're pre-qualified for up to $4,152/month",
    question: 'Where should we send your results?',
    fields: [{ name: 'email', type: 'email', label: 'Email address', placeholder: 'you@example.com', autocomplete: 'email' }],
    submitLabel: 'Send my results',
  },
  {
    id: 'contact',
    kind: 'contact',
    title: 'Final step: enter your contact info',
    question: 'See how much you qualify for.',
    fields: [
      { name: 'firstName', type: 'text', label: 'First name', placeholder: 'Jordan', autocomplete: 'given-name' },
      { name: 'lastName', type: 'text', label: 'Last name', placeholder: 'Rivera', autocomplete: 'family-name' },
      { name: 'phone', type: 'tel', label: 'Mobile number', placeholder: '(555) 123-4567', autocomplete: 'tel' },
    ],
    submitLabel: 'See what I am eligible for',
  },
  {
    id: 'result',
    kind: 'result',
    title: 'Thank you for your time',
    question: 'Last step: a quick 5-minute call.',
  }
);

// Distance to terminal, used for the progress bar / "step X of Y".
const byId = Object.fromEntries(steps.map(s => [s.id, s]));
const dist = {};
const collectTargets = s => [
  ...(s.options || []).flatMap(o => [o.next, o.fallback].filter(Boolean)),
  ...(s.kind === 'email' ? ['contact'] : s.kind === 'contact' ? ['result'] : []),
];
for (const s of steps) dist[s.id] = Infinity;
dist.result = 0;
dist.contact = 1;

for (let pass = 0; pass < steps.length + 2; pass++) {
  let changed = false;
  for (const s of steps) {
    for (const t of collectTargets(s)) {
      if (byId[t] && dist[t] + 1 < dist[s.id]) {
        dist[s.id] = dist[t] + 1;
        changed = true;
      }
    }
  }
  if (!changed) break;
}

for (const s of steps) {
  s.remaining = Number.isFinite(dist[s.id]) ? dist[s.id] : 0;
}

const graph = {
  version: 'qualification-v30',
  generatedAt: new Date().toISOString(),
  source: report.target,
  start: 'start',
  terminal: 'result',
  steps,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(graph, null, 2) + '\n');

const q = steps.filter(s => s.kind !== 'result').length;
const opts = steps.reduce((n, s) => n + (s.options?.length || 0), 0);
console.log(`Wrote ${OUT}`);
console.log(`${steps.length} steps (${q} interactive), ${opts} answer options, start distance ${dist.start}`);
