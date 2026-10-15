// Hybrid passage search: keyword matches (SQLite FTS5, BM25) and meaning matches (embedding
// similarity) are ranked separately and merged with reciprocal rank fusion. Callers pass the
// resource IDs they have already checked belong to the user's project; nothing outside them is read.
import { blobToVector } from './chunk.mjs';

const SHORTLIST = 20;
const FUSION_K = 60;
const STOPWORDS = new Set('a an and are as at be been but by can could did do does for from had has have how i if in into is it its may might must not of on or our shall should so such than that the their them then there these they this those to under was we were what when where whether which while who why will with would you your'.split(' '));

// Turns free text into an FTS5 query of quoted terms joined by OR, so user input can never be
// read as FTS5 syntax. Returns '' when nothing searchable remains.
export function keywordQuery(text) {
  const terms = [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(t => t.length > 1 && !STOPWORDS.has(t)))].slice(0, 32);
  return terms.map(t => `"${t}"`).join(' OR ');
}

export function searchPassages(db, { query, projectId, resourceIds, vector = null, embedModel, limit = 8 }) {
  if (!resourceIds.length) return [];
  const ids = JSON.stringify(resourceIds);
  const ranked = new Map();
  const add = (id, rank, kind, value) => {
    const entry = ranked.get(id) || { id, score: 0 };
    entry.score += 1 / (FUSION_K + rank);
    entry[kind] = value;
    ranked.set(id, entry);
  };

  const match = keywordQuery(query);
  if (match) {
    db.prepare(`
      SELECT p.id, bm25(passages_fts, 2.0, 1.0) AS bm25 FROM passages_fts
      JOIN passages p ON p.id = passages_fts.rowid
      WHERE passages_fts MATCH ? AND p.project_id = ? AND p.resource_id IN (SELECT value FROM json_each(?))
      ORDER BY bm25 LIMIT ?
    `).all(match, projectId, ids, SHORTLIST).forEach((row, i) => add(row.id, i + 1, 'keywordRank', i + 1));
  }

  if (vector) {
    let norm = 0; for (const v of vector) norm += v * v; norm = Math.sqrt(norm) || 1;
    const rows = db.prepare(`
      SELECT id, embedding FROM passages
      WHERE project_id = ? AND resource_id IN (SELECT value FROM json_each(?)) AND embed_model = ? AND embedding IS NOT NULL
    `).all(projectId, ids, embedModel);
    rows.map(row => {
      const stored = blobToVector(row.embedding);
      let dot = 0; for (let i = 0; i < stored.length; i++) dot += stored[i] * vector[i];
      return { id: row.id, similarity: dot / norm };
    }).sort((a, b) => b.similarity - a.similarity).slice(0, SHORTLIST)
      .forEach((row, i) => add(row.id, i + 1, 'similarity', row.similarity));
  }

  const top = [...ranked.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  const passage = db.prepare('SELECT p.id, p.resource_id, p.page, p.heading, p.text, r.name AS document FROM passages p JOIN resources r ON r.id = p.resource_id WHERE p.id = ?');
  return top.map(entry => {
    const row = passage.get(entry.id);
    return {
      id: row.id, resourceId: row.resource_id, document: row.document, page: row.page, heading: row.heading, text: row.text,
      matchedBy: [entry.keywordRank ? 'keyword' : null, entry.similarity !== undefined ? 'meaning' : null].filter(Boolean),
      similarity: entry.similarity === undefined ? null : Math.round(entry.similarity * 1000) / 1000
    };
  });
}
