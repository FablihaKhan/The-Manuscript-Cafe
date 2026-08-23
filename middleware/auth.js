/**
 * Session guards + password hashing.
 *
 * The original app stored passwords in plain text and compared them with ===.
 * verifyPassword() accepts a bcrypt hash when one exists and falls back to the
 * legacy plaintext column otherwise — then transparently upgrades that row to a
 * hash. Existing accounts keep working; every login makes the database safer.
 */
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ROUNDS = 10;

async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

const TABLES = {
  author: { table: 'Author', idCol: 'id' },
  publisher: { table: 'Publisher', idCol: 'publisher_id' },
  editor: { table: 'Editor', idCol: 'editor_id' },
};

/**
 * @param row  the user row, containing password and/or password_hash
 * @param role 'author' | 'publisher' | 'editor' — used for the silent upgrade
 */
async function verifyPassword(row, plain, role) {
  if (!row || !plain) return false;

  if (row.password_hash) {
    // Seeded rows sometimes hold a plaintext value in the hash column; bcrypt
    // would just return false and lock the account out for no reason.
    if (!/^\$2[aby]\$/.test(row.password_hash)) {
      return row.password_hash === plain;
    }
    return bcrypt.compare(plain, row.password_hash);
  }

  // Legacy plaintext row.
  if (row.password && row.password === plain) {
    const meta = TABLES[role];
    if (meta) {
      try {
        const hash = await hashPassword(plain);
        // Store the hash AND wipe the plaintext column so it never lingers.
        await db.query(
          `UPDATE ${meta.table} SET password_hash = $1, password = NULL WHERE ${meta.idCol} = $2`,
          [hash, row[meta.idCol]]
        );
      } catch (err) {
        console.warn('Could not upgrade password to a hash:', err.message);
      }
    }
    return true;
  }

  return false;
}

/** Block a route unless an author is signed in. */
function requireAuthor(req, res, next) {
  if (req.session && req.session.authorId) return next();
  return res.status(401).render('error', {
    title: 'প্রবেশ প্রয়োজন',
    message: 'এই পাতাটি দেখতে হলে আগে লেখক হিসেবে লগইন করুন।',
    link: '/author/login',
    linkText: 'লগইন পাতা',
  });
}

function requirePublisher(req, res, next) {
  if (req.session && req.session.stored_publisher_Id) return next();
  return res.status(401).render('error', {
    title: 'প্রবেশ প্রয়োজন',
    message: 'এই পাতাটি দেখতে হলে প্রকাশক হিসেবে লগইন করুন।',
    link: '/publisher/login',
    linkText: 'লগইন পাতা',
  });
}

/**
 * Confirm the signed-in author actually owns this manuscript.
 * Without it any author could read any other author's book by guessing an id.
 */
async function requireOwnedManuscript(req, res, next) {
  const id = req.params.id || req.body.manuscript_id;
  const authorId = req.session.authorId;
  try {
    const { rows } = await db.query(
      'SELECT * FROM Manuscript WHERE manuscript_id = $1 AND author_id = $2',
      [id, authorId]
    );
    if (!rows.length) {
      return res.status(404).render('error', {
        title: 'পাণ্ডুলিপি পাওয়া যায়নি',
        message: 'এই পাণ্ডুলিপিটি নেই, অথবা এটি আপনার নয়।',
        link: '/studio',
        linkText: 'স্টুডিওতে ফিরুন',
      });
    }
    req.manuscript = rows[0];
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  requireAuthor,
  requirePublisher,
  requireOwnedManuscript,
};
