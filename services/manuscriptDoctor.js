/**
 * AI Manuscript Doctor.
 *
 * Runs chapter by chapter and produces a Manuscript Health Score out of 100
 * plus a list of concrete, quotable issues.
 *
 * Two engines:
 *   heuristic — always runs, offline, deterministic. Catches pacing, repetition,
 *               weak dialogue, filler, readability, Bangla register/spelling,
 *               and characters who disappear.
 *   ai        — optional. Adds plot holes, character inconsistency and
 *               confusing passages, which no rule can see.
 *
 * Neither engine ever rewrites the author's prose.
 */
const lang = require('./lang');
const bangla = require('./banglaStyle');
const ai = require('./ai');

// Weighting of the six sub-scores that make up the health score.
const WEIGHTS = {
  structure: 0.20,   // chapter balance, pacing curve
  prose: 0.20,       // filler, passive, sentence length
  dialogue: 0.15,
  originality: 0.15, // repetition
  clarity: 0.15,     // readability
  mechanics: 0.15,   // spelling, punctuation, register consistency
};

/** Per-chapter measurements. */
function measureChapter(chapter, language) {
  const text = chapter.content || '';
  const words = lang.tokenize(text);
  const sents = lang.sentences(text);
  const paras = lang.paragraphs(text);

  const sentenceLengths = sents.map((s) => lang.wordCount(s));
  const avgSentence = sentenceLengths.length
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 0;
  const longSentences = sentenceLengths.filter((n) => n > 45).length;

  return {
    chapter_no: chapter.chapter_no,
    title: chapter.title,
    word_count: words.length,
    sentence_count: sents.length,
    paragraph_count: paras.length,
    avg_sentence_words: Math.round(avgSentence * 10) / 10,
    long_sentences: longSentences,
    readability: lang.readability(text, language),
    dialogue_ratio: Math.round(lang.dialogueRatio(text) * 100) / 100,
    filler_per_1k: Math.round(lang.fillerDensity(text, language) * 10) / 10,
    passive_per_1k: Math.round(lang.passiveDensity(text, language) * 10) / 10,
    characters: lang.extractCharacters(text, language).map((c) => c.name),
  };
}

/** Chapters far off the median length break a reader's rhythm. */
function pacingIssues(measures, language) {
  const issues = [];
  const lengths = measures.map((m) => m.word_count).filter((n) => n > 0);
  if (lengths.length < 3) return issues;

  const sorted = [...lengths].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median) return issues;

  for (const m of measures) {
    const ratio = m.word_count / median;
    if (ratio > 2.2) {
      issues.push({
        chapter_no: m.chapter_no,
        category: 'pacing',
        severity: 'medium',
        message: t(language,
          `অধ্যায় ${lang.num(m.chapter_no, 'bn')} বাকি অধ্যায়ের চেয়ে প্রায় ${Math.round(ratio * 10) / 10} গুণ দীর্ঘ (${lang.num(m.word_count, 'bn')} শব্দ)।`,
          `Chapter ${m.chapter_no} is about ${Math.round(ratio * 10) / 10}x the median length (${m.word_count} words).`),
        excerpt: '',
        suggestion: t(language,
          'অধ্যায়টি দুই ভাগে ভাগ করা যায় কিনা দেখুন — পাঠকের গতি ধরে রাখতে সাহায্য করবে।',
          'Consider whether this chapter holds two scenes that could stand apart.'),
      });
    } else if (ratio < 0.35 && m.word_count > 0) {
      issues.push({
        chapter_no: m.chapter_no,
        category: 'pacing',
        severity: 'low',
        message: t(language,
          `অধ্যায় ${lang.num(m.chapter_no, 'bn')} খুবই ছোট (${lang.num(m.word_count, 'bn')} শব্দ)।`,
          `Chapter ${m.chapter_no} is unusually short (${m.word_count} words).`),
        excerpt: '',
        suggestion: t(language,
          'পাশের অধ্যায়ের সঙ্গে মিলিয়ে দেওয়া যায় কিনা ভেবে দেখুন।',
          'Check whether it belongs with an adjacent chapter.'),
      });
    }
  }

  // A run of three chapters with almost no dialogue reads as flat.
  for (let i = 0; i + 2 < measures.length; i++) {
    const window = measures.slice(i, i + 3);
    if (window.every((m) => m.dialogue_ratio < 0.08 && m.word_count > 400)) {
      issues.push({
        chapter_no: window[0].chapter_no,
        category: 'pacing',
        severity: 'medium',
        message: t(language,
          `অধ্যায় ${lang.num(window[0].chapter_no, 'bn')}–${lang.num(window[2].chapter_no, 'bn')} প্রায় সংলাপহীন — টানা বর্ণনা পাঠককে ক্লান্ত করে।`,
          `Chapters ${window[0].chapter_no}–${window[2].chapter_no} are almost entirely narration.`),
        excerpt: '',
        suggestion: t(language,
          'এই অংশে অন্তত একটি দৃশ্য সংলাপে রূপান্তর করার কথা ভাবুন।',
          'Consider carrying at least one of these scenes in dialogue.'),
      });
      break;
    }
  }

  return issues;
}

