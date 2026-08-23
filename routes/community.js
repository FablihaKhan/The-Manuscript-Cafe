/**
 * Public and community surfaces:
 *   • beta reader feedback form (token-gated, no login)
 *   • professional marketplace (editors, designers, translators…)
 *   • universal book link + click analytics
 *   • the author's sales dashboard
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const { requireAuthor, requireOwnedManuscript } = require('../middleware/auth');
const langSvc = require('../services/lang');

const router = express.Router();

// ---------------------------------------------------------------------------
// Beta reader — public, reached only with a valid token
// ---------------------------------------------------------------------------
router.get('/beta/:token', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT i.*, m.title, m.manuscript_id, m.language
         FROM Beta_Invite i JOIN Manuscript m ON m.manuscript_id = i.manuscript_id
        WHERE i.token = $1`,
      [req.params.token]
    );
    const invite = rows[0];
    if (!invite || invite.status === 'expired' || (invite.expires_at && new Date(invite.expires_at) < new Date())) {
      return res.status(404).render('error', {
        title: 'লিংকটি আর কাজ করছে না',
        message: 'এই আমন্ত্রণ লিংকটি বাতিল বা মেয়াদোত্তীর্ণ হয়েছে। লেখকের কাছে নতুন লিংক চান।',
        link: '/', linkText: 'হোম',
      });
    }

    const to = invite.to_chapter || 9999;
    const chapters = (await db.query(
      `SELECT chapter_no, title, content FROM Manuscript_Chapter
        WHERE manuscript_id = $1 AND chapter_no BETWEEN $2 AND $3 ORDER BY chapter_no`,
      [invite.manuscript_id, invite.from_chapter || 1, to]
    )).rows;

    if (invite.status === 'invited') {
      await db.query("UPDATE Beta_Invite SET status='opened' WHERE invite_id=$1", [invite.invite_id]);
    }

    res.render('beta/read', {
      pageTitle: invite.title, invite, chapters,
      paragraphs: (text) => langSvc.paragraphs(text || ''),
    });
  } catch (err) { next(err); }
});

router.post('/beta/:token', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM Beta_Invite WHERE token = $1', [req.params.token]);
    const invite = rows[0];
    if (!invite || invite.status === 'expired') return res.status(403).send('এই লিংকটি আর সক্রিয় নয়।');

    const clampScore = (v) => Math.max(0, Math.min(10, parseInt(v, 10) || 0));
    await db.query(
      `INSERT INTO Beta_Feedback
         (manuscript_id, invite_id, reader_name, chapter_no, story, characters, pacing, ending, prose, would_recommend, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [invite.manuscript_id, invite.invite_id,
       req.body.reader_name || invite.reader_name || 'নাম দেননি',
       req.body.chapter_no ? Number(req.body.chapter_no) : null,
       clampScore(req.body.story), clampScore(req.body.characters), clampScore(req.body.pacing),
       clampScore(req.body.ending), clampScore(req.body.prose),
       req.body.would_recommend === 'yes', req.body.comment || null]
    );
    await db.query("UPDATE Beta_Invite SET status='submitted' WHERE invite_id=$1", [invite.invite_id]);

    res.render('beta/thanks', { pageTitle: 'ধন্যবাদ' });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Professional marketplace
// ---------------------------------------------------------------------------
router.get('/marketplace', async (req, res, next) => {
  try {
    const role = req.query.role || '';
    const language = req.query.language || '';
    const params = [];
    let where = 'WHERE available = TRUE';
    if (role) { params.push(role); where += ` AND role = $${params.length}`; }
    if (language) { params.push(language); where += ` AND $${params.length} = ANY(languages)`; }

    const { rows } = await db.query(
      `SELECT * FROM Service_Pro ${where} ORDER BY rating DESC, jobs_done DESC`, params
    );

    let manuscripts = [];
    if (req.session?.authorId) {
      manuscripts = (await db.query(
        'SELECT manuscript_id, title FROM Manuscript WHERE author_id = $1 ORDER BY updated_at DESC',
        [req.session.authorId]
      )).rows;
    }

    res.render('marketplace/list', {
      pageTitle: 'পেশাজীবী মার্কেটপ্লেস', pros: rows, role, language, manuscripts,
    });
  } catch (err) { next(err); }
});

router.post('/marketplace/hire', requireAuthor, async (req, res, next) => {
  try {
    const owned = await db.query(
      'SELECT 1 FROM Manuscript WHERE manuscript_id = $1 AND author_id = $2',
      [req.body.manuscript_id, req.session.authorId]
    );
    if (!owned.rows.length) return res.status(403).send('এই পাণ্ডুলিপিটি আপনার নয়।');

    await db.query(
      `INSERT INTO Pro_Hire (manuscript_id, pro_id, author_id, agreed_rate, brief)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.body.manuscript_id, req.body.pro_id, req.session.authorId,
       req.body.agreed_rate || null, req.body.brief || null]
    );
    res.redirect('/marketplace?hired=1');
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Universal Book Link
// ---------------------------------------------------------------------------
function slugify(title, fallback) {
  const base = String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base || `book-${fallback}`;
}

router.get('/studio/:id/link', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const uRes = await db.query('SELECT * FROM Universal_Book_Link WHERE manuscript_id = $1', [req.params.id]);
    const ubl = uRes.rows[0] || null;
    const retailers = ubl
      ? (await db.query('SELECT * FROM UBL_Retailer WHERE ubl_id = $1 ORDER BY sort_order, retailer_id', [ubl.ubl_id])).rows
      : [];
    const clicks = ubl
      ? (await db.query(
          `SELECT retailer, COUNT(*)::int AS n FROM UBL_Click WHERE ubl_id = $1 GROUP BY retailer ORDER BY n DESC`,
          [ubl.ubl_id])).rows
      : [];

    res.render('studio/link', {
      pageTitle: 'ইউনিভার্সাল বুক লিংক', ms: req.manuscript, tab: 'link',
      ubl, retailers, clicks,
      baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`,
    });
  } catch (err) { next(err); }
});

router.post('/studio/:id/link/create', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const md = await db.query(
      'SELECT blurb FROM Book_Metadata WHERE manuscript_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [req.params.id]
    );
    let slug = slugify(req.body.slug || req.manuscript.title, req.params.id);
    // Slugs are global; append a suffix rather than fail on a clash.
    const taken = await db.query('SELECT 1 FROM Universal_Book_Link WHERE slug = $1 AND manuscript_id <> $2', [slug, req.params.id]);
    if (taken.rows.length) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;

    await db.query(
      `INSERT INTO Universal_Book_Link (manuscript_id, slug, title, blurb, cover_path)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, blurb = EXCLUDED.blurb, cover_path = EXCLUDED.cover_path`,
      [req.params.id, slug, req.manuscript.title, md.rows[0]?.blurb || null, req.manuscript.cover_path]
    );
    res.redirect(`/studio/${req.params.id}/link`);
  } catch (err) { next(err); }
});

router.post('/studio/:id/link/retailer', requireAuthor, requireOwnedManuscript, async (req, res, next) => {
  try {
    const u = await db.query('SELECT ubl_id FROM Universal_Book_Link WHERE manuscript_id = $1', [req.params.id]);
    if (!u.rows.length) return res.redirect(`/studio/${req.params.id}/link`);
    if (!/^https?:\/\//i.test(req.body.url || '')) {
      return res.status(400).send('লিংকটি http:// বা https:// দিয়ে শুরু হতে হবে।');
    }
    await db.query(
      'INSERT INTO UBL_Retailer (ubl_id, retailer, url, region, sort_order) VALUES ($1,$2,$3,$4,$5)',
      [u.rows[0].ubl_id, req.body.retailer, req.body.url, req.body.region || 'BD', Number(req.body.sort_order || 0)]
    );
    res.redirect(`/studio/${req.params.id}/link`);
  } catch (err) { next(err); }
});

/** The public landing page one link points at. */
router.get('/b/:slug', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM Universal_Book_Link WHERE slug = $1', [req.params.slug]);
    const ubl = rows[0];
    if (!ubl) {
      return res.status(404).render('error', {
        title: 'বই পাওয়া যায়নি', message: 'এই লিংকে কোনো বই নেই।', link: '/', linkText: 'হোম',
      });
    }
    const retailers = (await db.query(
      'SELECT * FROM UBL_Retailer WHERE ubl_id = $1 ORDER BY sort_order, retailer_id', [ubl.ubl_id]
    )).rows;
    res.render('ubl/page', { pageTitle: ubl.title, ubl, retailers });
  } catch (err) { next(err); }
});

