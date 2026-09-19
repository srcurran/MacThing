/* Shared runtime for every screen: the channel to the Mac, the Mac's clock, screen switching,
 * hardware input and the volume readout. Screens register with CT.screen(name) and listen for
 * bridge messages with CT.on(type, fn).
 *
 * Runs in the device's Chromium 69 — plain ES2017 only (no ?. / ?? / class fields / modules).
 * The page never talks to the network; the Mac bridge drives it over Chrome DevTools Protocol:
 *   Mac → page: window.__carthingReceive(msg)
 *   page → Mac: window.__carthingSend(json)  (a CDP binding; console.debug is the fallback)
 */
(function () {
  'use strict';

  var CT = (window.CT = {});
  var app = document.getElementById('app');
  CT.app = app;
  CT.$ = function (id) { return document.getElementById(id); };
  CT.setText = function (node, text) { if (node.textContent !== text) node.textContent = text; };
  CT.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // Replaced by the bridge's config/settings on connect; these just let the page render before that.
  CT.config = {
    buttons: { 1: 'screen:nowplaying', 2: 'screen:weather', 3: 'screen:clock', 4: 'screen:calendar', m: 'settings', Escape: 'favorite' },
    knobClicks: { 1: 'playpause', 2: 'next', 3: 'previous' },
    buttonHolds: { m: 'sleep' }, holdMs: 1200, offlineSleepMs: 90000,
    multiClickMs: 350, volumeStep: 1 / 64, knobDirection: 1, debug: false
  };
  CT.settings = { theme: 'dark', units: 'F', clock24h: false, clockFace: 'analog', location: { mode: 'auto' } };

  var listeners = {};
  CT.on = function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); };
  function emit(type, arg) {
    var fns = listeners[type] || [];
    for (var i = 0; i < fns.length; i++) fns[i](arg);
  }

  // ---- Channel to the Mac ------------------------------------------------------------

  CT.send = function (msg) {
    var json = JSON.stringify(msg);
    if (typeof window.__carthingSend === 'function') window.__carthingSend(json);
    else console.debug('⁣carthing ' + json);
  };

  var connected = false;
  var gotConfig = false;
  var lastMsgAt = 0;

  window.__carthingReceive = function (msg) {
    lastMsgAt = performance.now();
    if (msg.type === 'bye') return setConnected(false);
    setConnected(true);
    if (msg.type === 'config') { CT.config = msg.config; gotConfig = true; }
    else if (msg.type === 'tick') { clock.offset = msg.now - Date.now(); clock.tz = msg.tzMinutes || 0; }
    else if (msg.type === 'settings') CT.settings = msg.settings;
    else if (msg.type === 'appearance') macDark = msg.dark;
    if (msg.type === 'settings' || msg.type === 'appearance') applyTheme();
    emit(msg.type, msg);
  };

  // Appearance: dark | light | auto (follow the Mac's Dark Mode).
  var macDark = true;
  function applyTheme() {
    var theme = CT.settings.theme || 'dark';
    app.classList.toggle('light', theme === 'light' || (theme === 'auto' && !macDark));
  }
  CT.applyTheme = applyTheme;

  var offlineSince = 0; // when the Mac was last seen; 0 means "not since this page loaded"
  function setConnected(on) {
    if (on !== connected) offlineSince = on ? 0 : performance.now();
    connected = on;
    app.classList.toggle('offline', !on);
  }

  // ---- Time (the device clock is never set, so everything uses the Mac's) -------------

  var clock = { offset: 0, tz: 0 };
  CT.now = function () { return Date.now() + clock.offset; };
  CT.DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  CT.MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /** Calendar fields of epoch ms in a timezone (minutes east of UTC; defaults to the Mac's). */
  CT.parts = function (ms, tzMinutes) {
    var d = new Date(ms + (tzMinutes == null ? clock.tz : tzMinutes) * 60000);
    return {
      year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), day: d.getUTCDay(),
      hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds()
    };
  };
  /** Days since the epoch in a timezone — for "is this today / tomorrow". */
  CT.dayNumber = function (ms, tzMinutes) {
    return Math.floor((ms + (tzMinutes == null ? clock.tz : tzMinutes) * 60000) / 86400000);
  };
  /** {time: '4:07', ampm: 'PM'} or {time: '16:07', ampm: ''}, following the 12/24-hour setting. */
  CT.clockText = function (p) {
    var mm = (p.minutes < 10 ? '0' : '') + p.minutes;
    if (CT.settings.clock24h) return { time: (p.hours < 10 ? '0' : '') + p.hours + ':' + mm, ampm: '' };
    return { time: (p.hours % 12 || 12) + ':' + mm, ampm: p.hours < 12 ? 'AM' : 'PM' };
  };
  CT.timeText = function (ms, tzMinutes) {
    var c = CT.clockText(CT.parts(ms, tzMinutes));
    return c.ampm ? c.time + ' ' + c.ampm : c.time;
  };
  CT.hourText = function (ms, tzMinutes) {
    var h = CT.parts(ms, tzMinutes).hours;
    if (CT.settings.clock24h) return (h < 10 ? '0' : '') + h;
    return (h % 12 || 12) + (h < 12 ? 'AM' : 'PM');
  };

  // A shared once-a-second tick, aligned to the Mac's second boundary.
  var secondFns = [];
  CT.onSecond = function (fn) { secondFns.push(fn); };
  (function secondLoop() {
    var now = CT.now();
    // Nothing is visible while the backlight is off — don't spend the device's CPU redrawing it.
    if (!CT.asleep) for (var i = 0; i < secondFns.length; i++) secondFns[i](now);
    setTimeout(secondLoop, 1005 - (now % 1000));
  })();

  // ---- Screens -------------------------------------------------------------------------

  CT.screens = {};
  CT.current = 'nowplaying';
  var beforeSettings = 'nowplaying';
  var LABELS = { nowplaying: 'Now Playing', weather: 'Weather', clock: 'Clock', calendar: 'Calendar' };

  /** Registers a screen. Optional hooks: show(), hide(), turn(steps), press(). */
  CT.screen = function (name) {
    var def = { name: name, el: CT.$('screen-' + name) };
    CT.screens[name] = def;
    return def;
  };

  CT.show = function (name) {
    var next = CT.screens[name];
    if (!next) return;
    if (name !== CT.current) {
      var prev = CT.screens[CT.current];
      if (name === 'settings') beforeSettings = CT.current;
      prev.el.classList.remove('active');
      if (prev.hide) prev.hide();
      CT.current = name;
      app.setAttribute('data-screen', name);
      next.el.classList.add('active');
      if (next.show) next.show();
    }
    if (name !== 'settings') showHints(name);
  };
  CT.closeSettings = function () { CT.show(beforeSettings); };

  var hintTimer = null;
  function showHints(active) {
    var spans = CT.$('hints').children;
    for (var i = 0; i < spans.length; i++) {
      var action = CT.config.buttons[i + 1] || '';
      var target = action.indexOf('screen:') === 0 ? action.slice(7) : '';
      spans[i].innerHTML = LABELS[target] ? '<b>' + LABELS[target] + '</b>' : '';
      spans[i].className = target === active ? 'on' : '';
    }
    app.classList.add('show-hints');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { app.classList.remove('show-hints'); }, 1400);
  }

  // ---- Commands and feedback ------------------------------------------------------------

  /** Media command for the Mac (playpause | next | previous …). Screens can react via CT.on('command'). */
  CT.command = function (action) {
    if (!action) return;
    emit('command', action);
    CT.send({ type: 'command', action: action });
  };

  CT.flash = function (icon, color) {
    var f = CT.$('flash');
    CT.$('flashIcon').setAttribute('href', '#i-' + icon);
    f.style.color = color || '';
    f.classList.remove('on');
    void f.offsetWidth; // restart the animation
    f.classList.add('on');
  };

  var toastTimer = null;
  CT.toast = function (text) {
    var t = CT.$('toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1800);
  };
  CT.on('toast', function (msg) { CT.toast(msg.text); });

  // ---- Screen sleep ----------------------------------------------------------------------
  // The Mac turns the backlight off when its display sleeps, and when the sleep button is held.
  // When the Mac stops talking to us altogether the device does it for itself (device/sleepd.sh)
  // and we go black here to match. While dark, the first button or knob input only wakes us.

  CT.asleep = false;
  function setAsleep(on) {
    CT.asleep = on;
    app.classList.toggle('asleep', on);
  }
  CT.on('screen', function (msg) { setAsleep(!msg.on); });

  /** Holding the sleep button: the Mac turns the backlight off until the next input. */
  function sleepNow() {
    setAsleep(true); // black straight away, even if the Mac isn't there to answer
    CT.send({ type: 'sleep' });
  }

  function wakeInstead() {
    if (!CT.asleep) return false;
    CT.send({ type: 'wake' });
    offlineSince = performance.now();
    if (!connected) setAsleep(false); // no Mac to turn the backlight back on for us
    return true;
  }

  // ---- Hardware input -------------------------------------------------------------------
  // Top buttons 1–4 and the settings button arrive as keys; the knob press is Enter, the back
  // button under it is Escape, and turning the knob is a horizontal wheel event per click.

  var CODE_ALIASES = { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', NumpadEnter: 'Enter', KeyM: 'm' };
  function keyName(e) {
    if (/^[1-4]$/.test(e.key) || e.key === 'Enter' || e.key === 'Escape') return e.key;
    if (e.key === 'm' || e.key === 'M') return 'm';
    return CODE_ALIASES[e.code] || null;
  }

  function debugInput(text) {
    if (CT.config.debug) CT.send({ type: 'log', message: text });
  }

  function runButton(action) {
    if (!action) return;
    if (action.indexOf('screen:') === 0) return CT.show(action.slice(7));
    if (action === 'settings') return CT.current === 'settings' ? CT.closeSettings() : CT.show('settings');
    CT.command(action);
  }

  // Knob press: count quick presses (1 = play/pause, 2 = next, 3 = previous by default).
  var clicks = 0;
  var clickTimer = null;
  function knobPress() {
    var screen = CT.screens[CT.current];
    if (screen.press) return screen.press();
    clicks++;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(function () {
      var n = Math.min(clicks, 3);
      clicks = 0;
      CT.command(CT.config.knobClicks[n]);
    }, CT.config.multiClickMs || 350);
  }

  function runKey(key) {
    if (key === 'Enter') return knobPress();
    if (key === 'Escape' && CT.current === 'settings') return CT.closeSettings();
    runButton(CT.config.buttons[key]);
  }

  // Buttons in config.buttonHolds do a second thing when held (by default: the settings button
  // puts the screen to sleep). Those act on release, so a hold isn't also a short press —
  // every other button still acts the moment it goes down.
  var holds = {}; // key → {start, done}
  var releasesWork = true; // until a key goes down twice with no keyup in between
  function holdAction(key) { return releasesWork && (CT.config.buttonHolds || {})[key]; }
  function holdMs() { return CT.config.holdMs || 1200; }

  function fireHold(key, press) {
    if (press.done) return;
    press.done = true;
    clearTimeout(press.timer);
    var action = holdAction(key);
    debugInput('hold ' + key + ' → ' + action);
    if (action === 'sleep') return sleepNow();
    runButton(action);
  }

  window.addEventListener('keydown', function (e) {
    var key = keyName(e);
    debugInput('keydown key=' + e.key + ' code=' + e.code + ' → ' + key + (e.repeat ? ' (repeat)' : ''));
    if (!key) return;
    e.preventDefault();

    var press = holds[key];
    if (e.repeat) {
      // Auto-repeat is the backstop for the timer on a device that fires it while a key is held.
      if (press && !press.done && holdAction(key) && performance.now() - press.start >= holdMs()) fireHold(key, press);
      return;
    }
    if (press) { // no keyup arrived for the last press: this firmware only sends keydown
      releasesWork = false;
      clearTimeout(press.timer);
      debugInput('no keyup seen — holds disabled');
    }
    if (wakeInstead()) {
      holds[key] = { start: performance.now(), done: true }; // the wake was the whole press
      return;
    }
    press = holds[key] = { start: performance.now(), done: false, timer: null };
    if (!holdAction(key)) {
      press.done = true; // nothing to hold for: act now, as every button always has
      return runKey(key);
    }
    press.timer = setTimeout(function () { fireHold(key, press); }, holdMs());
  }, true);

  window.addEventListener('keyup', function (e) {
    var key = keyName(e);
    if (!key) return;
    e.preventDefault();
    var press = holds[key];
    delete holds[key];
    if (!press) return;
    clearTimeout(press.timer);
    if (!press.done) runKey(key); // short press: the action happens on release
  }, true);

  window.addEventListener('wheel', function (e) {
    e.preventDefault();
    var d = e.deltaX || e.deltaY;
    debugInput('wheel dx=' + e.deltaX + ' dy=' + e.deltaY);
    if (!d || wakeInstead()) return;
    var steps = (d > 0 ? 1 : -1) * (CT.config.knobDirection || 1);
    var screen = CT.screens[CT.current];
    if (screen.turn) screen.turn(steps);
    else onKnobVolume(steps);
  }, { passive: false, capture: true });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---- Volume (knob turns anywhere but settings) --------------------------------------

  var vol = null;          // {volume, muted, supported, device} from the Mac
  var localVol = null;     // optimistic value while the knob is turning
  var localUntil = 0;
  var pendingDelta = 0;
  var flushTimer = null;
  var settleTimer = null;
  var hideTimer = null;

  CT.on('volume', function (msg) {
    var prev = vol;
    vol = msg.volume;
    if (performance.now() < localUntil) return; // knob in motion: don't fight the optimistic value
    renderVolume();
    if (prev && (prev.volume !== vol.volume || prev.muted !== vol.muted || prev.device !== vol.device)) showVolume();
  });

  function renderVolume(optimistic) {
    if (!vol) return;
    app.classList.toggle('volume-unsupported', !vol.supported);
    CT.setText(CT.$('volumeNote'), vol.supported ? '' : 'No volume control on ' + vol.device);
    var v = optimistic != null ? optimistic : vol.muted ? 0 : vol.volume || 0;
    CT.$('volumeFill').style.transform = 'scaleX(' + v.toFixed(3) + ')';
    CT.setText(CT.$('volumeText'), String(Math.round(v * 100)));
    CT.$('volIcon').setAttribute('href', v === 0 ? '#i-muted' : '#i-speaker');
  }

  function showVolume() {
    app.classList.add('show-volume');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { app.classList.remove('show-volume'); }, 1600);
  }

  function onKnobVolume(steps) {
    if (!vol) return;
    if (!vol.supported) return showVolume();
    var now = performance.now();
    if (now > localUntil) localVol = vol.volume || 0;
    var next = Math.min(1, Math.max(0, localVol + steps * CT.config.volumeStep));
    pendingDelta += next - localVol;
    localVol = next;
    localUntil = now + 500;
    renderVolume(localVol);
    showVolume();
    if (!flushTimer) flushTimer = setTimeout(flushVolume, 40);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { renderVolume(); }, 550);
  }

  function flushVolume() {
    flushTimer = null;
    if (Math.abs(pendingDelta) > 1e-6) CT.send({ type: 'volume', delta: pendingDelta });
    pendingDelta = 0;
  }

  // ---- Start ----------------------------------------------------------------------------

  setInterval(function () {
    if (connected && performance.now() - lastMsgAt > 6500) setConnected(false);
    if (!connected || !gotConfig) CT.send({ type: 'hello' }); // ask the bridge for full state
    // The Mac is gone, so nothing will send us a screen message: go dark on our own. The device's
    // own watchdog (device/sleepd.sh) kills the backlight at the same point; this just means the
    // panel shows black rather than "Waiting for your Mac" even without it installed.
    if (!connected && !CT.asleep && performance.now() - offlineSince > (CT.config.offlineSleepMs || 90000)) setAsleep(true);
  }, 1000);

  // Runs after every screen script has registered.
  document.addEventListener('DOMContentLoaded', function () {
    var screen = CT.screens[CT.current];
    if (screen.show) screen.show();
    CT.send({ type: 'hello' });
  });
})();
