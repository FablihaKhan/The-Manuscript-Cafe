/**
 * Smart Publisher / Literary Agent Matcher.
 *
 * Scores every open publisher against a manuscript on six axes and explains
 * each score, so the author sees WHY a house is a 91% match and not just that
 * it is. Reasons are stored with the match and shown in the UI.
 */
const db = require('../config/db');

const AXES = {
  genre: 30,      // does the house actually publish this?
  language: 20,   // Bangla / English / both
  audience: 12,
  length: 15,     // manuscript inside their word range
  country: 8,
  track_record: 15, // their historical approval rate on this platform
};

function norm(s) {
  return (s || '').toString().trim().toLowerCase();
}

/** Genre families, so "Thriller" still scores against a house that takes "Mystery". */
const GENRE_FAMILY = {
  thriller: ['thriller', 'mystery', 'crime', 'suspense', 'রহস্য', 'থ্রিলার'],
  mystery: ['mystery', 'thriller', 'crime', 'detective', 'রহস্য'],
  romance: ['romance', 'contemporary', 'রোমান্স', 'প্রেম'],
  fantasy: ['fantasy', 'sci-fi', 'science fiction', 'speculative', 'কল্পকাহিনি'],
  'sci-fi': ['sci-fi', 'science fiction', 'fantasy', 'speculative', 'কল্পবিজ্ঞান'],
  fiction: ['fiction', 'literary', 'novel', 'উপন্যাস', 'কথাসাহিত্য'],
  literary: ['literary', 'fiction', 'novel', 'উপন্যাস'],
  history: ['history', 'non-fiction', 'biography', 'ইতিহাস'],
  biography: ['biography', 'memoir', 'non-fiction', 'জীবনী'],
  poetry: ['poetry', 'verse', 'কবিতা'],
  children: ['children', 'picture book', 'শিশুতোষ'],
};

function genreScore(msGenre, accepted = []) {
  const g = norm(msGenre);
  const list = (accepted || []).map(norm);
  if (!g) return { score: AXES.genre * 0.5, reason: 'ধরন উল্লেখ করা হয়নি' };
  if (!list.length) return { score: AXES.genre * 0.6, reason: 'প্রকাশক কোনো ধরন নির্দিষ্ট করেননি' };
  if (list.includes(g)) return { score: AXES.genre, reason: `"${msGenre}" এই প্রকাশকের তালিকায় আছে` };

  const family = GENRE_FAMILY[g] || [];
  const near = list.find((x) => family.includes(x) || (GENRE_FAMILY[x] || []).includes(g));
  if (near) return { score: AXES.genre * 0.7, reason: `কাছাকাছি ধরন "${near}" প্রকাশ করেন` };

  return { score: 0, reason: `"${msGenre}" এই প্রকাশক সাধারণত নেন না` };
}

function languageScore(msLang, langs = []) {
  const list = (langs || []).map(norm);
  if (!list.length) return { score: AXES.language * 0.6, reason: 'ভাষা উল্লেখ নেই' };
  if (msLang === 'mixed') {
    return list.includes('bn') && list.includes('en')
      ? { score: AXES.language, reason: 'বাংলা ও ইংরেজি দুটোই প্রকাশ করেন' }
      : { score: AXES.language * 0.5, reason: 'মিশ্র ভাষার পাণ্ডুলিপি — আংশিক মিল' };
  }
  return list.includes(msLang)
    ? { score: AXES.language, reason: msLang === 'bn' ? 'বাংলা বই প্রকাশ করেন' : 'ইংরেজি বই প্রকাশ করেন' }
    : { score: 0, reason: msLang === 'bn' ? 'বাংলা বই প্রকাশ করেন না' : 'ইংরেজি বই প্রকাশ করেন না' };
}

function audienceScore(msAud, auds = []) {
  const list = (auds || []).map(norm);
  if (!list.length) return { score: AXES.audience * 0.6, reason: '' };
  return list.includes(norm(msAud))
    ? { score: AXES.audience, reason: `${msAud} পাঠকের বই প্রকাশ করেন` }
    : { score: AXES.audience * 0.3, reason: `${msAud} পাঠক তাদের মূল লক্ষ্য নয়` };
}

