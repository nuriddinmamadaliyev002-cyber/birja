// Excel/CSV qatorlarini tozalash va normallashtirish
const XLSX = require('xlsx');

const REGION_UZ = {
  'андижанская': 'Andijon', 'бухарская': 'Buxoro', 'джизакская': 'Jizzax', 'кашкадарьинская': 'Qashqadaryo',
  'навоийская': 'Navoiy', 'наманганская': 'Namangan', 'самаркандская': 'Samarqand', 'сурхандарьинская': 'Surxondaryo',
  'сырдарьинская': 'Sirdaryo', 'ташкентская': 'Toshkent viloyati', 'ферганская': 'Farg\'ona', 'хорезмская': 'Xorazm',
  'республика каракалпакстан': 'Qoraqalpog\'iston', 'каракалпакстан': 'Qoraqalpog\'iston', 'город ташкент': 'Toshkent sh.',
  'ташкент': 'Toshkent sh.',
  'andijon': 'Andijon', 'buxoro': 'Buxoro', 'jizzax': 'Jizzax', 'qashqadaryo': 'Qashqadaryo', 'navoiy': 'Navoiy',
  'namangan': 'Namangan', 'samarqand': 'Samarqand', 'surxondaryo': 'Surxondaryo', 'sirdaryo': 'Sirdaryo',
  'xorazm': 'Xorazm', "farg'ona": "Farg'ona", 'toshkent': 'Toshkent sh.',
};

function normRegion(addr) {
  if (!addr) return null;
  const parts = String(addr).split(',').map(s => s.trim()).filter(Boolean);
  // "УЗБЕКИСТАН, Андижанская область, ..." -> 2-qism viloyat
  const cand = parts.length > 1 ? parts[1] : parts[0];
  const low = cand.toLowerCase().replace(/\s*(область|вилоят|viloyati|oblast)\s*/g, '').trim();
  for (const k of Object.keys(REGION_UZ)) if (low.startsWith(k) || low === k) return REGION_UZ[k];
  if (/ташкент|toshkent/i.test(cand)) return 'Toshkent sh.';
  return cand;
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\s| /g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') { // Excel serial
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

// "Qop (30 kg)", "1 ta qopda 25 kg", "kg", "Tonna" -> kg
function packKg(unit) {
  if (!unit) return null;
  const s = String(unit).toLowerCase().replace(',', '.');
  let m = s.match(/(\d+(?:\.\d+)?)\s*(kg|кг)/);
  if (m) return parseFloat(m[1]);
  m = s.match(/(\d+(?:\.\d+)?)\s*(l|litr|л)\b/);
  if (m) return parseFloat(m[1]);
  if (/^\s*(kg|кг|килограмм)\s*$/.test(s)) return 1;
  if (/tonna|тонна/.test(s)) return 1000;
  return null;
}

const clean = s => (s === null || s === undefined ? null : String(s).replace(/\s+/g, ' ').trim() || null);

// Lot varag'i sarlavhalari -> maydonlar
const HEADERS = [
  ['date', /^sana/i], ['product', /mahsulot nomi/i], ['brand', /brend|marka/i], ['unit', /o.lchov/i],
  ['lot_no', /lot raqam/i], ['volume', /hajm/i], ['start_price', /boshlang/i], ['final_price', /yakuniy/i],
  ['bids', /takliflar/i], ['customer', /^buyurtmachi$/i], ['customer_region', /buyurtmachi hudud/i],
  ['winner', /yetkazib beruvchi.*g.olib|g.olib/i], ['winner_region', /yetkazib beruvchi hudud/i],
];

function mapHeaders(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => {
    if (!h) return;
    const hs = String(h).trim();
    // hudud tekshiruvi oldin (aks holda "Buyurtmachi hududi" -> customer bo'lib ketadi)
    const ordered = [...HEADERS].sort((a, b) => (/hudud/.test(b[1].source) ? 1 : 0) - (/hudud/.test(a[1].source) ? 1 : 0));
    for (const [key, re] of ordered) if (re.test(hs) && idx[key] === undefined) { idx[key] = i; break; }
  });
  return idx;
}

function parseLotsWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const out = { rows: [], errors: [], skipped: 0 };
  // Lot varag'ini topamiz: sarlavhasida "Lot raqami" bor varaq
  let ws = null, rows = null;
  for (const name of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
    if (r[0] && r[0].some(h => h && /lot raqam/i.test(String(h)))) { ws = name; rows = r; break; }
  }
  if (!rows) { out.errors.push('"Lot raqami" ustunli varaq topilmadi. Shablondan foydalaning.'); return out; }
  const idx = mapHeaders(rows[0]);
  for (const need of ['date', 'product', 'lot_no', 'final_price']) {
    if (idx[need] === undefined) out.errors.push(`Majburiy ustun topilmadi: ${need}`);
  }
  if (out.errors.length) return out;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === '')) continue;
    const g = k => (idx[k] === undefined ? null : r[idx[k]]);
    let lot_no = g('lot_no');
    if (typeof lot_no === 'number') lot_no = BigInt(Math.round(lot_no)).toString();
    lot_no = clean(lot_no);
    const date = parseDate(g('date'));
    const product = clean(g('product'));
    const final_price = parseNum(g('final_price'));
    if (!lot_no || !date || !product || final_price === null) {
      out.skipped++; out.errors.push(`Qator ${i + 1}: lot raqami/sana/mahsulot/yakuniy narx to'liq emas`); continue;
    }
    const unit = clean(g('unit'));
    const pk = packKg(unit);
    out.rows.push({
      lot_no, date, product, brand: clean(g('brand')), unit, pack_kg: pk, volume: parseNum(g('volume')),
      start_price: parseNum(g('start_price')), final_price,
      bids: parseNum(g('bids')) === null ? null : Math.round(parseNum(g('bids'))),
      customer: clean(g('customer')), customer_region: normRegion(g('customer_region')),
      winner: clean(g('winner')), winner_region: normRegion(g('winner_region')),
      price_per_kg: pk ? final_price / pk : null,
    });
  }
  return out;
}

// USTA-TRADE mahsulot varag'i -> products
const KEYWORDS = [
  [/shpat/i, 'shpat,shpaklev'], [/suvoq|shtuk/i, 'shtukat,suvoq'], [/kley/i, 'kley'], [/zatirka|fuga/i, 'zatirka,fuga'],
  [/quyma pol/i, 'quyma pol,nalivnoy,pol'], [/travertin/i, 'travertin'], [/gruntovka|grunt|betonkontakt/i, 'grunt,betonkontakt'],
  [/emulsiya|boyoq|boyog/i, 'emulsiya,boyoq,kraska'],
];
function kw(cat, name) {
  const t = `${cat || ''} ${name || ''}`;
  for (const [re, k] of KEYWORDS) if (re.test(t)) return k;
  return '';
}

function parseProductsWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const hi = rows.findIndex(r => r && r.some(c => c && /mahsulot nomi/i.test(String(c))));
  if (hi < 0) return [];
  const out = []; let cat = null, name = null;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null)) continue;
    if (r[2] && /^jami/i.test(String(r[2]).trim())) break;
    if (r[1]) cat = clean(r[1]);
    if (r[2]) name = clean(r[2]);
    const cost = parseNum(r[6]), price = parseNum(r[7]);
    if (!name || (cost === null && price === null)) continue;
    const unit = clean(r[5]);
    out.push({ category: cat, name, unit, pack_kg: packKg(unit), cost, price, store_markup: 1.4,
      cert_fee: parseNum(r[4]), keywords: kw(cat, name) });
  }
  return out;
}

function lotsTemplateBuffer() {
  const wb = XLSX.utils.book_new();
  const head = ['Sana', 'Mahsulot nomi', 'Brend / Marka', "O'lchov birligi", 'Lot raqami', 'Hajmi (kg/qop)',
    "Boshlang'ich narx (so'm)", "Yakuniy narx (so'm)", 'Takliflar soni', 'Buyurtmachi', 'Buyurtmachi hududi',
    "Yetkazib beruvchi (G'olib)", 'Yetkazib beruvchi hududi'];
  const ex = ['02.11.2026', 'Shtukaturka (Gipsli)', 'Knauf Rotband', 'Qop (30 kg)', '261110085829485', 40, 60000, 37500, 8,
    'Misol buyurtmachi', 'УЗБЕКИСТАН, Андижанская область, Андижан', 'Misol MCHJ', 'УЗБЕКИСТАН, Ташкентская область, Ангрен'];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ex]), 'Lotlar');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/* ---------- Mening lotlarim (xarid.uzex.uz "mening lotlarim" jadvali) ---------- */
