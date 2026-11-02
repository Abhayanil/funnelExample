/**
 * crawl_funnel.js
 *
 * Crawls the Disability Path qualification funnel and maps every question,
 * every answer option, and where each answer leads.
 *
 * How it works:
 *  - The funnel is a React SPA. Each question is its own route:
 *      /qualification-v30/<question_id>
 *  - Deep routes load standalone (no state guard), so the crawler navigates
 *    to each route directly and clicks each option to observe its destination.
 *    This avoids replaying every answer from the start (2^N paths) and keeps
 *    the crawl to roughly (questions x options) page loads.
 *  - A second pass replays the paths whose routing depends on stored answers
 *    (localStorage "dl_context"), which a direct route load cannot reveal.
 *
 * Outputs:
 *  - funnel_report.json  : full graph (nodes, options, edges, terminal pages)
 *  - funnel_report.md    : human-readable question/answer map
 *  - funnel_shots/*.png  : screenshot of every captured step
 *
 * Note: the crawler stops at the contact step. It never submits an email,
 * name, or phone number to the live form.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = 'https://funnel.disabilitypath.org';
const ROOT = `${SITE}/qualification-v30`;
const OUT_DIR = 'funnel_shots';
const MAX_ROUTES = 80;
const SETTLE_MS = 500;
const NAV_TIMEOUT = 8000;

fs.mkdirSync(OUT_DIR, { recursive: true });

const slug = url => {
  const p = new URL(url).pathname.replace(/^\/qualification-v30\/?/, '');
  return p === '' ? 'start' : p.replace(/[^a-z0-9_-]+/gi, '_');
};

/** Navigate and wait for the app to render a heading. "networkidle" never
 *  settles here because analytics/TrustedForm keep connections open. */
async function gotoStep(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page
    .waitForFunction(() => !!(document.querySelector('h1') || document.querySelector('h2')), null, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

/** Reads the currently rendered step: heading, options, fields. */
async function readStep(page) {
  return page.evaluate(() => {
    const clean = t => (t || '').replace(/\s+/g, ' ').trim();
    const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const inChrome = el => !!(el.closest('footer') || el.closest('header'));

    const buttons = Array.from(document.querySelectorAll('button'))
      .filter(b => visible(b) && !inChrome(b))
      .map((b, i) => {
        b.setAttribute('data-crawl-idx', String(i));
        return { index: i, text: clean(b.innerText) };
      })
      .filter(b => b.text);

    const h1 = document.querySelector('h1');
    const h2 = document.querySelector('h2');

    return {
      url: location.href,
      phase: location.pathname.endsWith('/email') ? 'email'
        : location.pathname.endsWith('/contact') ? 'contact'
        : location.pathname.endsWith('/result') ? 'result'
        : location.pathname === '/qualification-v30' ? 'start'
        : 'question',
      headline: clean(h1?.innerText),
      question: clean(h2?.innerText) || clean(h1?.innerText),
      buttons,
      fields: Array.from(document.querySelectorAll('input,select,textarea')).map(i => ({
        tag: i.tagName,
        type: i.type,
        name: i.name,
        placeholder: i.placeholder,
      })),
      pageText: clean(document.body.innerText).slice(0, 2000),
    };
  });
}

/** Clicks an option and waits until the route (or the question) changes. */
async function clickOption(page, index) {
  const before = page.url();
  const beforeQ = (await readStep(page)).question;

  const target = page.locator(`button[data-crawl-idx="${index}"]`).first();
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ timeout: 15000 });

  const changed = await page
    .waitForFunction(
      prev => location.href !== prev.url || (document.querySelector('h2, h1')?.innerText || '').trim() !== prev.q,
      { url: before, q: beforeQ },
      { timeout: NAV_TIMEOUT }
    )
    .then(() => true)
    .catch(() => false);

  await page.waitForTimeout(SETTLE_MS);
  return { changed, url: page.url() };
}

