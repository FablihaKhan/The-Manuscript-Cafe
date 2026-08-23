/**
 * Publishing Readiness Score.
 *
 * Five pillars, each 0-100, rolled into one honest overall number:
 *   Manuscript → Editing → Formatting → Cover → Metadata
 *
 * The point is not the number. It is the blocker list: "your book is not ready
 * yet, fix these six things", each one clickable.
 */
const db = require('../config/db');

const WEIGHTS = { manuscript: 0.30, editing: 0.25, formatting: 0.15, cover: 0.10, metadata: 0.20 };

// Typical publishable lengths. A 12k-word "novel" is not ready, whatever else is done.
const TARGET_WORDS = {
  novel: 50000, fiction: 50000, thriller: 70000, romance: 60000, 'sci-fi': 70000,
  fantasy: 80000, mystery: 65000, history: 60000, 'non-fiction': 50000,
  biography: 60000, poetry: 5000, children: 3000, ya: 55000, academic: 40000,
};

function targetWords(genre = '', audience = '') {
  const g = (genre || '').toLowerCase().trim();
  if (TARGET_WORDS[g]) return TARGET_WORDS[g];
  const a = (audience || '').toLowerCase();
  if (a === 'children') return 3000;
  if (a === 'ya') return 55000;
  if (a === 'academic') return 40000;
  return 50000;
}

