# [BITGET] EARLY GAINER SCANNER v2

Dashboard analisis Bitget Spot USDT untuk mendeteksi koin dengan tanda awal momentum/volume. **Bukan saran investasi dan bukan prediksi harga.** Skor = kekuatan sinyal teknikal, bukan probabilitas profit. Transaksi tetap manual; tidak ada API key/trading.

Stack: HTML/CSS/JS vanilla, Bootstrap 5.3.3, Bootstrap Icons 1.11.3, Lightweight Charts 4.1.3 (CDN), Vercel Functions (Node 24.x).

## Perubahan v2 (hasil audit v1)
| Masalah v1 | Perbaikan v2 |
|---|---|
| Scan 30 pair/20 dtk, ribuan pair → puluhan menit, pair baru melonjak terlambat | Arsitektur dua tahap (di bawah), batch 12 pair/10 dtk dengan alokasi terarah |
| Bobot skor 25+20+20+15+10 = 90 (README bilang 100) | Bobot dasar **tepat 100** (dites); komponen tanpa data dikeluarkan dari penyebut, bukan nol palsu |
| RVOL hanya dari candle 5m | RVOL 5m **dan** 1m, baseline winsorized, penanganan anomali |
| `breakout` boolean sederhana; status CONFIRMED bisa menempel | `BREAKOUT DETECTED` ≠ `BREAKOUT CONFIRMED`; resistance acuan disimpan; status dievaluasi ulang tiap analisis; mode ketat |
| Evaluasi dari polling harga | Evaluasi dari candle 1m **setelah** horizon selesai, MFE/MAE, ketahanan breakout, metrik agregat |
| WebSocket hanya ≤40 pair | Pool WebSocket (maks 3 koneksi × 400 pair) + REST fallback + panel coverage |

## Arsitektur
**Tahap A – monitoring luas** (`monitor.js`, `api.js`): semua pair Spot USDT aktif dengan volume ≥ 25% dari minimum dipantau lewat WebSocket ticker (subscribe bertahap 50 arg/pesan) + polling REST batch `/tickers` (fallback & sumber daftar pair). Per pair disimpan sampel harga & volume 24j kumulatif → perubahan 1m/5m, akselerasi, z-score pergerakan 1m terhadap "kebiasaan" pair, dan *volume rate* (Δ volume 24j per menit ÷ rata-rata v24/1440). Satu ticker tunggal tidak dianggap sinyal: prioritas dibatasi bila tak ada pergerakan nyata/lonjakan volume. Tiap pair mencatat waktu data valid terakhir.

**Tahap B – validasi kandidat** (`scanner.js`): tiap `scanSec` detik, satu batch dialokasikan: 30% Top Gainer + watchlist (bergantian, yang paling lama tak dianalisis), 50% kandidat berprioritas tertinggi (+ sinyal aktif), sisanya sampling bergilir agar tidak bias. Per kandidat: candle 5m (200) + 1m (120); 15m dimuat jika skor awal ≥45; order book jika skor ≥60. Pair yang sedang diproses/baru dianalisis (<45 dtk; <15 dtk untuk sinyal aktif) dilewati (dedup), cache server 10–40 dtk, concurrency 4, **backpressure** (batch dipangkas bila ada error, jeda 30 dtk saat 429).

**Coverage** (Dashboard) menampilkan: pair aktif, pair likuid, yang menerima data ≤30 dtk, yang belum dipantau, umur data median, koneksi/subscription WS, jumlah pair yang divalidasi candle dalam 15 menit, kandidat aktif. **Seluruh pair likuid dipantau harganya, tetapi validasi candle hanya untuk sebagian**; aplikasi tidak mengklaim seluruh market tervalidasi real-time. Bitget tidak menyediakan candle batch, jadi validasi candle dibatasi antrean.

## Opportunity Score v2
Kandle yang belum tutup tidak pernah dihitung. Komponen = rata-rata berbobot sub-item yang datanya ada, dinormalisasi ke bobot komponen:

