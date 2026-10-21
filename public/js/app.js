'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { tk: new Map(), last: null, api: '—', err: null, tab: 'scan', detail: null, g: '5min', rafQ: false };
const fmtP = (p) => { if (p == null || !isFinite(p)) return 'N/A'; if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 }); if (p >= 1) return p.toFixed(4); return p.toFixed(Math.min(10, Math.max(4, -Math.floor(Math.log10(p)) + 3))); };
const fmtPct = (x) => (x == null || !isFinite(x) ? 'N/A' : (x >= 0 ? '+' : '') + x.toFixed(2) + '%');
const fmtV = (v) => (v == null ? 'N/A' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(0));
const cls = (x) => (x == null ? 'dim' : x >= 0 ? 'up' : 'dn');
const pc = (x) => (x == null ? null : x * 100);
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'j'; };
const hhmm = (t) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function tkList() { const c = Store.s; return [...S.tk.values()].filter((t) => c.pairMode !== 'watch' || Watch.has(t.s)); }
function status(sym) { const a = Scanner.open(sym); return a ? a.status : null; }

function card(t) {
  const an = Scanner.scan.get(t.s), w = Watch.has(t.s), sc = an && an.score != null ? an.score : null, m = an ? an.m : {};
  const st = status(t.s) || Scoring.category(sc);
  const note = an && an.provisional ? 'PROVISIONAL: ' + esc(an.reasons[0]) : !an ? 'Belum dipindai (antre scanner)' : '';
  return `<div class="coin"><div class="d-flex justify-content-between"><div><b>${esc(t.b)}</b><span class="dim">/USDT</span> <span class="tag">${esc(t.s)}</span></div>
  <div class="text-end"><div class="px">${fmtP(t.p)}</div><div class="${cls(t.ch24)}">24j ${fmtPct(t.ch24)}</div></div></div>
  <div class="grid3"><span>1m <b class="dim">N/A</b></span><span>5m <b class="${cls(m.ch5)}">${fmtPct(pc(m.ch5))}</b></span><span>15m <b class="${cls(m.ch15)}">${fmtPct(pc(m.ch15))}</b></span>
  <span>Vol24 <b>${fmtV(t.v)}</b></span><span>RVOL <b>${m.rvol != null ? m.rvol.toFixed(1) + 'x' : 'N/A'}</b></span><span>Skor <b class="g">${sc == null ? 'N/A' : sc}</b></span></div>
  <div class="bar"><i style="width:${sc || 0}%"></i></div>
  <div class="d-flex justify-content-between align-items-center"><span class="pill ${sc >= 70 ? 'on' : 'mid'}">${esc(st)}</span><span class="dim small">${note}</span>
  <span><button class="btn-t" data-act="detail" data-s="${esc(t.s)}">Detail</button> <button class="btn-t ${w ? 'sel' : ''}" data-act="watch" data-s="${esc(t.s)}" aria-label="watchlist">${w ? '★' : '☆'}</button></span></div></div>`;
}
function table(rows, rank) {
  return `<div class="wrap"><table class="desk"><thead><tr><th>${rank ? '#' : ''}Pair</th><th>Harga</th><th>24j</th><th>5m</th><th>15m</th><th>Vol24</th><th>RVOL</th><th>Skor</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((t, i) => {
    const an = Scanner.scan.get(t.s), m = an ? an.m : {};
    return `<tr><td>${rank ? i + 1 + '. ' : ''}${esc(t.s)}</td><td>${fmtP(t.p)}</td><td class="${cls(t.ch24)}">${fmtPct(t.ch24)}</td><td class="${cls(m.ch5)}">${fmtPct(pc(m.ch5))}</td><td class="${cls(m.ch15)}">${fmtPct(pc(m.ch15))}</td><td>${fmtV(t.v)}</td><td>${m.rvol != null ? m.rvol.toFixed(1) + 'x' : 'N/A'}</td><td class="g">${an && an.score != null ? an.score : 'N/A'}</td><td>${esc(status(t.s) || Scoring.category(an && an.score))}</td><td><button class="btn-t" data-act="detail" data-s="${esc(t.s)}">Detail</button> <button class="btn-t" data-act="watch" data-s="${esc(t.s)}">${Watch.has(t.s) ? '★' : '☆'}</button></td></tr>`;
  }).join('')}</tbody></table></div><div class="cards">${rows.map(card).join('')}</div>`;
}
const loading = () => '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
const empty = (m) => `<div class="empty">${esc(m)}</div>`;

