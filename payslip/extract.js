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
  ['base', /שכר (יסוד|בסיס)|משכורת בסיס|שכר שעות|שכר רגיל/], ['hourly', /תעריף (לשעה|שעתי)/],
  ['gross', /סה"?כ (ברוטו|תשלומים)|^ברוטו$|שכר ברוטו|ברוטו שוטף/], ['net', /נטו לתשלום|שכר נטו|^נטו$/],
  ['travel', /נסיעות|החזר (הוצאות )?נסיעה/], ['havraa', /הבראה/],
  ['pensionEmp', /(קרן )?פנסיה.*עובד|ניכוי.*פנסיה|גמל.*עובד/], ['creditsSlip', /נקודות זיכוי|נק' זיכוי/],
  ['workDays', /ימי עבודה/], ['vacBal', /יתרת? (ימי )?חופשה/], ['sickBal', /יתרת? (ימי )?מחלה/],
];
export function fieldFor(label) { for (const [f, re] of ALIASES) if (re.test(label)) return f; return null; }

export function extract(items) {
  const { rows, reversed } = rowsFrom(items);
  const fields = {}; const warnings = []; const seen = [];
  if (reversed) warnings.push('טקסט הפוך זוהה ותוקן. כדאי לוודא את השדות.');
  for (const r of rows) {
    const label = r.items.filter((i) => parseNum(i.str) === null).map((i) => i.str).join(' ');
    const nums = r.items.map((i) => parseNum(i.str)).filter((v) => v !== null);
    const f = label && fieldFor(label);
    if (!f || !nums.length) continue;
    seen.push({ field: f, label, nums });
    if (fields[f] !== undefined) { warnings.push(`השדה "${label}" הופיע פעמיים; נלקח הראשון.`); continue; }
    // Table rows read RTL: [label, rate?, qty?, amount]. Amount = leftmost number = last in RTL order.
    if (f === 'otHours') fields[f] = nums[0]; else fields[f] = nums[nums.length - 1];
    if (f === 'otAmount' && nums.length >= 2 && fields.otHours === undefined) fields.otHours = nums[0]; // [qty, amount] on one row
  }
  if (fields.gross && fields.net && fields.net > fields.gross) warnings.push('נטו גבוה מברוטו. ייתכן שהשדות התחלפו.');
  return { fields, rows: seen, reversed, warnings };
}
