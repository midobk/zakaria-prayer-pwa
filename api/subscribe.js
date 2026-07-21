// POST /api/subscribe
// Body: { subscription: { endpoint, keys:{p256dh,auth} }, offsets: {fajr:0,zuhr:10,...} }
// Stores the subscription and per-prayer offsets in Edge Config.

const { respond, ecGet, ecSet, ecDel, endpointHash } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return respond(res, 200, { ok: true });
  if (req.method !== 'POST') return respond(res, 405, { error: 'POST required' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = {}; }
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return respond(res, 400, { error: 'subscription.endpoint + subscription.keys.p256dh + subscription.keys.auth required' });
  }
  const offsets = body.offsets && typeof body.offsets === 'object' ? body.offsets : {};

  const id = endpointHash(sub.endpoint);
  const record = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    offsets: {
      fajr: Number(offsets.fajr) || 0,
      zuhr: Number(offsets.zuhr) || 0,
      asr1: Number(offsets.asr1) || 0,
      maghrib: Number(offsets.maghrib) || 0,
      isha: Number(offsets.isha) || 0,
    },
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };

  try {
    await ecSet({ key: `subs:${id}`, value: record, operation: 'upsert' });
    return respond(res, 200, { ok: true, id });
  } catch (e) {
    return respond(res, 500, { error: String(e.message || e) });
  }
};
