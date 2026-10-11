import { randomUUID } from 'node:crypto';

export const SECTION_STATUSES = ['Not started', 'Drafting', 'Ready for review'];
export const SIGNOFF_HEADING = 'Review and sign-off';
const PLACEHOLDER = '[To be completed]';

// Standard technical accounting memorandum structure. Aliases let headings saved
// in workspace settings or company templates pick up the same drafting guidance.
export const MEMO_GUIDE = [
  { key: 'summary', heading: 'Executive summary', aliases: ['summary', 'summary of conclusions'], hint: 'One short paragraph per issue: the question, the conclusion reached, and the most significant judgment. Write this last.' },
  { key: 'purpose', heading: 'Purpose and scope', aliases: ['purpose', 'scope', 'brief'], hint: 'Why the memo is being prepared, the transaction and reporting period it covers, and anything explicitly out of scope.' },
  { key: 'background', heading: 'Background and key facts', aliases: ['background and facts', 'background', 'facts'], hint: 'Entity, counterparties, contract terms, dates, and amounts. Record verified facts only, cite the evidence for each, and flag management representations.' },
  { key: 'issues', heading: 'Accounting issues', aliases: ['accounting questions', 'issues', 'questions'], hint: 'Number each question the memo must answer (Issue 1, Issue 2…), phrased so the analysis can resolve it.' },
  { key: 'guidance', heading: 'Authoritative guidance', aliases: ['applicable guidance', 'relevant guidance', 'guidance', 'selected standards'], hint: 'Quote or summarise the specific paragraphs relied on, with references. Add interpretive guidance only where it goes beyond the standard.' },
  { key: 'analysis', heading: 'Analysis', aliases: ['analysis and alternatives'], hint: 'For each issue, apply the guidance to the facts, set out the alternatives considered and why each was accepted or rejected, and cite evidence.' },
  { key: 'conclusion', heading: 'Conclusion', aliases: ['conclusions', 'conclusion — pending review'], hint: 'The answer to each issue in plain terms, the key judgments made, and any conditions the conclusion depends on.' },
  { key: 'impact', heading: 'Financial statement impact', aliases: ['financial statement effect', 'accounting entries', 'journal entries'], hint: 'Journal entries, line items, and amounts affected by period, including any prior-period or comparative effects.' },
  { key: 'disclosure', heading: 'Presentation and disclosure', aliases: ['disclosure considerations', 'disclosures', 'disclosure'], hint: 'Required disclosures, significant judgments and estimates to disclose, and any presentation changes.' },
  { key: 'controls', heading: 'Internal control considerations', aliases: ['internal controls', 'controls'], hint: 'Controls over the judgments and data used, new processes required, and who owns them.' },
  { key: 'references', heading: 'References and evidence', aliases: ['project evidence', 'selected project evidence', 'references', 'evidence'], hint: 'The documents relied on. Refer to them in the text as [1], [2]…' },
  { key: 'checklist', heading: 'Review checklist', aliases: ['completion checklist'], hint: 'Points the reviewer should confirm before the memo is circulated.', optional: true }
];
export const DEFAULT_MEMO_HEADINGS = MEMO_GUIDE.filter(g => !g.optional).map(g => g.heading);

const normalise = text => text.toLowerCase().replace(/^\d+(\.\d+)*\.?\s+/, '').trim();
export function guideFor(heading) {
  const key = normalise(heading);
  return MEMO_GUIDE.find(g => normalise(g.heading) === key || g.aliases.includes(key));
}

const sectionId = () => randomUUID().slice(0, 8);
const today = () => new Date().toISOString().slice(0, 10);

