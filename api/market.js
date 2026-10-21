'use strict';
const { getSymbols, send } = require('./_lib');
module.exports = async (req, res) => {
  try {
    const r = await getSymbols();
    send(res, 200, { ok: true, count: r.map.size, t: r.t, pairs: [...r.map.values()] }, 's-maxage=300, stale-while-revalidate=600');
  } catch (e) { send(res, e.status || 502, { ok: false, error: String(e.message || e) }); }
};
