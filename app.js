'use strict';

const $ = (sel) => document.querySelector(sel);

const APP_VERSION = 10; // keep in step with CACHE in sw.js

// ---------- Diagnostics (only shown when the address ends in ?debug) ----------

const debug = {
  on: new URLSearchParams(location.search).has('debug'),
  data: {},
  el: null,
  set(key, value) {
    if (!this.on) return;
    this.data[key] = value;
    this.render();
  },
  count(key) {
    if (!this.on) return;
    this.data[key] = (this.data[key] || 0) + 1;
    this.render();
  },
  error(err) {
    console.error(err);
    this.set('last error', err && err.name ? `${err.name}: ${err.message}` : String(err));
  },
  render() {
    if (this.el) this.el.querySelector('pre').textContent = Object.entries(this.data).map(([k, v]) => `${k}: ${v}`).join('\n');
  },
  init() {
    if (!this.on) return;
    this.el = document.createElement('div');
    this.el.className = 'debug';
    this.el.innerHTML = '<pre></pre><button type="button" data-act="test">Test sound</button> <button type="button" data-act="copy">Copy</button>';
    document.body.appendChild(this.el);
    this.el.querySelector('[data-act="test"]').addEventListener('click', () => this.testSound());
    this.el.querySelector('[data-act="copy"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const text = this.el.querySelector('pre').textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback for browsers that block the clipboard API.
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
    this.set('version', APP_VERSION);
    this.set('browser engine', isChromium ? 'Chromium' : 'WebKit/other');
    this.set('audioSession', navigator.audioSession ? navigator.audioSession.type : 'not available');
    const showVoices = () => {
      const v = canSpeak ? speechSynthesis.getVoices() : [];
      this.set('voices available', `${v.length} total, Swedish: ${v.filter((x) => /^sv/i.test(x.lang)).map((x) => x.name).join(', ') || 'none'}`);
    };
    showVoices();
    if (canSpeak) speechSynthesis.addEventListener?.('voiceschanged', showVoices);
    window.addEventListener('error', (e) => this.error(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => this.error(e.reason));
    setInterval(() => {
      if (audio.ctx) {
        this.data.engine = audio.ctx.state;
        this.data['engine clock'] = audio.ctx.currentTime.toFixed(1);
      }
      this.render();
    }, 500);
  },
  // A plain beep, then a burst of the breath noise, straight to the speakers.
  testSound() {
    try {
      audio.unlock();
      const ctx = audio.ctx;
      if (!ctx) return this.set('test', 'no Web Audio in this browser');
      const t = ctx.currentTime + 0.05;
      const osc = ctx.createOscillator();
      const g1 = ctx.createGain();
      g1.gain.value = 0.2;
      osc.frequency.value = 440;
      osc.connect(g1).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
      const src = ctx.createBufferSource();
      const g2 = ctx.createGain();
      g2.gain.value = 0.8;
      src.buffer = audio.noise;
      src.connect(g2).connect(ctx.destination);
      src.start(t + 0.6);
      src.stop(t + 1.4);
      this.set('test', `beep + noise sent (engine ${ctx.state})`);
    } catch (err) {
      this.error(err);
    }
  },
};

const PACES = { slow: 4.0, medium: 3.0, fast: 2.2 }; // seconds per full breath
const LIMITS = { rounds: [1, 10, 1], breaths: [10, 60, 5], recovery: [5, 30, 5] }; // min, max, step
const GET_READY = 4;
const RECOVERY_INHALE = 1.5; // seconds of inhale sound when the recovery breath starts
const LET_GO_EXHALE = 2.0; // seconds of exhale sound when the recovery hold ends

// ---------- Text in each language ----------

const STRINGS = {
  en: {
    locale: 'en-US',
    start: 'Start session',
    estimate: (r, b, m) => `${r} round${r === 1 ? '' : 's'} · ${b} breaths · about ${m} min`,
    session: 'Session',
    rounds: 'Rounds:',
    breaths: 'Breaths per round:',
    pace: 'Pace',
    slow: 'Slow',
    medium: 'Medium',
    fast: 'Fast',
    recovery: 'Recovery hold:',
    voice: 'Voice guidance',
    sounds: 'Breathing sounds',
    language: 'Language',
    progress: 'Progress',
    noSessions: 'No sessions yet',
    bestHold: 'Best hold',
    sessions: 'Sessions',
    history: 'History',
    best: (t) => `Best ${t}`,
    deleteSession: 'Delete session',
    confirmDelete: 'Delete this session?',
    safety: `<b>Safety</b>
      <p>This app is for general wellbeing. It is not medical advice or treatment.</p>
      <ul>
        <li>Always practice sitting or lying down. Never in or near water, while driving, or anywhere fainting could be dangerous.</li>
        <li>Talk to a doctor first if you are pregnant, have epilepsy, heart or blood-pressure problems, have had a stroke, or have any other serious health condition.</li>
        <li>Light-headedness and tingling are common. Never force a breath hold. Stop and breathe normally if you feel unwell.</li>
        <li>Not intended for children. Use at your own risk.</li>
      </ul>`,
    end: 'End session',
    roundOf: (r, n) => `Round ${r} of ${n}`,
    complete: 'Complete',
    getReady: 'Get comfortable and relax',
    inhale: 'Breathe in fully',
    exhale: 'Let go',
    hold: 'Exhale and hold.<br>Tap anywhere when you need to breathe.',
    recoveryHold: 'Breathe in fully and hold',
    breatheInButton: 'Breathe in',
    wellDone: 'Well done',
    done: 'Done',
    round: (r) => `Round ${r}`,
    say: {
      firstRound: 'Get comfortable and relax. Round one.',
      round: (r) => `Round ${r}.`,
      firstBreath: 'Breathe in fully, and let go.',
      lastBreath: 'Last breath. Fill up, and let it all go.',
      hold: 'Hold.',
      recovery: 'Breathe in fully, and hold.',
      letGo: 'And let go.',
      finished: 'Session complete. Well done.',
    },
  },
  sv: {
    locale: 'sv-SE',
    start: 'Starta session',
    estimate: (r, b, m) => `${r} ${r === 1 ? 'runda' : 'rundor'} · ${b} andetag · cirka ${m} min`,
    session: 'Session',
    rounds: 'Rundor:',
    breaths: 'Andetag per runda:',
    pace: 'Tempo',
    slow: 'Långsamt',
    medium: 'Medel',
    fast: 'Snabbt',
    recovery: 'Återhämtning:',
    voice: 'Röstguidning',
    sounds: 'Andningsljud',
    language: 'Språk',
    progress: 'Framsteg',
    noSessions: 'Inga sessioner än',
    bestHold: 'Bästa tid',
    sessions: 'Sessioner',
    history: 'Historik',
    best: (t) => `Bäst ${t}`,
    deleteSession: 'Ta bort session',
    confirmDelete: 'Ta bort den här sessionen?',
    safety: `<b>Säkerhet</b>
      <p>Appen är till för allmänt välbefinnande. Den är inte medicinsk rådgivning eller behandling.</p>
      <ul>
        <li>Öva alltid sittande eller liggande. Aldrig i eller nära vatten, när du kör bil eller där det kan vara farligt att svimma.</li>
        <li>Prata med en läkare först om du är gravid, har epilepsi, hjärt- eller blodtrycksproblem, har haft en stroke eller har någon annan allvarlig sjukdom.</li>
        <li>Yrsel och stickningar är vanligt. Tvinga aldrig fram ett andningsuppehåll. Avbryt och andas normalt om du mår dåligt.</li>
        <li>Inte avsedd för barn. Används på egen risk.</li>
      </ul>`,
    end: 'Avsluta session',
    roundOf: (r, n) => `Runda ${r} av ${n}`,
    complete: 'Klart',
    getReady: 'Sätt dig bekvämt och slappna av',
    inhale: 'Andas in djupt',
    exhale: 'Släpp',
    hold: 'Andas ut och håll andan.<br>Tryck var som helst när du behöver andas.',
    recoveryHold: 'Andas in djupt och håll',
    breatheInButton: 'Andas in',
    wellDone: 'Bra jobbat',
    done: 'Klar',
    round: (r) => `Runda ${r}`,
    say: {
      firstRound: 'Sätt dig bekvämt och slappna av. Runda ett.',
      round: (r) => `Runda ${r}.`,
      firstBreath: 'Andas in djupt, och släpp.',
      lastBreath: 'Sista andetaget. Fyll lungorna, och släpp ut allt.',
      hold: 'Håll andan.',
      recovery: 'Andas in djupt, och håll.',
      letGo: 'Och släpp.',
      finished: 'Sessionen är klar. Bra jobbat.',
    },
  },
};

const T = () => STRINGS[settings.lang] || STRINGS.en;

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

const defaultLang = (navigator.language || '').toLowerCase().startsWith('sv') ? 'sv' : 'en';
const settings = Object.assign(
  { rounds: 3, breaths: 30, pace: 'medium', recovery: 15, voice: true, sounds: true, lang: defaultLang },
  store.get('settings', {})
);
let history = store.get('history', []);

const clock = (s) => {
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- Home screen ----------

function applyLanguage() {
  const t = T();
  document.documentElement.lang = settings.lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t[el.dataset.i18n];
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t[el.dataset.i18nHtml]; // our own fixed text only
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t[el.dataset.i18nAria]);
}

function renderHome() {
  const t = T();
  applyLanguage();
  for (const el of document.querySelectorAll('[data-value]')) el.textContent = settings[el.dataset.value];
  for (const btn of document.querySelectorAll('[data-pace]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.pace === settings.pace));
  }
  for (const btn of document.querySelectorAll('[data-lang]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.lang === settings.lang));
  }
  $('#voice').checked = settings.voice;
  $('#sounds').checked = settings.sounds;
  $('#version').textContent = `Version ${APP_VERSION}`;

  // Assumes roughly a 90 s breath hold per round.
  const perRound = settings.breaths * PACES[settings.pace] + 90 + settings.recovery + GET_READY;
  const minutes = Math.max(1, Math.round((settings.rounds * perRound) / 60));
  $('#estimate').textContent = t.estimate(settings.rounds, settings.breaths, minutes);

  const progress = $('#progress');
  if (history.length === 0) {
    progress.innerHTML = `<div class="empty">${t.noSessions}</div>`;
    return;
  }
  const best = Math.max(...history.flatMap((r) => r.times));
  const items = history.map((r, i) => `
    <div class="history-item">
      <div class="info">
        <div class="top">
          <span>${new Date(r.date).toLocaleDateString(t.locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <b>${t.best(clock(Math.max(...r.times)))}</b>
        </div>
        <div class="times">${r.times.map(clock).join(' · ')}</div>
      </div>
      <button type="button" class="delete" data-delete="${i}" aria-label="${t.deleteSession}">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>`).join('');
  progress.innerHTML = `
    <div class="row"><span>${t.bestHold}</span><b>${clock(best)}</b></div>
    <div class="row"><span>${t.sessions}</span><b>${history.length}</b></div>
    <details class="row" style="display:block">
      <summary class="row" style="border:0">${t.history}</summary>
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

document.querySelectorAll('[data-lang]').forEach((btn) => btn.addEventListener('click', () => {
  settings.lang = btn.dataset.lang;
  saveSettings();
}));

$('#voice').addEventListener('change', (e) => {
  settings.voice = e.target.checked;
  saveSettings();
});

$('#sounds').addEventListener('change', (e) => {
  settings.sounds = e.target.checked;
  saveSettings();
});

$('#progress').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete]');
  if (!btn) return;
  if (!confirm(T().confirmDelete)) return;
  history.splice(Number(btn.dataset.delete), 1);
  store.set('history', history);
  renderHome();
});

// ---------- Voice ----------

const canSpeak = 'speechSynthesis' in window;

function unlockSpeech() {
  // iOS only allows speech that starts from a tap, so speak a silent utterance on Start.
  if (!canSpeak) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

// Browsers disagree on how to get a Swedish voice:
// - Safari and iPhone choose correctly from the language alone, and picking a voice
//   ourselves can select one that isn't downloaded (iOS then falls back to English).
// - Chrome-based browsers (Brave, Chrome, Edge) ignore the language and use the system
//   default voice (often American English) unless a voice is picked explicitly.
const isChromium = !!navigator.userAgentData;
let voices = [];
const loadVoices = () => { voices = speechSynthesis.getVoices(); };
if (canSpeak) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

function voiceFor(locale) {
  if (!isChromium) return null;
  if (!voices.length) loadVoices();
  const want = locale.toLowerCase();
  const norm = (v) => v.lang.replace('_', '-').toLowerCase();
  return voices.find((v) => norm(v) === want && v.localService)
    || voices.find((v) => norm(v) === want)
    || voices.find((v) => norm(v).startsWith(want.slice(0, 2)))
    || null;
}

function say(text) {
  if (!canSpeak || !session.cfg?.voice) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = STRINGS[session.cfg.lang].locale;
  const voice = voiceFor(u.lang);
  if (voice) u.voice = voice;
  debug.set('voice', voice ? `${voice.name} (${voice.lang})` : `auto for ${u.lang}`);
  u.rate = 0.9;
  u.onend = () => audio.wake(); // the voice may have paused the breathing sounds
  speechSynthesis.speak(u);
}

// ---------- Breathing sounds ----------
// Soft filtered noise shaped like breath: a rising, brighter "in" and a falling, warmer "out".
// Each sound is scheduled on the audio clock at the exact moment the circle starts that movement.

const audio = {
  ctx: null,
  bus: null,
  noise: null,
  sources: new Set(),

  // Must run inside a tap (iOS requirement).
  unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    // 'ambient' lets the breath sounds mix with the spoken voice. ('playback' is exclusive on
    // iOS: the voice and the breath sounds cut each other off.) Ambient sound follows the
    // silent switch.
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* older iOS */ }
    debug.set('audioSession', navigator.audioSession ? navigator.audioSession.type : 'not available');
    if (!this.ctx) {
      this.ctx = new Ctx();
      const len = this.ctx.sampleRate * 3;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      // Pink-ish noise sounds closer to breath than white noise.
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
      this.noise = buf;
      // On iPhones the spoken voice can pause ("interrupt") this sound engine. Restart it.
      this.ctx.onstatechange = () => {
        if (session.active && this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
          setTimeout(() => this.wake(), 150);
        }
      };
    }
    this.ctx.resume();
  },

  wake() {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      this.ctx.resume().catch(() => {});
    }
  },

  // kind: 'in' or 'out'. atPerf: start time on the same clock as the animation (seconds).
  breath(kind, atPerf, dur) {
    if (!this.ctx || !this.noise || !session.cfg?.sounds || dur <= 0.05) return false;
    debug.set('engine', this.ctx.state);
    if (this.ctx.state !== 'running') {
      // Its clock is stopped while paused, so a sound queued now would play out of sync.
      this.wake();
      debug.count('skipped (engine paused)');
      return false;
    }
    try {
      this.play(kind, atPerf, dur);
      debug.count('breath sounds queued');
      return true;
    } catch (err) {
      debug.error(err);
      return false;
    }
  },

  play(kind, atPerf, dur) {
    const ctx = this.ctx;
    if (!this.bus) {
      // Limiter so the louder breath sounds can never distort.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      limiter.connect(ctx.destination);
      this.bus = ctx.createGain();
      this.bus.connect(limiter);
    }
    // Never schedule exactly "now": Safari rejects automation that starts in the past.
    const start = ctx.currentTime + Math.max(0.02, atPerf - now());
    const inhale = kind === 'in';

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.8;
    band.frequency.setValueAtTime(inhale ? 650 : 1150, start);
    band.frequency.linearRampToValueAtTime(inhale ? 1500 : 450, start + dur);

    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = inhale ? 4200 : 3000;

    // Volume follows the breath: inhale swells and fades evenly; exhale releases quickly, then trails off.
    const n = 64;
    const curve = new Float32Array(n);
    const peak = inhale ? 1.6 : 1.3; // about -13 dB at the loudest point of each breath
    for (let k = 0; k < n; k++) {
      const x = k / (n - 1);
      curve[k] = peak * Math.pow(Math.sin(Math.PI * (inhale ? x : Math.pow(x, 0.55))), 1.4);
    }
    const gain = ctx.createGain();
    gain.gain.setValueCurveAtTime(curve, start, dur); // the curve starts at 0, so no click

    src.connect(band).connect(soften).connect(gain).connect(this.bus);
    src.start(start, Math.random() * 2);
    src.stop(start + dur + 0.05);
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  },

  // One full breath on the circle: inhale on the first half, exhale on the second.
  cycle(atPerf, secs) {
    const queued = this.breath('in', atPerf, secs / 2);
    this.breath('out', atPerf + secs / 2, secs / 2);
    return queued;
  },

  stopAll() {
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } }
    this.sources.clear();
    this.bus?.disconnect();
    this.bus = null;
  },
};

// ---------- Vibration and screen lock ----------

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
  if (!session.active) return;
  if (document.visibilityState === 'hidden') {
    // Drop queued sounds; they'd be out of sync after the audio clock pauses.
    audio.stopAll();
  } else {
    requestWakeLock();
    audio.ctx?.resume();
    if (session.phase === 'breathing') session.scheduledThrough = session.lastBreath; // reschedule from now
  }
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
  scheduledThrough: -1,
  raf: 0,
  scale: 0.5,
  shown: { big: null, text: null },
};

const now = () => performance.now() / 1000;
const elapsed = () => now() - session.phaseStart;

function startSession() {
  unlockSpeech();
  audio.unlock();
  session.cfg = { ...settings, secs: PACES[settings.pace] };
  Object.assign(session, { active: true, round: 1, times: [], scale: 0.5, shown: { big: null, text: null } });
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
  audio.stopAll();
  releaseWakeLock();
  sessionEl.hidden = true;
  renderHome();
}

function enter(phase) {
  const t = T();
  session.phase = phase;
  session.phaseStart = now();
  sessionEl.dataset.phase = phase;
  $('#roundLabel').textContent = phase === 'finished' ? t.complete : t.roundOf(session.round, session.cfg.rounds);

  switch (phase) {
    case 'getReady':
      session.lastBreath = -1;
      session.scheduledThrough = -1;
      say(session.round === 1 ? t.say.firstRound : t.say.round(session.round));
      buzz(60);
      break;
    case 'retention':
      say(t.say.hold);
      buzz(120);
      break;
    case 'recovery':
      audio.breath('in', session.phaseStart, RECOVERY_INHALE);
      say(t.say.recovery);
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

// Keep sounds queued one breath ahead of the animation so they start exactly on time.
function scheduleBreathSounds(current) {
  const c = session.cfg;
  const upTo = Math.min(current + 1, c.breaths - 1);
  for (let j = Math.max(current, session.scheduledThrough + 1); j <= upTo; j++) {
    if (!audio.cycle(session.phaseStart + j * c.secs, c.secs)) break; // try again next breath
    session.scheduledThrough = j;
  }
}

function tick() {
  const t = elapsed();
  const c = session.cfg;
  const s = T().say;
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
        scheduleBreathSounds(i);
        if (i === c.breaths - 1) say(s.lastBreath);
        else if (i === 0) say(s.firstBreath);
        buzz(15);
      }
      break;
    }
    case 'recovery':
      if (t >= c.recovery) {
        audio.breath('out', now(), LET_GO_EXHALE);
        say(s.letGo);
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
  const s = T();
  let target = 0.5;
  let big = '';
  let text = '';

  switch (session.phase) {
    case 'getReady':
      big = Math.max(1, Math.ceil(GET_READY - t));
      text = s.getReady;
      break;
    case 'breathing': {
      const f = (t / c.secs) % 1;
      target = 0.5 + (0.5 * (1 - Math.cos(2 * Math.PI * f))) / 2;
      big = Math.min(c.breaths, Math.floor(t / c.secs) + 1);
      text = f < 0.5 ? s.inhale : s.exhale;
      break;
    }
    case 'retention':
      target = 0.45 + 0.02 * Math.sin((t * 2 * Math.PI) / 5);
      big = clock(t);
      text = s.hold;
      break;
    case 'recovery':
      target = 1;
      big = Math.max(1, Math.ceil(c.recovery - t));
      text = s.recoveryHold;
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
  const t = T();
  cancelAnimationFrame(session.raf);
  releaseWakeLock();
  say(t.say.finished);
  buzz([80, 60, 80]);
  if (session.times.length) {
    history.unshift({ date: new Date().toISOString(), times: session.times.map((x) => Math.round(x * 10) / 10) });
    store.set('history', history);
  }
  $('#summaryList').innerHTML = session.times
    .map((x, i) => `<div class="row"><span>${t.round(i + 1)}</span><span>${clock(x)}</span></div>`)
    .join('');
  $('#stage').hidden = true;
  $('#summary').hidden = false;
}

$('#start').addEventListener('click', startSession);
$('#close').addEventListener('click', (e) => { e.stopPropagation(); closeSession(); });
$('#done').addEventListener('click', (e) => { e.stopPropagation(); closeSession(); });
$('#breatheIn').addEventListener('click', (e) => { e.stopPropagation(); endRetention(); });
sessionEl.addEventListener('click', () => {
  audio.wake(); // any tap can wake the sound up
  endRetention();
});

renderHome();
debug.init();

// ---------- Offline support ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
