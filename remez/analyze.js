// Chat-gift analyzer (v0, 2026-11-06, Nitzan). Runs fully in the browser: no upload, no AI.
// Input: WhatsApp iPhone export text in Hebrew ("[d.m.yyyy, H:MM:SS] Name: text").
// Output: wishes, unkept "one day" promises, firsts, private words, fun stats for ONE chosen person (the partner).

// iPhone: "[9.11.2024, 14:05:33] Name: text"; Android: "9.11.2024, 14:05 - Name: text" or "09/11/2024, 14:05 - ...".
// Day-first dates with . / or - separators, 2- or 4-digit year, optional seconds, optional AM/PM (English locales).
const LINE = /^[\u200e\u200f\u202a-\u202e]*\[?(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?([AaPp])\.?[Mm]\.?)?\]?\s*(?:-\s)?([^:]{1,60}?):\s?(.*)$/;
const CLEAN = /[‎‏‪-‮]/g;
const MEDIA = /(הושמט|הושמטה|omitted|שיחת וידאו|שיחה קולית|שלא נענתה|ההודעה נמחקה|נמחקה)/;
// Intimate / sexual terms: any message containing one is dropped from every list (not shown, not quoted).
const BLOCK = /(סקס|זיון|לזיין|מזדיי|חרמ|ציצי|שדיים|תחת|זין|כוס|לגמור|גמרתי|עירום|ערומ|אורגז|מיטה|ליקק|למצוץ|נשיק|לנשק|מקלחת|תחתונ|חזיי|לשכב|שכבנו|על הפנים|לרדת לך|sex|nude|horny)/i;
const HEB = '֐-׿';
const wb = (s) => new RegExp(`(?<![${HEB}a-zA-Z])(${s})(?![${HEB}])`);
const lb = (s) => new RegExp(`(?<![${HEB}a-zA-Z])(${s})`);  // leading boundary only (for prefixes like 'באלי ש')

const WISH = lb('אני רוצה ש|אני רוצה ל|באלי ש|באלי ל|בא לי ש|בא לי ל|הלוואי ש|הלוואי ו|תמיד רציתי|חולמת על|חלמתי ש|מתה על|רציתי ל|רציתי ש|מתה ל|אין לי זמן ל|הדבר היחיד שאני רוצה|בא לי סוף|בא לי ערב|בא לי טיול|בא לי חופשה|חייבים ללכת|חייבים לנסות|בוא נלך|בואי נלך|נלך ל|נטוס|הייתי רוצה');
// Everyday wants that are not gift material (sleep, home, food right now, being with the partner right now)
// Idioms and body/emotion states: never gift material (Shalom 2757: 'באלי להקיא' became a 'vomit' gift).
export const IDIOM = /(להקיא|מקיא|למות|מתה מ|מת מ|לבכות|לצרוח|לצעוק|להתאבד|להיעלם|להעלם|לברוח|להשתגע|לצאת מדעת|לקבור|להרביץ|לרצוח|לחנוק|לשבור את|להתפוצץ|להתפרק|לישון שבוע|להעיף|לזרוק את הטלפון|לירות|להתעלף|להתבאס|לשרוף)/;
const DULL = /((^|\s)לא (נ|א)|אולי בסוף|תכף|לישון|הביתה|הבייתה|לאכול|להתקלח|לנוח|להיות איתך|לראות אותך|לדבר איתך|ממך|עכשיו|היום|מחר בבוקר|לעבודה|לצאת מה)/;
const PROMISE = wb('יום אחד|פעם נעשה|בפעם הבאה נ|כשנגור|כשיהיה לנו|אני מבטיח|אני מבטיחה|מבטיח לך|מבטיחה לך|הבטחתי|נעשה את זה|עוד נעשה|מתישהו נ');
const LOVE = wb('אוהב אותך|אוהבת אותך|אוהב אותך מאוד|אוהבת אותך מאוד');


