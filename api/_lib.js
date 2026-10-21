'use strict';
// Helper bersama (file berawalan "_" tidak dijadikan route oleh Vercel).
const BASE = 'https://api.bitget.com';
const cache = new Map();
let cooldownUntil = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpErr = (status, msg) => Object.assign(new Error(msg), { status });

// GET publik Bitget: cache TTL, timeout 6s, retry 3x exponential backoff, stop saat 429.
async function bg(path, params, ttl) {
  const qs = new URLSearchParams(params || {}).toString();
  const key = path + '?' + qs;
  const c = cache.get(key);
  const now = Date.now();
  if (c && now - c.t < ttl) return { data: c.d, t: c.t, cached: true };
  if (cooldownUntil > now) {
    if (c) return { data: c.d, t: c.t, cached: true, stale: true };
    throw httpErr(503, 'API Bitget sedang cooldown (rate limit)');
  }
  let err;
  for (let i = 0; i < 3; i++) {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 6000);
    try {
      const r = await fetch(BASE + path + (qs ? '?' + qs : ''), { signal: ac.signal, headers: { 'User-Agent': 'bitget-early-gainer/1.0' } });
      clearTimeout(to);
      if (r.status === 429) { cooldownUntil = Date.now() + 5000; err = httpErr(429, 'Rate limit Bitget (429)'); break; }
      if (!r.ok) throw httpErr(502, 'HTTP ' + r.status + ' dari Bitget');
      const j = await r.json();
      if (!j || j.code !== '00000' || j.data == null) throw httpErr(502, 'Respons Bitget tidak valid: ' + (j && j.code) + ' ' + (j && j.msg));
      cache.set(key, { t: Date.now(), d: j.data });
      if (cache.size > 600) cache.delete(cache.keys().next().value);
      return { data: j.data, t: Date.now(), cached: false };
    } catch (e) {
      clearTimeout(to);
      err = e;
      if (i < 2) await sleep(300 * 2 ** i);
    }
  }
  if (c) return { data: c.d, t: c.t, cached: true, stale: true };
  throw err;
}

const num = (x) => { const n = parseFloat(x); return Number.isFinite(n) ? n : null; };

// GET /api/v2/spot/public/symbols -> hanya USDT & status online
async function getSymbols() {
  const r = await bg('/api/v2/spot/public/symbols', {}, 3600e3);
  const m = new Map();
  for (const s of Array.isArray(r.data) ? r.data : []) {
    if (!s || s.quoteCoin !== 'USDT' || s.status !== 'online' || !/^[A-Z0-9]{2,20}USDT$/.test(s.symbol)) continue;
    if (!m.has(s.symbol)) m.set(s.symbol, { s: s.symbol, b: s.baseCoin, q: s.quoteCoin });
  }
  return { map: m, t: r.t, stale: !!r.stale };
}

// GET /api/v2/spot/market/tickers (batch semua pair) digabung dengan daftar pair aktif
async function getTickers() {
  const [sy, tk] = await Promise.all([getSymbols(), bg('/api/v2/spot/market/tickers', {}, 3000)]);
  const seen = new Set();
  const items = [];
  for (const x of Array.isArray(tk.data) ? tk.data : []) {
    const meta = x && sy.map.get(x.symbol);
    if (!meta || seen.has(x.symbol)) continue;
    const p = num(x.lastPr), o = num(x.open), v = num(x.quoteVolume);
    if (!(p > 0) || v == null || v < 0) continue; // data tidak valid dibuang
    seen.add(x.symbol);
    items.push({ s: x.symbol, b: meta.b, p, o: o > 0 ? o : null, v, bid: num(x.bidPr), ask: num(x.askPr), h: num(x.high24h), l: num(x.low24h), ts: num(x.ts) });
  }
  return { items, t: tk.t, stale: !!tk.stale };
}

const GRAN = { '1min': 60e3, '5min': 300e3, '15min': 900e3, '1h': 3600e3, '4h': 14400e3 };
const TTL = { '1min': 10e3, '5min': 20e3, '15min': 40e3, '1h': 120e3, '4h': 300e3 };

// GET /api/v2/spot/market/candles -> [ts,open,high,low,close,baseVol,quoteVol,usdtVol]
async function getCandles(symbol, gran, limit) {
  const r = await bg('/api/v2/spot/market/candles', { symbol, granularity: gran, limit: String(limit) }, TTL[gran]);
  const out = [];
  const seen = new Set();
  for (const a of Array.isArray(r.data) ? r.data : []) {
    const t = num(a[0]), o = num(a[1]), h = num(a[2]), l = num(a[3]), c = num(a[4]), v = num(a[5]), q = num(a[6]);
    if ([t, o, h, l, c, v, q].some((z) => z == null) || c <= 0 || seen.has(t)) continue;
    seen.add(t);
    out.push([t, o, h, l, c, v, q]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return { candles: out, t: r.t, stale: !!r.stale };
}

function send(res, status, body, cc) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cc) res.setHeader('Cache-Control', cc);
  res.status(status).json(body);
}
module.exports = { bg, getSymbols, getTickers, getCandles, send, GRAN, BASE };

// GET /api/v2/spot/market/orderbook -> {asks:[[harga,ukuran]],bids:[...]}
async function getBook(symbol) {
  const r = await bg('/api/v2/spot/market/orderbook', { symbol, type: 'step0', limit: '20' }, 4000);
  const fix = (a) => (Array.isArray(a) ? a.map((x) => [num(x[0]), num(x[1])]).filter((x) => x[0] > 0 && x[1] >= 0) : []);
  const d = r.data || {};
  return { asks: fix(d.asks).sort((a, b) => a[0] - b[0]), bids: fix(d.bids).sort((a, b) => b[0] - a[0]), t: r.t, stale: !!r.stale };
}
module.exports.getBook = getBook;
