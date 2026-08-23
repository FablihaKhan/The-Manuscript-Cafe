/**
 * Automatic Submission Package Generator.
 *
 * One click produces: query letter, synopsis, one-page pitch, author bio,
 * book proposal, comparable titles and sample chapters — in Bangla for a
 * Bangla manuscript.
 *
 * Templates run offline; Claude replaces them with real prose when available.
 * Neither ever invents awards, sales figures or credentials the author has not
 * supplied — a fabricated bio is how a submission gets blacklisted.
 */
const db = require('../config/db');
const lang = require('./lang');
const ai = require('./ai');

function bnNum(n) {
  return Number(n || 0).toLocaleString('bn-BD');
}

/** Template query letter — deliberately plain, so it reads as a real draft. */
function templateQueryLetter(ms, author, publisherName, language) {
  const name = [author.first_name, author.last_name].filter(Boolean).join(' ') || author.pen_name || '';
  if (language === 'en') {
    return `Dear ${publisherName || 'Editor'},

I am seeking representation for ${ms.title}, a ${ms.word_count.toLocaleString('en-US')}-word ${ms.genre || 'novel'} for ${ms.audience || 'adult'} readers.

${(ms.synopsis || '').slice(0, 600)}

${ms.title} will appeal to readers of contemporary ${ms.genre || 'fiction'}. The complete manuscript is available on request.

${author.bio || `I am a writer based in ${author.country || 'Bangladesh'}.`}

Thank you for your time and consideration.

Sincerely,
${name}
${author.email || ''}${author.contact_no ? ' · ' + author.contact_no : ''}`;
  }

  return `শ্রদ্ধেয় ${publisherName || 'সম্পাদক মহোদয়'},

আমি আমার পাণ্ডুলিপি "${ms.title}" প্রকাশের জন্য আপনার বিবেচনার অনুরোধ জানাচ্ছি। এটি ${ms.audience === 'children' ? 'শিশু-কিশোর' : ms.audience === 'ya' ? 'তরুণ' : 'প্রাপ্তবয়স্ক'} পাঠকের জন্য লেখা একটি ${ms.genre || 'উপন্যাস'}, শব্দসংখ্যা প্রায় ${bnNum(ms.word_count)}।

${(ms.synopsis || '').slice(0, 600)}

সমকালীন ${ms.genre || 'কথাসাহিত্যের'} পাঠক এই বইয়ের সঙ্গে সহজেই যুক্ত হবেন বলে আমার বিশ্বাস। সম্পূর্ণ পাণ্ডুলিপি চাইলে পাঠাতে প্রস্তুত আছি।

${author.bio || `আমি ${author.country || 'বাংলাদেশ'}-এ বসবাসকারী একজন লেখক।`}

আপনার সময় ও বিবেচনার জন্য ধন্যবাদ।

বিনীত,
${name}
${author.email || ''}${author.contact_no ? ' · ' + author.contact_no : ''}`;
}

function templateSynopsis(ms, chapters, language) {
  const summaries = chapters.slice(0, 20).map((c) => {
    const first = lang.sentences(c.content || '').slice(0, 2).join(language === 'en' ? '. ' : '। ');
    return `${c.title || (language === 'en' ? `Chapter ${c.chapter_no}` : `অধ্যায় ${lang.toBanglaDigits(c.chapter_no)}`)}: ${first}${first ? (language === 'en' ? '.' : '।') : ''}`;
  });

  const head = language === 'en'
    ? `${ms.title} — synopsis\n\n${ms.synopsis || ''}\n\n`
    : `"${ms.title}" — সারসংক্ষেপ\n\n${ms.synopsis || ''}\n\n`;

  const foot = language === 'en'
    ? '\n\n[Complete this synopsis with the ending — publishers expect it.]'
    : '\n\n[সারসংক্ষেপে বইয়ের শেষটাও লিখুন — প্রকাশকরা তা প্রত্যাশা করেন।]';

  return head + summaries.join('\n\n') + foot;
}

