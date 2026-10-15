// Splits extracted document pages into passages for search. A passage never crosses a page
// or a heading, so a citation can name both. Paragraphs are kept whole where they fit;
// longer ones are split at sentence ends.

// Bump when the splitting rules change; stored passages are then rebuilt from document_pages.
export const CHUNKER_VERSION = 2;

const TARGET_WORDS = 220;
const MAX_WORDS = 350;
const MIN_WORDS = 40;

const words = text => (text.match(/\S+/g) || []).length;

// A line that starts a numbered clause or section: "Clause 4", "4.2", "(b)", "Article 7", "12." …
const CLAUSE_START = /\n(?=\s*(?:(?:clause|section|article|schedule|paragraph|para\.?|note)\s+\d|\d+(?:\.\d+)+\s|\d{1,3}[.)]\s|\([a-z0-9]{1,4}\)\s))/i;

// Breaks an oversized block into pieces: numbered clauses first, then sentences.
function units(text) {
  return text.split(CLAUSE_START).flatMap(clause => {
    const flat = clause.replace(/\s*\n\s*/g, ' ').trim();
    return words(flat) <= MAX_WORDS ? [flat] : sentences(flat);
  }).filter(Boolean);
}

function sentences(text) {
  // Split after . ! ? or ; followed by whitespace and an uppercase letter, digit, or opening bracket.
  const raw = text.split(/(?<=[.!?;])\s+(?=[A-Z0-9(“"‘'])/);
  // A fragment of a few words ("Clause 4.", "Note 2.") is a label, not a sentence: keep it with what follows.
  const parts = [];
  for (const part of raw) {
    if (parts.length && words(parts.at(-1)) < 4) parts[parts.length - 1] += ` ${part}`;
    else parts.push(part);
  }
  return parts.flatMap(part => {
    if (words(part) <= MAX_WORDS) return [part];
    // A run-on block (e.g. a table flattened to text) is cut by word count.
    const tokens = part.split(/\s+/); const pieces = [];
    for (let i = 0; i < tokens.length; i += TARGET_WORDS) pieces.push(tokens.slice(i, i + TARGET_WORDS).join(' '));
    return pieces;
  });
}

// PDF text has one line per printed line and no blank lines, and loses heading formatting.
// This rebuilds blocks: a short line without closing punctuation that follows a finished
// sentence is treated as a heading, and a numbered clause starts a new block.
const TERMINAL = /[.!?;:,)"”’]$/;
function pdfBlocks(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const out = [];
  let block = [];
  const end = () => { if (block.length) out.push(block.join('\n')); block = []; };
  // Headings carry no figures apart from a leading number ("4.2 Conversion"), which keeps table
  // rows ("Revenue 1,234 1,100") as text. A heading is followed by ordinary text, not another short line.
  const headingShaped = line => line !== undefined && words(line) <= 8 && line.length <= 80 && !TERMINAL.test(line)
    && /^[\p{Lu}\d(]/u.test(line) && !/\d/.test(line.replace(/^(\d+(\.\d+)*\.?|\([a-z0-9]{1,4}\)|[A-Z]\.)\s+/i, ''));
  let previousHeading = false;
  lines.forEach((line, i) => {
    const previousEnded = i === 0 || previousHeading || TERMINAL.test(lines[i - 1]) || headingShaped(lines[i - 1]);
    previousHeading = previousEnded && i < lines.length - 1 && headingShaped(line) && !headingShaped(lines[i + 1]);
    if (previousHeading) { end(); out.push(`## ${line}`); return; }
    if (previousEnded && CLAUSE_START.test(`\n${line} `)) end();
    block.push(line);
  });
  end();
  return out;
}

export function chunkPages(pages) {
  const passages = [];
  // The heading trail carries across pages, since a section often continues onto the next page.
  const trail = [];
  for (const { page, text } of pages) {
    let buffer = [];
    let count = 0;
    const flush = () => {
      const body = buffer.join('\n\n').trim();
      if (body) {
        const heading = trail.filter(Boolean).join(' › ');
        const last = passages.at(-1);
        // A short tail joins the previous passage when it shares the page and heading.
        if (words(body) < MIN_WORDS && last && last.page === page && last.heading === heading && words(last.text) + words(body) <= MAX_WORDS) last.text += `\n\n${body}`;
        else passages.push({ page, heading, text: body });
      }
      buffer = []; count = 0;
    };
    for (const block of page === null ? text.split(/\n\s*\n/) : pdfBlocks(text)) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (heading && !trimmed.includes('\n')) {
        flush();
        const level = heading[1].length;
        trail.length = level; trail[level - 1] = heading[2].trim();
        continue;
      }
      const size = words(trimmed);
      if (size > MAX_WORDS) {
        flush();
        for (const sentence of units(trimmed)) {
          const n = words(sentence);
          if (count && count + n > TARGET_WORDS) flush();
          buffer.push(sentence); count += n;
        }
        flush();
        continue;
      }
      if (count && count + size > TARGET_WORDS) flush();
      buffer.push(trimmed); count += size;
    }
    flush();
  }
  return passages;
}

// embeddinggemma expects these prompt forms for documents and queries.
export const passageForEmbedding = (documentName, passage) => `title: ${[documentName, passage.heading].filter(Boolean).join(' › ')} | text: ${passage.text}`;
export const queryForEmbedding = query => `task: search result | query: ${query}`;

// Vectors are stored unit-length, so cosine similarity is a dot product.
export function vectorToBlob(values) {
  const vector = Float32Array.from(values);
  let norm = 0; for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return Buffer.from(vector.buffer);
}
export const blobToVector = blob => new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength));
