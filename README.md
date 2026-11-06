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
Qatorni tahrirlash: "Lotlar bazasi" jadvalida qator oxiridagi ✎ tugmasi (admin va analyst). Tahrirlangan demo lot haqiqiy hisoblanadi ("Demoni o'chirish" uni o'chirmaydi). Lot raqami boshqa lotnikiga o'zgartirilsa, saqlanmaydi.
Qadoq hajmi o'lchov birligidan olinadi ("Qop (30 kg)" → 30), 1 kg narx = yakuniy narx / kg.

## O'lchov birliklari (nomenklatura)
Menyu: O'lchov birliklari. "Lotlar bazasi" → "+ Yangi lot" dagi «O'lchov birligi» dropdown'i shu ro'yxatdan to'ladi.
- Nomi ("Qop (25 kg)") va "1 birlik necha kg/litr" (nomda kg yozilgan bo'lsa o'zi aniqlanadi). 1 kg narxi shu hajmdan hisoblanadi.
- Birinchi ishga tushishda ro'yxat mavjud lotlardagi birliklardan to'ldiriladi; keyinchalik "Lotlardan yangilash" tugmasi yangi birliklarni qo'shadi.
- Birlik nomi yoki hajmi o'zgartirilsa, shu birlikdagi lotlar ham yangilanadi (1 kg narxi qayta hisoblanadi). Birlik o'chirilsa, lotlar o'zgarmaydi.
- Excel importda ham ro'yxatdagi hajm ishlatiladi (nomdan taxmin qilishdan ustun).

## Birja mahsulotlari (nomenklatura)
Menyu: Birja mahsulotlari. "Lotlar bazasi" → "+ Yangi lot" dagi «Mahsulot nomi» maydoniga yozganda shu ro'yxatdan qidirib topiladi (katta-kichik harf farqsiz, bir nechta so'z bo'yicha); nom ustiga bir marta bosilsa (yoki ↑ ↓ + Enter) tanlanadi.
- Birinchi ishga tushishda ro'yxat mavjud lotlardagi mahsulot nomlaridan to'ldiriladi; keyinchalik "Lotlardan yangilash" tugmasi yangi nomlarni qo'shadi.
- Nomi o'zgartirilsa, shu nomdagi lotlar ham yangilanadi. Mahsulot o'chirilsa, lotlar o'zgarmaydi.
- Ro'yxatda yo'q nom yozilsa ham lotni saqlash mumkin, lekin oynada eslatma chiqadi.

## Raqobat va buyurtmachilar
- Hudud filtri: «G'olib hududi» va «Buyurtmachi hududi» (ikkalasi birga ham ishlaydi) hamma tablarga ta'sir qiladi. Jadvalda korxonaning eng ko'p uchraydigan hududi ko'rsatiladi. «Qidiruv» nom bo'yicha qidiradi.
- Bir korxonaning turlicha yozilgan nomlarini birlashtirish (G'oliblar va Buyurtmachilar tablarida, admin va analyst):
  - qatorlarni belgilab «Birlashtirish» tugmasini bosing yoki «O'xshash nomlarni topish» ga bering. U harf, tirnoq/apostrof, MCHJ/XK/YTT kabi shakl va so'z tartibi farqini («Aniq»), shuningdek 1–3 harflik xatoni («Taxminiy») topadi. Taxminiylarni birlashtirishdan oldin tekshiring.
  - Yakuniy nomni tanlaysiz yoki o'zingiz yozasiz. Lotlardagi g'olib va buyurtmachi ustunlarida hamda «Mening lotlarim»da (buyurtmachi, g'olib) nomlar almashtiriladi.
  - Variantlar `name_aliases` jadvaliga yoziladi: keyingi Excel importlarda va qo'lda kiritishda ular avtomatik yakuniy nomga almashadi. Har bir birlashtirish `name_merge_log` jadvaliga (qaysi lotlar o'zgargani bilan) yoziladi.
  - Dastur ichida bekor qilish yo'q. Nomlar faqat aniq moslik bo'yicha almashtiriladi (katta-kichik harf va ortiqcha bo'shliq e'tiborga olinmaydi).

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
server.js (API) · lib/db.js (PostgreSQL, sxema) · lib/parse.js (Excel tahlili) · lib/names.js (korxona nomlarini solishtirish) · public/ (interfeys) · seed/ (mahsulotlar Excel)
