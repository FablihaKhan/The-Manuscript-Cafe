/**
 * Writer's Studio — manuscripts, Doctor, readiness, metadata, formatting,
 * integrity and beta readers.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('../config/db');
const { requireAuthor, requireOwnedManuscript } = require('../middleware/auth');
const ingest = require('../services/ingest');
const doctor = require('../services/manuscriptDoctor');
const readiness = require('../services/readiness');
const metadataSvc = require('../services/metadata');
const formatter = require('../services/formatter');
const integrity = require('../services/integrity');
const ai = require('../services/ai');
const langSvc = require('../services/lang');

const router = express.Router();

// --- uploads ---------------------------------------------------------------
const MS_DIR = path.join(__dirname, '..', 'uploads', 'manuscripts');
const COVER_DIR = path.join(__dirname, '..', 'uploads', 'covers');
fs.mkdirSync(MS_DIR, { recursive: true });
fs.mkdirSync(COVER_DIR, { recursive: true });

const manuscriptUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, MS_DIR),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    ingest.isSupported(file.originalname)
      ? cb(null, true)
      : cb(new Error(`শুধু ${ingest.SUPPORTED.join(', ')} ফাইল আপলোড করা যাবে।`)),
});

const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, COVER_DIR),
    filename: (req, file, cb) =>
      cb(null, `cover-${req.params.id}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    /^image\/(jpe?g|png|webp)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('প্রচ্ছদ JPG, PNG বা WebP হতে হবে।')),
});

// Make the signed-in author's name available to every view.
router.use(async (req, res, next) => {
  if (req.session?.authorId && !res.locals.authorName) {
    try {
      const { rows } = await db.query('SELECT first_name, last_name, pen_name FROM Author WHERE id = $1', [req.session.authorId]);
      const a = rows[0];
      res.locals.authorName = a ? (a.pen_name || [a.first_name, a.last_name].filter(Boolean).join(' ')) : null;
    } catch (_) { /* non-fatal */ }
  }
  next();
});

