'use strict';

const $ = (sel) => document.querySelector(sel);

const PACES = { slow: 4.0, medium: 3.0, fast: 2.2 }; // seconds per full breath
const LIMITS = { rounds: [1, 10, 1], breaths: [10, 60, 5], recovery: [5, 30, 5] }; // min, max, step
const GET_READY = 4;

// ---------- Storage (on this device only) ----------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const settings = Object.assign(
  { rounds: 3, breaths: 30, pace: 'medium', recovery: 15, voice: true },
  store.get('settings', {})
);
let history = store.get('history', []);

const clock = (s) => {
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- Home screen ----------

function renderHome() {
  for (const el of document.querySelectorAll('[data-value]')) el.textContent = settings[el.dataset.value];
  for (const btn of document.querySelectorAll('[data-pace]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.pace === settings.pace));
  }
  $('#voice').checked = settings.voice;

  // Assumes roughly a 90 s breath hold per round.
  const perRound = settings.breaths * PACES[settings.pace] + 90 + settings.recovery + GET_READY;
  const minutes = Math.max(1, Math.round((settings.rounds * perRound) / 60));
  const rounds = `${settings.rounds} round${settings.rounds === 1 ? '' : 's'}`;
  $('#estimate').textContent = `${rounds} · ${settings.breaths} breaths · about ${minutes} min`;

  const progress = $('#progress');
  if (history.length === 0) {
    progress.innerHTML = '<div class="empty">No sessions yet</div>';
    return;
  }
  const best = Math.max(...history.flatMap((r) => r.times));
  const items = history.map((r, i) => `
    <div class="history-item">
      <div class="info">
        <div class="top">
          <span>${new Date(r.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <b>Best ${clock(Math.max(...r.times))}</b>
        </div>
        <div class="times">${r.times.map(clock).join(' · ')}</div>
      </div>
      <button type="button" class="delete" data-delete="${i}" aria-label="Delete session">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>`).join('');
  progress.innerHTML = `
    <div class="row"><span>Best hold</span><b>${clock(best)}</b></div>
    <div class="row"><span>Sessions</span><b>${history.length}</b></div>
    <details class="row" style="display:block">
      <summary class="row" style="border:0">History</summary>
      ${items}
    </details>`;
}

function saveSettings() {
  store.set('settings', settings);
  renderHome();
}

document.querySelectorAll('[data-step]').forEach((btn) => btn.addEventListener('click', () => {
  const key = btn.dataset.key;
  const [min, max, step] = LIMITS[key];
  settings[key] = Math.min(max, Math.max(min, settings[key] + step * Number(btn.dataset.step)));
  saveSettings();
}));

document.querySelectorAll('[data-pace]').forEach((btn) => btn.addEventListener('click', () => {
  settings.pace = btn.dataset.pace;
  saveSettings();
}));

$('#voice').addEventListener('change', (e) => {
  settings.voice = e.target.checked;
  saveSettings();
});

$('#progress').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete]');
  if (!btn) return;
  if (!confirm('Delete this session?')) return;
  history.splice(Number(btn.dataset.delete), 1);
  store.set('history', history);
  renderHome();
});

// ---------- Voice, vibration, screen lock ----------

const canSpeak = 'speechSynthesis' in window;

function unlockSpeech() {
  // iOS only allows speech that starts from a tap, so speak a silent utterance on Start.
  if (!canSpeak) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

function say(text) {
  if (!canSpeak || !session.cfg?.voice) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

const buzz = (ms) => navigator.vibrate?.(ms); // Works on Android; iPhones ignore it.

let wakeLock = null;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session.active) requestWakeLock();
});

// ---------- Session ----------

const sessionEl = $('#session');
const orbEl = $('#orb');
const bigEl = $('#big');
const instructionEl = $('#instruction');

const session = {
  active: false,
  phase: 'idle',
  round: 1,
  phaseStart: 0,
  times: [],
  cfg: null,
  lastBreath: -1,
  raf: 0,
  scale: 0.5,
  shown: { big: null, text: null },
};

const now = () => performance.now() / 1000;
const elapsed = () => now() - session.phaseStart;

function startSession() {
  unlockSpeech();
  session.cfg = { ...settings, secs: PACES[settings.pace] };
  Object.assign(session, { active: true, round: 1, times: [], scale: 0.5 });
  $('#summary').hidden = true;
  $('#stage').hidden = false;
  sessionEl.hidden = false;
  requestWakeLock();
  enter('getReady');
  loop();
}

