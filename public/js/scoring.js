/* Opportunity Score. Dipakai di browser (global Scoring) dan Node (tests). */
(function (root) {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
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

  // cs: candle 5m [{t,o,h,l,c,v,q}] ascending. t: {p,v,bid,ask,ch24}. cfg: {maxChange24,minVol}
  function analyze(cs, t, cfg, now) {
    const out = { provisional: false, score: null, parts: null, reasons: [], warn: [], m: {} };
    const k = cs.slice();
    if (k.length && k[k.length - 1].t + 300000 > now) k.pop(); // buang candle yang belum tutup
    if (k.length < 60) { out.provisional = true; out.reasons.push('Data historis belum cukup (' + k.length + '/60 candle 5m tertutup)'); return out; }
    const n = k.length, c = k.map((x) => x.c), price = t.p > 0 ? t.p : c[n - 1];
    const ch5 = c[n - 1] / c[n - 2] - 1, ch15 = c[n - 1] / c[n - 4] - 1, ch60 = c[n - 1] / c[n - 13] - 1;
    const base = k.slice(n - 21, n - 1).reduce((s, x) => s + x.q, 0) / 20;
    const rvol = base > 0 ? k[n - 1].q / base : null;
    const e9 = ema(c, 9), e21 = ema(c, 21), e20 = ema(c, 20), M = macd(c), R = rsi(c);
    const hh = Math.max(...k.slice(n - 50, n - 2).map((x) => x.h));
    const last = k[n - 1], rng = last.h - last.l, wick = rng > 0 ? (last.h - Math.max(last.o, last.c)) / rng : 0;
    const spread = t.bid > 0 && t.ask > 0 ? (t.ask - t.bid) / ((t.ask + t.bid) / 2) : null;
    Object.assign(out.m, { ch5, ch15, ch60, rvol, rsi: R[n - 1], hh, spread, price, breakout: false });
    const P = { rvol: 0, mom: 0, trend: 0, brk: 0, liq: 0, pen: 0 };
    if (rvol == null) out.warn.push('Relative volume tidak dapat dihitung'); else { P.rvol = 25 * clamp((rvol - 1) / 4); if (rvol >= 2) out.reasons.push('Relative volume meningkat (' + rvol.toFixed(1) + 'x)'); }
    P.mom = 8 * clamp(ch15 / 0.02) + 6 * clamp(ch5 / 0.008) + 6 * clamp(ch60 / 0.04);
    if (ch5 <= 0 || ch15 <= 0) P.mom *= 0.5;
    if (ch5 > 0 && ch15 > 0) out.reasons.push('Momentum 5m & 15m positif'); else out.warn.push('Momentum tidak konsisten');
    if (price > e20[n - 1]) { P.trend += 5; out.reasons.push('Harga di atas EMA20'); }
    if (e9[n - 1] > e21[n - 1]) { P.trend += 5; out.reasons.push('Tren EMA9>EMA21 mendukung'); }
    const h0 = M.hist[n - 1], h1 = M.hist[n - 2], h2 = M.hist[n - 3];
    if (h0 > 0) P.trend += 5;
    if (h0 > h1 && h1 > h2) { P.trend += 5; out.reasons.push('Histogram MACD menguat'); }
    if (c[n - 1] > hh) { P.brk = wick > 0.6 ? 6 : 15; out.m.breakout = wick <= 0.6; out.reasons.push(wick > 0.6 ? 'Breakout dengan wick atas panjang' : 'Harga menembus resistance (close di atas high ~4 jam)'); if (wick > 0.6) out.warn.push('Risiko false breakout'); }
    else if (c[n - 1] > hh * 0.99) { P.brk = 7; out.reasons.push('Harga dekat resistance (<1%)'); }
    P.liq = 5 * clamp(Math.log10(Math.max(t.v, 1) / 5e4) / 2.3);
    if (spread == null) out.warn.push('Spread tidak tersedia'); else P.liq += 5 * (1 - clamp(spread / 0.004));
    let pen = 0;
    if (t.ch24 > cfg.maxChange24) { pen += 6; out.warn.push('Harga sudah naik ekstrem 24 jam (>' + cfg.maxChange24 + '%)'); } else if (t.ch24 > 15) { pen += 3; out.warn.push('Kenaikan 24 jam sudah besar (>15%)'); }
    if (ch60 > 0.08) { pen += 4; out.warn.push('Lonjakan vertikal 1 jam (>8%)'); }
    if (spread != null && spread > 0.004) { pen += 3; out.warn.push('Spread terlalu besar'); }
    if (out.m.rsi > 85) { pen += 3; out.warn.push('RSI overbought (>85)'); }
    if (t.v < cfg.minVol) { pen += 3; out.warn.push('Volume 24 jam rendah'); }
    P.pen = Math.min(10, pen);
    out.parts = P;
    out.score = Math.round(clamp(P.rvol + P.mom + P.trend + P.brk + P.liq - P.pen, 0, 100));
    return out;
  }
  const api = { ema, rsi, macd, analyze, category, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Scoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
