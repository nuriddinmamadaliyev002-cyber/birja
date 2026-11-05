// "Mahsulotlarimiz" jadvalini Excel'ga export qilish: ustunlarni tanlash va tanlovni doimiy saqlash (user_prefs)
const express = require('express');
const XLSX = require('xlsx');

const PREF_KEY = 'products_export_cols';
const r2 = v => (v == null ? null : Math.round(v * 100) / 100);
// [kalit, sarlavha, qiymat funksiyasi, format: n = son, p = foiz, k = koeffitsiyent]
const COLS = [
  ['no', '№', null],
  ['category', 'Toifa', p => p.category],
  ['name', 'Nomi', p => p.name],
  ['unit', 'Birlik', p => p.unit],
  ['pack_kg', 'Qadoq (kg/l)', p => p.pack_kg, 'n'],
  ['cost', "Tan narx (1 birlik, so'm)", p => p.cost, 'n'],
  ['cost_kg', "1 kg tan narx (so'm)", p => (p.pack_kg && p.cost != null ? r2(p.cost / p.pack_kg) : null), 'n'],
  ['price', "Sotuv narxi (so'm)", p => p.price, 'n'],
  ['margin', 'Marja (%)', p => (p.cost != null && p.price ? Math.round((p.price - p.cost) * 1000 / p.price) / 10 : null), 'p'],
  ['store_price', "Milliy do'kon narxi (so'm)", p => (p.price ? r2(p.price * (p.store_markup || 1.4)) : null), 'n'],
  ['store_markup', "Milliy do'kon koeffitsiyenti", p => p.store_markup, 'k'],
  ['cert_fee', "Sertifikat to'lovi (so'm)", p => p.cert_fee, 'n'],
  ['keywords', "Kalit so'zlar", p => p.keywords],
];
const FMT = { n: '#,##0.##', p: '0.0', k: '0.00' };
const today = () => new Date().toISOString().slice(0, 10);

module.exports = ({ db, ah }) => {
  const r = express.Router();

  const saved = async userId => {
    const row = await db.get('SELECT value FROM user_prefs WHERE user_id=? AND key=?', [userId, PREF_KEY]);
    if (!row) return null;
    try { const v = JSON.parse(row.value); return Array.isArray(v) ? v.filter(k => COLS.some(c => c[0] === k)) : null; } catch { return null; }
  };

  r.get('/columns', ah(async (req, res) => {
    const s = await saved(req.user.id);
    res.json({ columns: COLS.map(c => ({ key: c[0], label: c[1] })), saved: s && s.length ? s : null });
  }));
  r.put('/columns', ah(async (req, res) => {
    const picked = Array.isArray((req.body || {}).cols) ? req.body.cols.filter(k => COLS.some(c => c[0] === k)) : [];
    if (!picked.length) return res.status(400).json({ error: 'Kamida bitta ustun tanlang' });
    await db.run('INSERT INTO user_prefs(user_id,key,value) VALUES (?,?,?) ON CONFLICT (user_id,key) DO UPDATE SET value=EXCLUDED.value',
      [req.user.id, PREF_KEY, JSON.stringify(picked)]);
    res.json({ ok: true });
  }));
  r.delete('/columns', ah(async (req, res) => {
    await db.run('DELETE FROM user_prefs WHERE user_id=? AND key=?', [req.user.id, PREF_KEY]);
    res.json({ ok: true });
  }));

  // ?cols=a,b,c bo'lsa shular; bo'lmasa saqlangan tanlov; u ham bo'lmasa hamma ustun. Tartib doim asl tartibda.
  r.get('/', ah(async (req, res) => {
    const rows = await db.all('SELECT * FROM products ORDER BY id');
    let want = req.query.cols ? String(req.query.cols).split(',').map(s => s.trim()).filter(Boolean) : null;
    if (!want || !want.some(k => COLS.some(c => c[0] === k))) want = await saved(req.user.id);
    let cols = want && want.length ? COLS.filter(c => want.includes(c[0])) : COLS;
    if (!cols.length) cols = COLS;
    const aoa = [cols.map(c => c[1])];
    rows.forEach((x, i) => aoa.push(cols.map(c => (c[2] ? (c[2](x) ?? '') : i + 1))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    cols.forEach((c, ci) => { if (c[3]) for (let ri = 1; ri < aoa.length; ri++) { const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })]; if (cell && cell.t === 'n') cell.z = FMT[c[3]]; } });
    ws['!cols'] = cols.map((c, ci) => ({ wch: Math.min(40, Math.max(c[1].length + 2, ...aoa.slice(1, 200).map(row => String(row[ci] ?? '').length + 2))) }));
    ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mahsulotlar');
    res.setHeader('Content-Disposition', `attachment; filename="mahsulotlarimiz_${today()}.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }));

  return r;
};
