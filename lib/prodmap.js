'use strict';
// Mahsulot nomlarini "Birja mahsulotlari" nomenklaturasidagi asosiy nomga bog'lash
const { aliasKey, nameKey } = require('./names');

// "LED panel markasi: MARTSEL" -> "LED panel"; qavs ichidagi izohlar solishtirishda tashlab yuboriladi
const strip = s => String(s ?? '').replace(/\s*markasi\s*:?[\s\S]*$/i, '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

async function load(db) {
  const [al, ex] = await Promise.all([db.all('SELECT alias_key, canonical FROM product_aliases'), db.all('SELECT name FROM exchange_products')]);
  const m = { alias: new Map(al.map(r => [r.alias_key, r.canonical])), lower: new Map(), key: new Map() };
  for (const e of ex) { m.lower.set(aliasKey(e.name), e.name); const k = nameKey(strip(e.name), false); if (k && !m.key.has(k)) m.key.set(k, e.name); }
  return m;
}
// { name, matched }: matched = nomenklaturadagi nomga bog'landi
function canon(m, raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return { name: s, matched: false };
  const a = m.alias.get(aliasKey(s)); if (a) return { name: a, matched: true };
  const e = m.lower.get(aliasKey(s)); if (e) return { name: e, matched: true };
  const k = nameKey(strip(s), false), f = k && m.key.get(k); if (f) return { name: f, matched: true };
  return { name: s, matched: false };
}
module.exports = { load, canon, strip };
