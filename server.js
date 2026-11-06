const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, init, ensureAdmin } = require('./lib/db');
const P = require('./lib/parse');

const app = express();
app.set('trust proxy', 2);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
/* ---------- frontend keshi ----------
   index.html har doim yangidan olinadi (no-cache), unda app.js / style.css ga fayl mazmunidan hisoblangan ?v=hash qo'shiladi.
   Fayl o'zgarsa hash o'zgaradi -> brauzer va Cloudflare yangi URL ni so'raydi. ?v= li fayllar 1 yil keshlanadi. */
const PUB = path.join(__dirname, 'public');
const VENDOR = path.join(__dirname, 'node_modules/chart.js/dist');
const md5 = file => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
let indexCache = { sig: '', html: '' };
function indexHtml() {
  const files = ['index.html', 'app.js', 'style.css'].map(f => path.join(PUB, f));
  const sig = files.map(f => fs.statSync(f).mtimeMs).join('|');       // fayl o'zgarganda qayta hisoblanadi
  if (sig !== indexCache.sig) {
    const html = fs.readFileSync(files[0], 'utf8').replace(/(href|src)="\/(style\.css|app\.js)"/g,
      (m, attr, f) => `${attr}="/${f}?v=${md5(path.join(PUB, f))}"`)
      .replace('/vendor/chart.umd.js', `/vendor/chart.umd.js?v=${md5(path.join(VENDOR, 'chart.umd.js'))}`);
    indexCache = { sig, html };
  }
  return indexCache.html;
}
const cacheHeaders = (req, res, next) => {
  if (/\.(js|css|html)$/.test(req.path) || req.path === '/')
    res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
  next();
};
app.get(['/', '/index.html'], (req, res) => res.set('Cache-Control', 'no-cache').type('html').send(indexHtml()));
app.use(cacheHeaders);
app.use(express.static(PUB, { index: false, cacheControl: false }));
app.use('/vendor', cacheHeaders, express.static(VENDOR, { cacheControl: false }));

// async handlerlardagi xatolarni Express ga uzatadi
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------- auth ---------------- */
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
const auth = ah(async (req, res, next) => {
  const t = req.cookies.sid;
  if (!t) return res.status(401).json({ error: 'Kirish talab qilinadi' });
  const s = await db.get('SELECT u.id,u.username,u.full_name,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?', [t]);
  if (!s || s.expires_at < Date.now()) return res.status(401).json({ error: 'Seans tugagan' });
  req.user = s; next();
});
const need = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Ruxsat yo\'q' });
const writer = need('admin', 'analyst');

const loginAttempts = new Map();
app.post('/api/login', ah(async (req, res) => {
  const { username, password } = req.body || {};
  const key = req.ip + '|' + username;
  const a = loginAttempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 10 * 60 * 1000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 8) return res.status(429).json({ error: 'Juda ko\'p urinish. 10 daqiqadan keyin qayta urining.' });
  const u = await db.get('SELECT * FROM users WHERE username=?', [String(username || '').trim()]);
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) {
    a.n++; loginAttempts.set(key, a);
    return res.status(401).json({ error: 'Login yoki parol noto\'g\'ri' });
  }
  loginAttempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  await db.run('INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)', [token, u.id, Date.now() + SESSION_MS]);
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_MS, secure: process.env.COOKIE_SECURE === '1' });
  res.json({ username: u.username, full_name: u.full_name, role: u.role });
}));
app.post('/api/logout', ah(async (req, res) => {
  if (req.cookies.sid) await db.run('DELETE FROM sessions WHERE token=?', [req.cookies.sid]);
  res.clearCookie('sid'); res.json({ ok: true });
}));
app.get('/api/me', auth, (req, res) => res.json(req.user));

/* ---------------- users (admin) ---------------- */
app.get('/api/users', auth, need('admin'), ah(async (req, res) =>
  res.json(await db.all('SELECT id,username,full_name,role,created_at FROM users ORDER BY id'))));
