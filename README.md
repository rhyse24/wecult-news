# WeCult News — Proje Hafızası

> Bu dosya her AI session başında okunmalı. Neyi yaptık, nerede kaldık, kesin kurallar.

---

## Proje Nedir

**news.wecult.app** — WeCult'un haber/analiz sitesi.  
Astro SSG + GitHub Actions pipeline + Vercel deploy.  
Film, dizi, oyun ve kitap kategorilerinde AI destekli haber üretir.

---

## Canlı Durum

| Şey | Durum |
|-----|-------|
| Domain | `news.wecult.app` — canlı, Cloudflare DNS |
| Deploy | Vercel (otomatik, her push'ta) |
| Pipeline | GitHub Actions cron — çalışıyor |
| Ana site linki | `wecult.app` header + footer'da var |
| News → Ana site | Header badge + drawer link + footer link var |

---

## Pipeline Nasıl Çalışır

```
Saat başı tetiklenir (00:00–11:00 UTC)
→ RSS beslemelerinden haber çeker (6 kaynak × 4 kategori)
→ Reddit trending sinyaliyle skorlar
→ Gemini Flash ile EN makale yazar (700–900 kelime)
→ Kalite gate'ten geçirir (Rule 8)
→ Hallucination guard (Rule 9)
→ TR'ye çevirir (400+ kelime)
→ src/content/articles/ içine JSON kaydeder
→ git commit + push
→ Vercel deploy hook tetiklenir
→ Site yeniden build olur
```

**Günde 12 run × 1 makale = 12 makale/gün**

---

## Pipeline Cron Ayarı

```yaml
cron: '0 0-11 * * *'   # Her saat, 00:00–11:00 UTC arası
```

Manuel tetikleme: GitHub → Actions → "Run workflow"

---

## GitHub Secrets (Tanımlı — Dokunma)

| Secret | Ne İçin |
|--------|---------|
| `GEMINI_API_KEY` | Makale yazma + TR çeviri |
| `TAVILY_API_KEY` | Web arama (içerik zenginleştirme) |
| `TMDB_READ_ACCESS_TOKEN` | Film/dizi görselleri |
| `TWITCH_CLIENT_ID` | IGDB oyun görselleri |
| `TWITCH_CLIENT_SECRET` | IGDB oyun görselleri |
| `VERCEL_DEPLOY_HOOK` | Push sonrası Vercel deploy tetikler |

---

## Makale Kalite Kuralları (KESİN — Değiştirme)

### Rule 1 — Minimum Uzunluk
- EN body: **≥ 600 kelime** (ideal 700–900)
- TR body: **≥ 400 kelime**
- **≥ 2 ## heading** zorunlu
- Truncation marker (`[…]`, `read more` vb.) → red

### Rule 2 — Zorunlu Yapı
```
Hook (2–3 cümle, canlı açılış)
## Bağlam başlığı
## Ana haber başlığı
## Fan/topluluk açısı
## What's Next
```

### Rule 3 — Hallüsinasyon Yasak
- Uydurma alıntı yok
- Uydurma tarih/rakam/oyuncu yok
- Bilinmiyorsa: "henüz açıklanmadı" yaz

### Rule 4 — Ses ve Ton (Kategori Bazlı)
- Games: tutkulu oyun gazetecisi
- Film: film eleştirmeni sesi
- TV: dizi yazarı tonu
- Books: edebi gazetecilik

### Rule 5 — RSS Teaser Yasağı
- RSS snippet tam makale değil — kelimesi kelimesine kopyalama yasak
- Gemini kendi bilgisi + Tavily araması ile orijinal içerik yazar

### Rule 6 — Kaynak Bar
- Her makalede kaynak gösterilir (Astro sayfalarında handle edildi)

### Rule 7 — Kategori Tonu
- Her kategori için ayrı ses tonu var (summarize.mjs içinde)

### Rule 8 — Quality Gate
- `validateArticle()` fonksiyonu — tüm kontroller geçmezse makale kaydedilmez
- 3 deneme hakkı, hepsi başarısızsa makale atlanır

### Rule 9 — Hallucination Guard
- `titleEntityPresent()` — başlıktaki anahtar kelimeler body'de %40 oranında bulunmalı
- Geçemezse makale atlanır

---

## TR Çeviri Kuralları (KESİN)

- Tüm çıktı Türkçe (başlık, özet, body, başlıklar)
- Özel isimler olduğu gibi kalır (Park Chan-wook, Netflix, Steam)
- Kategori terimleri kalabilir (DLC, showrunner, bestseller)
- TR başlığı EN başlığıyla aynıysa → red, tekrar dene
- TR body EN'in kopyasıysa → red, tekrar dene

---

## Dosya Yapısı

```
src/
  content/articles/     ← Pipeline'ın yazdığı JSON'lar (git'te)
  components/
    article/ArticleCard.astro
    layout/Header.astro
    layout/Footer.astro
    ui/WeCultCTA.astro  ← Makale içi CTA widget
  i18n/
    en.json             ← İngilizce UI metinleri
    tr.json             ← Türkçe UI metinleri
  lib/
    articles.ts         ← Makale yükleme + filtreleme
    i18n.ts             ← t() fonksiyonu, SUPPORTED_LANGS: ['en','tr']
  pages/
    index.astro         ← EN ana sayfa
    [category].astro    ← EN kategori sayfaları
    article/[slug].astro
    tag/[tag].astro
    privacy.astro
    terms.astro
    404.astro
    tr/                 ← TR versiyonları (aynı yapı)
      index.astro
      [category].astro
      article/[slug].astro
      tag/[tag].astro
      404.astro
scripts/pipeline/
  run.mjs               ← Ana pipeline orchestrator
  summarize.mjs         ← Gemini prompt + kalite kuralları
  fetch.mjs             ← RSS fetcher
  search.mjs            ← Tavily + görsel arama
  sources.mjs           ← RSS kaynakları + MAX_TOTAL/MAX_PER_CATEGORY
  retranslate.mjs       ← TR eksik makaleleri sonradan çevirir
  re-expand.mjs         ← Kısa makaleleri genişletir
.github/workflows/
  pipeline.yml          ← Cron job
```

---

## RSS Kaynakları (sources.mjs)

| Kategori | Kaynaklar |
|----------|-----------|
| Games | IGN, Eurogamer, Rock Paper Shotgun, GameSpot, Kotaku, PC Gamer |
| Film | Variety, Deadline, Hollywood Reporter, IndieWire, The Wrap, Screen Rant |
| TV | TVLine, Den of Geek, Collider, Slash Film, Guardian TV |
| Books | Tor.com, Guardian Books, Book Riot, Literary Hub, NY Times Books |

**MAX_PER_SOURCE = 2, MAX_PER_CATEGORY = 2, MAX_TOTAL = 1**

---

## Cross-link Durumu (wecult.app ↔ news.wecult.app)

### wecult.app → news.wecult.app
- Header nav'da "News" linki var
- Footer product sütununda "WeCult News" linki var
- Hero'da App Store/Google Play altında News butonu var

### news.wecult.app → wecult.app
- Header'da logo badge ("WeCult App") var
- Mobil drawer'da link var
- Footer'da "WeCult Uygulaması" linki var
- WeCultCTA widget'ı (makale içi) → wecult.app'e yönlendiriyor
- Floating pill modal → wecult.app'e yönlendiriyor

---

## i18n Kuralları

- `SUPPORTED_LANGS = ['en', 'tr']`
- `t(lang, 'key.path')` ile tüm UI metinleri
- es/pt/ja JSON dosyaları var ama kullanılmıyor (Lang type'dan geliyor, dokunma)
- TR sayfalar `/tr/` prefix'i ile

---

## Bilinen Sınırlamalar / Sonraki Adaylar

- [ ] AdSense onayı bekliyor (gerçek makaleler birikince başvurulacak)
- [ ] Import (Letterboxd/Goodreads) özelliği planlanıyor — henüz başlanmadı
- [ ] Arama sayfası yok (sadece kategori + tag filtreleme var)
- [ ] Yorum/tepki sistemi yok

---

## Önemli Kararlar (Değiştirme)

| Karar | Sebep |
|-------|-------|
| Astro SSG (statik) | Vercel free tier, SEO, hız |
| Her run 1 makale/kategori | Gemini quota koruma (1500 RPD) |
| 00:00–11:00 UTC cron | Türkiye sabahı ile örtüşüyor (03:00–14:00 TR) |
| TR çeviri Gemini ile | Ayrı API maliyeti yok |
| base: '/' | news.wecult.app subdomain (eski /news path değil) |
| Mock data kaldı | Gerçek makaleler pipeline'dan geliyor, mock fallback |
