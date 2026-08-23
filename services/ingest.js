/**
 * Manuscript ingestion: DOCX / TXT / MD in, chapters out.
 *
 * PDF is deliberately not parsed — extracting Bangla text out of a PDF loses
 * conjuncts and produces garbage the Doctor would then "diagnose". Authors are
 * asked for DOCX or TXT instead, which is what publishers want anyway.
 */
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const lang = require('./lang');

const SUPPORTED = ['.docx', '.txt', '.md', '.markdown'];

function isSupported(filename) {
  return SUPPORTED.includes(path.extname(filename || '').toLowerCase());
}

/** Raw text from an uploaded manuscript file. */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.docx') {
    // Convert to HTML first so heading levels survive, then flatten them to
    // markdown-style '#' markers that splitChapters() recognises.
    const { value: html } = await mammoth.convertToHtml({ path: filePath });
    return htmlToText(html);
  }

  if (['.txt', '.md', '.markdown'].includes(ext)) {
    return fs.readFileSync(filePath, 'utf8');
  }

  throw new Error(`Unsupported file type: ${ext}. Upload .docx, .txt or .md.`);
}

function htmlToText(html) {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n\n# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n\n## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n\n### $1\n\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Text in, chapter rows out, with per-chapter word counts filled. */
function toChapters(text) {
  return lang.splitChapters(text).map((c) => ({
    ...c,
    word_count: lang.wordCount(c.content),
  }));
}

/** Full pipeline for an uploaded file. */
async function ingestFile(filePath) {
  const text = await extractText(filePath);
  const chapters = toChapters(text);
  const language = lang.detectLanguage(text);
  return {
    text,
    chapters,
    language,
    word_count: lang.wordCount(text),
    char_count: text.length,
  };
}

module.exports = { ingestFile, extractText, toChapters, isSupported, SUPPORTED };
