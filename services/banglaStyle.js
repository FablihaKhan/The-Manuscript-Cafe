/**
 * Bangla-specific style and spelling checks.
 *
 * Two problems dominate real Bangla manuscripts and no generic grammar tool
 * catches either:
 *   1. সাধু / চলিত mixing — starting a chapter in সাধুভাষা and drifting into
 *      চলিতভাষা mid-paragraph. Editors reject manuscripts for this.
 *   2. The ি/ী, ু/ূ, ন/ণ, স/ষ/শ confusions that Bangla keyboards invite.
 *
 * Everything here is rule-based, so it runs offline with no API key.
 */

// Verb and pronoun forms that only exist in সাধুভাষা.
const SADHU_MARKERS = [
  'করিয়া', 'করিতে', 'করিয়াছে', 'করিল', 'করিলেন', 'করিবে', 'করিবেন',
  'হইল', 'হইলেন', 'হইয়া', 'হইতে', 'হইবে', 'হইয়াছে',
  'যাইতে', 'যাইয়া', 'যাইবে', 'গিয়াছে', 'আসিয়া', 'আসিল', 'আসিতে',
  'বলিল', 'বলিলেন', 'বলিয়া', 'বলিতে', 'দেখিল', 'দেখিয়া', 'দেখিতে',
  'তাহার', 'তাহাকে', 'তাহারা', 'ইহার', 'ইহাকে', 'উহার', 'যাহা', 'যাহার',
  'তাঁহার', 'তাঁহারা', 'কহিল', 'কহিলেন', 'রহিল', 'রহিয়াছে', 'ছিলেন',
  'পাইল', 'পাইয়া', 'দিল', 'দিয়াছে', 'লইয়া', 'লইল', 'খাইয়া', 'উঠিল',
];

// The চলিতভাষা equivalents.
const CHOLITO_MARKERS = [
  'করে', 'করতে', 'করেছে', 'করল', 'করলেন', 'করবে', 'করবেন',
  'হলো', 'হল', 'হলেন', 'হয়ে', 'হতে', 'হবে', 'হয়েছে',
  'যেতে', 'গিয়ে', 'যাবে', 'গেছে', 'এসে', 'এলো', 'আসতে',
  'বলল', 'বললেন', 'বলে', 'বলতে', 'দেখল', 'দেখে', 'দেখতে',
  'তার', 'তাকে', 'তারা', 'এর', 'একে', 'ওর', 'যা', 'যার',
  'তাঁর', 'তাঁরা', 'রইল', 'রয়েছে', 'ছিল', 'পেল', 'পেয়ে', 'দিয়েছে',
  'নিয়ে', 'নিল', 'খেয়ে', 'উঠল',
];

