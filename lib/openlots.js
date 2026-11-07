'use strict';
// "Tugallanmagan savdolar": hali yakunlanmagan lotlar (xarid.uzex.uz "Tushgan takliflar" jadvali)
const express = require('express');
const prodmap = require('./prodmap');
const { aliasKey } = require('./names');

const TZ_NOW = "(now() AT TIME ZONE 'Asia/Tashkent')";
const SORTS = { ends_at: 'ends_at', starts_at: 'starts_at', product: 'product', start_price: 'start_price', my_price: 'my_price', total: 'start_price*quantity' };
const txt = v => { const s = v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); return s || null; };

function filter(q) {
  const w = [], a = [];
  if (q.q) { w.push('(product ILIKE ? OR product_raw ILIKE ? OR lot_no ILIKE ? OR tovar_no ILIKE ?)'); const s = `%${q.q}%`; a.push(s, s, s, s); }
  if (q.product) { w.push('product = ?'); a.push(q.product); }
  if (q.matched === '0') w.push('NOT EXISTS (SELECT 1 FROM exchange_products e WHERE lower(e.name)=lower(open_lots.product))');
  if (q.state === 'active') w.push(`ends_at >= ${TZ_NOW}`);
  if (q.state === 'ended') w.push(`ends_at < ${TZ_NOW}`);
  if (q.from) { w.push('starts_at::date >= ?'); a.push(q.from); }
  if (q.to) { w.push('starts_at::date <= ?'); a.push(q.to); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', args: a };
}

module.exports = ({ db, ah, writer, P, upload }) => {
  const r = express.Router();
  const COLS = `*, start_price*quantity AS total, ends_at >= ${TZ_NOW} AS active,
    EXISTS (SELECT 1 FROM exchange_products e WHERE lower(e.name)=lower(open_lots.product)) AS matched`;

  r.get('/', ah(async (req, res) => {
    const { where, args } = filter(req.query);
    const page = Math.max(1, +req.query.page || 1), limit = Math.min(200, +req.query.limit || 50);
    const sort = SORTS[req.query.sort] || 'ends_at', dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
    const [{ c: total }, sum] = await Promise.all([db.get(`SELECT COUNT(*)::int c FROM open_lots ${where}`, args),
      db.get(`SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE ends_at >= ${TZ_NOW})::int active,
        COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM exchange_products e WHERE lower(e.name)=lower(open_lots.product)))::int unmatched FROM open_lots`)]);
    const rows = await db.all(`SELECT ${COLS} FROM open_lots ${where} ORDER BY ${sort} ${dir} NULLS LAST, id DESC LIMIT ? OFFSET ?`, [...args, limit, (page - 1) * limit]);
    res.json({ total, page, limit, rows, summary: sum });
  }));
  r.get('/template', (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="tugallanmagan_savdolar_shablon.xlsx"');
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(P.openLotsTemplateBuffer());
  });

  // Excel/CSV import: lot raqami bo'yicha qo'shiladi yoki yangilanadi; mahsulot nomi nomenklaturaga bog'lanadi
  r.post('/import', writer, upload.single('file'), ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Fayl tanlanmagan' });
    let parsed;
    try { parsed = P.parseOpenLotsWorkbook(req.file.buffer); } catch (e) { return res.status(400).json({ error: 'Faylni o\'qib bo\'lmadi: ' + e.message }); }
    if (parsed.errors.length && !parsed.rows.length) return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
    const m = await prodmap.load(db);
    let ins = 0, upd = 0; const unmatched = new Set();
    await db.tx(async t => {
      for (const x of parsed.rows) {
        const c = prodmap.canon(m, x.product); if (!c.matched) unmatched.add(x.product);
        const o = await t.run(`INSERT INTO open_lots (lot_no,tovar_no,product,product_raw,starts_at,ends_at,quantity,start_price,my_price) VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT (lot_no) DO UPDATE SET tovar_no=COALESCE(EXCLUDED.tovar_no,open_lots.tovar_no), product=EXCLUDED.product, product_raw=EXCLUDED.product_raw,
          starts_at=COALESCE(EXCLUDED.starts_at,open_lots.starts_at), ends_at=COALESCE(EXCLUDED.ends_at,open_lots.ends_at), quantity=COALESCE(EXCLUDED.quantity,open_lots.quantity),
          start_price=COALESCE(EXCLUDED.start_price,open_lots.start_price), my_price=COALESCE(EXCLUDED.my_price,open_lots.my_price) RETURNING (xmax = 0) AS inserted`,
          [x.lot_no, x.tovar_no, c.name, x.product, x.starts_at, x.ends_at, x.quantity, x.start_price, x.my_price]);
        o.rows[0].inserted ? ins++ : upd++;
      }
    });
    res.json({ inserted: ins, updated: upd, skipped: parsed.skipped, errors: parsed.errors.slice(0, 20), unmatched: [...unmatched].slice(0, 30) });
  }));

  // Qo'lda tahrirlash: taklif narxi, soni, narxlar, mahsulot
  r.put('/:id', writer, ah(async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0, b = req.body || {};
    const num = v => { const s = txt(v); if (s === null) return null; const n = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : NaN; };
    const q = num(b.quantity), sp = num(b.start_price), mp = num(b.my_price);
    if ([q, sp, mp].some(Number.isNaN)) return res.status(400).json({ error: 'Son yoki narxda xato' });
    const product = txt(b.product); if (!product) return res.status(400).json({ error: 'Mahsulot nomi kerak' });
    const r1 = await db.run('UPDATE open_lots SET product=?, quantity=?, start_price=?, my_price=? WHERE id=?', [product, q, sp, mp, id]);
    if (!r1.changes) return res.status(404).json({ error: 'Lot topilmadi' });
    res.json({ ok: true });
  }));
  r.delete('/:id', writer, ah(async (req, res) => { await db.run('DELETE FROM open_lots WHERE id=?', [parseInt(req.params.id, 10) || 0]); res.json({ ok: true }); }));
  r.post('/delete', writer, ah(async (req, res) => {
    const ids = [...new Set((Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 5000);
    if (!ids.length) return res.status(400).json({ error: 'Lot tanlanmagan' });
    res.json({ deleted: (await db.run('DELETE FROM open_lots WHERE id = ANY(?::int[])', [ids])).changes });
  }));
  // Saytdagi nomni (raw) nomenklaturadagi nomga bog'lash: shu nomli hamma lotlar yangilanadi, keyingi importlarda o'zi almashtiriladi
  r.post('/map-product', writer, ah(async (req, res) => {
    const raw = txt((req.body || {}).raw), target = txt((req.body || {}).target), add = !!(req.body || {}).add;
    if (!raw || !target) return res.status(400).json({ error: 'Nom va mahsulot kerak' });
    const out = await db.tx(async t => {
      let name = target;
      const ex = await t.get('SELECT name FROM exchange_products WHERE lower(name)=lower(?)', [target]);
      if (ex) name = ex.name;
      else if (add) await t.run('INSERT INTO exchange_products(name) VALUES (?) ON CONFLICT DO NOTHING', [target]);
      else return null;
      if (aliasKey(raw) !== aliasKey(name)) await t.run('INSERT INTO product_aliases(alias_key, canonical) VALUES (?,?) ON CONFLICT (alias_key) DO UPDATE SET canonical=EXCLUDED.canonical', [aliasKey(raw), name]);
      const n = (await t.run('UPDATE open_lots SET product=? WHERE lower(product_raw)=lower(?) OR lower(product)=lower(?)', [name, raw, raw])).changes;
      return { name, updated: n };
    });
    if (!out) return res.status(400).json({ error: 'Bu nom «Birja mahsulotlari» ro\'yxatida yo\'q' });
    res.json(out);
  }));
  return r;
};
