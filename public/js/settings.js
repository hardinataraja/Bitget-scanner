const Store = (() => {
  const DEF = { refreshSec: 15, scanSec: 10, batch: 12, minVol: 200000, minRvol: 1, minScore: 70, maxChange24: 30, cooldownMin: 30, strict: false, pairMode: 'all', notif: false, matrix: true, reduced: false, theme: 'matrix' };
  const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage penuh/diblokir */ } };
  const st = { s: Object.assign({}, DEF, rd('beg.settings2', {})), watch: rd('beg.watch', []).filter((x) => /^[A-Z0-9]{2,20}USDT$/.test(x)), alerts: rd('beg.alerts', []).map((a) => Object.assign({ h: {}, mfe: {}, mae: {}, held: {}, na: {} }, a)) };
  st.DEF = DEF;
  st.saveS = () => wr('beg.settings2', st.s);
  st.saveW = () => wr('beg.watch', st.watch);
  st.saveA = () => { if (st.alerts.length > 200) st.alerts = st.alerts.slice(-200); wr('beg.alerts', st.alerts); };
  st.reset = () => { st.s = Object.assign({}, DEF); st.saveS(); };
  return st;
})();