/** Phrases the author reuses, and words leaned on too heavily. */
function repetitionIssues(chapters, language) {
  const issues = [];
  const phraseSeen = new Map();

  for (const ch of chapters) {
    const sh = lang.shingles(ch.content || '', 6);
    for (const s of sh) {
      if (!phraseSeen.has(s)) phraseSeen.set(s, []);
      phraseSeen.get(s).push(ch.chapter_no);
    }
  }

  const repeated = [...phraseSeen.entries()]
    .filter(([, chs]) => chs.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6);

  for (const [phrase, chs] of repeated) {
    issues.push({
      chapter_no: chs[0],
      category: 'repetition',
      severity: chs.length > 3 ? 'medium' : 'low',
      message: t(language,
        `একই বাক্যাংশ ${lang.num(chs.length, 'bn')} বার এসেছে (অধ্যায় ${chs.slice(0, 4).map((c) => lang.num(c, 'bn')).join(', ')})।`,
        `The same phrase recurs ${chs.length} times (chapters ${chs.slice(0, 4).join(', ')}).`),
      excerpt: phrase,
      suggestion: t(language,
        'পুনরাবৃত্তি ইচ্ছাকৃত না হলে একটি জায়গায় রেখে বাকিগুলো বদলান।',
        'Unless the echo is deliberate, vary all but one occurrence.'),
    });
  }

  // Over-used content words across the whole book.
  const whole = chapters.map((c) => c.content || '').join('\n');
  const freq = lang.contentFrequencies(whole, language);
  const totalWords = lang.wordCount(whole) || 1;
  const overused = [...freq.entries()]
    .filter(([w, c]) => c >= 12 && c / totalWords > 0.0022 && w.length > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  for (const [word, count] of overused) {
    issues.push({
      chapter_no: null,
      category: 'repetition',
      severity: 'low',
      message: t(language,
        `"${word}" শব্দটি ${lang.num(count, 'bn')} বার ব্যবহৃত হয়েছে।`,
        `"${word}" appears ${count} times.`),
      excerpt: word,
      suggestion: t(language, 'কিছু জায়গায় সমার্থক শব্দ ব্যবহার করুন।', 'Vary it with synonyms in some places.'),
    });
  }

  return issues;
}

/** Filler, passive voice, marathon sentences, wall-of-text paragraphs. */
function proseIssues(measures, language) {
  const issues = [];
  for (const m of measures) {
    if (m.filler_per_1k > 14) {
      issues.push({
        chapter_no: m.chapter_no,
        category: 'style',
        severity: m.filler_per_1k > 25 ? 'medium' : 'low',
        message: t(language,
          `অধ্যায় ${lang.num(m.chapter_no, 'bn')}-এ প্রতি হাজার শব্দে ${lang.num(Math.round(m.filler_per_1k), 'bn')}টি অতিরিক্ত জোরদায়ক শব্দ (খুব, ভীষণ, একদম…)।`,
          `Chapter ${m.chapter_no} carries ${Math.round(m.filler_per_1k)} intensifiers per 1000 words.`),
        excerpt: '',
        suggestion: t(language,
          'জোরদায়ক শব্দ বাদ দিলে বাক্য সাধারণত আরও জোরালো হয়।',
          'Sentences usually hit harder once the intensifiers come out.'),
      });
    }
    if (m.passive_per_1k > 12) {
      issues.push({
        chapter_no: m.chapter_no,
        category: 'style',
        severity: 'low',
        message: t(language,
          `অধ্যায় ${lang.num(m.chapter_no, 'bn')}-এ কর্মবাচ্যের ব্যবহার বেশি (প্রতি হাজারে ${lang.num(Math.round(m.passive_per_1k), 'bn')})।`,
          `Chapter ${m.chapter_no} leans on passive constructions (${Math.round(m.passive_per_1k)} per 1000 words).`),
        excerpt: '',
        suggestion: t(language, 'কর্তৃবাচ্যে লিখলে দৃশ্য বেশি জীবন্ত হয়।', 'Active constructions keep the scene in motion.'),
      });
    }
    if (m.long_sentences > 4) {
      issues.push({
        chapter_no: m.chapter_no,
        category: 'clarity',
        severity: 'medium',
        message: t(language,
          `অধ্যায় ${lang.num(m.chapter_no, 'bn')}-এ ${lang.num(m.long_sentences, 'bn')}টি বাক্য ৪৫ শব্দের বেশি।`,
          `Chapter ${m.chapter_no} has ${m.long_sentences} sentences over 45 words.`),
        excerpt: '',
        suggestion: t(language, 'দীর্ঘ বাক্যগুলো ভেঙে দিন — পাঠযোগ্যতা বাড়বে।', 'Break the longest ones; readability improves immediately.'),
      });
    }
    if (m.readability < 30 && m.word_count > 300) {
      issues.push({
        chapter_no: m.chapter_no,
        category: 'clarity',
        severity: 'medium',
        message: t(language,
          `অধ্যায় ${lang.num(m.chapter_no, 'bn')} পড়তে কঠিন (পাঠযোগ্যতা ${lang.num(m.readability, 'bn')}/১০০)।`,
          `Chapter ${m.chapter_no} reads as difficult (readability ${m.readability}/100).`),
        excerpt: '',
        suggestion: t(language,
          'বাক্য ছোট করুন এবং যুক্তাক্ষরভারী শব্দ কমান।',
          'Shorter sentences and plainer word choices will help.'),
      });
    }
    if (m.paragraph_count > 0 && m.word_count / m.paragraph_count > 180) {
      issues.push({
        chapter_no: m.chapter_no,
        category: 'clarity',
        severity: 'low',
        message: t(language,
          `অধ্যায় ${lang.num(m.chapter_no, 'bn')}-এর অনুচ্ছেদগুলো খুব বড় (গড়ে ${lang.num(Math.round(m.word_count / m.paragraph_count), 'bn')} শব্দ)।`,
          `Chapter ${m.chapter_no} averages ${Math.round(m.word_count / m.paragraph_count)} words per paragraph.`),
        excerpt: '',
        suggestion: t(language, 'অনুচ্ছেদ ভাগ করলে পাতা কম ভারী দেখাবে।', 'Splitting paragraphs makes the page less forbidding.'),
      });
    }
  }
  return issues;
}

/** Dialogue that is absent, unattributed, or all attributed the same way. */
function dialogueIssues(chapters, measures, language) {
  const issues = [];
  for (const m of measures) {
    if (m.word_count > 600 && m.dialogue_ratio < 0.03) {
      issues.push({
        chapter_no: m.chapter_no,
        category: 'dialogue',
        severity: 'low',
        message: t(language,
          `অধ্যায় ${lang.num(m.chapter_no, 'bn')}-এ কোনো সংলাপ নেই।`,
          `Chapter ${m.chapter_no} contains no dialogue.`),
        excerpt: '',
        suggestion: t(language,
          'চরিত্রের কণ্ঠস্বর শোনা গেলে পাঠক দ্রুত যুক্ত হয়।',
          'Letting a character speak pulls the reader in faster.'),
      });
    }
  }

  // "said" fatigue: one attribution verb doing all the work.
  const whole = chapters.map((c) => c.content || '').join('\n');
  const attributions = language === 'en'
    ? { said: (whole.match(/\bsaid\b/gi) || []).length, asked: (whole.match(/\basked\b/gi) || []).length }
    : { 'বলল': (whole.match(/বলল/g) || []).length, 'বললেন': (whole.match(/বললেন/g) || []).length };
  const total = Object.values(attributions).reduce((a, b) => a + b, 0);
  const top = Object.entries(attributions).sort((a, b) => b[1] - a[1])[0];
  if (total > 40 && top && top[1] / total > 0.85) {
    issues.push({
      chapter_no: null,
      category: 'dialogue',
      severity: 'low',
      message: t(language,
        `সংলাপে প্রায় সব জায়গায় "${top[0]}" ব্যবহার হয়েছে (${lang.num(top[1], 'bn')} বার)।`,
        `Almost every attribution is "${top[0]}" (${top[1]} times).`),
      excerpt: top[0],
      suggestion: t(language,
        'কিছু জায়গায় attribution বাদ দিন বা কাজ দিয়ে বোঝান কে বলছে।',
        'Drop some attributions entirely, or let an action carry the speaker.'),
    });
  }

  return issues;
}

/** Characters introduced with weight and then never mentioned again. */
function characterIssues(measures, language) {
  const issues = [];
  const first = new Map();
  const last = new Map();
  const totalChapters = measures.length;

  for (const m of measures) {
    for (const name of m.characters) {
      if (!first.has(name)) first.set(name, m.chapter_no);
      last.set(name, m.chapter_no);
    }
  }

  for (const [name, firstCh] of first) {
    const lastCh = last.get(name);
    const span = lastCh - firstCh;
    // Appears early, vanishes before the last third of the book.
    if (totalChapters >= 5 && firstCh <= Math.ceil(totalChapters / 3) && lastCh < totalChapters - Math.ceil(totalChapters / 3) && span >= 1) {
      issues.push({
        chapter_no: lastCh,
        category: 'character',
        severity: 'medium',
        message: t(language,
          `"${name}" অধ্যায় ${lang.num(firstCh, 'bn')}–${lang.num(lastCh, 'bn')}-এ আছে, তারপর আর নেই।`,
          `"${name}" appears in chapters ${firstCh}–${lastCh} and then disappears.`),
        excerpt: name,
        suggestion: t(language,
          'চরিত্রটির পরিণতি দেখানো হয়েছে কিনা দেখুন — নাহলে পাঠকের প্রশ্ন থেকে যাবে।',
          'Check that the character gets a resolution, or the reader will keep waiting.'),
      });
    }
  }

  // Near-identical names suggest an inconsistent spelling of one character.
  const names = [...first.keys()];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (similar(names[i], names[j])) {
        issues.push({
          chapter_no: null,
          category: 'character',
          severity: 'high',
          message: t(language,
            `"${names[i]}" এবং "${names[j]}" — একই চরিত্রের নাম দুইভাবে লেখা হয়েছে কিনা দেখুন।`,
            `"${names[i]}" and "${names[j]}" may be the same character spelled two ways.`),
          excerpt: `${names[i]} / ${names[j]}`,
          suggestion: t(language, 'পুরো পাণ্ডুলিপিতে একটাই বানান রাখুন।', 'Settle on one spelling throughout.'),
        });
      }
    }
  }

  return issues.slice(0, 10);
}

