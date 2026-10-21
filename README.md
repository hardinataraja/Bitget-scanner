# [BITGET] EARLY GAINER SCANNER

Dashboard analisis Bitget Spot USDT untuk mendeteksi koin dengan tanda awal momentum/volume sebelum atau saat masuk Top Gainer. **Bukan saran investasi dan bukan prediksi harga.** Skor = kekuatan sinyal, bukan probabilitas profit.

Stack: HTML5 + CSS3 + JavaScript vanilla, Bootstrap 5.3.3, Bootstrap Icons 1.11.3, Lightweight Charts 4.1.3 (semua via CDN jsDelivr), font JetBrains Mono (Google Fonts), Vercel Functions (Node 24.x). Tanpa database, tanpa API key.

## Struktur
```
index di public/index.html   (vercel.json: outputDirectory = "public")
api/_lib.js tickers.js candles.js market.js health.js
public/css/style.css, public/js/{app,api,scanner,scoring,charts,watchlist,settings}.js
tests/test.js
```
Catatan: berbeda dari contoh brief, `index.html` ada di `public/` dan `vercel.json` memakai `outputDirectory: "public"` agar aset statis dilayani konsisten di Vercel.

## Deploy
1. **Ekstrak** ZIP ke satu folder (isi ZIP langsung berupa file proyek, tanpa folder bersarang).
2. **GitHub**: buat repository baru, upload semua file. Pastikan `package.json`, `vercel.json`, `public/`, `api/` ada di root repository.
3. **Vercel**: Add New Project → Import repo → Root Directory = root (kosongkan) → Framework Preset = *Other* → Build Command kosong → tidak perlu environment variable → Deploy.
4. **Verifikasi**: buka `/api/health` (harus `"ok":true`), lalu buka URL utama: status `CONNECTED`, jumlah pair muncul di Dashboard, Top 10 Gainer terisi, Early Gainer terisi setelah beberapa siklus scan, buka detail koin untuk chart, uji watchlist/impor/ekspor, dan buka di browser Android.

## Endpoint Bitget yang dipakai (API publik v2, tanpa autentikasi)
- `GET /api/v2/spot/public/symbols` (pair aktif; hanya `quoteCoin=USDT` & `status=online`)
- `GET /api/v2/spot/market/tickers` (batch semua ticker)
- `GET /api/v2/spot/market/candles` (`granularity`: 1min, 5min, 15min, 1h, 4h)
- WebSocket publik `wss://ws.bitget.com/v2/ws/public`, channel `ticker`, `instType=SPOT`, heartbeat string `ping`/`pong`
- `GET /api/v2/public/time` (health)

> **Penting:** endpoint dan nama field ditulis berdasarkan dokumentasi Bitget v2 yang saya ketahui. Lingkungan pembuatan **tidak punya akses internet**, sehingga belum diverifikasi terhadap API live. Cek terhadap https://www.bitget.com/docs/ jika ada error parsing; semua parsing ada di `api/_lib.js` dan `public/js/api.js`.

## Arsitektur & batasan jujur
- Backend serverless: cache in-memory per instance (TTL ticker 3s, candle 10–300s sesuai interval, simbol 1 jam), timeout 6s, retry 3x exponential backoff, cooldown 5s setelah HTTP 429, fallback ke data cache lama (ditandai `STALE`). Cache tidak dibagi antar instance dan hilang saat cold start.
- **Backend tidak memindai terus-menerus.** Scan berjalan di browser saat aplikasi terbuka: tiap `scanSec` detik memindai satu batch (default 30 pair, bergilir mengelilingi seluruh pair ber-volume ≥ minimum, ditambah watchlist dan Top 10 Gainer) dengan candle 5m via REST. Pair yang belum terpindai tampil "belum dipindai". Alert, watchlist, dan setelan disimpan di localStorage browser dan **hanya terbentuk selama tab terbuka**. Tab di background dijeda; saat kembali, polling dan WebSocket dipulihkan.
- Notifikasi browser hanya saat tab terbuka. Push saat browser tertutup butuh service worker + push server + layanan persisten (tidak termasuk).
- WebSocket (≤40 pair: watchlist + Top 10 Gainer + pair yang dibuka) hanya memperbarui harga/bid/ask. Candle, relative volume, dan skor tetap dari REST. Jika WS gagal, REST polling (default 15 dtk) tetap jalan. Perubahan 1 menit hanya ada di halaman detail (dari candle 1m); di daftar ditampilkan N/A.
- Perbandingan volume beli/jual tidak diimplementasikan (butuh data trade); order book hanya dipakai lewat bid/ask ticker untuk spread.
- Backtest historis tidak disertakan; evaluasi sinyal memakai harga polling selama sesi (resolusi = interval polling), MFE/MAE ikut terbatas. Kenaikan setelah sinyal ≠ profit: biaya transaksi, spread, slippage tidak dihitung.