function vDash() {
  if (!S.tk.size) return '<h2>dashboard</h2>' + (S.err ? empty('Gagal memuat data: ' + S.err) : loading());
  const all = tkList(), c = Store.s, up = all.filter((t) => t.ch24 > 0).length, dn = all.filter((t) => t.ch24 < 0).length;
  const sc = [...Scanner.scan.values()], open = Store.alerts.filter((a) => !a.closed && a.status !== 'INVALIDATED').length;
  const spike = sc.filter((a) => a.m.rvol >= 2).length, brk = sc.filter((a) => a.m.breakout).length;
  const mov = all.filter((t) => t.v >= c.minVol && t.ch24 != null).sort((a, b) => Math.abs(b.ch24) - Math.abs(a.ch24)).slice(0, 5);
  const volA = all.slice().sort((a, b) => b.v - a.v).slice(0, 5);
  const feed = Store.alerts.slice(-5).reverse();
  return `<h2>dashboard</h2><div class="grid2">
  <div class="stat">Pair dipantau<b>${all.length}</b></div><div class="stat">Sinyal aktif<b>${open}</b></div>
  <div class="stat">Lonjakan volume<b>${scanned() ? spike : 'N/A'}</b><span class="dim small">RVOL≥2 dari ${sc.length} pair terpindai</span></div><div class="stat">Breakout<b>${scanned() ? brk : 'N/A'}</b><span class="dim small">dari ${sc.length} terpindai</span></div>
  <div class="stat">Naik / Turun<b><span class="up">${up}</span> / <span class="dn">${dn}</span></b></div><div class="stat">Koneksi<b>${esc($('#st-conn').textContent)}</b><span class="dim small">upd ${S.last ? hhmm(S.last) : 'N/A'}</span></div></div>
  <div class="panel mt-2"><b>Perubahan terbesar (24j, vol≥min)</b>${mov.map((t) => `<div class="d-flex justify-content-between"><a href="#/coin/${esc(t.s)}">${esc(t.s)}</a><span class="${cls(t.ch24)}">${fmtPct(t.ch24)}</span></div>`).join('') || '<div class="dim">N/A</div>'}</div>
  <div class="panel"><b>Aktivitas volume (24j)</b>${volA.map((t) => `<div class="d-flex justify-content-between"><a href="#/coin/${esc(t.s)}">${esc(t.s)}</a><span>${fmtV(t.v)} USDT</span></div>`).join('')}</div>
  <div class="panel"><b>Feed sinyal terbaru</b>${feed.map((a) => `<div>${hhmm(a.t0)} <a href="#/coin/${esc(a.s)}">${esc(a.s)}</a> <span class="pill on">${esc(a.status)}</span> skor ${a.score0}</div>`).join('') || '<div class="dim">Belum ada sinyal. Scanner memindai bertahap; sinyal muncul bila kriteria terpenuhi.</div>'}</div>`;
}
const scanned = () => Scanner.scan.size > 0;

