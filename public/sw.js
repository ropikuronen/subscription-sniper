const DB_NAME = 'subscription-sniper';
const STORE = 'targets';
const DAY_MS = 24 * 60 * 60 * 1000;

const CANCEL_LINKS = {
  netflix: 'https://www.netflix.com/cancelplan',
  amazon: 'https://www.amazon.com/mc/pipelines/cancellation',
  adobe: 'https://account.adobe.com/plans',
  spotify: 'https://www.spotify.com/account/subscription/',
  'apple music': 'https://music.apple.com/account/settings',
  'youtube premium': 'https://www.youtube.com/paid_memberships',
  'disney+': 'https://www.disneyplus.com/en/commerce/cancel/start',
  hulu: 'https://secure.hulu.com/account',
  'hbo max': 'https://www.max.com/subscription',
  'playstation plus': 'https://www.playstation.com/acct/subscriptions',
  'xbox game pass': 'https://account.microsoft.com/services',
  canva: 'https://www.canva.com/settings/billing',
  dropbox: 'https://www.dropbox.com/account',
};

const ALIASES = {
  'amazon prime': 'amazon',
  prime: 'amazon',
  apple: 'apple music',
  youtube: 'youtube premium',
  disney: 'disney+',
  'disney plus': 'disney+',
  hbo: 'hbo max',
  max: 'hbo max',
  playstation: 'playstation plus',
  'ps plus': 'playstation plus',
  'ps+': 'playstation plus',
  xbox: 'xbox game pass',
  'game pass': 'xbox game pass',
};

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getCancelUrl(serviceName, customUrl) {
  const custom = normalizeUrl(customUrl);
  if (custom) return custom;

  const key = normalizeName(serviceName);
  if (CANCEL_LINKS[key]) return CANCEL_LINKS[key];
  const alias = ALIASES[key];
  if (alias && CANCEL_LINKS[alias]) return CANCEL_LINKS[alias];
  for (const [name, url] of Object.entries(CANCEL_LINKS)) {
    if (key === name) return url;
    if (key.startsWith(`${name} `) || name.startsWith(`${key} `)) return url;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(`${serviceName} cancel subscription`)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeTargets(targets) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE);
    store.clear();
    for (const target of targets) store.put(target);
  });
}

async function readTargets() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function broadcastTargets(targets) {
  const clientsList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  for (const client of clientsList) {
    client.postMessage({ type: 'TARGETS_UPDATED', targets });
  }
}

async function notifyTarget(target) {
  const title = `🎯 Cancel ${target.name} now.`;
  const options = {
    body: `${target.name} leaves the free-trial window in under 24 hours.`,
    icon: '/icon.jpeg',
    badge: '/icon.jpeg',
    tag: `sniper-${target.id}`,
    renotify: true,
    data: {
      cancelUrl: getCancelUrl(target.name, target.customCancelUrl),
      id: target.id,
    },
  };

  try {
    await self.registration.showNotification(title, options);
  } catch {
    /* permission missing */
  }
}

async function checkTargets() {
  const targets = await readTargets();
  let changed = false;
  const now = Date.now();

  for (const target of targets) {
    if (target.cancelled || target.notified) continue;
    const remaining = new Date(target.expiresAt).getTime() - now;
    if (remaining <= DAY_MS) {
      await notifyTarget(target);
      target.notified = true;
      changed = true;
    }
  }

  if (changed) {
    await writeTargets(targets);
    await broadcastTargets(targets);
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(checkTargets());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(checkTargets));
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SYNC_TARGETS' && Array.isArray(data.targets)) {
    event.waitUntil(writeTargets(data.targets).then(checkTargets));
  }
  if (data.type === 'CHECK_TARGETS') {
    event.waitUntil(checkTargets());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'trial-check') {
    event.waitUntil(checkTargets());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.cancelUrl || '/';
  event.waitUntil(self.clients.openWindow(url));
});