// wrong -> right. Curated from the mistakes that actually recur in Bangla drafts.
const SPELLING_FIXES = {
  'কারন': 'কারণ',
  'ধরন': 'ধরন',
  'জীনিস': 'জিনিস',
  'জিনীস': 'জিনিস',
  'স্বরন': 'স্মরণ',
  'সরন': 'স্মরণ',
  'গুরুত্বপুর্ণ': 'গুরুত্বপূর্ণ',
  'পুর্ণ': 'পূর্ণ',
  'পুর্ব': 'পূর্ব',
  'সম্পুর্ণ': 'সম্পূর্ণ',
  'দুরত্ব': 'দূরত্ব',
  'দুর': 'দূর',
  'ভুমিকা': 'ভূমিকা',
  'মুল': 'মূল',
  'মুল্য': 'মূল্য',
  'অনুসরন': 'অনুসরণ',
  'বর্ননা': 'বর্ণনা',
  'বিবরন': 'বিবরণ',
  'ঘটনাক্রমে': 'ঘটনাক্রমে',
  'পরিবর্তন': 'পরিবর্তন',
  'শ্রেনী': 'শ্রেণি',
  'শ্রেণী': 'শ্রেণি',
  'প্রানী': 'প্রাণী',
  'প্রান': 'প্রাণ',
  'ব্যাক্তি': 'ব্যক্তি',
  'ব্যাবহার': 'ব্যবহার',
  'ব্যাবসা': 'ব্যবসা',
  'স্বাধীণ': 'স্বাধীন',
  'নীরব': 'নীরব',
  'পরিক্ষা': 'পরীক্ষা',
  'সমীক্ষা': 'সমীক্ষা',
  'উপর': 'উপর',
  'ইতিমধ্যে': 'ইতিমধ্যে',
  'আশ্চর্য্য': 'আশ্চর্য',
  'সৌন্দর্য্য': 'সৌন্দর্য',
  'দুরদর্শী': 'দূরদর্শী',
  'অগ্রনী': 'অগ্রণী',
  'নিরব': 'নীরব',
  'নিশ্চই': 'নিশ্চয়ই',
  'যায়গা': 'জায়গা',
  'যদিও': 'যদিও',
  'কতৃক': 'কর্তৃক',
  'মুহুর্ত': 'মুহূর্ত',
  'সাধারন': 'সাধারণ',
  'অসাধারন': 'অসাধারণ',
  'বিশেষন': 'বিশেষণ',
  'লক্ষ্যণীয়': 'লক্ষণীয়',
  'দিন-রাত্রি': 'দিনরাত',
  'ইষ্ট': 'ইষ্ট',
  'ভাষন': 'ভাষণ',
  'রুপ': 'রূপ',
  'রুপান্তর': 'রূপান্তর',
  'ভুল': 'ভুল',
  'দৃষ্টিকোন': 'দৃষ্টিকোণ',
  'কোন': 'কোণ',
  'গননা': 'গণনা',
  'ক্ষনিক': 'ক্ষণিক',
  'তীব্রতর': 'তীব্রতর',
  'উজ্জল': 'উজ্জ্বল',
  'জ্বলজ্বল': 'জ্বলজ্বল',
  'আনুষাঙ্গিক': 'আনুষঙ্গিক',
  'দ্বায়িত্ব': 'দায়িত্ব',
  'সু-স্বাস্থ্য': 'সুস্বাস্থ্য',
  'পুনরায়': 'পুনরায়',
  'স্বরস্বতী': 'সরস্বতী',
  'ঐক্যতান': 'ঐকতান',
  'মনযোগ': 'মনোযোগ',
  'শারীরিক': 'শারীরিক',
  'ইতিপূর্বে': 'ইতঃপূর্বে',
  'উচ্ছাস': 'উচ্ছ্বাস',
  'নুন্যতম': 'ন্যূনতম',
  'সহযোগীতা': 'সহযোগিতা',
  'প্রতিযোগীতা': 'প্রতিযোগিতা',
  'ভৌগলিক': 'ভৌগোলিক',
  'পোষাক': 'পোশাক',
  'বাংলাদেশী': 'বাংলাদেশি',
  'সরকারী': 'সরকারি',
  'বেসরকারী': 'বেসরকারি',
  'দাবী': 'দাবি',
  'বাড়ী': 'বাড়ি',
  'গাড়ী': 'গাড়ি',
  'চিঠী': 'চিঠি',
  'বুদ্ধিজীবি': 'বুদ্ধিজীবী',
  'কর্মচারি': 'কর্মচারী',
  'অধিকারি': 'অধিকারী',
};

// Only entries where wrong !== right actually matter.
const REAL_FIXES = Object.fromEntries(
  Object.entries(SPELLING_FIXES).filter(([wrong, right]) => wrong !== right)
);

// Full-width punctuation an author may accidentally use instead of a daari.
const PUNCTUATION_ISSUES = [
  { re: /[ঀ-৿]\s*\.\s/g, message: 'বাংলা বাক্যের শেষে দাঁড়ি (।) ব্যবহার করুন, ফুলস্টপ (.) নয়।', label: 'daari' },
  { re: /\s+।/g, message: 'দাঁড়ির আগে স্পেস আছে — সরিয়ে দিন।', label: 'space_before_daari' },
  { re: /।{2,}/g, message: 'পরপর একাধিক দাঁড়ি আছে।', label: 'double_daari' },
];

