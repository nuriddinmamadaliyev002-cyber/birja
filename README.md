# Birja Analitika — xarid.uzex.uz bozor tahlili (Node.js + PostgreSQL)

## 1. PostgreSQL
Variant A (Docker): `docker compose up -d`  → baza `birja` tayyor (login/parol: postgres/postgres).
Variant B (o'rnatilgan PostgreSQL): `CREATE DATABASE birja;` qiling.

## 2. Sozlash va ishga tushirish
    npm install
    cp .env.example .env      # kerak bo'lsa DATABASE_URL ni tahrirlang
    npm start                 # http://localhost:3000
Jadvallar avtomatik yaratiladi. Birinchi ishga tushirishda konsolda `admin` paroli chiqadi.
Ixtiyoriy: `npm run demo` — 700 ta DEMO lot (admin paneldan o'chiriladi).

## Ma'lumot kiritish
"Lotlar bazasi" → "Excel/CSV import" (shablon shu yerda). Lot raqami bo'yicha dublikat bo'lmaydi.
Qadoq hajmi o'lchov birligidan olinadi ("Qop (30 kg)" → 30), 1 kg narx = yakuniy narx / kg.

## Mening lotlarim (o'zimiz ishtirok etgan lotlar)
Menyu: Mening lotlarim → Yangi / G'olib bo'lingan / Yutqazilgan / Rad etilgan.
- Lotni qo'lda ("+ Yangi lot") yoki xarid.uzex.uz dagi "mening lotlarim" jadvalini Excel/CSV qilib import qilish mumkin (status matnidan holat avtomatik aniqlanadi; shablon shu yerda).
- "Yangi" lotda tezkor tugmalar: G'olib / Yutqazdi / Rad — bosilganda tafsilot oynasi ochiladi.
- G'olib lotlarda: yakuniy narx, shartnoma raqami/sanasi, shartnoma PDF lari, o'tkazib berilishi kerak summa va "O'tkazildi / O'tkazilmagan" dropdown.
- Qayta import qilganda qo'lda kiritilgan summa, shartnoma va o'tkazma ma'lumotlari o'zgarmaydi.
- PDF fayllar `data/uploads/my-lots/` da saqlanadi (`UPLOAD_DIR` bilan o'zgartiriladi). **Zaxira nusxaga bu papkani ham qo'shing** (`pg_dump` fayllarni o'z ichiga olmaydi).

## Rollar
admin (hammasi) · analyst (import, tahrir) · viewer (faqat ko'rish)

## Serverga joylashtirish
HTTPS ortida ishlating, `COOKIE_SECURE=1`. Bazadan muntazam nusxa oling: `pg_dump birja > backup.sql`.

## Tuzilma
server.js (API) · lib/db.js (PostgreSQL, sxema) · lib/parse.js (Excel tahlili) · public/ (interfeys) · seed/ (mahsulotlar Excel)