function vEarly() {
  const tabs = [['scan', 'Scanner'], ['alert', 'Alert'], ['eval', 'Evaluasi']].map(([k, l]) => `<button class="btn-t ${S.tab === k ? 'sel' : ''}" data-act="tab" data-k="${k}">${l}</button>`).join(' ');
  let body = '';
  if (S.tab === 'scan') {
    const rows = [...Scanner.scan.entries()].filter(([s, a]) => a.score != null && S.tk.has(s)).map(([s, a]) => S.tk.get(s)).filter((t) => (Scanner.scan.get(t.s).m.rvol || 0) >= Store.s.minRvol && Scanner.scan.get(t.s).score >= Store.s.minScore && t.v >= Store.s.minVol && !(t.ch24 > Store.s.maxChange24)).sort((a, b) => Scanner.scan.get(b.s).score - Scanner.scan.get(a.s).score).slice(0, 40);
    body = `<div class="dim small mb-2">Terpindai: ${Scanner.scan.size} pair (batch bergilir ${Store.s.batch}/${Store.s.scanSec}s). Filter: skor≥${Store.s.minScore}, RVOL≥${Store.s.minRvol}, 24j≤${Store.s.maxChange24}%.${Scanner.busy ? ' <span class="g">scan berjalan…</span>' : ''}${Scanner.lastErr ? ' <span class="warn">' + esc(Scanner.lastErr) + '</span>' : ''}</div>` + (rows.length ? table(rows) : S.tk.size ? empty(Scanner.scan.size ? 'Belum ada pair yang memenuhi filter saat ini.' : 'Scanner sedang mengumpulkan candle…') : loading());
  } else if (S.tab === 'alert') {
    const al = Store.alerts.slice().reverse();
    body = al.length ? al.slice(0, 60).map((a) => { const ch = (a.last / a.p0 - 1) * 100; return `<div class="coin"><div class="d-flex justify-content-between"><b><a href="#/coin/${esc(a.s)}">${esc(a.s)}</a></b><span class="pill ${a.status === 'INVALIDATED' ? 'off' : 'on'}">${esc(a.status)}</span></div>
      <div class="small dim">Terdeteksi ${new Date(a.t0).toLocaleString('id-ID')}</div><div class="grid3"><span>Harga sinyal<br><b>${fmtP(a.p0)}</b></span><span>Terakhir<br><b>${fmtP(a.last)}</b></span><span>Sejak sinyal<br><b class="${cls(ch)}">${fmtPct(ch)}</b></span><span>Skor awal<br><b>${a.score0}</b></span><span>RVOL<br><b>${a.rvol0 != null ? a.rvol0.toFixed(1) + 'x' : 'N/A'}</b></span><span>Skor kini<br><b>${a.score}</b></span></div>
      <div class="small">${a.reasons.map(esc).join(' · ')}</div><div class="small warn">${a.warn.map(esc).join(' · ')}</div><div class="small dim">Invalidasi: ${esc(a.inval)}</div></div>`; }).join('') : empty('Belum ada alert. Alert dibuat saat pair pertama kali memenuhi kriteria (cooldown ' + Store.s.cooldownMin + ' menit per pair).');
    body += '<div class="dim small">Alert tersimpan di browser ini (localStorage) dan hanya aktif selama aplikasi terbuka.</div>';
  } else {
    const done = Store.alerts.filter((a) => a.h[5] != null);
    const row = (a) => `<tr><td>${esc(a.s)}</td>${[5, 15, 60].map((h) => `<td class="${cls(a.h[h])}">${a.h[h] == null ? 'menunggu' : fmtPct(a.h[h] * 100)}</td>`).join('')}<td class="up">${fmtPct((a.hi / a.p0 - 1) * 100)}</td><td class="dn">${fmtPct((a.lo / a.p0 - 1) * 100)}</td></tr>`;
    const avg = (h) => { const v = Store.alerts.filter((a) => a.h[h] != null).map((a) => a.h[h] * 100); return v.length ? fmtPct(v.reduce((x, y) => x + y, 0) / v.length) + ' (n=' + v.length + ')' : 'N/A'; };
    body = `<div class="panel small">Rata-rata setelah 5m: ${avg(5)} · 15m: ${avg(15)} · 1j: ${avg(60)}<br><span class="dim">Hasil hanya muncul setelah horizon selesai. Harga dari polling ticker (resolusi ≈ interval polling), bukan tick-by-tick. Kenaikan setelah sinyal ≠ profit nyata: biaya transaksi, spread, dan slippage belum dihitung. Sampel kecil tidak signifikan secara statistik.</span></div>` + (done.length ? `<div class="wrap"><table class="desk" style="display:table"><thead><tr><th>Pair</th><th>+5m</th><th>+15m</th><th>+1j</th><th>MFE</th><th>MAE</th></tr></thead><tbody>${done.reverse().map(row).join('')}</tbody></table></div>` : empty('Belum ada sinyal dengan horizon selesai.'));
  }
  return `<h2>early gainer</h2><div class="scanline"></div><div class="mb-2">${tabs}</div>${body}`;
}

