// Text extraction for engagement documents. Results come back as pages so citations can
// name a page; formats without pages (Word, text) return a single unnumbered page.
// Uploaded files are untrusted, so parsing runs in a worker thread with a time and memory
// limit, and nothing in a document is ever executed.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { inflateRawSync } from 'node:zlib';

const MAX_TEXT = 2_000_000;
const MAX_PDF_PAGES = 1000;
const MAX_XML = 50 * 1024 * 1024;

export const EXTRACTABLE = /\.(pdf|docx|txt|md|csv|json)$/i;

// Statuses: ready, needs_review (readable file but little or no text), unsupported, failed.
export function extractDocument(name, bytes, { timeoutMs = 120000 } = {}) {
  if (!EXTRACTABLE.test(name)) return Promise.resolve({ status: 'unsupported', note: 'Text from this file type is not read yet.', pages: [] });
  return new Promise(resolve => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { name, bytes }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    const timer = setTimeout(() => { worker.terminate(); finish({ status: 'failed', note: 'Reading this file took too long.', pages: [] }); }, timeoutMs);
    let done = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timer); resolve(result); };
    worker.once('message', finish);
    worker.once('error', () => finish({ status: 'failed', note: 'This file could not be read. It may be damaged.', pages: [] }));
    worker.once('exit', () => finish({ status: 'failed', note: 'This file could not be read. It may be damaged.', pages: [] }));
  });
}

export async function extractInProcess(name, bytes) {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  try {
    if (ext === 'pdf') return await pdfText(bytes);
    if (ext === 'docx') return finish([{ page: null, text: docxText(bytes) }]);
    return finish([{ page: null, text: Buffer.from(bytes).toString('utf8') }]);
  } catch (error) {
    if (error?.name === 'PasswordException') return { status: 'needs_review', note: 'This PDF is password-protected. Upload an unprotected copy.', pages: [] };
    return { status: 'failed', note: 'This file could not be read. It may be damaged or in an unexpected format.', pages: [] };
  }
}

const clean = text => text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function finish(pages, note = '') {
  let budget = MAX_TEXT;
  const kept = pages.map(p => {
    const text = clean(p.text).slice(0, Math.max(0, budget));
    budget -= text.length;
    return { page: p.page, text };
  });
  if (!kept.some(p => p.text)) return { status: 'needs_review', note: note || 'No readable text was found in this file.', pages: [] };
  return { status: 'ready', note: budget <= 0 ? 'Only the first part of this very large file was read.' : note, pages: kept.filter(p => p.text) };
}

let pdfjs;
async function loadPdfjs() {
  if (!pdfjs) {
    // pdfjs warns that its optional canvas add-on is missing; that add-on only draws pages, which is not needed here.
    const warn = console.warn;
    console.warn = (...args) => { if (!/napi-rs\/canvas|polyfill/i.test(String(args[0]))) warn(...args); };
    try { pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); } finally { console.warn = warn; }
  }
  return pdfjs;
}

async function pdfText(bytes) {
  const { getDocument } = await loadPdfjs();
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, isOffscreenCanvasSupported: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    const count = Math.min(doc.numPages, MAX_PDF_PAGES);
    const pages = [];
    for (let number = 1; number <= count; number++) {
      const content = await (await doc.getPage(number)).getTextContent();
      pages.push({ page: number, text: content.items.map(item => (item.str || '') + (item.hasEOL ? '\n' : '')).join('') });
    }
    const readable = pages.filter(p => p.text.replace(/\s/g, '').length >= 20).length;
    if (readable === 0) return { status: 'needs_review', note: 'This PDF looks scanned or image-only, so its text could not be read. Scanned documents are not supported yet.', pages: [] };
    const notes = [];
    if (doc.numPages > count) notes.push(`Only the first ${count} of ${doc.numPages} pages were read.`);
    if (readable < count) notes.push(`${count - readable} of ${count} pages had little or no readable text and may be scanned.`);
    return finish(pages, notes.join(' '));
  } finally {
    await task.destroy();
  }
}

// Word documents are ZIP files; the body text is in word/document.xml.
function unzipEntry(bytes, wanted) {
  const buffer = Buffer.from(bytes);
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('Not a ZIP file');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Bad ZIP directory');
    const method = buffer.readUInt16LE(offset + 10); const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28); const extra = buffer.readUInt16LE(offset + 30); const comment = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === wanted) {
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const data = buffer.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_XML });
      throw new Error('Unsupported ZIP compression');
    }
    offset += 46 + nameLength + extra + comment;
  }
  throw new Error(`Missing ${wanted}`);
}

const entity = text => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) => {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[code.toLowerCase()];
  if (named) return named;
  const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
  return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
});

// Keeps paragraph order, marks Word headings with Markdown '#' so passages can carry a
// heading trail, and flattens table rows to "cell | cell". Deleted (tracked) text and
// field codes are skipped because they sit outside <w:t>.
export function docxText(bytes) {
  const xml = unzipEntry(bytes, 'word/document.xml').toString('utf8');
  const lines = []; const cells = []; const rows = [];
  let paragraph = null; let style = ''; let inText = false;
  const tag = /<(\/?)(w:p|w:t|w:tab|w:br|w:cr|w:tc|w:tr|w:pStyle)(?=[\s/>])([^>]*)>|([^<]+)|<[^>]*>/g;
  for (const [, closing, name, attrs, text] of xml.matchAll(tag)) {
    if (text !== undefined) { if (inText && paragraph !== null) paragraph += entity(text); continue; }
    if (!name) continue;
    const selfClosing = attrs.endsWith('/');
    if (name === 'w:p') {
      if (!closing && !selfClosing) { paragraph = ''; style = ''; }
      else if (closing && paragraph !== null) {
        const level = /^heading\s*([1-6])$/i.exec(style)?.[1] || (/^title$/i.test(style) ? '1' : '');
        const line = paragraph.trim();
        if (line) {
          const value = level ? `${'#'.repeat(Number(level))} ${line}` : line;
          if (cells.length) cells[cells.length - 1].push(line); else lines.push(value);
        }
        paragraph = null;
      }
    } else if (name === 'w:t') inText = !closing && !selfClosing;
    else if (name === 'w:pStyle') style = /w:val="([^"]*)"/.exec(attrs)?.[1] || '';
    else if (name === 'w:tab' && paragraph !== null) paragraph += '\t';
    else if ((name === 'w:br' || name === 'w:cr') && paragraph !== null) paragraph += '\n';
    else if (name === 'w:tr') { if (!closing) rows.push([]); else { const row = rows.pop(); if (row?.some(Boolean)) (cells.length ? cells[cells.length - 1] : lines).push(row.join(' | ')); } }
    else if (name === 'w:tc') { if (!closing && !selfClosing) cells.push([]); else if (closing) { const cell = cells.pop(); rows[rows.length - 1]?.push(cell.join(' ').trim()); } }
  }
  return lines.join('\n\n');
}

if (!isMainThread && workerData?.name) {
  parentPort.postMessage(await extractInProcess(workerData.name, workerData.bytes));
}
