/**
 * Copyright + AI Provenance Checker.
 *
 * Reports four things:
 *   • overlap with other manuscripts already on the platform (and with the
 *     author's own earlier books — self-plagiarism is a real contract problem)
 *   • quotations with no attribution anywhere near them
 *   • a stylometric AI-likelihood signal
 *   • a provenance timeline the author declares and can show a publisher
 *
 * Honest framing matters here. The AI-likelihood number is a *signal computed
 * from writing statistics*, not a detection. Every published statement about it
 * says so, because accusing a writer of using AI on a bad number is worse than
 * not checking at all.
 */
const db = require('../config/db');
const lang = require('./lang');

const SHINGLE_SIZE = 7;      // 7-word runs: long enough that coincidence is unlikely
const MATCH_THRESHOLD = 0.06; // Jaccard above this is worth showing a human

/** Attribution cues that make a quotation legitimate. */
const ATTRIBUTION_CUES = [
  'বলেছেন', 'লিখেছেন', 'মতে', 'উদ্ধৃত', 'সূত্র', 'অনুযায়ী', 'বলেন', 'উল্লেখ',
  'said', 'wrote', 'according to', 'quoted', 'source', 'cited', 'per ',
];

function hasAttribution(text, index, window = 220) {
  const around = text.slice(Math.max(0, index - window), index + window).toLowerCase();
  return ATTRIBUTION_CUES.some((cue) => around.includes(cue.toLowerCase()));
}

/**
 * Stylometric AI-likelihood, 0-100.
 *
 * Machine-written prose tends to be *more* uniform than human prose: sentence
 * lengths cluster, paragraphs come out the same size, intensifiers and dialect
 * thin out, and vocabulary repeats within a narrow band. Each signal is weak on
 * its own; together they are worth a second look, never a verdict.
 */
function aiLikelihood(text, language) {
  const sents = lang.sentences(text);
  const paras = lang.paragraphs(text);
  const words = lang.tokenize(text);
  if (sents.length < 12 || words.length < 300) {
    return { score: 0, confidence: 'low', signals: [], note: 'sample too small to say anything' };
  }

  const signals = [];
  let score = 0;

  // 1. Sentence-length burstiness. Humans vary a lot; models less so.
  const lens = sents.map((s) => lang.wordCount(s));
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((s, n) => s + (n - mean) ** 2, 0) / lens.length);
  const burstiness = sd / (mean || 1);
  if (burstiness < 0.45) {
    const w = Math.round((0.45 - burstiness) * 90);
    score += w;
    signals.push({ name: 'uniform_sentence_length', weight: w, detail: `burstiness ${burstiness.toFixed(2)} (human prose usually >0.5)` });
  }

  // 2. Paragraph uniformity.
  if (paras.length >= 6) {
    const pl = paras.map((p) => lang.wordCount(p));
    const pm = pl.reduce((a, b) => a + b, 0) / pl.length;
    const psd = Math.sqrt(pl.reduce((s, n) => s + (n - pm) ** 2, 0) / pl.length);
    const pv = psd / (pm || 1);
    if (pv < 0.35) {
      const w = Math.round((0.35 - pv) * 70);
      score += w;
      signals.push({ name: 'uniform_paragraphs', weight: w, detail: `paragraph variation ${pv.toFixed(2)}` });
    }
  }

  // 3. Vocabulary spread. A narrow type-token ratio band is characteristic.
  const unique = new Set(words.map((w) => w.toLowerCase())).size;
  const ttr = unique / words.length;
  if (ttr > 0.32 && ttr < 0.44) {
    score += 10;
    signals.push({ name: 'mid_band_vocabulary', weight: 10, detail: `type-token ratio ${ttr.toFixed(3)}` });
  }

  // 4. Absence of the human textures: intensifiers, dialect, dialogue.
  const filler = lang.fillerDensity(text, language);
  const dialogue = lang.dialogueRatio(text);
  if (filler < 1.5 && dialogue < 0.05) {
    score += 14;
    signals.push({ name: 'flat_texture', weight: 14, detail: 'almost no intensifiers and no dialogue' });
  }

  // 5. Connective scaffolding models over-use.
  const connectives = language === 'en'
    ? /\b(furthermore|moreover|additionally|however|in conclusion|overall|it is important to note)\b/gi
    : /(অধিকন্তু|তদুপরি|সর্বোপরি|উপরন্তু|পরিশেষে|উল্লেখযোগ্য যে|প্রসঙ্গত)/g;
  const connCount = (text.match(connectives) || []).length;
  const connPer1k = (connCount / words.length) * 1000;
  if (connPer1k > 3) {
    const w = Math.min(18, Math.round(connPer1k * 3));
    score += w;
    signals.push({ name: 'connective_scaffolding', weight: w, detail: `${connCount} formal connectives` });
  }

  const final = lang.clamp(Math.round(score), 0, 100);
  return {
    score: final,
    confidence: signals.length >= 3 ? 'medium' : signals.length >= 1 ? 'low' : 'low',
    signals,
    note: 'A statistical signal from writing style, not a detection. Treat a high number as a prompt to ask, never as proof.',
  };
}

