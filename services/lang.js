/**
 * Bilingual (Bangla + English) text engine.
 * Everything the Manuscript Doctor, metadata generator and integrity checker
 * need in order to treat বাংলা as a first-class language, not an afterthought.
 */

const BN_RANGE = /[ঀ-৿]/;
const BN_GLOBAL = /[ঀ-৿]/g;
const EN_GLOBAL = /[A-Za-z]/g;

// '।' (daari) ends a Bangla sentence; '॥' appears in verse.
const SENTENCE_END = /[।॥.!?…]+/;

const BN_STOPWORDS = new Set([
  'এই', 'সেই', 'ও', 'এবং', 'কিন্তু', 'তবে', 'যে', 'যা', 'যার', 'তার', 'তাকে', 'তিনি',
  'আমি', 'আমার', 'আমাকে', 'আমরা', 'আমাদের', 'তুমি', 'তোমার', 'তোমরা', 'আপনি', 'আপনার',
  'সে', 'তারা', 'তাদের', 'কে', 'কি', 'কী', 'কেন', 'কোথায়', 'কখন', 'কিভাবে', 'হয়', 'হলো',
  'হবে', 'ছিল', 'ছিলো', 'করে', 'করা', 'করেছে', 'করবে', 'না', 'নেই', 'নয়', 'জন্য', 'থেকে',
  'দিয়ে', 'সঙ্গে', 'সাথে', 'মধ্যে', 'পর', 'আগে', 'উপর', 'নিচে', 'একটি', 'একটা', 'কিছু',
  'সব', 'সবাই', 'অনেক', 'আরও', 'আর', 'তো', 'ই', 'বলে', 'মতো', 'যদি', 'তাহলে', 'এখন',
]);

const EN_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'of', 'to', 'in', 'on', 'at', 'by',
  'for', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it',
  'its', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'i', 'you', 'we', 'this',
  'that', 'these', 'those', 'not', 'no', 'so', 'up', 'out', 'about', 'into', 'over',
  'had', 'has', 'have', 'do', 'did', 'does', 'will', 'would', 'can', 'could', 'there',
]);

// Filler intensifiers that signal weak prose when over-used.
const BN_FILLERS = ['খুব', 'অত্যন্ত', 'ভীষণ', 'একদম', 'সত্যিই', 'একেবারে', 'বেশ', 'প্রায়', 'যেন', 'কেমন যেন', 'হঠাৎ'];
const EN_FILLERS = ['very', 'really', 'just', 'quite', 'suddenly', 'actually', 'literally', 'basically', 'somewhat', 'rather'];

// Weak "-ly"-equivalent adverbs; in Bangla these are the -ভাবে / -ভাবেই forms.
const BN_ADVERB_SUFFIX = /(ভাবে|ভাবেই|রকম|মতোই)$/;

