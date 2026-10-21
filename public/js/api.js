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
  health() { return this.j('/api/health', 5000); },
  async candles(s, g, l = 150) {
    const d = await this.j('/api/candles?symbol=' + encodeURIComponent(s) + '&granularity=' + g + '&limit=' + l);
    return d.candles.map((a) => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5], q: a[6] }));
  }
};

// WebSocket publik Bitget v2 (channel ticker SPOT). Batas: maks 40 simbol agar jumlah subscription kecil.
const Ws = {
  URL: 'wss://ws.bitget.com/v2/ws/public', sock: null, want: new Set(), subbed: new Set(), tries: 0, hb: null, rt: null, state: 'OFFLINE', onTick: null, onState: null, stop: false,
  set(st) { this.state = st; this.onState && this.onState(st); },
  connect() {
    if (this.sock && this.sock.readyState <= 1) return;
    clearTimeout(this.rt);
    let ws; try { ws = new WebSocket(this.URL); } catch (e) { return this.retry(); }
    this.sock = ws; this.set('RECONNECTING');
    ws.onopen = () => { this.tries = 0; this.subbed.clear(); this.set('CONNECTED'); this.sync(); clearInterval(this.hb); this.hb = setInterval(() => { try { ws.send('ping'); } catch (e) { /* ditutup */ } }, 25000); };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.arg && m.arg.channel === 'ticker' && Array.isArray(m.data)) for (const x of m.data) {
        const p = parseFloat(x.lastPr); if (!(p > 0)) continue;
        this.onTick && this.onTick(x.instId, { p, bid: parseFloat(x.bidPr), ask: parseFloat(x.askPr), ts: Date.now() });
      }
    };
    ws.onclose = () => { clearInterval(this.hb); this.subbed.clear(); if (!this.stop) { this.set('RECONNECTING'); this.retry(); } };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* noop */ } };
  },
  retry() { clearTimeout(this.rt); const d = Math.min(30000, 1000 * 2 ** this.tries++); this.rt = setTimeout(() => this.connect(), d); },
  setWanted(list) { this.want = new Set(list.slice(0, 40)); this.sync(); },
  sync() {
    if (!this.sock || this.sock.readyState !== 1) return;
    const add = [...this.want].filter((s) => !this.subbed.has(s)), del = [...this.subbed].filter((s) => !this.want.has(s));
    const arg = (s) => ({ instType: 'SPOT', channel: 'ticker', instId: s });
    if (add.length) { this.sock.send(JSON.stringify({ op: 'subscribe', args: add.map(arg) })); add.forEach((s) => this.subbed.add(s)); }
    if (del.length) { this.sock.send(JSON.stringify({ op: 'unsubscribe', args: del.map(arg) })); del.forEach((s) => this.subbed.delete(s)); }
  },
  wake() { if (!this.sock || this.sock.readyState > 1) { this.tries = 0; this.connect(); } }
};