/** Click-through: record, then redirect to the retailer. */
router.get('/b/:slug/go/:retailerId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT r.url, r.retailer, r.ubl_id
         FROM UBL_Retailer r JOIN Universal_Book_Link u ON u.ubl_id = r.ubl_id
        WHERE u.slug = $1 AND r.retailer_id = $2`,
      [req.params.slug, req.params.retailerId]
    );
    if (!rows.length) return res.redirect(`/b/${req.params.slug}`);
    await db.query(
      'INSERT INTO UBL_Click (ubl_id, retailer, referrer) VALUES ($1,$2,$3)',
      [rows[0].ubl_id, rows[0].retailer, (req.get('referer') || '').slice(0, 300)]
    );
    res.redirect(rows[0].url);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Sales analytics
// ---------------------------------------------------------------------------
router.get('/studio/analytics', requireAuthor, async (req, res, next) => {
  try {
    const authorId = req.session.authorId;
    const [sales, monthly, reviews, clicks, subs] = await Promise.all([
      db.query('SELECT * FROM GetAuthorSales($1)', [authorId]),
      db.query(
        `SELECT to_char(date_trunc('month', bs.sold_at), 'YYYY-MM') AS month,
                COUNT(*)::int AS copies, COALESCE(SUM(bs.unit_price),0)::float AS revenue
           FROM Book_sales bs JOIN Book b ON b.book_id = bs.book_id
          WHERE b.author_id = $1
          GROUP BY 1 ORDER BY 1`, [authorId]),
      db.query(
        `SELECT b.book_title, ROUND(AVG(r.rating),1) AS avg_rating, COUNT(r.review_id)::int AS reviews
           FROM Book b LEFT JOIN Review r ON r.book_id = b.book_id
          WHERE b.author_id = $1 GROUP BY b.book_title`, [authorId]),
      db.query(
        `SELECT u.title, c.retailer, COUNT(*)::int AS clicks
           FROM UBL_Click c
           JOIN Universal_Book_Link u ON u.ubl_id = c.ubl_id
           JOIN Manuscript m ON m.manuscript_id = u.manuscript_id
          WHERE m.author_id = $1
          GROUP BY u.title, c.retailer ORDER BY clicks DESC`, [authorId]),
      db.query(
        `SELECT s.status, COUNT(*)::int AS n
           FROM Submission s JOIN Manuscript m ON m.manuscript_id = s.manuscript_id
          WHERE m.author_id = $1 GROUP BY s.status`, [authorId]),
    ]);

    res.render('studio/analytics', {
      pageTitle: 'বিক্রয় ও পাঠক বিশ্লেষণ',
      sales: sales.rows, monthly: monthly.rows, reviews: reviews.rows,
      clicks: clicks.rows, submissionStats: subs.rows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
