'use strict';
const { getCandles, send, GRAN } = require('./_lib');
module.exports = async (req, res) => {
  const q = req.query || {};
  const symbol = String(q.symbol || '').toUpperCase();
  const gran = String(q.granularity || '');
  const limit = parseInt(q.limit || '150', 10);
  if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) return send(res, 400, { ok: false, error: 'symbol tidak valid' });
  if (!GRAN[gran]) return send(res, 400, { ok: false, error: 'granularity harus salah satu: ' + Object.keys(GRAN).join(',') });
  if (!(limit >= 20 && limit <= 300)) return send(res, 400, { ok: false, error: 'limit harus 20-300' });
  try {
    const r = await getCandles(symbol, gran, limit);
    send(res, 200, { ok: true, symbol, granularity: gran, t: r.t, stale: r.stale, candles: r.candles }, 's-maxage=5, stale-while-revalidate=10');
  } catch (e) { send(res, e.status || 502, { ok: false, error: String(e.message || e) }); }
};
