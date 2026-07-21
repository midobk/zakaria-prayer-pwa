// POST /api/unsubscribe
// Body: { endpoint } — removes the subscription.

const { respond, ecDel, ecGet, endpointHash } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return respond(res, 200, { ok: true });
  if (req.method !== 'POST') return respond(res, 405, { error: 'POST required' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = {}; }
  const endpoint = body?.endpoint;
  if (!endpoint) return respond(res, 400, { error: 'endpoint required' });

  const id = endpointHash(endpoint);
  try {
    await ecDel(`subs:${id}`);
    return respond(res, 200, { ok: true, id });
  } catch (e) {
    return respond(res, 500, { error: String(e.message || e) });
  }
};
