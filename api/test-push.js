// POST /api/test-push
// Sends a single test push to a subscription. Used by the app's "Test" button.
// Body: { subscription: { endpoint, keys } }

const { respond } = require('./_lib');

let wp = null;
function getWebpush() {
  if (wp) return wp;
  wp = require('web-push');
  wp.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:mehdi.bakkalimaassom@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return wp;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return respond(res, 200, { ok: true });
  if (req.method !== 'POST') return respond(res, 405, { error: 'POST required' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = {}; }
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return respond(res, 400, { error: 'subscription.endpoint + keys required' });
  }
  const payload = JSON.stringify({
    title: '🕌 Masjid Zakaria',
    body: 'Test alert — your notifications are working ✓',
    tag: 'zakaria-test',
    url: '/',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  });
  try {
    const result = await getWebpush().sendNotification(sub, payload, { TTL: 60 * 5 });
    return respond(res, 200, { ok: true, result });
  } catch (e) {
    return respond(res, 500, { error: e.message, statusCode: e.statusCode || null });
  }
};