| Komponen | Bobot | Sub-item |
|---|---|---|
| Relative volume | 25 | RVOL 5m (60%) & 1m (40%): volume quote candle tertutup terakhir ÷ rata-rata 20 (5m) / 30 (1m) candle sebelumnya (winsorized 5× median); `clamp((RVOL−1)/4)` |
| Momentum MTF | 20 | return candle tertutup 1m (5), 5m (8, termasuk akselerasi), 15m (7); pengali konsistensi arah 1 / 0.75 / 0.4 |
| Tren EMA/MACD | 15 | harga>EMA20 (4), EMA9>EMA21 (4), histogram MACD>0 (3) & naik (2), konfirmasi 15m (2) |
| Breakout & konfirmasi | 15 | status breakout (12): confirmed 1.0 / detected 0.35 / dekat resistance 0.15; struktur higher-low (3) |
| Likuiditas & spread | 10 | volume 24j (3), spread (4), slippage order book untuk 1000 USDT (3, bila order book tersedia) |
| Kualitas candle & kesinambungan | 15 | volume ≥1.2× baseline 3 candle terakhir (6), candle bullish ber-body & ber-volume (5), wick atas candle terakhir (4) |

Skor dasar = Σ poin ÷ Σ bobot komponen aktif × 100 (maks tepat 100). **Penalti risiko** (dipotong maks 25, setelah skor dasar): naik ekstrem 24j (−8; >15% −4), lonjakan vertikal 1j/1m (−5/−3), wick atas >60% (−4), breakout tanpa volume (−5), spread >0.4% (−4), volume 24j rendah (−4), slippage >0.5% (−3), data ticker >60 dtk (−4), RSI>85 (−3), candle/RVOL anomali (−3). Hasil dibatasi 0–100. Jika candle 1m/15m kurang atau data stale → **PROVISIONAL, maks 69**; histori 5m <60 (listing baru) atau data >180 dtk → N/A. Kategori: 85–100 HIGH MOMENTUM · 70–84 STRONG SETUP · 50–69 WATCH · 0–49 WEAK SETUP. Detail koin menampilkan kontribusi tiap komponen, penalti, dan alasan.

## Breakout & status alert
Resistance acuan = high tertinggi 48 candle 5m **tanpa 2 candle tertutup terakhir**. **DETECTED**: harga/close di atas resistance (+0.05%) tanpa syarat konfirmasi. **CONFIRMED** (standar): close 5m tertutup di atas resistance, wick atas ≤60%, dan RVOL ≥1.5. **Mode ketat** (Settings): dua close berturut di atas resistance, low candle terakhir tidak menembus resistance −0.2% (retest bertahan), dan dukungan volume. Status dievaluasi ulang setiap analisis (tidak menempel): INVALIDATED (final; harga ≤ −1.5% dari harga sinyal, skor <45 dua kali berturut, atau close 5m di bawah resistance acuan setelah breakout terlihat) → BREAKOUT CONFIRMED (syarat terpenuhi saat ini) → WEAKENING (breakout sebelumnya tak lagi memenuhi syarat, atau skor ≤ puncak−10) → BREAKOUT DETECTED → MOMENTUM STRENGTHENING (skor ≥ awal+5, harga>harga sinyal, 5m positif) → NEW SIGNAL. Alert hanya untuk skor non-provisional ≥ minimum, RVOL ≥ minimum, tidak ekstrem, data ≤60 dtk, dengan cooldown per pair. Harga/skor/resistance awal tidak pernah diubah.

## Terminal scan (tab Early Gainer → Scanner)
Panel ala terminal Linux menampilkan log **nyata** proses scan: pair yang dipilih tiap batch beserta alasannya (top/watch, kandidat, sampling), fetch candle, hasil skor per pair, alert, perubahan status, error/rate limit/backpressure, ringkasan siklus, status WebSocket/REST, progress bar, dan hitung mundur batch berikutnya. Bukan animasi dekoratif; mengikuti Reduced motion (tanpa efek ketik/kursor berkedip).

