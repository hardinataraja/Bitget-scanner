/* TAHAP A: pemantauan ticker luas. Menyimpan sampel (harga, volume 24j kumulatif) per pair dari WebSocket + REST. */
const Monitor = {
  h: new Map(), seen: new Map(),
  push(s, p, q, t = Date.now()) {
    if (!(p > 0)) return; this.seen.set(s, t);
    let a = this.h.get(s); if (!a) { a = []; this.h.set(s, a); }
    const l = a[a.length - 1];
    if (l && t - l.t < 4000) { l.p = p; if (q > 0) l.q = q; return; }
    a.push({ t, p, q: q > 0 ? q : null }); if (a.length > 260) a.shift();
  },
  age(s, now = Date.now()) { const t = this.seen.get(s); return t ? now - t : Infinity; },
  at(s, ms, now) { const a = this.h.get(s); if (!a) return null; const tg = now - ms; for (let i = a.length - 1; i >= 0; i--) if (a[i].t <= tg) return tg - a[i].t <= Math.max(8000, ms * 0.5) ? a[i] : null; return null; },
  // Statistik jangka pendek. Volume rate = Δ(volume 24j kumulatif) per menit vs rata-rata (v24/1440). Catatan: volume 24j bergulir,
  // jadi Δ bisa meremehkan; baseline tidak dinormalisasi jam-hari (lihat README).
  stats(s, v24, now = Date.now()) {
    const a = this.h.get(s); if (!a || !a.length) return null; const cur = a[a.length - 1];
    if (now - cur.t > 60000) return null;
    const o1 = this.at(s, 60000, now), o5 = this.at(s, 300000, now);
    const d1 = o1 ? cur.p / o1.p - 1 : null, d5 = o5 ? cur.p / o5.p - 1 : null;
    const accel = d1 != null && o1 && o5 ? d1 - (o1.p / o5.p - 1) / 4 : null;
    let vr = null; if (o1 && cur.q != null && o1.q != null && v24 > 0) { const dq = cur.q - o1.q, dt = (cur.t - o1.t) / 60000; vr = dq >= 0 && dt > 0 ? dq / dt / (v24 / 1440) : null; }
    // z1: pergerakan 1m relatif terhadap "kebiasaan" pair (median |return| antar sampel, diskalakan ke 1 menit)
    let z1 = null; if (d1 != null && a.length >= 12) { const rs = [], ds = []; for (let i = a.length - 1; i > 0 && rs.length < 60; i--) { rs.push(Math.abs(a[i].p / a[i - 1].p - 1)); ds.push(a[i].t - a[i - 1].t); } rs.sort((x, y) => x - y); ds.sort((x, y) => x - y); const step = Math.max(ds[ds.length >> 1], 1000), typ = rs[rs.length >> 1] * Math.sqrt(60000 / step); z1 = d1 / Math.max(typ, 0.0005); }
    return { d1, d5, accel, vr, z1, n: a.length };
  },
  // Prioritas kandidat (0..10). Satu ticker tunggal tidak cukup: butuh pergerakan ATAU lonjakan volume yang nyata.
  priority(t, now = Date.now()) {
    const st = this.stats(t.s, t.v, now); if (!st) return { pri: 0 };
    const c = Scoring.clamp; let pri = 3 * c((st.d5 || 0) / 0.01) + 2 * c((st.d1 || 0) / 0.005) + 2 * c((st.accel || 0) / 0.003) + 3 * c(((st.vr || 1) - 1) / 5);
    if (st.z1 != null) pri += c((st.z1 - 2) / 4);
    if (!((st.d5 || 0) > 0.002 || (st.vr || 0) > 2)) pri = Math.min(pri, 1);
    if (t.ch24 > Store.s.maxChange24) pri *= 0.3;
    return Object.assign({ pri }, st);
  }
};
