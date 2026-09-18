/* Car Thing Now Playing UI.
 * Runs in the device's Chromium 69 — plain ES2017 only (no ?. / ?? / class fields).
 *
 * The page never talks to the network. The Mac bridge drives it over Chrome DevTools Protocol:
 *   Mac → page: window.__carthingReceive(msg)
 *   page → Mac: window.__carthingSend(json)  (a CDP binding; console.debug is the fallback)
 */
(function () {
  'use strict';

  function send(msg) {
    var json = JSON.stringify(msg);
    if (typeof window.__carthingSend === 'function') window.__carthingSend(json);
    else console.debug('⁣carthing ' + json);
  }

  function $(id) { return document.getElementById(id); }
  var app = $('app');
  var el = {
    meta: $('meta'), artist: $('artist'), title: $('title'), album: $('album'),
    elapsed: $('elapsed'), duration: $('duration'), progressFill: $('progressFill'),
    volumeFill: $('volumeFill'), volumeText: $('volumeText'), volumeNote: $('volumeNote'), volIcon: $('volIcon'),
    artA: $('artA'), artB: $('artB'), badge: $('badge'), flash: $('flash'), flashIcon: $('flashIcon'),
    clockTime: $('clockTime'), clockDate: $('clockDate')
  };

  var config = { buttons: { 1: 'previous', 2: 'next', Enter: 'playpause' }, volumeStep: 0.02, knobDirection: 1, debug: false };
  var gotConfig = false;
  var connected = false;
  var lastMsgAt = 0;
  var clock = { offset: 0, tzMinutes: 0 }; // the device clock is never set; use the Mac's

  var np = { active: false };
  var npAt = 0; // performance.now() at which np.elapsed was current

  function setClass(name, on) { app.classList.toggle(name, !!on); }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
  }

  // ---- Messages from the Mac ------------------------------------------------

  window.__carthingReceive = function (msg) {
    lastMsgAt = performance.now();
    if (msg.type === 'bye') return setConnected(false);
    setConnected(true);
    switch (msg.type) {
      case 'config': config = msg.config; gotConfig = true; break;
      case 'tick': clock.offset = msg.now - Date.now(); clock.tzMinutes = msg.tzMinutes || 0; renderClock(); break;
      case 'artwork': onArtwork(msg); break;
      case 'nowPlaying': setNowPlaying(msg.np); break;
      case 'volume': setVolume(msg.volume); break;
    }
  };

  function setConnected(on) {
    connected = on;
    setClass('offline', !on);
  }

  // ---- Now playing ----------------------------------------------------------

  function setNowPlaying(next) {
    var textBefore = el.artist.textContent + '\n' + el.title.textContent + '\n' + el.album.textContent;
    np = next;
    npAt = performance.now();
    setClass('idle', !np.active);

    if (!np.active) {
      setText(el.artist, '');
      setText(el.title, 'Nothing playing');
      setText(el.album, '');
      setClass('paused', false);
      setClass('has-badge', false);
      renderClock();
    } else {
      var album = np.album || '';
      var isSource = false;
      if (!album && np.kind !== 'music' && np.source && np.source.name) {
        album = np.source.name; // e.g. a YouTube video: show which app it's playing in
        isSource = true;
      }
      setText(el.artist, np.artist || '');
      setText(el.title, np.title || '');
      setText(el.album, album);
      el.album.classList.toggle('is-source', isSource);
      setClass('paused', !np.playing);
      setClass('no-duration', !np.duration);
      setText(el.duration, np.duration ? fmt(np.duration) : '');

      var icon = np.source && np.source.icon;
      if (icon && el.badge.getAttribute('src') !== icon) el.badge.setAttribute('src', icon);
      setClass('has-badge', !!icon);

      if (np.artworkKey !== shownArtKey && (!np.artworkKey || artworks[np.artworkKey])) showArt(np.artworkKey);
    }

    if (el.artist.textContent + '\n' + el.title.textContent + '\n' + el.album.textContent !== textBefore) fitTitle();
    renderProgress();
  }

  function currentElapsed() {
    if (!np.active || np.elapsed == null) return null;
    var e = np.elapsed + ((performance.now() - npAt) / 1000) * (np.rate || 0);
    if (np.duration) e = Math.min(e, np.duration);
    return Math.max(0, e);
  }

  function renderProgress() {
    var e = currentElapsed();
    setText(el.elapsed, e == null ? '' : fmt(e));
    var frac = e != null && np.duration ? e / np.duration : 0;
    el.progressFill.style.transform = 'scaleX(' + frac.toFixed(4) + ')';
  }

  // Largest title size that fits the panel (and stays ≤ 5 lines); clamp as a last resort.
  var TITLE_SIZES = [34, 31, 28, 25, 22];
  function fitTitle() {
    var t = el.title;
    t.style.webkitLineClamp = '';
    for (var i = 0; i < TITLE_SIZES.length; i++) {
      var lh = Math.round(TITLE_SIZES[i] * 1.15);
      t.style.fontSize = TITLE_SIZES[i] + 'px';
      t.style.lineHeight = lh + 'px';
      var fits = el.meta.scrollHeight <= el.meta.clientHeight;
      if (fits && t.offsetHeight / lh <= 5.01) return;
    }
    var overflow = el.meta.scrollHeight - el.meta.clientHeight;
    if (overflow > 0) t.style.webkitLineClamp = String(Math.max(1, Math.floor((t.offsetHeight - overflow) / lh)));
  }

  // ---- Artwork (two layers so track changes crossfade) ---------------------

  var artworks = {}; // only the most recent is kept
  var shownArtKey;
  var front = el.artA;

  function onArtwork(msg) {
    artworks = {};
    artworks[msg.key] = msg;
    if (np.active && np.artworkKey === msg.key && shownArtKey !== msg.key) showArt(msg.key);
  }

  function paint(layer, art) {
    var url = art ? 'url("' + art.dataUrl + '")' : 'none';
    layer.children[0].style.backgroundImage = url;
    layer.children[1].style.backgroundImage = url;
    layer.classList.toggle('square', !!art && art.width > 0 && Math.abs(art.width / art.height - 1) < 0.04);
  }

  function showArt(key) {
    shownArtKey = key;
    var back = front === el.artA ? el.artB : el.artA;
    var old = front;
    paint(back, key ? artworks[key] : null);
    back.classList.add('front');
    old.classList.remove('front');
    front = back;
    setTimeout(function () { if (old !== front) paint(old, null); }, 600); // free the old image
  }

  // ---- Volume -----------------------------------------------------------------

  var vol = null;           // {volume, muted, supported, device} from the Mac
  var localVol = null;      // optimistic value while the knob is turning
  var localUntil = 0;
  var pendingDelta = 0;
  var flushTimer = null;
  var settleTimer = null;
  var hideTimer = null;

  function setVolume(v) {
    var prev = vol;
    vol = v;
    if (performance.now() < localUntil) return; // knob in motion: don't fight the optimistic value
    renderVolume();
    if (prev && (prev.volume !== v.volume || prev.muted !== v.muted || prev.device !== v.device)) showVolume();
  }

  function renderVolume(optimistic) {
    if (!vol) return;
    setClass('volume-unsupported', !vol.supported);
    setText(el.volumeNote, vol.supported ? '' : 'No volume control on ' + vol.device);
    var muted = optimistic == null && vol.muted;
    var v = optimistic != null ? optimistic : vol.volume || 0;
    if (muted) v = 0;
    el.volumeFill.style.transform = 'scaleX(' + v.toFixed(3) + ')';
    setText(el.volumeText, String(Math.round(v * 100)));
    el.volIcon.setAttribute('href', v === 0 ? '#i-muted' : '#i-speaker');
  }

  function showVolume() {
    setClass('show-volume', true);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { setClass('show-volume', false); }, 1600);
  }

  function onKnob(steps) {
    if (!vol) return;
    if (!vol.supported) return showVolume();
    var now = performance.now();
    if (now > localUntil) localVol = vol.volume || 0;
    var next = Math.min(1, Math.max(0, localVol + steps * config.volumeStep));
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
    if (Math.abs(pendingDelta) > 1e-6) send({ type: 'volume', delta: pendingDelta });
    pendingDelta = 0;
  }

  // ---- Buttons and knob ---------------------------------------------------------

  var CODE_ALIASES = { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', NumpadEnter: 'Enter', KeyM: 'm' };
  function keyName(e) {
    if (/^[1-4]$/.test(e.key) || e.key === 'Enter' || e.key === 'Escape') return e.key;
    if (e.key === 'm' || e.key === 'M') return 'm';
    return CODE_ALIASES[e.code] || null;
  }

  function debugInput(text) {
    if (config.debug) send({ type: 'log', message: text });
  }

  window.addEventListener('keydown', function (e) {
    var key = keyName(e);
    debugInput('keydown key=' + e.key + ' code=' + e.code + ' → ' + key);
    if (!key) return;
    e.preventDefault();
    if (!e.repeat) doAction(config.buttons[key]);
  }, true);

  window.addEventListener('wheel', function (e) {
    e.preventDefault();
    var d = e.deltaX || e.deltaY;
    debugInput('wheel dx=' + e.deltaX + ' dy=' + e.deltaY);
    if (d) onKnob((d > 0 ? 1 : -1) * (config.knobDirection || 1));
  }, { passive: false, capture: true });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function doAction(action) {
    if (!action) return;
    if (action === 'playpause' && np.active) {
      // Optimistic: flip immediately; the Mac confirms within a few hundred ms.
      var e = currentElapsed();
      np.playing = !np.playing;
      np.rate = np.playing ? 1 : 0;
      np.elapsed = e;
      npAt = performance.now();
      setClass('paused', !np.playing);
    } else if (action === 'next' || action === 'previous') {
      flash(action);
    }
    send({ type: 'command', action: action });
  }

  function flash(icon) {
    el.flashIcon.setAttribute('href', '#i-' + icon);
    el.flash.classList.remove('on');
    void el.flash.offsetWidth; // restart the animation
    el.flash.classList.add('on');
  }

  // ---- Idle clock ---------------------------------------------------------------

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function renderClock() {
    if (!app.classList.contains('idle')) return;
    // Mac wall-clock time, read through UTC getters so the device's own timezone doesn't matter.
    var d = new Date(Date.now() + clock.offset + clock.tzMinutes * 60000);
    var h = d.getUTCHours() % 12 || 12;
    var m = d.getUTCMinutes();
    setText(el.clockTime, h + ':' + (m < 10 ? '0' : '') + m);
    setText(el.clockDate, DAYS[d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate());
  }

  // ---- Timers -------------------------------------------------------------------

  setInterval(renderProgress, 250);
  setInterval(function () {
    if (connected && performance.now() - lastMsgAt > 6500) setConnected(false);
    if (!connected || !gotConfig) send({ type: 'hello' }); // ask the bridge for full state
    renderClock();
  }, 1000);

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
  send({ type: 'hello' });
})();