/** Levenshtein distance 1 on names of reasonable length. */
function similar(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length < 4 || b.length < 4) return false;
  if (a === b) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Roll the measurements into six sub-scores and one health score. */
function scoreFrom(measures, issues, language) {
  const avg = (fn) => (measures.length ? measures.reduce((s, m) => s + fn(m), 0) / measures.length : 0);
  const penalty = (cat, per = 6, cap = 40) =>
    Math.min(cap, issues.filter((i) => i.category === cat)
      .reduce((s, i) => s + (i.severity === 'high' ? per * 2 : i.severity === 'medium' ? per : per / 2), 0));

  const lengths = measures.map((m) => m.word_count);
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length
    ? Math.sqrt(lengths.reduce((s, n) => s + (n - mean) ** 2, 0) / lengths.length) / (mean || 1)
    : 0;

  const sub = {
    structure: lang.clamp(Math.round(100 - variance * 70 - penalty('pacing', 6, 30)), 0, 100),
    prose: lang.clamp(Math.round(100 - penalty('style', 7, 45)), 0, 100),
    dialogue: lang.clamp(Math.round(35 + avg((m) => m.dialogue_ratio) * 220 - penalty('dialogue', 6, 25)), 0, 100),
    originality: lang.clamp(Math.round(100 - penalty('repetition', 7, 45)), 0, 100),
    clarity: lang.clamp(Math.round(avg((m) => m.readability) * 0.7 + 30 - penalty('clarity', 6, 35)), 0, 100),
    mechanics: lang.clamp(Math.round(100 - penalty('grammar', 5, 50)), 0, 100),
  };

  // Plot holes and character breaks are the costliest defects a book can have.
  const structuralPenalty = Math.min(20, issues.filter(
    (i) => (i.category === 'plot_hole' || i.category === 'character') && i.severity === 'high'
  ).length * 5);

  const health = lang.clamp(
    Math.round(Object.entries(WEIGHTS).reduce((s, [k, w]) => s + sub[k] * w, 0) - structuralPenalty),
    0, 100
  );

  return { sub, health, chapter_length_variance: Math.round(variance * 100) / 100 };
}

