// Tes offline. PENTING: data di sini SINTETIS/mock (format mengikuti dokumentasi Bitget v2),
// BUKAN respons live. Tes live harus dilakukan setelah deploy (lihat README).
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
let pass = 0; const T = async (n, f) => { try { await f(); pass++; console.log('ok  ', n); } catch (e) { console.log('FAIL', n, e.message); process.exitCode = 1; } };
const Sc = require('../public/js/scoring.js');
const mkRes = () => { const r = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; return r; };
const mockFetch = (map) => async (url) => { const u = new URL(url); const f = map[u.pathname]; if (!f) return { ok: false, status: 404, json: async () => ({}) }; const x = typeof f === 'function' ? f(u) : f; return { ok: x.status ? x.status < 400 : true, status: x.status || 200, json: async () => x.body }; };
const syms = { code: '00000', data: [{ symbol: 'AAAUSDT', baseCoin: 'AAA', quoteCoin: 'USDT', status: 'online' }, { symbol: 'OLDUSDT', baseCoin: 'OLD', quoteCoin: 'USDT', status: 'offline' }, { symbol: 'BTCETH', baseCoin: 'BTC', quoteCoin: 'ETH', status: 'online' }, { symbol: 'AAAUSDT', baseCoin: 'AAA', quoteCoin: 'USDT', status: 'online' }] };
const tks = { code: '00000', data: [{ symbol: 'AAAUSDT', lastPr: '0.00001234', open: '0.00001000', quoteVolume: '500000', bidPr: '0.0000123', askPr: '0.0000124', ts: '1' }, { symbol: 'AAAUSDT', lastPr: '9', open: '9', quoteVolume: '1' }, { symbol: 'OLDUSDT', lastPr: '1', open: '1', quoteVolume: '9' }, { symbol: 'BTCETH', lastPr: '1', open: '1', quoteVolume: '9' }, { symbol: 'BADUSDT', lastPr: '0', open: '1', quoteVolume: 'x' }] };
function candles(n, f, now = Date.now()) { const o = []; let p = 100; for (let i = 0; i < n; i++) { const t = now - (n - i) * 300000; const r = f(i, p); p = r.c; o.push({ t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.q / p, q: r.q }); } return o; }
const flat = (i, p) => ({ o: p, h: p * 1.001, l: p * 0.999, c: p * (1 + (i % 2 ? 0.0005 : -0.0005)), q: 1000 });
const surge = (n) => (i, p) => (i >= n - 4 ? { o: p, h: p * 1.02, l: p, c: p * 1.0175, q: i === n - 1 ? 9000 : 3000 } : flat(i, p));
const tk = { p: 100, v: 5e6, bid: 100, ask: 100.05, ch24: 5 }, cfg = { maxChange24: 30, minVol: 200000 };
(async () => {
  await T('EMA/RSI/MACD range', () => { const c = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 3); const r = Sc.rsi(c).filter((x) => x != null); assert(r.every((x) => x >= 0 && x <= 100)); assert.strictEqual(Sc.ema(c, 9).filter((x) => x == null).length, 8); assert(Sc.macd(c).hist[99] != null); });
  await T('Skor: data kurang -> provisional, tidak ada skor', () => { const a = Sc.analyze(candles(20, flat), tk, cfg, Date.now()); assert(a.provisional && a.score === null); });
  await T('Skor: data kosong tidak jadi tinggi', () => { const a = Sc.analyze([], tk, cfg, Date.now()); assert(a.score === null); });
  await T('Skor: pasar datar rendah, lonjakan volume+harga lebih tinggi', () => { const f = Sc.analyze(candles(100, flat), tk, cfg, Date.now()), s = Sc.analyze(candles(100, surge(100)), tk, cfg, Date.now()); assert(f.score < 50, 'flat ' + f.score); assert(s.score > f.score + 30, 'surge ' + s.score + ' vs ' + f.score); assert(s.reasons.some((r) => /Relative volume/.test(r))); });
  await T('Skor: penalti kenaikan ekstrem 24j', () => { const a = Sc.analyze(candles(100, surge(100)), tk, cfg, Date.now()), b = Sc.analyze(candles(100, surge(100)), Object.assign({}, tk, { ch24: 80 }), cfg, Date.now()); assert(b.score < a.score && b.warn.some((w) => /ekstrem/.test(w))); });
  await T('Skor: candle belum tutup dibuang', () => { const cs = candles(60, flat); cs[59].t = Date.now() - 1000; const a = Sc.analyze(cs, tk, cfg, Date.now()); assert(a.provisional); });
  await T('Kategori skor', () => { assert.deepStrictEqual([90, 75, 55, 10, null].map(Sc.category), ['HIGH MOMENTUM', 'STRONG SETUP', 'WATCH', 'WEAK SETUP', 'N/A']); });
  const loadApi = (m) => { global.fetch = mockFetch(m); for (const k of Object.keys(require.cache)) if (/api[\\/]/.test(k)) delete require.cache[k]; };
  await T('API tickers: filter offline/non-USDT/invalid & dedup', async () => { loadApi({ '/api/v2/spot/public/symbols': { body: syms }, '/api/v2/spot/market/tickers': { body: tks } }); const r = mkRes(); await require('../api/tickers.js')({}, r); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.items.length, 1); assert.strictEqual(r.body.items[0].p, 0.00001234); });
  await T('API candles: validasi parameter', async () => { loadApi({}); const h = require('../api/candles.js'); for (const q of [{ symbol: 'x', granularity: '5min' }, { symbol: 'AAAUSDT', granularity: '7min' }, { symbol: 'AAAUSDT', granularity: '5min', limit: '9999' }]) { const r = mkRes(); await h({ query: q }, r); assert.strictEqual(r.code, 400); } });
  await T('API candles: parsing, sort, dedup, buang data invalid', async () => { loadApi({ '/api/v2/spot/market/candles': { body: { code: '00000', data: [['2000', '1', '2', '1', '2', '5', '10', '10'], ['1000', '1', '2', '1', '1.5', '5', '7', '7'], ['1000', '1', '2', '1', '1.5', '5', '7', '7'], ['3000', 'x', '2', '1', '1', '1', '1', '1']] } } }); const r = mkRes(); await require('../api/candles.js')({ query: { symbol: 'AAAUSDT', granularity: '5min', limit: '100' } }, r); assert.deepStrictEqual(r.body.candles.map((c) => c[0]), [1000, 2000]); });
  await T('API error Bitget & 429 -> status error, tanpa crash', async () => { loadApi({ '/api/v2/public/time': { body: { code: '40001', msg: 'err' } } }); let r = mkRes(); await require('../api/health.js')({}, r); assert.strictEqual(r.code, 502); loadApi({ '/api/v2/spot/market/candles': { status: 429, body: {} } }); r = mkRes(); await require('../api/candles.js')({ query: { symbol: 'ZZZUSDT', granularity: '5min', limit: '50' } }, r); assert(r.code >= 429); });
  await T('API tickers kosong -> items kosong', async () => { loadApi({ '/api/v2/spot/public/symbols': { body: { code: '00000', data: [] } }, '/api/v2/spot/market/tickers': { body: { code: '00000', data: [] } } }); const r = mkRes(); await require('../api/tickers.js')({}, r); assert.strictEqual(r.body.items.length, 0); });
  // Frontend logic di sandbox VM
  const ls = {}; const ctx = vm.createContext({ localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; } }, console, Date, Math, JSON, Notification: undefined, globalThis: null });
  ctx.globalThis = ctx; ctx.window = ctx;
  for (const f of ['scoring', 'settings', 'watchlist', 'scanner']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/' + f + '.js'), 'utf8').replace(/^const (\w+) =/m, 'var $1 ='), ctx);
  await T('Watchlist: simpan, impor valid/invalid, ekspor', () => { vm.runInContext("Watch.toggle('AAAUSDT'); var r=Watch.fromCSV('symbol\\nBBBUSDT\\n<script>\\nAAAUSDT\\nxyz', new Set(['BBBUSDT','AAAUSDT']));", ctx); assert.deepStrictEqual(JSON.parse(ls['beg.watch']), ['AAAUSDT', 'BBBUSDT']); assert.strictEqual(vm.runInContext('r.skip', ctx), 2); assert(vm.runInContext('Watch.toCSV()', ctx).startsWith('symbol\n')); });
  await T('Alert: dedup, cooldown, status, harga awal tetap', () => {
    vm.runInContext("Store.s.minVol=1;var t={s:'AAAUSDT',b:'AAA',p:100,v:5e6,ch24:5};var an=(sc,br)=>({score:sc,m:{rvol:3,breakout:!!br},reasons:['r'],warn:[]});Scanner.signal('AAAUSDT',an(75),t);Scanner.signal('AAAUSDT',an(75),t);", ctx);
    assert.strictEqual(vm.runInContext('Store.alerts.length', ctx), 1);
    vm.runInContext("t.p=101;Scanner.signal('AAAUSDT',an(81),t)", ctx); assert.strictEqual(vm.runInContext('Store.alerts[0].status', ctx), 'MOMENTUM STRENGTHENING');
    vm.runInContext("Scanner.signal('AAAUSDT',an(81,true),t)", ctx); assert.strictEqual(vm.runInContext('Store.alerts[0].status', ctx), 'BREAKOUT CONFIRMED');
    vm.runInContext("Scanner.signal('AAAUSDT',an(68),t)", ctx); assert.strictEqual(vm.runInContext('Store.alerts[0].status', ctx), 'WEAKENING');
    vm.runInContext("t.p=98;Scanner.signal('AAAUSDT',an(70),t)", ctx); assert.strictEqual(vm.runInContext('Store.alerts[0].status', ctx), 'INVALIDATED');
    assert.strictEqual(vm.runInContext('Store.alerts[0].p0', ctx), 100);
    vm.runInContext("Store.alerts[0].closed=true;Scanner.signal('AAAUSDT',an(90),t)", ctx); assert.strictEqual(vm.runInContext('Store.alerts.length', ctx), 1, 'cooldown');
  });
  await T('Alert: tidak dibuat untuk skor null / kenaikan ekstrem', () => { vm.runInContext("Scanner.signal('CCCUSDT',{score:null,m:{}},{p:1,v:9e6,ch24:1,b:'C'});Scanner.signal('DDDUSDT',an(90),{p:1,v:9e6,ch24:99,b:'D'})", ctx); assert.strictEqual(vm.runInContext("Store.alerts.filter(a=>a.s==='CCCUSDT'||a.s==='DDDUSDT').length", ctx), 0); });
  await T('Evaluasi: horizon diisi hanya setelah waktu berlalu', () => { vm.runInContext("var a=Store.alerts[0];a.closed=false;a.t0=Date.now()-6*60000;a.h={};Scanner.track(new Map([['AAAUSDT',{p:110}]]))", ctx); assert(Math.abs(vm.runInContext('Store.alerts[0].h[5]', ctx) - 0.1) < 1e-9); assert.strictEqual(vm.runInContext('Store.alerts[0].h[15]', ctx), undefined); });
  console.log(pass + ' tes lulus'); 
})();