function closeSession() {
  session.active = false;
  cancelAnimationFrame(session.raf);
  if (canSpeak) speechSynthesis.cancel();
  releaseWakeLock();
  sessionEl.hidden = true;
  renderHome();
}

function enter(phase) {
  session.phase = phase;
  session.phaseStart = now();
  sessionEl.dataset.phase = phase;
  $('#roundLabel').textContent = phase === 'finished'
    ? 'Complete'
    : `Round ${session.round} of ${session.cfg.rounds}`;

  switch (phase) {
    case 'getReady':
      session.lastBreath = -1;
      say(session.round === 1 ? 'Get comfortable. Round one.' : `Round ${session.round}.`);
      buzz(60);
      break;
    case 'retention':
      say('Hold.');
      buzz(120);
      break;
    case 'recovery':
      say('Breathe in fully, and hold.');
      buzz(120);
      break;
    case 'finished':
      finish();
      break;
  }
}

function endRetention() {
  if (session.phase !== 'retention') return;
  session.times.push(elapsed());
  enter('recovery');
}

function tick() {
  const t = elapsed();
  const c = session.cfg;
  switch (session.phase) {
    case 'getReady':
      if (t >= GET_READY) enter('breathing');
      break;
    case 'breathing': {
      const i = Math.floor(t / c.secs);
      if (i >= c.breaths) {
        enter('retention');
      } else if (i !== session.lastBreath) {
        session.lastBreath = i;
        if (i === c.breaths - 1) say('Last breath. Fill up, and let it all go.');
        else if (i === 0) say('Breathe in fully, and let go.');
        buzz(15);
      }
      break;
    }
    case 'recovery':
      if (t >= c.recovery) {
        say('And let go.');
        buzz(120);
        if (session.round < c.rounds) {
          session.round += 1;
          enter('getReady');
        } else {
          enter('finished');
        }
      }
      break;
  }
}

function render() {
  const t = elapsed();
  const c = session.cfg;
  let target = 0.5;
  let big = '';
  let text = '';

  switch (session.phase) {
    case 'getReady':
      big = Math.max(1, Math.ceil(GET_READY - t));
      text = 'Get comfortable and relax';
      break;
    case 'breathing': {
      const f = (t / c.secs) % 1;
      target = 0.5 + (0.5 * (1 - Math.cos(2 * Math.PI * f))) / 2;
      big = Math.min(c.breaths, Math.floor(t / c.secs) + 1);
      text = f < 0.5 ? 'Breathe in fully' : 'Let go';
      break;
    }
    case 'retention':
      target = 0.45 + 0.02 * Math.sin((t * 2 * Math.PI) / 5);
      big = clock(t);
      text = 'Exhale and hold.<br>Tap anywhere when you need to breathe.';
      break;
    case 'recovery':
      target = 1;
      big = Math.max(1, Math.ceil(c.recovery - t));
      text = 'Breathe in fully and hold';
      break;
  }

  // Ease into the big jumps (hold → recovery → next round); follow the breath curve directly.
  const easing = session.phase === 'recovery' || session.phase === 'getReady';
  session.scale = easing ? session.scale + (target - session.scale) * 0.06 : target;
  orbEl.style.transform = `scale(${session.scale.toFixed(4)})`;

  if (session.shown.big !== big) bigEl.textContent = session.shown.big = big;
  if (session.shown.text !== text) instructionEl.innerHTML = session.shown.text = text;
}

function loop() {
  if (!session.active) return;
  tick();
  if (session.phase === 'finished') return;
  render();
  session.raf = requestAnimationFrame(loop);
}

function finish() {
  cancelAnimationFrame(session.raf);
  releaseWakeLock();
  say('Session complete. Well done.');
  buzz([80, 60, 80]);
  if (session.times.length) {
    history.unshift({ date: new Date().toISOString(), times: session.times.map((t) => Math.round(t * 10) / 10) });
    store.set('history', history);
  }
  $('#summaryList').innerHTML = session.times
    .map((t, i) => `<div class="row"><span>Round ${i + 1}</span><span>${clock(t)}</span></div>`)
    .join('');
  $('#stage').hidden = true;
  $('#summary').hidden = false;
}

$('#start').addEventListener('click', startSession);
$('#close').addEventListener('click', (e) => { e.stopPropagation(); closeSession(); });
$('#done').addEventListener('click', (e) => { e.stopPropagation(); closeSession(); });
$('#breatheIn').addEventListener('click', (e) => { e.stopPropagation(); endRetention(); });
sessionEl.addEventListener('click', endRetention);

renderHome();

// ---------- Offline support ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