// ---------------------------------------------------------------------------
// Manuscript list
// ---------------------------------------------------------------------------
router.get('/', requireAuthor, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT m.*,
              (SELECT health_score FROM Manuscript_Analysis
                WHERE manuscript_id = m.manuscript_id ORDER BY run_at DESC LIMIT 1) AS health_score,
              (SELECT overall_pct FROM Readiness_Snapshot
                WHERE manuscript_id = m.manuscript_id ORDER BY computed_at DESC LIMIT 1) AS readiness_pct,
              (SELECT COUNT(*) FROM Submission WHERE manuscript_id = m.manuscript_id) AS submission_count
         FROM Manuscript m
        WHERE m.author_id = $1
        ORDER BY m.updated_at DESC`,
      [req.session.authorId]
    );
    res.render('studio/list', { pageTitle: 'আমার পাণ্ডুলিপি', manuscripts: rows, aiOn: ai.isEnabled() });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
router.get('/upload', requireAuthor, (req, res) => {
  res.render('studio/upload', { pageTitle: 'পাণ্ডুলিপি আপলোড', narrow: true, error: null });
});

router.post('/upload', requireAuthor, (req, res, next) => {
  manuscriptUpload.single('manuscript')(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).render('studio/upload', {
        pageTitle: 'পাণ্ডুলিপি আপলোড', narrow: true, error: uploadErr.message,
      });
    }
    if (!req.file) {
      return res.status(400).render('studio/upload', {
        pageTitle: 'পাণ্ডুলিপি আপলোড', narrow: true, error: 'কোনো ফাইল নির্বাচন করা হয়নি।',
      });
    }

    const client = await db.pool.connect();
    try {
      const parsed = await ingest.ingestFile(req.file.path);
      const { title, subtitle, genre, audience, synopsis } = req.body;

      await client.query('BEGIN');
      const msRes = await client.query(
        `INSERT INTO Manuscript (author_id, title, subtitle, genre, language, audience, synopsis, char_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.session.authorId, title || path.parse(req.file.originalname).name,
         subtitle || null, genre || null, parsed.language, audience || 'adult',
         synopsis || null, parsed.char_count]
      );
      const ms = msRes.rows[0];

      for (const ch of parsed.chapters) {
        await client.query(
          `INSERT INTO Manuscript_Chapter (manuscript_id, chapter_no, title, content, word_count)
           VALUES ($1,$2,$3,$4,$5)`,
          [ms.manuscript_id, ch.chapter_no, ch.title, ch.content, ch.word_count]
        );
      }

      await client.query(
        `INSERT INTO Manuscript_File (manuscript_id, kind, file_path, original_name, mime_type, size_bytes)
         VALUES ($1,'source',$2,$3,$4,$5)`,
        [ms.manuscript_id, path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/'),
         req.file.originalname, req.file.mimetype, req.file.size]
      );

      // The author's own upload is the first provenance record.
      await client.query(
        `INSERT INTO Provenance_Event (manuscript_id, event_type, tool, note)
         VALUES ($1,'imported',$2,$3)`,
        [ms.manuscript_id, path.extname(req.file.originalname).slice(1).toUpperCase(),
         `আপলোড করা হয়েছে: ${req.file.originalname}`]
      );

      await client.query('COMMIT');
      res.redirect(`/studio/${ms.manuscript_id}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });
});

// Every route below takes a numeric manuscript id. Anything else (a literal
// path segment handled by another router) leaves this router untouched rather
// than reaching Postgres as a bad bigint.
router.use('/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next('router');
  return next();
});

// ---------------------------------------------------------------------------
// Overview + readiness
// ---------------------------------------------------------------------------
router.get('/:id', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const snapshot = await readiness.computeAndSave(req.params.id, 'bn');
    const [chapters, files, subs] = await Promise.all([
      db.query('SELECT chapter_no, title, word_count FROM Manuscript_Chapter WHERE manuscript_id = $1 ORDER BY chapter_no', [req.params.id]),
      db.query('SELECT kind, file_path, created_at FROM Manuscript_File WHERE manuscript_id = $1', [req.params.id]),
      db.query(`SELECT s.status, p.name FROM Submission s JOIN Publisher p ON p.publisher_id = s.publisher_id
                 WHERE s.manuscript_id = $1 ORDER BY s.submitted_at DESC LIMIT 5`, [req.params.id]),
    ]);

    res.render('studio/overview', {
      pageTitle: req.manuscript.title,
      ms: req.manuscript,
      tab: 'overview',
      readiness: snapshot,
      analysis: snapshot.analysis,
      chapters: chapters.rows,
      files: files.rows,
      submissions: subs.rows,
      aiOn: ai.isEnabled(),
    });
  } catch (err) { next(err); }
});

router.post('/:id/edit', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const { title, subtitle, genre, audience, synopsis, language, country } = req.body;
    await db.query(
      `UPDATE Manuscript SET title=$1, subtitle=$2, genre=$3, audience=$4, synopsis=$5,
              language=$6, country=$7, updated_at=CURRENT_TIMESTAMP
        WHERE manuscript_id=$8`,
      [title, subtitle || null, genre || null, audience || 'adult', synopsis || null,
       language || req.manuscript.language, country || req.manuscript.country, req.params.id]
    );
    res.redirect(`/studio/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/:id/cover', requireAuthor, requireOwnedManuscript, (req, res, next) => {
  coverUpload.single('cover')(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return res.redirect(`/studio/${req.params.id}`);
    try {
      const rel = path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/');
      await db.query('UPDATE Manuscript SET cover_path = $1 WHERE manuscript_id = $2', [rel, req.params.id]);
      await db.query(
        `INSERT INTO Manuscript_File (manuscript_id, kind, file_path, original_name, mime_type, size_bytes)
         VALUES ($1,'cover',$2,$3,$4,$5)`,
        [req.params.id, rel, req.file.originalname, req.file.mimetype, req.file.size]
      );
      res.redirect(`/studio/${req.params.id}`);
    } catch (e) { next(e); }
  });
});

// ---------------------------------------------------------------------------
// Manuscript Doctor
// ---------------------------------------------------------------------------
router.get('/:id/doctor', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const aRes = await db.query(
      'SELECT * FROM Manuscript_Analysis WHERE manuscript_id = $1 ORDER BY run_at DESC LIMIT 1',
      [req.params.id]
    );
    const analysis = aRes.rows[0] || null;
    let issues = [];
    if (analysis) {
      const iRes = await db.query(
        `SELECT * FROM Manuscript_Issue WHERE analysis_id = $1
          ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                   chapter_no NULLS FIRST, issue_id`,
        [analysis.analysis_id]
      );
      issues = iRes.rows;
    }
    res.render('studio/doctor', {
      pageTitle: 'Manuscript Doctor', ms: req.manuscript, tab: 'doctor',
      analysis, issues, aiOn: ai.isEnabled(),
    });
  } catch (err) { next(err); }
});

