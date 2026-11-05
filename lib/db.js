require('dotenv').config({ quiet: true });
const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// PostgreSQL turlarini JS ga qulay qilish
types.setTypeParser(20, v => parseInt(v, 10));      // BIGINT / COUNT -> number
types.setTypeParser(1700, v => parseFloat(v));      // NUMERIC (ROUND, SUM) -> number
types.setTypeParser(1082, v => v);
types.setTypeParser(1114, v => v);                  // TIMESTAMP (my_lots sanalari) -> 'YYYY-MM-DD HH:MM:SS' (zona siljimasligi uchun)                  // DATE -> 'YYYY-MM-DD' (vaqt zonasi siljimasligi uchun)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/birja',
  ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

// "?" belgilarini $1, $2, ... ga almashtiradi (SQL matnida boshqa "?" ishlatilmaydi)
const conv = sql => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };
const wrap = ex => ({
  all: async (sql, p = []) => (await ex.query(conv(sql), p)).rows,
  get: async (sql, p = []) => (await ex.query(conv(sql), p)).rows[0],
  run: async (sql, p = []) => { const r = await ex.query(conv(sql), p); return { changes: r.rowCount, rows: r.rows }; },
});
const db = {
  ...wrap(pool),
  async tx(fn) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const r = await fn(wrap(c)); await c.query('COMMIT'); return r; }
    catch (e) { await c.query('ROLLBACK').catch(() => { }); throw e; }
    finally { c.release(); }
  },
  end: () => pool.end(),
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',          -- admin | analyst | viewer
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS lots (
  id SERIAL PRIMARY KEY,
  lot_no TEXT UNIQUE NOT NULL,
  date DATE NOT NULL,
  product TEXT NOT NULL,
  brand TEXT,
  unit TEXT,
  pack_kg DOUBLE PRECISION,                     -- 1 birlik necha kg (birlikdan olinadi)
  volume DOUBLE PRECISION,                      -- "Hajmi" ustuni (xom qiymat)
  start_price DOUBLE PRECISION,
  final_price DOUBLE PRECISION,
  bids INTEGER,
  customer TEXT,
  customer_region TEXT,
  winner TEXT,
  winner_region TEXT,
  price_per_kg DOUBLE PRECISION,                -- final_price / pack_kg
  is_demo INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lots_date ON lots(date);
CREATE INDEX IF NOT EXISTS idx_lots_product ON lots(product);
CREATE INDEX IF NOT EXISTS idx_lots_winner ON lots(winner);
CREATE INDEX IF NOT EXISTS idx_lots_customer ON lots(customer);
-- "Mening lotlarim": o'zimiz ishtirok etgan lotlar
CREATE TABLE IF NOT EXISTS my_lots (
  id SERIAL PRIMARY KEY,
  lot_no TEXT UNIQUE NOT NULL,
  product_no TEXT,                              -- Tovar №
  product TEXT NOT NULL,
  brand TEXT,
  customer TEXT,                                -- buyurtmachi
  quantity DOUBLE PRECISION,
  specs TEXT,                                   -- tovarning xususiyatlari
  start_price DOUBLE PRECISION,
  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'new',           -- new | won | lost | rejected
  reject_reason TEXT,
  our_bid DOUBLE PRECISION,                     -- bizning taklif narxi
  win_price DOUBLE PRECISION,                   -- yakuniy (g'olib) narx
  winner_name TEXT,                             -- yutqazganda: g'olib kompaniya
  contract_no TEXT,
  contract_date DATE,
  amount_due DOUBLE PRECISION,                  -- o'tkazib berilishi kerak summa
  transfer_status TEXT NOT NULL DEFAULT 'pending',  -- pending | paid
  transferred_at TIMESTAMP,                     -- pul o'tkazilgan sana va vaqt
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_my_lots_status ON my_lots(status);
CREATE TABLE IF NOT EXISTS my_lot_files (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES my_lots(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  size INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_my_lot_files_lot ON my_lot_files(lot_id);
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category TEXT,
  name TEXT NOT NULL,
  unit TEXT,
  pack_kg DOUBLE PRECISION,
  cost DOUBLE PRECISION,                        -- tan narxi (1 birlik)
  price DOUBLE PRECISION,                       -- sotuv narxi
  store_markup DOUBLE PRECISION DEFAULT 1.4,    -- Milliy do'kon koeffitsiyenti
  cert_fee DOUBLE PRECISION,
  keywords TEXT                                 -- birja lotlarini moslash uchun kalit so'zlar
);
`;

async function init() {
  try { await pool.query('SELECT 1'); }
  catch (e) {
    throw new Error(`PostgreSQL ga ulanib bo'lmadi (${e.code || e.message}). DATABASE_URL ni tekshiring: ${(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/birja').replace(/:[^:@/]+@/, ':***@')}`);
  }
  await pool.query(SCHEMA);
  await pool.query('ALTER TABLE my_lots ADD COLUMN IF NOT EXISTS customer TEXT');   // eski bazalar uchun
  // eski bazalarda transferred_at DATE edi: vaqt saqlash uchun TIMESTAMP ga o'tkazamiz (mavjud sanalar 00:00 bo'ladi)
  const col = await db.get("SELECT data_type FROM information_schema.columns WHERE table_name='my_lots' AND column_name='transferred_at'");
  if (col && col.data_type === 'date') await pool.query('ALTER TABLE my_lots ALTER COLUMN transferred_at TYPE TIMESTAMP USING transferred_at::timestamp');
}

async function ensureAdmin() {
  const n = (await db.get('SELECT COUNT(*)::int c FROM users')).c;
  if (n > 0) return null;
  const pass = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('hex');
  await db.run('INSERT INTO users(username, full_name, password_hash, role) VALUES (?,?,?,?)',
    ['admin', 'Administrator', bcrypt.hashSync(pass, 10), 'admin']);
  return pass;
}

module.exports = { db, init, ensureAdmin };