export function buildMemo({ params, project, resources, headings, author = '' }) {
  const evidence = resources.map((r, i) => `- [${i + 1}] ${r.name}${r.kind === 'template' ? ' (company template)' : ''}`).join('\n');
  const prefill = {
    purpose: params.problem,
    background: `Client: ${project.client}. Financial year end: ${project.fy}.`,
    guidance: params.standards?.length ? `Framework: ${params.gaap}.\n\n${params.standards.map(s => `- ${s} — cite the paragraphs relied on.`).join('\n')}` : `Framework: ${params.gaap}.`,
    references: evidence,
    checklist: '- Facts are complete, accurate, and supported by evidence.\n- Framework and authoritative guidance are confirmed.\n- Alternatives, assumptions, and judgments are documented.\n- Reviewer approval obtained before circulation.'
  };
  const sections = headings.map(heading => ({ id: sectionId(), heading, body: prefill[guideFor(heading)?.key] || '', status: 'Not started' }));
  const has = key => sections.some(s => guideFor(s.heading)?.key === key);
  // The brief and evidence must stay traceable even when a template omits those sections.
  if (!has('purpose') && sections.length) sections[0].body = [params.problem, sections[0].body].filter(Boolean).join('\n\n');
  if (!has('references') && evidence) sections.push({ id: sectionId(), heading: 'References and evidence', body: evidence, status: 'Not started' });
  return {
    header: { to: '', from: author, cc: '', date: today() },
    signoff: { preparer: author, reviewer: '', approver: '' },
    sections
  };
}

export function composeMemo({ title, memo, project, gaap }) {
  const { header = {}, signoff = {}, sections = [] } = memo;
  const lines = [`# ${title}`, ''];
  for (const [label, key] of [['To', 'to'], ['From', 'from'], ['CC', 'cc'], ['Date', 'date']]) if (header[key]) lines.push(`${label}: ${header[key]}`);
  if (project) lines.push(`Client: ${project.client} · Financial year end: ${project.fy}${gaap ? ` · Framework: ${gaap}` : ''}`);
  for (const section of sections) lines.push('', `## ${section.heading}`, '', section.body.trim() || PLACEHOLDER);
  lines.push('', `## ${SIGNOFF_HEADING}`, '', `- Prepared by: ${signoff.preparer || '[Pending]'}`, `- Reviewed by: ${signoff.reviewer || '[Pending]'}`, `- Approved by: ${signoff.approver || '[Pending]'}`);
  return lines.join('\n');
}

// Recovers structure from a Markdown body for memos saved before sections
// existed, or edited as plain Markdown. Inverse of composeMemo.
export function memoFromBody(body) {
  const header = { to: '', from: '', cc: '', date: '' };
  const signoff = { preparer: '', reviewer: '', approver: '' };
  const sections = [];
  const preamble = [];
  let current = null;
  for (const line of body.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = { id: sectionId(), heading: heading[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) current.lines.push(line);
    else if (!/^# /.test(line)) {
      const field = /^(To|From|CC|Date): (.*)$/.exec(line);
      if (field) header[field[1].toLowerCase()] = field[2].trim();
      else if (!/^Client: .* · Financial year end: /.test(line)) preamble.push(line);
    }
  }
  const signoffIndex = sections.findIndex(s => s.heading === SIGNOFF_HEADING);
  if (signoffIndex >= 0) {
    const notes = [];
    for (const line of sections[signoffIndex].lines) {
      const field = /^- (Prepared|Reviewed|Approved) by: (.*)$/.exec(line);
      if (field) signoff[{ Prepared: 'preparer', Reviewed: 'reviewer', Approved: 'approver' }[field[1]]] = field[2].trim() === '[Pending]' ? '' : field[2].trim();
      else notes.push(line);
    }
    // Anything else written under the sign-off heading is kept rather than dropped.
    if (notes.join('').trim()) sections[signoffIndex] = { id: sectionId(), heading: 'Notes', lines: notes };
    else sections.splice(signoffIndex, 1);
  }
  const intro = preamble.join('\n').trim();
  if (intro) sections.unshift({ id: sectionId(), heading: 'Overview', lines: [intro] });
  return {
    header,
    signoff,
    sections: sections.map(({ id, heading, lines }) => {
      const text = lines.join('\n').trim();
      const content = text === PLACEHOLDER ? '' : text;
      return { id, heading, body: content, status: content ? 'Drafting' : 'Not started' };
    })
  };
}
