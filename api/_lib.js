// Shared helpers for all /api/* functions.
// Storage: Vercel Edge Config (REST API) for subscription + offset persistence.
//   subs:<endpoint_hash> = { endpoint, keys:{p256dh,auth}, offsets:{...}, createdAt, lastSeen }
//   fired:<id>:<date>:<prayer>:<offset> = 1   (dedupe marker)

const EC_ID = process.env.EDGE_CONFIG || 'ecfg_svzbvpplfllkxbw6egr43ku0bw8n';
const EC_TOKEN = process.env.EDGE_CONFIG_TOKEN || 'defb6105-e494-4f51-9c18-8f0a4bbd9933';
// Real Edge Config REST API base URL (no /v1/ prefix — the SDK uses /ecfg_xxx/items?token=...)
const EC_BASE = `https://edge-config.vercel.com/${EC_ID}`;

const PRAYER_KEYS = ['fajr', 'zuhr', 'asr1', 'maghrib', 'isha'];
const PRAYER_LABEL = { fajr: 'Fajr', zuhr: 'Zuhr', asr1: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

async function ecGetAll() {
  const res = await fetch(`${EC_BASE}/items?token=${EC_TOKEN}`);
  if (!res.ok) throw new Error(`EC getAll failed: ${res.status}`);
  return res.json();
}

async function ecGet(key) {
  const url = `${EC_BASE}/item/${encodeURIComponent(key)}?token=${EC_TOKEN}`;
  const res = await fetch(url);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`EC get ${key} failed: ${res.status}`);
  return res.json();
}

async function ecSet(key, value) {
  // Edge Config write: single PUT/POST with { key, value }
  const res = await fetch(`${EC_BASE}/item?token=${EC_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`EC set ${key} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function ecDel(key) {
  const res = await fetch(`${EC_BASE}/item/${encodeURIComponent(key)}?token=${EC_TOKEN}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) throw new Error(`EC del ${key} failed: ${res.status}`);
  return true;
}

function endpointHash(endpoint) {
  let h = 0;
  for (let i = 0; i < endpoint.length; i++) {
    h = ((h << 5) - h + endpoint.charCodeAt(i)) | 0;
  }
  return 'sub_' + Math.abs(h).toString(36);
}

function todayLocal() {
  // YYYY-MM-DD in America/Toronto (mosque's tz)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return fmt.format(new Date());
}

function nowMinutesInToronto() {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Toronto',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const parts = fmt.format(new Date()).split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

function format12FromMinutes(m) {
  if (m == null) return '';
  const h = Math.floor(m / 60);
  const min = m % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(min).padStart(2, '0')} ${period}`;
}

function respond(res, status, body, extraHeaders = {}) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cron-Secret, X-Admin-Token');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.send(JSON.stringify(body));
}

module.exports = {
  EC_ID, EC_TOKEN, EC_BASE,
  PRAYER_KEYS, PRAYER_LABEL,
  ecGet, ecGetAll, ecSet, ecDel,
  endpointHash, todayLocal, nowMinutesInToronto,
  timeToMinutes, format12FromMinutes,
  respond,
};