function countHits(text, list) {
  let n = 0;
  const found = new Set();
  for (const w of list) {
    const re = new RegExp(`(^|[\\s"“”'‘’,;:—–-])${w}([\\s"“”'‘’।,;:!?—–-]|$)`, 'g');
    const m = text.match(re);
    if (m) {
      n += m.length;
      found.add(w);
    }
  }
  return { count: n, forms: [...found] };
}

/**
 * Detect সাধু/চলিত mixing. Returns the dominant register and, when both are
 * present in force, the offending forms.
 */
function registerCheck(text) {
  const sadhu = countHits(text, SADHU_MARKERS);
  const cholito = countHits(text, CHOLITO_MARKERS);
  const total = sadhu.count + cholito.count;

  if (total < 6) {
    return { register: 'unknown', mixed: false, sadhu, cholito, minorityShare: 0 };
  }

  const sadhuShare = sadhu.count / total;
  const register = sadhuShare > 0.5 ? 'sadhu' : 'cholito';
  const minorityShare = Math.min(sadhuShare, 1 - sadhuShare);

  // Below 8% is normal — quoted speech and archaic flavour are legitimate.
  const mixed = minorityShare > 0.08 && Math.min(sadhu.count, cholito.count) >= 3;

  return {
    register,
    mixed,
    sadhu,
    cholito,
    minorityShare: Math.round(minorityShare * 100),
    offendingForms: register === 'sadhu' ? cholito.forms.slice(0, 6) : sadhu.forms.slice(0, 6),
  };
}

/** Known misspellings present in the text. */
function spellingCheck(text) {
  const found = [];
  for (const [wrong, right] of Object.entries(REAL_FIXES)) {
    const re = new RegExp(`(^|[\\s"“”'‘’,;:—–-])${wrong}([\\s"“”'‘’।,;:!?—–-]|$)`, 'g');
    const matches = text.match(re);
    if (matches) found.push({ wrong, right, count: matches.length });
  }
  return found.sort((a, b) => b.count - a.count);
}

/** Daari / spacing problems. */
function punctuationCheck(text) {
  const out = [];
  for (const rule of PUNCTUATION_ISSUES) {
    const m = text.match(rule.re);
    if (m && m.length) out.push({ label: rule.label, message: rule.message, count: m.length });
  }
  return out;
}

/** Run every Bangla check and turn the results into Manuscript_Issue rows. */
function analyse(text, chapterNo = null) {
  const issues = [];
  const reg = registerCheck(text);

  if (reg.mixed) {
    const dominant = reg.register === 'sadhu' ? 'সাধু' : 'চলিত';
    const other = reg.register === 'sadhu' ? 'চলিত' : 'সাধু';
    issues.push({
      chapter_no: chapterNo,
      category: 'style',
      severity: reg.minorityShare > 20 ? 'high' : 'medium',
      message: `সাধু-চলিত রীতি মিশে গেছে। লেখাটি মূলত ${dominant} রীতিতে, কিন্তু ${reg.minorityShare}% ${other} রূপ আছে।`,
      excerpt: reg.offendingForms.join(', '),
      suggestion: `পুরো পাণ্ডুলিপি এক রীতিতে রাখুন। ${other} রূপগুলো ${dominant} রূপে বদলান — যেমন: ${reg.offendingForms.slice(0, 3).join(', ')}।`,
    });
  }

  for (const s of spellingCheck(text).slice(0, 12)) {
    issues.push({
      chapter_no: chapterNo,
      category: 'grammar',
      severity: s.count > 3 ? 'medium' : 'low',
      message: `বানান ভুল: "${s.wrong}" (${s.count} বার)।`,
      excerpt: s.wrong,
      suggestion: `সঠিক বানান "${s.right}"।`,
    });
  }

  for (const p of punctuationCheck(text)) {
    issues.push({
      chapter_no: chapterNo,
      category: 'grammar',
      severity: 'low',
      message: `${p.message} (${p.count} জায়গায়)`,
      excerpt: '',
      suggestion: p.message,
    });
  }

  return { issues, register: reg };
}

module.exports = {
  registerCheck,
  spellingCheck,
  punctuationCheck,
  analyse,
  SADHU_MARKERS,
  CHOLITO_MARKERS,
};