/** Compare this manuscript's chapters against every other manuscript on the platform. */
async function findOverlaps(manuscriptId, chapters) {
  const { rows: others } = await db.query(
    `SELECT c.manuscript_id, c.chapter_no, c.content, m.title, m.author_id
       FROM Manuscript_Chapter c
       JOIN Manuscript m ON m.manuscript_id = c.manuscript_id
      WHERE c.manuscript_id <> $1 AND c.word_count > 150`,
    [manuscriptId]
  );

  const matches = [];
  const mine = chapters.map((c) => ({ no: c.chapter_no, sh: lang.shingles(c.content || '', SHINGLE_SIZE) }));

  for (const other of others) {
    const theirs = lang.shingles(other.content || '', SHINGLE_SIZE);
    for (const m of mine) {
      const sim = lang.jaccard(m.sh, theirs);
      if (sim < MATCH_THRESHOLD) continue;

      // Surface the longest literally shared run so a human can judge it.
      let sample = '';
      for (const s of m.sh) {
        if (theirs.has(s)) { sample = s; break; }
      }
      matches.push({
        chapter_no: m.no,
        excerpt: sample,
        source_type: 'internal_manuscript',
        source_ref: `${other.title} (অধ্যায় ${other.chapter_no})`,
        similarity: Math.round(sim * 100),
      });
    }
  }

  // Near-duplicate chapters inside the same manuscript — usually a paste accident.
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) {
      const sim = lang.jaccard(mine[i].sh, mine[j].sh);
      if (sim >= 0.25) {
        matches.push({
          chapter_no: mine[j].no,
          excerpt: '',
          source_type: 'self',
          source_ref: `একই পাণ্ডুলিপির অধ্যায় ${lang.toBanglaDigits(mine[i].no)}`,
          similarity: Math.round(sim * 100),
        });
      }
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 40);
}

/** Quotations without a nearby attribution cue. */
function findUnattributedQuotes(chapters) {
  const out = [];
  for (const c of chapters) {
    const text = c.content || '';
    for (const q of lang.extractQuotes(text)) {
      // Short quoted spans are dialogue, not citations.
      if (lang.wordCount(q.quote) < 8) continue;
      if (hasAttribution(text, q.index)) continue;
      out.push({
        chapter_no: c.chapter_no,
        excerpt: q.quote.slice(0, 220),
        source_type: 'quote',
        source_ref: null,
        similarity: 0,
      });
    }
  }
  return out.slice(0, 30);
}

/** Run every check, persist a report, return it. */
async function run(manuscriptId) {
  const [msRes, chRes] = await Promise.all([
    db.query('SELECT * FROM Manuscript WHERE manuscript_id = $1', [manuscriptId]),
    db.query('SELECT chapter_no, title, content FROM Manuscript_Chapter WHERE manuscript_id = $1 ORDER BY chapter_no', [manuscriptId]),
  ]);
  const ms = msRes.rows[0];
  if (!ms) throw new Error('Manuscript not found');
  const chapters = chRes.rows;
  const whole = chapters.map((c) => c.content || '').join('\n\n');
  const language = ms.language === 'en' ? 'en' : 'bn';

  const overlaps = await findOverlaps(manuscriptId, chapters);
  const quotes = findUnattributedQuotes(chapters);
  const ai = aiLikelihood(whole, language);

  // Plagiarism score: driven by the strongest match, tempered by how many there are.
  const strongest = overlaps[0]?.similarity || 0;
  const plagiarism = lang.clamp(Math.round(strongest * 0.7 + Math.min(30, overlaps.length * 3)), 0, 100);

  const { rows } = await db.query(
    `INSERT INTO Integrity_Report
       (manuscript_id, plagiarism_score, ai_likelihood, unverified_quotes, missing_attribution, details)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [manuscriptId, plagiarism, ai.score, quotes.length, quotes.length,
     JSON.stringify({ ai_signals: ai.signals, ai_note: ai.note, ai_confidence: ai.confidence, overlap_count: overlaps.length })]
  );
  const report = rows[0];

  for (const m of [...overlaps, ...quotes]) {
    await db.query(
      `INSERT INTO Integrity_Match (report_id, chapter_no, excerpt, source_type, source_ref, similarity)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [report.report_id, m.chapter_no, m.excerpt, m.source_type, m.source_ref, m.similarity]
    );
  }

  return { report, overlaps, quotes, ai, manuscript: ms };
}

/** Author declares how a chapter came to be. This is the provenance record. */
async function recordProvenance(manuscriptId, { chapter_no = null, event_type, tool = null, share_pct = 0, note = null }) {
  const { rows } = await db.query(
    `INSERT INTO Provenance_Event (manuscript_id, chapter_no, event_type, tool, share_pct, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [manuscriptId, chapter_no, event_type, tool, share_pct, note]
  );
  return rows[0];
}

async function provenanceTimeline(manuscriptId) {
  const { rows } = await db.query(
    'SELECT * FROM Provenance_Event WHERE manuscript_id = $1 ORDER BY recorded_at',
    [manuscriptId]
  );
  const declaredAI = rows.filter((r) => r.event_type === 'ai_assisted');
  const aiShare = declaredAI.length
    ? Math.round(declaredAI.reduce((s, r) => s + (r.share_pct || 0), 0) / declaredAI.length)
    : 0;
  return { events: rows, declared_ai_share: aiShare };
}

module.exports = { run, aiLikelihood, findOverlaps, findUnattributedQuotes, recordProvenance, provenanceTimeline };
