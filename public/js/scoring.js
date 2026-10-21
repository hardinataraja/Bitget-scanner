/* Opportunity Score v2. Browser (global Scoring) dan Node (tests/backtest).
   Bobot dasar (total TEPAT 100): RVOL 25, Momentum MTF 20, Tren 15, Breakout 15, Likuiditas 10, Kualitas candle 15.
   Setiap komponen = rata-rata berbobot dari sub-item yang datanya tersedia (dinormalisasi ke bobot komponen).
   Komponen yang seluruh datanya tidak ada dikeluarkan dari penyebut (bukan nol palsu); skor dibuat provisional (maks 69). */
(function (root) {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const W = { rvol: 25, mom: 20, trend: 15, brk: 15, liq: 10, qual: 15 };
  function ema(v, p) { const k = 2 / (p + 1), o = []; let e = null; for (let i = 0; i < v.length; i++) { e = e === null ? v[i] : v[i] * k + e * (1 - k); o.push(i < p - 1 ? null : e); } return o; }
  function rsi(c, p = 14) {
    const o = Array(c.length).fill(null); if (c.length <= p) return o; let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; d >= 0 ? g += d : l -= d; } g /= p; l /= p;
    o[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = p + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    return o;
  }
  function macd(c) {
    const a = ema(c, 12), b = ema(c, 26), line = c.map((_, i) => (a[i] != null && b[i] != null ? a[i] - b[i] : null));
    const k = 2 / 10; let s = null; const sig = [], hist = [];
    line.forEach((x) => { if (x == null) { sig.push(null); hist.push(null); return; } s = s === null ? x : x * k + s * (1 - k); sig.push(s); hist.push(x - s); });
    return { line, sig, hist };
  }
  function category(s) { return s == null ? 'N/A' : s >= 85 ? 'HIGH MOMENTUM' : s >= 70 ? 'STRONG SETUP' : s >= 50 ? 'WATCH' : 'WEAK SETUP'; }
  const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const closedOf = (cs, step, now) => { const k = (cs || []).slice(); if (k.length && k[k.length - 1].t + step > now) k.pop(); return k; };
  // Baseline volume (quote) dari `len` candle SEBELUM `end` (indeks eksklusif); winsorize 5x median agar lonjakan lama tidak merusak baseline.
  function base(k, end, len) {
    const prev = k.slice(Math.max(0, end - len), end).map((x) => x.q); if (prev.length < len * 0.8) return null;
    const m = med(prev), cap = m > 0 ? m * 5 : Infinity, w = prev.map((q) => Math.min(q, cap));
    return w.reduce((s, x) => s + x, 0) / w.length;
  }
  const rvolOf = (k, len) => { const n = k.length, b = base(k, n - 1, len); return b > 0 ? k[n - 1].q / b : null; };
  function slippage(book, notional) { // estimasi slippage beli `notional` USDT menyapu ask
    if (!book || !book.asks || !book.asks.length || !book.bids || !book.bids.length) return null;
    const mid = (book.asks[0][0] + book.bids[0][0]) / 2; let left = notional, cost = 0, qty = 0;
    for (const [p, s] of book.asks) { const take = Math.min(left, p * s); cost += take; qty += take / p; left -= take; if (left <= 1e-9) break; }
    if (left > 1e-9) return 1; return cost / qty / mid - 1;
  }
  // D: {c1,c5,c15 (candle [{t,o,h,l,c,v,q}] ascending), book:{asks,bids}}  t: {p,v,bid,ask,ch24,age(ms)}  cfg: {maxChange24,minVol,staleMs,hardStaleMs,strict}
  function analyze(D, t, cfg, now) {
    const out = { provisional: false, score: null, base: null, parts: null, pen: [], penTotal: 0, reasons: [], warn: [], m: { brk: 'none', breakout: false } };
    const staleMs = cfg.staleMs || 60000, hard = cfg.hardStaleMs || 180000, age = t.age == null ? 0 : t.age;
    if (age > hard) { out.reasons.push('Data stale (' + Math.round(age / 1000) + 's) — skor tidak dihitung'); return out; }
    const k5 = closedOf(D.c5, 300000, now), k1 = closedOf(D.c1, 60000, now), k15 = closedOf(D.c15, 900000, now);
    if (k5.length < 60) { out.provisional = true; out.reasons.push('Histori belum cukup / listing baru (' + k5.length + '/60 candle 5m tertutup)'); return out; }
    const has1 = k1.length >= 40, has15 = k15.length >= 30, n = k5.length, n1 = k1.length, n15 = k15.length;
    const L = k5[n - 1], c5 = k5.map((x) => x.c), price = t.p > 0 ? t.p : L.c, m = out.m;
    const retL = (k, i) => (k.length > i + 1 ? k[k.length - 1 - i].c / k[k.length - 2 - i].c - 1 : null);
    m.ch5 = retL(k5, 0); m.ch1 = has1 ? retL(k1, 0) : null; m.ch15 = has15 ? retL(k15, 0) : null; m.ch60 = c5[n - 1] / c5[n - 13] - 1;
    const prev5 = retL(k5, 1); m.accel = m.ch5 - prev5; m.lastClose5 = L.c; m.price = price; m.age = age;
    m.rvol = rvolOf(k5, 20); m.rvol1 = has1 ? rvolOf(k1, 30) : null;
    let anomaly = false;
    if (m.rvol > 30 || m.rvol1 > 30) { anomaly = true; out.warn.push('RVOL anomali (>30x) — dibatasi'); m.rvol = m.rvol && Math.min(m.rvol, 10); m.rvol1 = m.rvol1 && Math.min(m.rvol1, 10); }
    if ((L.h - L.l) / L.o > 0.15) { anomaly = true; out.warn.push('Candle 5m anomali (range >15%)'); }
    const e9 = ema(c5, 9), e21 = ema(c5, 21), e20 = ema(c5, 20), M = macd(c5), R = rsi(c5); m.rsi = R[n - 1];
    const spread = t.bid > 0 && t.ask > 0 ? (t.ask - t.bid) / ((t.ask + t.bid) / 2) : null; m.spread = spread;
    const slip = slippage(D.book, 1000); m.slip = slip; m.book = slip != null;
    const rng = L.h - L.l, wick = rng > 0 ? (L.h - Math.max(L.o, L.c)) / rng : 0; m.wick = wick;
    // Resistance acuan: high tertinggi 48 candle 5m, TANPA 2 candle tertutup terakhir
    const Rv = Math.max(...k5.slice(n - 50, n - 2).map((x) => x.h)); m.R = Rv;
    const volOK = (m.rvol || 0) >= 1.5 || (n > 1 && (rvolOf(k5.slice(0, n - 1), 20) || 0) >= 1.5);
    const aboveL = L.c > Rv * 1.0005 && wick <= 0.6, aboveP = k5[n - 2].c > Rv * 1.0005;
    const conf = cfg.strict ? aboveL && aboveP && L.l >= Rv * 0.998 && volOK : aboveL && volOK;
    m.brk = conf ? 'confirmed' : (price > Rv * 1.0005 || (L.c > Rv * 1.0005)) ? 'detected' : 'none'; m.breakout = conf;
    const comp = (key, items) => { // items: [fraksi 0..1 | null, bobot]
      const a = items.filter((i) => i[0] != null); if (!a.length) return { pts: 0, max: W[key], on: false };
      const sw = a.reduce((s, i) => s + i[1], 0); return { pts: W[key] * a.reduce((s, i) => s + i[0] * i[1], 0) / sw, max: W[key], on: true };
    };
    const f = (r) => (r == null ? null : clamp((r - 1) / 4));
    const P = {};
    P.rvol = comp('rvol', [[f(m.rvol), 0.6], [f(m.rvol1), 0.4]]);
    const mt = [[m.ch1 == null ? null : clamp(m.ch1 / 0.004), 5], [clamp(m.ch5 / 0.01) * 0.625 + (m.accel > 0 ? clamp(m.accel / 0.006) * 0.375 : 0), 8], [m.ch15 == null ? null : clamp(m.ch15 / 0.02), 7]];
    const av = [m.ch1, m.ch5, m.ch15].filter((x) => x != null), pos = av.filter((x) => x > 0).length;
    const mult = pos === av.length ? 1 : pos / av.length >= 0.66 ? 0.75 : 0.4;
    P.mom = comp('mom', mt); P.mom.pts *= mult;
    let c15ok = null; if (has15) { const c15 = k15.map((x) => x.c), a = ema(c15, 20), b = ema(c15, 9), d = ema(c15, 21); c15ok = c15[n15 - 1] > a[n15 - 1] && b[n15 - 1] > d[n15 - 1] ? 1 : 0; }
    const h = M.hist;
    P.trend = comp('trend', [[price > e20[n - 1] ? 1 : 0, 4], [e9[n - 1] > e21[n - 1] ? 1 : 0, 4], [h[n - 1] > 0 ? 1 : 0, 3], [h[n - 1] > h[n - 2] && h[n - 2] > h[n - 3] ? 1 : 0, 2], [c15ok, 2]]);
    const near = price >= Rv * 0.99, struct = k5[n - 1].l > k5[n - 2].l && k5[n - 2].l > k5[n - 3].l ? 1 : 0;
    const bf = m.brk === 'confirmed' ? 1 : m.brk === 'detected' ? 0.35 : near ? 0.15 : 0;
    P.brk = comp('brk', [[bf, 12], [struct, 3]]);
    P.liq = comp('liq', [[clamp(Math.log10(Math.max(t.v, 1) / 5e4) / 2.3), 3], [spread == null ? null : 1 - clamp(spread / 0.004), 4], [slip == null ? null : 1 - clamp((slip - 0.001) / 0.004), 3]]);
    if (spread == null) out.warn.push('Spread tidak tersedia'); if (slip == null) out.warn.push('Kedalaman order book belum diperiksa');
    const bb = base(k5, n - 3, 20), last3 = k5.slice(-3);
    const cont = bb > 0 ? last3.filter((x) => x.q >= 1.2 * bb).length / 3 : null;
    const pva = bb > 0 ? last3.filter((x) => x.c > x.o && (x.c - x.o) / Math.max(x.h - x.l, 1e-12) > 0.4 && x.q >= bb).length / 3 : null;
    P.qual = comp('qual', [[cont, 6], [pva, 5], [1 - clamp((wick - 0.2) / 0.4), 4]]);
    out.parts = P;
    const on = Object.values(P).filter((p) => p.on), sw = on.reduce((s, p) => s + p.max, 0), sp = on.reduce((s, p) => s + p.pts, 0);
    out.base = sw > 0 ? Math.round(sp / sw * 100) : null;
    // Penalti risiko (setelah skor dasar)
    const pen = (v, why) => { out.pen.push({ v, why }); out.warn.push(why); };
    if (t.ch24 > cfg.maxChange24) pen(8, 'Harga sudah naik ekstrem 24j (>' + cfg.maxChange24 + '%)'); else if (t.ch24 > 15) pen(4, 'Kenaikan 24j sudah besar (>15%)');
    if (m.ch60 > 0.08) pen(5, 'Lonjakan vertikal 1 jam (>8%)'); else if (Math.abs(m.ch1 || 0) > 0.03) pen(3, 'Lonjakan vertikal 1 menit (>3%)');
    if (wick > 0.6) pen(4, 'Wick atas panjang (risiko false breakout)');
    if (m.brk !== 'none' && (m.rvol || 0) < 1.2) pen(5, 'Breakout tidak didukung volume');
    if (spread != null && spread > 0.004) pen(4, 'Spread terlalu besar (>0.4%)');
    if (t.v < cfg.minVol) pen(4, 'Likuiditas 24j rendah');
    if (slip != null && slip > 0.005) pen(3, 'Estimasi slippage tinggi (>0.5% untuk 1000 USDT)');
    if (age > staleMs) pen(4, 'Data ticker sudah ' + Math.round(age / 1000) + ' detik');
    if (m.rsi > 85) pen(3, 'RSI overbought (>85)');
    if (anomaly) pen(3, 'Data candle anomali');
    out.penTotal = Math.min(25, out.pen.reduce((s, p) => s + p.v, 0));
    let score = clamp(out.base - out.penTotal, 0, 100);
    if (!has1 || !has15 || age > staleMs) { out.provisional = true; score = Math.min(score, 69); out.warn.push('PROVISIONAL: ' + [!has1 && 'candle 1m kurang', !has15 && 'candle 15m kurang', age > staleMs && 'data stale'].filter(Boolean).join(', ') + ' (skor dibatasi 69)'); }
    out.score = Math.round(score);
    if ((m.rvol || 0) >= 2) out.reasons.push('RVOL 5m ' + m.rvol.toFixed(1) + 'x' + (m.rvol1 ? ', 1m ' + m.rvol1.toFixed(1) + 'x' : ''));
    if (m.ch5 > 0 && (m.ch1 == null || m.ch1 > 0) && (m.ch15 == null || m.ch15 > 0)) out.reasons.push('Momentum 1m/5m/15m searah naik');
    if (m.accel > 0 && m.ch5 > 0) out.reasons.push('Akselerasi harga 5m');
    if (price > e20[n - 1] && e9[n - 1] > e21[n - 1]) out.reasons.push('Tren EMA mendukung (harga>EMA20, EMA9>EMA21)');
    if (m.brk === 'confirmed') out.reasons.push('Breakout terkonfirmasi: close 5m di atas resistance ' + Rv.toPrecision(5) + (cfg.strict ? ' (mode ketat)' : '') + ' dengan dukungan volume');
    else if (m.brk === 'detected') out.reasons.push('Breakout terdeteksi (belum terkonfirmasi) di atas ' + Rv.toPrecision(5));
    if (cont >= 0.66) out.reasons.push('Volume berkesinambungan 3 candle');
    return out;
  }
  const api = { ema, rsi, macd, analyze, category, clamp, W, slippage, rvolOf, closedOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Scoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