## Evaluasi akurasi
Setelah horizon 5/15/60 menit berakhir (+70 dtk), aplikasi mengambil candle 1m dan menghitung return (close candle terakhir ≤ t0+h), MFE/MAE (high/low jendela), dan apakah breakout bertahan (close ≥ resistance acuan). Tab Evaluasi menampilkan n, % positif, median return, median MAE, breakout failure rate, dan hasil per kategori skor, dengan peringatan bila n<30. Data candle yang tak tersedia ditandai "data tdk tersedia". Return **belum** dikurangi biaya/spread/slippage; resolusi 1 menit, bukan tick.
**Backtest**: `node tools/backtest.js BTCUSDT ETHUSDT` (butuh internet; tidak dijalankan di lingkungan pembuatan). Skor di candle i hanya memakai candle ≤ i, entri di open candle berikutnya, biaya 0.3%/round-trip (asumsi), ambang 60 karena tanpa 1m/15m skor provisional. Properti anti look-ahead dites. Hasilnya bukan bukti akurasi.

## Deploy
1. Ekstrak ZIP → upload semua file ke root repository GitHub (timpa isi lama; hapus file lama yang tidak ada di v2 tidak diperlukan, hanya ada penambahan `api/book.js`, `public/js/monitor.js`, `tools/`).
2. Vercel: Import repo, Framework Preset *Other*, Build Command kosong, tanpa environment variable. `package.json` memuat `"engines": {"node": "24.x"}`.
3. Verifikasi: `/api/health` → `ok:true`; `/api/book?symbol=BTCUSDT`; Dashboard → panel Coverage (WS terhubung? jumlah pair); Early Gainer → kandidat muncul setelah 1–5 menit.
Pengaturan tersimpan di key baru (`beg.settings2`), jadi default v2 berlaku; alert/watchlist lama tetap terbaca.

## Pengujian
`npm test` → 34 tes offline, data **sintetis/mock** (bukan live): bobot=100, skor (data kurang/kosong/stale/provisional/RVOL anomali/likuiditas rendah/spread/slippage/ekstrem), breakout palsu/bertahan/ketat, perubahan status & invalidasi, dedup & cooldown, monitor (perubahan harga, volume rate, stale), pemilihan kandidat & kuota, backpressure & rate limit (429), parsing API (+order book), evaluasi horizon, metrik, watchlist, look-ahead backtest.
Smoke test browser headless (Chromium+Playwright) dengan API **palsu**: semua halaman ter-render, 12 pair tervalidasi, tanpa error JS, tanpa overflow horizontal di 390px.
**Belum diuji (perlu verifikasi live setelah deploy):** respons & field Bitget asli (terutama `orderbook`, field WS `quoteVolume`/`bidPr`/`askPr`), WebSocket live (batas subscribe 240 permintaan/jam per koneksi bisa terlampaui bila sering reconnect), chart Lightweight Charts dengan data asli, tampilan di Android, perilaku di Vercel (cache in-memory per instance), dan seluruh backtest.

## Keterbatasan
- Alert, evaluasi, dan monitoring hanya berjalan saat tab terbuka (tidak ada proses backend persisten); data tersimpan di localStorage.
- Baseline volume rate = v24/1440 (tidak dinormalisasi jam-hari; volume 24j bergulir bisa meremehkan Δ). RVOL candle memakai candle sejenis terakhir, bukan musiman jam-hari.
- Perubahan 1m/5m Tahap A butuh 1–5 menit data sesi setelah halaman dibuka.
- Order book hanya diambil untuk kandidat skor ≥60; slippage sebatas estimasi dari 20 level.
- Push notification saat browser tertutup butuh service worker + push server (tidak termasuk).

## Troubleshooting
Status OFFLINE → cek `/api/health`. WS terus RECONNECTING → jaringan memblokir WebSocket atau limit Bitget; REST tetap jalan (Coverage menampilkan umur data). Banyak "belum dipantau" → turunkan minimum volume atau tunggu WS subscribe selesai. Tidak ada sinyal → normal bila tak ada yang memenuhi kriteria; sinyal sengaja konservatif (non-provisional).
