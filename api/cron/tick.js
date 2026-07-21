// POST /api/cron/tick
// Heart of the system. Called by Vercel Cron (every 10 min on Hobby) OR by an external
// cron-job.org ping OR by the in-SW Background Sync pinger. Walks all subs, checks each
// one's offsets against today's times, sends web-push notifications for any matching slot
// that hasn't fired yet today. Dedupes via fired:* keys in Edge Config.

const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const {
  EC_BASE, EC_TOKEN, PRAYER_KEYS, PRAYER_LABEL,
  ecGet, ecGetAll, ecSet, todayLocal, nowMinutesInToronto,
  timeToMinutes, format12FromMinutes, respond,
} = require('../_lib');

const CRON_SECRET = process.env.CRON_SECRET || '';

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

// Load prayer-data from repo. On Vercel this path resolves at the function root.
let PRAYER_DATA = null;
function loadPrayerData() {
  if (PRAYER_DATA) return PRAYER_DATA;
  try {
    // api/data.json is committed to the repo (small subset, server-side only).
    const p = path.join(__dirname, '..', '..', 'data.json');
    PRAYER_DATA = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    PRAYER_DATA = [];
  }
  return PRAYER_DATA;
}

function findToday() {
  const data = loadPrayerData();
  const today = todayLocal();
  return data.find((d) => d.date === today) || data[0];
}

async function listAllSubs() {
  // Edge Config: GET /items?token=... returns the whole config as a flat object.
  const res = await fetch(`${EC_BASE}/items?token=${EC_TOKEN}`);
  if (!res.ok) throw new Error(`EC list failed: ${res.status}`);
  const all = await res.json();
  const subs = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('subs:')) subs[k.slice(5)] = v;
  }
  return subs;
}

async function wasFiredToday(subId, prayer, off) {
  const key = `fired:${subId}:${todayLocal()}:${prayer}:${off}`;
  const v = await ecGet(key);
  return v === 1;
}

async function markFiredToday(subId, prayer, off) {
  const key = `fired:${subId}:${todayLocal()}:${prayer}:${off}`;
  await ecSet(`fired:${id}:${todayLocal()}:${prayer}:${off}`, 1);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return respond(res, 200, { ok: true });
  if (req.method !== 'GET' && req.method !== 'POST') return respond(res, 405, { error: 'GET/POST required' });

  // Auth: allow either the Vercel cron header or the X-Cron-Secret header
  const cronHeader = req.headers['authorization'] || '';
  const isVercelCron = cronHeader === `Bearer ${CRON_SECRET}`;
  const hasSecret = req.headers['x-cron-secret'] === CRON_SECRET;
  const adminToken = req.headers['x-admin-token'];
  const isAdmin = adminToken && adminToken === CRON_SECRET;
  if (!isVercelCron && !hasSecret && !isAdmin) {
    return respond(res, 401, { error: 'unauthorized' });
  }

  const startedAt = Date.now();
  const today = todayLocal();
  const nowMin = nowMinutesInToronto();
  const todayEntry = findToday();
  if (!todayEntry) return respond(res, 500, { error: 'prayer-data not loaded' });

  let subs;
  try { subs = await listAllSubs(); }
  catch (e) { return respond(res, 500, { error: 'list subs: ' + e.message }); }

  const summary = { date: today, nowMin, subs: Object.keys(subs).length, fired: [], errors: [] };

  for (const [id, sub] of Object.entries(subs)) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) continue;
    const offsets = sub.offsets || {};

    for (const prayer of PRAYER_KEYS) {
      const off = Number(offsets[prayer] || 0);
      const t = todayEntry[prayer];
      if (!t) continue;
      const target = timeToMinutes(t) - off;
      if (target == null) continue;

      // Fire if within ±1 minute of target
      if (Math.abs(target - nowMin) > 1) continue;
      if (await wasFiredToday(id, prayer, off)) continue;

      const t12 = format12FromMinutes(timeToMinutes(t));
      const body = off === 0
        ? `${PRAYER_LABEL[prayer]} is now (${t12}) — time to pray`
        : `${PRAYER_LABEL[prayer]} at ${t12} — ${off} min`;

      const payload = JSON.stringify({
        title: `🕌 ${PRAYER_LABEL[prayer]}`,
        body,
        tag: `zakaria-${prayer}-${off}`,
        url: '/',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
      });

      try {
        await getWebpush().sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          { TTL: 60 * 60, urgency: 'high' }
        );
        await markFiredToday(id, prayer, off);
        summary.fired.push({ id, prayer, off });
      } catch (e) {
        // 404/410 — endpoint is gone, delete the sub
        if (e.statusCode === 404 || e.statusCode === 410) {
          try { await ecDel(`subs:${id}`); } catch {}
        }
        summary.errors.push({ id, prayer, error: e.message, statusCode: e.statusCode });
      }
    }
  }

  summary.durationMs = Date.now() - startedAt;
  return respond(res, 200, summary);
};