function vTop() {
  if (!S.tk.size) return '<h2>top gainer</h2>' + loading();
  const c = Store.s, base = tkList().filter((t) => t.ch24 != null && t.v >= c.minVol);
  const g = base.slice().sort((a, b) => b.ch24 - a.ch24).slice(0, 10);
  const o = base.filter((t) => { const a = Scanner.scan.get(t.s); return a && a.score != null && !(t.ch24 > c.maxChange24) && !(a.m.spread > 0.004); }).sort((a, b) => Scanner.scan.get(b.s).score - Scanner.scan.get(a.s).score).slice(0, 10);
  const gs = new Set(g.map((t) => t.s)), os = new Set(o.map((t) => t.s)), both = g.filter((t) => os.has(t.s)).map((t) => t.s);
  const risk = (t) => { const a = Scanner.scan.get(t.s); return !a || a.score == null ? 'N/A' : a.warn.length ? a.warn[0] : 'normal'; };
  return `<h2>top 10 gainer (24j)</h2><div class="dim small mb-2">Vol minimum ${fmtV(c.minVol)} USDT (ubah di Settings). ${both.length ? 'Masuk kedua ranking: <b class="g">' + both.map(esc).join(', ') + '</b>' : 'Tidak ada pair di kedua ranking.'}</div>${table(g, true)}
  <div class="dim small">Risiko: ${g.map((t) => esc(t.b) + '=' + esc(risk(t))).join(' | ')}</div>
  <h2 class="mt-3">top 10 opportunity</h2><div class="dim small mb-2">Hanya pair yang sudah terpindai dengan skor valid, non-ekstrem, dan spread wajar. ${Scanner.scan.size} pair terpindai.</div>${o.length ? table(o, true).replace(/<\/button><\/td>/g, '</button></td>') : empty('Belum ada pair terpindai yang memenuhi syarat.')}`;
}

function vWatch() {
  const rows = Store.watch.map((s) => S.tk.get(s)).filter(Boolean).sort((a, b) => (Scanner.scan.get(b.s)?.score ?? -1) - (Scanner.scan.get(a.s)?.score ?? -1));
  return `<h2>watchlist</h2><div class="mb-2"><button class="btn-t" data-act="exp">Ekspor CSV</button> <label class="btn-t d-inline-block" style="width:auto;margin:0">Impor CSV<input type="file" accept=".csv,text/csv" id="imp" hidden></label></div>${rows.length ? table(rows) : empty('Watchlist kosong. Tekan ☆ pada kartu koin.')}`;
}

