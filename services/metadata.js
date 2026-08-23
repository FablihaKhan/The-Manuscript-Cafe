/**
 * Book Discoverability / Metadata engine.
 *
 * Produces title, subtitle, blurb, keywords, categories, audience and
 * comparable titles — the fields every retailer ranks on. Heuristics run
 * always; Claude improves the prose fields when a key is present.
 */
const db = require('../config/db');
const lang = require('./lang');
const ai = require('./ai');

// Categories offered in both scripts so a Bangla book gets Bangla shelves.
const CATEGORY_MAP = {
  fiction: ['কথাসাহিত্য > সমকালীন উপন্যাস', 'Fiction > Contemporary', 'Fiction > Literary'],
  literary: ['কথাসাহিত্য > সাহিত্যিক উপন্যাস', 'Fiction > Literary', 'Fiction > Contemporary'],
  thriller: ['কথাসাহিত্য > থ্রিলার', 'Fiction > Thrillers > Suspense', 'Fiction > Crime'],
  mystery: ['কথাসাহিত্য > রহস্য', 'Fiction > Mystery & Detective', 'Fiction > Thrillers'],
  romance: ['কথাসাহিত্য > প্রেমকাহিনি', 'Fiction > Romance > Contemporary', 'Fiction > Women'],
  fantasy: ['কথাসাহিত্য > কল্পকাহিনি', 'Fiction > Fantasy > Epic', 'Fiction > Fantasy'],
  'sci-fi': ['কথাসাহিত্য > কল্পবিজ্ঞান', 'Fiction > Science Fiction', 'Fiction > Speculative'],
  history: ['ইতিহাস > বাংলাদেশ', 'History > Asia > South Asia', 'History > Modern'],
  biography: ['জীবনী ও স্মৃতিকথা', 'Biography & Autobiography > Personal Memoirs', 'Biography > Cultural'],
  poetry: ['কবিতা', 'Poetry > Asian', 'Poetry > Subjects & Themes'],
  children: ['শিশুতোষ', "Juvenile Fiction > General", "Juvenile Fiction > Readers"],
  'non-fiction': ['প্রবন্ধ ও নিবন্ধ', 'Nonfiction > Essays', 'Nonfiction > Social Science'],
};

function categoriesFor(genre = '', audience = '') {
  const g = (genre || '').toLowerCase().trim();
  if (CATEGORY_MAP[g]) return CATEGORY_MAP[g];
  if ((audience || '').toLowerCase() === 'children') return CATEGORY_MAP.children;
  return CATEGORY_MAP.fiction;
}

/**
 * SEO score: how discoverable the metadata actually is.
 * Modelled on what retailer search ranks: keyword count, blurb length,
 * title length, category depth, and whether keywords appear in the blurb.
 */
function seoScore(md) {
  let s = 0;
  const kw = md.keywords || [];
  const blurb = md.blurb || '';

  s += Math.min(25, kw.length * 4);                        // 7 keywords = full marks
  if (blurb.length >= 400 && blurb.length <= 1400) s += 25;
  else if (blurb.length >= 200) s += 15;
  else if (blurb.length > 0) s += 6;

  const titleWords = lang.wordCount(md.title || '');
  if (titleWords >= 1 && titleWords <= 8) s += 12;
  else if (titleWords) s += 5;
  if (md.subtitle) s += 8;

  s += Math.min(15, (md.categories || []).length * 5);
  if (md.comp_titles) s += 8;

  // Keywords that never appear in the blurb do not help retailer search.
  const lower = blurb.toLowerCase();
  const echoed = kw.filter((k) => lower.includes(String(k).toLowerCase())).length;
  s += Math.min(7, echoed * 2);

  return lang.clamp(Math.round(s), 0, 100);
}

/** Heuristic keywords: frequent content words plus genre and audience terms. */
function heuristicKeywords(text, genre, audience, language) {
  const base = lang.keywords(text, 10, language);
  const extra = [genre, audience].filter(Boolean).map((s) => String(s).toLowerCase());
  return [...new Set([...base, ...extra])].filter(Boolean).slice(0, 8);
}