// Gift-relevant topics: counted in the partner's (clean) messages. Category → words (prefix match on Hebrew stems).
const TOPICS = {
  'חוויות': ['צימר','ספא','מסאז','עיסוי','טיסה','לטוס','חופשה','מלון','הופעה','קונצרט','סרט','קולנוע','הצגה','מסעדה','פיקניק','סקי','צלילה','בריכה','חוף הים','לים','טיול','קמפינג','חדר בריחה','החלקה','מוזיאון','סדנה','שיעור'],
  'אוכל': ['סושי','פיצה','שווארמה','המבורגר','פסטה','בורקס','גלידה','שוקולד','עוגה','קפה','יין','קינוח','נאגטס','פלאפל','חומוס','ראמן','טאקו','וופל','מאפה'],
  'מקומות': ['פריז','רומא','יוון','לונדון','אמסטרדם','ברצלונה','ניו יורק','יפן','תאילנד','אילת','צפון','גליל','ירושלים','תל אביב','כנרת','גולן','רודוס','קפריסין','איטליה','סיציליה'],
  'דברים': ['שרשרת','צמיד','טבעת','עגילים','שעון','בושם','תיק','נעליים','שמלה','פיג׳מה','פיגמה','ספרים','בובה','פרחים','צמח','מצלמה','אוזניות','שמיכה','כרית','ציפורניים','לק ג׳ל','מניקור','איפור','ספל'],
  'תחביבים': ['לצייר','ציור','לרקוד','ריקוד','יוגה','פילאטיס','ריצה','חדר כושר','אימון','לשיר','גיטרה','פסנתר','לבשל','לאפות','סריגה','צילום','משחק','פאזל','דואולינגו','קריאה','נטפליקס','סדרה'],
  'חיות': ['כלב','חתול','ארנב','רקון','ראקון','סוס','פנדה','דולפין','למור'],
};
function topics(theirs) {
  const out = {};
  for (const [cat, words] of Object.entries(TOPICS)) {
    const counts = words.map((w) => {
      // whole word, allowing up to 2 one-letter prefixes (ו ה ב ל מ ש כ) and plural/possessive endings
      const re = new RegExp(`(?<![${HEB}])[והבלמשכ]{0,2}${w}(ים|ות|י|ה)?(?![${HEB}])`);
      return [w, theirs.filter((m) => re.test(m.text)).length];
    }).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (counts.length) out[cat] = counts;
  }
  return out;
}

