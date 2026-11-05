// DEMO ma'lumot (is_demo=1). Haqiqiy emas! Tizimni sinash uchun. Admin paneldan o'chiriladi.
const { db, init } = require('../lib/db');
const { normRegion } = require('../lib/parse');
let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const items = [
  ['Shtukaturka (Gipsli)', ['Knauf Rotband', 'Rodgips', 'Volma', 'Usta Plaster'], 'Qop (30 kg)', 30, 45000],
  ['Shpatlyovka', ['Ustamix', 'Knauf HP Finish', 'Vetonit'], 'Qop (20 kg)', 20, 30000],
  ['Kafel kley', ['Ceresit CM11', 'Usta Kley', 'Kreps'], 'Qop (25 kg)', 25, 36000],
  ['Gruntovka', ['Betonkontakt', 'Ceresit CT17', 'Akril Usta'], 'Paqir (10 kg)', 10, 90000],
  ['Suv emulsiyali bo\'yoq', ['Dulux', 'Vodoemulsiya Standart', 'Alpina'], 'Paqir (15 kg)', 15, 140000],
  ['Quyma pol', ['Usta Pol', 'Knauf Boden', 'Ceresit CN68'], 'Qop (25 kg)', 25, 42000],
];
const regs = ['УЗБЕКИСТАН, Андижанская область, Андижан', 'УЗБЕКИСТАН, Город Ташкент, Юнусабад', 'УЗБЕКИСТАН, Самаркандская область, Самарканд',
  'УЗБЕКИСТАН, Ферганская область, Фергана', 'УЗБЕКИСТАН, Бухарская область, Бухара', 'УЗБЕКИСТАН, Наманганская область, Наманган', 'УЗБЕКИСТАН, Хорезмская область, Ургенч'];
const winners = ['ALFA BUILD MCHJ', 'SAMO TRADE MCHJ', 'FAYZ BARAKA MCHJ', 'MEGA STROY OOO', 'UZ MATERIAL MCHJ', 'ORIENT KOMPLEKT MCHJ', 'GLOBAL SNAB MCHJ', 'BOBUR INVEST MCHJ'];
const custs = ['Viloyat hokimligi', 'Maktab №12', 'Davlat poliklinikasi', 'Qurilish boshqarmasi', 'Bolalar bog\'chasi №5', 'Shahar kasalxonasi', 'Yo\'l qurilish tresti'];
const SQL = `INSERT INTO lots (lot_no,date,product,brand,unit,pack_kg,volume,start_price,final_price,bids,customer,customer_region,winner,winner_region,price_per_kg,is_demo)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT (lot_no) DO NOTHING`;

(async () => {
  await init();
  let n = 0;
  await db.tx(async t => {
    for (let i = 0; i < 700; i++) {
      const [prod, brands, unit, kg, base] = pick(items);
      const day = new Date(Date.UTC(2026, 0, 1) + Math.floor(rnd() * 306) * 86400000);
      const season = 1 + 0.08 * Math.sin((day.getUTCMonth() / 12) * 6.28) + (day.getUTCMonth() * 0.006);
      const start = Math.round(base * season * (1 + rnd() * 0.5) / 100) * 100;
      const bids = 1 + Math.floor(rnd() * 9);
      const fin = Math.round(start * (1 - Math.min(0.45, 0.04 * bids * (0.5 + rnd()))) / 100) * 100;
      const r1 = pick(regs), r2 = pick(regs);
      await t.run(SQL, ['DEMO' + (900000 + i), day.toISOString().slice(0, 10), prod, pick(brands), unit, kg, Math.round(10 + rnd() * 300), start, fin, bids,
        pick(custs), normRegion(r1), pick(winners), normRegion(r2), fin / kg]); n++;
    }
  });
  console.log('Demo lotlar:', n);
  await db.end();
})().catch(e => { console.error('XATO:', e.message); process.exit(1); });