router.post('/:id/doctor/run', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const chRes = await db.query(
      'SELECT chapter_no, title, content FROM Manuscript_Chapter WHERE manuscript_id = $1 ORDER BY chapter_no',
      [req.params.id]
    );
    if (!chRes.rows.length) {
      return res.status(400).render('error', {
        title: 'কোনো অধ্যায় নেই',
        message: 'বিশ্লেষণের আগে পাণ্ডুলিপি আপলোড করুন।',
        link: `/studio/${req.params.id}`, linkText: 'ফিরে যান',
      });
    }

    const useAI = req.body.use_ai !== 'off' && ai.isEnabled();
    const result = await doctor.analyse(req.manuscript, chRes.rows, { useAI });

    await client.query('BEGIN');
    const aRes = await client.query(
      `INSERT INTO Manuscript_Analysis (manuscript_id, health_score, engine, language, metrics, voice_preserved)
       VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING analysis_id`,
      [req.params.id, result.health_score, result.engine, result.language, JSON.stringify(result.metrics)]
    );
    const analysisId = aRes.rows[0].analysis_id;

    for (const i of result.issues) {
      await client.query(
        `INSERT INTO Manuscript_Issue (analysis_id, chapter_no, category, severity, message, excerpt, suggestion)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [analysisId, i.chapter_no, i.category, i.severity, i.message, i.excerpt || null, i.suggestion || null]
      );
    }
    await client.query('UPDATE Manuscript SET status = $1 WHERE manuscript_id = $2 AND status = $3',
      ['analyzed', req.params.id, 'draft']);
    await client.query('COMMIT');

    res.redirect(`/studio/${req.params.id}/doctor`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

router.post('/:id/doctor/resolve', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE Manuscript_Issue SET resolved = NOT resolved
        WHERE issue_id = $1
          AND analysis_id IN (SELECT analysis_id FROM Manuscript_Analysis WHERE manuscript_id = $2)`,
      [req.body.issue_id, req.params.id]
    );
    res.redirect(`/studio/${req.params.id}/doctor`);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
router.get('/:id/metadata', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM Book_Metadata WHERE manuscript_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [req.params.id]
    );
    res.render('studio/metadata', {
      pageTitle: 'Metadata', ms: req.manuscript, tab: 'metadata',
      md: rows[0] || null, aiOn: ai.isEnabled(), suggestions: [],
    });
  } catch (err) { next(err); }
});

router.post('/:id/metadata/generate', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    await metadataSvc.generate(req.params.id, { useAI: req.body.use_ai !== 'off' });
    res.redirect(`/studio/${req.params.id}/metadata`);
  } catch (err) { next(err); }
});

router.post('/:id/metadata/save', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    await metadataSvc.saveManual(req.params.id, { ...req.body, language: req.manuscript.language });
    res.redirect(`/studio/${req.params.id}/metadata`);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------
router.get('/:id/format', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM Manuscript_File WHERE manuscript_id = $1 AND kind IN ('pdf','epub','print_pdf')
        ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.render('studio/format', {
      pageTitle: 'ফরম্যাট', ms: req.manuscript, tab: 'format', files: rows,
    });
  } catch (err) { next(err); }
});