// Rule-based gift ideas: a topic word seen ≥3 times (or inside a wish) → a concrete idea. Evidence is shown with each idea.
const IDEAS = [
  [['צימר','ספא','מסאז','עיסוי','מלון'], 'חוויה: לילה בצימר או יום ספא זוגי'],
  [['טיסה','לטוס','חופשה','פריז','רומא','יוון','לונדון','יפן','איטליה','רודוס','קפריסין'], 'חוויה: "שובר טיסה" לחופשה משותפת, או ערב בנושא היעד שהיא חולמת עליו'],
  [['הופעה','קונצרט','הצגה'], 'כרטיסים להופעה או להצגה'],
  [['סרט','קולנוע','סדרה','נטפליקס'], 'ערב קולנוע ביתי: הסרט שהיא רצתה לראות, פופקורן, שמיכה'],
  [['סושי','פיצה','פסטה','ראמן','המבורגר','שווארמה','טאקו'], 'ארוחה מהאוכל שהיא הכי מדברת עליו, או סדנת בישול שלו'],
  [['גלידה','שוקולד','עוגה','קינוח','וופל','מאפה'], 'קופסת מתוקים בהתאמה אישית'],
  [['קפה'], 'ערכת קפה מיוחדת או סדנת ברמנות קפה'],
  [['ציור','לצייר'], 'ערכת ציור איכותית או סדנת ציור'],
  [['יוגה','פילאטיס','אימון','ריצה','חדר כושר'], 'ציוד ספורט שהיא תאהב, או כרטיסייה לסטודיו'],
  [['ציפורניים','מניקור','לק ג׳ל'], 'טיפול מניקור מפנק או ערכת ציפורניים'],
  [['כלב','חתול','ארנב'], 'משהו לחיית המחמד שלה, או יום בחוות חיות'],
  [['רקון','ראקון','פנדה','למור','דולפין'], 'בובה או פריט של החיה שהיא אוהבת'],
  [['פרחים','צמח'], 'זר פרחים או צמח לבית'],
  [['שרשרת','צמיד','טבעת','עגילים','שעון'], 'תכשיט. כדאי לבדוק מה בדיוק היא אמרה'],
  [['ספרים','קריאה'], 'ספר שהיא הזכירה, עם הקדשה'],
  [['משחק','פאזל'], 'משחק קופסה או פאזל עם תמונה שלכם'],
];
function giftIdeas(tp, wishes) {
  const counts = {};
  for (const ws of Object.values(tp)) for (const [w, n] of ws) counts[w] = n;
  const out = [];
  for (const [words, idea] of IDEAS) {
    const hits = words.filter((w) => counts[w]).map((w) => [w, counts[w]]);
    const wish = wishes.find((x) => words.some((w) => x.text.includes(w)));
    if (!hits.length && !wish) continue;
    const score = hits.reduce((a, [, n]) => a + n, 0) + (wish ? 50 : 0);
    out.push({ idea, evidence: hits.slice(0, 3), wish: wish || null, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function parse(text) {
  const msgs = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(LINE);
    if (m) {
      const [, d, mo, yy, hh, mi, ss, ap, who, body] = m;
      let h = +hh; if (ap) h = (h % 12) + (/[Pp]/.test(ap) ? 12 : 0);
      const y = yy.length === 2 ? 2000 + +yy : +yy;
      msgs.push({ t: new Date(y, +mo - 1, +d, h, +mi, +(ss || 0)), who: who.replace(CLEAN, '').trim(), text: body.replace(CLEAN, '') });
    } else if (msgs.length) msgs[msgs.length - 1].text += ' ' + raw.replace(CLEAN, '');
  }
  if (msgs.length && /מוצפנות|encrypted/.test(msgs[0].text)) msgs.shift();
  return msgs;
}

export function people(msgs) {
  const c = {};
  for (const m of msgs) c[m.who] = (c[m.who] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
}

const fmt = (d) => `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
const clean = (m) => !MEDIA.test(m.text) && !BLOCK.test(m.text) && m.text.length <= 220;

export function analyze(msgs, partner) {
  const theirs = msgs.filter((m) => m.who === partner && clean(m));
  const pick = (re) => {
    // newest first, one per day, skip near-duplicates
    const out = [], seen = new Set();
    for (const m of [...theirs].reverse()) {
      if (!re.test(m.text)) continue;
      if (re === WISH && (DULL.test(m.text) || m.text.trim().split(/\s+/).length < 4)) continue;
      const key = m.text.slice(0, 25);
      const day = fmt(m.t);
      if (seen.has(key) || seen.has(day)) continue;
      seen.add(key); seen.add(day);
      out.push({ date: day, text: m.text });
    }
    return out;
  };
  const wishes = pick(WISH);
  const promises = msgs.filter((m) => clean(m) && PROMISE.test(m.text)).slice(-200).reverse()
    .map((m) => ({ date: fmt(m.t), who: m.who, text: m.text }));

  // firsts
  const firstLove = {};
  for (const m of msgs) if (clean(m) && LOVE.test(m.text) && !firstLove[m.who]) firstLove[m.who] = { date: fmt(m.t), text: m.text };

  // private words: frequent in this chat, rare in general Hebrew (crude: not in a small stoplist, length 2–8)
  const STOP = new Set('אני את אתה זה לא כן מה של על עם גם אבל או אז רק כל יש אין הוא היא אנחנו לי לך שלי שלך היה הייתי יותר טוב עוד כבר אם כי איך למה מתי איפה פה שם ככה מאוד ממש סתם אוקיי אוקי חח חחח חחחח באמת נו טוב עכשיו היום מחר אתמול'.split(' '));
  const freq = {};
  for (const m of msgs) if (clean(m)) for (const w of m.text.split(/[^֐-׿a-zA-Z']+/)) {
    if (w.length < 2 || w.length > 8 || STOP.has(w) || /^ח+$/.test(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  const nick = ['ניגה', 'מאמי', 'בייבי', 'נשמה', 'חיים שלי', 'אהובי', 'אהובתי', 'מתוק', 'מתוקה', 'צוץ', 'באבי', 'בובה', 'לב שלי'];
  const nicknames = Object.entries(freq).filter(([w]) => nick.includes(w)).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // stats
  const ppl = people(msgs);
  const days = new Set(msgs.map((m) => m.t.toDateString())).size;
  const first = msgs[0]?.t, last = msgs[msgs.length - 1]?.t;
  const perDay = {};
  for (const m of msgs) perDay[m.t.toDateString()] = (perDay[m.t.toDateString()] || 0) + 1;
  const busiest = Object.entries(perDay).sort((a, b) => b[1] - a[1])[0];

  return {
    partner, total: msgs.length, people: ppl, days,
    since: first && fmt(first), until: last && fmt(last),
    busiest: busiest && { date: fmt(new Date(busiest[0])), n: busiest[1] },
    wishes, promises, firstLove, nicknames, topics: topics(theirs), ideas: giftIdeas(topics(theirs), wishes),
  };
}

// Digest for the AI step (and for the manual test): short chat snippets around gift-relevant lines, never the whole chat.
// Each hit (partner's wish or topic mention, either side's "one day" promise) comes with the message before and after it,
// so the reader can tell a real wish from an idiom ("איזה סרט"). Numbers, links and emails are masked.
const TOPIC_RE = lb(Object.values(TOPICS).flat().join('|'));
// Obstacles and things that ran out or broke: the strongest gift signals (see knowledge/gift-picking-rubric.md).
const OBSTACLE = lb('נשבר|נשברה|נשברו|התקלקל|התקלקלה|הרסתי|נגמר לי|נגמרה לי|נגמרו לי|איבדתי|אבד לי|נקרע|נקרעה|אין לי איך|אין לי איפה|אין לי מה ל|אבל אין לי|לא שרד|לא שרדה|לא שרדו|אבד|אבדה|כבר בן |כבר בת |אני צריך חדש|אני צריכה חדש|צריך חדשה|צריכה חדשה|מת לי ה|הישן שלי');
const MASK = (s) => s.replace(/https?:\/\/\S+/g, '[קישור]').replace(/\S+@\S+\.\S+/g, '[מייל]').replace(/\d[\d\- ]{5,}\d/g, '[מספר]');
export function digest(msgs, partner, maxSnippets = 90) {
  const ok = (m) => m && clean(m) && !IDIOM.test(m.text);
  const hits = [];
  msgs.forEach((m, i) => {
    if (!ok(m) || m.text.split(/\s+/).length < 3) return;
    const mine = m.who === partner;
    if ((mine && WISH.test(m.text) && !DULL.test(m.text)) || (mine && OBSTACLE.test(m.text)) || PROMISE.test(m.text) || (mine && TOPIC_RE.test(m.text))) hits.push(i);
  });
  const used = new Set(), out = [];
  for (const i of hits.reverse()) {            // newest first
    if (out.length >= maxSnippets || used.has(i)) continue;
    const lines = [];
    for (const j of [i - 1, i, i + 1]) {
      if (!ok(msgs[j]) || used.has(j)) continue;
      used.add(j);
      lines.push(`[${fmt(msgs[j].t)}] ${msgs[j].who}: ${MASK(msgs[j].text)}`);
    }
    out.push(lines.join('\n'));
  }
  return out.join('\n---\n');
}

// v2 digest (2026-11-11): labelled sections so the AI can build a profile of the relationship first (stage A),
// not only match wishes. Memory signals are what made the hand-made ליהיא ideas worth paying for (Shalom 1676).
const MEMORY = lb('זוכר את|זוכרת את|זוכר ש|זוכרת ש|זוכר כש|זוכרת כש|הפעם ש|כשהיינו|הכי יום|לא אשכח|בחיים לא אשכח');
const EMOTION = lb('גאה בך|גאה בעצמי|בכיתי|התרגשתי|מתרגשת|מתרגש|תודה על הכל|הכי טוב שקרה|החברה הכי טובה|החבר הכי טוב|הכי טובה שלי|הכי טובה שקרה|אתה הכי|את הכי|אין עליך');
const ROOTS = lb('מתגעגע|מתגעגעת|סבתא|סבא|ז"ל|נפטר|נפטרה|הייתה מכינה|היה מכין|הכלב שלנו|הכלבה שלנו|החתול שלנו|החתולה שלנו|כשהייתי קטן|כשהייתי קטנה|בילדות');
const CONSTRAINT = lb('שונא|שונאת|בלי הפתעות|בלי הפתעה|לא אוהב הפתעות|לא אוהבת הפתעות|לא רוצה מתנה|לא צריך מתנה|לא צריכה מתנה|אל תקנה|אל תקני|רק בלי|בבקשה בלי|אלרגי|אלרגית|טבעונ|צמחונ');
const FIRSTS = lb('דייט הראשון|הדייט הראשון|הפעם הראשונה|בפעם הראשונה|שנה בדיוק|שהכרנו|כשהכרנו|מהיום שהכרנו|שנה מהיום|שנים מהיום|שנתיים בדיוק|יום נישואין|יום השנה');
// Health and mental-health details are never gift material and never quoted.
const HEALTH = /(בדיקות|הבדיקה|בדיקה אצל|הרופא|הרופאה|לרופא|מחלה|בית חולים|בית החולים|אשפוז|אבחנה|סרטן|כימו|ניתוח|תרופות|פסיכולוג|פסיכיאטר|דיכאון|חרדה|הריון|הפלה)/;
const LAUGH = /ח{3,}|😂|🤣/;

// Inside words: tokens both people use, on ≥3 different days, often with laughter or as a greeting → nicknames / running jokes.
function insideWords(msgs, partner) {
  const STOP = new Set('אני את אתה זה לא כן מה של על עם גם אבל או אז רק כל יש אין הוא היא אנחנו לי לך שלי שלך היה הייתי יותר טוב עוד כבר אם כי איך למה מתי איפה פה שם ככה מאוד ממש סתם אוקיי אוקי באמת נו עכשיו היום מחר אתמול בוקר לילה תודה סבבה יאללה בדרך אוהבת אוהב נשמע קורה ראית ההודעה בעבודה גמורה ארוך איזה יום אוכלים תכף מתקשר בעצמך'.split(' '));
  const stat = {};
  for (const m of msgs) {
    if (MEDIA.test(m.text) || BLOCK.test(m.text) || HEALTH.test(m.text)) continue;
    const day = m.t.toDateString(), laugh = LAUGH.test(m.text);
    for (const w of new Set(m.text.split(/[^֐-׿a-zA-Z']+/))) {
      if (w.length < 3 || w.length > 9 || STOP.has(w) || /^ח+$/.test(w)) continue;
      const s = stat[w] || (stat[w] = { n: 0, days: new Set(), who: new Set(), laugh: 0, ex: null });
      s.n++; s.days.add(day); s.who.add(m.who === partner ? 'p' : 'u'); if (laugh) s.laugh++;
      if (!s.ex || laugh) s.ex = m;
    }
  }
  return Object.entries(stat)
    .filter(([, s]) => s.who.size === 2 && s.days.size >= 3 && s.n <= 80)
    .map(([w, s]) => [w, s, s.laugh / s.n + Math.min(s.days.size, 10) / 20])
    .sort((a, b) => b[2] - a[2]).slice(0, 8)
    .map(([w, s]) => `${w} (×${s.n}, ${s.days.size} ימים) — [${fmt(s.ex.t)}] ${s.ex.who}: ${MASK(s.ex.text)}`);
}

// Counts only (Shalom 2757): what the recipient keeps mentioning, as 'word ×N, D days'. No message text is sent.
// The model decides which of these are concrete, giftable things (a comb, headphones, the sea) and ignores verbs/feelings.
function repeated(msgs, partner, top = 30) {
  const STOP = new Set('אני את אתה זה לא כן מה של על עם גם אבל או אז רק כל יש אין הוא היא אנחנו לי לך שלי שלך היה הייתי יותר טוב עוד כבר אם כי איך למה מתי איפה פה שם ככה מאוד ממש סתם אוקיי אוקי באמת נו עכשיו היום מחר אתמול בוקר לילה תודה סבבה יאללה בדרך אוהבת אוהב נשמע קורה ראית ההודעה בעבודה איזה יום אוכלים תכף רוצה רוצים צריך צריכה יודע יודעת חושב חושבת אומרת אומר אמרתי עושה עושים הולך הולכת באלי שאני שאתה שזה כמו אחרי לפני הכל משהו מישהו דברים פעם שוב אחד אחת שני שתי הרבה קצת'.split(' '));
  const stat = {};
  for (const m of msgs) {
    if (m.who !== partner || MEDIA.test(m.text) || BLOCK.test(m.text) || HEALTH.test(m.text) || IDIOM.test(m.text)) continue;
    const day = m.t.toDateString();
    for (const w of new Set(m.text.split(/[^֐-׿a-zA-Z']+/))) {
      if (w.length < 3 || w.length > 10 || STOP.has(w) || /^ח+$/.test(w)) continue;
      const s = stat[w] || (stat[w] = { n: 0, days: new Set() });
      s.n++; s.days.add(day);
    }
  }
  return Object.entries(stat).filter(([, s]) => s.days.size >= 3)
    .sort((a, b) => b[1].n - a[1].n).slice(0, top)
    .map(([w, s]) => `${w} ×${s.n}, ב-${s.days.size} ימים שונים`);
}

// Parts: [{ sec, t }] so the page can list each snippet (and let the user remove it) and regroup by section on send.
export function digest2Parts(msgs, partner, perSection = 25) {
  const ok = (m) => m && clean(m) && !HEALTH.test(m.text) && !IDIOM.test(m.text);
  const sections = [
    ['מה לא לעשות: העדפות, איסורים, רגישויות (של הנמען)', (m) => m.who === partner && CONSTRAINT.test(m.text)],
    ['משאלות, מכשולים ודברים שנגמרו/נשברו (של הנמען)', (m) => m.who === partner && ((WISH.test(m.text) && !DULL.test(m.text)) || OBSTACLE.test(m.text))],
    ['הבטחות ו"יום אחד" (של שניהם)', (m) => PROMISE.test(m.text) || /הבטחת/.test(m.text)],
    ['זיכרונות משותפים', (m) => MEMORY.test(m.text)],
    ['רגעים רגשיים', (m) => EMOTION.test(m.text)],
    ['שורשים, משפחה, געגוע', (m) => ROOTS.test(m.text)],
    ['פעמים ראשונות ותאריכים', (m) => FIRSTS.test(m.text)],
    ['נושאים שהנמען מדבר עליהם', (m) => m.who === partner && TOPIC_RE.test(m.text)],
  ];
  const used = new Set(), out = [];
  for (const [sec, test] of sections) {
    let n = 0;
    for (let i = msgs.length - 1; i >= 0 && n < perSection; i--) {
      const m = msgs[i];
      if (used.has(i) || !ok(m) || m.text.split(/\s+/).length < 3 || !test(m)) continue;
      const lines = [];
      for (const j of [i - 1, i, i + 1]) {
        if (!ok(msgs[j]) || used.has(j)) continue;
        used.add(j);
        lines.push(`[${fmt(msgs[j].t)}] ${msgs[j].who}: ${MASK(msgs[j].text)}`);
      }
      out.push({ sec, t: lines.join('\n') }); n++;
    }
  }
  for (const t of insideWords(msgs, partner)) out.push({ sec: 'כינויים ובדיחות פנימיות (מילים ששניכם חוזרים עליהן)', t });
  for (const t of repeated(msgs, partner)) out.push({ sec: 'דברים שהנמען חוזר עליהם (ספירה בלבד, בלי הודעות)', t });
  return out;
}
export function joinParts(parts) {
  const by = new Map();
  for (const p of parts) (by.get(p.sec) || by.set(p.sec, []).get(p.sec)).push(p.t);
  return [...by].map(([sec, ts]) => `## ${sec}\n` + ts.join('\n---\n')).join('\n\n');
}
export const digest2 = (msgs, partner, perSection) => joinParts(digest2Parts(msgs, partner, perSection));