/** Blurb assembled from the opening, used when Claude is unavailable. */
function heuristicBlurb(text, title, genre, language) {
  const sents = lang.sentences(text).filter((s) => lang.wordCount(s) >= 6);
  const opening = sents.slice(0, 4).join(language === 'en' ? '. ' : '। ');
  const tail = language === 'en'
    ? `\n\n${title} is a ${genre || 'story'} that stays with the reader long after the last page.`
    : `\n\n"${title}" — ${genre || 'একটি গল্প'} যা শেষ পাতার পরেও পাঠকের সঙ্গে থেকে যায়।`;
  const body = opening ? opening + (language === 'en' ? '.' : '।') : '';
  return (body + tail).trim().slice(0, 1400);
}

/** Build metadata for a manuscript and persist it. */
async function generate(manuscriptId, { useAI = true } = {}) {
  const msRes = await db.query('SELECT * FROM Manuscript WHERE manuscript_id = $1', [manuscriptId]);
  const ms = msRes.rows[0];
  if (!ms) throw new Error('Manuscript not found');

  const chRes = await db.query(
    'SELECT chapter_no, title, content FROM Manuscript_Chapter WHERE manuscript_id = $1 ORDER BY chapter_no',
    [manuscriptId]
  );
  const whole = chRes.rows.map((c) => c.content || '').join('\n\n');
  const language = ms.language && ms.language !== 'auto' ? ms.language : lang.detectLanguage(whole);

  let md = {
    title: ms.title,
    subtitle: ms.subtitle || null,
    blurb: heuristicBlurb(whole, ms.title, ms.genre, language),
    keywords: heuristicKeywords(whole, ms.genre, ms.audience, language),
    categories: categoriesFor(ms.genre, ms.audience),
    audience: ms.audience,
    comp_titles: null,
    title_suggestions: [],
  };

  if (useAI && ai.isEnabled()) {
    const out = await ai.generateMetadata({
      title: ms.title,
      genre: ms.genre,
      audience: ms.audience,
      language,
      synopsis: ms.synopsis,
      sample: whole.slice(0, 6000),
    });
    if (out) {
      md = {
        title: ms.title,
        subtitle: out.subtitle || md.subtitle,
        blurb: out.blurb || md.blurb,
        keywords: Array.isArray(out.keywords) && out.keywords.length ? out.keywords.slice(0, 10) : md.keywords,
        categories: Array.isArray(out.categories) && out.categories.length ? out.categories.slice(0, 5) : md.categories,
        audience: out.audience || md.audience,
        comp_titles: out.comp_titles || md.comp_titles,
        title_suggestions: Array.isArray(out.title_suggestions) ? out.title_suggestions.slice(0, 3) : [],
      };
    }
  }

  md.seo_score = seoScore(md);
  md.language = language;

  const { rows } = await db.query(
    `INSERT INTO Book_Metadata
       (manuscript_id, title, subtitle, blurb, keywords, categories, audience, comp_titles, seo_score, language)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [manuscriptId, md.title, md.subtitle, md.blurb, md.keywords, md.categories,
     md.audience, md.comp_titles, md.seo_score, language]
  );

  return { ...rows[0], title_suggestions: md.title_suggestions, ai_used: useAI && ai.isEnabled() };
}

/** Save hand-edited metadata as a new row (history is kept). */
async function saveManual(manuscriptId, fields) {
  const md = {
    title: fields.title,
    subtitle: fields.subtitle || null,
    blurb: fields.blurb || '',
    keywords: splitList(fields.keywords),
    categories: splitList(fields.categories),
    audience: fields.audience || null,
    comp_titles: fields.comp_titles || null,
  };
  const { rows } = await db.query(
    `INSERT INTO Book_Metadata
       (manuscript_id, title, subtitle, blurb, keywords, categories, audience, comp_titles, seo_score, language)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [manuscriptId, md.title, md.subtitle, md.blurb, md.keywords, md.categories,
     md.audience, md.comp_titles, seoScore(md), fields.language || 'bn']
  );
  return rows[0];
}

function splitList(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v || '')
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { generate, saveManual, seoScore, categoriesFor };
