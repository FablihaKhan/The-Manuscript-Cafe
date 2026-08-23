/**
 * Optional Claude layer.
 *
 * Every feature in Mudron works without an API key — the heuristic engines in
 * manuscriptDoctor / metadata / submissionPack always run first. When
 * ANTHROPIC_API_KEY is set, these helpers add the judgements heuristics cannot
 * make (plot holes, character inconsistency, a natural-sounding blurb).
 *
 * House rule: Claude never rewrites the author's prose. It only observes and
 * suggests, so the writer's voice survives. Prompts enforce that explicitly.
 */
require('dotenv').config();

let Anthropic = null;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (_) {
  /* SDK not installed — heuristic mode only */
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const client = Anthropic && process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

function isEnabled() {
  return Boolean(client);
}

const VOICE_RULE = [
  "You are an editorial analyst for Mudron, a Bangladeshi book-publishing platform.",
  "You NEVER rewrite, paraphrase or 'improve' the author's sentences.",
  "You only diagnose: name the problem, quote a short excerpt, and suggest what the author could reconsider.",
  "The author's voice, dialect and stylistic choices are deliberate — never flag them as errors.",
  'If the manuscript is in Bangla, write every message and suggestion in Bangla.',
].join(' ');

/** Ask Claude for JSON. Returns null on any failure so callers fall back cleanly. */
async function askJSON(systemPrompt, userPrompt, { maxTokens = 8000 } = {}) {
  if (!client) return null;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system: `${systemPrompt}\n\nReply with a single JSON object and nothing else. No markdown fence, no commentary.`,
      messages: [{ role: 'user', content: userPrompt }],
    });

    if (response.stop_reason === 'refusal') {
      console.warn('Claude declined the request:', response.stop_details?.category);
      return null;
    }

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return parseLooseJSON(text);
  } catch (error) {
    console.warn('Claude call failed, using heuristics only:', error.message);
    return null;
  }
}

/** Tolerates a stray fence or leading prose around the JSON body. */
function parseLooseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (_) {
      return null;
    }
  }
}

/**
 * Deep read of a chapter: plot holes, character inconsistency, weak dialogue,
 * confusing passages. Heuristics cannot see any of these.
 */
async function reviewChapter({ title, chapterNo, content, language, storyContext }) {
  const langName = language === 'bn' ? 'Bangla' : language === 'mixed' ? 'mixed Bangla/English' : 'English';
  const prompt = `Manuscript language: ${langName}
Story so far (earlier chapter summaries):
${storyContext || '(this is the first chapter)'}

--- CHAPTER ${chapterNo}: ${title || 'untitled'} ---
${content.slice(0, 40000)}
--- END CHAPTER ---

Return JSON shaped as:
{
  "summary": "two sentences describing what happens, in the manuscript's language",
  "characters": ["names appearing in this chapter"],
  "issues": [
    {
      "category": "plot_hole|pacing|repetition|character|dialogue|clarity|style",
      "severity": "low|medium|high",
      "message": "what is wrong",
      "excerpt": "short quote from the chapter, max 25 words",
      "suggestion": "what the author could reconsider — never a rewritten sentence"
    }
  ]
}
Report at most 8 issues, the most consequential first. Report none if the chapter is sound.`;

  const result = await askJSON(VOICE_RULE, prompt, { maxTokens: 6000 });
  if (!result || !Array.isArray(result.issues)) return null;
  return {
    summary: result.summary || '',
    characters: Array.isArray(result.characters) ? result.characters : [],
    issues: result.issues.slice(0, 8),
  };
}

/** Whole-book pass: continuity across chapters, structure, ending. */
async function reviewStructure({ title, genre, language, chapterSummaries }) {
  const prompt = `Book: ${title} (${genre || 'unspecified genre'})
Language: ${language}

Chapter-by-chapter summaries:
${chapterSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Return JSON:
{
  "structure_notes": "one paragraph on arc, midpoint and ending",
  "issues": [{"category":"plot_hole|pacing|character|clarity","severity":"low|medium|high","chapter_no":<int or null>,"message":"...","suggestion":"..."}]
}
Focus only on cross-chapter problems: dropped threads, characters who vanish, contradictions, an ending that is not set up.`;

  return askJSON(VOICE_RULE, prompt, { maxTokens: 4000 });
}

/** Marketing copy: blurb, keywords, categories, comparable titles. */
async function generateMetadata({ title, genre, audience, language, synopsis, sample }) {
  const prompt = `Book title: ${title}
Genre: ${genre}
Audience: ${audience}
Language: ${language}
Author synopsis: ${synopsis || '(none provided)'}

Opening sample:
${(sample || '').slice(0, 6000)}

Return JSON:
{
  "title_suggestions": ["3 alternative titles"],
  "subtitle": "optional subtitle",
  "blurb": "back-cover copy, 120-180 words, in the manuscript's language",
  "keywords": ["7 search keywords readers would actually type"],
  "categories": ["3 bookshop/BISAC-style categories"],
  "audience": "one line describing the target reader",
  "comp_titles": "3 comparable published books with a clause on why each is comparable"
}
For a Bangla book, write blurb, keywords and categories in Bangla and pick comparable titles from Bengali literature.`;

  return askJSON(
    'You are a book marketing specialist who knows both the Bangladeshi and international book markets.',
    prompt,
    { maxTokens: 3000 }
  );
}

/** Query letter, synopsis, pitch, bio, proposal. */
async function generateSubmissionPack({ title, genre, audience, language, wordCount, synopsis, authorBio, chapterSummaries, publisherName }) {
  const prompt = `Write a submission package for this book.

Title: ${title}
Genre: ${genre}
Audience: ${audience}
Word count: ${wordCount}
Language: ${language}
Addressed to: ${publisherName || 'the commissioning editor'}
Author's own note: ${authorBio || '(none)'}
Author synopsis: ${synopsis || '(none)'}

Chapter summaries:
${(chapterSummaries || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Return JSON:
{
  "query_letter": "a complete one-page query letter",
  "synopsis": "a full synopsis, roughly 500 words, including the ending",
  "pitch": "a one-paragraph pitch under 100 words",
  "author_bio": "a third-person bio of 60-90 words",
  "proposal": "a short book proposal: concept, market, readership, comparable titles, author platform",
  "comp_titles": "3 comparable titles with one clause each"
}
Write everything in the manuscript's language — Bangla for a Bangla book. Do not invent credentials, awards or sales figures the author did not state.`;

  return askJSON(
    'You are a literary agent who prepares submission packages for publishers in Bangladesh and abroad.',
    prompt,
    { maxTokens: 8000 }
  );
}

module.exports = {
  isEnabled,
  askJSON,
  reviewChapter,
  reviewStructure,
  generateMetadata,
  generateSubmissionPack,
  MODEL,
};