function pct(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Gather every fact the score depends on in one round trip each. */
async function gather(manuscriptId) {
  const [ms, analysis, issues, files, meta, beta, hires, subs] = await Promise.all([
    db.query('SELECT * FROM Manuscript WHERE manuscript_id = $1', [manuscriptId]),
    db.query('SELECT * FROM Manuscript_Analysis WHERE manuscript_id = $1 ORDER BY run_at DESC LIMIT 1', [manuscriptId]),
    db.query(`SELECT i.severity, i.resolved FROM Manuscript_Issue i
              JOIN Manuscript_Analysis a ON a.analysis_id = i.analysis_id
              WHERE a.manuscript_id = $1
                AND a.analysis_id = (SELECT analysis_id FROM Manuscript_Analysis
                                     WHERE manuscript_id = $1 ORDER BY run_at DESC LIMIT 1)`, [manuscriptId]),
    db.query('SELECT kind, COUNT(*)::int AS n FROM Manuscript_File WHERE manuscript_id = $1 GROUP BY kind', [manuscriptId]),
    db.query('SELECT * FROM Book_Metadata WHERE manuscript_id = $1 ORDER BY generated_at DESC LIMIT 1', [manuscriptId]),
    db.query('SELECT COUNT(*)::int AS n, AVG((story+characters+pacing+ending+prose)/5.0) AS avg FROM Beta_Feedback WHERE manuscript_id = $1', [manuscriptId]),
    db.query('SELECT h.pro_id, p.role, h.status FROM Pro_Hire h JOIN Service_Pro p ON p.pro_id = h.pro_id WHERE h.manuscript_id = $1', [manuscriptId]),
    db.query('SELECT status FROM Submission WHERE manuscript_id = $1', [manuscriptId]),
  ]);

  const fileKinds = Object.fromEntries(files.rows.map((r) => [r.kind, r.n]));
  return {
    manuscript: ms.rows[0],
    analysis: analysis.rows[0] || null,
    issues: issues.rows,
    fileKinds,
    metadata: meta.rows[0] || null,
    betaCount: beta.rows[0]?.n || 0,
    betaAvg: beta.rows[0]?.avg ? Number(beta.rows[0].avg) : null,
    hires: hires.rows,
    submissions: subs.rows,
  };
}

function score(data, language = 'bn') {
  const ms = data.manuscript;
  const blockers = [];
  const add = (pillar, bn, en, link, weight = 1) =>
    blockers.push({ pillar, message: language === 'en' ? en : bn, link, weight });

  // ---- 1. Manuscript ------------------------------------------------------
  const target = targetWords(ms.genre, ms.audience);
  const lengthScore = pct((ms.word_count / target) * 100);
  const health = data.analysis?.health_score ?? null;

  let manuscript = lengthScore * 0.5;
  if (health !== null) manuscript += health * 0.35;
  if (ms.synopsis && ms.synopsis.trim().length > 120) manuscript += 15;

  if (ms.word_count < target * 0.6) {
    add('manuscript',
      `পাণ্ডুলিপি এখনো ছোট — ${ms.word_count.toLocaleString('bn-BD')} শব্দ, ${ms.genre || 'এই ধরনের'} বইয়ের জন্য সাধারণত ${target.toLocaleString('bn-BD')} শব্দ দরকার।`,
      `Manuscript is short — ${ms.word_count} words against a typical ${target} for ${ms.genre || 'this kind of book'}.`,
      `/studio/${ms.manuscript_id}`, 3);
  }
  if (health === null) {
    add('manuscript', 'Manuscript Doctor এখনো চালানো হয়নি।', 'The Manuscript Doctor has not been run yet.',
      `/studio/${ms.manuscript_id}/doctor`, 3);
  } else if (health < 65) {
    add('manuscript', `Manuscript Health Score ${health}/১০০ — ৬৫-এর নিচে।`,
      `Manuscript Health Score is ${health}/100, below the 65 threshold.`, `/studio/${ms.manuscript_id}/doctor`, 3);
  }
  if (!ms.synopsis || ms.synopsis.trim().length < 120) {
    add('manuscript', 'সারসংক্ষেপ (synopsis) লেখা হয়নি।', 'No synopsis written yet.', `/studio/${ms.manuscript_id}`, 1);
  }

  // ---- 2. Editing ---------------------------------------------------------
  const open = data.issues.filter((i) => !i.resolved);
  const openHigh = open.filter((i) => i.severity === 'high').length;
  const openMed = open.filter((i) => i.severity === 'medium').length;
  const total = data.issues.length || 1;
  const resolvedShare = (data.issues.length - open.length) / total;

  let editing = data.analysis ? 40 + resolvedShare * 40 : 0;
  editing -= openHigh * 8 + openMed * 3;
  if (data.betaCount >= 3) editing += 12;
  else if (data.betaCount > 0) editing += 6;
  if (data.hires.some((h) => ['editor', 'proofreader'].includes(h.role) && h.status === 'delivered')) editing += 15;

  if (openHigh > 0) {
    add('editing', `${openHigh}টি গুরুতর সমস্যা এখনো ঠিক করা হয়নি।`,
      `${openHigh} high-severity issues are still open.`, `/studio/${ms.manuscript_id}/doctor`, 3);
  }
  if (data.betaCount < 3) {
    add('editing', `বিটা রিডার ফিডব্যাক দরকার (এখন ${data.betaCount}টি, অন্তত ৩টি চাই)।`,
      `Only ${data.betaCount} beta reader responses; aim for at least 3.`, `/studio/${ms.manuscript_id}/beta`, 2);
  }

  // ---- 3. Formatting ------------------------------------------------------
  let formatting = 0;
  if (data.fileKinds.source) formatting += 20;
  if (data.fileKinds.pdf) formatting += 30;
  if (data.fileKinds.epub) formatting += 35;
  if (data.fileKinds.print_pdf) formatting += 15;

  if (!data.fileKinds.epub) {
    add('formatting', 'EPUB তৈরি হয়নি — ই-বুক বিক্রির জন্য দরকার।',
      'No EPUB generated — required for e-book retailers.', `/studio/${ms.manuscript_id}/format`, 2);
  }
  if (!data.fileKinds.print_pdf) {
    add('formatting', 'ছাপার উপযোগী PDF তৈরি হয়নি।', 'No print-ready PDF generated.', `/studio/${ms.manuscript_id}/format`, 1);
  }

  // ---- 4. Cover -----------------------------------------------------------
  let cover = 0;
  if (ms.cover_path) cover += 70;
  if (data.hires.some((h) => h.role === 'cover_designer' && ['accepted', 'in_progress', 'delivered'].includes(h.status))) cover += 30;
  if (!ms.cover_path) {
    add('cover', 'প্রচ্ছদ আপলোড করা হয়নি।', 'No cover uploaded.', `/studio/${ms.manuscript_id}`, 2);
  }

  // ---- 5. Metadata --------------------------------------------------------
  const md = data.metadata;
  let metadata = 0;
  if (md) {
    if (md.title) metadata += 12;
    if (md.blurb && md.blurb.length > 100) metadata += 28;
    if (md.keywords && md.keywords.length >= 5) metadata += 24;
    if (md.categories && md.categories.length >= 2) metadata += 18;
    if (md.audience) metadata += 8;
    if (md.comp_titles) metadata += 10;
  }
  if (!md) {
    add('metadata', 'বইয়ের metadata (blurb, keyword, category) তৈরি হয়নি।',
      'No discoverability metadata generated yet.', `/studio/${ms.manuscript_id}/metadata`, 3);
  } else {
    if (!md.blurb || md.blurb.length < 100) add('metadata', 'পিছনের মলাটের লেখা (blurb) নেই।', 'Back-cover blurb missing.', `/studio/${ms.manuscript_id}/metadata`, 2);
    if (!md.keywords || md.keywords.length < 5) add('metadata', 'অন্তত ৫টি keyword দরকার।', 'At least 5 keywords needed.', `/studio/${ms.manuscript_id}/metadata`, 1);
    if (!md.categories || md.categories.length < 2) add('metadata', 'অন্তত ২টি category দরকার।', 'At least 2 categories needed.', `/studio/${ms.manuscript_id}/metadata`, 1);
  }

  const pillars = {
    manuscript_pct: pct(manuscript),
    editing_pct: pct(editing),
    formatting_pct: pct(formatting),
    cover_pct: pct(cover),
    metadata_pct: pct(metadata),
  };

  const overall = pct(
    pillars.manuscript_pct * WEIGHTS.manuscript +
    pillars.editing_pct * WEIGHTS.editing +
    pillars.formatting_pct * WEIGHTS.formatting +
    pillars.cover_pct * WEIGHTS.cover +
    pillars.metadata_pct * WEIGHTS.metadata
  );

  blockers.sort((a, b) => b.weight - a.weight);

  return {
    ...pillars,
    overall_pct: overall,
    verdict: verdict(overall, language),
    ready: overall >= 85 && !blockers.some((b) => b.weight >= 3),
    blockers,
  };
}

function verdict(overall, language) {
  if (language === 'en') {
    if (overall >= 85) return 'Ready to publish.';
    if (overall >= 65) return 'Nearly there — finish the items below.';
    if (overall >= 40) return 'Your book is not ready yet. Fix the items below.';
    return 'Early draft. Start with the manuscript itself.';
  }
  if (overall >= 85) return 'আপনার বই প্রকাশের জন্য প্রস্তুত।';
  if (overall >= 65) return 'প্রায় প্রস্তুত — নিচের কাজগুলো শেষ করুন।';
  if (overall >= 40) return 'আপনার বই এখনো প্রস্তুত নয়। নিচের বিষয়গুলো ঠিক করুন।';
  return 'এটি এখনো প্রাথমিক খসড়া। আগে পাণ্ডুলিপির কাজ শেষ করুন।';
}

/** Compute, persist and return the snapshot. */
async function computeAndSave(manuscriptId, language = 'bn') {
  const data = await gather(manuscriptId);
  if (!data.manuscript) throw new Error('Manuscript not found');
  const result = score(data, language);

  await db.query(
    `INSERT INTO Readiness_Snapshot
       (manuscript_id, manuscript_pct, editing_pct, formatting_pct, cover_pct, metadata_pct, overall_pct, blockers)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [manuscriptId, result.manuscript_pct, result.editing_pct, result.formatting_pct,
     result.cover_pct, result.metadata_pct, result.overall_pct, JSON.stringify(result.blockers)]
  );

  return { ...result, manuscript: data.manuscript, analysis: data.analysis };
}

module.exports = { computeAndSave, gather, score, targetWords, WEIGHTS };
