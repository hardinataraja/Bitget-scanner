const Charts = {
  list: [],
  clear() { this.list.forEach((c) => { try { c.remove(); } catch (e) { /* noop */ } }); this.list = []; },
  mk(el, h, dec) {
    const c = LightweightCharts.createChart(el, { height: h, width: el.clientWidth, layout: { background: { color: '#0B110E' }, textColor: '#739A80', fontFamily: 'monospace' }, grid: { vertLines: { color: '#10241a' }, horzLines: { color: '#10241a' } }, rightPriceScale: { borderColor: '#183B29' }, timeScale: { borderColor: '#183B29', timeVisible: true }, handleScroll: true, handleScale: true });
    this.list.push(c); return c;
  },
  resize() { this.list.forEach((c, i) => { const el = c._el; if (el) c.applyOptions({ width: el.clientWidth }); }); },
  draw(els, cs) {
    this.clear();
    const dec = Math.min(10, Math.max(2, -Math.floor(Math.log10(cs[cs.length - 1].c)) + 3));
    const pf = { type: 'price', precision: dec, minMove: Math.pow(10, -dec) };
    const t = (x) => Math.floor(x.t / 1000), closes = cs.map((x) => x.c);
    const p = this.mk(els.price, 300); p._el = els.price;
    const cd = p.addCandlestickSeries({ upColor: '#00E676', downColor: '#FF4D5A', borderVisible: false, wickUpColor: '#00E676', wickDownColor: '#FF4D5A', priceFormat: pf });
    cd.setData(cs.map((x) => ({ time: t(x), open: x.o, high: x.h, low: x.l, close: x.c })));
    const vol = p.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(cs.map((x) => ({ time: t(x), value: x.q, color: x.c >= x.o ? 'rgba(0,230,118,.35)' : 'rgba(255,77,90,.35)' })));
    [[9, '#39FF88'], [21, '#FFD54F']].forEach(([n, col]) => { const e = Scoring.ema(closes, n); const s = p.addLineSeries({ color: col, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); s.setData(cs.map((x, i) => (e[i] == null ? null : { time: t(x), value: e[i] })).filter(Boolean)); });
    const r = this.mk(els.rsi, 110); r._el = els.rsi; const R = Scoring.rsi(closes);
    r.addLineSeries({ color: '#00FF66', lineWidth: 1 }).setData(cs.map((x, i) => (R[i] == null ? null : { time: t(x), value: R[i] })).filter(Boolean));
    const m = this.mk(els.macd, 120); m._el = els.macd; const M = Scoring.macd(closes);
    m.addHistogramSeries({ priceFormat: { type: 'price', precision: dec + 1, minMove: Math.pow(10, -dec - 1) } }).setData(cs.map((x, i) => (M.hist[i] == null ? null : { time: t(x), value: M.hist[i], color: M.hist[i] >= 0 ? '#00E676' : '#FF4D5A' })).filter(Boolean));
    p.timeScale().fitContent();
    return { R, M };
  }
};
window.addEventListener('resize', () => Charts.resize());