async function capture(page, step) {
  const file = `${String(step).padStart(2, '0')}_${slug(page.url())}.png`;
  await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
  return path.join(OUT_DIR, file);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));

  const nodes = [];        // every captured step
  const edges = [];        // { from, option, optionIndex, to, toQuestion }
  const seen = new Set();  // routes already expanded
  const queue = [];        // routes waiting to be expanded
  let stepNo = 1;

  // ---------- 1. Intro / opt-in gate ----------
  console.log(`Navigating to ${ROOT} ...`);
  await gotoStep(page, ROOT);

  const intro = await readStep(page);
  intro.id = 'start';
  intro.step = stepNo;
  intro.screenshot = await capture(page, stepNo++);
  nodes.push(intro);
  console.log(`Intro: "${intro.headline}" / "${intro.question}" (${intro.buttons.length} options)`);

  for (const btn of intro.buttons) {
    await gotoStep(page, ROOT);
    const fresh = await readStep(page);
    const option = fresh.buttons[btn.index];
    if (!option) continue;

    const nav = await clickOption(page, option.index);
    const next = await readStep(page);
    edges.push({
      from: 'start',
      option: option.text,
      optionIndex: option.index,
      to: slug(nav.url),
      toQuestion: next.question,
    });
    console.log(`  start -> "${option.text}" -> ${slug(nav.url)}`);
    if (next.phase === 'question' && !seen.has(slug(nav.url))) queue.push(nav.url);
    seen.add(slug(nav.url));
  }

  // ---------- 2. BFS over question routes ----------
  async function expandQueue() {
    while (queue.length && seen.size <= MAX_ROUTES) {
      const routeUrl = queue.shift();
      const routeId = slug(routeUrl);
      if (nodes.some(n => n.id === routeId)) continue;

      await gotoStep(page, routeUrl);
      const step = await readStep(page);

      // A route can redirect (e.g. unknown slug); skip if it is not the requested one
      if (slug(step.url) !== routeId) {
        console.log(`  ${routeId} redirected to ${slug(step.url)}, skipping`);
        continue;
      }

      step.id = routeId;
      step.step = stepNo;
      step.screenshot = await capture(page, stepNo++);
      nodes.push(step);
      console.log(`Step ${step.step}: [${routeId}] "${step.question}" (${step.buttons.length} options)`);

      // Re-read before every option: each click may repaint the DOM
      const options = step.buttons.map(b => b.index);
      for (const optionIndex of options) {
        await gotoStep(page, routeUrl);
        const fresh = await readStep(page);
        const option = fresh.buttons.find(b => b.index === optionIndex) || fresh.buttons[optionIndex];
        if (!option) continue;

        const nav = await clickOption(page, option.index);
        const next = await readStep(page);
        const toId = slug(nav.url);

        edges.push({
          from: routeId,
          option: option.text,
          optionIndex: option.index,
          to: toId,
          toQuestion: next.question,
          urlChanged: nav.changed,
        });
        console.log(`  [${routeId}] "${option.text}" -> ${toId}`);

        if (next.phase === 'question' && !seen.has(toId)) {
          seen.add(toId);
          queue.push(nav.url);
        } else {
          seen.add(toId);
        }
      }
    }
  }

  await expandQueue();

  // ---------- 2b. State-dependent branches ----------
  // Routing that reads stored answers (localStorage dl_context) is invisible
  // when a route is opened directly. Replay those answer paths end-to-end.
  async function replay(answers) {
    const trail = [];
    await gotoStep(page, ROOT);
    for (const answer of answers) {
      const at = await readStep(page);
      const option = at.buttons.find(b => b.text.toLowerCase() === answer.toLowerCase());
      if (!option) {
        throw new Error(`option "${answer}" not found at ${slug(page.url())}: ${at.buttons.map(b => b.text).join(' | ')}`);
      }
      const from = slug(page.url());
      await clickOption(page, option.index);
      trail.push({ from, option: option.text, to: slug(page.url()), toQuestion: (await readStep(page)).question });
    }
    return { end: await readStep(page), trail };
  }

  const conditionalPaths = [
    {
      name: 'not working + expects 1yr out of work',
      note: 'only when "hours per week" was answered "Not working"',
      answers: [
        'YES',                                                     // landing gate
        'I am not receiving any disability benefits (SSD or SSI)', // Q1
        'Not working',                                             // Q2
        'More than 12 months ago',                                 // Q2b
        'More than 6 years',                                       // Q3
        'YES',                                                     // Q5 -> conditionstart
      ],
    },
  ];

  for (const p of conditionalPaths) {
    try {
      const { end, trail } = await replay(p.answers);
      const id = slug(end.url);
      console.log(`Conditional path "${p.name}" ends at [${id}] "${end.question}"`);

      // Record the edges that only exist with the stored answer history
      for (const hop of trail) {
        const known = edges.some(e => e.from === hop.from && e.option === hop.option && e.to === hop.to);
        if (!known) {
          edges.push({ ...hop, note: p.note, viaReplay: true });
        }
      }

      if (end.phase === 'question' && !nodes.some(n => n.id === id)) {
        seen.add(id);
        queue.push(end.url);
      }
    } catch (e) {
      console.log(`Conditional path "${p.name}" failed: ${e.message}`);
    }
  }

  await expandQueue();

  // ---------- 3. Terminal pages (read only, nothing submitted) ----------
  const terminals = [];
  for (const [id, url] of [['email', `${ROOT}/email`], ['contact', `${ROOT}/contact`], ['result', `${ROOT}/result`]]) {
    await gotoStep(page, url);
    const t = await readStep(page);
    t.id = id;
    t.step = stepNo;
    t.screenshot = await capture(page, stepNo++);
    terminals.push(t);
    nodes.push(t);
    console.log(`Terminal: [${id}] "${t.question}"`);
  }

  // ---------- 4. Report ----------
  const questionNodes = nodes.filter(n => n.phase === 'question');
  const unvisitedQuestions = questionNodes
    .filter(n => !edges.some(e => e.from === n.id))
    .map(n => n.id);

  const report = {
    crawledAt: new Date().toISOString(),
    target: ROOT,
    stats: {
      questions: questionNodes.length,
      answerOptions: nodes
        .filter(n => n.phase === 'question' || n.phase === 'start')
        .reduce((sum, n) => sum + n.buttons.length, 0),
      optionsPerQuestion: Object.fromEntries(nodes.map(n => [n.id, n.buttons.length])),
      terminalPages: terminals.length,
      screenshots: nodes.filter(n => n.screenshot).length,
      conditionalEdges: edges.filter(e => e.viaReplay).length,
    },
    nodes: nodes.map(({ pageText, ...n }) => ({ ...n, pageTextPreview: pageText.slice(0, 400) })),
    edges,
    terminals: terminals.map(({ pageText, ...t }) => ({ ...t, pageText })),
    unvisitedQuestions,
    consoleErrors,
  };

  fs.writeFileSync('funnel_report.json', JSON.stringify(report, null, 2));

  // ---------- 5. Markdown map ----------
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const lines = [
    '# Funnel map — Disability Path qualification',
    '',
    `Source: ${ROOT}`,
    `Crawled: ${report.crawledAt}`,
    '',
    `Questions: **${report.stats.questions}** · Answer options: **${report.stats.answerOptions}** · Terminal pages: **${report.stats.terminalPages}**`,
    '',
    '---',
    '',
  ];

  for (const node of nodes.filter(n => n.phase === 'question' || n.phase === 'start')) {
    lines.push(`## ${node.step}. ${node.question || '(no question text)'}`);
    if (node.id === 'start') lines.push('', `*Landing headline:* ${node.headline}`);
    if (node.pageTextPreview && node.id !== 'start') {
      const sub = node.pageTextPreview
        .replace(node.question, '')
        .replace(/DP Disability Path|Terms·Privacy policy/g, '')
        .trim();
      if (sub && sub.length < 160) lines.push('', `*Subtext:* ${sub}`);
    }
    lines.push('', `Route: \`${node.url.replace(SITE, '')}\``, '');
    lines.push('| Answer | Goes to | Next question |');
    lines.push('| --- | --- | --- |');
    for (const e of edges.filter(e => e.from === node.id)) {
      const dest = byId[e.to];
      const label = dest ? `\`${e.to}\` (${dest.phase})` : `\`${e.to}\``;
      const note = e.note ? ` — *${e.note}*` : '';
      lines.push(`| ${e.option.replace(/\|/g, '\\|')} | ${label}${note} | ${(e.toQuestion || '—').replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }

  lines.push('## Terminal pages (no data submitted)', '');
  lines.push(
    'The post-question flow is `/email` → `/contact` → `/result`. Each page was opened directly; ' +
    'no email, name, or phone number was entered, so the form submissions themselves were not exercised.',
    ''
  );
  for (const t of report.terminals) {
    lines.push(`### ${t.id} — ${t.question || '(no heading)'}`, '');
    lines.push(`Route: \`${t.url.replace(SITE, '')}\``, '');
    if (t.fields.length) lines.push('Fields: ' + t.fields.map(f => `${f.name || f.type} (${f.placeholder || f.type})`).join(', '), '');
    if (t.buttons.length) lines.push('Buttons: ' + t.buttons.map(b => `"${b.text}"`).join(', '), '');
    lines.push('');
  }

  fs.writeFileSync('funnel_report.md', lines.join('\n'));

  console.log(`\nDone. ${report.stats.questions} questions, ${report.stats.answerOptions} answer options, ${report.stats.terminalPages} terminal pages.`);
  console.log('Wrote funnel_report.json, funnel_report.md, and screenshots in funnel_shots/');
  if (unvisitedQuestions.length) console.log('Not expanded:', unvisitedQuestions.join(', '));
  if (consoleErrors.length) console.log('Page errors:', consoleErrors.slice(0, 3));

  await browser.close();
})();
