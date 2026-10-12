import { useEffect, useMemo, useState } from 'react';
import { getCancelUrl } from './cancelLinks';
import { loadTargets, saveTargets, syncToServiceWorker } from './storage';
import { formatRemaining, isSniperWindow } from './time';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function bootSniper(targets) {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  syncToServiceWorker(targets);

  if ('periodicSync' in registration) {
    try {
      await registration.periodicSync.register('trial-check', {
        minInterval: 15 * 60 * 1000,
      });
    } catch {
      /* not granted / unsupported */
    }
  }
}

export default function App() {
  const [targets, setTargets] = useState(() => loadTargets());
  const [now, setNow] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [customCancelUrl, setCustomCancelUrl] = useState('');

  const live = useMemo(
    () =>
      targets
        .filter((t) => !t.cancelled)
        .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt)),
    [targets],
  );

  const graveyard = useMemo(
    () =>
      targets
        .filter((t) => t.cancelled)
        .sort((a, b) => new Date(b.cancelledAt || 0) - new Date(a.cancelledAt || 0)),
    [targets],
  );

  useEffect(() => {
    saveTargets(targets);
  }, [targets]);

  useEffect(() => {
    bootSniper(targets);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const onMessage = (event) => {
      if (event.data?.type === 'TARGETS_UPDATED' && Array.isArray(event.data.targets)) {
        setTargets(event.data.targets);
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const check = () => {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_TARGETS' });
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [targets]);

  function resetForm() {
    setName('');
    setExpiresAt('');
    setCustomCancelUrl('');
    setAdding(false);
  }

  function addTarget(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !expiresAt) return;

    const targetDate = new Date(expiresAt);
    const year = targetDate.getFullYear();
    const currentTime = new Date();

    // 1. Tulevaisuuden tarkistus (Vuosi 2100 tai yli)
    if (year >= 2100) {
      alert(`Really, year ${year}? You're gonna live that old?`);
      return;
    }

    // 2. Menneisyyden tarkistus
    if (targetDate < currentTime) {
      alert("We can't change our past mistakes, focus on the present.");
      return;
    }

    setTargets([
      ...targets,
      {
        id: uid(),
        name: trimmed,
        expiresAt: targetDate.toISOString(),
        customCancelUrl: customCancelUrl.trim(),
        cancelled: false,
        notified: false,
      },
    ]);
    resetForm();
  }

  function markCancelled(target) {
    setTargets((current) =>
      current.map((item) =>
        item.id === target.id
          ? { ...item, cancelled: true, cancelledAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  function snipe(target) {
    window.open(
      getCancelUrl(target.name, target.customCancelUrl),
      '_blank',
      'noopener,noreferrer',
    );
    markCancelled(target);
  }

  function deleteFromHistory(id) {
    setTargets((current) => current.filter((item) => item.id !== id));
  }

  function nukeHistory() {
    setTargets((current) => current.filter((item) => !item.cancelled));
  }

  function handleOpenAdd() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    
    const tzOffset = tomorrow.getTimezoneOffset() * 60000;
    const localISO = new Date(tomorrow.getTime() - tzOffset).toISOString().slice(0, 16);
    
    setExpiresAt(localISO);
    setAdding(true);
  }

  return (
    <div className="min-h-screen bg-black text-white px-6 pb-32 pt-10 sm:px-12">
      <header className="mb-16">
        <p className="text-xs font-semibold tracking-[0.35em] uppercase text-white/40">
          Your personal hitman.
        </p>
        <h1 className="mt-3 text-5xl font-black leading-none tracking-tight sm:text-7xl">
          Subscription
          <br />
          Sniper
        </h1>
      </header>

      <section>
        <h2 className="mb-8 text-sm font-semibold tracking-[0.3em] uppercase text-white/35">
          Hitlist
        </h2>

        {live.length === 0 ? (
          <p className="text-2xl font-semibold text-white/30">No active targets.</p>
        ) : (
          <ul className="space-y-12">
            {live.map((target) => {
              const sniper = isSniperWindow(target.expiresAt);
              const remaining = formatRemaining(target.expiresAt);
              void now;

              return (
                <li key={target.id} className={sniper ? 'sniper-pulse text-sniper' : ''}>
                  <div className="flex flex-wrap items-baseline justify-between gap-4">
                    <h3 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                      {target.name}
                    </h3>
                    <p className="text-2xl font-semibold tabular-nums sm:text-3xl">
                      {remaining}
                    </p>
                  </div>
                  {sniper && (
                    <button
                      type="button"
                      onClick={() => snipe(target)}
                      className="mt-6 w-full text-left text-5xl font-black tracking-tight text-sniper sm:text-7xl"
                    >
                      CANCEL NOW
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => markCancelled(target)}
                    className={`mt-4 text-sm font-semibold tracking-[0.18em] uppercase ${
                      sniper ? 'text-sniper/70 hover:text-sniper' : 'text-white/35 hover:text-white'
                    }`}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-24 text-white/30">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-semibold tracking-[0.3em] uppercase">
            Snipe History
          </h2>
          {graveyard.length > 0 && (
            <button
              onClick={nukeHistory}
              className="text-xs font-bold uppercase tracking-widest text-white/30 hover:text-red-500 transition-colors"
            >
              [ Nuke History ]
            </button>
          )}
        </div>

        {graveyard.length === 0 ? (
          <p className="text-xl font-semibold text-white/20">No history yet.</p>
        ) : (
          <ul className="space-y-5">
            {graveyard.map((target) => (
              <li
                key={target.id}
                className="flex flex-wrap items-center justify-between gap-3 text-xl sm:text-2xl"
              >
                <span className="line-through">{target.name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-base tracking-wide uppercase">Cancelled</span>
                  <button
                    onClick={() => deleteFromHistory(target.id)}
                    className="text-white/20 hover:text-red-500 transition-colors p-1 ml-2"
                    title="Delete permanently"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding ? (
        <form
          onSubmit={addTarget}
          className="fixed inset-x-0 bottom-0 bg-black px-6 pb-8 pt-5 sm:px-12"
        >
          <p className="mb-5 text-xs font-semibold tracking-[0.3em] uppercase text-white/35">
            New target
          </p>
          <label className="mb-5 block">
            <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-white/35">
              Service name
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Netflix"
              className="w-full bg-transparent text-3xl font-extrabold outline-none placeholder:text-white/20"
            />
          </label>
          <label className="mb-5 block">
            <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-white/35">
              Expiration date
            </span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              onClick={(e) => e.target.showPicker()}
              required
              className="w-full bg-transparent text-xl text-white/80 outline-none"
            />
          </label>
          <label className="mb-7 block">
            <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-white/35">
              Custom cancel URL
            </span>
            <input
              type="text"
              inputMode="url"
              value={customCancelUrl}
              onChange={(e) => setCustomCancelUrl(e.target.value)}
              placeholder="Optional — paste if the service isn’t known"
              className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
            />
          </label>
          <div className="flex items-center justify-between gap-6">
            <button
              type="button"
              onClick={resetForm}
              className="text-lg font-semibold text-white/40"
            >
              Close
            </button>
            <button type="submit" className="text-2xl font-black">
              Add target
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleOpenAdd}
          aria-label="Add target"
          className="fixed bottom-7 right-7 flex h-16 w-16 items-center justify-center rounded-full bg-white text-4xl font-black leading-none text-black"
        >
          +
        </button>
      )}
    </div>
  );
}