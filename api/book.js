'use strict';
const { getBook, send } = require('./_lib');
module.exports = async (req, res) => {
  const symbol = String((req.query || {}).symbol || '').toUpperCase();
  if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) return send(res, 400, { ok: false, error: 'symbol tidak valid' });
  try { const b = await getBook(symbol); send(res, 200, Object.assign({ ok: true, symbol }, b), 's-maxage=3, stale-while-revalidate=5'); }
  catch (e) { send(res, e.status || 502, { ok: false, error: String(e.message || e) }); }
};
