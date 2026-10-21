#!/usr/bin/env node
/* Backtest candle 5m berbasis Opportunity Score. Butuh internet (API publik Bitget). Pemakaian:
     node tools/backtest.js BTCUSDT ETHUSDT SOLUSDT
   Aturan anti look-ahead: skor pada candle i hanya memakai candle <= i (dianggap tertutup); entri di OPEN candle i+1.
   Biaya: fee 0.1%/sisi + slippage 0.05%/sisi (asumsi). 1m/15m tidak dipakai -> skor provisional (maks 69), ambang uji default 60.
   Hasil bergantung pada periode & sampel; BUKAN bukti akurasi. */
'use strict';
const Sc = require('../public/js/scoring.js');
const COST = 0.002 + 0.001;

function backtest(cs, o = {}) {
  const thr = o.threshold || 60, cool = o.cooldown || 12, H = o.horizons || [1, 3, 12], cfg = { maxChange24: 30, minVol: 2e5, strict: false };
  const out = [];
  let lastI = -1e9;
  for (let i = 100; i < cs.length - Math.max(...H) - 1; i++) {
    if (i - lastI < cool) continue;
    const hist = cs.slice(0, i + 1), now = cs[i].t + 300000; // candle i tertutup pada 'now'
    const v24 = hist.slice(-288).reduce((s, x) => s + x.q, 0), o24 = hist[Math.max(0, hist.length - 288)].o;
    const a = Sc.analyze({ c5: hist, c1: null, c15: null, book: null }, { p: cs[i].c, v: v24, ch24: (cs[i].c / o24 - 1) * 100, age: 0 }, cfg, now);
    if (a.score == null || a.score < thr) continue;
    lastI = i; const entry = cs[i + 1].o, r = { i, score: a.score, cat: Sc.category(a.score), ret: {}, mae: {} };
    for (const h of H) { const w = cs.slice(i + 1, i + 1 + h); r.ret[h] = w[w.length - 1].c / entry - 1 - COST; r.mae[h] = Math.min(...w.map((x) => x.l)) / entry - 1; }
    out.push(r);
  }
  return out;
}
function summarize(sig, H = [1, 3, 12]) {
  const med = (v) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };
  return H.map((h) => { const r = sig.map((x) => x.ret[h]); return { horizonCandles5m: h, n: r.length, positivePct: r.length ? r.filter((x) => x > 0).length / r.length : null, medianNet: med(r), medianMAE: med(sig.map((x) => x.mae[h])) }; });
}
module.exports = { backtest, summarize };

if (require.main === module) (async () => {
  const syms = process.argv.slice(2); if (!syms.length) { console.log('Pemakaian: node tools/backtest.js BTCUSDT ...'); return; }
  const all = [];
  for (const s of syms) {
    const r = await fetch('https://api.bitget.com/api/v2/spot/market/candles?symbol=' + s + '&granularity=5min&limit=1000').then((x) => x.json());
    if (r.code !== '00000') { console.log(s, 'error', r.msg); continue; }
    const cs = r.data.map((a) => ({ t: +a[0], o: +a[1], h: +a[2], l: +a[3], c: +a[4], v: +a[5], q: +a[6] })).sort((a, b) => a.t - b.t);
    const sig = backtest(cs); all.push(...sig); console.log(s, 'sinyal:', sig.length);
    await new Promise((z) => setTimeout(z, 300));
  }
  console.log(JSON.stringify(summarize(all), null, 1)); console.log('Catatan: sampel kecil/periode pendek tidak membuktikan apa pun.');
})();