app.post('/api/users', auth, need('admin'), ah(async (req, res) => {
  const { username, full_name, password, role } = req.body || {};
  if (!username || !password || password.length < 6) return res.status(400).json({ error: 'Login va kamida 6 belgili parol kerak' });
  if (!['admin', 'analyst', 'viewer'].includes(role)) return res.status(400).json({ error: 'Noto\'g\'ri rol' });
  try {
    await db.run('INSERT INTO users(username,full_name,password_hash,role) VALUES (?,?,?,?)',
      [username.trim(), full_name || null, bcrypt.hashSync(password, 10), role]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Bu login band' });
    throw e;
  }
}));
app.delete('/api/users/:id', auth, need('admin'), ah(async (req, res) => {
  if (+req.params.id === req.user.id) return res.status(400).json({ error: 'O\'zingizni o\'chira olmaysiz' });
  await db.run('DELETE FROM users WHERE id=?', [req.params.id]); res.json({ ok: true });
}));
app.post('/api/me/password', auth, ah(async (req, res) => {
  const { old_password, new_password } = req.body || {};
  const u = await db.get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!bcrypt.compareSync(String(old_password || ''), u.password_hash)) return res.status(400).json({ error: 'Eski parol noto\'g\'ri' });
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Yangi parol kamida 6 belgi' });
  await db.run('UPDATE users SET password_hash=? WHERE id=?', [bcrypt.hashSync(new_password, 10), u.id]);
  res.json({ ok: true });
}));