function lengthScore(words, min, max) {
  const lo = min || 0;
  const hi = max || 250000;
  if (!words) return { score: AXES.length * 0.5, reason: 'শব্দসংখ্যা জানা নেই' };
  if (words >= lo && words <= hi) {
    return { score: AXES.length, reason: `${words.toLocaleString('bn-BD')} শব্দ তাদের সীমার মধ্যে` };
  }
  const distance = words < lo ? (lo - words) / Math.max(lo, 1) : (words - hi) / Math.max(hi, 1);
  const score = Math.max(0, AXES.length * (1 - Math.min(1, distance * 2)));
  return {
    score,
    reason: words < lo
      ? `তাদের ন্যূনতম ${lo.toLocaleString('bn-BD')} শব্দের চেয়ে ছোট`
      : `তাদের সর্বোচ্চ ${hi.toLocaleString('bn-BD')} শব্দের চেয়ে বড়`,
  };
}

function countryScore(msCountry, pubCountry) {
  if (!pubCountry) return { score: AXES.country * 0.6, reason: '' };
  return norm(msCountry) === norm(pubCountry)
    ? { score: AXES.country, reason: `একই দেশে (${pubCountry})` }
    : { score: AXES.country * 0.4, reason: `ভিন্ন দেশ (${pubCountry})` };
}

function trackScore(approvalRate) {
  const rate = Number(approvalRate) || 0;
  // A house that approves nothing is a poor bet; one that approves everything
  // is not selective. Peak usefulness sits in the middle-high band.
  const shaped = rate <= 0 ? 0.35 : rate >= 60 ? 0.85 : 0.35 + (rate / 60) * 0.5;
  return {
    score: AXES.track_record * shaped,
    reason: rate > 0 ? `এই প্ল্যাটফর্মে অনুমোদনের হার ${Math.round(rate)}%` : 'এখনো কোনো অনুমোদনের রেকর্ড নেই',
  };
}

/**
 * Rank publishers for a manuscript.
 * `agentsOnly` limits results to literary agents.
 */
async function match(manuscriptId, { limit = 20, agentsOnly = null, includeClosed = false } = {}) {
  const msRes = await db.query('SELECT * FROM Manuscript WHERE manuscript_id = $1', [manuscriptId]);
  const ms = msRes.rows[0];
  if (!ms) throw new Error('Manuscript not found');

  const { rows: publishers } = await db.query(
    `SELECT p.publisher_id, p.name, p.email, p.contact_no,
            pp.is_agent, pp.accepted_genres, pp.languages, pp.audiences,
            pp.min_words, pp.max_words, pp.country, pp.open_for_submission,
            pp.response_days, pp.submission_guidelines, pp.wants_full_manuscript,
            COALESCE(GetApprovalRate(p.publisher_id), 0) AS approval_rate
       FROM Publisher p
       LEFT JOIN Publisher_Profile pp ON pp.publisher_id = p.publisher_id`
  );

  const results = [];
  for (const p of publishers) {
    if (!includeClosed && p.open_for_submission === false) continue;
    if (agentsOnly === true && !p.is_agent) continue;
    if (agentsOnly === false && p.is_agent) continue;

    const parts = {
      genre: genreScore(ms.genre, p.accepted_genres),
      language: languageScore(ms.language, p.languages),
      audience: audienceScore(ms.audience, p.audiences),
      length: lengthScore(ms.word_count, p.min_words, p.max_words),
      country: countryScore(ms.country, p.country),
      track_record: trackScore(p.approval_rate),
    };

    const raw = Object.values(parts).reduce((s, x) => s + x.score, 0);
    const max = Object.values(AXES).reduce((a, b) => a + b, 0);
    const score = Math.round((raw / max) * 100);

    results.push({
      publisher_id: p.publisher_id,
      name: p.name,
      email: p.email,
      is_agent: Boolean(p.is_agent),
      response_days: p.response_days || 30,
      guidelines: p.submission_guidelines,
      wants_full_manuscript: p.wants_full_manuscript,
      open: p.open_for_submission !== false,
      score,
      reasons: Object.entries(parts)
        .filter(([, v]) => v.reason)
        .map(([axis, v]) => ({ axis, reason: v.reason, earned: Math.round(v.score), max: AXES[axis] })),
    });
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, limit);

  // Cache so the dashboard does not recompute on every page load.
  for (const r of top) {
    await db.query(
      `INSERT INTO Publisher_Match (manuscript_id, publisher_id, score, reasons, computed_at)
       VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)
       ON CONFLICT (manuscript_id, publisher_id)
       DO UPDATE SET score = EXCLUDED.score, reasons = EXCLUDED.reasons, computed_at = CURRENT_TIMESTAMP`,
      [manuscriptId, r.publisher_id, r.score, JSON.stringify(r.reasons)]
    );
  }

  return { manuscript: ms, matches: top };
}

module.exports = { match, AXES };
