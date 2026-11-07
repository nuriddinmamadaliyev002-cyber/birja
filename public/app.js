'use strict';
/* ---------- yordamchilar ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => v === null || v === undefined || isNaN(v) ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d });
const som = v => v === null || v === undefined ? '—' : nf(v) + ' so\'m';
const mln = v => v == null ? '—' : v >= 1e9 ? nf(v / 1e9, 1) + ' mlrd' : v >= 1e6 ? nf(v / 1e6, 1) + ' mln' : nf(v);
const pct = v => v == null ? '—' : nf(v, 1) + '%';
const qs = o => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const opts = (arr, sel, first) => `${first !== undefined ? `<option value="">${esc(first)}</option>` : ''}${arr.map(v => `<option ${v == sel ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;

async function api(path, o = {}) {
  const init = { method: o.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (o.json) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(o.json); }
  if (o.form) init.body = o.form;
  const r = await fetch('/api' + path, init);
  if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('auth'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Xatolik');
  return data;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3500); }
function modal(html, wide) { $('#modalBox').className = 'modal-box card' + (wide ? ' wide' : ''); $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { closeSug(); $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

let charts = [];
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function chart(el, cfg) {
  const c = new Chart(el, cfg); charts.push(c); return c;
}
function chartBase(extra = {}) {
  const grid = css('--line'), tx = css('--muted');
  Chart.defaults.color = tx; Chart.defaults.borderColor = grid; Chart.defaults.font.family = 'system-ui,sans-serif';
  return { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12 } } }, ...extra };
}
const debounce = (f, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

/* ---------- jadval -> karta (telefon): har bir katakka sarlavha yorlig'i qo'yadi ---------- */
function cardify() {
  document.querySelectorAll('table').forEach(t => {
    const hs = [...t.querySelectorAll('thead th')].map(h => h.textContent.replace(/[▲▼]/g, '').trim());
    t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => {
      if (td.dataset.k) return; td.dataset.k = '1';
      const single = td.colSpan <= 1;
      td.setAttribute('data-label', single ? (hs[i] || '') : '');
      if (single && td.childNodes.length) { const w = document.createElement('div'); w.className = 'cv'; while (td.firstChild) w.appendChild(td.firstChild); td.appendChild(w); }
    }));
  });
}
let _cf = 0;

/* ---------- qidiruv maydonlari: o'ng tomonda × (tozalash) tugmasi ----------
   Maydonga data-clear atributini qo'shish kifoya. Tugma faqat matn bor paytda ko'rinadi (CSS :placeholder-shown),
   bosilganda maydon tozalanadi va 'input' hodisasi yuboriladi, ya'ni oninput/debounce qidiruvi o'zi ishlaydi. Esc ham tozalaydi. */
function clearable() {
  document.querySelectorAll('input[data-clear]').forEach(inp => {
    if (inp.parentElement.classList.contains('clr')) return;
    if (!inp.placeholder) inp.placeholder = ' ';          // :placeholder-shown ishlashi uchun
    const w = document.createElement('span'); w.className = 'clr';
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'clr-x'; b.tabIndex = -1; b.textContent = '×'; b.title = 'Tozalash'; b.setAttribute('aria-label', 'Tozalash');
    const wipe = () => { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); };
    b.onmousedown = e => e.preventDefault();               // bosilganda fokus maydonda qolsin
    b.onclick = wipe;
    inp.addEventListener('keydown', e => { if (e.key === 'Escape' && inp.value) { e.stopPropagation(); wipe(); } });
    w.appendChild(b);
  });
}
/* ---------- sana / vaqt maydonlari: kk.oo.yyyy va 24 soatlik (SS:DD) format ----------
   Brauzerning <input type="date|datetime-local"> maydoni formatni brauzer tilidan oladi (mm/dd/yyyy, AM/PM) va uni o'zgartirib bo'lmaydi.
   Shuning uchun har bir shunday maydon matnli maydon (maska: 27.10.2026 13:45) + 📅 tugmasi bilan almashtiriladi.
   Asl maydon yashirin holda qoladi va id, onchange, .value (ISO: YYYY-MM-DD yoki YYYY-MM-DDTHH:MM) avvalgidek ishlayveradi. */
/* o'zimizning kalendar (brauzerning date-picker i o'rniga): o'zbekcha oylar, hafta dushanbadan */
const CAL_M = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const CAL_W = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
let calEl = null;
function closeCal() { if (calEl) { calEl.remove(); calEl = null; } }
function openCal(anchor, iso, onPick) {
  closeCal();
  const p2 = n => String(n).padStart(2, '0'), now = new Date();
  const today = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`, sel = /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(0, 10) : '';
  let y = sel ? +sel.slice(0, 4) : now.getFullYear(), m = sel ? +sel.slice(5, 7) - 1 : now.getMonth();
  const el = calEl = document.createElement('div'); el.className = 'cal'; el._anchor = anchor;
  const draw = () => {
    const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    let cells = '<span></span>'.repeat(first);
    for (let d = 1; d <= days; d++) { const v = `${y}-${p2(m + 1)}-${p2(d)}`; cells += `<button type="button" class="cal-d${v === sel ? ' on' : ''}${v === today ? ' today' : ''}" data-d="${v}">${d}</button>`; }
    el.innerHTML = `<div class="cal-h"><button type="button" data-n="-12" title="Oldingi yil">«</button><button type="button" data-n="-1" title="Oldingi oy">‹</button><b>${CAL_M[m]} ${y}</b><button type="button" data-n="1" title="Keyingi oy">›</button><button type="button" data-n="12" title="Keyingi yil">»</button></div>
      <div class="cal-w">${CAL_W.map(d => `<span>${d}</span>`).join('')}</div><div class="cal-g">${cells}</div>
      <div class="cal-f"><button type="button" data-d="${today}">Bugun</button><button type="button" data-d="">Tozalash</button></div>`;
  };
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.n) { const t = m + +b.dataset.n; y += Math.floor(t / 12); m = ((t % 12) + 12) % 12; draw(); }
    else if (b.dataset.d !== undefined) { closeCal(); onPick(b.dataset.d); }
  };
  draw(); document.body.appendChild(el);
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  const top = r.bottom + 4 + h > innerHeight && r.top - h - 4 > 8 ? r.top - h - 4 : r.bottom + 4;   // pastga sig'masa tepaga, u ham sig'masa ekran ichiga siqiladi
  el.style.top = Math.max(8, Math.min(top, innerHeight - h - 8)) + 'px';
}
document.addEventListener('mousedown', e => { if (calEl && !calEl.contains(e.target) && !e.target.closest('.dt-cal')) closeCal(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && calEl) { closeCal(); e.stopImmediatePropagation(); } }, true);   // Esc avval kalendarni yopadi, oyna ochiq qoladi
window.addEventListener('scroll', e => { if (calEl && !calEl.contains(e.target)) closeCal(); }, true);

/* ---------- qidiruvli tanlash (autocomplete) ----------
   suggest(input, () => [nomlar], onPick): yozganda mos nomlar ro'yxati chiqadi, bir marta bosish (yoki ↑ ↓ Enter) bilan tanlanadi.
   Ro'yxat <body> ga position:fixed qilib qo'yiladi, aks holda modal (overflow:auto) uni kesib qo'yadi. Esc avval ro'yxatni yopadi, oyna ochiq qoladi. */
let sugEl = null;
function closeSug() { if (sugEl) { sugEl.remove(); sugEl = null; } }
function suggest(inp, getItems, onPick) {
  let idx = -1, items = [];
  const norm = s => String(s ?? '').toLowerCase();
  const mark = (name, words) => {            // mos kelgan so'zlarni qalin qiladi
    const low = norm(name), hit = new Array(name.length).fill(false);
    words.forEach(w => { for (let i = low.indexOf(w); i >= 0; i = low.indexOf(w, i + w.length)) for (let k = i; k < i + w.length; k++) hit[k] = true; });
    let o = '', open = false;
    [...name].forEach((ch, i) => { if (hit[i] !== open) { o += open ? '</b>' : '<b>'; open = hit[i]; } o += esc(ch); });
    return o + (open ? '</b>' : '');
  };
  const place = () => {
    if (!sugEl) return;
    const r = inp.getBoundingClientRect(), h = sugEl.offsetHeight;
    sugEl.style.left = r.left + 'px'; sugEl.style.width = r.width + 'px';
    const below = innerHeight - r.bottom - 8, top = h > below && r.top > below ? r.top - h - 2 : r.bottom + 2;   // pastga sig'masa tepaga ochiladi
    sugEl.style.top = Math.max(8, top) + 'px';
    sugEl.style.maxHeight = Math.max(120, Math.min(260, (top === r.bottom + 2 ? below : r.top - 10))) + 'px';
  };
  const pick = i => { if (!items[i]) return; inp.value = items[i]; closeSug(); onPick && onPick(items[i]); };
  const mark_on = () => { [...sugEl.children].forEach((c, i) => c.classList.toggle('on', i === idx)); const c = sugEl.children[idx]; if (c) c.scrollIntoView({ block: 'nearest' }); };
  const show = () => {
    const words = norm(inp.value).split(/\s+/).filter(Boolean);
    if (!words.length) return closeSug();
    items = getItems().filter(n => words.every(w => norm(n).includes(w)))
      .sort((a, b) => (norm(a).startsWith(words[0]) ? 0 : 1) - (norm(b).startsWith(words[0]) ? 0 : 1) || a.localeCompare(b, 'uz')).slice(0, 50);
    closeSug(); idx = -1;
    const el = sugEl = document.createElement('div'); el.className = 'sug';
    el.innerHTML = items.length ? items.map((n, i) => `<div class="sug-i" data-i="${i}">${mark(n, words)}</div>`).join('') : '<div class="sug-0">Ro\'yxatda topilmadi</div>';
    el.onmousedown = e => { e.preventDefault(); const t = e.target.closest('.sug-i'); if (t) pick(+t.dataset.i); };   // fokus maydonda qoladi, bitta bosish yetarli
    document.body.appendChild(el); place();
  };
  inp.setAttribute('autocomplete', 'off');
  inp.addEventListener('input', show);
  inp.addEventListener('focus', () => { if (inp.value.trim()) show(); });
  inp.addEventListener('blur', closeSug);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!sugEl) show(); if (!sugEl || !items.length) return;
      e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; mark_on();
    } else if (e.key === 'Enter' && sugEl && idx >= 0) { e.preventDefault(); pick(idx); }
    else if (e.key === 'Escape' && sugEl) { e.stopPropagation(); closeSug(); }
  });
}
window.addEventListener('scroll', e => { if (sugEl && !sugEl.contains(e.target)) closeSug(); }, true);
window.addEventListener('resize', closeSug);

const nowLocal = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/* ---------- son maydonlari: yozganda 1000000 -> 1,000,000 ----------
   Minglik ajratuvchi: vergul (yoki probel), yozilsa qabul qilinadi va o'zi qayta qo'yiladi. Kasr: nuqta (100,000.50).
   Asl <input type=number> yashirin holda qoladi: id, oninput/onchange va .value (oddiy son: "100000.5") avvalgidek ishlaydi. */
function numFields() {
  document.querySelectorAll('input[type=number]').forEach(orig => {
    if (orig.dataset.nf) return; orig.dataset.nf = '1';
    const vis = document.createElement('input');
    Object.assign(vis, { type: 'text', inputMode: 'decimal', autocomplete: 'off', className: 'num-text', placeholder: orig.placeholder, disabled: orig.disabled });
    orig.parentNode.insertBefore(vis, orig); orig.style.display = 'none';
    const parts = s => {                                              // matn -> { neg, int, frac }
      const neg = /^\s*-/.test(s); s = s.replace(/[^\d.]/g, '');
      const i = s.indexOf('.');
      return { neg, int: (i < 0 ? s : s.slice(0, i)).replace(/^0+(?=\d)/, ''), frac: i < 0 ? null : s.slice(i + 1).replace(/\./g, '').slice(0, 6) };
    };
    const shownInt = p => (p.int === '' && p.frac !== null ? '0' : p.int).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const render = p => (p.neg ? '-' : '') + shownInt(p) + (p.frac !== null ? '.' + p.frac : '');
    const rawOf = p => { const i = p.int === '' && p.frac ? '0' : p.int; return i === '' ? '' : (p.neg ? '-' : '') + i + (p.frac ? '.' + p.frac : ''); };
    let shown = '', lastRaw = orig.value, lastChange = orig.value;
    const apply = (text, caret, del) => {
      let n = text.slice(0, caret).replace(/[^\d.]/g, '').length;       // kursordan oldingi raqam/nuqta soni
      let p = parts(text), f = render(p);
      if (del && f === shown) {                                       // faqat vergul o'chirilgan bo'lsa, qo'shni raqam o'chadi
        const sig = text.replace(/[^\d.]/g, ''), k = del === 'back' ? n - 1 : n;
        if (k >= 0 && k < sig.length) { p = parts((p.neg ? '-' : '') + sig.slice(0, k) + sig.slice(k + 1)); f = render(p); n = k; }
      }
      vis.value = shown = f; orig.value = rawOf(p);
      let pos = 0, c = 0;
      while (pos < f.length && c < n) { if (/[\d.]/.test(f[pos])) c++; pos++; }
      if (p.int === '' && p.frac !== null) pos = f.length;
      if (n === 0 && p.neg) pos = Math.max(pos, 1);
      if (document.activeElement === vis) vis.setSelectionRange(pos, pos);
      if (orig.value !== lastRaw) { lastRaw = orig.value; orig.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    vis.value = shown = render(parts(orig.value));
    vis.addEventListener('input', e => { const t = e.inputType || ''; apply(vis.value, vis.selectionStart ?? vis.value.length, t === 'deleteContentBackward' ? 'back' : t === 'deleteContentForward' ? 'fwd' : 0); });
    vis.addEventListener('paste', e => {
      e.preventDefault();
      let t = (e.clipboardData.getData('text') || '').trim();
      if (!/\./.test(t) && /,\d{1,2}$/.test(t)) t = t.replace(/[\s.]/g, '').replace(',', '.');   // "100 000,50" (ruscha yozuv) -> 100000.50
      const a = vis.selectionStart, b = vis.selectionEnd, v = vis.value;
      apply(v.slice(0, a) + t + v.slice(b), a + t.length);
    });
    vis.addEventListener('blur', () => {
      apply(vis.value.replace(/\.$/, ''), 0);                         // oxiridagi yolg'iz nuqtani olib tashlaydi
      if (orig.value !== lastChange) { lastChange = orig.value; orig.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });
}

function dateFields() {
  document.querySelectorAll('input[type=date],input[type=datetime-local]').forEach(orig => {
    if (orig.dataset.dt) return; orig.dataset.dt = '1';
    const withTime = orig.type === 'datetime-local', max = withTime ? 12 : 8;
    const w = document.createElement('span'); w.className = 'dtw';
    const vis = document.createElement('input');
    Object.assign(vis, { type: 'text', inputMode: 'numeric', autocomplete: 'off', className: 'dt-text', maxLength: 16,
      placeholder: withTime ? 'kk.oo.yyyy ss:dd' : 'kk.oo.yyyy', disabled: orig.disabled });
    const cal = document.createElement('button');
    Object.assign(cal, { type: 'button', className: 'dt-cal', tabIndex: -1, title: 'Kalendar', textContent: '📅' });
    orig.parentNode.insertBefore(w, orig); w.append(vis, cal, orig); orig.style.display = 'none';

    const fmt = d => { d = d.slice(0, max); let o = d.slice(0, 2); if (d.length > 2) o += '.' + d.slice(2, 4); if (d.length > 4) o += '.' + d.slice(4, 8);
      if (d.length > 8) o += ' ' + d.slice(8, 10); if (d.length > 10) o += ':' + d.slice(10, 12); return o; };
    const toIso = d => {
      if (d.length !== max) return '';
      const dd = +d.slice(0, 2), mm = +d.slice(2, 4), yy = +d.slice(4, 8), t = new Date(Date.UTC(yy, mm - 1, dd));
      if (yy < 1900 || t.getUTCMonth() !== mm - 1 || t.getUTCDate() !== dd) return '';
      if (withTime && (+d.slice(8, 10) > 23 || +d.slice(10, 12) > 59)) return '';
      return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}` + (withTime ? `T${d.slice(8, 10)}:${d.slice(10, 12)}` : '');
    };
    const show = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
      return m ? `${m[3]}.${m[2]}.${m[1]}` + (withTime && m[4] ? ` ${m[4]}:${m[5]}` : '') : ''; };
    let last = orig.value;                                           // oxirgi 'change' yuborilgan qiymat
    const emit = () => { if (orig.value !== last) { last = orig.value; orig.dispatchEvent(new Event('change', { bubbles: true })); } };
    let shown = '';                                                  // oxirgi ko'rsatilgan matn (input hodisasida vis.value allaqachon o'zgargan bo'ladi)
    const digits = () => vis.value.replace(/\D/g, '');
    const apply = (text, deleting) => {
      const iso = String(text).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);   // ISO matn qo'yilsa (paste)
      let d = iso ? iso[3] + iso[2] + iso[1] + (iso[4] ? iso[4] + iso[5] : '') : String(text).replace(/\D/g, '');
      let f = fmt(d);
      if (deleting && f.length >= shown.length && d.length) f = fmt(d.slice(0, -1));   // nuqta/ikki nuqtani o'chirganda oldingi raqam o'chadi
      vis.value = shown = f; d = f.replace(/\D/g, '');
      const v = toIso(d); orig.value = v;
      vis.classList.toggle('invalid', d.length === max && !v);
      if (v || !d) emit();
    };
    vis.value = shown = show(orig.value);
    orig._set = iso => { orig.value = iso; vis.value = shown = show(orig.value); vis.classList.remove('invalid'); emit(); };   // dastur tomonidan qiymat berish
    vis.addEventListener('input', e => apply(vis.value, (e.inputType || '').startsWith('delete')));
    vis.addEventListener('blur', () => { vis.classList.toggle('invalid', !!digits() && !orig.value); emit(); });

    cal.onclick = () => {                                            // kalendar: faqat sana tanlanadi, vaqt matn maydonida qoladi
      if (calEl && calEl._anchor === cal) return closeCal();
      openCal(cal, orig.value, v => {
        const d = digits();
        apply(v ? show(v) + (withTime ? ' ' + (d.length > 8 ? fmt(d).slice(11) : '00:00') : '') : '');
        emit(); vis.focus();
      });
    };
  });
}
new MutationObserver(() => { if (_cf) return; _cf = requestAnimationFrame(() => { _cf = 0; cardify(); clearable(); dateFields(); numFields(); }); }).observe(document.body, { childList: true, subtree: true });

