'use strict';
const { bg, send } = require('./_lib');
module.exports = async (req, res) => {
  try {
    const r = await bg('/api/v2/public/time', {}, 5000);
    send(res, 200, { ok: true, bitget: 'OK', serverTime: r.data && r.data.serverTime, now: Date.now() });
  } catch (e) { send(res, 502, { ok: false, bitget: 'ERROR', error: String(e.message || e) }); }
};
