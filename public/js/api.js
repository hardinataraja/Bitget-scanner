const Api = {
  async j(url, ms = 8000) {
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { signal: ac.signal });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.ok === false) throw new Error((d && d.error) || 'HTTP ' + r.status);
      return d;
    } finally { clearTimeout(to); }
  },
  tickers() { return this.j('/api/tickers'); },
  book(s) { return this.j('/api/book?symbol=' + encodeURIComponent(s)); },
  health() { return this.j('/api/health', 5000); },
  async candles(s, g, l = 150) {
    const d = await this.j('/api/candles?symbol=' + encodeURIComponent(s) + '&granularity=' + g + '&limit=' + l);
    return d.candles.map((a) => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5], q: a[6] }));
  }
};

// Kumpulan koneksi WebSocket publik Bitget v2 (channel ticker SPOT). Per koneksi maks 400 simbol, subscribe dikirim bertahap
// (50 arg/pesan, jeda 200ms). Maks 3 koneksi. Heartbeat 'ping' tiap 25s + watchdog 45s tanpa pesan.
const Ws = {
  URL: 'wss://ws.bitget.com/v2/ws/public', conns: [], onTick: null, onState: null, state: 'OFFLINE', per: 400, lastMsg: 0,
  mk(i) { return { i, sock: null, subbed: new Set(), want: new Set(), q: [], tries: 0, hb: null, rt: null, tm: null, open: false, last: 0 }; },
  agg() { const o = this.conns.filter((c) => c.open).length, st = o ? 'CONNECTED' : this.conns.length ? 'RECONNECTING' : 'OFFLINE'; if (st !== this.state) { this.state = st; this.onState && this.onState(st); } },
  stats() { return { conns: this.conns.length, open: this.conns.filter((c) => c.open).length, subscribed: this.conns.reduce((s, c) => s + (c.open ? c.subbed.size : 0), 0), lastMsg: this.lastMsg }; },
  setWanted(list) {
    const L = [...new Set(list)].slice(0, this.per * 3), n = Math.ceil(L.length / this.per);
    while (this.conns.length < n) { const c = this.mk(this.conns.length); this.conns.push(c); this.connect(c); }
    this.conns.forEach((c, i) => { c.want = new Set(L.slice(i * this.per, (i + 1) * this.per)); this.sync(c); });
  },
  connect(c) {
    if (c.sock && c.sock.readyState <= 1) return; clearTimeout(c.rt);
    let ws; try { ws = new WebSocket(this.URL); } catch (e) { return this.retry(c); }
    c.sock = ws;
    ws.onopen = () => { c.tries = 0; c.open = true; c.subbed.clear(); c.q = []; c.last = Date.now(); this.agg(); this.sync(c); clearInterval(c.hb); c.hb = setInterval(() => { try { if (Date.now() - c.last > 45000) return ws.close(); ws.send('ping'); } catch (e) { /* ditutup */ } }, 25000); };
    ws.onmessage = (e) => {
      c.last = this.lastMsg = Date.now(); if (e.data === 'pong') return;
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.arg && m.arg.channel === 'ticker' && Array.isArray(m.data)) for (const x of m.data) { const p = parseFloat(x.lastPr); if (p > 0) this.onTick && this.onTick(x.instId, { p, bid: parseFloat(x.bidPr), ask: parseFloat(x.askPr), q: parseFloat(x.quoteVolume), ts: c.last }); }
    };
    ws.onclose = () => { clearInterval(c.hb); c.open = false; c.subbed.clear(); c.q = []; this.agg(); this.retry(c); };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* noop */ } };
  },
  retry(c) { clearTimeout(c.rt); c.rt = setTimeout(() => this.connect(c), Math.min(60000, 1000 * 2 ** c.tries++) + Math.random() * 500); },
  sync(c) {
    if (!c.open) return; const arg = (s) => ({ instType: 'SPOT', channel: 'ticker', instId: s });
    const add = [...c.want].filter((s) => !c.subbed.has(s)), del = [...c.subbed].filter((s) => !c.want.has(s));
    for (let i = 0; i < del.length; i += 50) { const ch = del.slice(i, i + 50); c.q.push(() => c.sock.send(JSON.stringify({ op: 'unsubscribe', args: ch.map(arg) }))); ch.forEach((s) => c.subbed.delete(s)); }
    for (let i = 0; i < add.length; i += 50) { const ch = add.slice(i, i + 50); c.q.push(() => c.sock.send(JSON.stringify({ op: 'subscribe', args: ch.map(arg) }))); ch.forEach((s) => c.subbed.add(s)); }
    if (!c.tm) c.tm = setInterval(() => { const f = c.q.shift(); if (!f) { clearInterval(c.tm); c.tm = null; return; } try { f(); } catch (e) { /* ditutup */ } }, 200);
  },
  wake() { this.conns.forEach((c) => { if (!c.sock || c.sock.readyState > 1) { c.tries = 0; this.connect(c); } }); }
};