/**
 * Full run. `chapters` is [{chapter_no, title, content}].
 * `useAI` adds the Claude pass when a key is configured.
 */
async function analyse(manuscript, chapters, { useAI = true } = {}) {
  const whole = chapters.map((c) => c.content || '').join('\n\n');
  const language = manuscript.language && manuscript.language !== 'auto'
    ? manuscript.language
    : lang.detectLanguage(whole);

  const measures = chapters.map((c) => measureChapter(c, language));
  const issues = [];

  issues.push(...pacingIssues(measures, language));
  issues.push(...proseIssues(measures, language));
  issues.push(...repetitionIssues(chapters, language));
  issues.push(...dialogueIssues(chapters, measures, language));
  issues.push(...characterIssues(measures, language));

  // Bangla register + spelling, per chapter.
  if (language !== 'en') {
    for (const ch of chapters) {
      const { issues: bnIssues } = bangla.analyse(ch.content || '', ch.chapter_no);
      issues.push(...bnIssues);
    }
  }

  let engine = 'heuristic';
  const chapterSummaries = [];

  if (useAI && ai.isEnabled()) {
    engine = 'hybrid';
    let context = '';
    for (const ch of chapters) {
      const review = await ai.reviewChapter({
        title: ch.title,
        chapterNo: ch.chapter_no,
        content: ch.content || '',
        language,
        storyContext: context,
      });
      if (!review) continue;
      chapterSummaries.push(review.summary);
      context = chapterSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n').slice(-4000);
      for (const issue of review.issues) {
        issues.push({
          chapter_no: ch.chapter_no,
          category: normaliseCategory(issue.category),
          severity: ['low', 'medium', 'high'].includes(issue.severity) ? issue.severity : 'medium',
          message: issue.message,
          excerpt: (issue.excerpt || '').slice(0, 400),
          suggestion: issue.suggestion || '',
        });
      }
    }

    if (chapterSummaries.length > 1) {
      const structure = await ai.reviewStructure({
        title: manuscript.title,
        genre: manuscript.genre,
        language,
        chapterSummaries,
      });
      for (const issue of structure?.issues || []) {
        issues.push({
          chapter_no: issue.chapter_no ?? null,
          category: normaliseCategory(issue.category),
          severity: issue.severity || 'medium',
          message: issue.message,
          excerpt: '',
          suggestion: issue.suggestion || '',
        });
      }
    }
  }

  const { sub, health, chapter_length_variance } = scoreFrom(measures, issues, language);

  return {
    health_score: health,
    engine,
    language,
    voice_preserved: true,
    issues: dedupe(issues),
    metrics: {
      sub_scores: sub,
      chapters: measures,
      chapter_length_variance,
      total_words: measures.reduce((s, m) => s + m.word_count, 0),
      avg_readability: measures.length
        ? Math.round(measures.reduce((s, m) => s + m.readability, 0) / measures.length)
        : 0,
      avg_dialogue_ratio: measures.length
        ? Math.round((measures.reduce((s, m) => s + m.dialogue_ratio, 0) / measures.length) * 100) / 100
        : 0,
      pacing_curve: measures.map((m) => ({ chapter: m.chapter_no, words: m.word_count, dialogue: m.dialogue_ratio })),
      chapter_summaries: chapterSummaries,
      cast: [...new Set(measures.flatMap((m) => m.characters))].slice(0, 30),
    },
  };
}

const CATEGORIES = ['plot_hole', 'pacing', 'repetition', 'character', 'dialogue', 'clarity', 'grammar', 'style'];

function normaliseCategory(c) {
  const v = (c || '').toLowerCase().replace(/\s+/g, '_');
  return CATEGORIES.includes(v) ? v : 'style';
}

function dedupe(issues) {
  const seen = new Set();
  return issues.filter((i) => {
    const key = `${i.chapter_no}|${i.category}|${(i.message || '').slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Pick the Bangla or English string. */
function t(language, bn, en) {
  return language === 'en' ? en : bn;
}

module.exports = { analyse, measureChapter, scoreFrom, WEIGHTS };
