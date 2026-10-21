// Tes offline. PENTING: seluruh data di sini SINTETIS/mock (format mengikuti dokumentasi Bitget v2), BUKAN respons live.
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
let pass = 0; const T = async (n, f) => { try { await f(); pass++; console.log('ok  ', n); } catch (e) { console.log('FAIL', n, e.message); process.exitCode = 1; } };
const Sc = require('../public/js/scoring.js'), BT = require('../tools/backtest.js');
const mkRes = () => ({ h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const mockFetch = (map) => async (url) => { const u = new URL(url); const f = map[u.pathname]; if (!f) return { ok: false, status: 404, json: async () => ({}) }; const x = typeof f === 'function' ? f(u) : f; return { ok: x.status ? x.status < 400 : true, status: x.status || 200, json: async () => x.body }; };
const syms = { code: '00000', data: [{ symbol: 'AAAUSDT', baseCoin: 'AAA', quoteCoin: 'USDT', status: 'online' }, { symbol: 'OLDUSDT', baseCoin: 'OLD', quoteCoin: 'USDT', status: 'offline' }, { symbol: 'BTCETH', baseCoin: 'BTC', quoteCoin: 'ETH', status: 'online' }, { symbol: 'AAAUSDT', baseCoin: 'AAA', quoteCoin: 'USDT', status: 'online' }] };
const tks = { code: '00000', data: [{ symbol: 'AAAUSDT', lastPr: '0.00001234', open: '0.00001000', quoteVolume: '500000', bidPr: '0.0000123', askPr: '0.0000124', ts: '1' }, { symbol: 'AAAUSDT', lastPr: '9', open: '9', quoteVolume: '1' }, { symbol: 'OLDUSDT', lastPr: '1', open: '1', quoteVolume: '9' }, { symbol: 'BTCETH', lastPr: '1', open: '1', quoteVolume: '9' }, { symbol: 'BADUSDT', lastPr: '0', open: '1', quoteVolume: 'x' }] };
const NOW = 1.8e12;
// generator candle sintetis; f(i,p,n) -> {o,h,l,c,q}; candle terakhir tertutup pada NOW
function mk(n, step, f) { const o = []; let p = 100; for (let i = 0; i < n; i++) { const r = f(i, p, n); p = r.c; o.push({ t: NOW - (n - i) * step, o: r.o, h: r.h, l: r.l, c: r.c, v: r.q / r.c, q: r.q }); } return o; }
const flat = (i, p) => ({ o: p, h: p * 1.001, l: p * 0.999, c: p * (1 + (i % 2 ? 0.0004 : -0.0004)), q: 1000 });
// kenaikan bertahap + volume naik pada N candle terakhir, dengan wick kecil
const rise = (k, q, up = 0.008) => (i, p, n) => (i >= n - k ? { o: p, h: p * (1 + up + 0.0005), l: p * 0.9995, c: p * (1 + up), q: q * (1 + (i - (n - k)) * 0.3) } : flat(i, p));
const D = (f5, f1, f15) => ({ c5: mk(200, 300000, f5), c1: mk(120, 60000, f1 || ((i, p) => flat(i, p))), c15: mk(100, 900000, f15 || flat), book: null });
const tk = { p: 100, v: 5e6, bid: 100, ask: 100.04, ch24: 5, age: 1000 }, cfg = { maxChange24: 30, minVol: 2e5, strict: false };
const sumW = Object.values(Sc.W).reduce((a, b) => a + b, 0);
(async () => {
  await T('Bobot dasar berjumlah tepat 100', () => assert.strictEqual(sumW, 100));
  await T('EMA/RSI/MACD range', () => { const c = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 3); const r = Sc.rsi(c).filter((x) => x != null); assert(r.every((x) => x >= 0 && x <= 100)); assert.strictEqual(Sc.ema(c, 9).filter((x) => x == null).length, 8); assert(Sc.macd(c).hist[99] != null); });
  await T('Skor dasar maksimum tepat 100 (semua komponen sempurna)', () => {
    // set komponen langsung via rumus: gunakan analisis dengan data ideal + book sangat dalam
    const d = D(rise(3, 6000, 0.006), rise(5, 3000, 0.003), rise(3, 18000, 0.012)); d.book = { asks: [[100.01, 1e6]], bids: [[100, 1e6]] };
    const a = Sc.analyze(d, { p: 100, v: 5e8, bid: 100, ask: 100.0005, ch24: 2, age: 0 }, cfg, NOW);
    assert(a.base <= 100 && a.base > 0); assert.strictEqual(Object.values(a.parts).reduce((s, p) => s + p.max, 0), 100); assert(a.score <= 100);
  });
  await T('Histori 5m kurang -> N/A tanpa skor (listing baru)', () => { const a = Sc.analyze({ c5: mk(20, 300000, flat) }, tk, cfg, NOW); assert(a.score === null && a.provisional); });
  await T('Data kosong tidak jadi skor tinggi', () => { const a = Sc.analyze({}, tk, cfg, NOW); assert(a.score === null); });
  await T('Candle 1m/15m kurang -> provisional, maks 69, bukan nol palsu', () => { const d = D(rise(3, 6000), null, null); d.c1 = d.c1.slice(-10); d.c15 = []; const a = Sc.analyze(d, tk, cfg, NOW); assert(a.provisional && a.score <= 69); assert(a.parts.rvol.on); });
  await T('Data stale: penalti + provisional; sangat stale -> N/A', () => { const d = D(rise(3, 6000)); const a = Sc.analyze(d, Object.assign({}, tk, { age: 90000 }), cfg, NOW); assert(a.provisional && a.pen.some((p) => /detik/.test(p.why))); assert.strictEqual(Sc.analyze(d, Object.assign({}, tk, { age: 400000 }), cfg, NOW).score, null); });
  await T('Candle yang belum tutup tidak dihitung', () => { const d = D(flat); d.c5[199].t = NOW - 1000; const k = Sc.closedOf(d.c5, 300000, NOW); assert.strictEqual(k.length, 199); });
  await T('Pasar datar rendah; lonjakan volume+momentum lebih tinggi', () => { const f = Sc.analyze(D(flat), tk, cfg, NOW), s = Sc.analyze(D(rise(3, 6000), rise(5, 3000, 0.003), rise(3, 18000, 0.012)), tk, cfg, NOW); assert(f.score < 50, 'flat ' + f.score); assert(s.score > f.score + 25, s.score + ' vs ' + f.score); });
  await T('RVOL anomali dibatasi & diberi peringatan', () => { const d = D((i, p, n) => (i === n - 1 ? { o: p, h: p * 1.01, l: p, c: p * 1.005, q: 1e6 } : flat(i, p))); const a = Sc.analyze(d, tk, cfg, NOW); assert(a.m.rvol <= 10 && a.warn.some((w) => /anomali/.test(w))); });
  await T('Likuiditas rendah & spread tinggi -> penalti + peringatan', () => { const d = D(rise(3, 6000)); const a = Sc.analyze(d, { p: 100, v: 1e4, bid: 100, ask: 101, ch24: 3, age: 0 }, cfg, NOW); assert(a.pen.some((p) => /Spread/.test(p.why)) && a.pen.some((p) => /Likuiditas/.test(p.why))); });
  await T('Slippage dari order book tipis -> penalti', () => { const d = D(rise(3, 6000)); d.book = { asks: [[100, 1], [102, 1]], bids: [[99.9, 1]] }; const a = Sc.analyze(d, tk, cfg, NOW); assert(a.m.slip > 0.005 && a.pen.some((p) => /slippage/i.test(p.why))); });
  await T('Koin sudah naik ekstrem dipenalti', () => { const d = D(rise(3, 6000, 0.006), rise(5, 3000, 0.003), rise(3, 18000, 0.012)); const a = Sc.analyze(d, tk, cfg, NOW), b = Sc.analyze(d, Object.assign({}, tk, { ch24: 80 }), cfg, NOW); assert(b.score < a.score && b.warn.some((w) => /ekstrem/.test(w))); });
  // Breakout
  const brkCandles = (kind) => (i, p, n) => { if (i < n - 2) return flat(i, p); const R = 100.3; if (i === n - 2) return kind === 'fake' ? { o: 100, h: 102, l: 100, c: 100.2, q: 9000 } : { o: 100.1, h: 101.2, l: 100.1, c: 101, q: 9000 }; return kind === 'hold' ? { o: 101, h: 101.6, l: 100.8, c: 101.4, q: 9000 } : kind === 'fake' ? { o: 100.2, h: 102, l: 99.9, c: 100.15, q: 9000 } : { o: 101, h: 101.2, l: 99.9, c: 100.0, q: 9000 }; };
  await T('Breakout bertahan -> CONFIRMED; mode ketat juga lolos', () => { const d = { c5: mk(200, 300000, brkCandles('hold')), c1: null, c15: null }; const a = Sc.analyze(d, tk, cfg, NOW), b = Sc.analyze(d, tk, Object.assign({}, cfg, { strict: true }), NOW); assert.strictEqual(a.m.brk, 'confirmed'); assert.strictEqual(b.m.brk, 'confirmed'); });
  await T('Breakout palsu (wick panjang, close kembali) -> bukan CONFIRMED', () => { const d = { c5: mk(200, 300000, brkCandles('fake')), c1: null, c15: null }; const a = Sc.analyze(d, Object.assign({}, tk, { p: 100.15 }), cfg, NOW); assert.notStrictEqual(a.m.brk, 'confirmed'); });
  await T('Mode ketat menolak breakout tanpa candle konfirmasi kedua', () => { const d = { c5: mk(200, 300000, brkCandles('fail')), c1: null, c15: null }; const a = Sc.analyze(d, tk, Object.assign({}, cfg, { strict: true }), NOW); assert.notStrictEqual(a.m.brk, 'confirmed'); });
  await T('Kategori skor', () => assert.deepStrictEqual([90, 75, 55, 10, null].map(Sc.category), ['HIGH MOMENTUM', 'STRONG SETUP', 'WATCH', 'WEAK SETUP', 'N/A']));
  // API
  const loadApi = (m) => { global.fetch = mockFetch(m); for (const k of Object.keys(require.cache)) if (/api[\\/]/.test(k)) delete require.cache[k]; };
  await T('API tickers: filter offline/non-USDT/invalid & dedup', async () => { loadApi({ '/api/v2/spot/public/symbols': { body: syms }, '/api/v2/spot/market/tickers': { body: tks } }); const r = mkRes(); await require('../api/tickers.js')({}, r); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.items.length, 1); assert.strictEqual(r.body.items[0].p, 0.00001234); });
  await T('API candles: validasi parameter', async () => { loadApi({}); const h = require('../api/candles.js'); for (const q of [{ symbol: 'x', granularity: '5min' }, { symbol: 'AAAUSDT', granularity: '7min' }, { symbol: 'AAAUSDT', granularity: '5min', limit: '9999' }]) { const r = mkRes(); await h({ query: q }, r); assert.strictEqual(r.code, 400); } });
  await T('API candles: parsing, sort, dedup, buang invalid', async () => { loadApi({ '/api/v2/spot/market/candles': { body: { code: '00000', data: [['2000', '1', '2', '1', '2', '5', '10', '10'], ['1000', '1', '2', '1', '1.5', '5', '7', '7'], ['1000', '1', '2', '1', '1.5', '5', '7', '7'], ['3000', 'x', '2', '1', '1', '1', '1', '1']] } } }); const r = mkRes(); await require('../api/candles.js')({ query: { symbol: 'AAAUSDT', granularity: '5min', limit: '100' } }, r); assert.deepStrictEqual(r.body.candles.map((c) => c[0]), [1000, 2000]); });
  await T('API book: parsing & validasi', async () => { loadApi({ '/api/v2/spot/market/orderbook': { body: { code: '00000', data: { asks: [['101', '2'], ['100.5', '1'], ['x', '1']], bids: [['99', '1'], ['99.5', '3']] } } } }); let r = mkRes(); await require('../api/book.js')({ query: { symbol: 'AAAUSDT' } }, r); assert.strictEqual(r.body.asks[0][0], 100.5); assert.strictEqual(r.body.bids[0][0], 99.5); r = mkRes(); await require('../api/book.js')({ query: { symbol: '../x' } }, r); assert.strictEqual(r.code, 400); });
  await T('Rate limit 429 & error kode Bitget -> status error tanpa crash', async () => { loadApi({ '/api/v2/public/time': { body: { code: '40001', msg: 'err' } } }); let r = mkRes(); await require('../api/health.js')({}, r); assert.strictEqual(r.code, 502); loadApi({ '/api/v2/spot/market/candles': { status: 429, body: {} } }); r = mkRes(); await require('../api/candles.js')({ query: { symbol: 'ZZZUSDT', granularity: '5min', limit: '50' } }, r); assert(r.code >= 429); });
  await T('API tickers kosong -> items kosong', async () => { loadApi({ '/api/v2/spot/public/symbols': { body: { code: '00000', data: [] } }, '/api/v2/spot/market/tickers': { body: { code: '00000', data: [] } } }); const r = mkRes(); await require('../api/tickers.js')({}, r); assert.strictEqual(r.body.items.length, 0); });
  // Frontend di sandbox VM
  const ls = {}; const ctx = vm.createContext({ localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; } }, console, Date, Math, JSON, Promise, Notification: undefined });
  ctx.globalThis = ctx; ctx.window = ctx;
  for (const f of ['scoring', 'settings', 'watchlist', 'monitor', 'scanner']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/' + f + '.js'), 'utf8').replace(/^const (\w+) =/m, 'var $1 ='), ctx);
  const run = (c) => vm.runInContext(c, ctx);
  await T('Watchlist: simpan, impor valid/invalid, ekspor', () => { run("Watch.toggle('AAAUSDT'); var r=Watch.fromCSV('symbol\\nBBBUSDT\\n<script>\\nAAAUSDT\\nxyz', new Set(['BBBUSDT','AAAUSDT']));"); assert.deepStrictEqual(JSON.parse(ls['beg.watch']), ['AAAUSDT', 'BBBUSDT']); assert.strictEqual(run('r.skip'), 2); });
  await T('Settings: default batch/scan v2 dan reset', () => { assert.strictEqual(run('Store.s.batch'), 12); run('Store.s.minScore=90;Store.reset()'); assert.strictEqual(run('Store.s.minScore'), 70); });
  const an = (sc, m, o) => `({score:${sc},provisional:false,m:Object.assign({rvol:3,brk:'none',ch5:0.005,R:100.3,lastClose5:101},${JSON.stringify(m || {})}),reasons:['r'],warn:[]})`;
  await T('Alert: dedup, cooldown, harga awal tetap, provisional tidak membuat alert', () => {
    run("Store.s.minVol=1;var t={s:'AAAUSDT',b:'AAA',p:100,v:5e6,ch24:5,age:1000};");
    run(`Scanner.signal('AAAUSDT',Object.assign(${an(65)},{provisional:true}),t)`); assert.strictEqual(run('Store.alerts.length'), 0);
    run(`Scanner.signal('AAAUSDT',${an(75)},t);Scanner.signal('AAAUSDT',${an(75)},t)`); assert.strictEqual(run('Store.alerts.length'), 1);
    run(`t.p=101;Scanner.signal('AAAUSDT',${an(81)},t)`); assert.strictEqual(run('Store.alerts[0].status'), 'MOMENTUM STRENGTHENING');
    run(`Scanner.signal('AAAUSDT',${an(81, { brk: 'detected' })},t)`); assert.strictEqual(run('Store.alerts[0].status'), 'BREAKOUT DETECTED'); assert.strictEqual(run('Store.alerts[0].R'), 100.3);
    run(`Scanner.signal('AAAUSDT',${an(81, { brk: 'confirmed' })},t)`); assert.strictEqual(run('Store.alerts[0].status'), 'BREAKOUT CONFIRMED');
    run(`Scanner.signal('AAAUSDT',${an(81, { brk: 'none' })},t)`); assert.strictEqual(run('Store.alerts[0].status'), 'WEAKENING', 'CONFIRMED tidak boleh dipertahankan saat syarat gagal');
    run(`t.p=101;Scanner.signal('AAAUSDT',${an(70, { lastClose5: 100.0 })},t)`); assert.strictEqual(run('Store.alerts[0].status'), 'INVALIDATED'); assert(/resistance/.test(run('Store.alerts[0].invReason')));
    assert.strictEqual(run('Store.alerts[0].p0'), 100); assert.strictEqual(run('Store.alerts[0].live'), false);
    run(`Scanner.signal('AAAUSDT',${an(90)},t)`); assert.strictEqual(run('Store.alerts.length'), 1, 'cooldown berlaku');
  });
  await T('Alert: invalidasi harga -1.5% dan skor <45 dua kali', () => {
    run("Store.alerts=[];Store.s.cooldownMin=0;var t2={s:'BBBUSDT',b:'B',p:100,v:5e6,ch24:5,age:0};"); run(`Scanner.signal('BBBUSDT',${an(75)},t2)`); run(`t2.p=98.4;Scanner.signal('BBBUSDT',${an(75)},t2)`); assert.strictEqual(run('Store.alerts[0].status'), 'INVALIDATED');
    run("Store.alerts=[];var t3={s:'CCCUSDT',b:'C',p:100,v:5e6,ch24:5,age:0};"); run(`Scanner.signal('CCCUSDT',${an(75)},t3)`); run(`Scanner.signal('CCCUSDT',${an(40)},t3)`); assert.notStrictEqual(run('Store.alerts[0].status'), 'INVALIDATED'); run(`Scanner.signal('CCCUSDT',${an(40)},t3)`); assert.strictEqual(run('Store.alerts[0].status'), 'INVALIDATED');
  });
  await T('Alert: tidak dibuat untuk skor null, kenaikan ekstrem, atau data stale', () => { run("Store.alerts=[];Scanner.signal('DDDUSDT',{score:null,m:{}},{p:1,v:9e6,ch24:1,b:'D'});"); run(`Scanner.signal('EEEUSDT',${an(90)},{p:1,v:9e6,ch24:99,b:'E',age:0});Scanner.signal('FFFUSDT',${an(90)},{p:1,v:9e6,ch24:1,b:'F',age:90000})`); assert.strictEqual(run('Store.alerts.length'), 0); });
  await T('Monitor: perubahan 1m/5m, volume rate, data stale & umur', () => {
    run("var t0=1e12;for(let i=0;i<=40;i++){Monitor.push('XXXUSDT',100*(1+i*0.0005),1e6+i*1000,t0+i*10000);}");
    const st = run('Monitor.stats("XXXUSDT",1e6,t0+400000)'); assert(st.d1 > 0.002 && st.d5 > 0.01 && st.vr > 1, JSON.stringify(st));
    assert.strictEqual(run('Monitor.stats("XXXUSDT",1e6,t0+600000)'), null, 'data stale -> null'); assert.strictEqual(run('Monitor.age("NOPE")'), Infinity);
    assert(run('Monitor.priority({s:"XXXUSDT",v:1e6,ch24:3},t0+400000)').pri > 2);
  });
  const mkTk = (n) => `new Map(Array.from({length:${n}},(_,i)=>{var s='P'+i+'USDT';return [s,{s,b:'P'+i,p:1,v:1e6+i*1000,bid:1,ask:1.0001,ch24:i%7}]}))`;
  await T('Pemilihan kandidat: kuota, dedup, prioritas, top/watchlist/sampling', () => {
    run(`var TK=${mkTk(300)};Store.alerts=[];Store.s.minVol=1;Store.s.batch=12;Store.watch=['P5USDT'];Scanner.scan.clear();Scanner.inflight.clear();var now=Date.now();TK.forEach((t,s)=>{if(s!=='P42USDT')Monitor.push(s,1,t.v,now-1000)});var t0=now-121000;for(let i=0;i<=12;i++)Monitor.push('P42USDT',1+i*0.001,4.2e5+i*50000,t0+i*10000);`);
    const L = run('Scanner.pick(TK, Date.now())'); assert.strictEqual(L.length, 12); assert.strictEqual(new Set(L).size, 12); assert(L.includes('P5USDT'), 'watchlist'); assert(L.includes('P42USDT'), 'kandidat momentum'); assert(Scanner => true);
    run("Scanner.scan.set('P5USDT',{at:Date.now()})"); assert(!run('Scanner.pick(TK, Date.now())').includes('P5USDT'), 'baru dianalisis -> dilewati (cache/dedup)');
  });
  await T('Backpressure: faktor batch turun saat error dan pulih', async () => {
    run("Scanner.factor=1;Scanner.busy=false;Scanner.pauseUntil=0;Scanner.scan.clear();Scanner.inflight.clear();var Api={candles:async()=>{throw new Error('HTTP 502')},book:async()=>{throw new Error('x')}};var _ev=Scanner.evaluate;Scanner.evaluate=async()=>{};");
    await vm.runInContext('Scanner.run(TK)', ctx); assert(run('Scanner.factor') <= 0.5); assert(run('Scanner.st.err') > 0);
    run("Api.candles=async()=>{throw new Error('429 rate limit')};Scanner.scan.clear();Scanner.pauseUntil=0"); await vm.runInContext('Scanner.run(TK)', ctx); assert(run('Scanner.pauseUntil') > Date.now(), 'jeda saat 429');
  });
  await T('Evaluasi: horizon dari candle 1m setelah horizon selesai, tanpa look-ahead', async () => {
    const t0 = Math.floor(Date.now() / 60000) * 60000 - 6 * 60000 - 30000; // sinyal 6.5 menit lalu
    run('Scanner.evaluate=_ev;');
    run(`Store.alerts=[{s:'GGGUSDT',t0:${t0},p0:100,R:100.5,h:{},mfe:{},mae:{},held:{},na:{}}];`);
    run(`var tS=Math.ceil(${t0}/60000)*60000;var cs=[];for(let i=-1;i<8;i++){cs.push({t:tS+i*60000,o:100,h:101+i*0.1,l:99.5,c:100+i*0.2,v:1,q:1})};Api.candles=async()=>cs;`);
    await vm.runInContext('Scanner.evaluate()', ctx);
    const a = run('Store.alerts[0]'); assert(a.h[5] != null && a.h[15] === undefined && a.h[60] === undefined, 'hanya horizon 5m selesai'); assert(a.mae[5] <= -0.005 && a.mfe[5] > 0); assert.strictEqual(typeof a.held[5], 'boolean');
  });
  await T('Metrik evaluasi: n, % positif, median, breakout failure, per kategori', () => {
    run("Store.alerts=[{score0:75,h:{15:0.02},mae:{15:-0.01},mfe:{15:0.03},R:1,brkSeen:true,held:{15:false}},{score0:72,h:{15:-0.01},mae:{15:-0.02},mfe:{15:0.01},R:1,brkSeen:true,held:{15:true}},{score0:60,h:{15:0.005},mae:{15:0},mfe:{15:0.01},held:{}}]");
    const M = run('Scanner.metrics()'); assert.strictEqual(M.res[15].n, 3); assert(Math.abs(M.res[15].pos - 2 / 3) < 1e-9); assert.strictEqual(M.brk.fail, 0.5); assert(M.cat.some((c) => c.k === 'STRONG SETUP' && c.n === 2));
  });
  await T('Backtest: tidak ada look-ahead bias (masa depan diubah, skor masa lalu sama)', () => {
    const cs = mk(400, 300000, (i, p) => (i % 50 > 44 ? { o: p, h: p * 1.012, l: p, c: p * 1.01, q: 4000 + (i % 50) * 400 } : flat(i, p)));
    const mut = cs.map((x, k) => (k > 250 ? Object.assign({}, x, { c: x.c * 3, h: x.h * 3, l: x.l * 3, o: x.o * 3, q: x.q * 50 }) : x));
    const A = BT.backtest(cs.slice(0, 251 + 20), { threshold: 40 }).filter((s) => s.i <= 250), B = BT.backtest(mut.slice(0, 251 + 20), { threshold: 40 }).filter((s) => s.i <= 250);
    assert.deepStrictEqual(A.map((s) => [s.i, s.score]), B.map((s) => [s.i, s.score])); assert(BT.summarize(A)[0].n === A.length);
  });
  console.log(pass + ' tes lulus');
})();
