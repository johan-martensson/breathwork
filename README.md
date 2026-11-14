# Breathwork

A guided breathing app that runs in the browser and can be installed on an iPhone home screen.

**Live app:** https://johan-martensson.github.io/breathwork/

> Practice sitting or lying down. Never do breathing exercises in or near water, while driving, or anywhere fainting could be dangerous.

## What it does

Each round has three parts:

1. **Breathing:** deep breaths following an animated circle that grows as you breathe in and shrinks as you let go. A counter shows the breath number.
2. **Breath hold:** after the last exhale, hold your breath while a stopwatch runs. Tap anywhere when you need to breathe.
3. **Recovery:** breathe in fully and hold for a set time.

After the last round you get a summary of your hold times. Your history and best hold are saved on the device only.

**Settings:** rounds (1–10), breaths per round (10–60), pace (slow, medium or fast), recovery hold (5–30 s), voice guidance, breathing sounds, and language (English or Svenska).

**Breathing sounds** are generated live in the browser (filtered noise, no audio files). They're timed to the same clock as the circle: an inhale sound while it grows, an exhale while it shrinks.

## Install on iPhone

1. Open the live app in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.

The app then opens full-screen from its icon, never expires, and works offline after the first visit.

## Browser support

| | Swedish voice | Breathing sounds |
|---|---|---|
| iPhone (Safari or home-screen app) | ✅ | ✅ |
| Safari on Mac | ✅ | ✅ |
| Chrome on Mac | ✅ | ✅ |
| Brave | ❌ uses an American voice | ✅ |

Notes:

- **iPhone silent switch:** breathing sounds follow the silent switch. Turn it off to hear them.
- **No vibration in the browser:** iPhones don't allow vibration from web apps.
- **Brave:** Brave ignores the voice the app picks and speaks Swedish text with its default English voice. Turning Shields down doesn't help. Use Safari or Chrome for Swedish.
- **Swedish voice quality:** for a better Swedish voice on iPhone, download one in Settings → Accessibility → Spoken Content → Voices → Svenska.

## Diagnostics

Add `?debug` to the address (https://johan-martensson.github.io/breathwork/?debug) to show a yellow panel with:

- the browser engine and available voices;
- the voice actually used;
- the sound engine state and how many breath sounds have been queued;
- any errors.

It also has a **Test sound** button (a beep followed by a hiss) and a **Copy** button for sharing the readout.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | Styling (dark theme, iPhone safe areas) |
| `app.js` | Settings, translations, session timing, voice, breathing sounds, history, diagnostics |
| `sw.js` | Offline support (network first, cached copy when offline) |
| `manifest.webmanifest` | Home-screen app name, icon and colours |
| `icons/` | App icons |

## Making changes

1. Edit the files.
2. Bump `APP_VERSION` in `app.js` and `CACHE` in `sw.js` to the same new number. The version shows at the bottom of the home screen, which makes it easy to check that a device has the update.
3. Commit and push to `main`. GitHub Pages republishes within a minute or two.

**Getting the update on devices:**

- **Browser:** do a full refresh (Safari ⌥⌘R, Chrome/Brave ⇧⌘R).
- **iPhone home-screen app:** close it and open it again.

**Testing tips:**

- Test timing and sounds in a real browser or the iOS Simulator. Headless Chrome's simulated clock doesn't advance the animation.
- iPhone audio quirks (voice choice, the silent switch, voice and sounds cutting each other off) only show up on a real device.

## Lessons learned about iPhone and browser audio

- **Choosing the voice:** on Safari/iOS, set only `utterance.lang`. Picking a voice from `getVoices()` can select one that isn't downloaded, and iOS then falls back to English. Chromium browsers are the opposite: they ignore `lang`, so the app picks a voice explicitly there.
- **Audio session:** `navigator.audioSession.type = 'playback'` is exclusive on iOS, so the spoken voice and the breathing sounds cut each other off. `'ambient'` lets them mix, but follows the silent switch.
- **Audio must start from a tap:** both speech and Web Audio have to start inside a tap, so the Start button unlocks both.
