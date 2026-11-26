// Payslip text extraction (v0, 2026-11-24, Nitzan). Input: pdf.js-like text items [{str, x, y}] (x,y in PDF points, y up).
// Output: {fields: {base, hourly, gross, net, travel, havraa, otHours, otAmount, pensionEmp, creditsSlip, workDays, vacBal, sickBal}, rows, warnings}.
// Design (pdf-research-2026-11-24.md): strip bidi marks; un-reverse visual-order Hebrew; group by y into rows; read RTL;
// pair a label with the numbers on the same row; validate with arithmetic. Every value is shown to the user for confirmation.
const BIDI = /[‎‏‪-‮⁦-⁩]/g;
const HEB = /[֐-׿]/;
const ANCHORS = ['נטו', 'ברוטו', 'ביטוח', 'שכר', 'מס'];
const rev = (s) => [...s].reverse().join('');

export function normalize(str) { return String(str).replace(BIDI, '').replace(/\s+/g, ' ').trim(); }

// If the document's anchors appear only reversed, the text layer is in visual order: reverse Hebrew runs only.
export function detectReversed(allText) {
  const fwd = ANCHORS.filter((a) => allText.includes(a)).length;
  const bwd = ANCHORS.filter((a) => allText.includes(rev(a))).length;
  return bwd > fwd;
}
export function fixRuns(s) { return s.replace(/[֐-׿"'׳״]+(?: [֐-׿"'׳״]+)*/g, (m) => rev(m)).replace(/\s+/g, ' '); }

// Numbers: "1,234.50", "123.45-" (trailing minus), "-12", "₪ 9".
export function parseNum(t) {
  const m = String(t).replace(/[₪\s]/g, '').match(/^(-?)([\d,]*\.?\d+)(-?)$/);
  if (!m) return null;
  const v = parseFloat(m[2].replace(/,/g, ''));
  return (m[1] || m[3]) ? -v : v;
}

// "8/8" or "21/22" -> first number (worked). Dates like 10/2026 are rejected (second part > 31).
export function frac(t) { const m = String(t).trim().match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/); return m && +m[2] <= 31 ? +m[1] : null; }

export function rowsFrom(items, tol = 2.5) {
  const its = items.map((i) => ({ ...i, str: normalize(i.str) })).filter((i) => i.str);
  const reversed = detectReversed(its.map((i) => i.str).join(' '));
  if (reversed) its.forEach((i) => { if (HEB.test(i.str)) i.str = fixRuns(i.str); });
  its.sort((a, b) => b.y - a.y);
  const rows = [];
  for (const it of its) {
    const r = rows.find((r) => Math.abs(r.y - it.y) <= tol);
    if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  for (const r of rows) r.items.sort((a, b) => b.x - a.x); // RTL: rightmost first
  return { rows, reversed };
}

// Label aliases -> field. Order matters: more specific first.
const ALIASES = [
  ['otHours', /שעות נוספות.*(כמות|שעות)|ש"נ.*כמות/], ['otAmount', /שעות נוספות|ש"נ 1[25]0%?/],
  ['base', /שכר (יסוד|בסיס)|משכורת בסיס|שכר שעות|שכר רגיל/], ['hourly', /תעריף (לשעה|שעתי|שעה)/],
  ['gross', /סה"?כ (ברוטו|תשלומים)|^ברוטו$|שכר ברוטו|ברוטו שוטף/], ['healthTax', /דמי ?בריאות|מס בריאות/], ['nationalIns', /ביטוח לאומי/], ['incomeTax', /^מס הכנסה/], ['net', /נטו לתשלום|^נטו$/], ['netPay', /שכר נטו/],
  ['travel', /^(?!.*פנס)(?!.*פנסיה).*(נסיעות|החזר (הוצאות )?נסיעה)/], ['havraa', /הבראה/],
  ['pensionEmp', /(קרן )?פנסיה.*עובד|ניכוי.*פנסיה|גמל.*עובד|^(?!.*(מעסיק|נסיעות|נס-|פנס-))[^ ]+ פנסיה$/], ['creditsSlip', /נקודות זיכוי|נק' זיכוי|^נ\. זיכוי|^נ"ז/],
  ['workDays', /ימי עבודה/], ['vacBal', /יתרת? (ימי )?חופשה/], ['sickBal', /יתרת? (ימי )?מחלה/],
];
export function fieldFor(label) { for (const [f, re] of ALIASES) if (re.test(label)) return f; return null; }

// Garbled text (fonts without a proper ToUnicode map) shows up as Latin-1 symbols instead of Hebrew.
export const GARBLED = (str) => { const t = str.replace(/[\s\d.,%:'"\-]/g, ''); return t.length >= 3 && !HEB.test(t) && /[\u0080-\u02ff\u2010-\u2122\u2200-\u22ff]/.test(t); };
// Some payroll PDFs (seen: ת.מ.ל., 2026-11) store Hebrew labels through a broken ToUnicode map: each Hebrew letter becomes a fixed
// Latin-1/symbol character, in visual (reversed) order. Learned from a real slip, cross-checked against OCR of the same page.
const GLYPH = { '“':'ת','º':'ו','Ã':'פ','»':'ס','«':'נ','…':'ע','¿':'י','∫':'ד','–':'ר','¬':'כ','—':'ש','ª':'ה','∑':'א','∏':'ב','æ':'ח','∆':'ן','œ':'ק','ø':'ט','≈':'מ','√':'ל' };
export function decodeGarbled(str) {
  const chars = [...str]; let known = 0, letters = 0;
  const out = chars.map((c) => { if (/[\s\d.,%:'"\-]/.test(c)) return c; letters++; if (GLYPH[c]) { known++; return GLYPH[c]; } return '?'; });
  if (!letters || known / letters < 0.8) return null;
  return out.reverse().join('').replace(/(\d+(?:[.,]\d+)*)/g, (m) => [...m].reverse().join(''));  // digits were reversed with the text; restore them
}
// Split one visual row into segments: each label (non-number) owns the numbers that follow it (RTL) until the next label.
export function segments(row) {
  const segs = []; let cur = null;
  let prev = null;
  for (const it of row.items) {
    const v = parseNum(it.str);
    // OCR items carry a width: two labels far apart (a header row of column titles) are separate labels, not one phrase.
    const far = prev && prev.w !== undefined && it.w !== undefined && prev.x - (it.x + it.w) > 12;
    if (v === null) { if (cur && cur.nums.length === 0 && !far) cur.label += ' ' + it.str; else { cur = { label: it.str, nums: [] }; segs.push(cur); } }
    else if (cur) cur.nums.push(v);
    prev = it;
  }
  return segs;
}
export function extract(items) {
  const { rows, reversed } = rowsFrom(items);
  const fields = {}; const warnings = []; const seen = []; let garbled = 0;
  if (reversed) warnings.push('טקסט הפוך זוהה ותוקן. כדאי לוודא את השדות.');
  for (const r of rows) for (const sg of segments(r)) {
    if (GARBLED(sg.label)) { const d = decodeGarbled(sg.label); if (d && !d.includes('?')) sg.label = d; else { if (sg.nums.length) garbled++; continue; } }
    const f = sg.label && fieldFor(sg.label.trim());
    if (!f || !sg.nums.length) continue;
    seen.push({ field: f, label: sg.label, nums: sg.nums });
    if (fields[f] !== undefined) { if (f !== 'net' && f !== 'otAmount') warnings.push(`השדה "${sg.label}" הופיע פעמיים; נלקח הראשון.`); continue; }
    if (f === 'otHours') fields[f] = sg.nums[0]; else fields[f] = sg.nums[sg.nums.length - 1];
    if (f === 'otAmount' && sg.nums.length >= 2 && fields.otHours === undefined) fields.otHours = sg.nums[0];
    if (f === 'base' && sg.nums.length >= 3) {  // [qty, rate, amount]; if qty x rate = amount, that rate wins over a header value (OCR drops dots: 50.00 -> 5000)
      const [q, rate, amt] = sg.nums.slice(-3);
      if (Math.abs(q * rate - amt) < 1) fields.hourly = rate; else if (fields.hourly === undefined) fields.hourly = sg.nums[1];
    }
  }
  // Stacked layout: a label with no numbers next to it, and its value directly below (same column, within ~20pt).
  const flat = rows.flatMap((r) => r.items.map((it) => ({ ...it, ry: r.y })));
  for (const r of rows) for (const it of r.items) {
    if (parseNum(it.str) !== null) continue;
    const f = fieldFor(it.str.trim()); if (!f || fields[f] !== undefined) continue;
    const val = (o) => parseNum(o.str) ?? (f === 'workDays' ? frac(o.str) : null);  // work days may read "8/8" (worked/standard)
    const below = flat.filter((o) => o.ry < r.y && r.y - o.ry <= 20 && Math.abs(o.x - it.x) <= 30 && val(o) !== null)
      .sort((a, b) => (r.y - a.ry) - (r.y - b.ry) || Math.abs(a.x - it.x) - Math.abs(b.x - it.x))[0];
    if (below) { fields[f] = val(below); seen.push({ field: f, label: it.str, nums: [fields[f]], stacked: true }); }
  }
  if (fields.hourly !== undefined && (fields.hourly < 15 || fields.hourly > 600)) { warnings.push(`תעריף לשעה ${fields.hourly} לא נראה סביר, לא מילאתי אותו.`); delete fields.hourly; }
  if (garbled) warnings.push(`${garbled} שורות בקובץ כתובות בגופן שלא ניתן לקרוא (כנראה שורות התשלומים). את השדות האלה צריך למלא ידנית.`);
  if (fields.gross && fields.net && fields.net > fields.gross) warnings.push('נטו גבוה מברוטו. ייתכן שהשדות התחלפו.');
  return { fields, rows: seen, reversed, warnings };
}

// Screenshots/photos (2026-11-26): OCR in two passes. The Hebrew model reads labels well but mangles digits
// (seen: 2,058.00 -> "9000"); the English model reads digits well. Labels from 'heb', numbers from 'eng'.
// words: tesseract.js word objects {text, confidence, bbox:{x0,y0,x1,y1}} (pixels, y down). Output: items for extract().
export function ocrItems(hebWords, engWords, width) {
  const k = 595 / (width || 1);  // pixels -> A4 points, so extract()'s tolerances still fit
  const pos = (w) => ({ x: w.bbox.x0 * k, w: (w.bbox.x1 - w.bbox.x0) * k, y: -((w.bbox.y0 + w.bbox.y1) / 2) * k });
  const clean = (t) => String(t).replace(/^[^\d\-₪]+|[^\d.\-]+$/g, '');
  const labels = hebWords.filter((w) => w.confidence > 30 && !/\d/.test(w.text) && /[֐-׿"'%]/.test(w.text)).map((w) => ({ str: w.text, ...pos(w) }));
  // The English pass also turns Hebrew words into fake numbers (seen: "שעות נוספות" -> "119011"). Drop a number whose centre sits inside a Hebrew word.
  const hebBoxes = hebWords.filter((w) => !/\d/.test(w.text) && /[֐-׿]/.test(w.text)).map((w) => w.bbox);
  const inHeb = (b) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return hebBoxes.some((h) => cx >= h.x0 && cx <= h.x1 && cy >= h.y0 && cy <= h.y1); };
  const nums = engWords.filter((w) => w.confidence > 30 && !inHeb(w.bbox) && parseNum(clean(w.text)) !== null && /^[\d,.\-₪:]+$/.test(w.text.replace(/[|\[\]]/g, '')))
    .map((w) => ({ str: clean(w.text), ...pos(w) }));
  return [...labels, ...nums];
}
