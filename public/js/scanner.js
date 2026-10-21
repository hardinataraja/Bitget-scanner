/* Scanner: pemilihan batch pair, scoring, dan mesin status alert. */
const Scanner = {
  cursor: 0, busy: false, pauseUntil: 0, scan: new Map(), lastErr: null,
  pick(tk) {
    const c = Store.s;
    let el = [...tk.values()].filter((t) => t.v >= c.minVol && (c.pairMode !== 'watch' || Watch.has(t.s))).sort((a, b) => b.v - a.v);
    const top = [...tk.values()].filter((t) => t.v >= c.minVol && t.ch24 != null).sort((a, b) => b.ch24 - a.ch24).slice(0, 10).map((t) => t.s);
    const set = new Set([...Store.watch.filter((s) => tk.has(s)), ...top]);
    if (el.length) { for (let i = 0; i < c.batch && i < el.length; i++) set.add(el[(this.cursor + i) % el.length].s); this.cursor = (this.cursor + c.batch) % el.length; }
    return [...set];
  },
  async run(tk, onProgress) {
    if (this.busy || Date.now() < this.pauseUntil) return;
    this.busy = true;
    const list = this.pick(tk); let i = 0;
    const worker = async () => {
      while (i < list.length && Date.now() >= this.pauseUntil) {
        const s = list[i++], t = tk.get(s); if (!t) continue;
        try {
          const cs = await Api.candles(s, '5min', 150);
          const an = Scoring.analyze(cs, t, Store.s, Date.now()); an.at = Date.now();
          this.scan.set(s, an); this.signal(s, an, t); this.lastErr = null;
        } catch (e) { this.lastErr = e.message; if (/429|cooldown/i.test(e.message)) this.pauseUntil = Date.now() + 30000; }
        onProgress && onProgress();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    this.busy = false; Store.saveA(); onProgress && onProgress();
  },
  open(s) { return Store.alerts.find((a) => a.s === s && !a.closed); },
  // Aturan status: INVALIDATED (harga <= -1.5% dari deteksi atau skor <50) > WEAKENING (skor turun >=10 dari puncak)
  // > BREAKOUT CONFIRMED (breakout candle tertutup & harga >= harga deteksi) > MOMENTUM STRENGTHENING (skor >= skor awal+5 & harga naik) > NEW SIGNAL
  signal(s, an, t) {
    if (an.score == null) return;
    const now = Date.now(), c = Store.s; let a = this.open(s);
    if (!a) {
      const last = [...Store.alerts].reverse().find((x) => x.s === s);
      const ok = an.score >= c.minScore && (an.m.rvol || 0) >= c.minRvol && !(t.ch24 > c.maxChange24) && t.v >= c.minVol;
      if (ok && (!last || now - last.t0 > c.cooldownMin * 60000)) {
        const al = { id: s + '-' + now, s, b: t.b, t0: now, p0: t.p, last: t.p, hi: t.p, lo: t.p, score0: an.score, score: an.score, peak: an.score, rvol0: an.m.rvol, reasons: an.reasons.slice(0, 5), warn: an.warn.slice(0, 3), status: 'NEW SIGNAL', h: {}, closed: false, inval: 'Harga <= ' + (t.p * 0.985).toPrecision(5) + ' (-1.5%) atau skor < 50' };
        Store.alerts.push(al);
        if (c.notif && typeof Notification !== 'undefined' && Notification.permission === 'granted') { try { new Notification('Early Gainer: ' + s, { body: 'Skor ' + an.score + ' | RVOL ' + (an.m.rvol || 0).toFixed(1) + 'x' }); } catch (e) { /* noop */ } }
      }
      return;
    }
    a.score = an.score; a.peak = Math.max(a.peak, an.score);
    if (a.status === 'INVALIDATED') return;
    if (t.p <= a.p0 * 0.985 || an.score < 50) a.status = 'INVALIDATED';
    else if (an.score <= a.peak - 10) a.status = 'WEAKENING';
    else if (an.m.breakout && t.p >= a.p0) a.status = 'BREAKOUT CONFIRMED';
    else if (an.score >= a.score0 + 5 && t.p > a.p0) a.status = 'MOMENTUM STRENGTHENING';
  },
  // Dipanggil tiap polling ticker: update harga terakhir, MFE/MAE, hasil horizon (harga awal tidak pernah diubah).
  track(tk) {
    const now = Date.now();
    for (const a of Store.alerts) {
      if (a.closed) continue; const t = tk.get(a.s); if (!t) continue;
      a.last = t.p; a.hi = Math.max(a.hi, t.p); a.lo = Math.min(a.lo, t.p);
      for (const h of [5, 15, 60]) if (a.h[h] == null && now - a.t0 >= h * 60000) a.h[h] = t.p / a.p0 - 1;
      if (now - a.t0 > 65 * 60000 && a.h[60] != null) a.closed = true;
    }
    Store.saveA();
  }
};
