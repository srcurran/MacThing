/* Screen 1 · Now Playing — whatever macOS reports in Control Center's Now Playing. */
(function () {
  'use strict';

  var $ = CT.$;
  var setText = CT.setText;
  var screen = CT.screen('nowplaying');
  var root = screen.el;
  var el = {
    meta: $('npMeta'), artist: $('npArtist'), title: $('npTitle'), album: $('npAlbum'),
    elapsed: $('npElapsed'), duration: $('npDuration'), progress: $('npProgress'),
    artA: $('npArtA'), artB: $('npArtB'), badge: $('npBadge'),
    clockTime: $('npClockTime'), clockDate: $('npClockDate')
  };

  var np = { active: false };
  var npAt = 0; // performance.now() at which np.elapsed was current

  function setState(name, on) { root.classList.toggle(name, !!on); }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
  }

  CT.on('nowPlaying', function (msg) { setNowPlaying(msg.np); });
  CT.on('artwork', onArtwork);
  CT.on('settings', renderIdleClock);
  CT.on('tick', renderIdleClock);

  function setNowPlaying(next) {
    var textBefore = el.artist.textContent + '\n' + el.title.textContent + '\n' + el.album.textContent;
    np = next;
    npAt = performance.now();
    setState('idle', !np.active);

    if (!np.active) {
      setText(el.artist, '');
      setText(el.title, 'Nothing playing');
      setText(el.album, '');
      setState('paused', false);
      setState('has-badge', false);
      renderIdleClock();
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
      setState('paused', !np.playing);
      setState('no-duration', !np.duration);
      setText(el.duration, np.duration ? fmt(np.duration) : '');

      var icon = np.source && np.source.icon;
      if (icon && el.badge.getAttribute('src') !== icon) el.badge.setAttribute('src', icon);
      setState('has-badge', !!icon);

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
    el.progress.style.transform = 'scaleX(' + frac.toFixed(4) + ')';
  }
  setInterval(function () { if (CT.current === 'nowplaying') renderProgress(); }, 250);

  // Largest title size that fits the panel (and stays ≤ 5 lines); clamp as a last resort.
  var TITLE_SIZES = [32, 29, 26, 23, 20];
  function fitTitle() {
    var t = el.title;
    var lh = 0;
    t.style.webkitLineClamp = '';
    for (var i = 0; i < TITLE_SIZES.length; i++) {
      lh = Math.round(TITLE_SIZES[i] * 1.21); // Inter's normal line height
      t.style.fontSize = TITLE_SIZES[i] + 'px';
      t.style.lineHeight = lh + 'px';
      var fits = el.meta.scrollHeight <= el.meta.clientHeight;
      if (fits && t.offsetHeight / lh <= 5.01) return;
    }
    var overflow = el.meta.scrollHeight - el.meta.clientHeight;
    if (overflow > 0) t.style.webkitLineClamp = String(Math.max(1, Math.floor((t.offsetHeight - overflow) / lh)));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);

  // Knob presses are handled in core; reflect them here right away (the Mac confirms shortly).
  CT.on('command', function (action) {
    if (action === 'playpause') {
      if (np.active) {
        var e = currentElapsed();
        np.playing = !np.playing;
        np.rate = np.playing ? 1 : 0;
        np.elapsed = e;
        npAt = performance.now();
        setState('paused', !np.playing);
      }
      // On this screen the paused state is its own feedback; elsewhere, flash an icon.
      if (CT.current !== 'nowplaying' || !np.active) CT.flash(!np.active || np.playing ? 'play' : 'pause');
    } else if (action === 'next' || action === 'previous') {
      CT.flash(action);
    }
  });

  // ---- Artwork (two layers so track changes crossfade) ----------------------------

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

  // ---- Nothing playing: clock in the art area ----------------------------------------

  function renderIdleClock() {
    if (np.active) return;
    var p = CT.parts(CT.now());
    var c = CT.clockText(p);
    setText(el.clockTime, c.time);
    setText(el.clockDate, CT.DAYS[p.day] + ', ' + CT.MONTHS[p.month] + ' ' + p.date);
  }
  CT.onSecond(function () { if (CT.current === 'nowplaying') renderIdleClock(); });

  screen.show = function () {
    fitTitle();
    renderProgress();
    renderIdleClock();
  };
})();
