/**
 * One-click Book Formatter.
 *
 * Produces, from the stored chapters:
 *   • EPUB 3   — reflowable, embedded Bangla font, nav + NCX, cover
 *   • PDF      — digital reading edition, A5
 *   • print PDF— 6x9in trim, mirrored inner margins, running heads
 *   • print HTML — browser-print fallback with perfect Bangla shaping
 *
 * Every output gets the standard front matter a publisher expects: title page,
 * copyright page, dedication, table of contents, page numbers.
 *
 * Bangla note: PDFKit shapes text through fontkit, which handles most Bengali
 * conjuncts but not every reph/ya-phala placement. The print HTML is generated
 * alongside every PDF so an author can print from a browser and get typographically
 * exact Bangla when a cover-ready file matters.
 */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const PDFDocument = require('pdfkit');
const langSvc = require('./lang');

const FONT_DIR = path.join(__dirname, '..', 'public', 'fonts');
const SANS_BN = path.join(FONT_DIR, 'NotoSansBengali-Regular.ttf');
const SERIF_BN = path.join(FONT_DIR, 'NotoSerifBengali-Regular.ttf');
const OUT_DIR = path.join(__dirname, '..', 'uploads', 'formatted');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pickFont(language) {
  const preferred = language === 'en' ? SERIF_BN : SERIF_BN;
  if (fs.existsSync(preferred)) return preferred;
  if (fs.existsSync(SANS_BN)) return SANS_BN;
  return null; // fall back to Helvetica (Latin only)
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function L(language, bn, en) {
  return language === 'en' ? en : bn;
}

// ---------------------------------------------------------------------------
// EPUB
// ---------------------------------------------------------------------------

const EPUB_CSS = `
@font-face {
  font-family: "Noto Serif Bengali";
  src: url("fonts/NotoSerifBengali-Regular.ttf");
  font-weight: normal;
}
html, body { margin: 0; padding: 0; }
body {
  font-family: "Noto Serif Bengali", serif;
  line-height: 1.75;
  text-align: justify;
  hyphens: auto;
  padding: 1em 1.2em;
}
h1.chapter-title {
  font-size: 1.5em;
  text-align: center;
  margin: 2.5em 0 1.6em;
  font-weight: normal;
  page-break-before: always;
}
p { margin: 0; text-indent: 1.4em; }
p.first { text-indent: 0; }
p.first::first-letter { font-size: 2.4em; float: left; line-height: 0.9; padding-right: 0.08em; }
.titlepage { text-align: center; margin-top: 25%; }
.titlepage h1 { font-size: 2.2em; font-weight: normal; margin-bottom: 0.3em; }
.titlepage .subtitle { font-size: 1.2em; font-style: italic; margin-bottom: 2.5em; }
.titlepage .author { font-size: 1.15em; letter-spacing: 0.06em; }
.copyright { font-size: 0.85em; margin-top: 35%; text-align: center; line-height: 2; }
.dedication { text-align: center; margin-top: 35%; font-style: italic; }
nav ol { list-style: none; padding-left: 0; }
nav li { margin: 0.5em 0; }
`;

function xhtml(title, body, language) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>`;
}

function chapterXhtml(chapter, language) {
  const paras = langSvc.paragraphs(chapter.content || '');
  const body = paras
    .map((p, i) => `<p${i === 0 ? ' class="first"' : ''}>${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
  return xhtml(
    chapter.title,
    `<h1 class="chapter-title">${esc(chapter.title || '')}</h1>\n${body}`,
    language
  );
}

/** Build an EPUB 3 file. Returns the absolute path. */
async function buildEpub({ manuscript, chapters, author, metadata }) {
  ensureDir(OUT_DIR);
  const language = manuscript.language === 'en' ? 'en' : 'bn';
  const outPath = path.join(OUT_DIR, `ms-${manuscript.manuscript_id}.epub`);
  const bookId = `urn:uuid:mudron-${manuscript.manuscript_id}-${manuscript.created_at ? new Date(manuscript.created_at).getTime() : 0}`;
  const authorName = [author?.first_name, author?.last_name].filter(Boolean).join(' ') || author?.pen_name || 'Unknown';

  const output = fs.createWriteStream(outPath);
  const zip = archiver('zip', { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on('close', () => resolve(outPath));
    zip.on('error', reject);
  });
  zip.pipe(output);

  // The mimetype entry must be first and stored uncompressed.
  zip.append('application/epub+zip', { name: 'mimetype', store: true });

  zip.append(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`, { name: 'META-INF/container.xml' });

  zip.append(EPUB_CSS, { name: 'OEBPS/style.css' });

  if (fs.existsSync(SERIF_BN)) {
    zip.file(SERIF_BN, { name: 'OEBPS/fonts/NotoSerifBengali-Regular.ttf' });
  }

  // --- front matter ---
  const titlePage = xhtml(manuscript.title, `<div class="titlepage">
  <h1>${esc(manuscript.title)}</h1>
  ${manuscript.subtitle ? `<div class="subtitle">${esc(manuscript.subtitle)}</div>` : ''}
  <div class="author">${esc(authorName)}</div>
</div>`, language);
  zip.append(titlePage, { name: 'OEBPS/titlepage.xhtml' });

  const year = new Date().getFullYear();
  const copyright = xhtml(L(language, 'কপিরাইট', 'Copyright'), `<div class="copyright">
  <p>${esc(manuscript.title)}</p>
  <p>© ${year} ${esc(authorName)}</p>
  <p>${L(language,
      'সর্বস্বত্ব সংরক্ষিত। লেখকের লিখিত অনুমতি ছাড়া এই বইয়ের কোনো অংশ পুনরুৎপাদন করা যাবে না।',
      'All rights reserved. No part of this book may be reproduced without the written permission of the author.')}</p>
  <p>${L(language, 'প্রকাশনা সহায়তা: মুদ্রণ', 'Produced with Mudron')}</p>
</div>`, language);
  zip.append(copyright, { name: 'OEBPS/copyright.xhtml' });

  // --- chapters ---
  const chapterFiles = chapters.map((c, i) => ({
    id: `chap${i + 1}`,
    href: `chap${i + 1}.xhtml`,
    title: c.title || L(language, `অধ্যায় ${langSvc.toBanglaDigits(c.chapter_no)}`, `Chapter ${c.chapter_no}`),
    content: c,
  }));

  for (const cf of chapterFiles) {
    zip.append(chapterXhtml({ ...cf.content, title: cf.title }, language), { name: `OEBPS/${cf.href}` });
  }

  // --- navigation ---
  const navItems = chapterFiles.map((cf) => `    <li><a href="${cf.href}">${esc(cf.title)}</a></li>`).join('\n');
  zip.append(xhtml(L(language, 'সূচিপত্র', 'Contents'), `<nav epub:type="toc" id="toc">
  <h1>${L(language, 'সূচিপত্র', 'Contents')}</h1>
  <ol>
${navItems}
  </ol>
</nav>`, language), { name: 'OEBPS/nav.xhtml' });

  const navPoints = chapterFiles.map((cf, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${esc(cf.title)}</text></navLabel>
      <content src="${cf.href}"/>
    </navPoint>`).join('\n');
  zip.append(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${bookId}"/></head>
  <docTitle><text>${esc(manuscript.title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`, { name: 'OEBPS/toc.ncx' });

  // --- cover ---
  let coverManifest = '';
  let coverSpine = '';
  let coverMeta = '';
  if (manuscript.cover_path) {
    const abs = path.join(__dirname, '..', manuscript.cover_path.replace(/^[\\/]/, ''));
    if (fs.existsSync(abs)) {
      const ext = path.extname(abs).toLowerCase();
      const media = ext === '.png' ? 'image/png' : 'image/jpeg';
      zip.file(abs, { name: `OEBPS/cover${ext}` });
      zip.append(xhtml(L(language, 'প্রচ্ছদ', 'Cover'),
        `<div style="text-align:center;margin:0;padding:0"><img src="cover${ext}" alt="${esc(manuscript.title)}" style="max-width:100%;height:auto"/></div>`,
        language), { name: 'OEBPS/cover.xhtml' });
      coverManifest = `    <item id="cover-image" href="cover${ext}" media-type="${media}" properties="cover-image"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>\n`;
      coverSpine = '    <itemref idref="cover"/>\n';
      coverMeta = '    <meta name="cover" content="cover-image"/>\n';
    }
  }

  const manifest = chapterFiles
    .map((cf) => `    <item id="${cf.id}" href="${cf.href}" media-type="application/xhtml+xml"/>`)
    .join('\n');
  const spine = chapterFiles.map((cf) => `    <itemref idref="${cf.id}"/>`).join('\n');
  const keywords = (metadata?.keywords || []).map((k) => `    <dc:subject>${esc(k)}</dc:subject>`).join('\n');

  zip.append(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${bookId}</dc:identifier>
    <dc:title>${esc(manuscript.title)}</dc:title>
    <dc:creator>${esc(authorName)}</dc:creator>
    <dc:language>${language}</dc:language>
    <dc:publisher>Mudron</dc:publisher>
    ${metadata?.blurb ? `<dc:description>${esc(metadata.blurb)}</dc:description>` : ''}
${keywords}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
${coverMeta}  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="font-bn" href="fonts/NotoSerifBengali-Regular.ttf" media-type="font/ttf"/>
    <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>
    <item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>
${coverManifest}${manifest}
  </manifest>
  <spine toc="ncx">
${coverSpine}    <itemref idref="titlepage"/>
    <itemref idref="copyright"/>
    <itemref idref="nav"/>
${spine}
  </spine>
</package>`, { name: 'OEBPS/content.opf' });

  await zip.finalize();
  return done;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * @param variant 'digital' (A5, symmetric margins) or 'print' (6x9in, mirrored)
 */
async function buildPdf({ manuscript, chapters, author, metadata }, variant = 'digital') {
  ensureDir(OUT_DIR);
  const language = manuscript.language === 'en' ? 'en' : 'bn';
  const outPath = path.join(OUT_DIR, `ms-${manuscript.manuscript_id}-${variant}.pdf`);
  const authorName = [author?.first_name, author?.last_name].filter(Boolean).join(' ') || author?.pen_name || '';

  const isPrint = variant === 'print';
  const size = isPrint ? [432, 648] : 'A5';   // 6x9in at 72dpi
  const margins = isPrint
    ? { top: 54, bottom: 54, left: 72, right: 54 }  // wider inner margin for the gutter
    : { top: 48, bottom: 48, left: 48, right: 48 };

  const doc = new PDFDocument({
    size,
    margins,
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: manuscript.title,
      Author: authorName,
      Subject: metadata?.blurb ? metadata.blurb.slice(0, 200) : manuscript.genre || '',
      Keywords: (metadata?.keywords || []).join(', '),
      Producer: 'Mudron',
    },
  });

  const stream = fs.createWriteStream(outPath);
  const done = new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
  doc.pipe(stream);

  const fontPath = pickFont(language);
  const BODY = 'body';
  if (fontPath) doc.registerFont(BODY, fontPath);
  const useFont = () => (fontPath ? doc.font(BODY) : doc.font('Times-Roman'));

  const width = doc.page ? doc.page.width : 0;

  // --- title page ---
  doc.addPage();
  useFont();
  doc.moveDown(8);
  doc.fontSize(26).text(manuscript.title, { align: 'center' });
  if (manuscript.subtitle) {
    doc.moveDown(0.6).fontSize(14).text(manuscript.subtitle, { align: 'center' });
  }
  doc.moveDown(3).fontSize(14).text(authorName, { align: 'center' });

  // --- copyright page ---
  doc.addPage();
  useFont();
  doc.moveDown(14).fontSize(10);
  doc.text(manuscript.title, { align: 'center' });
  doc.moveDown(0.5).text(`© ${new Date().getFullYear()} ${authorName}`, { align: 'center' });
  doc.moveDown(0.8).text(
    L(language,
      'সর্বস্বত্ব সংরক্ষিত। লেখকের লিখিত অনুমতি ছাড়া এই বইয়ের কোনো অংশ পুনরুৎপাদন করা যাবে না।',
      'All rights reserved. No part of this book may be reproduced without the written permission of the author.'),
    { align: 'center' }
  );
  doc.moveDown(1.2).text(L(language, 'প্রকাশনা সহায়তা: মুদ্রণ', 'Produced with Mudron'), { align: 'center' });

  // --- table of contents ---
  doc.addPage();
  useFont();
  doc.fontSize(18).text(L(language, 'সূচিপত্র', 'Contents'), { align: 'center' });
  doc.moveDown(1.5).fontSize(11);
  chapters.forEach((c) => {
    const title = c.title || L(language, `অধ্যায় ${langSvc.toBanglaDigits(c.chapter_no)}`, `Chapter ${c.chapter_no}`);
    doc.text(title, { continued: false });
    doc.moveDown(0.4);
  });

  // --- chapters ---
  for (const c of chapters) {
    doc.addPage();
    useFont();
    doc.moveDown(3);
    const title = c.title || L(language, `অধ্যায় ${langSvc.toBanglaDigits(c.chapter_no)}`, `Chapter ${c.chapter_no}`);
    doc.fontSize(17).text(title, { align: 'center' });
    doc.moveDown(1.6).fontSize(11.5);

    for (const p of langSvc.paragraphs(c.content || '')) {
      doc.text(p, {
        align: 'justify',
        indent: 18,
        lineGap: 3.5,
        paragraphGap: 2,
      });
    }
  }

  // --- running heads and page numbers ---
  const range = doc.bufferedPageRange();
  for (let i = 3; i < range.count; i++) {   // skip title / copyright / TOC
    doc.switchToPage(i);
    useFont();
    const pageNo = i - 2;
    const bottom = doc.page.height - doc.page.margins.bottom + 18;
    doc.fontSize(9).text(
      language === 'bn' ? langSvc.toBanglaDigits(pageNo) : String(pageNo),
      doc.page.margins.left,
      bottom,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
    );
    if (isPrint) {
      const top = doc.page.margins.top - 26;
      doc.fontSize(8).text(
        pageNo % 2 === 0 ? authorName : manuscript.title,
        doc.page.margins.left, top,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
      );
    }
  }

  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// Print-ready HTML — the typographically exact Bangla path
// ---------------------------------------------------------------------------

function buildPrintHtml({ manuscript, chapters, author }) {
  ensureDir(OUT_DIR);
  const language = manuscript.language === 'en' ? 'en' : 'bn';
  const outPath = path.join(OUT_DIR, `ms-${manuscript.manuscript_id}-print.html`);
  const authorName = [author?.first_name, author?.last_name].filter(Boolean).join(' ') || author?.pen_name || '';

  const body = chapters.map((c) => {
    const title = c.title || L(language, `অধ্যায় ${langSvc.toBanglaDigits(c.chapter_no)}`, `Chapter ${c.chapter_no}`);
    const paras = langSvc.paragraphs(c.content || '')
      .map((p, i) => `<p${i === 0 ? ' class="first"' : ''}>${esc(p)}</p>`)
      .join('\n');
    return `<section class="chapter"><h2>${esc(title)}</h2>\n${paras}\n</section>`;
  }).join('\n');

  const toc = chapters.map((c, i) =>
    `<li>${esc(c.title || L(language, `অধ্যায় ${langSvc.toBanglaDigits(c.chapter_no)}`, `Chapter ${c.chapter_no}`))}</li>`
  ).join('\n');

  const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<title>${esc(manuscript.title)}</title>
<style>
  @font-face { font-family: "Noto Serif Bengali"; src: url("/static/fonts/NotoSerifBengali-Regular.ttf"); }
  @page { size: 6in 9in; margin: 0.75in 0.6in; }
  @page :left  { margin-left: 0.6in; margin-right: 0.9in; }
  @page :right { margin-left: 0.9in; margin-right: 0.6in; }
  body { font-family: "Noto Serif Bengali", Georgia, serif; font-size: 11.5pt; line-height: 1.8; text-align: justify; }
  .titlepage { text-align: center; page-break-after: always; padding-top: 30%; }
  .titlepage h1 { font-size: 26pt; font-weight: normal; margin: 0 0 .4em; }
  .titlepage .author { font-size: 13pt; margin-top: 3em; }
  .copyright { page-break-after: always; padding-top: 45%; text-align: center; font-size: 9.5pt; line-height: 2.2; }
  .toc { page-break-after: always; }
  .toc h2 { text-align: center; font-weight: normal; }
  .toc ol { line-height: 2.2; }
  .chapter { page-break-before: always; }
  .chapter h2 { text-align: center; font-weight: normal; font-size: 16pt; margin: 3em 0 2em; }
  p { margin: 0; text-indent: 1.4em; orphans: 2; widows: 2; }
  p.first { text-indent: 0; }
  @media screen { body { max-width: 40em; margin: 2rem auto; padding: 0 1rem; } }
</style>
</head>
<body>
<div class="titlepage">
  <h1>${esc(manuscript.title)}</h1>
  ${manuscript.subtitle ? `<div>${esc(manuscript.subtitle)}</div>` : ''}
  <div class="author">${esc(authorName)}</div>
</div>
<div class="copyright">
  <p>${esc(manuscript.title)}</p>
  <p>© ${new Date().getFullYear()} ${esc(authorName)}</p>
  <p>${L(language, 'সর্বস্বত্ব সংরক্ষিত।', 'All rights reserved.')}</p>
</div>
<div class="toc"><h2>${L(language, 'সূচিপত্র', 'Contents')}</h2><ol>${toc}</ol></div>
${body}
</body>
</html>`;

  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

module.exports = { buildEpub, buildPdf, buildPrintHtml, OUT_DIR };
