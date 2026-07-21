// GET /api/vapid-public
// Returns the VAPID public key so the client can subscribe.

const { respond } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return respond(res, 200, { ok: true });
  const pub = process.env.VAPID_PUBLIC_KEY;
  if (!pub) return respond(res, 500, { error: 'VAPID_PUBLIC_KEY not configured' });
  return respond(res, 200, { publicKey: pub, subject: process.env.VAPID_SUBJECT || '' });
};