/* ---------- holat ---------- */
let ME = null, FILTERS = null, PRODUCTS = [], UNITS = [], EXCH = [];
const G = { from: '', to: '' }; // umumiy sana oralig'i

const PAGES = [
  ['dashboard', 'Umumiy ko\'rinish'], ['mylots', 'Mening lotlarim'], ['lots', 'Lotlar bazasi'], ['trend', 'Narx dinamikasi'], ['margin', 'Marja kalkulyatori'],
  ['rank', 'Raqobat va buyurtmachilar'], ['products', 'Mahsulotlarimiz'], ['exchprod', 'Birja mahsulotlari'], ['units', "O'lchov birliklari"], ['settings', 'Sozlamalar'],
];
const canWrite = () => ME && ME.role !== 'viewer';

/* ---------- auth ---------- */
function showLogin() { setNav(false); $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginErr').textContent = '';
  const f = new FormData(e.target);
  try { await api('/login', { method: 'POST', json: { username: f.get('username'), password: f.get('password') } }); await boot(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
$('#logout').onclick = async () => { await api('/logout', { method: 'POST' }).catch(() => { }); location.hash = ''; showLogin(); };

async function boot() {
  try { ME = await api('/me'); } catch { return showLogin(); }
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#who').textContent = `${ME.full_name || ME.username} · ${ME.role}`;
  $('#nav').innerHTML = PAGES.map(([k, t]) => k === 'mylots'
    ? `<div class="nav-grp" id="grpMy"><a href="#mylots/new" data-k="mylots" data-g="1">${t}</a><div class="nav-sub">${MYSUBS.map(([s, l]) => `<a href="#mylots/${s}" data-k="mylots" data-s="${s}">${l}<span class="cnt" data-cnt="${s}"></span></a>`).join('')}</div></div>`
    : `<a href="#${k}" data-k="${k}">${t}</a>`).join('');
  await refreshMeta();
  route();
}
async function refreshMeta() { [FILTERS, PRODUCTS, UNITS, EXCH] = await Promise.all([api('/filters'), api('/products'), api('/units'), api('/exchange-products'), refreshCounts()]); }
async function refreshCounts() {
  try { const c = await api('/my-lots/counts'); document.querySelectorAll('[data-cnt]').forEach(e => { const n = c[e.dataset.cnt]; e.textContent = n > 0 ? n : ''; }); } catch { }
}
window.addEventListener('hashchange', route);

/* ---------- hamburger menyu (telefon) ---------- */
function setNav(open) { document.body.classList.toggle('nav-open', open); $('#burger').setAttribute('aria-expanded', open); }
$('#burger').onclick = () => setNav(!document.body.classList.contains('nav-open'));
$('#scrim').onclick = () => setNav(false);
$('#nav').addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setNav(false); });
window.matchMedia('(min-width:821px)').addEventListener('change', e => { if (e.matches) setNav(false); });

function route() {
  if (!ME) return;
  const [k, sub0] = (location.hash.slice(1) || 'dashboard').split('?')[0].split('/');
  const page = PAGES.find(p => p[0] === k) ? k : 'dashboard';
  const sub = page === 'mylots' ? (ST_LABEL[sub0] ? sub0 : 'new') : '';
  document.querySelectorAll('#nav a').forEach(a => {
    a.classList.toggle('on', !a.dataset.g && a.dataset.k === page && (!a.dataset.s || a.dataset.s === sub));
    a.classList.toggle('cur', !!a.dataset.g && page === 'mylots');
  });
  $('#grpMy').classList.toggle('open', page === 'mylots');
  $('#pageTitle').textContent = PAGES.find(p => p[0] === page)[1] + (sub ? ' · ' + ST_LABEL[sub] : ''); setNav(false);
  charts.forEach(c => c.destroy()); charts = [];
  $('#view').innerHTML = '<p class="muted">Yuklanmoqda…</p>';
  (VIEWS[page])(sub).catch(e => { if (e.message !== 'auth') $('#view').innerHTML = `<div class="card bad">Xatolik: ${esc(e.message)}</div>`; });
}

/* ---------- umumiy bloklar ---------- */
function head(title, sub, right = '') { return `<div class="page-head"><div><h1>${esc(title)}</h1><div class="muted">${esc(sub || '')}</div></div><div>${right}</div></div>`; }
function demoBanner() {
  const r = FILTERS.range; if (!r || !r.demo) return '';
  return `<div class="banner"><span><b>DEMO ma'lumot ko'rsatilmoqda</b> (${r.demo} ta lot). Raqamlar haqiqiy emas, tizimni sinash uchun. Haqiqiy lotlarni "Lotlar bazasi"dan import qiling.</span>${ME.role === 'admin' ? '<button class="btn small" id="delDemo">Demoni o\'chirish</button>' : ''}</div>`;
}
function bindDemo() { const b = $('#delDemo'); if (b) b.onclick = async () => { if (!confirm('Barcha demo lotlar o\'chiriladi. Davom etasizmi?')) return; const r = await api('/demo', { method: 'DELETE' }); toast(`${r.deleted} ta demo lot o'chirildi`); await refreshMeta(); route(); }; }
function dateBar(onchange) {
  return `<div class="bar"><label>Boshlanish<input type="date" id="gFrom" value="${G.from}"></label><label>Tugash<input type="date" id="gTo" value="${G.to}"></label>
  <button class="btn small" id="gReset">Barcha davr</button></div>`;
}
function bindDateBar(reload) {
  $('#gFrom').onchange = e => { G.from = e.target.value; reload(); };
  $('#gTo').onchange = e => { G.to = e.target.value; reload(); };
  $('#gReset').onclick = () => { G.from = G.to = ''; reload(); };
}
function emptyState() {
  return `<div class="card"><h2>Hozircha lotlar yo'q</h2><p class="muted">Boshlash uchun "Lotlar bazasi" bo'limiga o'tib Excel/CSV faylni import qiling.</p><a class="btn primary" href="#lots">Lotlar bazasiga o'tish</a></div>`;
}

/* ---------- Dashboard ---------- */
async function dashboard() {
  if (!FILTERS.range.n) { $('#view').innerHTML = head('Umumiy ko\'rinish') + emptyState(); return; }
  $('#view').innerHTML = head('Umumiy ko\'rinish', 'Birja bozorining qisqacha holati') + demoBanner() + dateBar() + '<div id="dash"></div>';
  bindDemo(); bindDateBar(load);
  async function load() {
    charts.forEach(c => c.destroy()); charts = [];
    const q = qs({ from: G.from, to: G.to });
    const [s, tr, w, pr, rg] = await Promise.all([
      api('/analytics/summary?' + q), api('/analytics/trend?interval=month&' + q), api('/analytics/rank?by=winner&limit=8&' + q),
      api('/analytics/rank?by=product&limit=8&' + q), api('/analytics/rank?by=customer_region&limit=10&' + q)]);
    $('#dash').innerHTML = `
    <div class="grid g4">
      <div class="card kpi"><div class="l">Lotlar soni</div><div class="v">${nf(s.lots)}</div></div>
      <div class="card kpi"><div class="l">Taxminiy aylanma (yakuniy narx × hajm)</div><div class="v">${mln(s.turnover_est)}</div></div>
      <div class="card kpi"><div class="l">O'rtacha takliflar soni</div><div class="v">${nf(s.avg_bids, 1)}</div></div>
      <div class="card kpi"><div class="l">O'rtacha narx tushishi</div><div class="v">${pct(s.avg_discount)}</div></div>
      <div class="card kpi"><div class="l">Faol g'oliblar</div><div class="v">${nf(s.winners)}</div></div>
      <div class="card kpi"><div class="l">Buyurtmachilar</div><div class="v">${nf(s.customers)}</div></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h2>Oylar bo'yicha lotlar soni</h2><div class="chart"><canvas id="c1"></canvas></div></div>
      <div class="card"><h2>Oylar bo'yicha o'rtacha narx tushishi (%)</h2><div class="chart"><canvas id="c2"></canvas></div></div>
      <div class="card"><h2>Eng ko'p lot yutgan kompaniyalar</h2><div class="chart"><canvas id="c3"></canvas></div></div>
      <div class="card"><h2>Mahsulotlar bo'yicha lotlar</h2><div class="chart"><canvas id="c4"></canvas></div></div>
      <div class="card"><h2>Buyurtmachi hududlari</h2><div class="chart"><canvas id="c5"></canvas></div></div>
    </div>`;
    const C = [css('--c1'), css('--c2'), css('--c3'), css('--c4')];
    chart($('#c1'), { type: 'bar', data: { labels: tr.map(r => r.period), datasets: [{ label: 'Lotlar', data: tr.map(r => r.n), backgroundColor: C[0] }] }, options: chartBase({ plugins: { legend: { display: false } } }) });
    chart($('#c2'), { type: 'line', data: { labels: tr.map(r => r.period), datasets: [{ label: 'Tushish %', data: tr.map(r => r.discount), borderColor: C[1], backgroundColor: C[1], tension: .25 }] }, options: chartBase({ plugins: { legend: { display: false } } }) });
    const hbar = (id, rows, color) => chart($(id), { type: 'bar', data: { labels: rows.map(r => r.name.length > 28 ? r.name.slice(0, 27) + '…' : r.name), datasets: [{ label: 'Lotlar', data: rows.map(r => r.lots), backgroundColor: color }] }, options: chartBase({ indexAxis: 'y', interaction: { mode: 'index', axis: 'y', intersect: false }, plugins: { legend: { display: false } } }) });
    hbar('#c3', w, C[2]); hbar('#c4', pr, C[3]); hbar('#c5', rg, C[0]);
  }
  await load();
}

/* ---------- Lotlar ---------- */
const LS = { page: 1, sort: 'date', dir: 'desc', f: {}, sel: new Set() };   // sel: belgilangan lot id lari (sahifalar bo'ylab saqlanadi)
async function lots() {
  const f = FILTERS;
  $('#view').innerHTML = head('Lotlar bazasi', `${nf(f.range.n)} ta lot${f.range.min ? ` · ${f.range.min} — ${f.range.max}` : ''}`,
    canWrite() ? `<a class="btn small" href="/api/lots/template">Shablon (.xlsx)</a> <button class="btn" id="imp">Excel/CSV import</button> <button class="btn primary" id="addLot">+ Yangi lot</button>` : '') + demoBanner() + `
  <div class="bar">
    <label>Qidiruv<input data-clear id="fq" placeholder="mahsulot, brend, kompaniya, lot №" value="${esc(LS.f.q || '')}" style="width:240px"></label>
    <label>Mahsulot<select id="fproduct">${opts(f.products, LS.f.product, 'Barchasi')}</select></label>
    <label>Brend<select id="fbrand">${opts(f.brands, LS.f.brand, 'Barchasi')}</select></label>
    <label>G'olib hududi<select id="fwinner_region">${opts(f.winner_regions, LS.f.winner_region, 'Barchasi')}</select></label>
    <label>Buyurtmachi hududi<select id="fcustomer_region">${opts(f.customer_regions, LS.f.customer_region, 'Barchasi')}</select></label>
    <label>Dan<input type="date" id="ffrom" value="${LS.f.from || ''}"></label><label>Gacha<input type="date" id="fto" value="${LS.f.to || ''}"></label>
    <button class="btn small" id="freset">Tozalash</button>
  </div>
  <div class="bar only-m"><label>Saralash<select id="mSort">${[['date', 'Sana'], ['product', 'Mahsulot'], ['final_price', 'Yakuniy narx'], ['total_sum', 'Summa'], ['price_per_kg', '1 kg narxi'], ['discount', 'Narx tushishi'], ['bids', 'Takliflar']].map(([k, t]) => `<option value="${k}" ${LS.sort === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <button class="btn" id="mDir" style="flex:none"></button></div><div id="lotsOut"></div>`;
  bindDemo();
  const read = () => { LS.f = { q: $('#fq').value, product: $('#fproduct').value, brand: $('#fbrand').value, winner_region: $('#fwinner_region').value, customer_region: $('#fcustomer_region').value, from: $('#ffrom').value, to: $('#fto').value }; LS.page = 1; LS.sel.clear(); load(); };   // filtr o'zgarsa tanlov bekor bo'ladi (ko'rinmagan lotlar o'chib ketmasin)
  ['fproduct', 'fbrand', 'fwinner_region', 'fcustomer_region', 'ffrom', 'fto'].forEach(i => $('#' + i).onchange = read);
  $('#fq').oninput = debounce(read);
  $('#freset').onclick = () => { LS.f = {}; LS.page = 1; LS.sel.clear(); lots(); };
  if ($('#imp')) $('#imp').onclick = importDialog;
  if ($('#addLot')) $('#addLot').onclick = () => addLotDialog();
  $('#mSort').onchange = e => { LS.sort = e.target.value; LS.page = 1; load(); };
  $('#mDir').onclick = () => { LS.dir = LS.dir === 'asc' ? 'desc' : 'asc'; LS.page = 1; load(); };
  async function load() {
    const d = await api('/lots?' + qs({ ...LS.f, page: LS.page, sort: LS.sort, dir: LS.dir, limit: 50 }));
    if (!d.rows.length && LS.page > 1) { LS.page = Math.max(1, Math.ceil(d.total / d.limit)); return load(); }   // oxirgi sahifadagi hamma lot o'chirilgan bo'lsa
    const w = canWrite(), ids = d.rows.map(r => r.id);
    $('#mSort').value = LS.sort; $('#mDir').textContent = LS.dir === 'asc' ? '▲ o\'sish' : '▼ kamayish';
    const th = (k, t, cls = '') => `<th class="s ${cls}" data-s="${k}">${t}${LS.sort === k ? (LS.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
    const pages = Math.max(1, Math.ceil(d.total / d.limit));
    const selBar = w ? `<div class="selbar"><label class="xc"><input type="checkbox" id="selPage" ${ids.length && ids.every(i => LS.sel.has(i)) ? 'checked' : ''} ${ids.length ? '' : 'disabled'}><span>Sahifadagilarni tanlash</span></label>
      <span class="selinfo ${LS.sel.size ? '' : 'hidden'}"><span><b id="selN">${LS.sel.size}</b> ta tanlandi</span><button class="btn small danger" type="button" id="selDel">Tanlanganlarni o'chirish</button><button class="btn small" type="button" id="selClear">Bekor qilish</button></span></div>` : '';
    $('#lotsOut').innerHTML = selBar + `<div class="tablewrap"><table><thead><tr>${w ? '<th class="c-sel"></th>' : ''}${th('date', 'Sana')}${th('product', 'Mahsulot')}<th>Brend</th><th>Birlik</th>
      ${th('final_price', 'Boshl. → Yakuniy', 'num')}${th('total_sum', 'Summa', 'num')}${th('price_per_kg', '1 kg narxi', 'num')}${th('discount', 'Tushish', 'num')}${th('bids', 'Takl.', 'num')}<th>G'olib</th><th>Buyurtmachi</th><th>Lot №</th>${canWrite() ? '<th></th>' : ''}</tr></thead><tbody>
      ${d.rows.map(r => `<tr class="${LS.sel.has(r.id) ? 'sel' : ''}">${w ? `<td class="c-sel"><input type="checkbox" data-sel="${r.id}" aria-label="Tanlash" ${LS.sel.has(r.id) ? 'checked' : ''}></td>` : ''}<td class="nowrap">${r.date}${r.is_demo ? ' <span class="pill demo">demo</span>' : ''}</td><td class="c-title">${esc(r.product)}</td><td>${esc(r.brand)}</td><td class="nowrap">${esc(r.unit)}${r.volume != null ? `<div class="muted small">× ${nf(r.volume)}</div>` : ''}</td>
      <td class="num nowrap"><span class="muted">${nf(r.start_price)}</span> → <b>${nf(r.final_price)}</b></td><td class="num nowrap">${nf(r.total_sum)}</td><td class="num">${nf(r.price_per_kg)}</td>
      <td class="num ${r.discount_pct > 20 ? 'warn' : ''}">${pct(r.discount_pct)}</td><td class="num">${r.bids ?? '—'}</td>
      <td>${esc(r.winner)}<div class="muted small">${esc(r.winner_region)}</div></td><td>${esc(r.customer)}<div class="muted small">${esc(r.customer_region)}</div></td>
      <td class="small muted">${esc(r.lot_no)}</td>${canWrite() ? `<td class="nowrap"><button class="btn small" data-elot="${r.id}" title="Tahrirlash" aria-label="Tahrirlash">✎</button> <button class="btn small danger" data-del="${r.id}" title="O'chirish" aria-label="O'chirish">×</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="14" class="muted">Hech narsa topilmadi</td></tr>`}
      </tbody></table></div>
      <div class="pager"><span class="muted">${nf(d.total)} ta natija</span><button class="btn small" id="pp" ${LS.page <= 1 ? 'disabled' : ''}>←</button><span>${LS.page} / ${pages}</span><button class="btn small" id="pn" ${LS.page >= pages ? 'disabled' : ''}>→</button></div>`;
    document.querySelectorAll('th.s').forEach(t => t.onclick = () => { const k = t.dataset.s; LS.dir = LS.sort === k && LS.dir === 'desc' ? 'asc' : 'desc'; LS.sort = k; load(); });
    $('#pp').onclick = () => { LS.page--; load(); }; $('#pn').onclick = () => { LS.page++; load(); };
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Lot o\'chirilsinmi?')) return; await api('/lots/' + b.dataset.del, { method: 'DELETE' }); LS.sel.delete(+b.dataset.del); await refreshMeta(); load(); });
    const byId = new Map(d.rows.map(r => [r.id, r]));   // ✎: shu sahifadagi qator ma'lumoti bilan oyna ochiladi
    document.querySelectorAll('[data-elot]').forEach(b => b.onclick = () => addLotDialog(byId.get(+b.dataset.elot), +b.dataset.elot));
    if (w) {   // qatorlarni belgilash va tanlanganlarni birga o'chirish
      const syncBar = () => { $('#selN').textContent = LS.sel.size; document.querySelector('.selinfo').classList.toggle('hidden', !LS.sel.size); $('#selPage').checked = !!ids.length && ids.every(i => LS.sel.has(i)); };
      document.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { const id = +c.dataset.sel; c.checked ? LS.sel.add(id) : LS.sel.delete(id); c.closest('tr').classList.toggle('sel', c.checked); syncBar(); });
      $('#selPage').onchange = e => { const on = e.target.checked; ids.forEach(i => on ? LS.sel.add(i) : LS.sel.delete(i)); document.querySelectorAll('[data-sel]').forEach(c => { c.checked = on; c.closest('tr').classList.toggle('sel', on); }); syncBar(); };
      $('#selClear').onclick = () => { LS.sel.clear(); load(); };
      $('#selDel').onclick = async () => {
        const n = LS.sel.size; if (!n || !confirm(`Tanlangan ${nf(n)} ta lot o'chirilsinmi?\nBu amalni qaytarib bo'lmaydi.`)) return;
        $('#selDel').disabled = true;
        try { const r = await api('/lots/delete', { method: 'POST', json: { ids: [...LS.sel] } }); LS.sel.clear(); toast(`${nf(r.deleted)} ta lot o'chirildi`); await refreshMeta(); lots(); }
        catch (e) { toast(e.message); $('#selDel').disabled = false; }
      };
    }
  }
  await load();
}

/* Lotni qo'lda qo'shish (Excel import o'rniga bittalab kiritish). "Saqlash va yana qo'shish" umumiy maydonlarni saqlab qoladi. */
const REGIONS = ['Andijon', 'Buxoro', 'Jizzax', 'Qashqadaryo', 'Navoiy', 'Namangan', 'Samarqand', 'Surxondaryo', 'Sirdaryo', 'Toshkent viloyati', "Farg'ona", 'Xorazm', "Qoraqalpog'iston", 'Toshkent sh.'];
const kgf = v => String(+Number(v).toFixed(3));   // 25 -> "25", 0.5 -> "0.5"
const packKgJs = u => {   // lib/parse.js dagi packKg bilan bir xil qoida (faqat ko'rsatma uchun; hisoblashni server qiladi)
  const s = String(u || '').toLowerCase().replace(',', '.'); let m = s.match(/(\d+(?:\.\d+)?)\s*(kg|кг)/); if (m) return +m[1];
  m = s.match(/(\d+(?:\.\d+)?)\s*(l|litr|л)\b/); if (m) return +m[1];
  if (/^\s*(kg|кг|килограмм)\s*$/.test(s)) return 1; if (/tonna|тонна/.test(s)) return 1000; return null;
};
function addLotDialog(pre = {}, editId = null) {   // editId bo'lsa: shu lotni tahrirlash (PUT), aks holda yangi lot (POST)
  const inp = (k, label, extra = '') => `<label>${label}<input id="al_${k}" value="${esc(pre[k] ?? '')}" ${extra}></label>`;
  const num = (k, label) => inp(k, label, 'type="number" step="any"');
  const reg = (k, label) => `<label>${label}<select id="al_${k}"><option value="">—</option>${(pre[k] && !REGIONS.includes(pre[k]) ? [...REGIONS, pre[k]] : REGIONS).map(r => `<option ${pre[k] === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>`;
  // importdan kelgan lotning birligi nomenklaturada bo'lmasligi mumkin: tahrirlashda u yo'qolib qolmasligi uchun ro'yxatga qo'shiladi
  const unitList = pre.unit && !UNITS.some(u => u.name === pre.unit) ? [...UNITS, { name: pre.unit, pack_kg: packKgJs(pre.unit) }] : UNITS;
  modal(`<h2>${editId ? 'Lotni tahrirlash' : "Yangi lot qo'shish"}</h2><div class="formgrid">
    <label>Sana *<input id="al_date" type="date" value="${esc(pre.date || nowLocal().slice(0, 10))}"></label>${inp('lot_no', 'Lot raqami *')}
    ${inp('product', 'Mahsulot nomi *', 'autocomplete="off" placeholder="nomini yozing…"')}${inp('brand', 'Brend / Marka', 'list="dlBrand" autocomplete="off"')}
    <label>O'lchov birligi<select id="al_unit"><option value="">— tanlang —</option>${unitList.map(u => `<option value="${esc(u.name)}" ${pre.unit === u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>${num('volume', 'Hajmi (qop / kg soni)')}
    ${num('start_price', "Boshlang'ich narx (so'm, 1 birlik)")}${num('final_price', "Yakuniy narx (so'm, 1 birlik) *")}${num('bids', 'Takliflar soni')}
    ${inp('customer', 'Buyurtmachi')}${reg('customer_region', 'Buyurtmachi hududi')}${inp('winner', "Yetkazib beruvchi (G'olib)")}${reg('winner_region', "G'olib hududi")}</div>
    <datalist id="dlBrand">${FILTERS.brands.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <div id="alHint" class="muted small" style="margin-top:10px"></div>
    <div class="actions"><button class="btn" type="button" onclick="closeModal()">Bekor</button>${editId ? '' : '<button class="btn" type="button" id="alMore">Saqlash va yana qo\'shish</button>'}<button class="btn primary" type="button" id="alSave">Saqlash</button></div>`, true);
  const hint = () => {
    const unit = $('#al_unit').value, un = unitList.find(u => u.name === unit), kg = un ? un.pack_kg : null, fin = parseFloat($('#al_final_price').value);
    const pv = $('#al_product').value.trim(), pnote = pv && !EXCH.some(e => e.name.toLowerCase() === pv.toLowerCase())
      ? `<div class="warn" style="margin-bottom:6px">«${esc(pv)}» birja mahsulotlari ro'yxatida yo'q. <a href="#exchprod" onclick="closeModal()">«Birja mahsulotlari»</a> menyusiga qo'shishingiz mumkin.</div>` : '';
    const vol = parseFloat($('#al_volume').value),
      sumLine = vol >= 0 && fin >= 0 ? `<div style="margin-bottom:6px">Shartnoma summasi: <b>${nf(Math.round(vol * fin * 100) / 100)}</b> so'm <span class="muted">(${nf(vol)} × ${nf(fin)})</span></div>` : '';
    $('#alHint').innerHTML = pnote + sumLine + (!unitList.length ? `<span class="warn">Birliklar ro'yxati bo'sh. Avval <a href="#units" onclick="closeModal()">«O'lchov birliklari»</a> menyusida birlik qo'shing.</span>`
      : !unit ? `Birlikni ro'yxatdan tanlang. Kerakli birlik yo'q bo'lsa, <a href="#units" onclick="closeModal()">«O'lchov birliklari»</a> menyusida qo'shing.`
        : kg ? `1 birlik = ${kgf(kg)} kg${fin ? ` → 1 kg narxi: <b>${nf(fin / kg)}</b> so'm` : ''}`
          : '<span class="warn">Bu birlikda kg/litr hajmi ko\'rsatilmagan, shuning uchun 1 kg narxi hisoblanmaydi (narx dinamikasida ko\'rinmaydi). «O\'lchov birliklari» menyusida hajmni kiriting.</span>');
  };
  suggest($('#al_product'), () => EXCH.map(e => e.name), hint);
  $('#al_product').addEventListener('input', hint);
  $('#al_unit').onchange = hint; $('#al_final_price').oninput = hint; $('#al_volume').addEventListener('input', hint); hint();
  const keys = ['date', 'lot_no', 'product', 'brand', 'unit', 'volume', 'start_price', 'final_price', 'bids', 'customer', 'customer_region', 'winner', 'winner_region'];
  const save = async more => {
    if (document.querySelector('#modalBox .dt-text.invalid')) return toast('Sana noto\'g\'ri. Format: kk.oo.yyyy');
    const b = {}; keys.forEach(k => b[k] = $('#al_' + k).value);
    if (!b.date) return toast('Sanani kiriting');
    if (!b.lot_no.trim() || !b.product.trim()) return toast('Lot raqami va mahsulot nomini kiriting');
    if (b.final_price === '') return toast('Yakuniy narxni kiriting');
    busy(true);
    try {
      await api(editId ? '/lots/' + editId : '/lots', { method: editId ? 'PUT' : 'POST', json: b }); await refreshMeta(); toast(editId ? `Lot ${b.lot_no} saqlandi` : `Lot ${b.lot_no} qo'shildi`);
      if (location.hash === '#lots') lots();
      if (more && !editId) addLotDialog({ date: b.date, product: b.product, brand: b.brand, unit: b.unit, volume: b.volume, customer: b.customer, customer_region: b.customer_region });
      else closeModal();
    } catch (e) { toast(e.message); busy(false); }
  };
  const busy = on => { $('#alSave').disabled = on; if ($('#alMore')) $('#alMore').disabled = on; };
  $('#alSave').onclick = () => save(false); if ($('#alMore')) $('#alMore').onclick = () => save(true);
}
function importDialog() {
  modal(`<h2>Lotlarni import qilish</h2>
  <p class="muted">.xlsx yoki .csv fayl. Birinchi qatorda sarlavhalar bo'lishi kerak (Sana, Mahsulot nomi, Brend, O'lchov birligi, Lot raqami, ..., Yakuniy narx...). Lot raqami takrorlansa, mavjud yozuv yangilanadi, dublikat bo'lmaydi.</p>
  <input type="file" id="impFile" accept=".xlsx,.xls,.csv"><div id="impOut" style="margin:12px 0"></div>
  <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" onclick="closeModal()">Yopish</button><button class="btn primary" id="impGo">Yuklash</button></div>`);
  $('#impGo').onclick = async () => {
    const file = $('#impFile').files[0]; if (!file) return toast('Fayl tanlang');
    const fd = new FormData(); fd.append('file', file); $('#impOut').textContent = 'Yuklanmoqda…';
    try {
      const r = await api('/lots/import', { method: 'POST', form: fd });
      $('#impOut').innerHTML = `<div class="bignote good">Yangi: <b>${r.inserted}</b> · Yangilandi: <b>${r.updated}</b> · O'tkazib yuborildi: <b>${r.skipped}</b></div>${r.errors.length ? `<ul class="small bad">${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}`;
      await refreshMeta(); setTimeout(() => { if (location.hash === '#lots') lots(); }, 100);
    } catch (e) { $('#impOut').innerHTML = `<div class="bad">${esc(e.message)}</div>`; }
  };
}
window.closeModal = closeModal;

/* ---------- Narx dinamikasi ---------- */
const TS = { own: '', keywords: '', product: '', interval: 'month', region: '' };
async function trend() {
  if (!FILTERS.range.n) { $('#view').innerHTML = head('Narx dinamikasi') + emptyState(); return; }
  $('#view').innerHTML = head('Narx dinamikasi', '1 kg (yoki 1 litr) ga keltirilgan narx: turli qadoqlar adolatli solishtiriladi') + demoBanner() + `
  <div class="bar">
    <label>Bizning mahsulot (solishtirish uchun)<select id="tOwn"><option value="">— tanlanmagan —</option>${PRODUCTS.map(p => `<option value="${p.id}" ${TS.own == p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</select></label>
    <label>Birjadagi mahsulot<select id="tProd">${opts(FILTERS.products, TS.product, 'Barchasi')}</select></label>
    <label>Kalit so'z<input data-clear id="tKw" value="${esc(TS.keywords)}" placeholder="masalan: kley" style="width:150px"></label>
    <label>G'olib hududi<select id="tReg">${opts(FILTERS.winner_regions, TS.region, 'Barchasi')}</select></label>
    <label>Davr<select id="tInt"><option value="month">Oylik</option><option value="week" ${TS.interval === 'week' ? 'selected' : ''}>Haftalik</option><option value="day" ${TS.interval === 'day' ? 'selected' : ''}>Kunlik</option></select></label>
  </div>${dateBar()}<div class="card"><div class="chart" style="height:360px"><canvas id="tc"></canvas></div></div><div id="tt" style="margin-top:14px"></div>`;
  bindDemo();
  const read = () => { TS.own = $('#tOwn').value; TS.product = $('#tProd').value; TS.keywords = $('#tKw').value; TS.region = $('#tReg').value; TS.interval = $('#tInt').value; load(); };
  $('#tOwn').onchange = () => { const p = PRODUCTS.find(x => x.id == $('#tOwn').value); if (p) $('#tKw').value = p.keywords || ''; read(); };
  ['tProd', 'tReg', 'tInt'].forEach(i => $('#' + i).onchange = read); $('#tKw').oninput = debounce(read);
  bindDateBar(load);
  async function load() {
    charts.forEach(c => c.destroy()); charts = [];
    const rows = await api('/analytics/trend?' + qs({ interval: TS.interval, product: TS.product, keywords: TS.keywords, winner_region: TS.region, from: G.from, to: G.to }));
    const own = PRODUCTS.find(p => p.id == TS.own); const costKg = own && own.pack_kg && own.cost != null ? own.cost / own.pack_kg : null;
    const labels = rows.map(r => r.period), ds = [
      { label: 'O\'rtacha', data: rows.map(r => r.avg), borderColor: css('--c1'), backgroundColor: css('--c1'), tension: .2 },
      { label: 'Eng past', data: rows.map(r => r.min), borderColor: css('--c3'), borderDash: [4, 3], pointRadius: 0 },
      { label: 'Eng yuqori', data: rows.map(r => r.max), borderColor: css('--c4'), borderDash: [4, 3], pointRadius: 0 }];
    if (costKg) ds.push({ label: `Bizning tan narx (${nf(costKg)})`, data: labels.map(() => costKg), borderColor: css('--bad'), borderWidth: 2, pointRadius: 0 });
    chart($('#tc'), { type: 'line', data: { labels, datasets: ds }, options: chartBase({ scales: { y: { title: { display: true, text: 'so\'m / kg' } } } }) });
    $('#tt').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>Davr</th><th class="num">Lotlar</th><th class="num">O'rtacha</th><th class="num">Eng past</th><th class="num">Eng yuqori</th><th class="num">Takl.</th><th class="num">Tushish</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="c-title">${r.period}</td><td class="num">${r.n}</td><td class="num">${nf(r.avg)}</td><td class="num">${nf(r.min)}</td><td class="num">${nf(r.max)}</td><td class="num">${nf(r.avg_bids, 1)}</td><td class="num">${pct(r.discount)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card muted">Tanlangan filtr bo\'yicha ma\'lumot yo\'q (yoki qadoq hajmi aniqlanmagan).</div>';
  }
  await load();
}

/* ---------- Marja kalkulyatori ---------- */
const MS = { id: '', keywords: '' };
async function margin() {
  if (!PRODUCTS.length) { $('#view').innerHTML = head('Marja kalkulyatori') + '<div class="card">Avval "Mahsulotlarimiz" bo\'limida mahsulot qo\'shing.</div>'; return; }
  if (!MS.id) MS.id = PRODUCTS[0].id;
  $('#view').innerHTML = head('Marja kalkulyatori', 'Bizning tan narxni birja narxlari bilan solishtirish va ishtirok narxini hisoblash') + demoBanner() + `
  <div class="bar"><label>Bizning mahsulot<select id="mProd">${PRODUCTS.map(p => `<option value="${p.id}" ${MS.id == p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</select></label>
  <label>Birja lotlarini moslash (kalit so'zlar, vergul bilan)<input data-clear id="mKw" style="width:260px"></label></div>
  <div id="mMarket"></div>
  <div class="card" style="margin-top:14px"><h2>Lot uchun hisob-kitob</h2><div class="formgrid" id="calc"></div><div id="calcOut" style="margin-top:14px"></div></div>`;
  bindDemo();
  const prod = () => PRODUCTS.find(p => p.id == MS.id);
  $('#mKw').value = MS.keywords || prod().keywords || '';
  $('#mProd').onchange = () => { MS.id = $('#mProd').value; MS.keywords = ''; margin(); };
  $('#mKw').oninput = debounce(() => { MS.keywords = $('#mKw').value; loadMarket(); });
  const p = prod();
  $('#calc').innerHTML = [
    ['cStart', 'Lotning boshlang\'ich narxi (1 birlik, so\'m)', ''], ['cQty', 'Miqdor (birlik soni)', 100], ['cKg', '1 birlik necha kg', p.pack_kg || ''],
    ['cCost', 'Bizning tan narx (1 birlik)', p.cost ?? ''], ['cExtra', 'Qo\'shimcha xarajat (logistika, kafolat — 1 birlikka)', 0], ['cTarget', 'Maqsad marja (%)', 15], ['cBid', 'Taklif qilinadigan narx (1 birlik)', '']]
    .map(([id, l, v]) => `<label>${l}<input type="number" id="${id}" value="${v}" step="any"></label>`).join('');
  const calc = () => {
    const g = id => parseFloat($('#' + id).value) || 0;
    const cost = g('cCost') + g('cExtra'), bid = g('cBid'), qty = g('cQty'), kg = g('cKg'), start = g('cStart'), tm = g('cTarget') / 100;
    const minBid = tm < 1 ? cost / (1 - tm) : NaN;
    let h = `<div class="grid g4"><div class="card kpi"><div class="l">To'liq tannarx (1 birlik)</div><div class="v">${som(cost)}</div>${kg ? `<div class="muted small">${nf(cost / kg)} so'm/kg</div>` : ''}</div>
    <div class="card kpi"><div class="l">Zararsiz narx</div><div class="v">${som(cost)}</div></div>
    <div class="card kpi"><div class="l">Maqsad marja uchun minimal narx</div><div class="v">${som(minBid)}</div>${start ? `<div class="muted small">boshl. narxdan ${pct((start - minBid) * 100 / start)} past</div>` : ''}</div>`;
    if (bid) {
      const profit = bid - cost, m = bid ? profit * 100 / bid : 0;
      h += `<div class="card kpi"><div class="l">Taklif narxida marja</div><div class="v ${profit < 0 ? 'bad' : m < g('cTarget') ? 'warn' : 'good'}">${pct(m)}</div><div class="muted small">1 birlikka ${som(profit)} · jami ${som(profit * qty)}</div></div>`;
    }
    h += '</div>';
    if (start && minBid > start) h += `<div class="bignote bad" style="margin-top:10px">Maqsad marjaga lotning boshlang'ich narxi ham yetmaydi (${som(start)} &lt; ${som(minBid)}). Bu lotda ishtirok etish maqsadga muvofiq emas.</div>`;
    else if (start && cost > start * 0.0 && minBid <= start) h += `<div class="bignote" style="margin-top:10px">Maqsad marja saqlanadi, agar narx <b>${pct((start - minBid) * 100 / start)}</b> dan ko'proq tushmasa.</div>`;
    $('#calcOut').innerHTML = h;
  };
  document.querySelectorAll('#calc input').forEach(i => i.oninput = calc); calc();
  async function loadMarket() {
    const m = await api('/analytics/margin?' + qs({ product_id: MS.id, keywords: MS.keywords || $('#mKw').value, from: G.from, to: G.to }));
    if (!m.matched) { $('#mMarket').innerHTML = `<div class="card"><h2>Birja bilan solishtirish</h2><p class="muted">${m.note || 'Kalit so\'zlarga mos lot topilmadi.'} Kalit so'zlarni o'zgartiring yoki lotlarni import qiling.</p></div>`; return; }
    const cost = m.cost_per_kg, lo = Math.min(m.min, cost ?? m.min), hi = Math.max(m.max, cost ?? m.max, m.price_per_kg ?? 0), pos = v => ((v - lo) / (hi - lo || 1) * 100).toFixed(2) + '%';
    const mk = (v, color, label, top = 0) => v == null ? '' : `<div class="mk ${(v - lo) / (hi - lo || 1) > 0.8 ? 'r' : ''}" style="left:${pos(v)};background:${color}"><i style="color:${color};top:${top}px">${label}</i></div>`;
    const diff = cost != null ? (m.median - cost) * 100 / m.median : null;
    $('#mMarket').innerHTML = `<div class="card"><h2>Birja narxlari (so'm/kg) — ${nf(m.matched)} ta lot</h2>
      <div class="grid g4"><div class="card kpi"><div class="l">Bizning tan narx</div><div class="v">${nf(cost)}</div><div class="muted small">so'm/kg</div></div>
      <div class="card kpi"><div class="l">Birja mediana narxi</div><div class="v">${nf(m.median)}</div><div class="muted small">o'rtacha ${nf(m.avg)}</div></div>
      <div class="card kpi"><div class="l">Medianada marja</div><div class="v ${diff < 0 ? 'bad' : diff < 10 ? 'warn' : 'good'}">${pct(diff)}</div></div>
      <div class="card kpi"><div class="l">Lotlarning qancha qismi tan narxdan yuqori</div><div class="v">${pct(m.profitable_share)}</div></div></div>
      <div class="range"><div class="track"></div><div class="iqr" style="left:${pos(m.p25)};width:calc(${pos(m.p75)} - ${pos(m.p25)})"></div>
      ${mk(m.min, css('--muted'), 'min ' + nf(m.min), 30)}${mk(m.max, css('--muted'), 'max ' + nf(m.max), 30)}${mk(m.median, css('--accent'), 'mediana ' + nf(m.median), -14)}${mk(cost, css('--bad'), 'tan narx ' + nf(cost), 30)}</div>
      <p class="muted small">Ko'k to'rtburchak: lotlarning o'rta 50% qismi (25–75 persentil). Qizil chiziq: bizning tan narx. ${cost != null && m.profitable_share < 50 ? '<b class="bad">Lotlarning yarmidan ko\'pi tan narxdan past narxda yopilgan.</b>' : ''}</p></div>`;
  }
  await loadMarket();
}

/* ---------- Reyting ---------- */
const RS = { by: 'winner', winner_region: '', customer_region: '', name: '', sel: new Set() };
async function rank() {
  if (!FILTERS.range.n) { $('#view').innerHTML = head('Raqobat va buyurtmachilar') + emptyState(); return; }
  const tabs = [['winner', 'G\'oliblar (raqobatchilar)'], ['customer', 'Buyurtmachilar'], ['brand', 'Brendlar'], ['product', 'Mahsulotlar'], ['customer_region', 'Buyurtmachi hududlari'], ['winner_region', 'G\'olib hududlari']];
  const co = RS.by === 'winner' || RS.by === 'customer';      // korxona jadvallari: tafsilot va birlashtirish shu yerda
  const merge = co && canWrite();
  const regSel = (id, label, list, cur) => `<label>${label}<select id="${id}">${opts(list, cur, 'Barchasi')}</select></label>`;
  $('#view').innerHTML = head('Raqobat va buyurtmachilar', 'Kim nimani yutayapti, kim nimani sotib olayapti') + demoBanner() + dateBar() +
    `<div class="tabs">${tabs.map(([k, t]) => `<div class="tab ${RS.by === k ? 'on' : ''}" data-k="${k}">${t}</div>`).join('')}</div>
    <div class="bar">
      <label>Qidiruv<input data-clear id="rkQ" placeholder="nomi bo'yicha" value="${esc(RS.name)}" style="width:220px"></label>
      ${RS.by !== 'winner_region' ? regSel('rkWR', "G'olib hududi", FILTERS.winner_regions, RS.winner_region) : ''}
      ${RS.by !== 'customer_region' ? regSel('rkCR', 'Buyurtmachi hududi', FILTERS.customer_regions, RS.customer_region) : ''}
      ${merge ? `<button class="btn" id="rkSim">O'xshash nomlarni topish</button><button class="btn primary" id="rkMerge" disabled>Birlashtirish</button>` : ''}
    </div><div id="rk"></div>`;
  bindDemo(); bindDateBar(load);
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { RS.by = t.dataset.k; RS.name = ''; RS.sel.clear(); rank(); });
  $('#rkQ').oninput = debounce(() => { RS.name = $('#rkQ').value.trim(); load(); }, 250);
  if ($('#rkWR')) $('#rkWR').onchange = () => { RS.winner_region = $('#rkWR').value; load(); };
  if ($('#rkCR')) $('#rkCR').onchange = () => { RS.customer_region = $('#rkCR').value; load(); };
  let rows = [];
  const regionQ = () => { const q = {}; if (RS.by !== 'winner_region') q.winner_region = RS.winner_region; if (RS.by !== 'customer_region') q.customer_region = RS.customer_region; return q; };

  async function load() {
    rows = await api('/analytics/rank?' + qs({ by: RS.by, limit: 100, from: G.from, to: G.to, name: RS.name, ...regionQ() }));
    const shown = new Set(rows.map(r => r.name)); [...RS.sel].forEach(n => { if (!shown.has(n)) RS.sel.delete(n); });   // ko'rinmay qolgan qator tanlovi olib tashlanadi
    const th = (t, c = '') => `<th${c ? ` class="${c}"` : ''}>${t}</th>`;
    $('#rk').innerHTML = `<div class="tablewrap"><table><thead><tr>${merge ? '<th class="c-sel"><input type="checkbox" id="rkAll" aria-label="Hammasini tanlash"></th>' : ''}<th>#</th><th>Nomi</th>${co ? '<th>Hudud</th>' : ''}${th('Lotlar', 'num')}${th('Ulush', 'num')}${th('Taxm. aylanma', 'num')}${th('O\'rt. 1 kg narx', 'num')}${th('O\'rt. takl.', 'num')}${th('Tushish', 'num')}${th('Mahsulot turi', 'num')}<th>Oxirgi lot</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${co ? 'click' : ''} ${RS.sel.has(r.name) ? 'sel' : ''}" data-n="${esc(r.name)}">${merge ? `<td class="c-sel"><input type="checkbox" class="rk-ck" data-n="${esc(r.name)}" aria-label="Tanlash" ${RS.sel.has(r.name) ? 'checked' : ''}></td>` : ''}<td class="muted c-hide">${i + 1}</td><td class="c-title">${i + 1}. ${esc(r.name)}</td>${co ? `<td class="small muted">${esc(r.region || '')}</td>` : ''}<td class="num"><b>${r.lots}</b></td><td class="num">${pct(r.share)}</td><td class="num">${mln(r.turnover_est)}</td><td class="num">${nf(r.avg_ppk)}</td><td class="num">${nf(r.avg_bids, 1)}</td><td class="num">${pct(r.avg_discount)}</td><td class="num">${r.products}</td><td class="nowrap">${r.last_date}</td></tr>`).join('')
      || `<tr><td colspan="12" class="muted">Hech narsa topilmadi</td></tr>`}</tbody></table></div>
    ${co ? `<p class="muted small">Tafsilot uchun qatorni bosing.${merge ? " Bir korxonaning turlicha yozilgan nomlarini belgilab, «Birlashtirish» tugmasi bilan bitta nomga keltirishingiz mumkin." : ''}</p>` : ''}`;
    if (co) document.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => entity(tr.dataset.n));
    if (merge) {
      document.querySelectorAll('#rk .c-sel').forEach(td => td.onclick = e => e.stopPropagation());   // belgilash qator tafsilotini ochmasin
      document.querySelectorAll('.rk-ck').forEach(c => c.onchange = () => { c.checked ? RS.sel.add(c.dataset.n) : RS.sel.delete(c.dataset.n); c.closest('tr').classList.toggle('sel', c.checked); syncSel(); });
      $('#rkAll').onchange = e => { document.querySelectorAll('.rk-ck').forEach(c => { c.checked = e.target.checked; e.target.checked ? RS.sel.add(c.dataset.n) : RS.sel.delete(c.dataset.n); c.closest('tr').classList.toggle('sel', c.checked); }); syncSel(); };
      syncSel();
    }
  }
  function syncSel() {
    const b = $('#rkMerge'); if (!b) return;
    b.disabled = RS.sel.size < 2; b.textContent = RS.sel.size ? `Birlashtirish (${RS.sel.size})` : 'Birlashtirish';
    const all = $('#rkAll'); if (all) { const n = document.querySelectorAll('.rk-ck').length; all.checked = n > 0 && RS.sel.size === n; all.disabled = !n; }
  }
  async function entity(name) {
    const role = RS.by === 'customer' ? 'customer' : 'winner';
    const d = await api('/analytics/entity?' + qs({ role, name, from: G.from, to: G.to, ...regionQ() }));
    modal(`<h2>${esc(name)}</h2><p class="muted">${role === 'winner' ? 'Yutgan lotlar' : 'Sotib olgan mahsulotlar'}</p>
      <table><thead><tr><th>Mahsulot</th><th class="num">Lotlar</th><th class="num">O'rt. 1 kg</th><th class="num">Eng past 1 kg</th></tr></thead><tbody>
      ${d.byProduct.map(r => `<tr><td class="c-title">${esc(r.product)}</td><td class="num">${r.lots}</td><td class="num">${nf(r.avg_ppk)}</td><td class="num">${nf(r.min_ppk)}</td></tr>`).join('')}</tbody></table>
      <h3 style="margin-top:14px">Oylar bo'yicha</h3><div>${d.byMonth.map(m => `<span class="pill" style="margin:2px">${m.period}: ${m.lots}</span>`).join('')}</div>
      <div style="text-align:right;margin-top:14px"><button class="btn" onclick="closeModal()">Yopish</button></div>`, true);
  }

  /* ----- birlashtirish ----- */
  // items: [{ name, lots, region }]. Belgilangan nomlar yakuniy nom ostiga o'tkaziladi. back: birlashtirgach nima qilish (o'xshashlar ro'yxatiga qaytish)
  function mergeDialog(items, back) {
    const top = [...items].sort((a, b) => b.lots - a.lots)[0];
    modal(`<h2>Korxonalarni birlashtirish</h2>
      <p class="muted small">Belgilangan nomlar bitta nomga almashtiriladi: lotlardagi g'olib va buyurtmachi ustunlarida hamda «Mening lotlarim»da. Keyingi importlarda ham shu nomlar avtomatik almashtiriladi. Bu amalni dastur ichidan qaytarib bo'lmaydi.</p>
      <div class="tablewrap" style="margin:10px 0"><table><thead><tr><th class="c-sel"></th><th>Nomi</th><th>Hudud</th><th class="num">Lotlar</th><th>Yakuniy</th></tr></thead><tbody>
      ${items.map((x, i) => `<tr><td class="c-sel"><input type="checkbox" class="mg-ck" data-i="${i}" checked aria-label="Birlashtirish"></td><td class="c-title">${esc(x.name)}</td><td class="small muted">${esc(x.region || '')}</td><td class="num">${x.lots}</td>
        <td><input type="radio" name="mgT" class="mg-rd" data-i="${i}" ${x === top ? 'checked' : ''} aria-label="Yakuniy nom qilish"></td></tr>`).join('')}</tbody></table></div>
      <label style="display:block">Yakuniy nom (o'zgartirishingiz mumkin)<input id="mgName" value="${esc(top.name)}" style="width:100%" autocomplete="off"></label>
      <div id="mgInfo" class="muted small" style="margin-top:8px"></div>
      <div class="actions"><button class="btn" type="button" id="mgCancel">Bekor</button><button class="btn primary" type="button" id="mgOk">Birlashtirish</button></div>`, true);
    const checked = () => [...document.querySelectorAll('#modalBox .mg-ck')].filter(c => c.checked).map(c => items[+c.dataset.i]);
    const info = () => {
      const tgt = $('#mgName').value.replace(/\s+/g, ' ').trim(), from = checked().filter(x => x.name !== tgt);
      $('#mgInfo').innerHTML = from.length ? `«${esc(tgt || '…')}» nomiga o'tadi: ${from.length} ta nom, ${nf(from.reduce((s, x) => s + x.lots, 0))} ta lot.` : '<span class="warn">Yakuniy nomdan farq qiladigan kamida bitta nom belgilang.</span>';
      $('#mgOk').disabled = !tgt || !from.length;
    };
    document.querySelectorAll('#modalBox .mg-rd').forEach(r => r.onchange = () => { $('#mgName').value = items[+r.dataset.i].name; info(); });
    document.querySelectorAll('#modalBox .mg-ck').forEach(c => c.onchange = info); $('#mgName').oninput = info; info();
    $('#mgCancel').onclick = () => back ? back() : closeModal();
    $('#mgOk').onclick = async () => {
      const tgt = $('#mgName').value.trim(); $('#mgOk').disabled = true;
      try {
        const r = await api('/names/merge', { method: 'POST', json: { target: tgt, names: checked().map(x => x.name) } });
        toast(`Birlashtirildi: ${r.merged} ta nom → «${r.target}» · ${nf(r.updated_lots)} ta lot yangilandi`);
        RS.sel.clear(); await refreshMeta(); await load();
        back ? back() : closeModal();
      } catch (e) { toast(e.message); $('#mgOk').disabled = false; }
    };
  }
  async function similarDialog() {
    const kind = RS.by === 'customer' ? 'customer' : 'winner';
    modal('<h2>O\'xshash nomlar</h2><p class="muted">Qidirilmoqda…</p>', true);
    let d; try { d = await api('/names/similar?kind=' + kind); } catch (e) { closeModal(); return toast(e.message); }
    modal(`<h2>O'xshash nomlar</h2>
      <p class="muted small">${nf(d.total_names)} ta turli nom tekshirildi${d.found ? `, ${nf(d.found)} ta guruh topildi${d.found > d.groups.length ? ` (birinchi ${d.groups.length} tasi ko'rsatilgan)` : ''}` : ''}. «Aniq» — nomlar faqat yozilishi bilan farq qiladi (harf, tirnoq, MCHJ/XK, so'z tartibi). «Taxminiy» — 1–3 harf farq: birlashtirishdan oldin tekshiring.${d.fuzzy ? '' : ' Nomlar juda ko\'p bo\'lgani uchun faqat aniq moslar qidirildi.'}</p>
      <div style="max-height:56vh;overflow:auto">${d.groups.map((g, gi) => `<div class="grp"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><span class="pill ${g.exact ? '' : 'demo'}">${g.exact ? 'Aniq' : 'Taxminiy'}</span><button class="btn small primary" data-grp="${gi}">Birlashtirish</button></div>
        ${g.items.map(x => `<div class="grp-i"><span>${esc(x.name)}</span><span class="muted small">${esc(x.region || '')} · ${x.lots} ta lot</span></div>`).join('')}</div>`).join('') || '<p>O\'xshash nomlar topilmadi.</p>'}</div>
      <div style="text-align:right;margin-top:14px"><button class="btn" onclick="closeModal()">Yopish</button></div>`, true);
    document.querySelectorAll('#modalBox [data-grp]').forEach(b => b.onclick = () => mergeDialog(d.groups[+b.dataset.grp].items, similarDialog));   // faqat oyna ichida: chap menyudagi data-g bilan aralashmasin
  }
  if ($('#rkMerge')) $('#rkMerge').onclick = () => mergeDialog(rows.filter(r => RS.sel.has(r.name)).map(r => ({ name: r.name, lots: r.lots, region: r.region })));
  if ($('#rkSim')) $('#rkSim').onclick = similarDialog;
  await load();
}

/* ---------- O'lchov birliklari (nomenklatura) ---------- */
async function units() {
  await refreshMeta();
  const w = canWrite();
  $('#view').innerHTML = head("O'lchov birliklari", "Nomenklatura: lotni qo'lda qo'shishda «O'lchov birligi» dropdown'i shu ro'yxatdan to'ldiriladi",
    w ? `<button class="btn" id="uSync">Lotlardan yangilash</button> <button class="btn primary" id="uAdd">+ Birlik</button>` : '') + `
    <div class="tablewrap"><table><thead><tr><th>№</th><th>Nomi</th><th class="num">1 birlik (kg / l)</th><th class="num">Lotlarda</th><th></th></tr></thead><tbody>
    ${UNITS.map((u, i) => `<tr><td class="muted c-hide">${i + 1}</td><td class="c-title">${esc(u.name)}</td>
      <td class="num">${u.pack_kg != null ? kgf(u.pack_kg) : '<span class="warn">kiritilmagan</span>'}</td><td class="num">${nf(u.used)}</td>
      <td class="nowrap">${w ? `<button class="btn small" data-ue="${u.id}">✎</button> <button class="btn small danger" data-ud="${u.id}">×</button>` : ''}</td></tr>`).join('')
      || `<tr><td colspan="5" class="muted">Hozircha birlik yo'q. "+ Birlik" yoki "Lotlardan yangilash" tugmasini bosing.</td></tr>`}
    </tbody></table></div>
    <p class="muted small">"1 birlik" — Qop (25 kg) uchun 25. Shundan 1 kg narxi hisoblanadi. Nomda kg/litr yozilgan bo'lsa (masalan "Qop (25 kg)"), hajm o'zi aniqlanadi. Birlik o'chirilsa, mavjud lotlar o'zgarmaydi.</p>`;
  const form = u => {
    modal(`<h2>${u ? 'Birlikni tahrirlash' : 'Yangi o\'lchov birligi'}</h2><div class="formgrid">
      <label>Nomi *<input id="u_name" value="${esc(u ? u.name : '')}" placeholder="Qop (25 kg)" autocomplete="off"></label>
      <label>1 birlik necha kg / litr<input id="u_pack" type="number" step="any" value="${esc(u && u.pack_kg != null ? u.pack_kg : '')}"></label></div>
      <div id="uHint" class="muted small" style="margin-top:10px"></div>
      ${u ? `<p class="muted small">Nomi yoki hajmi o'zgarsa, shu birlikdagi lotlar ham yangilanadi (1 kg narxi qayta hisoblanadi).${u.used ? ` Hozir ${nf(u.used)} ta lot.` : ''}</p>` : ''}
      <div class="actions"><button class="btn" type="button" onclick="closeModal()">Bekor</button><button class="btn primary" type="button" id="uSave">Saqlash</button></div>`);
    const hint = () => { const a = packKgJs($('#u_name').value), p = parseFloat($('#u_pack').value);
      $('#uHint').textContent = p > 0 ? '' : a ? `Hajm nomdan aniqlandi: ${kgf(a)} kg/l` : "Nomda kg/litr yo'q: hajmni o'zingiz kiriting, aks holda 1 kg narxi hisoblanmaydi."; };
    $('#u_name').oninput = hint; $('#u_pack').oninput = hint; hint();
    $('#uSave').onclick = async () => {
      try {
        const r = await api(u ? '/units/' + u.id : '/units', { method: u ? 'PUT' : 'POST', json: { name: $('#u_name').value, pack_kg: $('#u_pack').value } });
        closeModal(); toast(u ? `Saqlandi${r.updated_lots ? ` · ${nf(r.updated_lots)} ta lot yangilandi` : ''}` : "Birlik qo'shildi"); units();
      } catch (e) { toast(e.message); }
    };
  };
  if ($('#uAdd')) $('#uAdd').onclick = () => form(null);
  if ($('#uSync')) $('#uSync').onclick = async () => { try { const r = await api('/units/sync', { method: 'POST' }); toast(r.added ? `${r.added} ta yangi birlik qo'shildi` : "Yangi birlik topilmadi (hamma birlik ro'yxatda)"); units(); } catch (e) { toast(e.message); } };
  document.querySelectorAll('[data-ue]').forEach(b => b.onclick = () => form(UNITS.find(x => x.id == b.dataset.ue)));
  document.querySelectorAll('[data-ud]').forEach(b => b.onclick = async () => {
    const u = UNITS.find(x => x.id == b.dataset.ud);
    if (!confirm(`«${u.name}» ro'yxatdan o'chirilsinmi?\n${u.used ? `Mavjud ${u.used} ta lot o'zgarmaydi.` : ''}`)) return;
    try { await api('/units/' + u.id, { method: 'DELETE' }); units(); } catch (e) { toast(e.message); }
  });
}

/* ---------- Birja mahsulotlari (nomenklatura) ---------- */
async function exchprod() {
  await refreshMeta();
  const w = canWrite();
  $('#view').innerHTML = head('Birja mahsulotlari', "Nomenklatura: lotni qo'lda qo'shishda «Mahsulot nomi» maydoniga yozganda shu ro'yxatdan qidirib topiladi",
    w ? `<button class="btn" id="eSync">Lotlardan yangilash</button> <button class="btn primary" id="eAdd">+ Mahsulot</button>` : '') + `
    <div class="bar"><label>Qidiruv<input data-clear id="eQ" placeholder="mahsulot nomi" style="width:260px"></label><span class="muted small" id="eCnt"></span></div>
    <div id="eOut"></div>
    <p class="muted small">Nomi o'zgartirilsa, shu nomdagi lotlar ham yangilanadi. Mahsulot ro'yxatdan o'chirilsa, mavjud lotlar o'zgarmaydi.</p>`;
  const form = x => {
    modal(`<h2>${x ? 'Mahsulotni tahrirlash' : 'Yangi birja mahsuloti'}</h2><div class="formgrid" style="grid-template-columns:1fr">
      <label>Nomi *<input id="e_name" value="${esc(x ? x.name : '')}" placeholder="Shtukaturka (Gipsli)" autocomplete="off"></label></div>
      ${x && x.used ? `<p class="muted small">Nomi o'zgarsa, ${nf(x.used)} ta lot ham yangilanadi.</p>` : ''}
      <div class="actions"><button class="btn" type="button" onclick="closeModal()">Bekor</button><button class="btn primary" type="button" id="eSave">Saqlash</button></div>`);
    $('#e_name').focus();
    const save = async () => {
      try {
        const r = await api(x ? '/exchange-products/' + x.id : '/exchange-products', { method: x ? 'PUT' : 'POST', json: { name: $('#e_name').value } });
        closeModal(); toast(x ? `Saqlandi${r.updated_lots ? ` · ${nf(r.updated_lots)} ta lot yangilandi` : ''}` : "Mahsulot qo'shildi"); exchprod();
      } catch (e) { toast(e.message); }
    };
    $('#eSave').onclick = save; $('#e_name').onkeydown = e => { if (e.key === 'Enter') save(); };
  };
  const draw = () => {
    const words = $('#eQ').value.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = EXCH.filter(x => words.every(wd => x.name.toLowerCase().includes(wd)));
    $('#eCnt').textContent = words.length ? `${nf(rows.length)} / ${nf(EXCH.length)}` : `${nf(EXCH.length)} ta`;
    $('#eOut').innerHTML = `<div class="tablewrap"><table><thead><tr><th>№</th><th>Mahsulot nomi</th><th class="num">Lotlarda</th><th></th></tr></thead><tbody>
      ${rows.map((x, i) => `<tr><td class="muted c-hide">${i + 1}</td><td class="c-title">${esc(x.name)}</td><td class="num">${nf(x.used)}</td>
        <td class="nowrap">${w ? `<button class="btn small" data-ee="${x.id}">✎</button> <button class="btn small danger" data-ed="${x.id}">×</button>` : ''}</td></tr>`).join('')
        || `<tr><td colspan="4" class="muted">${EXCH.length ? 'Hech narsa topilmadi' : 'Hozircha mahsulot yo\'q. "+ Mahsulot" yoki "Lotlardan yangilash" tugmasini bosing.'}</td></tr>`}
      </tbody></table></div>`;
    document.querySelectorAll('[data-ee]').forEach(b => b.onclick = () => form(EXCH.find(x => x.id == b.dataset.ee)));
    document.querySelectorAll('[data-ed]').forEach(b => b.onclick = async () => {
      const x = EXCH.find(v => v.id == b.dataset.ed);
      if (!confirm(`«${x.name}» ro'yxatdan o'chirilsinmi?\n${x.used ? `Mavjud ${x.used} ta lot o'zgarmaydi.` : ''}`)) return;
      try { await api('/exchange-products/' + x.id, { method: 'DELETE' }); exchprod(); } catch (e) { toast(e.message); }
    });
  };
  $('#eQ').oninput = debounce(draw, 150);
  if ($('#eAdd')) $('#eAdd').onclick = () => form(null);
  if ($('#eSync')) $('#eSync').onclick = async () => { try { const r = await api('/exchange-products/sync', { method: 'POST' }); toast(r.added ? `${r.added} ta yangi mahsulot qo'shildi` : "Yangi mahsulot topilmadi (hammasi ro'yxatda)"); exchprod(); } catch (e) { toast(e.message); } };
  draw();
}

/* ---------- Mahsulotlar ---------- */
async function products() {
  await refreshMeta();
  $('#view').innerHTML = head('Mahsulotlarimiz', 'USTA-TRADE mahsulotlari: tan narx, sotuv narxi va birja bilan moslash kalit so\'zlari', '<button class="btn" id="pExp">Excel\'ga export</button> ' + (canWrite() ? '<button class="btn primary" id="addP">+ Mahsulot</button>' : '')) + `
  <div class="tablewrap"><table><thead><tr><th>№</th><th>Toifa</th><th>Nomi</th><th>Birlik</th><th class="num">Tan narx</th><th class="num">1 kg tan narx</th><th class="num">Sotuv narxi</th><th class="num">Marja</th><th class="num">Milliy do'kon</th><th>Kalit so'zlar</th><th></th></tr></thead><tbody>
  ${PRODUCTS.map((p, i) => { const m = p.cost != null && p.price ? (p.price - p.cost) * 100 / p.price : null; return `<tr><td class="muted c-hide">${i + 1}</td><td>${esc(p.category)}</td><td class="c-title">${esc(p.name)}</td><td>${esc(p.unit)}</td><td class="num">${nf(p.cost)}</td><td class="num">${p.pack_kg && p.cost != null ? nf(p.cost / p.pack_kg) : '—'}</td><td class="num">${nf(p.price)}</td>
  <td class="num ${m < 0 ? 'bad' : m < 15 ? 'warn' : ''}">${pct(m)}</td><td class="num">${p.price ? nf(p.price * (p.store_markup || 1.4)) : '—'}</td><td class="small muted">${esc(p.keywords)}</td>
  <td class="nowrap">${canWrite() ? `<button class="btn small" data-e="${p.id}">✎</button> <button class="btn small danger" data-d="${p.id}">×</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
  <p class="muted small">Marja = (sotuv narxi − tan narx) / sotuv narxi. Qizil: zarar, sariq: 15% dan past.</p>`;
  const form = p => modal(`<h2>${p ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</h2><div class="formgrid">
    ${[['category', 'Toifa'], ['name', 'Nomi'], ['unit', 'Birlik (masalan: 1 ta qopda 25 kg)'], ['cost', 'Tan narx (1 birlik)'], ['price', 'Sotuv narxi'], ['store_markup', "Milliy do'kon koeffitsiyenti"], ['cert_fee', "Sertifikat to'lovi"], ['keywords', 'Kalit so\'zlar (vergul bilan)']]
      .map(([k, l]) => `<label>${l}<input id="p_${k}" ${['cost', 'price', 'store_markup', 'cert_fee'].includes(k) ? 'type="number" step="any"' : ''} value="${esc(p ? p[k] : k === 'store_markup' ? 1.4 : '')}"></label>`).join('')}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" onclick="closeModal()">Bekor</button><button class="btn primary" id="pSave">Saqlash</button></div>`);
  $('#pExp').onclick = () => exportDialog({ title: "Mahsulotlarni Excel'ga export qilish", base: '/products/export' });
  if ($('#addP')) $('#addP').onclick = () => { form(null); $('#pSave').onclick = () => save(null); };
  document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { const p = PRODUCTS.find(x => x.id == b.dataset.e); form(p); $('#pSave').onclick = () => save(p.id); });
  document.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (!confirm('O\'chirilsinmi?')) return; await api('/products/' + b.dataset.d, { method: 'DELETE' }); products(); });
  async function save(id) {
    const g = k => $('#p_' + k).value.trim(), n = k => g(k) === '' ? null : parseFloat(g(k).replace(/\s/g, '').replace(',', '.'));
    const body = { category: g('category'), name: g('name'), unit: g('unit'), cost: n('cost'), price: n('price'), store_markup: n('store_markup') || 1.4, cert_fee: n('cert_fee'), keywords: g('keywords') };
    try { await api(id ? '/products/' + id : '/products', { method: id ? 'PUT' : 'POST', json: body }); closeModal(); products(); } catch (e) { toast(e.message); }
  }
}

/* ---------- Mening lotlarim ---------- */
const MYSUBS = [['new', 'Yangi'], ['won', "G'olib bo'lingan"], ['lost', 'Yutqazilgan'], ['rejected', 'Rad etilgan']];
const ST_LABEL = Object.fromEntries(MYSUBS);
const stPill = s => `<span class="pill st-${s}">${esc(ST_LABEL[s] || s)}</span>`;
const dtf = v => { if (!v) return '—'; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); return m ? `${m[3]}.${m[2]}.${m[1]}${m[4] ? ' ' + m[4] + ':' + m[5] : ''}` : esc(v); };
const dtf2 = v => { const t = dtf(v); const i = t.indexOf(' '); return i < 0 ? t : `${t.slice(0, i)}<div class="muted small">${t.slice(i + 1)}</div>`; };
const MLS = { sub: '', q: '', transfer: '', page: 1 };
const TRANSFER_LABEL = { pending: "O'tkazilmagan", paid: "O'tkazildi" };

async function mylots(sub) {
  sub = ST_LABEL[sub] ? sub : 'new';
  if (MLS.sub !== sub) Object.assign(MLS, { sub, q: '', transfer: '', page: 1 });
  const st = await api('/my-lots/stats'), w = canWrite();
  const kpi = (l, v, cls = '', extra = '') => `<div class="card kpi"><div class="l">${l}</div><div class="v ${cls}">${v}</div>${extra}</div>`;
  const wr = st.win_rate == null ? '—' : pct(st.win_rate), left = st.due_total - st.paid_total;
  const cards = {
    new: [kpi('Faol lotlar', nf(st.n_new)), kpi('24 soatda tugaydi', nf(st.ending_soon), st.ending_soon ? 'warn' : ''),
      kpi("G'alaba foizi", wr, '', `<div class="muted small">${st.n_won} yutgan / ${st.n_lost} yutqazgan</div>`), kpi('Rad etilgan', nf(st.n_rejected))],
    won: [kpi("G'olib lotlar", nf(st.n_won)), kpi("Jami o'tkazilishi kerak", som(st.due_total)), kpi("O'tkazildi", som(st.paid_total), 'good'),
      kpi('Qoldiq', som(left), left > 0 ? 'warn' : '', `<div class="muted small">${st.unpaid_n} ta lot o'tkazilmagan</div>`)],
    lost: [kpi('Yutqazilgan', nf(st.n_lost)), kpi("G'alaba foizi", wr)],
    rejected: [kpi('Rad etilgan', nf(st.n_rejected))],
  }[sub];
  $('#view').innerHTML = head('Mening lotlarim — ' + ST_LABEL[sub], "O'zimiz ishtirok etgan lotlar",
    `<button class="btn" id="mlExp">Excel'ga export</button> ` + (w ? `<a class="btn small" href="/api/my-lots/template">Shablon (.xlsx)</a> <button class="btn" id="mlImp">Excel import</button> <button class="btn primary" id="mlAdd">+ Yangi lot</button>` : '')) +
    `<div class="grid g4">${cards.join('')}</div>
    <div class="bar" style="margin-top:14px"><label>Qidiruv<input data-clear id="mlQ" placeholder="tovar, buyurtmachi, lot №, shartnoma" value="${esc(MLS.q)}" style="width:240px"></label>
    ${sub === 'won' ? `<label>O'tkazma<select id="mlT"><option value="">Barchasi</option><option value="pending" ${MLS.transfer === 'pending' ? 'selected' : ''}>O'tkazilmagan</option><option value="paid" ${MLS.transfer === 'paid' ? 'selected' : ''}>O'tkazildi</option></select></label>` : ''}</div>
    <div id="mlOut"></div>`;
  const again = () => { refreshCounts(); mylots(sub); };
  $('#mlExp').onclick = () => exportLots(sub);   // ustun tanlash oynasi; yuklash joriy filtr bo'yicha
  if (w) { $('#mlAdd').onclick = () => lotForm(null, sub, again); $('#mlImp').onclick = () => mlImportDialog(again); }
  $('#mlQ').oninput = debounce(() => { MLS.q = $('#mlQ').value; MLS.page = 1; load(); });
  if ($('#mlT')) $('#mlT').onchange = () => { MLS.transfer = $('#mlT').value; MLS.page = 1; load(); };

  async function load() {
    const d = await api('/my-lots?' + qs({ status: sub, q: MLS.q, transfer: sub === 'won' ? MLS.transfer : '', page: MLS.page, sort: 'starts_at', dir: 'desc', limit: 50 }));
    const pages = Math.max(1, Math.ceil(d.total / d.limit));
    const extraTh = {
      new: '<th>Status</th>',
      won: `<th class="num">Yakuniy narx</th><th>Shartnoma</th><th class="num">O'tkazilishi kerak</th><th>O'tkazildi</th>`,
      lost: `<th class="num">Bizning taklif</th><th class="num">G'olib narxi</th><th>G'olib kompaniya</th>`,
      rejected: '<th>Rad etish sababi</th>' }[sub];
    const hasSpecs = d.rows.some(r => r.specs), hasNotes = d.rows.some(r => r.notes);   // bo'sh "Xususiyatlari" ustuni joy egallamasin
    const rowHtml = (r, i) => {
      const left = r.ends_at ? new Date(r.ends_at.replace(' ', 'T')) - Date.now() : null;
      const soon = sub === 'new' && left !== null && left > 0 && left < 864e5, late = sub === 'new' && left !== null && left <= 0;
      const extra = {
        new: `<td>${stPill('new')}${soon ? ' <span class="pill st-rejected">tez tugaydi</span>' : late ? ' <span class="pill st-lost">tugagan</span>' : ''}</td>`,
        won: `<td class="num">${r.win_price != null ? nf(r.win_price) : '—'}</td>
          <td>${r.contract_no ? esc(r.contract_no) + '<br>' : ''}<a href="#" data-edit="${r.id}">PDF (${r.files_count})</a></td>
          <td class="num nowrap">${r.amount_due != null ? nf(r.amount_due) + ' UZS' : '—'}</td>
          <td>${w ? `<select class="tr tr-${r.transfer_status}" data-tr="${r.id}">${Object.entries(TRANSFER_LABEL).map(([k, t]) => `<option value="${k}" ${r.transfer_status === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`
            : `<span class="tr-${r.transfer_status}">${TRANSFER_LABEL[r.transfer_status]}</span>`}${r.transferred_at ? `<div class="muted small">${dtf(r.transferred_at)}</div>` : ''}</td>`,
        lost: `<td class="num">${r.our_bid != null ? nf(r.our_bid) : '—'}</td><td class="num">${r.win_price != null ? nf(r.win_price) : '—'}</td><td>${esc(r.winner_name) || '—'}</td>`,
        rejected: `<td>${esc(r.reject_reason) || '—'}</td>`,
      }[sub];
      return `<tr><td class="muted c-hide">${(d.page - 1) * d.limit + i + 1}</td><td class="c-cust">${esc(r.customer)}</td><td class="small">${esc(r.product_no) || '—'}</td><td>${esc(r.lot_no)}</td>
        <td class="c-title">${esc(r.product)}${r.brand ? `<div class="muted small">markasi: ${esc(r.brand)}</div>` : ''}</td>
        <td class="num">${nf(r.quantity)}</td>${hasSpecs ? `<td class="small">${esc(r.specs) || '—'}</td>` : ''}<td class="num nowrap">${r.start_price != null ? nf(r.start_price) + ' UZS' : '—'}</td>
        <td class="nowrap">${dtf2(r.starts_at)}</td><td class="nowrap ${soon ? 'warn' : late ? 'bad' : ''}">${dtf2(r.ends_at)}</td>${extra}${hasNotes ? `<td class="small c-note">${esc(r.notes) || '—'}</td>` : ''}
        <td class="act">${w && sub === 'new' ? `<button class="btn small" data-q="won:${r.id}">G'olib</button><button class="btn small" data-q="lost:${r.id}">Yutqazdi</button><button class="btn small" data-q="rejected:${r.id}">Rad</button>` : ''}
          <button class="btn small" data-edit="${r.id}">${w ? '✎' : "Ko'rish"}</button>${w ? `<button class="btn small danger" data-del="${r.id}">×</button>` : ''}</td></tr>`;
    };
    $('#mlOut').innerHTML = `<div class="tablewrap"><table><thead><tr><th>№</th><th>Buyurtmachi</th><th>Tovar №</th><th>Lot №</th><th>Tovar nomi</th><th class="num">Miqdori</th>${hasSpecs ? '<th>Xususiyatlari</th>' : ''}<th class="num">Boshlang'ich narxi</th><th>Boshlanish</th><th>Tugash</th>${extraTh}${hasNotes ? '<th>Izoh</th>' : ''}<th></th></tr></thead><tbody>
      ${d.rows.map(rowHtml).join('') || `<tr><td colspan="16" class="muted">Bu bo'limda lot yo'q</td></tr>`}</tbody></table></div>
      <div class="pager"><span class="muted">${nf(d.total)} ta lot</span><button class="btn small" id="mlPp" ${MLS.page <= 1 ? 'disabled' : ''}>←</button><span>${MLS.page} / ${pages}</span><button class="btn small" id="mlPn" ${MLS.page >= pages ? 'disabled' : ''}>→</button></div>`;
    $('#mlPp').onclick = () => { MLS.page--; load(); }; $('#mlPn').onclick = () => { MLS.page++; load(); };
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = e => { e.preventDefault(); lotForm(+b.dataset.edit, null, again); });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm("Lot va uning PDF fayllari o'chirilsinmi?")) return;
      try { await api('/my-lots/' + b.dataset.del, { method: 'DELETE' }); again(); } catch (e) { toast(e.message); }
    });
    document.querySelectorAll('[data-tr]').forEach(sel => sel.onchange = async () => {
      try { await api('/my-lots/' + sel.dataset.tr, { method: 'PATCH', json: { transfer_status: sel.value, transferred_at: sel.value === 'paid' ? nowLocal() : '' } }); toast(TRANSFER_LABEL[sel.value]); again(); }
      catch (e) { toast(e.message); }
    });
    document.querySelectorAll('[data-q]').forEach(b => b.onclick = async () => {   // tezkor natija: G'olib / Yutqazdi / Rad -> tafsilot oynasi ochiladi
      const [status, id] = b.dataset.q.split(':');
      try { await api('/my-lots/' + id, { method: 'PATCH', json: { status } }); again(); lotForm(+id, null, again); } catch (e) { toast(e.message); }
    });
  }
  await load();
}

/* ---------- Excel'ga export: ustunlarni tanlash (tanlovni doimiy saqlash mumkin, foydalanuvchi bo'yicha) ----------
   Umumiy oyna: o = { title, base: '/my-lots/export', q: {status}, note, params: () => ({filtrlar}) }
   Server: GET base/columns -> {columns, saved}; PUT/DELETE base/columns; GET base?cols=a,b -> .xlsx */
async function exportDialog(o) {
  let info;
  try { info = await api(o.base + '/columns?' + qs(o.q || {})); } catch (e) { return toast(e.message); }
  const on = new Set(info.saved || info.columns.map(c => c.key));
  modal(`<h2>${esc(o.title)}</h2>
    <p class="muted">Faylga qo'shiladigan ustunlarni tanlang.${o.note ? ' ' + esc(o.note) : ''}</p>
    <div class="xc-tools"><button class="btn small" type="button" id="xAll">Hammasini tanlash</button><button class="btn small" type="button" id="xNone">Tozalash</button>
      <span class="muted small" id="xCnt"></span></div>
    <div class="xc-grid">${info.columns.map(c => `<label class="xc"><input type="checkbox" data-k="${esc(c.key)}" ${on.has(c.key) ? 'checked' : ''}><span>${esc(c.label)}</span></label>`).join('')}</div>
    <label class="xc xc-save"><input type="checkbox" id="xSave" ${info.saved ? 'checked' : ''}><span>Bu tanlovni doimiy saqlash <span class="muted">(keyingi safar shu ustunlar tanlangan holda ochiladi)</span></span></label>
    <div class="actions">${info.saved ? '<button class="btn ghost" type="button" id="xReset" style="margin-right:auto">Standartga qaytarish</button>' : ''}
      <button class="btn" type="button" onclick="closeModal()">Bekor</button><button class="btn primary" type="button" id="xGo">Yuklab olish</button></div>`);
  const boxes = () => [...document.querySelectorAll('#modalBox input[data-k]')];
  const count = () => { const n = boxes().filter(b => b.checked).length; $('#xCnt').textContent = `${n} / ${boxes().length} ustun tanlangan`; $('#xGo').disabled = !n; };
  boxes().forEach(b => b.onchange = count); count();
  $('#xAll').onclick = () => { boxes().forEach(b => b.checked = true); count(); };
  $('#xNone').onclick = () => { boxes().forEach(b => b.checked = false); count(); };
  if ($('#xReset')) $('#xReset').onclick = async () => {
    try { await api(o.base + '/columns?' + qs(o.q || {}), { method: 'DELETE' }); } catch (e) { return toast(e.message); }
    boxes().forEach(b => b.checked = true); $('#xSave').checked = false; $('#xReset').remove(); count(); toast('Standart sozlamaga qaytdi (hamma ustun)');
  };
  $('#xGo').onclick = async () => {
    const cols = boxes().filter(b => b.checked).map(b => b.dataset.k);
    if (!cols.length) return toast('Kamida bitta ustun tanlang');
    if ($('#xSave').checked) { try { await api(o.base + '/columns', { method: 'PUT', json: { ...(o.q || {}), cols } }); } catch (e) { return toast(e.message); } }
    location.href = '/api' + o.base + '?' + qs({ ...(o.params ? o.params() : {}), cols: cols.join(',') });
    closeModal();
  };
}
const exportLots = sub => exportDialog({ title: `Excel'ga export — ${ST_LABEL[sub] || ''}`, base: '/my-lots/export', q: { status: sub },
  note: "Qatorlar joriy qidiruv/filtr bo'yicha yuklanadi.", params: () => ({ status: sub, q: MLS.q, transfer: sub === 'won' ? MLS.transfer : '' }) });

async function lotForm(id, preset, onDone) {
  const ro = !canWrite();
  let L = { status: ST_LABEL[preset] ? preset : 'new', transfer_status: 'pending', files: [] };
  if (id) { try { L = await api('/my-lots/' + id); } catch (e) { return toast(e.message); } }
  const tl = x => x ? String(x).replace(' ', 'T').slice(0, 16) : '';
  const f = (k, label, type = 'text', extra = '') => `<label>${label}<input id="m_${k}" type="${type}" value="${esc(type === 'datetime-local' ? tl(L[k]) : L[k] ?? '')}" ${extra}></label>`;
  modal(`<h2>${id ? (ro ? "Lot ma'lumoti" : 'Lotni tahrirlash') : 'Yangi lot'}</h2><fieldset ${ro ? 'disabled' : ''}>
    <div class="formgrid">${f('lot_no', 'Lot №')}${f('product_no', 'Tovar №')}${f('product', 'Tovar nomi')}${f('customer', 'Buyurtmachi')}${f('brand', 'Markasi')}${f('quantity', 'Miqdori', 'number', 'step="any"')}${f('specs', 'Tovarning xususiyatlari')}
      ${f('start_price', "Boshlang'ich narx (so'm)", 'number', 'step="any"')}${f('starts_at', 'Boshlanish sanasi', 'datetime-local')}${f('ends_at', 'Tugash sanasi', 'datetime-local')}
      <label>Holati<select id="m_status">${MYSUBS.map(([k, t]) => `<option value="${k}" ${L.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <div id="secBid" class="formgrid sec">${f('our_bid', 'Bizning taklif narxi', 'number', 'step="any"')}<label><span id="lblWin"></span><input id="m_win_price" type="number" step="any" value="${esc(L.win_price ?? '')}"></label>
      <span id="wrapWinner">${f('winner_name', "G'olib kompaniya")}</span></div>
    <div id="secRej" class="sec"><label>Rad etish sababi<textarea id="m_reject_reason" rows="2">${esc(L.reject_reason ?? '')}</textarea></label></div>
    <div id="secWon" class="formgrid sec">${f('contract_no', 'Shartnoma raqami')}${f('contract_date', 'Shartnoma sanasi', 'date')}${f('amount_due', "O'tkazib berilishi kerak summa (so'm)", 'number', 'step="any"')}
      <label>O'tkazma holati<select id="m_transfer_status">${Object.entries(TRANSFER_LABEL).map(([k, t]) => `<option value="${k}" ${L.transfer_status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <span id="wrapTdate">${f('transferred_at', "O'tkazilgan sana va vaqt", 'datetime-local')}</span>
      <div id="mSum" class="muted small" style="grid-column:1/-1"></div></div>
    <label class="sec">Izoh<textarea id="m_notes" rows="2">${esc(L.notes ?? '')}</textarea></label>
    <div id="secFiles" class="sec"><h3>Shartnoma PDF lari</h3><div id="fileList"></div>
      ${ro ? '' : id ? `<div class="filebar"><input type="file" id="m_files" accept="application/pdf,.pdf" multiple><button class="btn" id="fUp" type="button">Yuklash</button></div>`
        : '<p class="muted small">PDF fayllarni lot saqlangandan keyin qo\'shasiz.</p>'}</div></fieldset>
    <div class="actions"><button class="btn" type="button" onclick="closeModal()">${ro ? 'Yopish' : 'Bekor'}</button>${ro ? '' : '<button class="btn primary" type="button" id="mSave">Saqlash</button>'}</div>`, true);
  const show = (sel, on) => $(sel).classList.toggle('hidden', !on);
  const sync = () => {
    const s = $('#m_status').value;
    show('#secBid', s === 'won' || s === 'lost'); show('#wrapWinner', s === 'lost'); show('#secRej', s === 'rejected'); show('#secWon', s === 'won'); show('#secFiles', s === 'won');
    $('#lblWin').textContent = s === 'won' ? 'Yakuniy narx (shartnoma)' : "G'olib narxi";
    show('#wrapTdate', $('#m_transfer_status').value === 'paid');
  };
  // shartnoma summasi = yakuniy narx × miqdor (faqat ko'rsatma; "o'tkazib berilishi kerak summa" ni o'zi o'zgartirmaydi, tugma bosilganda qo'yadi)
  const sumHint = () => {
    const el = $('#mSum'), wp = parseFloat($('#m_win_price').value), q = parseFloat($('#m_quantity').value);
    if (!(wp >= 0 && q > 0)) { el.textContent = ''; return; }
    const s = Math.round(wp * q * 100) / 100;
    el.innerHTML = `Shartnoma summasi (yakuniy narx × miqdor): <b>${nf(s)}</b> so'm <span class="muted">(${nf(wp)} × ${nf(q)})</span>` +
      (ro ? '' : ` <button class="btn small" type="button" id="mSumSet">O'tkazib berilishi kerak summaga qo'yish</button>`);
    if ($('#mSumSet')) $('#mSumSet').onclick = () => {        // son maydoni yashirin: qiymat ko'rinadigan (formatlangan) maydon orqali yoziladi
      const vis = $('#m_amount_due').previousElementSibling; if (vis && vis.classList.contains('num-text')) { vis.value = String(s); vis.dispatchEvent(new Event('input')); } else $('#m_amount_due').value = s;
    };
  };
  ['m_win_price', 'm_quantity'].forEach(i => $('#' + i).addEventListener('input', sumHint)); sumHint();
  $('#m_status').onchange = sync; sync();
  $('#m_transfer_status').onchange = () => {            // "O'tkazildi" tanlansa, sana-vaqt bo'sh bo'lsa hozirgi vaqt qo'yiladi
    sync();
    const o = $('#m_transferred_at');
    if ($('#m_transfer_status').value === 'paid' && !o.value) o._set ? o._set(nowLocal()) : (o.value = nowLocal());
  };
  sync();

  const renderFiles = files => {
    $('#fileList').innerHTML = files.length ? files.map(x => `<div class="frow"><a href="/api/my-lots/files/${x.id}" target="_blank" rel="noopener">📄 ${esc(x.original_name)}</a>
      <span class="muted small">${x.size < 1024 ? x.size + ' B' : nf(x.size / 1024) + ' KB'}</span>${ro ? '' : `<button class="btn small danger" type="button" data-fd="${x.id}">×</button>`}</div>`).join('') : '<p class="muted small">Hali fayl yuklanmagan</p>';
    document.querySelectorAll('[data-fd]').forEach(b => b.onclick = async () => {
      if (!confirm("Fayl o'chirilsinmi?")) return;
      try { await api('/my-lots/files/' + b.dataset.fd, { method: 'DELETE' }); L.files = L.files.filter(x => x.id != b.dataset.fd); renderFiles(L.files); onDone && onDone(); } catch (e) { toast(e.message); }
    });
  };
  renderFiles(L.files);
  if ($('#fUp')) $('#fUp').onclick = async () => {
    const fl = $('#m_files').files; if (!fl.length) return toast('PDF fayl tanlang');
    const fd = new FormData(); [...fl].forEach(x => fd.append('files', x)); $('#fUp').disabled = true;
    try {
      const r = await api(`/my-lots/${id}/files`, { method: 'POST', form: fd });
      toast(`Yuklandi: ${r.added} ta${r.rejected.length ? ` · PDF emas: ${r.rejected.join(', ')}` : ''}`);
      L = await api('/my-lots/' + id); renderFiles(L.files); $('#m_files').value = ''; onDone && onDone();
    } catch (e) { toast(e.message); } finally { $('#fUp').disabled = false; }
  };
  if ($('#mSave')) $('#mSave').onclick = async () => {
    if (document.querySelector('#modalBox .dt-text.invalid')) return toast('Sana/vaqt noto\'g\'ri. Format: kk.oo.yyyy ss:dd');
    const body = {};
    ['lot_no', 'product_no', 'product', 'brand', 'customer', 'quantity', 'specs', 'start_price', 'starts_at', 'ends_at', 'status', 'reject_reason', 'our_bid', 'win_price', 'winner_name',
      'contract_no', 'contract_date', 'amount_due', 'transfer_status', 'transferred_at', 'notes'].forEach(k => body[k] = $('#m_' + k).value);
    try {
      const r = await api(id ? '/my-lots/' + id : '/my-lots', { method: id ? 'PUT' : 'POST', json: body });
      closeModal(); onDone && onDone();
      if (!id && body.status === 'won') { toast("Saqlandi. Endi shartnoma PDF larini qo'shing"); lotForm(r.id, null, onDone); } else toast('Saqlandi');
    } catch (e) { toast(e.message); }
  };
}

function mlImportDialog(onDone) {
  modal(`<h2>Mening lotlarimni import qilish</h2>
  <p class="muted">.xlsx yoki .csv fayl (xarid.uzex.uz dagi "mening lotlarim" jadvali: №, Tovar №, Lot №, Tovar nomi, Miqdori, Xususiyatlari, Boshlang'ich narxi, sanalar, Status). Status matnidan holat avtomatik aniqlanadi (Yangi / G'olib / Yutqazilgan / Rad etilgan). Lot raqami takrorlansa, mavjud yozuv yangilanadi, qo'lda kiritilgan summa, shartnoma va o'tkazma ma'lumotlari saqlanib qoladi.</p>
  <input type="file" id="impFile" accept=".xlsx,.xls,.csv"><div id="impOut" style="margin:12px 0"></div>
  <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" onclick="closeModal()">Yopish</button><button class="btn primary" id="impGo">Yuklash</button></div>`);
  $('#impGo').onclick = async () => {
    const file = $('#impFile').files[0]; if (!file) return toast('Fayl tanlang');
    const fd = new FormData(); fd.append('file', file); $('#impOut').textContent = 'Yuklanmoqda…';
    try {
      const r = await api('/my-lots/import', { method: 'POST', form: fd });
      $('#impOut').innerHTML = `<div class="bignote good">Yangi: <b>${r.inserted}</b> · Yangilandi: <b>${r.updated}</b> · O'tkazib yuborildi: <b>${r.skipped}</b></div>${r.errors.length ? `<ul class="small bad">${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}`;
      onDone && onDone();
    } catch (e) { $('#impOut').innerHTML = `<div class="bad">${esc(e.message)}</div>`; }
  };
}

/* ---------- Sozlamalar ---------- */
async function settings() {
  let usersHtml = '';
  if (ME.role === 'admin') {
    const us = await api('/users');
    usersHtml = `<div class="card" style="margin-top:14px"><h2>Jamoa a'zolari</h2>
    <table><thead><tr><th>Login</th><th>Ism</th><th>Rol</th><th></th></tr></thead><tbody>${us.map(u => `<tr><td class="c-title">${esc(u.username)}</td><td>${esc(u.full_name)}</td><td><span class="pill">${u.role}</span></td><td>${u.id !== ME.id ? `<button class="btn small danger" data-u="${u.id}">O'chirish</button>` : ''}</td></tr>`).join('')}</tbody></table>
    <h3 style="margin-top:16px">Yangi foydalanuvchi</h3><div class="formgrid"><label>Login<input id="nuL"></label><label>Ism<input id="nuN"></label><label>Parol (min 6)<input id="nuP" type="password"></label>
    <label>Rol<select id="nuR"><option value="analyst">analyst — import va tahrir</option><option value="viewer">viewer — faqat ko'rish</option><option value="admin">admin</option></select></label></div>
    <button class="btn primary" id="nuGo" style="margin-top:10px">Qo'shish</button></div>`;
  }
  $('#view').innerHTML = head('Sozlamalar') + `<div class="card"><h2>Parolni almashtirish</h2><div class="formgrid"><label>Joriy parol<input id="opw" type="password"></label><label>Yangi parol<input id="npw" type="password"></label></div>
    <button class="btn primary" id="pwGo" style="margin-top:10px">Almashtirish</button></div>` + usersHtml;
  $('#pwGo').onclick = async () => { try { await api('/me/password', { method: 'POST', json: { old_password: $('#opw').value, new_password: $('#npw').value } }); toast('Parol almashtirildi'); $('#opw').value = $('#npw').value = ''; } catch (e) { toast(e.message); } };
  if ($('#nuGo')) $('#nuGo').onclick = async () => { try { await api('/users', { method: 'POST', json: { username: $('#nuL').value, full_name: $('#nuN').value, password: $('#nuP').value, role: $('#nuR').value } }); toast('Qo\'shildi'); settings(); } catch (e) { toast(e.message); } };
  document.querySelectorAll('[data-u]').forEach(b => b.onclick = async () => { if (confirm('Foydalanuvchi o\'chirilsinmi?')) { await api('/users/' + b.dataset.u, { method: 'DELETE' }); settings(); } });
}

const VIEWS = { dashboard, mylots, lots, trend, margin, rank, products, exchprod, units, settings };
boot();
