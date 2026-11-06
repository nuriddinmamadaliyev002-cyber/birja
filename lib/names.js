'use strict';
// Korxona nomlarini solishtirish: bir korxona biroz boshqacha yozilgan nusxalarini topish uchun.

// Tashkiliy-huquqiy shakllar: nom taqqoslanganda e'tiborga olinmaydi ("ABC MCHJ" = "ABC")
const LEGAL = new Set(['mchj', 'xk', 'aj', 'oaj', 'qk', 'ooo', 'ytt', 'yatt', 'ip', 'llc', 'ltd', 'gup', 'fx',
  'ооо', 'ип', 'ао', 'мчж', 'хк', 'ятт', 'ytt.', 'yatt.']);
const QUOTES = /['"`´‘’ʻʼ′“”«»„]/g;

// Saqlanadigan alias kaliti: faqat bo'shliq va katta-kichik harf farqi yo'qoladi (import paytida aniq moslash uchun)
const aliasKey = s => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

// Taqqoslash kaliti: tirnoq/apostrof, tinish belgilari va shakl (MCHJ, XK...) e'tiborga olinmaydi.
// sorted=true: so'zlar tartibi ham e'tiborga olinmaydi (aniq moslik uchun); false: asl tartib (taxminiy qidiruv uchun:
// bitta so'zdagi xato alifbo tartibini buzib yubormasligi kerak)
function nameKey(s, sorted = true) {
  const toks = String(s ?? '').normalize('NFKC').toLowerCase().replace(QUOTES, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean);
  const core = toks.filter(t => !LEGAL.has(t)), use = core.length ? core : toks;
  return (sorted ? [...use].sort() : use).join(' ');
}

// Chegaralangan Levenshtein masofasi: max dan oshsa max+1 qaytaradi
function lev(a, b, max) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i; let rowMin = i; const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1));
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}
// ruxsat etilgan xatolar soni: qisqa nomlarda deyarli yo'q, uzunlarida 3 tagacha
const thr = len => (len < 6 ? 0 : len < 12 ? 1 : len < 24 ? 2 : 3);
const digits = k => k.replace(/\D+/g, '');
const FUZZY_MAX = 6000;   // bundan ko'p turli nom bo'lsa, faqat aniq mosliklar qidiriladi (tezlik uchun)

/* items: [{ name, lots, ... }] -> { fuzzy, groups: [{ exact, lots, items: [...] }] }
   exact: nomlar faqat yozilishi (harf, tirnoq, shakl, so'z tartibi) bilan farq qiladi; aks holda taxminiy (1-3 harf farqi). */
function findSimilar(items) {
  const n = items.length, parent = Array.from({ length: n }, (_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };

  const keyOf = items.map(it => nameKey(it.name));
  const byKey = new Map();
  keyOf.forEach((k, i) => { if (!k) return; if (byKey.has(k)) union(byKey.get(k), i); else byKey.set(k, i); });

  // taxminiy qidiruv asl so'z tartibidagi kalitlar ustida (bir xil kalitli nomlar yuqorida allaqachon birlashgan)
  const ordOf = items.map(it => nameKey(it.name, false)), byOrd = new Map();
  ordOf.forEach((k, i) => { if (k && !byOrd.has(k)) byOrd.set(k, i); });
  const keys = [...byOrd.keys()], fuzzy = keys.length <= FUZZY_MAX;
  if (fuzzy) {
    // 3 harfli bo'laklar (trigram) bo'yicha nomzodlar: q-gram lemmasiga ko'ra yaqin satrlar ko'p bo'lak ulashadi
    const post = new Map(), grams = keys.map((k, i) => {
      const g = new Set(); for (let p = 0; p + 3 <= k.length; p++) g.add(k.substr(p, 3));
      g.forEach(x => { const a = post.get(x); if (a) a.push(i); else post.set(x, [i]); });
      return g;
    });
    for (let i = 0; i < keys.length; i++) {
      const cnt = new Map();
      grams[i].forEach(g => { for (const j of post.get(g)) if (j > i) cnt.set(j, (cnt.get(j) || 0) + 1); });
      const ki = keys[i], di = digits(ki);
      for (const [j, c] of cnt) {
        const kj = keys[j], la = ki.length, lb = kj.length, t = thr(Math.min(la, lb));
        if (!t || Math.abs(la - lb) > t || c < Math.max(1, Math.max(la, lb) - 2 - 3 * t - 2)) continue;
        if (digits(kj) !== di) continue;                 // "Stroy 1" va "Stroy 2" boshqa korxonalar
        if (lev(ki, kj, t) <= t) union(byOrd.get(ki), byOrd.get(kj));
      }
    }
  }
  const buckets = new Map();
  items.forEach((it, i) => { if (!keyOf[i]) return; const r = find(i); (buckets.get(r) || buckets.set(r, []).get(r)).push(i); });
  const groups = [];
  for (const idx of buckets.values()) {
    if (idx.length < 2) continue;
    const its = idx.map(i => items[i]).sort((a, b) => (b.lots || 0) - (a.lots || 0) || String(a.name).localeCompare(String(b.name)));
    groups.push({ exact: new Set(idx.map(i => keyOf[i])).size === 1, lots: its.reduce((s, x) => s + (x.lots || 0), 0), items: its });
  }
  groups.sort((a, b) => (b.exact - a.exact) || b.lots - a.lots);
  return { fuzzy, groups };
}

module.exports = { aliasKey, nameKey, lev, findSimilar };
