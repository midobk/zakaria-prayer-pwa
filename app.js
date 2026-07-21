// Masjid Zakaria Prayer Times PWA
// All times come from window.PRAYER_DATA (365 days, 2026-06-09 → 2027-06-08)

const PRAYERS = [
  { key: 'fajr',    name: 'Fajr',    arabic: 'الفجر',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10V4"/><path d="M12 18a6 6 0 0 0-6-6 6 6 0 0 0 12 0z" fill="currentColor" fill-opacity="0.18"/><path d="M5 19h14"/></svg>' },
  { key: 'sunrise', name: 'Sunrise', arabic: 'الشروق', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="4" fill="currentColor" fill-opacity="0.18"/><path d="M12 6V3M3 14h2M19 14h2M5.6 7.6 6.7 8.7M17.3 8.7l1.1-1.1M5 19h14"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/></svg>' },
  { key: 'zuhr',    name: 'Zuhr',    arabic: 'الظهر',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity="0.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>' },
  { key: 'asr1',    name: 'Asr',     arabic: 'العصر',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v6"/><path d="M12 3a5 5 0 0 1 5 5v6h2l-3 4-3-4h2V8a5 5 0 0 0-3-4.6z" fill="currentColor" fill-opacity="0.18"/></svg>' },
  { key: 'maghrib', name: 'Maghrib', arabic: 'المغرب',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18"/><path d="M16 8a6 6 0 0 1-8 8 6 6 0 0 0 8-8z" fill="currentColor" fill-opacity="0.18"/><circle cx="17.5" cy="9.5" r="0.8" fill="currentColor"/></svg>' },
  { key: 'isha',    name: 'Isha',    arabic: 'العشاء',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14a8 8 0 1 1-8-10 6 6 0 0 0 8 10z" fill="currentColor" fill-opacity="0.2"/><circle cx="8" cy="8" r="0.8" fill="currentColor"/><circle cx="13" cy="6" r="0.6" fill="currentColor"/><circle cx="17" cy="12" r="0.6" fill="currentColor"/></svg>' },
];

// Hide sunrise from prayer notifications (it's not a salah)
const NOTIFY_KEYS = ['fajr', 'zuhr', 'asr1', 'maghrib', 'isha'];

const STORAGE = {
  notifyEnabled: 'zakaria.notifyEnabled',
  offsets: 'zakaria.offsets',
  lastFired: 'zakaria.lastFired',
};

// --- Helpers ---
const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, '0');
const format12 = (h, m) => {
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad2(m)} ${period}`;
};
const to24 = (str) => {
  if (!str) return null;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
};
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const todayEntry = () => {
  const key = todayKey();
  // Try direct match first
  let entry = window.PRAYER_DATA.find((p) => p.date === key);
  if (entry) return entry;
  // Find closest date in the data set (handle out-of-range days gracefully)
  const target = new Date(key + 'T00:00:00').getTime();
  let best = window.PRAYER_DATA[0];
  let bestDiff = Math.abs(new Date(best.date + 'T00:00:00').getTime() - target);
  for (const p of window.PRAYER_DATA) {
    const diff = Math.abs(new Date(p.date + 'T00:00:00').getTime() - target);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return best;
};

// --- Hijri date (via Intl) ---
function renderHijri() {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      calendar: 'islamic-umalqura',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const parts = fmt.formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    const h = `${get('day')} ${get('month')} ${get('year')}`;
    $('hijriFull').textContent = h;
    $('hijriDate').textContent = h;
  } catch {
    $('hijriFull').textContent = '—';
  }
  const g = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  $('gregDate').textContent = g.format(new Date());
}

// --- Qibla direction from Cornwall ON to Makkah ---
const QIBLA_BEARING = 58.7; // precomputed from Cornwall (45.018, -74.728) → Makkah
function renderQibla() {
  $('qiblaValue').textContent = `${QIBLA_BEARING.toFixed(1)}° NE`;
}

// --- Render prayers list ---
function renderPrayers() {
  const data = todayEntry();
  if (!data) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const list = $('prayers');
  list.innerHTML = '';
  let nextIdx = -1;
  const minutes = PRAYERS.map((p) => to24(data[p.key])).map((m) => {
    if (m == null) return null;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h * 60 + min;
  });
  // First prayer that hasn't passed yet today
  for (let i = 0; i < minutes.length; i++) {
    if (minutes[i] != null && minutes[i] > nowMin) { nextIdx = i; break; }
  }
  // If all passed, the next is tomorrow's Fajr
  const isAllPassed = nextIdx === -1;

  PRAYERS.forEach((p, i) => {
    const t = data[p.key];
    const el = document.createElement('div');
    el.className = 'prayer';
    if (i === nextIdx) el.classList.add('next');
    if (minutes[i] != null && minutes[i] < nowMin) el.classList.add('passed');

    const m = to24(t);
    const h = Math.floor(m / 60);
    const min = m % 60;
    const tStr = format12(h, min);
    const meta = i === 0 ? 'Dawn' : i === 1 ? '—' : i === 2 ? 'Noon' : i === 3 ? 'Afternoon' : i === 4 ? 'Sunset' : 'Night';

    el.innerHTML = `
      <div class="prayer-icon">${p.icon}</div>
      <div class="prayer-info">
        <div class="prayer-name">${p.name}</div>
        <div class="prayer-arabic">${p.arabic}</div>
      </div>
      <div>
        <div class="prayer-time">${tStr}</div>
        <div class="prayer-meta">${meta}</div>
      </div>
    `;
    list.appendChild(el);
  });

  return { data, nextIdx, isAllPassed };
}

function updateHero() {
  const result = renderPrayers();
  if (!result) return;
  const { data, nextIdx, isAllPassed } = result;

  let nameKey, timeKey;
  if (isAllPassed) {
    // Tomorrow's fajr
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tKey = `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}`;
    let nextData = window.PRAYER_DATA.find((p) => p.date === tKey);
    if (!nextData) {
      // search forward
      for (const p of window.PRAYER_DATA) {
        if (p.date > todayKey()) { nextData = p; break; }
      }
    }
    if (nextData) {
      nameKey = 'fajr'; timeKey = nextData.fajr;
    } else {
      nameKey = 'fajr'; timeKey = data.fajr;
    }
  } else {
    nameKey = PRAYERS[nextIdx].key;
    timeKey = data[nameKey];
  }

  const pMeta = PRAYERS.find((p) => p.key === nameKey);
  $('heroName').textContent = pMeta.name;
  const m = to24(timeKey);
  $('heroTime').textContent = format12(Math.floor(m / 60), m % 60);
}

// --- Countdown + notification scheduler ---
let countdownTimer = null;
function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  const tick = () => {
    const result = renderPrayers();
    if (!result) return;
    const { data, nextIdx, isAllPassed } = result;
    let targetDate, nameKey;
    if (isAllPassed) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDate = tomorrow;
      nameKey = 'fajr';
    } else {
      nameKey = PRAYERS[nextIdx].key;
      const t = data[nameKey];
      const [h, m] = t.split(':').map(Number);
      targetDate = new Date();
      targetDate.setHours(h, m, 0, 0);
      if (targetDate < new Date()) targetDate.setDate(targetDate.getDate() + 1);
    }
    // Set target to actual prayer time today
    if (!isAllPassed) {
      const [h, m] = data[nameKey].split(':').map(Number);
      targetDate = new Date();
      targetDate.setHours(h, m, 0, 0);
    }

    const ms = targetDate - new Date();
    const totalMin = Math.max(0, Math.floor(ms / 60000));
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    const pMeta = PRAYERS.find((p) => p.key === nameKey);
    $('heroCountdown').innerHTML = `in <strong>${hh}h ${pad2(mm)}m</strong> · ${pMeta.name} at <strong>${format12(Math.floor(to24(data[nameKey] || (isAllPassed ? window.PRAYER_DATA.find((p)=>true).fajr : '00:00')) / 60), to24(data[nameKey] || '00:00') % 60)}</strong>`;

    // Update hero
    updateHero();

    // Fire notifications
    checkAndFireNotifications();
  };
  tick();
  countdownTimer = setInterval(tick, 15 * 1000);
}

// --- Notification scheduling (pre-prayer offsets) ---
function getOffsets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE.offsets) || '{}');
  } catch { return {}; }
}
function saveOffsets(o) {
  localStorage.setItem(STORAGE.offsets, JSON.stringify(o));
}
function getLastFired() {
  try { return JSON.parse(localStorage.getItem(STORAGE.lastFired) || '{}'); } catch { return {}; }
}
function setLastFired(o) { localStorage.setItem(STORAGE.lastFired, JSON.stringify(o)); }

function checkAndFireNotifications() {
  if (Notification?.permission !== 'granted') return;
  const enabled = localStorage.getItem(STORAGE.notifyEnabled) === '1';
  if (!enabled) return;
  const data = todayEntry();
  if (!data) return;
  const offsets = getOffsets();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dayKey = todayKey();
  const lastFired = getLastFired();
  if (lastFired.day !== dayKey) {
    lastFired.day = dayKey;
    lastFired.fired = {};
  }

  for (const p of PRAYERS) {
    if (!NOTIFY_KEYS.includes(p.key)) continue;
    const off = Number(offsets[p.key] || 0);
    const m = to24(data[p.key]);
    if (m == null) continue;
    const target = m - off;
    // Fire if within 1 minute of target and not already fired today
    if (Math.abs(target - nowMin) <= 0 && !lastFired.fired[`${p.key}-${off}`]) {
      const fireKey = `${p.key}-${off}-${data[p.key]}`;
      if (lastFired.fired[fireKey]) continue;
      lastFired.fired[fireKey] = true;
      const when = off === 0 ? 'now' : `in ${off} min`;
      const body = off === 0
        ? `${p.name} (${format12(Math.floor(m/60), m%60)}) — time to pray`
        : `${p.name} at ${format12(Math.floor(m/60), m%60)} — ${when}`;
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'show-notification',
          title: `🕌 ${p.name}`,
          body,
          tag: `zakaria-${p.key}`,
        });
      } else {
        new Notification(`🕌 ${p.name}`, { body, tag: `zakaria-${p.key}` });
      }
    }
  }
  setLastFired(lastFired);
}

// --- Notification button ---
function setupNotificationButton() {
  const btn = $('notifyBtn');
  const update = () => {
    const enabled = localStorage.getItem(STORAGE.notifyEnabled) === '1';
    if (Notification?.permission === 'granted' && enabled) {
      btn.classList.add('active');
      btn.querySelector('.label').textContent = 'Alerts On';
    } else {
      btn.classList.remove('active');
      btn.querySelector('.label').textContent = 'Enable Alerts';
    }
  };
  update();
  btn.addEventListener('click', async () => {
    if (Notification?.permission === 'granted' && localStorage.getItem(STORAGE.notifyEnabled) === '1') {
      // Already on — toggle off
      localStorage.setItem(STORAGE.notifyEnabled, '0');
      toast('Alerts paused');
      update();
      return;
    }
    if (Notification?.permission === 'denied') {
      toast('Notifications blocked — enable in browser settings');
      return;
    }
    if (Notification?.permission === 'default') {
      $('modal').classList.add('open');
      return;
    }
    // permission already granted but disabled in app
    localStorage.setItem(STORAGE.notifyEnabled, '1');
    toast('Alerts enabled ✓');
    update();
  });

  $('modalAllow').addEventListener('click', async () => {
    $('modal').classList.remove('open');
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      localStorage.setItem(STORAGE.notifyEnabled, '1');
      toast('Alerts enabled ✓');
      // fire a welcome
      setTimeout(() => {
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'show-notification',
            title: '🕌 Masjid Zakaria',
            body: 'Prayer alerts are on. You will be notified before each prayer.',
            tag: 'zakaria-welcome',
          });
        } else {
          new Notification('🕌 Masjid Zakaria', { body: 'Prayer alerts are on.' });
        }
      }, 400);
    } else {
      toast('Alerts were not enabled');
    }
    update();
  });
  $('modalClose').addEventListener('click', () => $('modal').classList.remove('open'));
}

// --- Settings panel ---
function setupSettings() {
  const toggle = $('settingsToggle');
  const panel = $('settings');
  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    toggle.textContent = panel.classList.contains('open') ? '✕ Close settings' : '⚙ Notification settings';
  });
  // Load saved offsets
  const offsets = getOffsets();
  document.querySelectorAll('.select[data-prayer]').forEach((sel) => {
    const key = sel.getAttribute('data-prayer');
    if (offsets[key] != null) sel.value = String(offsets[key]);
    sel.addEventListener('change', () => {
      const o = getOffsets();
      o[key] = Number(sel.value);
      saveOffsets(o);
      toast(`Saved: ${key} ${sel.value === '0' ? 'at time' : sel.value + ' min before'}`);
    });
  });

  $('testBtn').addEventListener('click', async () => {
    if (Notification?.permission !== 'granted') {
      toast('Enable alerts first');
      return;
    }
    const body = 'Test alert — your notifications are working ✓';
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'show-notification', title: '🕌 Masjid Zakaria', body, tag: 'zakaria-test',
      });
    } else {
      new Notification('🕌 Masjid Zakaria', { body });
    }
    toast('Test notification sent');
  });
}

// --- Qibla button (compass) ---
function setupQibla() {
  const btn = $('qiblaBtn');
  const needle = $('qiblaNeedle');

  // Try device orientation (true north) — works on phones
  function orient(e) {
    if (e.webkitCompassHeading != null) {
      // iOS
      const heading = e.webkitCompassHeading;
      needle.style.transform = `translateX(-50%) rotate(${QIBLA_BEARING - heading}deg)`;
    } else if (e.alpha != null) {
      // Android: alpha is clockwise from north
      needle.style.transform = `translateX(-50%) rotate(${QIBLA_BEARING - e.alpha}deg)`;
    }
  }
  function enable() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then((s) => { if (s === 'granted') window.addEventListener('deviceorientation', orient, true); })
        .catch(() => {});
    } else {
      window.addEventListener('deviceorientation', orient, true);
    }
  }
  btn.addEventListener('click', () => {
    enable();
    needle.style.transform = `translateX(-50%) rotate(${QIBLA_BEARING}deg)`;
    toast(`Qibla is ${QIBLA_BEARING.toFixed(1)}° from north`);
  });
}

// --- Install button ---
function setupInstall() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $('installBtn').style.display = 'inline-flex';
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('installBtn').style.display = 'none';
  });
  window.addEventListener('appinstalled', () => { $('installBtn').style.display = 'none'; });
}

// --- Toast ---
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// --- Service worker registration ---
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// --- Boot ---
function init() {
  if (!window.PRAYER_DATA || !window.PRAYER_DATA.length) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#d4af6a">Prayer data missing. Please reinstall.</div>';
    return;
  }
  registerSW();
  renderHijri();
  renderQibla();
  startCountdown();
  setupNotificationButton();
  setupSettings();
  setupQibla();
  setupInstall();
}

document.addEventListener('DOMContentLoaded', init);
