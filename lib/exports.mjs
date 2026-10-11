const xml = text => String(text).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const relNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
const officeRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; return n >>> 0; });
function crc32(bytes) { let crc = 0xffffffff; for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; }

// Minimal, standards-based uncompressed ZIP. No shell commands or dependencies.
export function zipFiles(files) {
  const local = []; const central = []; let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name); const bytes = Buffer.from(value); const crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, bytes);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(bytes.length, 20); entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, filename); offset += header.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function docx(delivery) {
  const paragraphs = delivery.body.split('\n').map(line => {
    let style = ''; let content = line;
    if (/^# /.test(line)) { style = 'Title'; content = line.slice(2); }
    else if (/^## /.test(line)) { style = 'Heading1'; content = line.slice(3); }
    else if (/^### /.test(line)) { style = 'Heading2'; content = line.slice(4); }
    else if (/^- /.test(line)) content = '• ' + line.slice(2);
    return paragraph(content, style);
  }).join('');
  return docxPackage(paragraphs);
}

const paragraph = (text, style = '', run = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r>${run ? `<w:rPr>${run}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
const cell = (text, width, { bold = false, fill = '' } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p></w:tc>`;
const border = side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="DFE3EA"/>`;
function table(rows, widths) {
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map(row => `<w:tr>${row}</w:tr>`).join('')}</w:tbl><w:p/>`;
}

// Structured memo layout: cover table, numbered sections, and a sign-off table.
function memoDocx(delivery, { memo, project, gaap }) {
  const { header = {}, preface = '', signoff = {}, sections = [] } = memo;
  const cover = [['To', header.to], ['From', header.from], ['CC', header.cc], ['Date', header.date], ['Subject', delivery.title], ['Client', project?.client], ['Financial year end', project?.fy], ['Framework', gaap], ['Status', delivery.status]]
    .filter(([, value]) => value)
    .map(([label, value]) => cell(label, 2400, { bold: true, fill: 'F3F6FA' }) + cell(value, 7238));
  const body = sections.map((section, i) => {
    const lines = section.body.trim() ? section.body.trim().split('\n') : [];
    const content = lines.map(line => {
      if (/^#{3,} /.test(line)) return paragraph(line.replace(/^#+ /, ''), 'Heading2');
      if (/^- /.test(line)) return paragraph('• ' + line.slice(2));
      return line.trim() ? paragraph(line) : '';
    }).join('');
    return paragraph(`${i + 1}. ${section.heading}`, 'Heading1') + (content || paragraph('[To be completed]', '', '<w:i/><w:color w:val="838D9C"/>'));
  }).join('');
  const signoffRows = [
    ['Role', 'Name', 'Signature', 'Date'].map(text => cell(text, 2409, { bold: true, fill: 'F3F6FA' })).join(''),
    ...[['Prepared by', signoff.preparer], ['Reviewed by', signoff.reviewer], ['Approved by', signoff.approver]].map(([role, name]) => [role, name || '', '', ''].map(text => cell(text, 2409)).join(''))
  ];
  return docxPackage(
    paragraph('TECHNICAL ACCOUNTING MEMORANDUM', '', '<w:b/><w:color w:val="ED1A3B"/><w:sz w:val="18"/>')
    + paragraph(delivery.title, 'Title')
    + table(cover, [2400, 7238])
    + preface.trim().split('\n').filter(line => line.trim()).map(line => paragraph(line)).join('')
    + body
    + paragraph(`${sections.length + 1}. Review and sign-off`, 'Heading1')
    + table(signoffRows, [2409, 2409, 2410, 2410])
  );
}

function docxPackage(paragraphs) {
  return zipFiles({
    '[Content_Types].xml': `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    '_rels/.rels': `${declaration}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRel}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `${declaration}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRel}/styles" Target="styles.xml"/></Relationships>`,
    'word/styles.xml': `${declaration}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="23449B"/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="23449B"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`,
    'word/document.xml': `${declaration}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`
  });
}

export function parseSlides(body) {
  const sections = body.split(/^## /m).slice(1);
  return (sections.length ? sections : [body.replace(/^# /, '')]).map(section => {
    const [title, ...lines] = section.trim().split('\n');
    return { title, lines: lines.filter(x => x.trim()).map(x => x.replace(/^- /, '')) };
  });
}

function shape(id, name, x, y, w, h, paragraphs, color, size, bold = false) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs.map(text => `<a:p><a:pPr><a:spcAft><a:spcPts val="1000"/></a:spcAft></a:pPr><a:r><a:rPr lang="en-US" sz="${size}"${bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr><a:t>${xml(text)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
}
const group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const pns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const colors = '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
function pptx(delivery) {
  const slides = parseSlides(delivery.body).flatMap(slide => {
    // Split long text to avoid overflowing the editable slide placeholders.
    const wrapped = slide.lines.flatMap(line => line.match(/.{1,105}(?:\s|$)|.{1,105}/g) || ['']);
    const pages = [];
    for (let i = 0; i < Math.max(1, wrapped.length); i += 7) pages.push({ title: slide.title + (i ? ' (continued)' : ''), lines: wrapped.slice(i, i + 7) });
    return pages;
  });
  const overrides = slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  const files = {
    '[Content_Types].xml': `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${overrides}</Types>`,
    '_rels/.rels': `${declaration}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRel}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    'ppt/presentation.xml': `${declaration}<p:presentation ${pns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `${declaration}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRel}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="${officeRel}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`,
    'ppt/slideMasters/slideMaster1.xml': `${declaration}<p:sldMaster ${pns}><p:cSld><p:spTree>${group}</p:spTree></p:cSld>${colors}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': `${declaration}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRel}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${officeRel}/theme" Target="../theme/theme1.xml"/></Relationships>`,
    'ppt/slideLayouts/slideLayout1.xml': `${declaration}<p:sldLayout ${pns} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': `${declaration}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRel}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    'ppt/theme/theme1.xml': `${declaration}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Advisory Desk"><a:themeElements><a:clrScheme name="Advisory"><a:dk1><a:srgbClr val="182849"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="23449B"/></a:dk2><a:lt2><a:srgbClr val="FFFFFF"/></a:lt2>${['23449B', 'ED1A3B', 'BFCDED', '596980', 'EAF0FB', 'FFF0F3'].map((c, i) => `<a:accent${i + 1}><a:srgbClr val="${c}"/></a:accent${i + 1}>`).join('')}<a:hlink><a:srgbClr val="23449B"/></a:hlink><a:folHlink><a:srgbClr val="596980"/></a:folHlink></a:clrScheme><a:fontScheme name="Advisory"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Advisory"><a:fillStyleLst>${'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${'<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>'.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  };
  slides.forEach((slide, i) => {
    const first = i === 0; const foreground = first ? 'FFFFFF' : '23449B';
    const shapes = shape(2, 'Title', 700000, 650000, 10700000, 1300000, [slide.title], foreground, slide.title.length > 70 ? 2800 : 3400, true)
      + shape(3, 'Body', 700000, 2200000, 10700000, 3700000, slide.lines, first ? 'DCE6FF' : '182849', 2000)
      + shape(4, 'Footer', 700000, 6190000, 10700000, 400000, [`ADVISORY DESK  /  WORKING OUTLINE                                      ${i + 1} / ${slides.length}`], first ? 'DCE6FF' : '596980', 1000)
      + '<p:sp><p:nvSpPr><p:cNvPr id="5" name="Brand accent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="700000" y="6030000"/><a:ext cx="10700000" cy="30000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="ED1A3B"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>';
    files[`ppt/slides/slide${i + 1}.xml`] = `${declaration}<p:sld ${pns}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${first ? '23449B' : 'FFFFFF'}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${group}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = `${declaration}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRel}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
  });
  return zipFiles(files);
}

// PDF: the Markdown body laid out on A4 pages with the standard Helvetica fonts,
// so the file needs no embedded fonts or external tools.
const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const WIN_ANSI = { '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '€': 0x80 };
const pdfByte = ch => WIN_ANSI[ch] ?? (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 255 && ch.charCodeAt(0) !== 127 ? ch.charCodeAt(0) : 63);
// Bold glyphs run about 8% wider than regular; wrapping uses that margin rather than a second table.
const textWidth = (text, size, bold) => [...text].reduce((sum, ch) => sum + (HELVETICA[ch.charCodeAt(0) - 32] ?? 556), 0) * size / 1000 * (bold ? 1.08 : 1);

function wrapText(text, size, bold, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, bold) <= width || !line) line = next;
    else { lines.push(line); line = word; }
  }
  return lines.length || line ? [...lines, line] : [''];
}

function pdf(delivery) {
  const [pageWidth, pageHeight, margin] = [595, 842, 56];
  const contentWidth = pageWidth - margin * 2;
  const styles = {
    title: { size: 20, bold: true, color: '0.137 0.267 0.608', before: 0, after: 10 },
    h2: { size: 13.5, bold: true, color: '0.137 0.267 0.608', before: 14, after: 4 },
    h3: { size: 11.5, bold: true, color: '0.094 0.157 0.286', before: 8, after: 2 },
    body: { size: 10.5, bold: false, color: '0.094 0.157 0.286', before: 0, after: 4 }
  };
  // Lay the document out first so the footer can say "page X of N".
  const pages = [[]];
  let y = pageHeight - margin;
  const place = (text, style, indent = 0, bullet = false) => {
    const lines = wrapText(text, style.size, style.bold, contentWidth - indent - (bullet ? 12 : 0));
    const leading = style.size * 1.4;
    y -= pages.at(-1).length ? style.before : 0;
    lines.forEach((line, i) => {
      if (y - leading < margin + 20) { pages.push([]); y = pageHeight - margin; }
      y -= leading;
      if (bullet && i === 0) pages.at(-1).push({ text: '•', x: margin + indent, y, style });
      pages.at(-1).push({ text: line, x: margin + indent + (bullet ? 12 : 0), y, style });
    });
    y -= style.after;
  };
  for (const line of delivery.body.split('\n')) {
    if (line.startsWith('# ')) place(line.slice(2), styles.title);
    else if (line.startsWith('## ')) place(line.slice(3), styles.h2);
    else if (/^#{3,} /.test(line)) place(line.replace(/^#+ /, ''), styles.h3);
    else if (/^\s*- /.test(line)) place(line.replace(/^\s*- /, ''), styles.body, 8, true);
    else if (line.trim()) place(line.trim(), styles.body);
    else y -= 4;
  }
  const hex = text => [...text].map(ch => pdfByte(ch).toString(16).padStart(2, '0')).join('');
  const streams = pages.map((items, i) => {
    const footer = `${delivery.title}  ·  Page ${i + 1} of ${pages.length}`;
    return [
      ...items.map(({ text, x, y, style }) => `BT /${style.bold ? 'F2' : 'F1'} ${style.size} Tf ${style.color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td <${hex(text)}> Tj ET`),
      `BT /F1 8 Tf 0.513 0.553 0.612 rg ${margin} 32 Td <${hex(footer.length > 110 ? `${footer.slice(0, 107)}...` : footer)}> Tj ET`
    ].join('\n');
  });
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ...streams.flatMap((stream, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
    ])
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = Buffer.byteLength(out, 'latin1');
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export function exportDocument(delivery, format, context = {}) {
  if (format === 'pdf') return { mime: 'application/pdf', bytes: pdf(delivery) };
  if (format === 'md') return { mime: 'text/markdown; charset=utf-8', bytes: Buffer.from(delivery.body) };
  if (format === 'docx') return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: context.memo ? memoDocx(delivery, context) : docx(delivery) };
  if (format === 'pptx') return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: pptx(delivery) };
  throw new Error('Unsupported export format.');
}