## Opportunity Score (0–100)
Candle 5m yang belum tutup dibuang. Butuh ≥60 candle tertutup; jika kurang → **PROVISIONAL, skor N/A** (tidak pernah dipalsukan).

| Komponen | Maks | Rumus |
|---|---|---|
| Relative volume | 25 | volume quote candle 5m terakhir ÷ rata-rata 20 candle 5m sebelumnya; `25 × clamp((RVOL−1)/4)` |
| Momentum | 20 | `8×clamp(Δ15m/2%) + 6×clamp(Δ5m/0.8%) + 6×clamp(Δ1j/4%)`; ×0.5 bila 5m atau 15m ≤ 0 |
| Tren EMA/MACD | 20 | +5 harga>EMA20; +5 EMA9>EMA21; +5 histogram MACD>0; +5 histogram naik 2 candle |
| Breakout/struktur | 15 | close di atas high 48 candle sebelumnya (kecuali 2 terakhir) = 15 (6 bila wick atas >60% = risiko false breakout); dalam 1% di bawahnya = 7 |
| Likuiditas & spread | 10 | `5×clamp(log10(Vol24/50K)/2.3)` + `5×(1−clamp(spread/0.4%))` |
| Penalti risiko | −10 | 24j>filter ekstrem −6 (24j>15% −3); Δ1j>8% −4; spread>0.4% −3; RSI>85 −3; volume<minimum −3 (dipotong maks 10) |

Kategori: 85–100 HIGH MOMENTUM · 70–84 STRONG SETUP · 50–69 WATCH · 0–49 WEAK SETUP.
Support/resistance = high/low tertinggi 48 candle interval chart (heuristik, bukan level pasti).

## Alert & status
Alert dibuat saat skor ≥ minimum, RVOL ≥ minimum, 24j ≤ filter ekstrem, volume ≥ minimum, dan cooldown per pair (default 30 mnt) lewat. Harga/skor awal tidak pernah diubah. Urutan status: **INVALIDATED** (harga ≤ −1.5% dari deteksi atau skor <50; final) → **WEAKENING** (skor ≤ puncak−10) → **BREAKOUT CONFIRMED** (breakout candle tertutup & harga ≥ harga deteksi) → **MOMENTUM STRENGTHENING** (skor ≥ awal+5 & harga naik) → **NEW SIGNAL**. Hasil +5m/+15m/+1j muncul hanya setelah horizon lewat.

## Pengujian
`npm test` (atau `node tests/test.js`): 16 tes offline dengan data **sintetis/mock** (bukan harga live): indikator, skor (data kurang/kosong/ekstrem), parsing & validasi API (pair offline, non-USDT, duplikat, data invalid, 429, error kode Bitget), watchlist/impor, dedup/cooldown/status alert, horizon evaluasi.

Belum diuji (perlu Anda): panggilan live ke Bitget, WebSocket live & reconnect, rendering di browser/Android, chart, deploy Vercel sesungguhnya.

## Troubleshooting
- Status OFFLINE / `/api/health` error: Bitget tidak terjangkau atau terkena rate limit; tunggu beberapa detik, naikkan interval polling di Settings.
- Daftar pair kosong: cek `/api/tickers` di browser; lihat log Function di Vercel.
- Early Gainer kosong: normal di awal; scanner butuh beberapa siklus. Turunkan minimum skor/RVOL/volume di Settings.
- Chart kosong: pair baru dengan histori <60 candle akan PROVISIONAL.
- WS "RECONNECTING" terus: jaringan/ISP memblokir WebSocket; REST tetap berjalan.
- Data tersimpan terhapus: localStorage hilang bila data situs dibersihkan.
- Deploy gagal dengan pesan "Node.js Version ... is discontinued": pastikan `package.json` memuat `"engines": { "node": "24.x" }` (sudah diatur). Jika Vercel kelak mewajibkan versi lebih baru, ganti nilainya sesuai pesan di log.
