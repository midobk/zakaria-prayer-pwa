// Shared helpers for all /api/* functions.
// Storage: Upstash Redis (REST API) for subscription + offset persistence.
//   subs:<endpoint_hash> = JSON string { endpoint, keys:{p256dh,auth}, offsets:{...}, createdAt, lastSeen }
//   fired:<id>:<date>:<prayer>:<offset> = "1"   (dedupe marker)
//
// Upstash REST API format (per https://docs.upstash.com/redis):
//   POST {URL}/<command>[/<key>]  with  Authorization: Bearer <TOKEN>
//   body: JSON-encoded array of args, e.g. ["value"] for SET, [] for GET, etc.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

const PRAYER_KEYS = ['fajr', 'zuhr', 'asr1', 'maghrib', 'isha'];
const PRAYER_LABEL = { fajr: 'Fajr', zuhr: 'Zuhr', asr1: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

async function upstash(cmd, ...args) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error('UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set');
  }
  // Upstash REST API:
  //   POST {URL}/{cmd}  with body: JSON array of args (one less than the
  //   native command expects, since the key/pattern goes in the URL path).
  // Examples:
  //   GET key       →  POST /get/key              body: []
  //   SET key val   →  POST /set/key              body: [val]
  //   KEYS pattern  →  POST /keys/pattern         body: []
  //   SCAN 0 MATCH pat COUNT 100 → POST /scan body: ["0","MATCH","pat","COUNT","100"]
  const base = `${UPSTASH_URL}/${cmd}`;
  let url = base;
  let body = '[]';
  if (args.length > 0) {
    // For commands like SET/GET/DEL, the first arg is the key — goes in the URL.
    if (['get', 'set', 'del', 'exists', 'expire', 'ttl', 'incr', 'decr', 'append',
         'getrange', 'setrange', 'strlen', 'type', 'rename', 'persist'].includes(cmd)) {
      url = `${base}/${encodeURIComponent(args[0])}`;
      body = args.length > 1 ? JSON.stringify(args.slice(1)) : '[]';
    } else if (cmd === 'keys') {
      // KEYS pattern — pattern in URL.
      url = `${base}/${encodeURIComponent(args[0])}`;
      body = '[]';
    } else {
      // SCAN, EVAL, etc. — args all in body.
      body = JSON.stringify(args);
    }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    // Upstash REST is sensitive: GET returns 400 with body `[]`, but works with NO body.
    // Send body only when we have args to put in it.
    ...(body && body !== '[]' ? { body } : {}),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upstash ${cmd} failed: ${res.status} ${txt}`);
  }
  return res.json();
}

function key(name) { return `zakaria:${name}`; }

async function ecGet(k) {
  const fullKey = key(k);
  const r = await upstash('get', fullKey);
  // Upstash returns { result: <value> } where value is null if missing or the string value
  if (!r || r.result == null) return undefined;
  try { return JSON.parse(r.result); } catch { return r.result; }
}

async function ecSet(k, value) {
  const fullKey = key(k);
  // SET key value — value is the JSON-serialized form
  const payload = JSON.stringify(value);
  await upstash('set', fullKey, payload);
  return true;
}

async function ecDel(k) {
  const fullKey = key(k);
  await upstash('del', fullKey);
  return true;
}

// List all keys matching a pattern. Uses Upstash KEYS (suitable for our small sub counts).
async function ecScan(pattern) {
  const fullPattern = key(pattern);
  const r = await upstash('keys', fullPattern);
  const keys = r?.result || [];
  const all = {};
  for (const k of (Array.isArray(keys) ? keys : [])) {
    const localKey = k.startsWith('zakaria:') ? k.slice(8) : k;
    const val = await ecGet(localKey);
    if (val !== undefined) all[localKey] = val;
  }
  return all;
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
  UPSTASH_URL, UPSTASH_TOKEN,
  PRAYER_KEYS, PRAYER_LABEL,
  ecGet, ecSet, ecDel, ecScan,
  endpointHash, todayLocal, nowMinutesInToronto,
  timeToMinutes, format12FromMinutes,
  respond,
};