const pad2 = n => String(n).padStart(2, '0');
function parseDateTime(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${pad2(d.m)}-${pad2(d.d)} ${pad2(d.H || 0)}:${pad2(d.M || 0)}` : null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])} ${pad2(m[4] || 0)}:${m[5] || '00'}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])} ${pad2(m[4] || 0)}:${m[5] || '00'}`;
  return null;
}

// Saytdagi status matni -> new | won | lost | rejected
function myLotStatus(txt) {
  const s = String(txt || '').toLowerCase();
  if (/rad etil/.test(s)) return 'rejected';
  if (/g.olib\s+emas/.test(s)) return 'lost';
  if (/g.olibs/.test(s)) return 'won';
  return 'new';
}

const MY_HEADERS = [
  ['product_no', /^tovar\s*(№|n[o°]|raqam)/i], ['lot_no', /^lot\s*(№|n[o°]|raqam)/i], ['product', /tovar nomi|mahsulot nomi/i],
  ['brand', /^(brend|marka)/i], ['customer', /^buyurtmachi/i], ['quantity', /miqdor/i], ['specs', /xususiyat/i], ['start_price', /boshlang/i],
  ['starts_at', /boshlanish sana/i], ['ends_at', /tugash sana/i], ['status', /^status/i],
];

function parseMyLotsWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const out = { rows: [], errors: [], skipped: 0 };
  let rows = null, hi = -1;
  for (const name of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
    const i = r.slice(0, 15).findIndex(row => row && row.some(h => h && /^lot\s*(№|n[o°]|raqam)/i.test(String(h).trim())));
    if (i >= 0) { rows = r; hi = i; break; }
  }
  if (!rows) { out.errors.push('"Lot №" ustunli varaq topilmadi. Shablondan foydalaning.'); return out; }
  const idx = {};
  rows[hi].forEach((h, i) => {
    if (!h) return; const hs = String(h).trim();
    for (const [key, re] of MY_HEADERS) if (re.test(hs) && idx[key] === undefined) { idx[key] = i; break; }
  });
  if (idx.product === undefined) { out.errors.push('Majburiy ustun topilmadi: Tovar nomi'); return out; }
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === '')) continue;
    const g = k => (idx[k] === undefined ? null : r[idx[k]]);
    let lot_no = g('lot_no');
    if (typeof lot_no === 'number') lot_no = BigInt(Math.round(lot_no)).toString();
    lot_no = clean(lot_no);
    let product = clean(g('product')), brand = clean(g('brand'));
    const mm = String(g('product') || '').match(/^([\s\S]*?)\s*markasi\s*:?\s*([\s\S]*)$/i);   // "LED panel markasi: MARTSEL"
    if (mm) { product = clean(mm[1]); brand = brand || clean(mm[2]); }
    if (!lot_no || !product) { out.skipped++; out.errors.push(`Qator ${i + 1}: lot raqami yoki tovar nomi yo'q`); continue; }
    let pno = g('product_no'); if (typeof pno === 'number') pno = BigInt(Math.round(pno)).toString();
    out.rows.push({
      lot_no, product_no: clean(pno), product, brand, customer: clean(g('customer')), quantity: parseNum(g('quantity')), specs: clean(g('specs')),
      start_price: parseNum(g('start_price')), starts_at: parseDateTime(g('starts_at')), ends_at: parseDateTime(g('ends_at')),
      status: myLotStatus(g('status')),
    });
  }
  return out;
}

