export const STORAGE_KEY = 'subscription-sniper-targets';

export function loadTargets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTargets(targets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
  syncToServiceWorker(targets);
}

export function syncToServiceWorker(targets) {
  if (!('serviceWorker' in navigator)) return;

  const payload = { type: 'SYNC_TARGETS', targets };
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(payload);
    return;
  }

  navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage(payload);
  });
}
