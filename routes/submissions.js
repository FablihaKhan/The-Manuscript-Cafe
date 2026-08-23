/**
 * Publisher matching, submission package generation and the submission tracker.
 * Mounted under /studio/:id so it shares the manuscript tab bar.
 */
const express = require('express');
const db = require('../config/db');
const { requireAuthor, requireOwnedManuscript } = require('../middleware/auth');
const matcher = require('../services/matcher');
const packSvc = require('../services/submissionPack');
const ai = require('../services/ai');

const router = express.Router();

const STATUS_LABELS = {
  submitted: 'পাঠানো হয়েছে',
  viewed: 'দেখা হয়েছে',
  requested_partial: 'আংশিক পাণ্ডুলিপি চেয়েছে',
  requested_full: 'সম্পূর্ণ পাণ্ডুলিপি চেয়েছে',
  offer: 'প্রস্তাব দিয়েছে',
  accepted: 'গৃহীত',
  rejected: 'প্রত্যাখ্যাত',
  withdrawn: 'প্রত্যাহার করা হয়েছে',
};

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------
router.get('/:id/matches', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const agentsOnly = req.query.type === 'agent' ? true : req.query.type === 'publisher' ? false : null;
    const { matches } = await matcher.match(req.params.id, { agentsOnly });

    const existing = await db.query(
      'SELECT publisher_id, status FROM Submission WHERE manuscript_id = $1', [req.params.id]
    );
    const submitted = new Map(existing.rows.map((r) => [Number(r.publisher_id), r.status]));

    res.render('studio/matches', {
      pageTitle: 'প্রকাশক মিল', ms: req.manuscript, tab: 'matches',
      matches, submitted, filter: req.query.type || 'all', statusLabels: STATUS_LABELS,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Submission package
// ---------------------------------------------------------------------------
router.get('/:id/package', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM Submission_Package WHERE manuscript_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [req.params.id]
    );
    const publishers = await db.query(
      `SELECT p.publisher_id, p.name FROM Publisher p ORDER BY p.name`
    );
    res.render('studio/package', {
      pageTitle: 'সাবমিশন প্যাকেজ', ms: req.manuscript, tab: 'package',
      pack: rows[0] || null, publishers: publishers.rows, aiOn: ai.isEnabled(),
    });
  } catch (err) { next(err); }
});

router.post('/:id/package/generate', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    await packSvc.generate(req.params.id, {
      publisherId: req.body.publisher_id || null,
      useAI: req.body.use_ai !== 'off',
    });
    res.redirect(`/studio/${req.params.id}/package`);
  } catch (err) { next(err); }
});

router.post('/:id/package/save', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE Submission_Package
          SET query_letter=$1, synopsis=$2, pitch=$3, author_bio=$4, proposal=$5, comp_titles=$6
        WHERE package_id=$7 AND manuscript_id=$8`,
      [req.body.query_letter, req.body.synopsis, req.body.pitch, req.body.author_bio,
       req.body.proposal, req.body.comp_titles, req.body.package_id, req.params.id]
    );
    res.redirect(`/studio/${req.params.id}/package`);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------
router.get('/:id/submissions', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, p.name AS publisher_name, p.email AS publisher_email,
              pp.is_agent, pp.response_days,
              (CURRENT_DATE - s.expected_by) AS days_overdue
         FROM Submission s
         JOIN Publisher p ON p.publisher_id = s.publisher_id
         LEFT JOIN Publisher_Profile pp ON pp.publisher_id = s.publisher_id
        WHERE s.manuscript_id = $1
        ORDER BY s.submitted_at DESC`,
      [req.params.id]
    );

    const events = rows.length
      ? (await db.query(
          `SELECT * FROM Submission_Event WHERE submission_id = ANY($1::bigint[]) ORDER BY event_at DESC`,
          [rows.map((r) => r.submission_id)]
        )).rows
      : [];

    const byId = new Map();
    for (const e of events) {
      if (!byId.has(Number(e.submission_id))) byId.set(Number(e.submission_id), []);
      byId.get(Number(e.submission_id)).push(e);
    }

    res.render('studio/submissions', {
      pageTitle: 'সাবমিশন ট্র্যাকার', ms: req.manuscript, tab: 'submissions',
      submissions: rows, eventsBySubmission: byId, statusLabels: STATUS_LABELS,
    });
  } catch (err) { next(err); }
});

router.post('/:id/submissions/create', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const pkg = await db.query(
      'SELECT package_id FROM Submission_Package WHERE manuscript_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [req.params.id]
    );
    await db.query(
      `INSERT INTO Submission (manuscript_id, publisher_id, package_id, notes)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (manuscript_id, publisher_id) DO NOTHING`,
      [req.params.id, req.body.publisher_id, pkg.rows[0]?.package_id || null, req.body.notes || null]
    );
    await db.query(
      `UPDATE Manuscript SET status='submitted' WHERE manuscript_id=$1 AND status <> 'published'`,
      [req.params.id]
    );

    // Let the publisher know something is waiting.
    await db.query(
      `INSERT INTO Notification (role, user_id, title, body, link)
       VALUES ('publisher', $1, $2, $3, '/publisher/login')`,
      [req.body.publisher_id, 'নতুন সাবমিশন',
       `"${req.manuscript.title}" আপনার বিবেচনার জন্য পাঠানো হয়েছে।`]
    );

    res.redirect(req.body.back || `/studio/${req.params.id}/submissions`);
  } catch (err) { next(err); }
});

router.post('/:id/submissions/status', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    if (!Object.keys(STATUS_LABELS).includes(req.body.status)) {
      return res.status(400).send('অজানা স্ট্যাটাস');
    }
    await db.query(
      'UPDATE Submission SET status = $1, notes = COALESCE($2, notes) WHERE submission_id = $3 AND manuscript_id = $4',
      [req.body.status, req.body.notes || null, req.body.submission_id, req.params.id]
    );
    res.redirect(`/studio/${req.params.id}/submissions`);
  } catch (err) { next(err); }
});

module.exports = router;
