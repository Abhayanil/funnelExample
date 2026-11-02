const fs = require('fs');
const s = fs.readFileSync('funnel_data/bundle.js', 'utf8');

function sliceBalanced(startIdx, open, close) {
  let depth = 0, inStr = null, esc = false;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return s.slice(startIdx, i + 1); }
  }
  return null;
}

const vStart = s.indexOf('var v=[');
const vSrc = sliceBalanced(s.indexOf('[', vStart), '[', ']');
const questions = eval('(' + vSrc + ')');

const eeStart = s.indexOf('var ee=');
const eeSrc = sliceBalanced(s.indexOf('{', eeStart), '{', '}');

// Stub the external deps the routing map uses
const Z = () => undefined; // localStorage context -> unknown
const ee = eval('(' + eeSrc + ')');

const ids = questions.map(q => q.id);
const nextOf = (qid, answer) => {
  const cond = ee[qid];
  if (cond) {
    const target = cond(answer);
    if (target) {
      const i = questions.findIndex(q => q.id === target);
      if (i !== -1) return questions[i].id;
    }
  }
  const i = questions.findIndex(q => q.id === qid);
  return i === questions.length - 1 ? 'email' : questions[i + 1].id;
};

const graph = questions.map(q => ({
  id: q.id,
  phLabel: q.phLabel,
  dlKey: q.dlKey,
  question: q.question,
  type: q.type,
  options: q.options.map(o => ({
    label: o.label,
    value: o.value,
    next: nextOf(q.id, o.value),
  })),
  defaultNext: nextOf(q.id, '__none__'),
  conditional: !!ee[q.id],
}));

fs.writeFileSync('funnel_definition.json', JSON.stringify(graph, null, 2));
console.log('questions:', questions.length);
for (const g of graph) {
  console.log(`\n[${g.id}] ${g.phLabel} :: ${g.question.replace(/<[^>]+>/g, ' ')}`);
  for (const o of g.options) console.log(`   - ${o.label}  ->  ${o.next}`);
}
console.log('\nconditional routes:', Object.keys(ee).join(', '));