function field(k, l, type = 'number', step) { return `<label>${l}</label><input data-k="${k}" type="${type}" ${step ? 'step="' + step + '"' : ''} value="${esc(Store.s[k])}">`; }
function sel(k, l, o) { return `<label>${l}</label><select data-k="${k}">${o.map(([v, t]) => `<option value="${v}" ${String(Store.s[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`; }
function vSettings() {
  const yn = [[true, 'Aktif'], [false, 'Nonaktif']];
  return `<h2>settings</h2><div class="panel">${field('refreshSec', 'Polling REST ticker (detik, min 5)')}${field('scanSec', 'Interval scan candle (detik, min 10)')}${field('batch', 'Pair per batch scan (5–60)')}${field('minVol', 'Minimum volume 24j (USDT)')}${field('minRvol', 'Minimum relative volume', 'number', '0.1')}${field('minScore', 'Minimum Opportunity Score')}${field('maxChange24', 'Filter kenaikan ekstrem 24j (%)')}${field('cooldownMin', 'Cooldown alert per pair (menit)')}
  ${sel('pairMode', 'Pair dipantau', [['all', 'Semua Spot USDT aktif'], ['watch', 'Hanya watchlist']])}${sel('notif', 'Notifikasi browser (hanya saat tab terbuka)', yn)}${sel('matrix', 'Animasi Matrix', yn)}${sel('reduced', 'Reduced motion', yn)}${sel('theme', 'Tema', [['matrix', 'Matrix hijau'], ['amber', 'Amber']])}
  <button class="btn-t mt-3" data-act="reset">Reset pengaturan</button></div><div class="dim small">Frekuensi UI, polling REST, dan WebSocket dipisah. WebSocket hanya untuk ≤40 pair (watchlist + top gainer).</div>`;
}

async function vCoin(sym) {
  const el = $('#view'); el.innerHTML = `<h2>${esc(sym)}</h2>` + loading();
  const t = S.tk.get(sym);
  try {
    const [cs, c1, c5] = await Promise.all([Api.candles(sym, S.g, 200), Api.candles(sym, '1min', 100), Api.candles(sym, '5min', 150)]);
    if (location.hash !== '#/coin/' + sym) return;
    const tt = t || { p: cs[cs.length - 1].c, v: 0, ch24: null, b: sym.replace('USDT', '') };
    const an = Scoring.analyze(c5, tt, Store.s, Date.now()); if (an.score != null) Scanner.scan.set(sym, Object.assign(an, { at: Date.now() }));
    const k1 = c1.slice(0, -1), n = k1.length, chg = (b) => (n > b ? (k1[n - 1].c / k1[n - 1 - b].c - 1) * 100 : null);
    const hi = Math.max(...cs.slice(-48).map((x) => x.h)), lo = Math.min(...cs.slice(-48).map((x) => x.l));
    const parts = an.parts ? [['Relative volume', an.parts.rvol, 25], ['Momentum', an.parts.mom, 20], ['Tren EMA/MACD', an.parts.trend, 20], ['Breakout/struktur', an.parts.brk, 15], ['Likuiditas/spread', an.parts.liq, 10], ['Penalti risiko', -an.parts.pen, 10]] : [];
    const al = Store.alerts.filter((a) => a.s === sym).reverse();
    el.innerHTML = `<h2>${esc(sym)}</h2><div class="panel d-flex justify-content-between"><div><div class="px" id="c-px">${fmtP(tt.p)}</div><div id="c-ch" class="${cls(tt.ch24)}">24j ${fmtPct(tt.ch24)}</div></div><div class="text-end"><button class="btn-t ${Watch.has(sym) ? 'sel' : ''}" data-act="watch" data-s="${esc(sym)}">${Watch.has(sym) ? '★' : '☆'}</button> <a class="btn-t" href="#/early" style="text-decoration:none">←</a></div></div>
    <div class="mb-2">${['1min', '5min', '15min', '1h', '4h'].map((g) => `<button class="btn-t ${S.g === g ? 'sel' : ''}" data-act="gran" data-g="${g}">${g.replace('min', 'm')}</button>`).join(' ')}</div>
    <div id="ch-p" class="chart"></div><div class="dim small">RSI(14)</div><div id="ch-r" class="chart"></div><div class="dim small">MACD histogram (12,26,9)</div><div id="ch-m" class="chart"></div>
    <div class="panel"><div class="grid3"><span>1m ${fmtPct(chg(1))}</span><span>5m ${fmtPct(chg(5))}</span><span>15m ${fmtPct(chg(15))}</span><span>1j ${fmtPct(chg(60))}</span><span>24j ${fmtPct(tt.ch24)}</span><span>RVOL ${an.m.rvol != null ? an.m.rvol.toFixed(1) + 'x' : 'N/A'}</span><span>RSI ${an.m.rsi != null ? an.m.rsi.toFixed(0) : 'N/A'}</span><span>Spread ${an.m.spread != null ? (an.m.spread * 100).toFixed(3) + '%' : 'N/A'}</span><span>Vol24 ${fmtV(tt.v)}</span></div>
    <div class="small dim">Zona resistance/support (heuristik: high/low tertinggi 48 candle interval ini, bukan level pasti): R ${fmtP(hi)} · S ${fmtP(lo)}</div></div>
    <div class="panel"><b>Opportunity Score: <span class="g">${an.score == null ? 'N/A (PROVISIONAL)' : an.score + ' · ' + Scoring.category(an.score)}</span></b><div class="dim small">Kekuatan sinyal, bukan probabilitas profit.</div>
    ${parts.map(([l, v, m]) => `<div class="small d-flex justify-content-between"><span>${l}</span><span>${v.toFixed(1)} / ${m}</span></div><div class="bar"><i style="width:${Math.abs(v) / m * 100}%;${v < 0 ? 'background:var(--dn)' : ''}"></i></div>`).join('')}
    <div class="small up mt-2">${an.reasons.map(esc).join('<br>')}</div><div class="small warn">${an.warn.map(esc).join('<br>')}</div></div>
    <div class="panel"><b>Histori alert</b>${al.map((a) => `<div class="small">${new Date(a.t0).toLocaleString('id-ID')} · ${esc(a.status)} · skor ${a.score0} · ${fmtP(a.p0)}</div>`).join('') || '<div class="dim small">Belum ada alert untuk pair ini.</div>'}</div>`;
    Charts.draw({ price: $('#ch-p'), rsi: $('#ch-r'), macd: $('#ch-m') }, cs);
  } catch (e) { el.innerHTML = `<h2>${esc(sym)}</h2>` + empty('Gagal memuat candle: ' + e.message) + '<button class="btn-t mt-2" data-act="retry">Coba lagi</button>'; }
}

function render() {
  S.rafQ = false;
  const h = location.hash.replace('#/', '') || 'dash', el = $('#view');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('act', a.dataset.nav === h.split('/')[0]));
  if (h.startsWith('coin/')) return;
  Charts.clear();
  const f = { dash: vDash, early: vEarly, top: vTop, watch: vWatch, settings: vSettings }[h] || vDash;
  if (h === 'settings' && el.querySelector('[data-k]:focus')) return; // jangan bongkar form saat mengetik
  el.innerHTML = f();
}
function rq() { if (!S.rafQ) { S.rafQ = true; requestAnimationFrame(render); } }
function route() { const h = location.hash; const m = h.match(/^#\/coin\/([A-Z0-9]{2,20}USDT)$/); if (m) { S.detail = m[1]; vCoin(m[1]); document.querySelectorAll('[data-nav]').forEach((a) => a.classList.remove('act')); } else render(); window.scrollTo(0, 0); }

function topbar() {
  const w = Ws.state, ok = S.api === 'OK';
  const conn = ok ? (w === 'CONNECTED' ? 'CONNECTED' : 'CONNECTED') : S.api === 'ERROR' ? (S.tk.size ? 'RECONNECTING' : 'OFFLINE') : 'OFFLINE';
  const c = $('#st-conn'); c.textContent = conn; c.className = 'pill ' + (conn === 'CONNECTED' ? 'on' : conn === 'RECONNECTING' ? 'mid' : 'off');
  $('#st-api').textContent = S.api; $('#st-ws').textContent = w === 'CONNECTED' ? 'LIVE' : w; $('#st-ts').textContent = S.last ? hhmm(S.last) : '—';
}

async function poll() {
  try {
    const d = await Api.tickers(), m = new Map();
    for (const x of d.items) { if (!(x.p > 0)) continue; x.ch24 = x.o > 0 ? (x.p / x.o - 1) * 100 : null; m.set(x.s, x); }
    S.tk = m; S.last = Date.now(); S.err = null; S.api = d.stale ? 'STALE' : 'OK';
    Scanner.track(m); wsTargets();
  } catch (e) { S.err = e.message; S.api = 'ERROR'; }
  topbar(); if (!location.hash.startsWith('#/coin/')) rq(); else updCoin();
}
function updCoin() { const t = S.tk.get(S.detail); if (t && $('#c-px')) { $('#c-px').textContent = fmtP(t.p); const c = $('#c-ch'); c.textContent = '24j ' + fmtPct(t.ch24); c.className = cls(t.ch24); } }
function wsTargets() {
  const top = [...S.tk.values()].filter((t) => t.ch24 != null && t.v >= Store.s.minVol).sort((a, b) => b.ch24 - a.ch24).slice(0, 10).map((t) => t.s);
  Ws.setWanted([...new Set([...(S.detail ? [S.detail] : []), ...Store.watch, ...top])].filter((s) => S.tk.has(s)));
}
let tmP, tmS;
function loopPoll() { clearTimeout(tmP); tmP = setTimeout(async () => { if (!document.hidden) await poll(); loopPoll(); }, Math.max(5, Store.s.refreshSec) * 1000); }
function loopScan() { clearTimeout(tmS); tmS = setTimeout(async () => { if (!document.hidden && S.tk.size) await Scanner.run(S.tk, rq); loopScan(); }, Math.max(10, Store.s.scanSec) * 1000); }

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, s = b.dataset.s;
  if (a === 'detail') location.hash = '#/coin/' + s;
  else if (a === 'watch') { Watch.toggle(s); wsTargets(); location.hash.startsWith('#/coin/') ? (b.classList.toggle('sel'), b.textContent = Watch.has(s) ? '★' : '☆') : rq(); }
  else if (a === 'tab') { S.tab = b.dataset.k; rq(); }
  else if (a === 'gran') { S.g = b.dataset.g; vCoin(S.detail); }
  else if (a === 'retry') vCoin(S.detail);
  else if (a === 'reset') { Store.reset(); applyUi(); rq(); }
  else if (a === 'exp') { const u = URL.createObjectURL(new Blob([Watch.toCSV()], { type: 'text/csv' })), l = document.createElement('a'); l.href = u; l.download = 'watchlist.csv'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'imp' && t.files[0]) { try { const r = Watch.fromCSV(await t.files[0].text(), S.tk.size ? S.tk : null); alert('Impor: ' + r.add + ' ditambahkan, ' + r.skip + ' dilewati (tidak valid/tidak aktif)'); } catch (x) { alert(x.message); } t.value = ''; wsTargets(); rq(); return; }
  const k = t.dataset && t.dataset.k; if (!k) return;
  const def = Store.DEF[k]; let v = t.value;
  if (typeof def === 'number') { v = parseFloat(v); if (!isFinite(v) || v < 0) v = def; } else if (typeof def === 'boolean') v = v === 'true';
  if (k === 'refreshSec') v = Math.max(5, v); if (k === 'scanSec') v = Math.max(10, v); if (k === 'batch') v = Math.min(60, Math.max(5, v));
  Store.s[k] = v; Store.saveS();
  if (k === 'notif' && v && typeof Notification !== 'undefined') Notification.requestPermission().then((p) => { if (p !== 'granted') { Store.s.notif = false; Store.saveS(); alert('Izin notifikasi ditolak.'); } });
  applyUi(); loopPoll(); loopScan(); rq();
});

// Matrix rain ringan (~15 fps), berhenti saat tab tersembunyi / reduced motion / dimatikan.
const Rain = {
  c: null, x: null, cols: [], tm: null,
  start() { this.c = $('#rain'); this.x = this.c.getContext('2d'); this.resize(); this.loop(); },
  resize() { this.c.width = innerWidth; this.c.height = innerHeight; this.cols = Array(Math.ceil(innerWidth / 16)).fill(0).map(() => Math.random() * 40); },
  loop() { clearTimeout(this.tm); if (!Store.s.matrix || Store.s.reduced || matchMedia('(prefers-reduced-motion:reduce)').matches) { this.x.clearRect(0, 0, this.c.width, this.c.height); return; }
    this.tm = setTimeout(() => { if (!document.hidden) { const x = this.x; x.fillStyle = 'rgba(5,8,7,.12)'; x.fillRect(0, 0, this.c.width, this.c.height); x.fillStyle = '#00FF66'; x.font = '14px monospace'; this.cols.forEach((y, i) => { x.fillText(String.fromCharCode(0x30A0 + Math.random() * 60), i * 16, y * 16); this.cols[i] = y * 16 > this.c.height && Math.random() > 0.975 ? 0 : y + 1; }); } this.loop(); }, 66); }
};
function applyUi() { document.documentElement.dataset.theme = Store.s.theme === 'amber' ? 'amber' : ''; document.body.classList.toggle('reduced', Store.s.reduced); Rain.c && Rain.loop(); }

window.addEventListener('hashchange', route);
window.addEventListener('resize', () => Rain.c && Rain.resize());
document.addEventListener('visibilitychange', () => { if (!document.hidden) { Ws.wake(); poll(); } });
window.addEventListener('online', () => { Ws.wake(); poll(); });
window.addEventListener('error', (e) => { S.err = e.message; });
window.addEventListener('unhandledrejection', (e) => { S.err = String(e.reason && e.reason.message || e.reason); });
Ws.onState = () => topbar();
Ws.onTick = (s, d) => { const t = S.tk.get(s); if (!t) return; t.p = d.p; if (d.bid > 0) t.bid = d.bid; if (d.ask > 0) t.ask = d.ask; if (t.o > 0) t.ch24 = (t.p / t.o - 1) * 100; if (s === S.detail) updCoin(); };
Rain.start(); applyUi(); route(); poll().then(() => { Ws.connect(); wsTargets(); }); loopPoll(); loopScan(); setTimeout(() => S.tk.size && Scanner.run(S.tk, rq), 1500);