router.post('/:id/format/build', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const [chRes, authorRes, mdRes] = await Promise.all([
      db.query('SELECT chapter_no, title, content FROM Manuscript_Chapter WHERE manuscript_id = $1 ORDER BY chapter_no', [req.params.id]),
      db.query('SELECT first_name, last_name, pen_name FROM Author WHERE id = $1', [req.session.authorId]),
      db.query('SELECT * FROM Book_Metadata WHERE manuscript_id = $1 ORDER BY generated_at DESC LIMIT 1', [req.params.id]),
    ]);
    if (!chRes.rows.length) {
      return res.status(400).render('error', {
        title: 'কোনো অধ্যায় নেই', message: 'ফরম্যাট করার আগে পাণ্ডুলিপি আপলোড করুন।',
        link: `/studio/${req.params.id}`, linkText: 'ফিরে যান',
      });
    }

    const payload = {
      manuscript: req.manuscript,
      chapters: chRes.rows,
      author: authorRes.rows[0],
      metadata: mdRes.rows[0] || null,
    };

    const wanted = [].concat(req.body.formats || ['epub', 'pdf', 'print_pdf']);
    const made = [];

    if (wanted.includes('epub')) made.push({ kind: 'epub', file: await formatter.buildEpub(payload) });
    if (wanted.includes('pdf')) made.push({ kind: 'pdf', file: await formatter.buildPdf(payload, 'digital') });
    if (wanted.includes('print_pdf')) {
      made.push({ kind: 'print_pdf', file: await formatter.buildPdf(payload, 'print') });
      formatter.buildPrintHtml(payload);   // browser-print companion
    }

    for (const m of made) {
      const rel = path.relative(path.join(__dirname, '..'), m.file).replace(/\\/g, '/');
      const size = fs.statSync(m.file).size;
      await db.query('DELETE FROM Manuscript_File WHERE manuscript_id = $1 AND kind = $2', [req.params.id, m.kind]);
      await db.query(
        `INSERT INTO Manuscript_File (manuscript_id, kind, file_path, original_name, mime_type, size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, m.kind, rel, path.basename(m.file),
         m.kind === 'epub' ? 'application/epub+zip' : 'application/pdf', size]
      );
    }

    await db.query(
      `UPDATE Manuscript SET status='formatted' WHERE manuscript_id=$1 AND status IN ('draft','analyzed')`,
      [req.params.id]
    );
    res.redirect(`/studio/${req.params.id}/format`);
  } catch (err) { next(err); }
});

/** Serve a generated file, but only to the manuscript's owner. */
router.get('/:id/download/:kind', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM Manuscript_File WHERE manuscript_id = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 1',
      [req.params.id, req.params.kind]
    );
    if (!rows.length) return res.status(404).send('ফাইল পাওয়া যায়নি।');
    const abs = path.join(__dirname, '..', rows[0].file_path);
    if (!abs.startsWith(path.join(__dirname, '..'))) return res.status(400).send('Invalid path');
    const safeTitle = req.manuscript.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'book';
    res.download(abs, `${safeTitle}.${req.params.kind === 'epub' ? 'epub' : 'pdf'}`);
  } catch (err) { next(err); }
});

/** The print-ready HTML, rendered in the browser for exact Bangla typography. */
router.get('/:id/print', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const p = path.join(formatter.OUT_DIR, `ms-${req.params.id}-print.html`);
    if (!fs.existsSync(p)) return res.redirect(`/studio/${req.params.id}/format`);
    res.sendFile(p);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Integrity / provenance
// ---------------------------------------------------------------------------
router.get('/:id/integrity', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const rRes = await db.query(
      'SELECT * FROM Integrity_Report WHERE manuscript_id = $1 ORDER BY run_at DESC LIMIT 1',
      [req.params.id]
    );
    const report = rRes.rows[0] || null;
    const matches = report
      ? (await db.query('SELECT * FROM Integrity_Match WHERE report_id = $1 ORDER BY similarity DESC', [report.report_id])).rows
      : [];
    const timeline = await integrity.provenanceTimeline(req.params.id);
    const chapters = (await db.query(
      'SELECT chapter_no, title FROM Manuscript_Chapter WHERE manuscript_id = $1 ORDER BY chapter_no', [req.params.id]
    )).rows;

    res.render('studio/integrity', {
      pageTitle: 'কপিরাইট ও উৎস', ms: req.manuscript, tab: 'integrity',
      report, matches, timeline, chapters,
    });
  } catch (err) { next(err); }
});

router.post('/:id/integrity/run', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    await integrity.run(req.params.id);
    res.redirect(`/studio/${req.params.id}/integrity`);
  } catch (err) { next(err); }
});

router.post('/:id/integrity/provenance', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    await integrity.recordProvenance(req.params.id, {
      chapter_no: req.body.chapter_no ? Number(req.body.chapter_no) : null,
      event_type: req.body.event_type,
      tool: req.body.tool || null,
      share_pct: Number(req.body.share_pct || 0),
      note: req.body.note || null,
    });
    res.redirect(`/studio/${req.params.id}/integrity`);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Beta readers
// ---------------------------------------------------------------------------
router.get('/:id/beta', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const [invites, feedback, averages, chapters] = await Promise.all([
      db.query('SELECT * FROM Beta_Invite WHERE manuscript_id = $1 ORDER BY invited_at DESC', [req.params.id]),
      db.query('SELECT * FROM Beta_Feedback WHERE manuscript_id = $1 ORDER BY created_at DESC', [req.params.id]),
      db.query('SELECT * FROM GetBetaAverages($1)', [req.params.id]),
      db.query('SELECT chapter_no, title FROM Manuscript_Chapter WHERE manuscript_id = $1 ORDER BY chapter_no', [req.params.id]),
    ]);
    res.render('studio/beta', {
      pageTitle: 'বিটা রিডার', ms: req.manuscript, tab: 'beta',
      invites: invites.rows, feedback: feedback.rows,
      avg: averages.rows[0] || null, chapters: chapters.rows,
      baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`,
    });
  } catch (err) { next(err); }
});

router.post('/:id/beta/invite', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO Beta_Invite (manuscript_id, reader_email, reader_name, token, from_chapter, to_chapter, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.params.id, req.body.reader_email || null, req.body.reader_name || null, token,
       Number(req.body.from_chapter || 1),
       req.body.to_chapter ? Number(req.body.to_chapter) : null, expires]
    );
    res.redirect(`/studio/${req.params.id}/beta`);
  } catch (err) { next(err); }
});

router.post('/:id/beta/revoke', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE Beta_Invite SET status='expired' WHERE invite_id=$1 AND manuscript_id=$2`,
      [req.body.invite_id, req.params.id]
    );
    res.redirect(`/studio/${req.params.id}/beta`);
  } catch (err) { next(err); }
});

module.exports = router;