function myLotsTemplateBuffer() {
  const wb = XLSX.utils.book_new();
  const head = ['№', 'Tovar №', 'Lot №', 'Tovar nomi', 'Miqdori, soni', 'Tovarning xususiyatlari', "Boshlang'ich narxi", 'Boshlanish sanasi', 'Tugash sanasi', 'Status', 'Buyurtmachi'];
  const ex = [1, '29477688', '5846126', 'LED panel markasi: MARTSEL', 125, '', '25 000,00 UZS', '03.11.2026 13:51', '05.11.2026 13:51', 'Yangi', 'Misol buyurtmachi'];
  const ex2 = [2, '29354722', '5837192', 'Legirlanmagan po\'latdan ishlangan listli profillar markasi: Металл Профиль', 90, '', '400 000,00 UZS', '30.10.2026 16:21', '03.11.2026 16:21', "Amalga oshirilgan Siz g'olibsiz", ''];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ex, ex2]), 'Mening lotlarim');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}


/* ---------- Tugallanmagan savdolar (xarid.uzex.uz "Tushgan takliflar" jadvali) ---------- */
const OPEN_HEADERS = [
  ['tovar_no', /^tovar\s*(№|n[o°]|raqam)/i], ['lot_no', /^lot\s*(№|n[o°]|raqam)/i], ['starts_at', /boshlanish/i], ['ends_at', /tugash/i],
  ['my_price', /men\s+taklif|taklif\s+etgan/i], ['start_price', /boshlang\W?ich\s*narx/i], ['quantity', /^(soni|miqdor)/i],
  ['product', /^(mahsulot|tovar nomi)/i],
];
function parseOpenLotsWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const out = { rows: [], errors: [], skipped: 0 };
  const norm = h => String(h ?? '').replace(/\s+/g, ' ').trim();
  let rows = null, hi = -1;
  for (const name of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
    const i = r.slice(0, 15).findIndex(row => row && row.some(h => h && /^lot\s*(№|n[o°]|raqam)/i.test(norm(h))));
    if (i >= 0) { rows = r; hi = i; break; }
  }
  if (!rows) { out.errors.push('"Lot №" ustunli varaq topilmadi. Shablondan foydalaning.'); return out; }
  const idx = {};
  rows[hi].forEach((h, i) => { if (!h) return; const hs = norm(h); for (const [key, re] of OPEN_HEADERS) if (re.test(hs) && idx[key] === undefined) { idx[key] = i; break; } });
  for (const need of ['lot_no', 'product']) if (idx[need] === undefined) out.errors.push(`Majburiy ustun topilmadi: ${need === 'lot_no' ? 'Lot №' : 'Mahsulot'}`);
  if (out.errors.length) return out;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === '')) continue;
    const g = k => (idx[k] === undefined ? null : r[idx[k]]);
    const bigId = v => { if (typeof v === 'number') v = BigInt(Math.round(v)).toString(); return clean(v); };
    const lot_no = bigId(g('lot_no')), product = clean(g('product'));
    if (!lot_no || !product) { out.skipped++; out.errors.push(`Qator ${i + 1}: lot raqami yoki mahsulot nomi yo'q`); continue; }
    out.rows.push({ lot_no, tovar_no: bigId(g('tovar_no')), product, starts_at: parseDateTime(g('starts_at')), ends_at: parseDateTime(g('ends_at')),
      quantity: parseNum(g('quantity')), start_price: parseNum(g('start_price')), my_price: parseNum(g('my_price')) });
  }
  return out;
}
function openLotsTemplateBuffer() {
  const wb = XLSX.utils.book_new();
  const head = ['Lot №', 'Tovar №', 'Mahsulot', 'Lotning boshlanish sanasi', 'Lotning tugash sanasi', 'Soni', "Boshlang'ich narx", 'Men taklif etgan narx'];
  const ex = ['261110085853133', 'SO29395829', 'LED панель', '05.11.2026 08:36', '09.11.2026 08:36', 10, '79 000,00 UZS', '75 000,00 UZS'];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ex]), 'Tugallanmagan savdolar');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { parseOpenLotsWorkbook, openLotsTemplateBuffer, parseLotsWorkbook, parseProductsWorkbook, lotsTemplateBuffer, packKg, normRegion, parseMyLotsWorkbook, myLotsTemplateBuffer, myLotStatus, parseDateTime };