/* ---------------- filters ---------------- */
function lotFilter(q) {
  const w = [], a = [];
  if (q.q) { w.push('(product ILIKE ? OR brand ILIKE ? OR customer ILIKE ? OR winner ILIKE ? OR lot_no ILIKE ?)'); const s = `%${q.q}%`; a.push(s, s, s, s, s); }
  if (q.product) { w.push('product = ?'); a.push(q.product); }
  if (q.keywords) { // kalit so'zlar bo'yicha moslash (vergul bilan)
    const ks = String(q.keywords).split(',').map(s => s.trim()).filter(Boolean);
    if (ks.length) { w.push('(' + ks.map(() => '(product ILIKE ? OR COALESCE(brand,\'\') ILIKE ?)').join(' OR ') + ')'); ks.forEach(k => a.push(`%${k}%`, `%${k}%`)); }
  }
  for (const f of ['brand', 'winner', 'customer', 'customer_region', 'winner_region']) {
    if (q[f]) { w.push(`${f} = ?`); a.push(q[f]); }
  }
  if (q.from) { w.push('date >= ?'); a.push(q.from); }
  if (q.to) { w.push('date <= ?'); a.push(q.to); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', args: a };
}
const AND = where => (where ? where + ' AND' : 'WHERE');
// ROUND(double precision) PostgreSQLda yo'q, shuning uchun numeric ga o'giramiz
const R = (expr, d = 0) => `ROUND((${expr})::numeric, ${d})`;
const DISC = 'CASE WHEN start_price>0 THEN (start_price-final_price)*100.0/start_price END';

app.get('/api/filters', auth, ah(async (req, res) => {
  const d = async c => (await db.all(`SELECT DISTINCT ${c} v FROM lots WHERE ${c} IS NOT NULL AND ${c}<>'' ORDER BY ${c}`)).map(r => r.v);
  const [products, brands, winners, customers, customer_regions, winner_regions, range] = await Promise.all([
    d('product'), d('brand'), d('winner'), d('customer'), d('customer_region'), d('winner_region'),
    db.get('SELECT MIN(date) AS min, MAX(date) AS max, COUNT(*) AS n, COALESCE(SUM(is_demo),0) AS demo FROM lots')]);
  res.json({ products, brands, winners, customers, customer_regions, winner_regions, range });
}));

/* ---------------- lots ---------------- */
const SORTS = { date: 'date', product: 'product', final_price: 'final_price', price_per_kg: 'price_per_kg', bids: 'bids', discount: '(start_price-final_price)/NULLIF(start_price,0)' };
app.get('/api/lots', auth, ah(async (req, res) => {
  const { where, args } = lotFilter(req.query);
  const page = Math.max(1, +req.query.page || 1), limit = Math.min(200, +req.query.limit || 50);
  const sort = SORTS[req.query.sort] || 'date', dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const total = (await db.get(`SELECT COUNT(*) c FROM lots ${where}`, args)).c;
  const rows = await db.all(`SELECT *, ${R(DISC, 1)} AS discount_pct FROM lots ${where} ORDER BY ${sort} ${dir} NULLS LAST, id DESC LIMIT ? OFFSET ?`,
    [...args, limit, (page - 1) * limit]);
  res.json({ total, page, limit, rows });
}));
app.delete('/api/lots/:id', auth, writer, ah(async (req, res) => { await db.run('DELETE FROM lots WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

// Tanlangan lotlarni birga o'chirish
app.post('/api/lots/delete', auth, writer, ah(async (req, res) => {
  const ids = [...new Set((Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length) return res.status(400).json({ error: 'Lot tanlanmagan' });
  if (ids.length > 5000) return res.status(400).json({ error: 'Bir yo\'la 5000 tadan ko\'p lot o\'chirib bo\'lmaydi' });
  const r = await db.run('DELETE FROM lots WHERE id = ANY(?::int[])', [ids]);
  res.json({ deleted: r.changes });
}));

// Lotni qo'lda qo'shish (Excel importdagi ustunlar bilan bir xil; lot raqami takrorlansa rad etiladi)
app.post('/api/lots', auth, writer, ah(async (req, res) => {
  const b = req.body || {};
  const t = v => { const s = v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); return s || null; };
  const n = v => { const s = t(v); if (s === null) return null; const x = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
  const lot_no = t(b.lot_no), product = t(b.product), date = t(b.date), unit = t(b.unit);
  const final_price = n(b.final_price), start_price = n(b.start_price), volume = n(b.volume), bids = n(b.bids);
  if (!lot_no || !product) return res.status(400).json({ error: 'Lot raqami va mahsulot nomi kerak' });
  const dm = date && date.match(/^(\d{4})-(\d{2})-(\d{2})$/), dd = dm && new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3]));
  if (!dm || dd.getUTCFullYear() !== +dm[1] || dd.getUTCMonth() !== +dm[2] - 1 || dd.getUTCDate() !== +dm[3]) return res.status(400).json({ error: 'Sana noto\'g\'ri' });
  if (final_price === null || Number.isNaN(final_price) || final_price < 0) return res.status(400).json({ error: 'Yakuniy narxni to\'g\'ri kiriting' });
  if ([start_price, volume, bids].some(x => Number.isNaN(x) || (x !== null && x < 0))) return res.status(400).json({ error: 'Narx, hajm yoki takliflar sonida xato' });
  const pack_kg = P.packKg(unit);
  try {
    const row = await db.get(`INSERT INTO lots (lot_no,date,product,brand,unit,pack_kg,volume,start_price,final_price,bids,customer,customer_region,winner,winner_region,price_per_kg,is_demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0) RETURNING id`,
      [lot_no, date, product, t(b.brand), unit, pack_kg, volume, start_price, final_price, bids === null ? null : Math.round(bids),
        t(b.customer), t(b.customer_region), t(b.winner), t(b.winner_region), pack_kg ? final_price / pack_kg : null]);
    res.json({ id: row.id });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Bu lot raqami bazada allaqachon bor' });
    throw e;
  }
}));

const UPSERT = `INSERT INTO lots (lot_no,date,product,brand,unit,pack_kg,volume,start_price,final_price,bids,customer,customer_region,winner,winner_region,price_per_kg,is_demo)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
  ON CONFLICT (lot_no) DO UPDATE SET date=EXCLUDED.date,product=EXCLUDED.product,brand=EXCLUDED.brand,unit=EXCLUDED.unit,pack_kg=EXCLUDED.pack_kg,
  volume=EXCLUDED.volume,start_price=EXCLUDED.start_price,final_price=EXCLUDED.final_price,bids=EXCLUDED.bids,customer=EXCLUDED.customer,
  customer_region=EXCLUDED.customer_region,winner=EXCLUDED.winner,winner_region=EXCLUDED.winner_region,price_per_kg=EXCLUDED.price_per_kg,is_demo=0
  RETURNING (xmax = 0) AS inserted`;
const lotArgs = r => [r.lot_no, r.date, r.product, r.brand, r.unit, r.pack_kg, r.volume, r.start_price, r.final_price, r.bids,
  r.customer, r.customer_region, r.winner, r.winner_region, r.price_per_kg];

async function importLots(rows) {
  let ins = 0, upd = 0;
  await db.tx(async t => {
    for (const r of rows) { const o = await t.run(UPSERT, lotArgs(r)); o.rows[0].inserted ? ins++ : upd++; }
  });
  return { inserted: ins, updated: upd };
}
app.post('/api/lots/import', auth, writer, upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fayl tanlanmagan' });
  let parsed;
  try { parsed = P.parseLotsWorkbook(req.file.buffer); }
  catch (e) { return res.status(400).json({ error: 'Faylni o\'qib bo\'lmadi: ' + e.message }); }
  if (parsed.errors.length && !parsed.rows.length) return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
  const r = await importLots(parsed.rows);
  res.json({ ...r, skipped: parsed.skipped, errors: parsed.errors.slice(0, 20) });
}));
app.get('/api/lots/template', auth, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="lotlar_shablon.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(P.lotsTemplateBuffer());
});
app.delete('/api/demo', auth, need('admin'), ah(async (req, res) => {
  const r = await db.run('DELETE FROM lots WHERE is_demo=1'); res.json({ deleted: r.changes });
}));

/* ---------------- analytics ---------------- */
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

app.get('/api/analytics/summary', auth, ah(async (req, res) => {
  const { where, args } = lotFilter(req.query);
  const s = await db.get(`SELECT COUNT(*) lots, COUNT(DISTINCT winner) winners, COUNT(DISTINCT customer) customers,
    ${R('AVG(bids)', 1)} avg_bids, SUM(final_price*COALESCE(volume,1)) turnover_est, ${R('AVG(price_per_kg)')} avg_ppk,
    ${R(`AVG(${DISC})`, 1)} avg_discount, MIN(date) "from", MAX(date) "to"
    FROM lots ${where}`, args);
  res.json(s);
}));

app.get('/api/analytics/trend', auth, ah(async (req, res) => {
  const { where, args } = lotFilter(req.query);
  const fmt = req.query.interval === 'week' ? 'IYYY-"W"IW' : req.query.interval === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
  const rows = await db.all(`SELECT to_char(date, '${fmt}') period, COUNT(*) n, ${R('AVG(price_per_kg)')} avg, ${R('MIN(price_per_kg)')} min,
    ${R('MAX(price_per_kg)')} max, ${R('AVG(bids)', 1)} avg_bids, ${R(`AVG(${DISC})`, 1)} discount
    FROM lots ${AND(where)} price_per_kg IS NOT NULL GROUP BY 1 ORDER BY 1`, args);
  res.json(rows);
}));

const DIMS = { winner: 'winner', customer: 'customer', brand: 'brand', product: 'product', customer_region: 'customer_region', winner_region: 'winner_region' };
app.get('/api/analytics/rank', auth, ah(async (req, res) => {
  const dim = DIMS[req.query.by]; if (!dim) return res.status(400).json({ error: 'by noto\'g\'ri' });
  const { where, args } = lotFilter(req.query);
  const cond = `${AND(where)} ${dim} IS NOT NULL AND ${dim}<>''`;
  const lim = Math.min(200, +req.query.limit || 20);
  const rows = await db.all(`SELECT ${dim} AS name, COUNT(*) lots, SUM(final_price*COALESCE(volume,1)) turnover_est, ${R('AVG(price_per_kg)')} avg_ppk,
    ${R('AVG(bids)', 1)} avg_bids, COUNT(DISTINCT product) products, MAX(date) last_date, ${R(`AVG(${DISC})`, 1)} avg_discount
    FROM lots ${cond} GROUP BY ${dim} ORDER BY COUNT(*) DESC, 3 DESC NULLS LAST LIMIT ?`, [...args, lim]);
  const total = (await db.get(`SELECT COUNT(*) c FROM lots ${cond}`, args)).c;
  res.json(rows.map(r => ({ ...r, share: total ? +(r.lots * 100 / total).toFixed(1) : 0 })));
}));

// Raqobatchi/buyurtmachi tafsiloti
app.get('/api/analytics/entity', auth, ah(async (req, res) => {
  const role = req.query.role === 'customer' ? 'customer' : 'winner';
  if (!req.query.name) return res.status(400).json({ error: 'name kerak' });
  const { where, args } = lotFilter({ ...req.query, [role]: req.query.name });
  const [byProduct, byMonth] = await Promise.all([
    db.all(`SELECT product, COUNT(*) lots, ${R('AVG(price_per_kg)')} avg_ppk, ${R('MIN(price_per_kg)')} min_ppk FROM lots ${where} GROUP BY product ORDER BY COUNT(*) DESC`, args),
    db.all(`SELECT to_char(date,'YYYY-MM') period, COUNT(*) lots FROM lots ${where} GROUP BY 1 ORDER BY 1`, args)]);
  res.json({ byProduct, byMonth });
}));

// Marja tahlili: o'z mahsulotimiz tan narxi vs birja narxlari
app.get('/api/analytics/margin', auth, ah(async (req, res) => {
  const p = await db.get('SELECT * FROM products WHERE id=?', [parseInt(req.query.product_id, 10) || 0]);
  if (!p) return res.status(404).json({ error: 'Mahsulot topilmadi' });
  const keywords = req.query.keywords || p.keywords;
  if (!keywords) return res.json({ product: p, matched: 0, note: 'Kalit so\'zlar kiritilmagan' });
  const { where, args } = lotFilter({ ...req.query, keywords });
  const rows = await db.all(`SELECT price_per_kg ppk FROM lots ${AND(where)} price_per_kg IS NOT NULL`, args);
  const ppks = rows.map(r => r.ppk).sort((a, b) => a - b);
  const q = f => ppks.length ? ppks[Math.min(ppks.length - 1, Math.floor(f * ppks.length))] : null;
  const costKg = p.pack_kg && p.cost != null ? p.cost / p.pack_kg : null;
  const priceKg = p.pack_kg && p.price != null ? p.price / p.pack_kg : null;
  const winnable = costKg != null ? ppks.filter(x => x > costKg).length : null;
  res.json({
    product: p, cost_per_kg: costKg, price_per_kg: priceKg, keywords,
    matched: ppks.length, min: ppks[0] ?? null, p25: q(0.25), median: median(ppks), p75: q(0.75), max: ppks[ppks.length - 1] ?? null,
    avg: ppks.length ? ppks.reduce((s, x) => s + x, 0) / ppks.length : null,
    profitable_share: costKg != null && ppks.length ? +(winnable * 100 / ppks.length).toFixed(1) : null,
  });
}));

// Mahsulotlar jadvalini Excel'ga export (ustun tanlash va doimiy saqlash); /api/products/:id dan oldin ulanadi
app.use('/api/products/export', auth, require('./lib/prodexport')({ db, ah }));
/* ---------------- products (o'z mahsulotlarimiz) ---------------- */
app.get('/api/products', auth, ah(async (req, res) => res.json(await db.all('SELECT * FROM products ORDER BY id'))));
const numOrNull = v => (v === '' || v === undefined || v === null ? null : Number.isFinite(+v) ? +v : null);
const prodFields = b => [b.category || null, String(b.name || '').trim(), b.unit || null, P.packKg(b.unit) ?? numOrNull(b.pack_kg),
  numOrNull(b.cost), numOrNull(b.price), numOrNull(b.store_markup) || 1.4, numOrNull(b.cert_fee), b.keywords || null];
app.post('/api/products', auth, writer, ah(async (req, res) => {
  const f = prodFields(req.body || {}); if (!f[1]) return res.status(400).json({ error: 'Nomi kerak' });
  const r = await db.get('INSERT INTO products(category,name,unit,pack_kg,cost,price,store_markup,cert_fee,keywords) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id', f);
  res.json({ id: r.id });
}));
app.put('/api/products/:id', auth, writer, ah(async (req, res) => {
  const f = prodFields(req.body || {}); if (!f[1]) return res.status(400).json({ error: 'Nomi kerak' });
  await db.run('UPDATE products SET category=?,name=?,unit=?,pack_kg=?,cost=?,price=?,store_markup=?,cert_fee=?,keywords=? WHERE id=?', [...f, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/products/:id', auth, writer, ah(async (req, res) => { await db.run('DELETE FROM products WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

/* ---------------- Mening lotlarim ---------------- */
app.use('/api/my-lots', auth, require('./lib/mylots')({ db, ah, writer, P }));

/* ---------------- xatolar va ishga tushirish ---------------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Topilmadi' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server xatosi. Konsol loglarini tekshiring.' });
});

async function seedProducts() {
  if ((await db.get('SELECT COUNT(*) c FROM products')).c) return;
  const f = path.join(__dirname, 'seed', 'usta_products.xlsx');
  if (!fs.existsSync(f)) return;
  const items = P.parseProductsWorkbook(fs.readFileSync(f));
  await db.tx(async t => {
    for (const i of items) await t.run('INSERT INTO products(category,name,unit,pack_kg,cost,price,store_markup,cert_fee,keywords) VALUES (?,?,?,?,?,?,?,?,?)',
      [i.category, i.name, i.unit, i.pack_kg, i.cost, i.price, i.store_markup, i.cert_fee, i.keywords]);
  });
  console.log(`Mahsulotlar yuklandi: ${items.length} ta`);
}

async function main() {
  await init();
  const pw = await ensureAdmin();
  await seedProducts();
  if (pw) console.log(`\n>>> Birinchi ishga tushirish. Login: admin   Parol: ${pw}\n    (kirgandan keyin parolni almashtiring)\n`);
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Tizim ishga tushdi: http://localhost:${port}`));
}
if (require.main === module) main().catch(e => { console.error('\nXATO:', e.message, '\n'); process.exit(1); });
module.exports = { app, importLots };
