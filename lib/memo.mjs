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
];
export const DEFAULT_MEMO_HEADINGS = MEMO_GUIDE.map(g => g.heading);

// Engagement documents are chosen in Memo Base and the checklist lives in Review
// and Completion, so these headings are kept out of the Builder's sections.
const NON_BUILDER_HEADINGS = ['references and evidence', 'project evidence', 'selected project evidence', 'references', 'evidence', 'review checklist', 'completion checklist'];
export const COMPLETION_CHECKLIST = [
  { id: 'facts', text: 'Facts are complete, accurate, and supported by evidence.' },
  { id: 'guidance', text: 'Framework and authoritative guidance are confirmed.' },
  { id: 'judgments', text: 'Alternatives, assumptions, and judgments are documented.' },
  { id: 'approval', text: 'Reviewer approval obtained before circulation.' }
];

const normalise = text => text.toLowerCase().replace(/^\d+(\.\d+)*\.?\s+/, '').trim();
export const isBuilderHeading = heading => !NON_BUILDER_HEADINGS.includes(normalise(heading));
export const allSectionsReady = sections => sections.length > 0 && sections.every(s => s.status === 'Ready for review');
const emptyCompletion = () => Object.fromEntries(COMPLETION_CHECKLIST.map(item => [item.id, false]));
export function guideFor(heading) {
  const key = normalise(heading);
  return MEMO_GUIDE.find(g => normalise(g.heading) === key || g.aliases.includes(key));
}

const sectionId = () => randomUUID().slice(0, 8);
const today = () => new Date().toISOString().slice(0, 10);

export function buildMemo({ params, project, headings, author = '' }) {
  const prefill = {
    purpose: params.problem,
    background: `Client: ${project.client}. Financial year end: ${project.fy}.`,
    guidance: params.standards?.length ? `Framework: ${params.gaap}.\n\n${params.standards.map(s => `- ${s} — cite the paragraphs relied on.`).join('\n')}` : `Framework: ${params.gaap}.`
  };
  const builderHeadings = headings.filter(isBuilderHeading);
  const sections = (builderHeadings.length ? builderHeadings : DEFAULT_MEMO_HEADINGS).map(heading => ({ id: sectionId(), heading, body: prefill[guideFor(heading)?.key] || '', status: 'Not started' }));
  // The brief must stay traceable even when a template omits the purpose section.
  if (!sections.some(s => guideFor(s.heading)?.key === 'purpose')) sections[0].body = [params.problem, sections[0].body].filter(Boolean).join('\n\n');
  return {
    header: { to: '', from: author, cc: '', date: today() },
    preface: '',
    signoff: { preparer: author, reviewer: '', approver: '' },
    sections,
    completion: emptyCompletion()
  };
}

// Brings memos saved before Memo Base existed up to the current shape. Evidence and
// checklist sections made of generated bullets are dropped, since that content now
// lives in Memo Base and the completion checklist; anything a writer added is kept.
export function normaliseMemo(memo) {
  const generated = section => section.body.split('\n').every(line => !line.trim() || /^- /.test(line));
  const sections = memo.sections.filter(s => isBuilderHeading(s.heading) || !generated(s));
  return {
    header: memo.header || { to: '', from: '', cc: '', date: '' },
    preface: memo.preface || '',
    signoff: memo.signoff || { preparer: '', reviewer: '', approver: '' },
    sections: sections.length ? sections : memo.sections,
    completion: { ...emptyCompletion(), ...memo.completion }
  };
}

export function composeMemo({ title, memo, project, gaap }) {
  const { header = {}, preface = '', signoff = {}, sections = [] } = memo;
  const lines = [`# ${title}`, ''];
  for (const [label, key] of [['To', 'to'], ['From', 'from'], ['CC', 'cc'], ['Date', 'date']]) if (header[key]) lines.push(`${label}: ${header[key]}`);
  if (project) lines.push(`Client: ${project.client} · Financial year end: ${project.fy}${gaap ? ` · Framework: ${gaap}` : ''}`);
  if (preface.trim()) lines.push('', preface.trim());
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
  // Text between the header block and the first section is the preface.
  let preface = preamble.join('\n').trim();
  if (preface && !sections.length) {
    sections.push({ id: sectionId(), heading: 'Overview', lines: [preface] });
    preface = '';
  }
  return normaliseMemo({
    header,
    preface,
    signoff,
    sections: sections.map(({ id, heading, lines }) => {
      const text = lines.join('\n').trim();
      const content = text === PLACEHOLDER ? '' : text;
      return { id, heading, body: content, status: content ? 'Drafting' : 'Not started' };
    })
  });
}
