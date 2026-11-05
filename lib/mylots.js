// "Mening lotlarim" moduli: o'zimiz ishtirok etgan lotlar, natijalari, shartnoma PDF lari va o'tkazmalar
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads', 'my-lots'));
const STATUSES = ['new', 'won', 'lost', 'rejected'];
const TRANSFER = ['pending', 'paid'];
const COLS = ['lot_no', 'product_no', 'product', 'brand', 'quantity', 'specs', 'start_price', 'starts_at', 'ends_at', 'status', 'reject_reason',
  'our_bid', 'win_price', 'winner_name', 'contract_no', 'contract_date', 'amount_due', 'transfer_status', 'transferred_at', 'notes'];
const SORTS = { starts_at: 'l.starts_at', ends_at: 'l.ends_at', start_price: 'l.start_price', amount_due: 'l.amount_due', created: 'l.id' };

const txt = v => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const num = v => { const t = txt(v); if (t === null) return null; const n = parseFloat(t.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const dt = v => { const t = txt(v); return t && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(t) ? t.replace('T', ' ').slice(0, 16) : null; };
const day = v => { const t = txt(v); return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null; };
const today = () => new Date().toISOString().slice(0, 10);

// kiruvchi ma'lumotni tozalab, bazaga mos qiymatlar ro'yxatini qaytaradi
function clean(b) {
  const status = STATUSES.includes(b.status) ? b.status : 'new';
  const transfer = TRANSFER.includes(b.transfer_status) ? b.transfer_status : 'pending';
  let tdate = day(b.transferred_at);
  if (transfer !== 'paid') tdate = null; else if (!tdate) tdate = today();
  return {
    lot_no: txt(b.lot_no), product_no: txt(b.product_no), product: txt(b.product), brand: txt(b.brand), quantity: num(b.quantity), specs: txt(b.specs),
    start_price: num(b.start_price), starts_at: dt(b.starts_at), ends_at: dt(b.ends_at), status, reject_reason: txt(b.reject_reason),
    our_bid: num(b.our_bid), win_price: num(b.win_price), winner_name: txt(b.winner_name), contract_no: txt(b.contract_no),
    contract_date: day(b.contract_date), amount_due: num(b.amount_due), transfer_status: transfer, transferred_at: tdate, notes: txt(b.notes),
  };
}

// multer fayl nomini latin1 deb o'qiydi; UTF-8 ga qaytaramiz
function fixName(n) {
  try { const u = Buffer.from(n, 'latin1').toString('utf8'); return u.includes('�') ? n : u; } catch { return n; }
}

module.exports = ({ db, ah, writer, P }) => {
  const r = express.Router();
  const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
  const pdfUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); cb(null, UPLOAD_DIR); },
      filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + '.pdf'),
    }),
    limits: { fileSize: 20 * 1024 * 1024, files: 10 },
    fileFilter: (req, file, cb) => (/pdf/i.test(file.mimetype) || /\.pdf$/i.test(file.originalname)) ? cb(null, true) : cb(new Error('Faqat PDF fayl yuklash mumkin')),
  });
  const rm = name => fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => { });

  /* ---- ro'yxat, hisob-kitoblar ---- */
  const filter = q => {
    const w = [], a = [];
    if (STATUSES.includes(q.status)) { w.push('l.status=?'); a.push(q.status); }
    if (TRANSFER.includes(q.transfer)) { w.push('l.transfer_status=?'); a.push(q.transfer); }
    if (q.q) { const s = `%${q.q}%`; w.push('(l.product ILIKE ? OR l.brand ILIKE ? OR l.lot_no ILIKE ? OR l.product_no ILIKE ? OR l.contract_no ILIKE ?)'); a.push(s, s, s, s, s); }
    return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', a };
  };
  r.get('/', ah(async (req, res) => {
    const { where, a } = filter(req.query);
    const page = Math.max(1, +req.query.page || 1), limit = Math.min(200, +req.query.limit || 50);
    const sort = SORTS[req.query.sort] || 'l.starts_at', dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
    const total = (await db.get(`SELECT COUNT(*) c FROM my_lots l ${where}`, a)).c;
    const rows = await db.all(`SELECT l.*, (SELECT COUNT(*) FROM my_lot_files f WHERE f.lot_id=l.id)::int AS files_count FROM my_lots l ${where}
      ORDER BY ${sort} ${dir} NULLS LAST, l.id DESC LIMIT ? OFFSET ?`, [...a, limit, (page - 1) * limit]);
    res.json({ total, page, limit, rows });
  }));

  r.get('/counts', ah(async (req, res) => {
    const out = { new: 0, won: 0, lost: 0, rejected: 0 };
    for (const x of await db.all('SELECT status, COUNT(*)::int n FROM my_lots GROUP BY status')) out[x.status] = x.n;
    res.json(out);
  }));

  r.get('/stats', ah(async (req, res) => {
    const s = await db.get(`SELECT
      COUNT(*) FILTER (WHERE status='new')::int n_new, COUNT(*) FILTER (WHERE status='won')::int n_won,
      COUNT(*) FILTER (WHERE status='lost')::int n_lost, COUNT(*) FILTER (WHERE status='rejected')::int n_rejected,
      COALESCE(SUM(amount_due) FILTER (WHERE status='won'),0) due_total,
      COALESCE(SUM(amount_due) FILTER (WHERE status='won' AND transfer_status='paid'),0) paid_total,
      COUNT(*) FILTER (WHERE status='won' AND transfer_status<>'paid')::int unpaid_n,
      COALESCE(SUM(win_price*COALESCE(quantity,1)) FILTER (WHERE status='won'),0) won_turnover,
      COUNT(*) FILTER (WHERE status='new' AND ends_at BETWEEN localtimestamp AND localtimestamp + interval '24 hours')::int ending_soon
      FROM my_lots`);
    s.win_rate = s.n_won + s.n_lost ? +(s.n_won * 100 / (s.n_won + s.n_lost)).toFixed(1) : null;
    res.json(s);
  }));


  /* ---- Excel'ga export (joriy bo'lim va filtrlar bo'yicha, sahifalashsiz) ---- */
  const ST_UZ = { new: 'Yangi', won: "G'olib bo'lingan", lost: 'Yutqazilgan', rejected: 'Rad etilgan' };
  const TR_UZ = { pending: "O'tkazilmagan", paid: "O'tkazildi" };
  const fdt = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); return m ? `${m[3]}.${m[2]}.${m[1]}${m[4] ? ' ' + m[4] + ':' + m[5] : ''}` : ''; };
  const COMMON = [['№', null], ['Tovar №', x => x.product_no], ['Lot №', x => x.lot_no], ['Tovar nomi', x => x.product], ['Markasi', x => x.brand],
    ['Miqdori', x => x.quantity, 'n'], ['Xususiyatlari', x => x.specs], ["Boshlang'ich narxi (so'm)", x => x.start_price, 'n'],
    ['Boshlanish sanasi', x => fdt(x.starts_at)], ['Tugash sanasi', x => fdt(x.ends_at)]];
  const BY_STATUS = {
    new: [['Status', x => ST_UZ[x.status]], ['Izoh', x => x.notes]],
    won: [['Yakuniy narx (so\'m)', x => x.win_price, 'n'], ['Shartnoma raqami', x => x.contract_no], ['Shartnoma sanasi', x => fdt(x.contract_date)],
      ['Shartnoma PDF soni', x => x.files_count, 'n'], ["O'tkazib berilishi kerak summa (so'm)", x => x.amount_due, 'n', true], ["O'tkazma holati", x => TR_UZ[x.transfer_status]],
      ["O'tkazilgan sana", x => fdt(x.transferred_at)], ['Izoh', x => x.notes]],
    lost: [['Bizning taklif narxi (so\'m)', x => x.our_bid, 'n'], ["G'olib narxi (so'm)", x => x.win_price, 'n'], ["G'olib kompaniya", x => x.winner_name],
      ['Farq (so\'m)', x => (x.our_bid != null && x.win_price != null ? x.our_bid - x.win_price : null), 'n'], ['Izoh', x => x.notes]],
    rejected: [['Rad etish sababi', x => x.reject_reason], ['Izoh', x => x.notes]],
  };
  r.get('/export', ah(async (req, res) => {
    const status = STATUSES.includes(req.query.status) ? req.query.status : null;
    const { where, a } = filter({ ...req.query, status });
    const rows = await db.all(`SELECT l.*, (SELECT COUNT(*) FROM my_lot_files f WHERE f.lot_id=l.id)::int AS files_count FROM my_lots l ${where}
      ORDER BY l.starts_at DESC NULLS LAST, l.id DESC LIMIT 20000`, a);
    // status tanlanmasa hamma holat uchun umumiy ustunlar + Status
    const cols = [...COMMON, ...(status ? BY_STATUS[status] : [['Status', x => ST_UZ[x.status]], ['Yakuniy narx (so\'m)', x => x.win_price, 'n'], ["O'tkazib berilishi kerak summa (so'm)", x => x.amount_due, 'n', true], ["O'tkazma holati", x => (x.status === 'won' ? TR_UZ[x.transfer_status] : '')], ['Izoh', x => x.notes]])];
    const aoa = [cols.map(c => c[0])];
    rows.forEach((x, i) => aoa.push(cols.map(c => (c[1] ? (c[1](x) ?? '') : i + 1))));
    const sumCol = cols.findIndex(c => c[3]);                       // summa ustuni bo'yicha "Jami" qatori
    if (sumCol >= 0 && rows.length) {
      const tot = cols.map(() => ''); tot[3] = 'JAMI';
      tot[sumCol] = rows.reduce((s, x) => s + (cols[sumCol][1](x) || 0), 0);
      aoa.push(tot);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    cols.forEach((c, ci) => { if (c[2] === 'n') for (let ri = 1; ri < aoa.length; ri++) { const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })]; if (cell && cell.t === 'n') cell.z = '#,##0.##'; } });
    ws['!cols'] = cols.map((c, ci) => ({ wch: Math.min(40, Math.max(c[0].length + 2, ...aoa.slice(1, 200).map(row => String(row[ci] ?? '').length + 2))) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }; ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (status ? ST_UZ[status] : 'Hammasi').replace(/'/g, ''));
    const name = `mening_lotlarim_${status || 'hammasi'}_${today()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }));

  /* ---- Excel import / shablon ---- */
  r.get('/template', (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="mening_lotlarim_shablon.xlsx"');
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(P.myLotsTemplateBuffer());
  });
  r.post('/import', writer, memUpload.single('file'), ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Fayl tanlanmagan' });
    let parsed;
    try { parsed = P.parseMyLotsWorkbook(req.file.buffer); } catch (e) { return res.status(400).json({ error: 'Faylni o\'qib bo\'lmadi: ' + e.message }); }
    if (parsed.errors.length && !parsed.rows.length) return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
    let ins = 0, upd = 0;
    // mavjud lotni qayta import qilganda qo'lda kiritilgan ma'lumotlar (summa, shartnoma, o'tkazma) saqlanadi;
    // import "Yangi" desa, qo'lda belgilangan G'olib/Yutqazilgan holati pasaytirilmaydi
    await db.tx(async t => {
      for (const x of parsed.rows) {
        const o = await t.run(`INSERT INTO my_lots (lot_no,product_no,product,brand,quantity,specs,start_price,starts_at,ends_at,status,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT (lot_no) DO UPDATE SET product_no=EXCLUDED.product_no, product=EXCLUDED.product, brand=EXCLUDED.brand, quantity=EXCLUDED.quantity,
            specs=EXCLUDED.specs, start_price=EXCLUDED.start_price, starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
            status=CASE WHEN EXCLUDED.status='new' THEN my_lots.status ELSE EXCLUDED.status END, updated_at=now()
          RETURNING (xmax = 0) AS inserted`,
          [x.lot_no, x.product_no, x.product, x.brand, x.quantity, x.specs, x.start_price, x.starts_at, x.ends_at, x.status, req.user.id]);
        o.rows[0].inserted ? ins++ : upd++;
      }
    });
    res.json({ inserted: ins, updated: upd, skipped: parsed.skipped, errors: parsed.errors.slice(0, 20) });
  }));

  /* ---- PDF fayllarni olish / o'chirish ---- */
  r.get('/files/:fid', ah(async (req, res) => {
    const f = await db.get('SELECT * FROM my_lot_files WHERE id=?', [parseInt(req.params.fid, 10) || 0]);
    if (!f) return res.status(404).json({ error: 'Fayl topilmadi' });
    const file = path.join(UPLOAD_DIR, path.basename(f.stored_name));
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Fayl serverda topilmadi' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
    fs.createReadStream(file).pipe(res);
  }));
  r.delete('/files/:fid', writer, ah(async (req, res) => {
    const f = await db.get('DELETE FROM my_lot_files WHERE id=? RETURNING stored_name', [parseInt(req.params.fid, 10) || 0]);
    if (f) await rm(f.stored_name);
    res.json({ ok: true });
  }));

  /* ---- bitta lot ---- */
  const one = async id => {
    const l = await db.get('SELECT * FROM my_lots WHERE id=?', [id]);
    if (l) l.files = await db.all('SELECT id,original_name,size,uploaded_at FROM my_lot_files WHERE lot_id=? ORDER BY id', [id]);
    return l;
  };
  r.get('/:id', ah(async (req, res) => {
    const l = await one(parseInt(req.params.id, 10) || 0);
    l ? res.json(l) : res.status(404).json({ error: 'Lot topilmadi' });
  }));

  const dup = (e, res) => { if (e.code === '23505') { res.status(400).json({ error: 'Bu lot raqami allaqachon kiritilgan' }); return true; } return false; };
  r.post('/', writer, ah(async (req, res) => {
    const c = clean(req.body || {});
    if (!c.lot_no || !c.product) return res.status(400).json({ error: 'Lot raqami va tovar nomi kerak' });
    try {
      const x = await db.get(`INSERT INTO my_lots(${COLS.join(',')},created_by) VALUES (${COLS.map(() => '?').join(',')},?) RETURNING id`,
        [...COLS.map(k => c[k]), req.user.id]);
      res.json({ id: x.id });
    } catch (e) { if (!dup(e, res)) throw e; }
  }));
  // PUT: to'liq forma; PATCH: qisman (status, o'tkazma dropdowni) — ikkalasi ham mavjud qiymat ustiga yoziladi
  const save = ah(async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const cur = await db.get('SELECT * FROM my_lots WHERE id=?', [id]);
    if (!cur) return res.status(404).json({ error: 'Lot topilmadi' });
    const c = clean({ ...cur, ...(req.body || {}) });
    if (!c.lot_no || !c.product) return res.status(400).json({ error: 'Lot raqami va tovar nomi kerak' });
    try {
      await db.run(`UPDATE my_lots SET ${COLS.map(k => k + '=?').join(',')}, updated_at=now() WHERE id=?`, [...COLS.map(k => c[k]), id]);
      res.json({ ok: true });
    } catch (e) { if (!dup(e, res)) throw e; }
  });
  r.put('/:id', writer, save);
  r.patch('/:id', writer, save);
  r.delete('/:id', writer, ah(async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const files = await db.all('SELECT stored_name FROM my_lot_files WHERE lot_id=?', [id]);
    await db.run('DELETE FROM my_lots WHERE id=?', [id]);
    await Promise.all(files.map(f => rm(f.stored_name)));
    res.json({ ok: true });
  }));

  /* ---- shartnoma PDF yuklash ---- */
  r.post('/:id/files', writer, (req, res, next) => {
    pdfUpload.array('files', 10)(req, res, err => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fayl 20 MB dan oshmasligi kerak' : err.message });
      next();
    });
  }, ah(async (req, res) => {
    const files = req.files || [];
    const id = parseInt(req.params.id, 10) || 0;
    if (!(await db.get('SELECT id FROM my_lots WHERE id=?', [id]))) { await Promise.all(files.map(f => rm(f.filename))); return res.status(404).json({ error: 'Lot topilmadi' }); }
    if (!files.length) return res.status(400).json({ error: 'Fayl tanlanmagan' });
    let added = 0; const bad = [];
    for (const f of files) {
      const head = Buffer.alloc(5);
      const fd = await fs.promises.open(f.path, 'r');
      try { await fd.read(head, 0, 5, 0); } finally { await fd.close(); }
      if (head.toString('latin1') !== '%PDF-') { bad.push(fixName(f.originalname)); await rm(f.filename); continue; }   // kengaytmasi PDF, mazmuni emas
      await db.run('INSERT INTO my_lot_files(lot_id,original_name,stored_name,size) VALUES (?,?,?,?)', [id, fixName(f.originalname), f.filename, f.size]);
      added++;
    }
    res.json({ added, rejected: bad });
  }));

  return r;
};
