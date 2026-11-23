// Payslip checker rules (v1, 2026-11-23, Nitzan). Pure functions: input numbers -> list of findings.
// Sources (verified for guide 02 / shorts): kolzchut overtime, travel refund, minimum wage 2026 (btl.gov.il), havraa, pension.
// Wording rule: never "error" -> "worth checking"; every finding has a ready question for the payroll clerk.
export const RULES_2026 = {
  minHourly: 35.40, minMonthly: 6443.85,           // from 1.4.2026
  travelDailyCap: 22.60,
  havraaDayPrivate: 451.5,                          // ₪ per day, private sector 2026 (kolzchut)
  havraaDays: (y) => (y < 1 ? 0 : y < 2 ? 5 : y < 4 ? 6 : y < 11 ? 7 : y < 16 ? 8 : y < 20 ? 9 : 10),
  pension: { employee: 0.06, employer: 0.065, severance: 0.06 },
  overtime: { first2: 1.25, after: 1.5 },
  fullTimeHours: 182,                               // monthly full-time hours (42h week)
};
const f2 = (n) => (Math.round(n * 100) / 100).toLocaleString('he-IL');
// s: {hourly, base, scope, otHours, otAmount, travel, workDays, publicTransit, seniority, havraa, pensionEmp, pensionEr, gross, creditsSlip, creditsExpected}
export function check(s, R = RULES_2026) {
  const out = []; const add = (level, title, detail, question) => out.push({ level, title, detail, question });
  // hours paid (Shalom 2477: derive, don't ask)
  if (s.hourly > 0 && s.base > 0) {
    const h = s.base / s.hourly;
    add('info', `שולמו לך כ-${f2(h)} שעות רגילות החודש`, 'שכר הבסיס חלקי התעריף לשעה.', h > 0 ? `לפי התלוש שולמו לי כ-${Math.round(h)} שעות רגילות. אפשר לוודא שכל השעות שעבדתי נכנסו?` : '');
  }
  // minimum wage
  if (s.hourly > 0) {
    if (s.hourly < R.minHourly) add('warn', `התעריף לשעה (${f2(s.hourly)} ₪) נמוך משכר המינימום`, `שכר מינימום מ-1.4.2026: ${R.minHourly} ₪ לשעה.`, `התעריף שלי לשעה הוא ${f2(s.hourly)} ₪. איך זה מתיישב עם שכר המינימום של ${R.minHourly} ₪?`);
    else add('ok', 'התעריף לשעה לא נמוך משכר המינימום', `${f2(s.hourly)} ₪ ≥ ${R.minHourly} ₪.`);
  } else if (s.base > 0 && s.scope >= 1 && s.base < R.minMonthly) {
    add('warn', 'שכר הבסיס נמוך משכר המינימום למשרה מלאה', `מינימום למשרה מלאה: ${f2(R.minMonthly)} ₪.`, `השכר שלי למשרה מלאה הוא ${f2(s.base)} ₪. איך זה מתיישב עם שכר המינימום?`);
  }
  // overtime paid at regular rate?
  if (s.otHours > 0 && s.otAmount > 0 && s.hourly > 0) {
    const rate = s.otAmount / s.otHours / s.hourly;
    if (rate < R.overtime.first2 - 0.01) add('warn', `שעות נוספות שולמו בתעריף ${Math.round(rate * 100)}%`, 'שעתיים ראשונות ביום: לפחות 125%, מהשלישית: 150%.', `שעות נוספות שולמו לי ב-${Math.round(rate * 100)}% מהתעריף. אפשר לבדוק את החישוב?`);
    else add('ok', 'שעות נוספות שולמו בתעריף מוגדל', `${Math.round(rate * 100)}% מהתעריף הרגיל בממוצע.`);
  }
  // travel
  if (s.publicTransit) {
    if (!(s.travel > 0)) add('warn', 'לא מופיעה שורת נסיעות', 'מי שמגיע בתחבורה ציבורית זכאי להחזר נסיעות, עד 22.60 ₪ ליום.', 'אני מגיע לעבודה בתחבורה ציבורית ולא מופיע לי החזר נסיעות. למה?');
    else if (s.workDays > 0 && s.travel / s.workDays > R.travelDailyCap + 0.01) add('info', 'החזר הנסיעות גבוה מהתקרה היומית', 'זה לא בעיה לך, רק לידיעה.');
    else add('ok', 'יש החזר נסיעות', s.workDays > 0 ? `${f2(s.travel / s.workDays)} ₪ ליום בממוצע (התקרה 22.60).` : '');
  }
  // havraa
  if (s.seniority >= 1) {
    const days = R.havraaDays(s.seniority);
    if (!(s.havraa > 0)) add('unknown', 'לא מופיעים דמי הבראה בתלוש הזה', `אחרי שנה מגיעים ${days} ימי הבראה בשנה (${f2(days * R.havraaDayPrivate)} ₪ במשרה מלאה). יש מקומות שמשלמים פעם בשנה.`, 'מתי משולמים לי דמי הבראה, ובאיזה סכום?');
    else add('ok', 'מופיעים דמי הבראה', `לפי הוותק שלך: ${days} ימים בשנה.`);
  }
  // pension (from 7th month / 4th with prior pension — we only flag absence)
  if (s.gross > 0 && s.seniority >= 0.5) {
    if (!(s.pensionEmp > 0)) add('warn', 'לא מופיע ניכוי לפנסיה', 'אחרי חצי שנה (או 3 חודשים אם הייתה פנסיה קודמת) חובה להפריש.', 'למה לא מופרשת לי פנסיה?');
    else { const ins = s.base > 0 ? s.base : s.gross; const p = s.pensionEmp / ins;  // insured pay ~ base (travel/havraa are not pension-able)
      if (p < R.pension.employee - 0.005) add('warn', `הפרשת העובד לפנסיה ${f2(p * 100)}% משכר הבסיס`, 'בדרך כלל 6% מהשכר המבוטח (בלי נסיעות והבראה).', 'לפי איזה שכר מחושבת הפרשת הפנסיה שלי, ובאיזה אחוז?'); else add('ok', 'יש הפרשה לפנסיה', `${f2(p * 100)}% משכר הבסיס.`); }
  }
  // credit points
  if (s.creditsExpected > 0 && s.creditsSlip >= 0) {
    if (s.creditsSlip + 0.01 < s.creditsExpected) add('warn', `בתלוש ${s.creditsSlip} נקודות זיכוי, ולך מגיעות ${s.creditsExpected}`, 'כל נקודה = 242 ₪ פחות מס בחודש.', `לפי מה שאני יודע מגיעות לי ${s.creditsExpected} נקודות זיכוי, ובתלוש מופיעות ${s.creditsSlip}. האם מילאתי טופס 101 נכון?`);
    else add('ok', 'מספר נקודות הזיכוי תואם', `${s.creditsSlip} נקודות.`);
  } else if (!(s.creditsExpected > 0)) add('unknown', 'לא ידוע כמה נקודות זיכוי מגיעות לך', 'תושב/ת ישראל מקבל/ת לפחות 2.25 (גבר) או 2.75 (אישה), ויותר עם ילדים ועוד.', 'כמה נקודות זיכוי אני מקבל/ת, ולפי איזה טופס 101?');
  return out;
}
