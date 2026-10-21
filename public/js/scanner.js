/* TAHAP B: validasi kandidat (candle 1m/5m/15m + order book) dan mesin status alert. */
const Scanner = {
  scan: new Map(), cursor: 0, busy: false, pauseUntil: 0, lastErr: null, factor: 1, inflight: new Set(), st: { req: 0, err: 0, cycles: 0, lastBatch: 0, queue: 0 },
  quality(t, now) { const sp = t.bid > 0 && t.ask > 0 ? (t.ask - t.bid) / t.bid : 0; return t.v >= Store.s.minVol && sp <= 0.01 && Monitor.age(t.s, now) <= 60000; },
  open(s) { return Store.alerts.find((a) => a.s === s && a.live !== false && !a.closed); },
  // Alokasi batch: 30% Top Gainer+watchlist (yang paling lama tidak dianalisis), 50% kandidat prioritas (momentum/volume baru),
  // sisanya sampling bergilir agar tidak bias. Pair yang sedang diproses / baru dianalisis dilewati (dedup & cache).
  pick(tk, now) {
    const c = Store.s, B = Math.max(4, Math.round(c.batch * this.factor));
    const el = [...tk.values()].filter((t) => this.quality(t, now) && (c.pairMode !== 'watch' || Watch.has(t.s)));
    const age = (s) => { const a = this.scan.get(s); return a ? now - a.at : Infinity; };
    const ok = (t) => !this.inflight.has(t.s) && age(t.s) >= (this.open(t.s) ? 15000 : 45000);
    const out = new Map(), add = (t, why) => { if (out.size < B && !out.has(t.s) && ok(t)) out.set(t.s, why); };
    const top = [...tk.values()].filter((t) => t.v >= c.minVol && t.ch24 != null).sort((a, b) => b.ch24 - a.ch24).slice(0, 10).map((t) => t.s);
    const byAge = (L) => L.map((s) => tk.get(s)).filter(Boolean).sort((a, b) => age(b.s) - age(a.s)), A = byAge(top), Bw = byAge(Store.watch), pool = [];
    for (let i = 0; i < Math.max(A.length, Bw.length); i++) { if (Bw[i]) pool.push(Bw[i]); if (A[i]) pool.push(A[i]); } // bergantian agar watchlist tidak tersisih
    const nTop = Math.ceil(B * 0.3), nCand = Math.round(B * 0.5);
    for (const t of pool) { if (out.size >= nTop) break; add(t, 'top/watch'); }
    const cand = el.map((t) => ({ t, p: Monitor.priority(t, now) })).filter((x) => x.p.pri >= 2 || this.open(x.t.s)).sort((a, b) => (this.open(b.t.s) ? 3 : 0) + b.p.pri - (this.open(a.t.s) ? 3 : 0) - a.p.pri);
    this.st.candidates = cand.length;
    for (const x of cand) { if (out.size >= nTop + nCand) break; add(x.t, 'kandidat'); }
    const samp = el.slice().sort((a, b) => b.v - a.v);
    for (let i = 0; i < samp.length && out.size < B; i++) add(samp[(this.cursor + i) % samp.length], 'sampling');
    this.cursor = samp.length ? (this.cursor + Math.ceil(B / 5)) % samp.length : 0;
    return [...out.keys()];
  },
  async validate(s, tk) {
    this.inflight.add(s);
    try {
      const [c5, c1] = await Promise.all([Api.candles(s, '5min', 200), Api.candles(s, '1min', 120)]);
      const tt = () => Object.assign({}, tk.get(s), { age: Monitor.age(s) }), D = { c1, c5, c15: null, book: null };
      let an = Scoring.analyze(D, tt(), Store.s, Date.now());
      if (an.score != null && an.score >= 45) { D.c15 = await Api.candles(s, '15min', 100); an = Scoring.analyze(D, tt(), Store.s, Date.now()); }
      if (an.score != null && an.score >= 60) { try { D.book = await Api.book(s); an = Scoring.analyze(D, tt(), Store.s, Date.now()); } catch (e) { /* order book opsional */ } }
      an.at = Date.now(); an.seen = Monitor.age(s);
      this.scan.set(s, an); this.signal(s, an, tt());
    } finally { this.inflight.delete(s); }
  },
  async run(tk, onProgress) {
    if (this.busy || Date.now() < this.pauseUntil) return;
    this.busy = true; let errs = 0;
    const list = this.pick(tk, Date.now()); this.st.lastBatch = list.length; let i = 0;
    const worker = async () => {
      while (i < list.length && Date.now() >= this.pauseUntil) {
        const s = list[i++]; this.st.queue = list.length - i; this.st.req++;
        try { await this.validate(s, tk); this.lastErr = null; } catch (e) { errs++; this.st.err++; this.lastErr = e.message; if (/429|cooldown/i.test(e.message)) this.pauseUntil = Date.now() + 30000; }
        onProgress && onProgress();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    this.factor = errs ? Math.max(0.25, this.factor / 2) : Math.min(1, this.factor + 0.25); // backpressure
    this.st.cycles++; this.st.queue = 0;
    try { await this.evaluate(); } catch (e) { /* evaluasi dicoba lagi pada siklus berikut */ }
    this.busy = false; Store.saveA(); onProgress && onProgress();
  },
  // Aturan status (dievaluasi ulang tiap analisis; hanya INVALIDATED yang final):
  // INVALIDATED: harga ≤ -1.5% dari harga sinyal | skor <45 dua analisis berturut | close 5m di bawah resistance acuan setelah breakout terlihat
  // BREAKOUT CONFIRMED: syarat konfirmasi (candle 5m tertutup > resistance + volume; mode ketat: 2 close + retest) terpenuhi SAAT INI
  // WEAKENING: skor ≤ puncak-10, atau breakout sebelumnya tidak lagi memenuhi syarat | BREAKOUT DETECTED: penembusan awal belum terkonfirmasi
  // MOMENTUM STRENGTHENING: skor ≥ skor awal+5, harga > harga sinyal, momentum 5m positif | selain itu NEW SIGNAL
  signal(s, an, t) {
    if (an.score == null) return;
    const now = Date.now(), c = Store.s, m = an.m; let a = this.open(s);
    if (!a) {
      const last = [...Store.alerts].reverse().find((x) => x.s === s);
      const ok = !an.provisional && an.score >= c.minScore && (m.rvol || 0) >= c.minRvol && !(t.ch24 > c.maxChange24) && t.v >= c.minVol && (t.age || 0) <= 60000;
      if (ok && (!last || now - last.t0 > c.cooldownMin * 60000)) {
        Store.alerts.push({ v: 2, id: s + '-' + now, s, b: t.b, t0: now, p0: t.p, last: t.p, hi: t.p, lo: t.p, score0: an.score, score: an.score, peak: an.score, rvol0: m.rvol, R: m.brk !== 'none' ? m.R : null, brkSeen: m.brk !== 'none', reasons: an.reasons.slice(0, 5), warn: an.warn.slice(0, 4), status: m.brk === 'confirmed' ? 'BREAKOUT CONFIRMED' : m.brk === 'detected' ? 'BREAKOUT DETECTED' : 'NEW SIGNAL', h: {}, mfe: {}, mae: {}, held: {}, below: 0, dataAge: t.age || 0, live: true, closed: false, inval: 'Harga ≤ ' + (t.p * 0.985).toPrecision(5) + ' (−1.5%), skor <45 dua kali, atau close 5m di bawah resistance acuan' });
        if (c.notif && typeof Notification !== 'undefined' && Notification.permission === 'granted') { try { new Notification('Early Gainer: ' + s, { body: 'Skor ' + an.score + ' | RVOL ' + (m.rvol || 0).toFixed(1) + 'x' }); } catch (e) { /* noop */ } }
      }
      return;
    }
    a.score = an.score; a.peak = Math.max(a.peak, an.score); a.dataAge = t.age || 0;
    if (m.brk !== 'none') { a.brkSeen = true; if (a.R == null) a.R = m.R; } // resistance acuan disimpan saat pertama terdeteksi
    a.below = an.score < 45 ? (a.below || 0) + 1 : 0;
    let inv = null;
    if (t.p <= a.p0 * 0.985) inv = 'Harga ≤ −1.5% dari harga sinyal';
    else if (a.below >= 2) inv = 'Skor <45 dua analisis berturut-turut';
    else if (a.brkSeen && a.R && m.lastClose5 < a.R) inv = 'Candle 5m ditutup di bawah resistance acuan ' + a.R.toPrecision(5);
    const prev = a.status;
    if (inv) { a.status = 'INVALIDATED'; a.invReason = inv; a.live = false; a.invAt = now; return; }
    if (m.brk === 'confirmed') a.status = 'BREAKOUT CONFIRMED';
    else if (prev === 'BREAKOUT CONFIRMED' || prev === 'BREAKOUT DETECTED') a.status = m.brk === 'detected' ? 'BREAKOUT DETECTED' : 'WEAKENING'; // syarat breakout gagal -> tidak dipertahankan
    else if (an.score <= a.peak - 10) a.status = 'WEAKENING';
    else if (m.brk === 'detected') a.status = 'BREAKOUT DETECTED';
    else if (an.score >= a.score0 + 5 && t.p > a.p0 && m.ch5 > 0) a.status = 'MOMENTUM STRENGTHENING';
    else a.status = 'NEW SIGNAL';
    if (now - a.t0 > 65 * 60000) a.live = false;
  },
  // Harga terakhir untuk tampilan (dari polling/WS; BUKAN dasar evaluasi).
  track(tk) { for (const a of Store.alerts) { const t = tk.get(a.s); if (!t || a.closed) continue; a.last = t.p; a.hi = Math.max(a.hi, t.p); a.lo = Math.min(a.lo, t.p); } Store.saveA(); },
  // Evaluasi berbasis candle 1m SETELAH horizon berakhir (tidak ada look-ahead): return = close candle terakhir ≤ t0+h; MFE/MAE dari high/low candle di jendela.
  async evaluate() {
    const now = Date.now(); let n = 0;
    for (const a of Store.alerts) {
      if (a.evalDone || n >= 3) continue;
      const due = [5, 15, 60].filter((h) => a.h[h] === undefined && !(a.na && a.na[h]) && now >= a.t0 + h * 60000 + 70000);
      if (!due.length) { if ([5, 15, 60].every((h) => a.h[h] !== undefined || (a.na && a.na[h]))) a.evalDone = true; continue; }
      n++; const cs = await Api.candles(a.s, '1min', 120); a.na = a.na || {};
      const tS = Math.ceil(a.t0 / 60000) * 60000;
      for (const h of due) {
        const end = a.t0 + h * 60000, w = cs.filter((x) => x.t >= tS && x.t + 60000 <= end);
        if (!w.length || w[0].t > tS + 60000 || end - w[w.length - 1].t - 60000 > 60000) { a.na[h] = true; continue; }
        a.h[h] = w[w.length - 1].c / a.p0 - 1; a.mfe[h] = Math.max(...w.map((x) => x.h)) / a.p0 - 1; a.mae[h] = Math.min(...w.map((x) => x.l)) / a.p0 - 1;
        a.held[h] = a.R ? w[w.length - 1].c >= a.R : null;
      }
    }
  },
  metrics() {
    const med = (v) => { const s = v.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
    const res = {}; for (const h of [5, 15, 60]) { const L = Store.alerts.filter((a) => a.h[h] != null), r = L.map((a) => a.h[h]); res[h] = { n: L.length, pos: r.length ? r.filter((x) => x > 0).length / r.length : null, med: med(r), mae: med(L.map((a) => a.mae[h])), mfe: med(L.map((a) => a.mfe[h])) }; }
    const B = Store.alerts.filter((a) => a.R && a.brkSeen && a.held[15] != null);
    const cat = {}; for (const a of Store.alerts.filter((x) => x.h[15] != null)) { const k = Scoring.category(a.score0); (cat[k] = cat[k] || []).push(a.h[15]); }
    return { res, brk: { n: B.length, fail: B.length ? B.filter((a) => a.held[15] === false).length / B.length : null }, cat: Object.entries(cat).map(([k, v]) => ({ k, n: v.length, med: med(v) })), total: Store.alerts.length };
  }
};
