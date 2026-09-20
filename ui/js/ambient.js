/* Album art background (Settings → Album art background): the current artwork, blurred and
 * tinted, fills the screen behind Now Playing and the widgets. Chromium 69 has no
 * backdrop-filter, so one blurred copy of the art sits behind the screens instead. */
(function () {
  'use strict';

  var img = CT.$('ambientImg');
  var url = null;

  function apply() {
    var on = !!(CT.settings.artBackground && url);
    img.style.backgroundImage = on ? 'url("' + url + '")' : 'none';
    CT.app.classList.toggle('ambient-on', on);
  }

  CT.on('art', function (u) { url = u; apply(); });
  CT.on('settings', apply);
})();