function templatePitch(ms, language) {
  if (language === 'en') {
    return `${ms.title} is a ${ms.word_count.toLocaleString('en-US')}-word ${ms.genre || 'novel'} for ${ms.audience || 'adult'} readers. ${(ms.synopsis || '').split(/[.!?]/).slice(0, 2).join('. ')}.`;
  }
  return `"${ms.title}" — ${bnNum(ms.word_count)} শব্দের একটি ${ms.genre || 'উপন্যাস'}, লেখা হয়েছে ${ms.audience === 'children' ? 'শিশু-কিশোর' : ms.audience === 'ya' ? 'তরুণ' : 'প্রাপ্তবয়স্ক'} পাঠকের জন্য। ${(ms.synopsis || '').split('।').slice(0, 2).join('। ')}।`;
}

function templateBio(author, language) {
  const name = [author.first_name, author.last_name].filter(Boolean).join(' ') || author.pen_name || '';
  if (author.bio && author.bio.trim().length > 40) return author.bio.trim();
  return language === 'en'
    ? `${name} is a writer based in ${author.country || 'Bangladesh'}${author.interested_genre ? `, writing mainly in ${author.interested_genre}` : ''}. [Add your publications, prizes or relevant background here.]`
    : `${name} ${author.country || 'বাংলাদেশ'}-এ বসবাসকারী একজন লেখক${author.interested_genre ? `, মূলত ${author.interested_genre} ধারায় লেখেন` : ''}। [এখানে আপনার প্রকাশিত বই, পুরস্কার বা প্রাসঙ্গিক পরিচয় যোগ করুন।]`;
}

function templateProposal(ms, author, language) {
  if (language === 'en') {
    return `BOOK PROPOSAL — ${ms.title}

1. Concept
${ms.synopsis || '[One paragraph on what the book is and why it matters.]'}

2. Format
${ms.genre || 'Novel'}, approximately ${ms.word_count.toLocaleString('en-US')} words, ${ms.chapter_count} chapters, written in ${ms.language === 'bn' ? 'Bangla' : ms.language === 'mixed' ? 'Bangla and English' : 'English'}.

3. Readership
${ms.audience || 'Adult'} readers of ${ms.genre || 'contemporary fiction'}.

4. Market
[Which readers buy this kind of book, and where.]

5. Comparable titles
[Three published books and why yours sits beside them.]

6. Author platform
${author.bio || '[Your readership, events, columns, following.]'}

7. Status
Complete manuscript, available on request.`;
  }

  return `বই প্রস্তাবনা — "${ms.title}"

১. ভাবনা
${ms.synopsis || '[বইটি কী নিয়ে এবং কেন গুরুত্বপূর্ণ — এক অনুচ্ছেদে লিখুন।]'}

২. আকার ও ধরন
${ms.genre || 'উপন্যাস'}, প্রায় ${bnNum(ms.word_count)} শব্দ, ${bnNum(ms.chapter_count)}টি অধ্যায়, ভাষা ${ms.language === 'en' ? 'ইংরেজি' : ms.language === 'mixed' ? 'বাংলা ও ইংরেজি' : 'বাংলা'}।

৩. পাঠক
${ms.audience === 'children' ? 'শিশু-কিশোর' : ms.audience === 'ya' ? 'তরুণ' : 'প্রাপ্তবয়স্ক'} পাঠক, ${ms.genre || 'সমকালীন কথাসাহিত্যের'} অনুরাগী।

৪. বাজার
[কারা এই ধরনের বই কেনেন এবং কোথায় — লিখুন।]

৫. তুলনীয় বই
[তিনটি প্রকাশিত বই এবং কেন আপনার বই তাদের পাশে বসে।]

৬. লেখকের পরিচিতি ও পাঠকভিত্তি
${author.bio || '[আপনার পাঠক, অনুষ্ঠান, কলাম, অনুসারী সংখ্যা।]'}

৭. অবস্থা
সম্পূর্ণ পাণ্ডুলিপি প্রস্তুত, চাহিবামাত্র পাঠানো সম্ভব।`;
}

