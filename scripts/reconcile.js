/**
 * reconcile.js — compares the Playwright crawl against the funnel's own
 * question definition (extracted from the JS bundle) and prints any drift.
 */
const fs = require('fs');

const report = JSON.parse(fs.readFileSync('funnel_report.json', 'utf8'));
const definition = JSON.parse(fs.readFileSync('funnel_definition.json', 'utf8'));

const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const edgesBy = from => report.edges.filter(e => e.from === from);

const problems = [];
let checkedOptions = 0;

for (const q of definition) {
  const node = report.nodes.find(n => n.id === q.id && n.phase === 'question');
  if (!node) { problems.push({ id: q.id, issue: 'question route not crawled' }); continue; }

  if (norm(node.question) !== norm(q.question.replace(/<[^>]+>/g, ' '))) {
    problems.push({ id: q.id, issue: 'question text differs', crawled: node.question, bundle: q.question.replace(/<[^>]+>/g, ' ').trim() });
  }

  const crawledEdges = edgesBy(q.id);
  const crawledLabels = crawledEdges.map(e => norm(e.option));
  const bundleLabels = q.options.map(o => norm(o.label));
  checkedOptions += bundleLabels.length;

  for (const label of bundleLabels) {
    if (!crawledLabels.includes(label)) problems.push({ id: q.id, issue: 'option missing in crawl', option: label });
  }
  for (const label of crawledLabels) {
    if (!bundleLabels.includes(label)) problems.push({ id: q.id, issue: 'option not in bundle', option: label });
  }

  for (const edge of crawledEdges) {
    if (edge.viaReplay) continue; // state-dependent edge, checked separately
    const def = q.options.find(o => norm(o.label) === norm(edge.option));
    if (!def) continue;
    if (def.next !== edge.to) {
      problems.push({ id: q.id, option: def.label, issue: 'routing differs', bundleNext: def.next, crawledNext: edge.to });
    }
  }
}

// Routes reachable only with stored answers
const conditionalOnly = report.nodes
  .filter(n => n.phase === 'question')
  .filter(n => !definition.some(q => q.id === n.id))
  .map(n => n.id);

console.log(`Questions in bundle: ${definition.length}`);
console.log(`Questions crawled:   ${report.nodes.filter(n => n.phase === 'question').length}`);
console.log(`Options compared:    ${checkedOptions}`);
console.log(`Edges crawled:       ${report.edges.length}`);
console.log(`Unvisited questions: ${report.unvisitedQuestions.length}`);
console.log(`Conditional-only routes in crawl: ${conditionalOnly.length ? conditionalOnly.join(', ') : 'none'}`);
console.log(`Drift findings: ${problems.length}`);
for (const p of problems) console.log(' -', JSON.stringify(p));
