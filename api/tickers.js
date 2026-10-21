'use strict';
const { getTickers, send } = require('./_lib');
module.exports = async (req, res) => {
  try {
    const r = await getTickers();
    send(res, 200, { ok: true, count: r.items.length, t: r.t, stale: r.stale, items: r.items }, 's-maxage=3, stale-while-revalidate=5');
  } catch (e) { send(res, e.status || 502, { ok: false, error: String(e.message || e) }); }
};