function sampleChapters(chapters, language, count = 3) {
  const picked = chapters.slice(0, count);
  return picked
    .map((c) => `${c.title || (language === 'en' ? `Chapter ${c.chapter_no}` : `অধ্যায় ${lang.toBanglaDigits(c.chapter_no)}`)}\n\n${(c.content || '').slice(0, 12000)}`)
    .join('\n\n\n');
}

/**
 * Generate and store the package.
 * `publisherId` is optional — passing it addresses the query letter by name.
 */
async function generate(manuscriptId, { publisherId = null, useAI = true } = {}) {
  const [msRes, chRes] = await Promise.all([
    db.query(
      `SELECT m.*, a.first_name, a.last_name, a.email, a.contact_no, a.bio,
              a.country, a.pen_name, a.interested_genre
         FROM Manuscript m JOIN Author a ON a.id = m.author_id
        WHERE m.manuscript_id = $1`, [manuscriptId]),
    db.query('SELECT chapter_no, title, content FROM Manuscript_Chapter WHERE manuscript_id = $1 ORDER BY chapter_no', [manuscriptId]),
  ]);

  const row = msRes.rows[0];
  if (!row) throw new Error('Manuscript not found');

  const ms = row;
  const author = {
    first_name: row.first_name, last_name: row.last_name, email: row.email,
    contact_no: row.contact_no, bio: row.bio, country: row.country,
    pen_name: row.pen_name, interested_genre: row.interested_genre,
  };
  const chapters = chRes.rows;
  const whole = chapters.map((c) => c.content || '').join('\n');
  const language = ms.language && ms.language !== 'auto' ? ms.language : lang.detectLanguage(whole);

  let publisherName = null;
  if (publisherId) {
    const p = await db.query('SELECT name FROM Publisher WHERE publisher_id = $1', [publisherId]);
    publisherName = p.rows[0]?.name || null;
  }

  let pack = {
    query_letter: templateQueryLetter(ms, author, publisherName, language),
    synopsis: templateSynopsis(ms, chapters, language),
    pitch: templatePitch(ms, language),
    author_bio: templateBio(author, language),
    proposal: templateProposal(ms, author, language),
    comp_titles: null,
  };

  if (useAI && ai.isEnabled()) {
    const summaries = chapters.slice(0, 25).map(
      (c) => `${c.title || c.chapter_no}: ${lang.sentences(c.content || '').slice(0, 2).join('. ')}`
    );
    const out = await ai.generateSubmissionPack({
      title: ms.title, genre: ms.genre, audience: ms.audience, language,
      wordCount: ms.word_count, synopsis: ms.synopsis, authorBio: author.bio,
      chapterSummaries: summaries, publisherName,
    });
    if (out) {
      pack = {
        query_letter: out.query_letter || pack.query_letter,
        synopsis: out.synopsis || pack.synopsis,
        pitch: out.pitch || pack.pitch,
        author_bio: out.author_bio || pack.author_bio,
        proposal: out.proposal || pack.proposal,
        comp_titles: out.comp_titles || pack.comp_titles,
      };
    }
  }

  pack.sample_chapters = sampleChapters(chapters, language);

  const { rows } = await db.query(
    `INSERT INTO Submission_Package
       (manuscript_id, language, query_letter, synopsis, pitch, author_bio, proposal, comp_titles, sample_chapters)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [manuscriptId, language, pack.query_letter, pack.synopsis, pack.pitch,
     pack.author_bio, pack.proposal, pack.comp_titles, pack.sample_chapters]
  );

  return { ...rows[0], ai_used: useAI && ai.isEnabled() };
}

module.exports = { generate, templateQueryLetter, templateProposal };
