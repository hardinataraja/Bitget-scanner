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
  const note = an && an.provisional ? 'PROVISIONAL' + (sc != null ? '' : ': ' + esc(an.reasons[0] || '')) : !an ? 'Belum divalidasi' : 'analisis ' + ago(an.at) + ' lalu';
  return `<div class="coin"><div class="d-flex justify-content-between"><div><b>${esc(t.b)}</b><span class="dim">/USDT</span> <span class="tag">${esc(t.s)}</span></div>
  <div class="text-end"><div class="px">${fmtP(t.p)}</div><div class="${cls(t.ch24)}">24j ${fmtPct(t.ch24)}</div></div></div>
  <div class="grid3"><span>1m <b class="${cls(m.ch1)}">${fmtPct(pc(m.ch1))}</b></span><span>5m <b class="${cls(m.ch5)}">${fmtPct(pc(m.ch5))}</b></span><span>15m <b class="${cls(m.ch15)}">${fmtPct(pc(m.ch15))}</b></span>
  <span>Vol24 <b>${fmtV(t.v)}</b></span><span>RVOL <b>${m.rvol != null ? m.rvol.toFixed(1) + 'x' : 'N/A'}</b></span><span>Skor <b class="g">${sc == null ? 'N/A' : sc}</b></span></div>
  <div class="bar"><i style="width:${sc || 0}%"></i></div>
  <div class="d-flex justify-content-between align-items-center"><span class="pill ${sc >= 70 ? 'on' : 'mid'}">${esc(st)}</span><span class="dim small">${note}${m.R ? ' · R ' + fmtP(m.R) : ''}</span>
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

function coverage() {
  const now = Date.now(), all = [...S.tk.values()], el = all.filter((t) => t.v >= Store.s.minVol), fresh = el.filter((t) => Monitor.age(t.s, now) <= 30000), w = Ws.stats();
  const sc = [...Scanner.scan.values()], rec = sc.filter((a) => now - a.at <= 900000).length, ages = fresh.map((t) => Monitor.age(t.s, now)).sort((a, b) => a - b);
  return { total: all.length, elig: el.length, fresh: fresh.length, un: el.length - fresh.length, medAge: ages.length ? ages[ages.length >> 1] : null, ws: w, valid15: rec, queue: Scanner.st.queue, cand: Scanner.st.candidates || 0, factor: Scanner.factor };
}
function vDash() {
  if (!S.tk.size) return '<h2>dashboard</h2>' + (S.err ? empty('Gagal memuat data: ' + S.err) : loading());
  const all = tkList(), c = Store.s, up = all.filter((t) => t.ch24 > 0).length, dn = all.filter((t) => t.ch24 < 0).length, cv = coverage();
  const sc = [...Scanner.scan.values()], open = Store.alerts.filter((a) => a.live !== false && !a.closed).length;
  const spike = sc.filter((a) => a.m.rvol >= 2).length, brk = sc.filter((a) => a.m.brk === 'confirmed').length;
  const mov = all.filter((t) => t.v >= c.minVol && t.ch24 != null).sort((a, b) => Math.abs(b.ch24) - Math.abs(a.ch24)).slice(0, 5);
  const volA = all.slice().sort((a, b) => b.v - a.v).slice(0, 5), feed = Store.alerts.slice(-5).reverse();
  return `<h2>dashboard</h2><div class="grid2">
  <div class="stat">Pair Spot USDT aktif<b>${all.length}</b></div><div class="stat">Sinyal aktif<b>${open}</b></div>
  <div class="stat">Lonjakan volume<b>${sc.length ? spike : 'N/A'}</b><span class="dim small">RVOL≥2, dari ${sc.length} tervalidasi</span></div><div class="stat">Breakout terkonfirmasi<b>${sc.length ? brk : 'N/A'}</b><span class="dim small">dari ${sc.length} tervalidasi</span></div>
  <div class="stat">Naik / Turun<b><span class="up">${up}</span> / <span class="dn">${dn}</span></b></div><div class="stat">Koneksi<b>${esc($('#st-conn').textContent)}</b><span class="dim small">upd ${S.last ? hhmm(S.last) : 'N/A'}</span></div></div>
  <div class="panel mt-2"><b>Coverage pemantauan</b><div class="small">Tahap A (ticker): <b class="g">${cv.fresh}</b> dari ${cv.elig} pair likuid (vol≥${fmtV(c.minVol)}) menerima data ≤30 dtk · <span class="${cv.un ? 'warn' : ''}">belum dipantau: ${cv.un}</span> · pair ilikuid di luar filter: ${cv.total - cv.elig}<br>
  Umur data median: ${cv.medAge == null ? 'N/A' : Math.round(cv.medAge / 1000) + ' dtk'} · WebSocket: ${cv.ws.open}/${cv.ws.conns} koneksi, ${cv.ws.subscribed} pair${cv.ws.lastMsg ? ', pesan terakhir ' + ago(cv.ws.lastMsg) + ' lalu' : ''} · REST tiap ${c.refreshSec} dtk<br>
  Tahap B (candle): ${cv.valid15} pair divalidasi ≤15 mnt terakhir · ${cv.cand} kandidat aktif · batch ${Math.round(c.batch * cv.factor)}/${c.scanSec}s${cv.factor < 1 ? ' <span class="warn">(throttle)</span>' : ''}<br><span class="dim">Seluruh pair likuid dipantau harganya; validasi candle hanya untuk kandidat, Top Gainer, watchlist, dan sampel.</span></div></div>
  <div class="panel"><b>Perubahan terbesar (24j, vol≥min)</b>${mov.map((t) => `<div class="d-flex justify-content-between"><a href="#/coin/${esc(t.s)}">${esc(t.s)}</a><span class="${cls(t.ch24)}">${fmtPct(t.ch24)}</span></div>`).join('') || '<div class="dim">N/A</div>'}</div>
  <div class="panel"><b>Aktivitas volume (24j)</b>${volA.map((t) => `<div class="d-flex justify-content-between"><a href="#/coin/${esc(t.s)}">${esc(t.s)}</a><span>${fmtV(t.v)} USDT</span></div>`).join('')}</div>
  <div class="panel"><b>Feed sinyal terbaru</b>${feed.map((a) => `<div>${hhmm(a.t0)} <a href="#/coin/${esc(a.s)}">${esc(a.s)}</a> <span class="pill on">${esc(a.status)}</span> skor ${a.score0}</div>`).join('') || '<div class="dim">Belum ada sinyal.</div>'}</div>`;
}
const scanned = () => Scanner.scan.size > 0;

function vEarly() {
  const tabs = [['scan', 'Scanner'], ['alert', 'Alert'], ['eval', 'Evaluasi']].map(([k, l]) => `<button class="btn-t ${S.tab === k ? 'sel' : ''}" data-act="tab" data-k="${k}">${l}</button>`).join(' ');
  let body = '';
  if (S.tab === 'scan') {
    const now = Date.now(), c = Store.s;
    const cands = [...S.tk.values()].filter((t) => Scanner.quality(t, now)).map((t) => ({ t, p: Monitor.priority(t, now) })).filter((x) => x.p.pri >= 2).sort((a, b) => b.p.pri - a.p.pri).slice(0, 8);
    const rows = [...Scanner.scan.entries()].filter(([s, a]) => a.score != null && S.tk.has(s)).map(([s]) => S.tk.get(s)).filter((t) => { const a = Scanner.scan.get(t.s); return (a.m.rvol || 0) >= c.minRvol && a.score >= c.minScore && t.v >= c.minVol && !(t.ch24 > c.maxChange24); }).sort((a, b) => Scanner.scan.get(b.s).score - Scanner.scan.get(a.s).score).slice(0, 40);
    body = `<div class="panel small"><b>Kandidat momentum (Tahap A, belum tentu tervalidasi)</b>${cands.length ? cands.map((x) => `<div class="d-flex justify-content-between"><a href="#/coin/${esc(x.t.s)}">${esc(x.t.s)}</a><span>1m ${fmtPct(pc(x.p.d1))} · 5m ${fmtPct(pc(x.p.d5))} · vol ${x.p.vr != null ? x.p.vr.toFixed(1) + 'x' : 'N/A'} · pri ${x.p.pri.toFixed(1)}</span></div>`).join('') : '<span class="dim">Belum ada kandidat (butuh ±1–5 menit data sesi untuk menghitung perubahan jangka pendek).</span>'}</div>
    <div class="dim small mb-2">Tervalidasi: ${Scanner.scan.size} pair. Filter: skor≥${c.minScore} (bukan provisional), RVOL≥${c.minRvol}, 24j≤${c.maxChange24}%.${Scanner.busy ? ' <span class="g">validasi berjalan…</span>' : ''}${Scanner.lastErr ? ' <span class="warn">' + esc(Scanner.lastErr) + '</span>' : ''}</div>` + (rows.length ? table(rows) : S.tk.size ? empty(Scanner.scan.size ? 'Belum ada pair yang memenuhi filter saat ini.' : 'Scanner sedang mengumpulkan candle…') : loading());
  } else if (S.tab === 'alert') {
    const al = Store.alerts.slice().reverse();
    body = al.length ? al.slice(0, 60).map((a) => { const ch = (a.last / a.p0 - 1) * 100; return `<div class="coin"><div class="d-flex justify-content-between"><b><a href="#/coin/${esc(a.s)}">${esc(a.s)}</a></b><span class="pill ${a.status === 'INVALIDATED' ? 'off' : 'on'}">${esc(a.status)}</span></div>
      <div class="small dim">Terdeteksi ${new Date(a.t0).toLocaleString('id-ID')} · umur data saat sinyal ${Math.round((a.dataAge || 0) / 1000)} dtk</div><div class="grid3"><span>Harga sinyal<br><b>${fmtP(a.p0)}</b></span><span>Terakhir<br><b>${fmtP(a.last)}</b></span><span>Sejak sinyal<br><b class="${cls(ch)}">${fmtPct(ch)}</b></span><span>Skor awal→kini<br><b>${a.score0}→${a.score}</b></span><span>RVOL<br><b>${a.rvol0 != null ? a.rvol0.toFixed(1) + 'x' : 'N/A'}</b></span><span>Resistance acuan<br><b>${a.R ? fmtP(a.R) : '—'}</b></span></div>
      <div class="small">${a.reasons.map(esc).join(' · ')}</div><div class="small warn">${a.warn.map(esc).join(' · ')}</div><div class="small dim">Invalidasi: ${esc(a.inval)}${a.invReason ? '<br><b class="dn">Alasan: ' + esc(a.invReason) + '</b>' : ''}</div></div>`; }).join('') : empty('Belum ada alert. Alert dibuat saat pair pertama kali memenuhi kriteria (cooldown ' + Store.s.cooldownMin + ' menit per pair).');
    body += '<div class="dim small">Alert tersimpan di browser ini (localStorage) dan hanya aktif selama aplikasi terbuka.</div>';
  } else {
    const M = Scanner.metrics(), pctf = (x) => (x == null ? 'N/A' : (x * 100).toFixed(0) + '%'), pf = (x) => (x == null ? 'N/A' : fmtPct(x * 100));
    const done = Store.alerts.filter((a) => a.h[5] != null || (a.na && a.na[5]));
    const cell = (a, h) => (a.h[h] != null ? `<span class="${cls(a.h[h])}">${fmtPct(a.h[h] * 100)}</span>` : a.na && a.na[h] ? '<span class="dim">data tdk tersedia</span>' : 'menunggu');
    const row = (a) => `<tr><td>${esc(a.s)}</td><td>${fmtP(a.p0)}</td>${[5, 15, 60].map((h) => `<td>${cell(a, h)}</td>`).join('')}<td class="dn">${pf(a.mae[60] ?? a.mae[15] ?? a.mae[5])}</td><td>${a.held[15] == null ? '—' : a.held[15] ? 'ya' : 'gagal'}</td><td>${esc(a.status)}</td></tr>`;
    body = `<div class="panel small"><b>Metrik (${M.total} sinyal tercatat)</b>${[5, 15, 60].map((h) => `<div>+${h}m: n=${M.res[h].n} · positif ${pctf(M.res[h].pos)} · median ${pf(M.res[h].med)} · median MAE ${pf(M.res[h].mae)}</div>`).join('')}<div>Breakout gagal bertahan (15m): ${M.brk.fail == null ? 'N/A' : pctf(M.brk.fail)} dari ${M.brk.n}</div><div>Per kategori skor (median +15m): ${M.cat.map((c) => esc(c.k) + ' ' + pf(c.med) + ' (n=' + c.n + ')').join(' · ') || 'N/A'}</div>
    <div class="warn mt-1">${M.res[15].n < 30 ? 'Sampel < 30: belum cukup untuk menyimpulkan akurasi.' : 'Sampel besar pun tidak menjamin hasil ke depan.'}</div><span class="dim">Evaluasi memakai candle 1m setelah horizon selesai (bukan tick). Return belum dikurangi biaya, spread, dan slippage. Kenaikan setelah sinyal ≠ profit.</span></div>` + (done.length ? `<div class="wrap"><table class="desk" style="display:table"><thead><tr><th>Pair</th><th>Harga sinyal</th><th>+5m</th><th>+15m</th><th>+60m</th><th>MAE</th><th>Breakout bertahan</th><th>Status</th></tr></thead><tbody>${done.reverse().map(row).join('')}</tbody></table></div>` : empty('Belum ada sinyal dengan horizon selesai.'));
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
  return `<h2>settings</h2><div class="panel">${field('refreshSec', 'Polling REST ticker/fallback (detik, min 5)')}${field('scanSec', 'Interval validasi kandidat (detik, min 10)')}${field('batch', 'Pair divalidasi per batch (5–60)')}${field('minVol', 'Minimum volume 24j (USDT)')}${field('minRvol', 'Minimum relative volume', 'number', '0.1')}${field('minScore', 'Minimum Opportunity Score')}${field('maxChange24', 'Filter kenaikan ekstrem 24j (%)')}${field('cooldownMin', 'Cooldown alert per pair (menit)')}
  ${sel('strict', 'Konfirmasi breakout ketat (2 close di atas resistance + retest)', yn)}${sel('pairMode', 'Pair dipantau', [['all', 'Semua Spot USDT aktif'], ['watch', 'Hanya watchlist']])}${sel('notif', 'Notifikasi browser (hanya saat tab terbuka)', yn)}${sel('matrix', 'Animasi Matrix', yn)}${sel('reduced', 'Reduced motion', yn)}${sel('theme', 'Tema', [['matrix', 'Matrix hijau'], ['amber', 'Amber']])}
  <button class="btn-t mt-3" data-act="reset">Reset pengaturan</button></div><div class="dim small">Frekuensi UI, polling REST, dan WebSocket dipisah. WebSocket hanya untuk ≤40 pair (watchlist + top gainer).</div>`;
}

async function vCoin(sym) {
  const el = $('#view'); el.innerHTML = `<h2>${esc(sym)}</h2>` + loading();
  const t = S.tk.get(sym);
  try {
    const [cs, c1, c5, c15] = await Promise.all([Api.candles(sym, S.g, 200), Api.candles(sym, '1min', 120), Api.candles(sym, '5min', 200), Api.candles(sym, '15min', 100)]);
    let book = null; try { book = await Api.book(sym); } catch (e) { /* opsional */ }
    if (location.hash !== '#/coin/' + sym) return;
    const tt = Object.assign({ p: cs[cs.length - 1].c, v: 0, ch24: null, b: sym.replace('USDT', '') }, t || {}, { age: Monitor.age(sym) });
    const an = Scoring.analyze({ c1, c5, c15, book }, tt, Store.s, Date.now()); if (an.score != null) Scanner.scan.set(sym, Object.assign(an, { at: Date.now() }));
    const hi = Math.max(...cs.slice(-48).map((x) => x.h)), lo = Math.min(...cs.slice(-48).map((x) => x.l));
    const names = { rvol: 'Relative volume', mom: 'Momentum 1m/5m/15m', trend: 'Tren EMA/MACD', brk: 'Breakout & konfirmasi', liq: 'Likuiditas & spread', qual: 'Kualitas candle & volume' };
    const parts = an.parts ? Object.entries(an.parts).map(([k, p]) => [names[k], p.on ? p.pts : null, p.max]) : [];
    const al = Store.alerts.filter((a) => a.s === sym).reverse(), m = an.m;
    el.innerHTML = `<h2>${esc(sym)}</h2><div class="panel d-flex justify-content-between"><div><div class="px" id="c-px">${fmtP(tt.p)}</div><div id="c-ch" class="${cls(tt.ch24)}">24j ${fmtPct(tt.ch24)}</div></div><div class="text-end"><button class="btn-t ${Watch.has(sym) ? 'sel' : ''}" data-act="watch" data-s="${esc(sym)}">${Watch.has(sym) ? '★' : '☆'}</button> <a class="btn-t" href="#/early" style="text-decoration:none">←</a></div></div>
    <div class="mb-2">${['1min', '5min', '15min', '1h', '4h'].map((g) => `<button class="btn-t ${S.g === g ? 'sel' : ''}" data-act="gran" data-g="${g}">${g.replace('min', 'm')}</button>`).join(' ')}</div>
    <div id="ch-p" class="chart"></div><div class="dim small">RSI(14)</div><div id="ch-r" class="chart"></div><div class="dim small">MACD histogram (12,26,9)</div><div id="ch-m" class="chart"></div>
    <div class="panel"><div class="grid3"><span>1m ${fmtPct(pc(m.ch1))}</span><span>5m ${fmtPct(pc(m.ch5))}</span><span>15m ${fmtPct(pc(m.ch15))}</span><span>1j ${fmtPct(pc(m.ch60))}</span><span>24j ${fmtPct(tt.ch24)}</span><span>RVOL5 ${m.rvol != null ? m.rvol.toFixed(1) + 'x' : 'N/A'}</span><span>RVOL1 ${m.rvol1 != null ? m.rvol1.toFixed(1) + 'x' : 'N/A'}</span><span>RSI ${m.rsi != null ? m.rsi.toFixed(0) : 'N/A'}</span><span>Spread ${m.spread != null ? (m.spread * 100).toFixed(3) + '%' : 'N/A'}</span><span>Slippage 1000$ ${m.slip != null ? (m.slip * 100).toFixed(2) + '%' : 'N/A'}</span><span>Vol24 ${fmtV(tt.v)}</span><span>Umur data ${isFinite(tt.age) ? Math.round(tt.age / 1000) + 's' : 'N/A'}</span></div>
    <div class="small dim">Resistance acuan breakout (high 48 candle 5m, tanpa 2 candle terakhir): ${m.R ? fmtP(m.R) : 'N/A'} · status breakout: ${esc(m.brk || 'N/A')}. Zona interval chart: R ${fmtP(hi)} · S ${fmtP(lo)} (heuristik, bukan level pasti).</div></div>
    <div class="panel"><b>Opportunity Score: <span class="g">${an.score == null ? 'N/A' : an.score + ' · ' + Scoring.category(an.score)}${an.provisional ? ' (PROVISIONAL)' : ''}</span></b><div class="dim small">Kekuatan sinyal teknikal, bukan probabilitas profit.${an.base != null ? ' Skor dasar ' + an.base + ' − penalti ' + an.penTotal + '.' : ''}</div>
    ${parts.map(([l, v, mx]) => `<div class="small d-flex justify-content-between"><span>${l}</span><span>${v == null ? 'N/A (data tidak tersedia)' : v.toFixed(1) + ' / ' + mx}</span></div><div class="bar"><i style="width:${v == null ? 0 : v / mx * 100}%"></i></div>`).join('')}
    ${an.pen.map((p) => `<div class="small d-flex justify-content-between dn"><span>Penalti: ${esc(p.why)}</span><span>−${p.v}</span></div>`).join('')}
    <div class="small up mt-2">${an.reasons.map(esc).join('<br>')}</div><div class="small warn">${an.warn.map(esc).join('<br>')}</div></div>
    <div class="panel"><b>Histori alert</b>${al.map((a) => `<div class="small">${new Date(a.t0).toLocaleString('id-ID')} · ${esc(a.status)} · skor ${a.score0} · ${fmtP(a.p0)}</div>`).join('') || '<div class="dim small">Belum ada alert untuk pair ini.</div>'}</div>`;
    try { Charts.draw({ price: $('#ch-p'), rsi: $('#ch-r'), macd: $('#ch-m') }, cs); } catch (e) { $('#ch-p').innerHTML = '<div class="empty">Chart tidak dapat dimuat (' + esc(e.message) + '). Skor dan indikator tetap tersedia.</div>'; }
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
    const d = await Api.tickers(), m = new Map(), now = Date.now();
    for (const x of d.items) { if (!(x.p > 0)) continue; x.ch24 = x.o > 0 ? (x.p / x.o - 1) * 100 : null; m.set(x.s, x); Monitor.push(x.s, x.p, x.v, now); }
    S.tk = m; S.last = now; S.err = null; S.api = d.stale ? 'STALE' : 'OK';
    Scanner.track(m); wsTargets();
  } catch (e) { S.err = e.message; S.api = 'ERROR'; }
  topbar(); if (!location.hash.startsWith('#/coin/')) rq(); else updCoin();
}
function updCoin() { const t = S.tk.get(S.detail); if (t && $('#c-px')) { $('#c-px').textContent = fmtP(t.p); const c = $('#c-ch'); c.textContent = '24j ' + fmtPct(t.ch24); c.className = cls(t.ch24); } }
function wsTargets() { // semua pair likuid (≥25% dari volume minimum) + watchlist + pair yang dibuka
  const lim = Store.s.minVol / 4, L = [...S.tk.values()].filter((t) => t.v >= lim).sort((a, b) => b.v - a.v).map((t) => t.s);
  Ws.setWanted([...new Set([...(S.detail ? [S.detail] : []), ...Store.watch, ...L])].filter((s) => S.tk.has(s)));
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
Ws.onTick = (s, d) => { const t = S.tk.get(s); if (!t) return; Monitor.push(s, d.p, d.q, d.ts); S.last = d.ts; t.p = d.p; if (d.q > 0) t.v = d.q; if (d.bid > 0) t.bid = d.bid; if (d.ask > 0) t.ask = d.ask; if (t.o > 0) t.ch24 = (t.p / t.o - 1) * 100; if (s === S.detail) updCoin(); };
Rain.start(); applyUi(); route(); poll().then(() => wsTargets()); loopPoll(); loopScan(); setTimeout(() => S.tk.size && Scanner.run(S.tk, rq), 1500);