// Bangla speech is usually marked with a dash or quote pair.
const DIALOGUE_MARKERS = /(^\s*[—–-]\s*)|["“”'‘’]/;

const BN_SAID_VERBS = ['বলল', 'বললো', 'বলল', 'বললেন', 'জিজ্ঞেস', 'জানাল', 'জানালো', 'চেঁচাল', 'ফিসফিস'];
const EN_SAID_VERBS = ['said', 'asked', 'replied', 'shouted', 'whispered', 'muttered'];

/** Which script dominates: 'bn', 'en' or 'mixed'. */
function detectLanguage(text = '') {
  const bn = (text.match(BN_GLOBAL) || []).length;
  const en = (text.match(EN_GLOBAL) || []).length;
  const total = bn + en;
  if (total === 0) return 'en';
  const bnShare = bn / total;
  if (bnShare > 0.75) return 'bn';
  if (bnShare < 0.15) return 'en';
  return 'mixed';
}

function isBangla(text = '') {
  return BN_RANGE.test(text);
}

/** Words, keeping Bangla conjuncts and hasant intact. */
function tokenize(text = '') {
  return text
    .replace(/[^ঀ-৿A-Za-z0-9\s'’-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function wordCount(text = '') {
  return tokenize(text).length;
}

function sentences(text = '') {
  return text
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function paragraphs(text = '') {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function stopwords(language) {
  if (language === 'bn') return BN_STOPWORDS;
  if (language === 'en') return EN_STOPWORDS;
  return new Set([...BN_STOPWORDS, ...EN_STOPWORDS]);
}

/** Content-word frequency map, stopwords removed. */
function contentFrequencies(text, language = detectLanguage(text)) {
  const stop = stopwords(language);
  const freq = new Map();
  for (const raw of tokenize(text)) {
    const w = raw.toLowerCase();
    if (w.length < 2 || stop.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return freq;
}

/** Top-N content keywords, highest frequency first. */
function keywords(text, n = 12, language = detectLanguage(text)) {
  return [...contentFrequencies(text, language).entries()]
    .filter(([w, c]) => c > 1 && w.length > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

/**
 * Readability, normalised to 0..100 (higher = easier).
 * English uses a syllable-based Flesch approximation; Bangla has no reliable
 * syllable model, so we use sentence length + conjunct density, which
 * correlates well with perceived difficulty in Bangla prose.
 */
function readability(text, language = detectLanguage(text)) {
  const sents = sentences(text);
  const words = tokenize(text);
  if (!sents.length || !words.length) return 50;
  const wordsPerSentence = words.length / sents.length;

  if (language === 'en') {
    const syllables = words.reduce((sum, w) => sum + countEnglishSyllables(w), 0);
    const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * (syllables / words.length);
    return clamp(Math.round(score), 0, 100);
  }

  // Bangla: hasant (্) marks a conjunct — denser conjuncts read harder.
  const conjuncts = (text.match(/্/g) || []).length;
  const conjunctPerWord = conjuncts / words.length;
  const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  const score = 120 - 2.2 * wordsPerSentence - 45 * conjunctPerWord - 2.0 * avgLen;
  return clamp(Math.round(score), 0, 100);
}

function countEnglishSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Share of lines that read as spoken dialogue (0..1). */
function dialogueRatio(text = '') {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return 0;
  const spoken = lines.filter(
    (l) => DIALOGUE_MARKERS.test(l) ||
      BN_SAID_VERBS.some((v) => l.includes(v)) ||
      EN_SAID_VERBS.some((v) => new RegExp(`\\b${v}\\b`, 'i').test(l))
  ).length;
  return spoken / lines.length;
}

/** Filler/intensifier hits per 1000 words. */
function fillerDensity(text, language = detectLanguage(text)) {
  const words = tokenize(text);
  if (!words.length) return 0;
  const list = language === 'en' ? EN_FILLERS : [...BN_FILLERS, ...EN_FILLERS];
  let hits = 0;
  for (const w of words) {
    const lw = w.toLowerCase();
    if (list.includes(lw)) hits++;
    else if (language !== 'en' && BN_ADVERB_SUFFIX.test(w)) hits++;
  }
  return (hits / words.length) * 1000;
}

/** Passive-voice hits per 1000 words (English 'was/were ...ed', Bangla 'হয়েছিল/করা হয়'). */
function passiveDensity(text, language = detectLanguage(text)) {
  const words = tokenize(text);
  if (!words.length) return 0;
  let hits = 0;
  if (language !== 'bn') {
    hits += (text.match(/\b(was|were|been|being|is|are)\s+\w+(ed|en)\b/gi) || []).length;
  }
  if (language !== 'en') {
    hits += (text.match(/(করা\s+হয়|হয়েছিল|হয়েছে|দেওয়া\s+হয়|নেওয়া\s+হয়|বলা\s+হয়)/g) || []).length;
  }
  return (hits / words.length) * 1000;
}

/**
 * Capitalised / honorific-marked names, used as a cheap character extractor.
 * Bangla has no case, so we key off honorifics and repeated non-stopword tokens
 * that sit next to speech verbs.
 */
function extractCharacters(text, language = detectLanguage(text)) {
  const counts = new Map();
  const bump = (name) => {
    const n = name.trim();
    if (n.length < 2) return;
    counts.set(n, (counts.get(n) || 0) + 1);
  };

  if (language !== 'bn') {
    for (const m of text.match(/\b[A-Z][a-z]{2,}\b/g) || []) {
      if (!EN_STOPWORDS.has(m.toLowerCase())) bump(m);
    }
  }
  if (language !== 'en') {
    // "X বলল", "X জিজ্ঞেস করল" — the token before a speech verb is usually a name.
    const re = new RegExp(`([\\u0980-\\u09FF]{2,})\\s+(?:${BN_SAID_VERBS.join('|')})`, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!BN_STOPWORDS.has(m[1])) bump(m[1]);
    }
    // Honorifics: জনাব/মিস্টার/ড./বেগম followed by a name.
    const hon = /(?:জনাব|মিস্টার|মিস|বেগম|ড\.|ডঃ|স্যার)\s+([ঀ-৿]{2,})/g;
    while ((m = hon.exec(text)) !== null) bump(m[1]);
  }

  // A name found once next to a speech verb is still a character — count how
  // often it actually appears in the text before deciding.
  const out = [];
  for (const name of counts.keys()) {
    const re = new RegExp(`(^|[\\s"“”'‘’।,;:!?—–-])${escapeRe(name)}([\\s"“”'‘’।,;:!?—–-]|$)`, 'g');
    const mentions = (text.match(re) || []).length;
    if (mentions >= 2) out.push({ name, mentions });
  }
  return out.sort((a, b) => b.mentions - a.mentions);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word n-gram shingles, used for similarity / plagiarism comparison. */
function shingles(text, n = 5) {
  const words = tokenize(text).map((w) => w.toLowerCase());
  const out = new Set();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  return out;
}

function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const s of setA) if (setB.has(s)) inter++;
  return inter / (setA.size + setB.size - inter);
}

/** Quoted spans — used to spot unattributed quotations. */
function extractQuotes(text = '') {
  const out = [];
  const patterns = [/[“"]([^”"]{15,400})[”"]/g, /[‘']([^’']{15,400})[’']/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) out.push({ quote: m[1].trim(), index: m.index });
  }
  return out;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Split raw text into chapters. Recognises Bangla headings (অধ্যায় ৩, পরিচ্ছেদ,
 * প্রথম অধ্যায়) and English ones (Chapter 3, CHAPTER III, ## Heading).
 */
function splitChapters(raw = '') {
  const text = raw.replace(/\r\n/g, '\n');
  const headingRe = new RegExp(
    [
      '^\\s*#{1,3}\\s+.+$',
      '^\\s*(?:CHAPTER|Chapter)\\s+[0-9IVXLCivxlc]+\\b.*$',
      '^\\s*(?:অধ্যায়|পরিচ্ছেদ|খণ্ড|পর্ব)\\s*[-–—:]?\\s*[০-৯0-9]*.*$',
      '^\\s*(?:প্রথম|দ্বিতীয়|তৃতীয়|চতুর্থ|পঞ্চম|ষষ্ঠ|সপ্তম|অষ্টম|নবম|দশম)\\s+(?:অধ্যায়|পরিচ্ছেদ|পর্ব).*$',
    ].join('|'),
    'gm'
  );

  const marks = [];
  let m;
  while ((m = headingRe.exec(text)) !== null) {
    // The leading \s* in the pattern can swallow the preceding newline, so the
    // raw match may start with whitespace before the '#'. Strip both.
    const raw = m[0];
    const offset = raw.length - raw.replace(/^\s+/, '').length;
    marks.push({
      index: m.index + offset,
      title: raw.replace(/^\s*#+\s*/, '').trim(),
      raw: raw.trim(),
    });
  }

  if (!marks.length) {
    // No headings: fall back to ~2500-word blocks so long documents stay navigable.
    const paras = paragraphs(text);
    const chunks = [];
    let buf = [];
    let count = 0;
    for (const p of paras) {
      buf.push(p);
      count += wordCount(p);
      if (count >= 2500) {
        chunks.push(buf.join('\n\n'));
        buf = [];
        count = 0;
      }
    }
    if (buf.length) chunks.push(buf.join('\n\n'));
    if (!chunks.length) chunks.push(text);
    return chunks.map((content, i) => ({
      chapter_no: i + 1,
      title: isBangla(text) ? `অধ্যায় ${toBanglaDigits(i + 1)}` : `Chapter ${i + 1}`,
      content: content.trim(),
    }));
  }

  const chapters = [];
  const preface = text.slice(0, marks[0].index).trim();
  if (wordCount(preface) > 120) {
    chapters.push({ chapter_no: 0, title: isBangla(preface) ? 'ভূমিকা' : 'Front matter', content: preface });
  }
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(mark.index, end).replace(mark.raw, '').trim();
    chapters.push({ chapter_no: chapters.length + 1, title: mark.title, content: body });
  });

  return chapters.map((c, i) => ({ ...c, chapter_no: i + 1 }));
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

function toBanglaDigits(n) {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[+d]);
}

/** Localise a number for display: Bangla digits when the UI is in Bangla. */
function num(n, language = 'bn') {
  return language === 'bn' ? toBanglaDigits(n) : String(n);
}

module.exports = {
  detectLanguage,
  isBangla,
  tokenize,
  wordCount,
  sentences,
  paragraphs,
  contentFrequencies,
  keywords,
  readability,
  dialogueRatio,
  fillerDensity,
  passiveDensity,
  extractCharacters,
  shingles,
  jaccard,
  extractQuotes,
  splitChapters,
  toBanglaDigits,
  num,
  clamp,
  BN_STOPWORDS,
  EN_STOPWORDS,
};
