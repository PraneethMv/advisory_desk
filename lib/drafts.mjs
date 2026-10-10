export const STANDARD_CATALOG = {
  'IFRS': ['IFRS 2 · Share-based Payment', 'IFRS 3 · Business Combinations', 'IFRS 9 · Financial Instruments', 'IFRS 15 · Revenue', 'IFRS 16 · Leases', 'IAS 12 · Income Taxes', 'IAS 36 · Impairment', 'IAS 38 · Intangible Assets'],
  'Ind AS': ['Ind AS 102 · Share-based Payment', 'Ind AS 103 · Business Combinations', 'Ind AS 109 · Financial Instruments', 'Ind AS 115 · Revenue', 'Ind AS 116 · Leases', 'Ind AS 12 · Income Taxes', 'Ind AS 36 · Impairment', 'Ind AS 38 · Intangible Assets'],
  'US GAAP': ['ASC 350 · Intangibles', 'ASC 360 · Long-lived Assets', 'ASC 606 · Revenue', 'ASC 718 · Stock Compensation', 'ASC 740 · Income Taxes', 'ASC 805 · Business Combinations', 'ASC 815 · Derivatives', 'ASC 842 · Leases'],
  'Other': []
};

// This phase deliberately uses deterministic outlines. There are no AI calls,
// remote APIs, or network transports in the draft builder.
export function buildDraft({ kind, title, params, project, resources, settings }) {
  const sources = resources.map((r, i) => `[${i + 1}] ${r.name}${r.kind === 'template' ? ' (company template)' : ''}`);
  let body;
  if (kind === 'memo') {
    const template = resources.find(r => r.kind === 'template' && r.text);
    const headings = template?.text.match(/^#{1,3}\s+.+$/gm)?.map(x => x.replace(/^#+\s+/, '')).slice(0, 15) || settings?.memoHeadings?.split('\n').map(x => x.trim()).filter(Boolean);
    body = `# ${title}\n\nWORKING OUTLINE · ${project.client}\nFinancial year end: ${project.fy} · Framework: ${params.gaap}\n\n`;
    if (headings?.length) {
      body += headings.map(h => `## ${h}\n\n[Complete this section using verified project evidence.]`).join('\n\n') + '\n\n';
    } else {
      body += `## Purpose and scope\n\n${params.problem}\n\n## Background and facts\n\nClient: ${project.client}. Financial year end: ${project.fy}.\n[Document the transaction, dates, contracts, amounts, and management representations.]\n\n## Accounting questions\n\n[Break the problem statement into questions to be assessed.]\n\n## Applicable guidance\n\nFramework selected: ${params.gaap}.\n${params.standards.map(s => `- ${s} — confirm applicable paragraphs with authoritative sources.`).join('\n') || '- No standards selected.'}\n\n## Analysis\n\n[Assess each accounting question against verified guidance and cite project evidence.]\n\n## Conclusion — pending review\n\n[To be completed and approved by the engagement reviewer.]\n\n`;
    }
    body += `## Brief\n\n${params.problem}\n\n## Selected standards\n\n${params.standards.map(s => `- ${s}`).join('\n') || 'No standards selected.'}\n\n## Selected project evidence\n\n${sources.join('\n') || 'No resources selected.'}\n\n## Completion checklist\n\n- Confirm completeness and accuracy of facts.\n- Validate the selected framework and authoritative guidance.\n- Identify alternatives, assumptions, and judgments.\n- Obtain reviewer approval before circulation.`;
  } else {
    const area = params.area || params.deckType;
    body = `# ${title}\n\n## ${title}\n- ${project.client}\n- ${params.deckType} · ${area}\n- Financial year end: ${project.fy}\n\n## The brief\n- ${params.problem}\n- Audience: ${params.audience || 'Client stakeholders'}\n\n## Engagement context\n- Workstream: ${area}\n${params.ipoTrack ? `- IPO focus: ${params.ipoTrack}\n` : ''}${params.currentGaap ? `- Current framework: ${params.currentGaap}\n- Target framework: ${params.targetGaap}\n- Current methodologies: ${params.methodologies || '[Confirm with management]'}\n` : ''}- [Validate background and business objectives]\n\n## Approach\n- [Define the proposed approach]\n- [Agree scope, dependencies, and milestones]\n\n## Deliverables and workstreams\n- [Define the engagement deliverables]\n- [Assign workstream owners and review milestones]\n\n## Timeline and team\n- [Insert agreed phases, dates, and responsibilities]\n- [Confirm client and advisory team availability]\n\n## Project evidence\n${sources.map(s => `- ${s}`).join('\n') || '- No resources selected'}\n\n## Decisions and next steps\n- [Confirm scope and success criteria]\n- [Resolve open information requests]\n- Obtain engagement review before circulation`;
  }
  return { body, mode: 'outline', warnings: ['Working outline. Content must be completed and reviewed by your team.'] };
}
